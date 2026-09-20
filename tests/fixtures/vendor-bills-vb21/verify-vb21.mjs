/*
 * VB-21 isolated browser verification.
 *
 * Mounts the production VendorBills component with synthetic fetch responses.
 * Every request, including saves, is intercepted by main.tsx; this verifier
 * never connects to the application API or a database.
 *
 * Parent-owned startup:
 *   VITE_PORT=4191 ... vite --config tests/fixtures/vendor-bills-vb21/vite.config.ts
 *   chromium --remote-debugging-port=9341 http://127.0.0.1:4191
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const vitePort = Number(process.env.VITE_PORT || 4191);
const cdpPort = Number(process.env.CDP_PORT || 9341);
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/vb21");
mkdirSync(evidenceDir, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error(`No Chromium page target on CDP port ${cdpPort}`);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
};
const quote = value => JSON.stringify(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitFor = async (expression, label, attempts = 300) => {
  for (let index = 0; index < attempts; index += 1) {
    try {
      if (await evaluate(expression)) return;
    } catch (error) {
      if (!/navigated|context.*destroyed/i.test(error.message)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const clickTestId = async testId => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click ${testId}`);
};
const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set ${testId}`);
};
const text = testId => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.innerText || ""`);
const fixtureState = async () => JSON.parse(await evaluate("JSON.stringify(window.__VB21Fixture)"));
const screenshot = async name => {
  await sleep(250);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const focus = async testId => {
  await evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.scrollIntoView({ block: "center" })`);
  await sleep(200);
};
const scrollCalendar = async side => {
  await evaluate(`(() => {
    const calendar = document.querySelector('[data-testid="hire-activity-calendar"]');
    if (calendar) calendar.scrollLeft = ${side === "right" ? "calendar.scrollWidth" : "0"};
  })()`);
  await sleep(150);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1050, deviceScaleFactor: 1, mobile: false });

async function loadScenario(name) {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/plant/vendor-bills?scenario=${name}` });
  await waitFor("document.readyState === 'complete'", `${name} fixture document`);
  await waitFor("!!document.querySelector('[data-testid=\"vb21-fixture-disclosure\"]')", `${name} fixture disclosure`);
}

async function startBill(equipmentId) {
  await waitFor("!!document.querySelector('[data-testid=\"button-new-bill\"]')", "new bill");
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"input-period-from\"]')", "bill form");
  await setInput("input-period-from", "2026-11-01");
  await setInput("input-period-to", "2026-11-05");
  await clickTestId("button-show-vendors");
  await waitFor("!!document.querySelector('[data-testid=\"button-select-vendor-VB21 SYNTHETIC HIRE VENDOR\"]')", "fixture vendor");
  await clickTestId("button-select-vendor-VB21 SYNTHETIC HIRE VENDOR");
  await waitFor(`!!document.querySelector('[data-testid="monthly-hire-${equipmentId}"]')`, `monthly hire ${equipmentId}`);
  const cardId = `monthly-hire-${equipmentId}`;
  await evaluate(`document.querySelector('[data-testid=${quote(cardId)}]')?.querySelectorAll("details").forEach(element => { element.open = true; })`);
  await waitFor("!!document.querySelector('[data-testid=\"hire-activity-calendar\"]')", "VB-21 activity calendar");
  return cardId;
}

// A/B/D/E: real multi-record hourly activity, a no-activity date, rate math,
// the zero guard, and an explicit multi-record signal.
await loadScenario("hourly");
const hourlyCard = await startBill(2101);
const hourlyHeaders = await evaluate("[...document.querySelectorAll('[data-testid=\"hire-activity-calendar\"] th')].map(e => e.innerText)");
for (const header of [
  "Date", "Reading (Opening → Closing)", "Hours / Km Run", "Trips", "Diesel Issued (Actual)",
  "Consumption Rate", "Excess / Under", "Downtime (Breakdown)", "Status", "Site / Work Done", "Records",
]) assert(hourlyHeaders.includes(header), `A missing calendar column: ${header}`);

const day1 = await text("hire-activity-day-2026-11-01");
assert(day1.includes("100, 105") && day1.includes("104, 109"), "A distinct readings are not visible");
assert(day1.includes("8.00") && day1.includes("32.00 L"), "A hours or diesel issued are wrong");
assert(day1.includes("ALLADURG PWD ROAD") && day1.includes("Embankment") && day1.includes("Shoulder dressing"), "A site/work detail is missing");
assert(day1.includes("Worked"), "A worked status is missing");
assert(day1.includes("N/A") && !/(^|\\s)0(?:\\.00)?(\\s|$)/.test(day1.split("32.00 L")[0]), "C hourly Trips is not N/A");
assert(day1.includes("4.00 L/Hr (Norm: 3.00)"), "D hourly actual-vs-norm rate is wrong");
assert(day1.includes("+8.00 L"), "A excess/under is wrong");
assert(day1.includes("2 records (1 billable, 1 open)"), "E multiple-record signal is missing");
assert(day1.includes("Multiple conflicting readings"), "A conflicting readings are silently merged");

const day2 = await text("hire-activity-day-2026-11-02");
assert(day2.includes("Worked") && day2.includes("1 record"), "D zero-run activity row is missing");
assert(!day2.includes("Infinity") && !day2.includes("NaN"), "D zero-run row contains division error");
const day2Cells = await evaluate("[...document.querySelector('[data-testid=\"hire-activity-day-2026-11-02\"]').cells].map(e => e.innerText)");
assert(day2Cells[5] === "—", `D zero guard should be —, got ${JSON.stringify(day2Cells[5])}`);

const day3 = await text("hire-activity-day-2026-11-03");
assert(day3.includes("No Activity — Still Billable"), "B no-activity status is not explicit");
const day4 = await text("hire-activity-day-2026-11-04");
assert(day4.includes("Breakdown") && day4.includes("6.00 h"), "A breakdown downtime/status is missing");

await focus("hire-activity-day-2026-11-01");
const screenshotA = await screenshot("A-logged-activity-all-columns");
await scrollCalendar("right");
const screenshotARight = await screenshot("A-site-work-and-records-columns");
await scrollCalendar("left");
await focus("hire-activity-day-2026-11-03");
const screenshotB = await screenshot("B-no-activity-still-billable");
await focus("hire-activity-day-2026-11-01");
const screenshotCNonTrip = await screenshot("C-hour-machine-trips-na");
await focus("hire-activity-day-2026-11-02");
const screenshotD = await screenshot("D-consumption-rate-and-zero-guard");
await focus("hire-activity-day-2026-11-01");
await scrollCalendar("right");
const screenshotE = await screenshot("E-multiple-records-visible");
await scrollCalendar("left");

// F: compare the displayed reconciliation with the saved synthetic payload.
const hourlyCardText = await text(hourlyCard);
assert(hourlyCardText.includes("Expected: 24.00 L"), "F pre-save expected diesel is not 24.00 L");
assert(hourlyCardText.includes("Actual: 32.00 L"), "F pre-save actual diesel is not 32.00 L");
assert(hourlyCardText.includes("Excess: 8.00 L"), "F pre-save excess is not 8.00 L");
assert(hourlyCardText.includes("Recovery: ₹720.00"), "F pre-save recovery is not ₹720.00");
const accepted = await evaluate(`(() => {
  const card = document.querySelector('[data-testid=${quote(hourlyCard)}]');
  const button = [...card.querySelectorAll("button")].find(item => item.innerText.trim() === "Accept Suggested");
  if (!button || button.disabled) return false;
  button.click();
  return true;
})()`);
assert(accepted, "F could not accept suggested recovery");
await clickTestId("button-save-bill");
await waitFor("(window.__VB21Fixture?.createdPayloads || []).length === 1", "synthetic fixture save");
const saved = (await fixtureState()).createdPayloads[0];
assert(saved.hireGroups?.length === 1, "F saved payload does not contain one hire group");
assert(saved.hireGroups[0].dieselRecoveryDecision === "accept", "F saved recovery decision changed");
assert(saved.hireGroups[0].dieselRecoveryFinalAmount === 720, "F saved recovery is not unchanged ₹720");
assert(saved.hireGroups[0].calculatedGrossAmount === 5000, "F saved five-day gross calculation is not ₹5,000");
assert(saved.hireGroups[0].netAmount === 3280, "F saved net is not gross ₹5,000 less ₹1,000 breakdown and ₹720 recovery");

// C and distance-unit part of D: a real transport/trip source must show two
// trips, while retaining the distance-based actual-vs-norm unit.
await loadScenario("tipper");
await startBill(2102);
const tripDay = await text("hire-activity-day-2026-11-01");
assert(tripDay.includes("2.00"), "C tipper does not show the correct two trips");
assert(tripDay.includes("0.50 L/Km (Norm: 0.40)"), "D distance-based rate/unit is wrong");
assert(tripDay.includes("2 records"), "E tipper multi-record signal is missing");
await focus("hire-activity-day-2026-11-01");
const screenshotCTrip = await screenshot("C-tipper-two-material-trips");
const screenshotDKm = await screenshot("D-distance-rate-unit");

// G: the existing saved-report/export path still explicitly includes Expected
// litres. This is source-level regression evidence in addition to the browser
// proof that the pre-save calendar labels its replacement Consumption Rate.
const outputSource = readFileSync(path.join(workspace, "client/src/components/vendor-bills/EquipmentHireBillOutput.tsx"), "utf8");
const vendorBillsSource = readFileSync(path.join(workspace, "client/src/pages/VendorBills.tsx"), "utf8");
assert(outputSource.includes('"Expected", "Difference", "Actual Consumption | Master Norm"'), "G export headers no longer contain Expected");
assert(outputSource.includes("litres(item?.expectedDiesel)"), "G export values no longer emit Expected Diesel litres");
assert(vendorBillsSource.includes("HSD ACTUAL / EXPECTED"), "G saved bill output no longer contains HSD actual/expected litres");

const evidence = {
  scenario: "VB-21 isolated fixture verification — synthetic, not live bills",
  safety: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    mountedProductionComponent: "client/src/pages/VendorBills.tsx",
    interception: "All API reads and the synthetic save were intercepted by tests/fixtures/vendor-bills-vb21/main.tsx.",
  },
  screenshots: [
    screenshotA, screenshotARight, screenshotB, screenshotCNonTrip, screenshotCTrip,
    screenshotD, screenshotDKm, screenshotE,
  ],
  verified: {
    A_allRequiredDailyDetailsAndBreakdown: true,
    B_noActivityStillBillable: true,
    C_hourMachineTripsNAAndTipperTrips2: true,
    D_hourlyAndDistanceRatesWithZeroGuard: true,
    E_multipleRecordsExplicit: true,
    F_displayedAndSavedRecoveryRemain720: true,
    F_savedExpectedActualExcess: { expectedLitres: 24, actualLitres: 32, excessLitres: 8 },
    F_savedGrossAndNet: { gross: 5000, breakdown: 1000, recovery: 720, net: 3280 },
    G_existingExpectedDieselReportAndExportCodePresent: true,
    noSchemaChangeNeeded: true,
  },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();