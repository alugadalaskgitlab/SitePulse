/*
 * VB-11 Fix browser evidence for the mounted production VendorBills component.
 *
 * Start the fixture Vite server on 4177 and keep Chromium's CDP endpoint on
 * 9222, then run this file.  The fixture owns every API response and records
 * the rate-card/duplicate-check requests in window.__VB09Fixture; no database
 * writes or production API calls are involved.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

// main.tsx contains the same temporary baseline import used by the existing
// VB-09/VB-10 browser verifiers.  Generate it from the committed production
// component only for Vite's module graph; it is removed on exit.
const baselineModulePath = path.join(fixtureDir, "baseline-head.tsx");
writeFileSync(baselineModulePath, execFileSync("git", ["show", "HEAD:client/src/pages/VendorBills.tsx"], {
  cwd: process.cwd(),
  encoding: "utf8",
}));
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

const waitFor = async (expression, label, attempts = 180) => {
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
const bodyText = () => evaluate("document.body.innerText");

// Serialize in the page before crossing CDP.  Returning the live fixture
// object directly can hit Chromium's object-reference chain limit after the
// UI has accumulated several pulled rows.
const fixtureState = async () => {
  const serialized = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return serialized ? JSON.parse(serialized) : null;
};

const hasTestId = (testId) => evaluate(`!!document.querySelector('[data-testid=${quote(testId)}]')`);

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click enabled [data-testid=${testId}]`);
};

const clickOption = async (label) => {
  const clicked = await evaluate(`(() => {
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find(candidate => candidate.textContent?.trim() === ${quote(label)});
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(clicked, `Could not select option ${label}`);
};

const selectBillType = async (label) => {
  await clickTestId("select-bill-type");
  await waitFor("document.querySelectorAll('[role=\"option\"]').length > 0", `${label} bill-type menu`);
  await clickOption(label);
  await sleep(100);
};

const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};

const navigate = async (scenario, label) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `http://127.0.0.1:4177/?scenario=${encodeURIComponent(scenario)}` });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} vendor-bill list`);
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const groupRows = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="pull-group-"]')).map(row => ({
  id: row.getAttribute("data-testid"),
  text: row.textContent?.replace(/\\s+/g, " ").trim(),
  button: row.querySelector("button")?.textContent?.replace(/\\s+/g, " ").trim(),
  disabled: !!row.querySelector("button")?.disabled,
}))`);

const lineDescriptions = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="text-item-desc-"]'))
  .map(item => item.textContent?.replace(/\\s+/g, " ").trim())`);

const scrollToGroupedPull = async () => {
  await evaluate("document.querySelector('[data-testid^=\"pull-group-\"]')?.scrollIntoView({ block: 'center' })");
};

const configureBill = async ({
  scenario,
  label,
  billType,
  vendor,
  expectedGroups,
}) => {
  await navigate(scenario, label);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} form`);

  // This assertion deliberately records the current production default rather
  // than changing it.  The mixed case then opts into All Types explicitly so
  // its cross-category candidates are sourced by the real all-types path.
  const initialBillType = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  assert(initialBillType === "EQUIPMENT HIRE", `${label} changed the production default bill type: ${initialBillType}`);

  await setInput("input-period-from", "2026-09-01");
  await setInput("input-period-to", "2026-09-30");
  if (billType) await selectBillType(billType);

  await waitFor(`(() => {
    const button = document.querySelector('[data-testid="button-show-vendors"]');
    return !!button && !button.disabled;
  })()`, `${label} vendor discovery button`);
  await clickTestId("button-show-vendors");
  await waitFor(`!!document.querySelector('[data-testid="row-vendor-${vendor}"]')`, `${label} discovery row`);
  const discoveryBadges = await evaluate(`Array.from(document.querySelector('[data-testid="row-vendor-${vendor}"]')?.querySelectorAll('[data-testid^="badge-cat-"]') || []).map(badge => badge.textContent?.trim())`);
  assert(discoveryBadges.length > 0, `${label} vendor discovery categories are missing`);
  await clickTestId(`button-select-vendor-${vendor}`);
  await waitFor(`document.querySelector('[data-testid="input-vendor-name"]')?.value === ${quote(vendor)}`, `${label} selected vendor`);

  await waitFor(`document.querySelectorAll('[data-testid^="pull-group-"]').length === ${expectedGroups.length}`, `${label} grouped candidates`);
  return groupRows();
};

// Scenario A/B/C: all categories, two distinct materials, and a selective
// equipment pull followed by Pull All.
const mixedGroups = await configureBill({
  scenario: "vb11fix-multiple-materials-oils-and-equipment-transport-labour",
  label: "VB-11 mixed-materials",
  billType: "All Types (Combined)",
  vendor: "VB11 MIXED SUPPLIER",
  expectedGroups: [
    "pull-group-eq_EXCAVATOR_HRS",
    "pull-group-desc_material_SAND_MT",
    "pull-group-desc_material_SOIL_MT",
    "pull-group-transport_QUARRY_TRIP",
    "pull-group-lab_LAB_OPERATOR_MALE_HEAD-DAY",
  ],
});
const expectedMixedGroupCounts = {
  "pull-group-eq_EXCAVATOR_HRS": "2 ITEMS",
  "pull-group-desc_material_SAND_MT": "1 ITEM",
  "pull-group-desc_material_SOIL_MT": "2 ITEMS",
  "pull-group-transport_QUARRY_TRIP": "2 ITEMS",
  "pull-group-lab_LAB_OPERATOR_MALE_HEAD-DAY": "1 ITEM",
};
for (const [id, countText] of Object.entries(expectedMixedGroupCounts)) {
  const row = mixedGroups.find((candidate) => candidate.id === id);
  assert(row && row.text.includes(countText), `A: ${id} does not show ${countText}`);
}
assert(mixedGroups.length === 5, `A: expected five subgroup rows, got ${mixedGroups.length}`);
assert(!(await bodyText()).toUpperCase().includes("PULL OTHER ITEMS"), "A: old flat PULL OTHER ITEMS control is still visible");
assert((await lineDescriptions()).length === 0, "A: candidate rows landed before an explicit Pull");
await scrollToGroupedPull();
const mixedBeforePullImage = await capture("vb11fix-A-immediate-before-pull");

const preEquipmentState = await fixtureState();
await clickTestId("button-pull-group-eq_EXCAVATOR_HRS");
await waitFor("document.querySelectorAll('[data-testid^=\"text-item-desc-\"]').length === 2", "B equipment-only rows");
await waitFor("window.__VB09Fixture?.rateCardCalls.length >= 1", "B rate-card request");
await waitFor("window.__VB09Fixture?.duplicateChecks.length >= 1", "B duplicate check request");
await waitFor("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).every(input => input.value === '3500')", "B applied equipment rates");

const equipmentOnlyDescriptions = await lineDescriptions();
assert(equipmentOnlyDescriptions.length === 2 && equipmentOnlyDescriptions.every((description) => description.includes("EXCAVATOR")), "B selective pull added a non-equipment row");
const equipmentRates = await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).map(input => input.value)");
assert(equipmentRates.every((rate) => rate === "3500"), `B rate-card equipment values are ${JSON.stringify(equipmentRates)}`);
const billedBadges = await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"badge-billed-\"]')).map(badge => badge.textContent?.trim())");
assert(billedBadges.some((badge) => badge.includes("VB11-DUP-1")), "B duplicate-in-another-bill flag was not retained on the pulled row");

const afterEquipmentGroups = await groupRows();
const equipmentGroupAfterPull = afterEquipmentGroups.find((row) => row.id === "pull-group-eq_EXCAVATOR_HRS");
assert(equipmentGroupAfterPull?.disabled && equipmentGroupAfterPull.button === "✓ ADDED", "B equipment subgroup was not visibly marked Added");
for (const id of Object.keys(expectedMixedGroupCounts).filter((candidate) => candidate !== "pull-group-eq_EXCAVATOR_HRS")) {
  const row = afterEquipmentGroups.find((candidate) => candidate.id === id);
  assert(row && !row.disabled && row.button?.startsWith("PULL"), `B remaining subgroup ${id} was not preserved`);
}
const afterEquipmentState = await fixtureState();
assert(afterEquipmentState.rateCardCalls.length === preEquipmentState.rateCardCalls.length + 1, "B did not issue exactly one rate-card call");
assert(afterEquipmentState.duplicateChecks.length === preEquipmentState.duplicateChecks.length + 1, "B did not issue exactly one duplicate check");
assert(afterEquipmentState.duplicateFlags.at(-1)?.length === 1, "B duplicate-check response did not carry a flag");
await scrollToGroupedPull();
const mixedEquipmentImage = await capture("vb11fix-B-equipment-only");

await clickTestId("button-auto-populate");
await waitFor("document.querySelectorAll('[data-testid^=\"text-item-desc-\"]').length === 8", "C Pull All rows");
await waitFor("document.querySelectorAll('[data-testid^=\"pull-group-\"] button:disabled').length === 5", "C all subgroup Added states");
const allDescriptions = await lineDescriptions();
assert(allDescriptions.filter((description) => description.includes("EXCAVATOR")).length === 2, "C Pull All lost equipment rows");
assert(allDescriptions.filter((description) => description.includes("SOIL")).length === 2, "C Pull All lost one material subgroup");
assert(allDescriptions.filter((description) => description.includes("SAND")).length === 1, "C Pull All lost the second material subgroup");
assert(allDescriptions.filter((description) => description.includes("TIPPER TRUCK")).length === 2, "C Pull All lost transport rows");
assert(allDescriptions.filter((description) => description.includes("LABOUR OPERATOR")).length === 1, "C Pull All lost labour rows");
assert(!(await bodyText()).toUpperCase().includes("PULL ALL"), "C Pull All remained available after every candidate was added");
const afterAllState = await fixtureState();
assert(afterAllState.rateCardCalls.length === preEquipmentState.rateCardCalls.length + 2, "C Pull All did not issue the remaining rate-card call");
assert(afterAllState.duplicateChecks.length === preEquipmentState.duplicateChecks.length + 2, "C Pull All did not issue the remaining duplicate check");
assert(afterAllState.duplicateFlags.every((flags) => flags.length === 1), "C duplicate-check flags were not captured for each pull");
await scrollToGroupedPull();
const mixedPullAllImage = await capture("vb11fix-C-pull-all");

// Scenario D: one category still uses the grouped chooser, with one subgroup
// and one Pull button rather than reverting to the removed flat control.
const singleGroups = await configureBill({
  scenario: "singlecategory",
  label: "VB-11 single-category",
  vendor: "VB11 EQUIPMENT SUPPLIER",
  expectedGroups: ["pull-group-eq_ROLLER_HRS"],
});
assert(singleGroups.length === 1, `D: expected one subgroup, got ${singleGroups.length}`);
assert(singleGroups[0].text.includes("1 ITEM"), "D: single subgroup count is missing");
assert(singleGroups[0].button === "PULL 1", "D: single subgroup did not expose its own Pull action");
assert(!(await bodyText()).toUpperCase().includes("PULL OTHER ITEMS"), "D: old flat PULL OTHER ITEMS control is still visible");
await scrollToGroupedPull();
const singleBeforePullImage = await capture("vb11fix-D-single-category-before-pull");

await clickTestId("button-pull-group-eq_ROLLER_HRS");
await waitFor("document.querySelectorAll('[data-testid^=\"text-item-desc-\"]').length === 1", "D pulled single-category row");
await waitFor("document.querySelector('[data-testid=\"button-pull-group-eq_ROLLER_HRS\"]')?.textContent?.trim() === '✓ ADDED'", "D Added state");
await waitFor("document.querySelector('[data-testid=\"input-item-rate-0\"]')?.value === '2800'", "D single-category rate-card rate");
const singleState = await fixtureState();
assert(singleState.rateCardCalls.length === 1, "D single-category pull did not issue its rate-card request");
assert(singleState.duplicateChecks.length === 1 && singleState.duplicateFlags[0]?.length === 1, "D single-category duplicate check was not captured");
await scrollToGroupedPull();
const singleAfterPullImage = await capture("vb11fix-D-single-category-after-pull");

console.log(JSON.stringify({
  scenario: "VB-11 grouped/sub-grouped selective pull",
  contract: {
    source: "client/src/pages/VendorBills.tsx",
    groupingSeam: "groupRateItems -> candidatePullGroups",
    pullSource: "mapped auto-items before mapping into lineItems",
    flatControl: "absent from actual DOM in A and D",
    defaultBillType: "observed EQUIPMENT HIRE; not modified by fixture",
  },
  evidence: {
    productionDatabaseUsed: false,
    authBypassUsed: true,
    writes: "in-memory fetch mock only; rate-card and duplicate payloads captured on window.__VB09Fixture",
    screenshots: [mixedBeforePullImage, mixedEquipmentImage, mixedPullAllImage, singleBeforePullImage, singleAfterPullImage],
  },
  verified: {
    A_immediateGroupedCounts: mixedGroups,
    B_selectiveEquipmentOnly: true,
    B_rateCardsAndDuplicateFlags: true,
    B_remainingGroupsPreserved: true,
    C_pullAllEquivalent: true,
    D_singleCategory: true,
  },
  fixtureState: {
    mixedRateCardCalls: afterAllState.rateCardCalls.length,
    mixedDuplicateChecks: afterAllState.duplicateChecks.length,
    mixedDuplicateFlags: afterAllState.duplicateFlags,
    singleRateCardCalls: singleState.rateCardCalls.length,
    singleDuplicateChecks: singleState.duplicateChecks.length,
  },
}, null, 2));
socket.close();