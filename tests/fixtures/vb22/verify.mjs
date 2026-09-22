/*
 * VB-22 isolated browser verification.
 *
 * Parent owns the already-running processes:
 *   VITE_PORT=4194 vite --config tests/fixtures/vb22/vite.config.ts
 *   chromium --remote-debugging-port=9344 http://127.0.0.1:4194
 *
 * The production SiteMaterialTrips and VendorBills components are mounted,
 * while main.tsx intercepts every API read/write with synthetic in-memory data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const vitePort = Number(process.env.VITE_PORT || 4194);
const cdpPort = Number(process.env.CDP_PORT || 9344);
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/vb22");
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
const waitFor = async (expression, label, attempts = 400) => {
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
const selectOption = async (testId, label) => {
  await clickTestId(testId);
  await waitFor(`[...document.querySelectorAll('[role="option"]')].some(element => element.textContent.trim() === ${quote(label)})`, `${label} option`);
  const clicked = await evaluate(`(() => {
    const option = [...document.querySelectorAll('[role="option"]')].find(element => element.textContent.trim() === ${quote(label)});
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(clicked, `Could not select ${label}`);
  await sleep(80);
};
const text = testId => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.innerText || ""`);
const inputValue = testId => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.value ?? ""`);
const fixtureState = async () => JSON.parse(await evaluate("JSON.stringify(window.__VB22Fixture)"));
const focus = async testId => {
  await evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.scrollIntoView({ block: "center" })`);
  await sleep(200);
};
const screenshot = async name => {
  await sleep(250);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const load = async url => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}${url}` });
  await waitFor("document.readyState === 'complete'", `${url} document`);
  await waitFor("!!document.querySelector('[data-testid=\"vb22-fixture-disclosure\"]')", "fixture disclosure");
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

// A: save a real SiteMaterialTrips form carrying both independent vendor roles.
await load("/site/material-trips");
await setInput("input-filter-date-from", "2027-02-14");
await setInput("input-filter-date-to", "2027-02-14");
await selectOption("select-filter-site", "VB22 TEST ROAD");
await clickTestId("checkbox-filter-only-unassigned");
await setInput("input-trip-date", "2027-02-14");
await selectOption("select-trip-site", "VB22 TEST ROAD");
await selectOption("select-trip-material", "Soil");
await setInput("input-trip-supplier", "VB22 ROAD TRANSPORT");
await setInput("input-trip-material-source-supplier", "VB22 BORROW OWNER");
await setInput("input-trip-vehicle", "TS22AA2290");
await setInput("input-trip-quantity", "600");
await selectOption("select-trip-transport-type", "Agency / Vendor");
await waitFor("!!document.querySelector('[data-testid=\"trip-work-ctx-select-item\"]') && !document.querySelector('[data-testid=\"trip-work-ctx-select-item\"]').disabled", "BOQ item selector");
await selectOption("trip-work-ctx-select-item", "SOIL EMBANKMENT");
await waitFor("!document.querySelector('[data-testid=\"button-submit-trip\"]').disabled", "enabled trip save");
await clickTestId("button-submit-trip");
await waitFor("(window.__VB22Fixture?.createdTrips || []).length === 1", "synthetic trip save");
// The page's create invalidation targets the unfiltered base key. Toggle the
// start date to request a fresh filtered list before asserting persistence.
await setInput("input-filter-date-from", "2027-02-13");
await waitFor("!!document.querySelector('[data-testid=\"row-trip-2290\"]')", "saved trip row");
const savedTrip = (await fixtureState()).createdTrips[0];
assert(savedTrip.supplier === "VB22 ROAD TRANSPORT", "A transporter was not stored");
assert(savedTrip.materialSourceSupplier === "VB22 BORROW OWNER", "A material source was not stored");
assert((await text("row-trip-2290")).includes("VB22 ROAD TRANSPORT"), "A transporter is not visible");
assert((await text("trip-material-source-2290")) === "VB22 BORROW OWNER", "A material source is not visible");
await focus("row-trip-2290");
const screenshotA = await screenshot("A-saved-both-transporter-and-material-source");

// A2: filter backlog, bulk assign exactly two old rows, and prove unrelated row unchanged.
await selectOption("select-filter-material", "Soil");
await setInput("input-filter-supplier", "VB22 ROAD TRANSPORT");
await clickTestId("checkbox-filter-only-unassigned");
await waitFor("!!document.querySelector('[data-testid=\"row-trip-2202\"]') && !!document.querySelector('[data-testid=\"row-trip-2203\"]')", "two filtered backlog rows");
assert(!await evaluate("!!document.querySelector('[data-testid=\"row-trip-2206\"]')"), "A2 unrelated legacy row entered filtered set");
await setInput("input-bulk-material-source-supplier", "VB22 BORROW OWNER");
await clickTestId("button-bulk-assign-material-source");
await waitFor("!!document.querySelector('[data-testid=\"dialog-confirm-bulk-material-source\"]')", "bulk confirmation");
assert((await text("dialog-confirm-bulk-material-source")).includes("2 trips"), "A2 confirmation did not count two matching rows");
await clickTestId("button-confirm-bulk-material-source");
await waitFor("(window.__VB22Fixture?.bulkAssignments || []).length === 1", "bulk assignment request");
await clickTestId("checkbox-filter-only-unassigned");
await waitFor("document.querySelector('[data-testid=\"trip-material-source-2202\"]')?.innerText === 'VB22 BORROW OWNER'", "first assigned backlog row");
assert((await text("trip-material-source-2203")) === "VB22 BORROW OWNER", "A2 second backlog row was not assigned");
await focus("bulk-material-source-panel");
const screenshotA2 = await screenshot("A2-filtered-bulk-assignment");
await setInput("input-filter-supplier", "");
await waitFor("!!document.querySelector('[data-testid=\"row-trip-2206\"]')", "unrelated legacy row");
assert((await text("trip-material-source-2206")) === "-", "A2 unrelated legacy row was modified");

async function startBill(vendor, scenario = "") {
  await load(`/plant/vendor-bills${scenario ? `?scenario=${scenario}` : ""}`);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"input-period-from\"]')", "bill form");
  await setInput("input-period-from", "2027-02-14");
  await setInput("input-period-to", "2027-02-14");
  await clickTestId("button-show-vendors");
  const vendorButton = `button-select-vendor-${vendor}`;
  await waitFor(`!!document.querySelector('[data-testid=${quote(vendorButton)}]')`, `${vendor} discovery`);
  await clickTestId(vendorButton);
  await waitFor("!!document.querySelector('[data-testid=\"button-auto-populate\"]') || document.body.innerText.includes('ALREADY BILLED')", `${vendor} pull candidates`);
}

async function pullAndRead(vendor) {
  await startBill(vendor);
  await waitFor("document.querySelector('[data-testid=\"button-auto-populate\"]')?.disabled === false", `${vendor} enabled pull`);
  await clickTestId("button-auto-populate");
  await waitFor("!!document.querySelector('[data-testid=\"text-item-desc-0\"]')", `${vendor} pulled item`);
  return {
    description: await text("text-item-desc-0"),
    qty: await inputValue("input-item-qty-0"),
    unit: await text("select-item-unit-0"),
    rate: await inputValue("input-item-rate-0"),
  };
}

// B: raw 600 CFT material-source rows convert automatically through the real
// pull handler and the source vendor's synthetic SOIL/TRIP/₹800 rate card.
const sourceItem = await pullAndRead("VB22 BORROW OWNER");
assert(sourceItem.description.includes("SOIL"), "B source material description missing");
assert(Number(sourceItem.qty) === 1, `B expected 1 converted TRIP, got ${sourceItem.qty}`);
assert(sourceItem.unit.includes("TRIP"), `B expected TRIP unit, got ${sourceItem.unit}`);
assert(Number(sourceItem.rate) === 800, `B expected ₹800 rate, got ${sourceItem.rate}`);
const sourceCheck = (await fixtureState()).requests.find(row => row.path === "/api/vendor-bills/check-duplicates");
assert(sourceCheck?.body?.items?.[0]?.sourceType === "site_material_trip_material", "B sourceType was not preserved into duplicate preflight");
await focus("text-item-desc-0");
const screenshotB = await screenshot("B-600CFT-auto-converted-to-1TRIP-800");

// C: same physical trip IDs remain pullable under the independent transporter role.
const transportItem = await pullAndRead("VB22 ROAD TRANSPORT");
assert(transportItem.description.includes("TRANSPORT"), "C transporter line missing");
assert(Number(transportItem.qty) === 1 && transportItem.unit.includes("TRIP"), "C transporter trip quantity/unit wrong");
const transporterCheck = (await fixtureState()).requests.find(row => row.path === "/api/vendor-bills/check-duplicates");
assert(transporterCheck?.body?.items?.[0]?.sourceType === "site_material_trip", "C transporter sourceType is not independent");
await focus("text-item-desc-0");
const screenshotC = await screenshot("C-independent-transporter-pull-same-trip");

// D: labelled synthetic API simulation blocks only a same-role duplicate.
await startBill("VB22 BORROW OWNER", "duplicate");
await waitFor("document.body.innerText.includes('ALREADY BILLED')", "same-role duplicate warning");
const duplicateText = await evaluate("document.body.innerText");
assert(duplicateText.includes("SYNTHETIC SAME-ROLE DUPLICATE API SIMULATION"), "D simulation is not explicitly labelled");
assert(duplicateText.includes("ALREADY BILLED"), "D same-role duplicate warning missing");
// Pulling keeps the API-labelled evidence visible as an already-billed row;
// the synthetic create endpoint then independently enforces the hard block.
await waitFor("document.querySelector('[data-testid=\"button-auto-populate\"]')?.disabled === false", "duplicate evidence pull");
await clickTestId("button-auto-populate");
await waitFor("!!document.querySelector('[data-testid=\"badge-billed-0\"]')", "already-billed row badge");
await clickTestId("button-save-bill");
await waitFor("(window.__VB22Fixture?.requests || []).some(row => row.method === 'POST' && row.path === '/api/vendor-bills')", "duplicate save rejection");
assert((await fixtureState()).createdBills.length === 0, "D duplicate API simulation allowed a bill to be created");
await focus("vb22-duplicate-simulation");
const screenshotD = await screenshot("D-same-role-duplicate-warning-and-block");

// E: no matching card preserves the logged 600 CFT quantity/unit and does not block.
const fallbackItem = await pullAndRead("VB22 NO RATE SOURCE");
assert(Number(fallbackItem.qty) === 600, `E expected logged 600 quantity, got ${fallbackItem.qty}`);
assert(fallbackItem.unit.includes("CFT"), `E expected logged CFT unit, got ${fallbackItem.unit}`);
assert(Number(fallbackItem.rate || 0) === 0, `E expected zero/manual rate, got ${fallbackItem.rate}`);
await focus("text-item-desc-0");
const screenshotE = await screenshot("E-no-rate-card-preserves-600CFT");

// F: no material-source value leaves the existing transporter pull unchanged.
const legacyItem = await pullAndRead("VB22 LEGACY TRANSPORT");
assert(legacyItem.description.includes("TRANSPORT"), "F legacy transporter item missing");
assert(Number(legacyItem.qty) === 1 && legacyItem.unit.includes("TRIP"), "F legacy transporter behavior changed");
await focus("text-item-desc-0");
const screenshotF = await screenshot("F-legacy-trip-transporter-only");

const schemaSource = readFileSync(path.join(workspace, "shared/schema.ts"), "utf8");
const migrationSource = readFileSync(path.join(workspace, "migrations/0033_site_material_trip_material_source.sql"), "utf8");
assert(schemaSource.includes('materialSourceSupplier: text("material_source_supplier")'), "Schema column missing");
assert(/ADD COLUMN IF NOT EXISTS material_source_supplier text/i.test(migrationSource), "Additive nullable migration missing");

const evidence = {
  scenario: "VB-22 isolated real-component fixture verification — synthetic API, no production writes",
  safety: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    mountedProductionComponents: ["client/src/pages/SiteMaterialTrips.tsx", "client/src/pages/VendorBills.tsx"],
    interception: "Every API read/write was intercepted in tests/fixtures/vb22/main.tsx.",
  },
  screenshots: [screenshotA, screenshotA2, screenshotB, screenshotC, screenshotD, screenshotE, screenshotF],
  verified: {
    A_savedAndDisplayedIndependentVendors: true,
    A2_filteredBulkAssignedTwoAndPreservedUnrelated: true,
    B_raw600CftAutoConverted: { qty: 1, unit: "TRIP", rate: 800, sourceType: "site_material_trip_material" },
    C_sameTripIndependentTransporterRole: true,
    D_sameRoleDuplicateWarningAndBlock: true,
    D_apiSimulationExplicitlyLabelled: true,
    E_noRateFallback: { qty: 600, unit: "CFT", rate: 0 },
    F_legacyTransporterOnly: true,
    schema: { column: "material_source_supplier", nullable: true, additiveMigration: true },
  },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();