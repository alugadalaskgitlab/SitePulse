/*
 * VB-15 browser evidence for the mounted production VendorBills component.
 *
 * The fixture owns every response and records only in-memory fetch activity.
 * This verifier intentionally does not call production APIs or write bills.
 * Part 1's JCB mirror data is a faithful fixture contract; it cannot prove the
 * production storage query, so the report explicitly labels that limitation.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

// main.tsx retains the fixture's conditional baseline import. Vite analyzes
// the import even when this verifier never navigates with mode=baseline.
const baselineModulePath = path.join(fixtureDir, "baseline-head.tsx");
writeFileSync(baselineModulePath, execFileSync("git", [
  "show", "HEAD:client/src/pages/VendorBills.tsx",
], { cwd: process.cwd(), encoding: "utf8" }));
process.on("exit", () => {
  try { unlinkSync(baselineModulePath); } catch { /* already absent */ }
});

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("Chromium did not expose a page target on CDP port 9222");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") {
    console.error(`Browser exception: ${message.params.exceptionDetails.text}`);
  }
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, {
    resolve,
    reject: (error) => reject(new Error(`${method}: ${error.message}`)),
  });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  let result;
  try {
    result = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
  } catch (error) {
    throw new Error(`Runtime.evaluate failed for ${expression.slice(0, 220)}: ${error.message}`);
  }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

const waitFor = async (expression, label, attempts = 240) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const quote = (value) => JSON.stringify(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const state = async () => {
  const serialized = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return serialized ? JSON.parse(serialized) : null;
};
const lineDescriptions = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="text-item-desc-"]'))
  .map(item => item.textContent?.replace(/\\s+/g, " ").trim())`);
const billedBadges = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="badge-billed-"]'))
  .map(item => item.textContent?.replace(/\\s+/g, " ").trim())`);

const navigate = async (scenario, label) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:4177/plant/vendor-bills?scenario=${encodeURIComponent(scenario)}`,
  });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`);
};

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click enabled [data-testid=${testId}]`);
};

const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};

const groupRows = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="pull-group-"]')).map(row => ({
  id: row.getAttribute("data-testid"),
  text: row.textContent?.replace(/\\s+/g, " ").trim(),
  button: row.querySelector("button")?.textContent?.replace(/\\s+/g, " ").trim(),
  disabled: !!row.querySelector("button")?.disabled,
}))`);

const configure = async ({
  scenario, label, vendor, from, to, expectedGroups,
}) => {
  await navigate(scenario, label);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} form`);
  const billType = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  assert(billType === "All Types (Combined)", `${label} fresh bill type changed to ${JSON.stringify(billType)}`);
  await setInput("input-period-from", from);
  await setInput("input-period-to", to);
  await waitFor(`(() => {
    const button = document.querySelector('[data-testid="button-show-vendors"]');
    return !!button && !button.disabled;
  })()`, `${label} vendor discovery button`);
  await clickTestId("button-show-vendors");
  await waitFor(`!!document.querySelector('[data-testid="row-vendor-${vendor}"]')`, `${label} vendor row`);
  await clickTestId(`button-select-vendor-${vendor}`);
  await waitFor(`document.querySelector('[data-testid="input-vendor-name"]')?.value === ${quote(vendor)}`, `${label} selected vendor`);
  await waitFor(
    "window.__VB09Fixture?.requests.some(request => request.path.includes('/api/vendor-bills/auto-items') && request.path.includes('billType=all'))",
    `${label} auto-items request`,
  );
  await waitFor(`document.querySelectorAll('[data-testid^="pull-group-"]').length === ${expectedGroups}`, `${label} groups`);
  await waitFor("window.__VB09Fixture?.duplicateChecks.length >= 1", `${label} duplicate check`);
  return { billType, groups: await groupRows() };
};

const waitForRows = async (count, label) => {
  await waitFor(
    `document.querySelectorAll('[data-testid^="text-item-desc-"]').length === ${count}`,
    `${label} row count`,
  );
  await waitFor(
    "document.querySelectorAll('[data-testid^=\"input-item-desc-\"]').length === 0",
    `${label} blank row removal`,
  );
  const descriptions = await lineDescriptions();
  assert(descriptions.length === count, `${label} generated ${descriptions.length} rows; expected ${count}`);
  return descriptions;
};

const pullAll = async (count, label) => {
  await clickTestId("button-auto-populate");
  return waitForRows(count, label);
};

const duplicateFlagsForLength = (fixture, itemCount, label) => {
  const checks = fixture?.duplicateChecks || [];
  const flags = fixture?.duplicateFlags || [];
  for (let index = Math.min(checks.length, flags.length) - 1; index >= 0; index -= 1) {
    if (checks[index]?.items?.length === itemCount) {
      const result = flags[index] || [];
      const indices = result.map((flag) => flag.index);
      assert(new Set(indices).size === indices.length, `${label} duplicate indices repeated`);
      return result;
    }
  }
  throw new Error(`${label} did not record an ${itemCount}-item duplicate check`);
};

// The exact data-testid is intentionally optional. The visible action text is
// the contract requested for VB-15, while the test-id fallback lets the
// verifier remain safe if the UI uses a different stable naming convention.
const excludeButtonInfo = () => evaluate(`(() => {
  const buttons = Array.from(document.querySelectorAll("button"));
  const match = buttons.find(button => {
    const text = (button.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
    const id = (button.getAttribute("data-testid") || "").toLowerCase();
    return text.includes("exclude already-billed rows") || id.includes("exclude-already-billed");
  });
  return match ? {
    testId: match.getAttribute("data-testid"),
    text: match.textContent?.replace(/\\s+/g, " ").trim(),
    disabled: !!match.disabled,
  } : null;
})()`);

const clickExcludeAlreadyBilled = async (label) => {
  const info = await excludeButtonInfo();
  assert(info && !info.disabled, `${label} Exclude Already-Billed Rows action is missing/disabled: ${JSON.stringify(info)}`);
  const clicked = await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const match = buttons.find(button => {
      const text = (button.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      const id = (button.getAttribute("data-testid") || "").toLowerCase();
      return text.includes("exclude already-billed rows") || id.includes("exclude-already-billed");
    });
    if (!match || match.disabled) return false;
    match.click();
    return true;
  })()`);
  assert(clicked, `${label} could not click Exclude Already-Billed Rows`);
};

