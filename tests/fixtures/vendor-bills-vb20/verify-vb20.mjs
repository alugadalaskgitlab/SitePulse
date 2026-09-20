/*
 * VB-20 isolated browser verification.
 *
 * Mounts the production VendorBills component with synthetic fetch responses.
 * POSTs remain inside the fixture and never reach the production API/database.
 * Start this fixture on VITE_PORT (default 4190) and Chromium CDP on CDP_PORT
 * (default 9340), then run this script.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const vitePort = Number(process.env.VITE_PORT || 4190);
const cdpPort = Number(process.env.CDP_PORT || 9340);
const evidenceDir = path.resolve(new URL(".", import.meta.url).pathname, "../../..", "screenshots/vb20");
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
const bodyText = () => evaluate("document.body.innerText");
const cardText = testId => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.innerText || ""`);
const fixtureState = async () => JSON.parse(await evaluate("JSON.stringify(window.__VB20Fixture)"));
const screenshot = async name => {
  await sleep(300);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const focusForScreenshot = async testId => {
  await evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.scrollIntoView({ block: "start" })`);
  await sleep(250);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/plant/vendor-bills` });
await waitFor("document.readyState === 'complete'", "fixture document");
await waitFor("!!document.querySelector('[data-testid=\"vb20-fixture-disclosure\"]')", "fixture disclosure");

const startBill = async (from, to, label) => {
  if (await evaluate("!!document.querySelector('[data-testid=\"button-cancel\"]')")) {
    await clickTestId("button-cancel");
  }
  await waitFor("!!document.querySelector('[data-testid=\"button-new-bill\"]')", `${label} new bill`);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"input-period-from\"]')", `${label} form`);
  await setInput("input-period-from", from);
  await setInput("input-period-to", to);
  await clickTestId("button-show-vendors");
  await waitFor("!!document.querySelector('[data-testid=\"button-select-vendor-VB20 MONTHLY HIRE FIXTURE\"]')", `${label} vendor`);
  await clickTestId("button-select-vendor-VB20 MONTHLY HIRE FIXTURE");
  await waitFor("document.querySelector('[data-testid=\"input-vendor-name\"]')?.value === 'VB20 MONTHLY HIRE FIXTURE'", `${label} selected vendor`);
};

// A: two calendar segments and exact unchanged monthly math.
await startBill("2026-08-01", "2026-09-20", "A");
await waitFor("document.querySelectorAll('[data-testid^=\"monthly-hire-2020-\"]').length === 2", "A two month cards");
const augustId = "monthly-hire-2020-2026-08-01";
const septemberId = "monthly-hire-2020-2026-09-01";
const augustText = await cardText(augustId);
const septemberText = await cardText(septemberId);
assert(augustText.includes("01-AUG-2026") && augustText.includes("31-AUG-2026"), "A August range is wrong");
assert(septemberText.includes("01-SEP-2026") && septemberText.includes("20-SEP-2026"), "A September range is wrong");
assert((await evaluate("document.querySelector('[data-testid=\"monthly-hire-net-2020-2026-08-01\"]')?.textContent")).includes("60,000.00"), "A August is not ₹60,000");
assert((await evaluate("document.querySelector('[data-testid=\"monthly-hire-net-2020-2026-09-01\"]')?.textContent")).includes("40,000.00"), "A September is not ₹40,000");
assert(augustText.includes("Expected: 100.00 L") && augustText.includes("Actual: 110.00 L"), "G August diesel is not date-scoped");
assert(septemberText.includes("Expected: 50.00 L") && septemberText.includes("Actual: 80.00 L"), "G September diesel is not date-scoped");
await focusForScreenshot(augustId);
const screenshotA = await screenshot("fixture-verification-A-two-month-august");

// B: omit September and inspect the exact synthetic POST payload.
await clickTestId("checkbox-include-monthly-hire-2020-2026-09-01");
await waitFor("document.querySelector('[data-testid=\"checkbox-include-monthly-hire-2020-2026-09-01\"]')?.checked === false", "B September unchecked");
assert((await bodyText()).includes("60,000.00"), "B ₹60,000 total not shown");
await focusForScreenshot("monthly-hire-auto-summary");
const screenshotB = await screenshot("fixture-verification-B-september-unchecked");
await clickTestId("button-save-bill");
await waitFor("(window.__VB20Fixture?.createdPayloads || []).length === 1", "B fixture save");
const bPayload = (await fixtureState()).createdPayloads[0];
assert(bPayload.hireGroups.length === 1, "B payload contains more than August");
assert(bPayload.hireGroups[0].periodFrom === "2026-08-01" && bPayload.hireGroups[0].periodTo === "2026-08-31", "B payload did not contain only August");
assert(bPayload.items.length === 1 && bPayload.items[0].amount === 60000, "B item payload did not contain exactly ₹60,000 August");

// C: the omitted September range remains offered by the production component.
await startBill("2026-09-01", "2026-09-20", "C");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-2020\"]')", "C September card");
const cText = await cardText("monthly-hire-2020");
assert(cText.includes("01-SEP-2026") && cText.includes("20-SEP-2026") && cText.includes("40,000.00"), "C September was not re-offered at ₹40,000");
assert(!await evaluate("!!document.querySelector('[data-testid^=\"checkbox-include-monthly-hire-\"]')"), "F-style one-month card unexpectedly has include checkbox");
await focusForScreenshot("monthly-hire-2020");
const screenshotC = await screenshot("fixture-verification-C-september-offered-later");

// D: the fixture simulates the server's 409 overlap response. This is UI/error
// handling evidence only; evidence.json explicitly does not claim backend proof.
await clickTestId("button-cancel");
await startBill("2026-08-01", "2026-08-31", "D");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-2020\"]')", "D August card");
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"vb20-simulated-overlap\"]')", "D simulated overlap banner");
assert((await fixtureState()).simulatedOverlapRejections.length === 1, "D fixture did not reject overlap");
const screenshotD = await screenshot("fixture-verification-D-simulated-overlap-not-backend-proof");

// E: arbitrary 3+ month splitting.
await clickTestId("button-cancel");
await startBill("2026-08-01", "2026-10-15", "E");
await waitFor("document.querySelectorAll('[data-testid^=\"monthly-hire-2020-\"]').length === 3", "E three month cards");
assert(await evaluate("document.querySelectorAll('[data-testid^=\"checkbox-include-monthly-hire-\"]').length === 3"), "E months are not independently selectable");
assert((await bodyText()).includes("30,000.00"), "E October 15-day proration is not ₹30,000");
await focusForScreenshot("monthly-hire-auto-summary");
const screenshotE = await screenshot("fixture-verification-E-three-month-split");
await focusForScreenshot("monthly-hire-2020-2026-10-01");
const screenshotEOctober = await screenshot("fixture-verification-E-third-month-october");

// F: a single-month period remains one row and does not expose split selection.
await clickTestId("button-cancel");
await startBill("2026-10-01", "2026-10-15", "F");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-2020\"]')", "F one month card");
assert(await evaluate("document.querySelectorAll('[data-testid^=\"monthly-hire-2020-\"]').length === 0"), "F unexpectedly rendered split cards");
assert(!await evaluate("!!document.querySelector('[data-testid^=\"checkbox-include-monthly-hire-\"]')"), "F unexpectedly rendered include checkbox");
assert((await cardText("monthly-hire-2020")).includes("30,000.00"), "F single-month proration is not ₹30,000");
await focusForScreenshot("monthly-hire-2020");
const screenshotF = await screenshot("fixture-verification-F-single-month-no-regression");

// G: reload only the isolated fixture into its explicit breakdown scenario.
// This keeps Test A's arithmetic reproduction free of unrelated deductions,
// while exercising separately scoped source dates and deduction totals.
await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/plant/vendor-bills?scenario=breakdown` });
await waitFor("!!document.querySelector('[data-testid=\"button-new-bill\"]')", "G fixture reload");
await startBill("2026-08-01", "2026-09-20", "G");
await waitFor("document.querySelectorAll('[data-testid^=\"monthly-hire-2020-\"]').length === 2", "G month cards");
await evaluate(`document.querySelectorAll('[data-testid^="monthly-hire-2020-"] details').forEach(element => { element.open = true; })`);
const gAugustText = await cardText(augustId);
const gSeptemberText = await cardText(septemberId);
assert(gAugustText.includes("AUGUST FIXTURE BREAKDOWN") && !gAugustText.includes("SEPTEMBER FIXTURE BREAKDOWN"), "G August breakdown evidence is blended");
assert(gSeptemberText.includes("SEPTEMBER FIXTURE BREAKDOWN") && !gSeptemberText.includes("AUGUST FIXTURE BREAKDOWN"), "G September breakdown evidence is blended");
assert(gAugustText.includes("Breakdown Deduction") && gAugustText.includes("4,000.00"), "G August two-day deduction is not ₹4,000");
assert(gSeptemberText.includes("Breakdown Deduction") && gSeptemberText.includes("2,000.00"), "G September one-day deduction is not ₹2,000");
assert(gAugustText.includes("Expected: 100.00 L") && gAugustText.includes("Actual: 110.00 L"), "G August diesel is not date-scoped");
assert(gSeptemberText.includes("Expected: 50.00 L") && gSeptemberText.includes("Actual: 80.00 L"), "G September diesel is not date-scoped");
await focusForScreenshot(septemberId);
const screenshotG = await screenshot("fixture-verification-G-separate-diesel-breakdown");
await focusForScreenshot(augustId);
const screenshotGAugust = await screenshot("fixture-verification-G-august-diesel-breakdown");

const evidence = {
  scenario: "VB-20 fixture verification — synthetic, not live bills",
  evidence: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    mountedProductionComponent: "client/src/pages/VendorBills.tsx",
    disclosure: "All responses and mutations were intercepted by tests/fixtures/vendor-bills-vb20/main.tsx.",
    screenshots: [
      screenshotA, screenshotB, screenshotC, screenshotD, screenshotE,
      screenshotEOctober, screenshotF, screenshotG, screenshotGAugust,
    ],
  },
  verified: {
    A_twoRows60000Plus40000Equals100000: true,
    B_savePayloadOnlyAugust: true,
    C_omittedSeptemberOfferedLaterAt40000: true,
    D_uiDisplaysSynthetic409Overlap: true,
    D_backendOverlapProvenByThisFixture: false,
    E_threeMonthSplit: true,
    F_singleMonthNoSplitRegression: true,
    G_dieselAndBreakdownEvidenceDateScoped: true,
    noSchemaChangeRequired: true,
  },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();