const waitForExcluded = async (count, label) => {
  const descriptions = await waitForRows(count, label);
  await waitFor("document.querySelectorAll('[data-testid^=\"badge-billed-\"]').length === 0", `${label} no BILLED badges`);
  const info = await excludeButtonInfo();
  assert(!info || info.disabled, `${label} exclude action remained enabled after all billed rows were removed`);
  return descriptions;
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const scrollTo = async (selector) => {
  await evaluate(`document.querySelector(${quote(selector)})?.scrollIntoView({ block: "center" })`);
};

// A — Exact real-data seam: equipment 45, DPR log 917, mirror Plant usage
// 228, 31-AUG-2026, 5.4 HRS, 10L. The fixed activity response has one
// authoritative SITE line, not two lines for the same physical use.
const a = await configure({
  scenario: "vb15-part1-jcb", label: "VB15-A exact JCB mirror",
  vendor: "JCB VISWANATH BODAPALLY", from: "2026-08-31", to: "2026-08-31",
  expectedGroups: 1,
});
const aRows = await pullAll(1, "A");
assert(aRows.filter(row => row.includes("JCB VISWANATH BODAPALLY") && row.includes("5.4 HRS") && row.includes("DIESEL: 10L")).length === 1, "A exact JCB SITE usage was not represented once");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"text-item-date-\"]')).some(item => item.textContent?.includes('31-AUG-2026'))"), "A exact JCB date is not 31-AUG-2026");
assert((await evaluate("document.querySelectorAll('[data-testid^=\"badge-form-site-\"]').length")) === 1, "A exact usage did not retain one SITE badge");
const aState = await state();
assert(aState.vb15RawActivities.filter(row => row.source === "dpr_log" && row.sourceId === 917 && row.plantUsageId === 228).length === 1, "A fixture lost exact DPR 917 → Plant 228 link");
assert(aState.vb15RawActivities.filter(row => row.source === "plant_usage" && row.sourceId === 228).length === 1, "A fixture lost exact Plant mirror 228");
assert(aState.vb15ReturnedActivities.length === 1, "A patched activity response did not dedupe the exact mirror");
assert(duplicateFlagsForLength(aState, 1, "A").length === 0, "A exact JCB case unexpectedly billed");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotA = await capture("vb15A");

// B — Independent Plant-only usage survives when the same vendor/period is
// widened beyond the exact mirrored date.
await configure({
  scenario: "vb15-part1-jcb", label: "VB15-B independent Plant",
  vendor: "JCB VISWANATH BODAPALLY", from: "2026-08-31", to: "2026-09-01",
  expectedGroups: 1,
});
const bRows = await pullAll(2, "B");
assert(bRows.some(row => row.includes("INDEPENDENT PLANT") && row.includes("(PLANT)")), "B independent Plant usage disappeared");
assert(bRows.filter(row => row.includes("5.4 HRS") && row.includes("DIESEL: 10L")).length === 1, "B exact mirrored usage duplicated after widening period");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotB = await capture("vb15B");

// C — Independent Site DPR with no plantUsageId also survives.
await configure({
  scenario: "vb15-part1-jcb", label: "VB15-C independent Site",
  vendor: "JCB VISWANATH BODAPALLY", from: "2026-08-31", to: "2026-09-02",
  expectedGroups: 1,
});
const cRows = await pullAll(3, "C");
assert(cRows.some(row => row.includes("INDEPENDENT SITE") && row.includes("(SITE)")), "C independent Site DPR disappeared");
assert(cRows.filter(row => row.includes("5.4 HRS") && row.includes("DIESEL: 10L")).length === 1, "C exact mirrored usage duplicated with independent Site row");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotC = await capture("vb15C");

// D — Other vendors/periods: one Plant-only vendor and one Site-only vendor
// remain visible, exercising more than the exact JCB context.
await configure({
  scenario: "vb15-other-plant", label: "VB15-D other Plant vendor",
  vendor: "VB15 OTHER PLANT VENDOR", from: "2026-07-12", to: "2026-07-13",
  expectedGroups: 1,
});
const dPlantRows = await pullAll(2, "D Plant");
assert(dPlantRows.every(row => row.includes("OTHER PLANT")), "D other Plant vendor rows changed");
await configure({
  scenario: "vb15-other-site", label: "VB15-D other Site vendor",
  vendor: "VB15 OTHER SITE VENDOR", from: "2026-07-21", to: "2026-07-21",
  expectedGroups: 1,
});
const dSiteRows = await pullAll(1, "D Site");
assert(dSiteRows[0].includes("OTHER SITE"), "D other Site vendor row changed");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotD = await capture("vb15D");

// E — New default: Pull All brings all eight rows, including both flagged
// rows, with their existing BILLED badges.
const eSetup = await configure({
  scenario: "vb15-mixed", label: "VB15-E pull everything",
  vendor: "VB15 MIXED SUPPLIER", from: "2026-09-01", to: "2026-09-30",
  expectedGroups: 5,
});
const eRows = await pullAll(8, "E");
const eBadges = await billedBadges();
assert(eBadges.length === 2, `E expected two BILLED badges, got ${JSON.stringify(eBadges)}`);
assert(eBadges.some(badge => badge.includes("VB15-APPROVED-001 - APPROVED")), "E approved BILLED badge missing");
assert(eBadges.some(badge => badge.includes("VB15-PAID-002 - PAID")), "E paid BILLED badge missing");
assert(eRows.length === 8, "E silently skipped already-billed rows");
const eState = await state();
const eFlags = duplicateFlagsForLength(eState, 8, "E");
assert(eFlags.length === 2 && new Set(eFlags.map(flag => flag.index)).size === 2, "E duplicate flags were not unique");
assert(await evaluate("document.querySelector('[data-testid=\"input-gst-equipment-rate\"]')?.value === '' || document.querySelector('[data-testid=\"input-gst-equipment-rate\"]')?.value === '0'"), "E GST default changed");
assert(await evaluate("document.querySelector('[data-testid=\"input-tds-rate\"]')?.value === '' || document.querySelector('[data-testid=\"input-tds-rate\"]')?.value === '0'"), "E TDS default changed");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotE = await capture("vb15E");

// F — Deliberate post-pull exclusion removes exactly the two flagged rows and
// leaves all six unbilled rows untouched.
await clickExcludeAlreadyBilled("F");
const fRows = await waitForExcluded(6, "F");
assert(!fRows.some(row => row.includes("EXCAVATOR") && row.includes("01-SEP-2026")), "F retained approved row after exclusion");
assert(!fRows.some(row => row.includes("SOIL") && row.includes("04-SEP-2026")), "F retained paid row after exclusion");
assert(fRows.filter(row => row.includes("EXCAVATOR")).length === 1, "F removed an unbilled equipment row");
assert(fRows.filter(row => row.includes("SOIL")).length === 1, "F removed an unbilled SOIL row");
assert(await evaluate("document.querySelector('[data-testid=\"input-gst-equipment-rate\"]')?.value === '' || document.querySelector('[data-testid=\"input-gst-equipment-rate\"]')?.value === '0'"), "F exclusion changed GST default");
assert(await evaluate("document.querySelector('[data-testid=\"input-tds-rate\"]')?.value === '' || document.querySelector('[data-testid=\"input-tds-rate\"]')?.value === '0'"), "F exclusion changed TDS default");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotF = await capture("vb15F");

// G — Grouped pulls also include flagged rows. Exclude once, pull another
// group, and exclude again to prove the action remains repeatable.
await configure({
  scenario: "vb15-mixed", label: "VB15-G grouped pull",
  vendor: "VB15 MIXED SUPPLIER", from: "2026-09-01", to: "2026-09-30",
  expectedGroups: 5,
});
await clickTestId("button-pull-group-eq_EXCAVATOR_HRS");
const gEquipmentRows = await waitForRows(2, "G equipment group");
assert(gEquipmentRows.filter(row => row.includes("EXCAVATOR")).length === 2, "G equipment group did not pull all rows");
assert((await billedBadges()).length === 1, "G equipment group did not retain approved badge");
await clickExcludeAlreadyBilled("G equipment exclusion");
await waitForExcluded(1, "G equipment exclusion");
await clickTestId("button-pull-group-desc_material_SOIL_MT");
const gMaterialRows = await waitForRows(3, "G later material group");
assert(gMaterialRows.filter(row => row.includes("SOIL")).length === 2, "G later material group did not pull both rows");
assert((await billedBadges()).length === 1, "G later group did not expose paid badge");
await clickExcludeAlreadyBilled("G later exclusion");
const gFinalRows = await waitForExcluded(2, "G later exclusion");
assert(gFinalRows.filter(row => row.includes("SOIL")).length === 1, "G later exclusion removed unbilled SOIL");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotG = await capture("vb15G");

// H — Clean vendor/period: Pull All remains normal and there is no exclusion
// action when no line is BILLED.
await configure({
  scenario: "vb15-clean", label: "VB15-H clean normal pull",
  vendor: "VB15 CLEAN SUPPLIER", from: "2026-09-01", to: "2026-09-30",
  expectedGroups: 5,
});
const hRows = await pullAll(8, "H");
assert((await billedBadges()).length === 0, "H clean pull displayed a BILLED badge");
assert(!(await excludeButtonInfo()) || (await excludeButtonInfo()).disabled, "H exposed an active exclusion action with no billed rows");
const hState = await state();
assert(duplicateFlagsForLength(hState, 8, "H").length === 0, "H clean duplicate response was not empty");
assert(await evaluate("document.querySelector('[data-testid=\"input-gst-equipment-rate\"]')?.value === '' || document.querySelector('[data-testid=\"input-gst-equipment-rate\"]')?.value === '0'"), "H GST default changed");
assert(await evaluate("document.querySelector('[data-testid=\"input-tds-rate\"]')?.value === '' || document.querySelector('[data-testid=\"input-tds-rate\"]')?.value === '0'"), "H TDS default changed");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotH = await capture("vb15H");

console.log(JSON.stringify({
  scenario: "VB-15 mirror-dedupe fixture and pull-everything-then-exclude browser evidence",
  evidence: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    fixtureApiWrites: "in-memory fetch mock only",
    part1Limitation: "The JCB mirror rows and patched response are fixture evidence; backend storage behavior requires the main worker's read-only production check and behavioral test.",
    exactCase: {
      equipmentId: 45,
      equipmentName: "JCB VISWANATH BODAPALLY",
      dprLogId: 917,
      mirrorPlantUsageId: 228,
      date: "2026-08-31",
      hours: 5.4,
      dieselLitres: 10,
      authoritativeSource: "SITE DPR",
    },
    fixtureContracts: ["vb15-part1-jcb", "vb15-other-plant", "vb15-other-site", "vb15-mixed", "vb15-clean"],
    screenshots: [screenshotA, screenshotB, screenshotC, screenshotD, screenshotE, screenshotF, screenshotG, screenshotH],
  },
  measured: {
    A_exactJcbRows: aRows.length,
    B_independentPlantRows: bRows.length,
    C_independentSiteRows: cRows.length,
    D_otherPlantRows: dPlantRows.length,
    D_otherSiteRows: dSiteRows.length,
    E_pulledRows: eRows.length,
    E_billedBadges: eBadges.length,
    F_remainingRows: fRows.length,
    G_finalRows: gFinalRows.length,
    H_pulledRows: hRows.length,
  },
  verified: {
    A_mirroredJcbUsageAppearsOnce: true,
    B_independentPlantSurvives: true,
    C_independentSiteSurvives: true,
    D_otherVendorsAndPeriodsSurvive: true,
    E_pullAllIncludesAlreadyBilled: true,
    F_excludeAlreadyBilledRows: true,
    G_groupPullThenRepeatExclude: true,
    H_cleanPullNormal: true,
    ratesGstTdsDefaultsUnchanged: true,
    noSchemaChangeInFixture: true,
  },
}, null, 2));
socket.close();