/*
 * VB-13 browser evidence for the mounted production VendorBills component.
 *
 * This verifier deliberately uses the real component and the existing VB-11
 * and VB-10 response contracts.  Start the fixture on 4177 and Chromium's CDP
 * endpoint on 9222 before running this file; it never starts either server.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

// main.tsx keeps the same conditional baseline import as the other browser
// verifiers.  The module is only needed for Vite's module graph and is removed
// when this verifier exits.
const baselineModulePath = path.join(fixtureDir, "baseline-head.tsx");
if (!existsSync(baselineModulePath)) {
  writeFileSync(baselineModulePath, execFileSync("git", [
    "show", "HEAD:client/src/pages/VendorBills.tsx",
  ], { cwd: process.cwd(), encoding: "utf8" }));
}
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

const waitFor = async (expression, label, attempts = 200) => {
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

const navigate = async (route, scenario, label) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  const search = `?scenario=${encodeURIComponent(scenario)}`;
  await cdp("Page.navigate", { url: `http://127.0.0.1:4177${route}${search}` });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} vendor-bill list`);
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const fixtureState = async () => {
  const serialized = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return serialized ? JSON.parse(serialized) : null;
};

/*
 * Keep the assertion at the DOM contract boundary.  The initial blank seed is
 * intentionally not read from React state: a deliberate manual ADD ITEM is
 * allowed to render the same empty input shape.  Pulled/generated lines use
 * text-item-desc and therefore have no editable description input.
 */
const lineItemDom = () => evaluate(`(() => ({
  editable: Array.from(document.querySelectorAll('[data-testid^="input-item-desc-"]')).map(input => ({
    id: input.getAttribute("data-testid"),
    value: input.value,
    qty: document.querySelector('[data-testid="input-item-qty-' + input.getAttribute("data-testid").split("-").pop() + '"]')?.value ?? null,
    rate: document.querySelector('[data-testid="input-item-rate-' + input.getAttribute("data-testid").split("-").pop() + '"]')?.value ?? null,
  })),
  generated: Array.from(document.querySelectorAll('[data-testid^="text-item-desc-"]'))
    .map(item => item.textContent?.replace(/\\s+/g, " ").trim()),
  categories: Array.from(document.querySelectorAll('[data-testid^="badge-category-"]'))
    .map(item => item.textContent?.trim()),
}))()`);

const assertPulledRows = async (label, expectedCount, expectedCategories) => {
  await waitFor(
    `document.querySelectorAll('[data-testid^="text-item-desc-"]').length >= ${expectedCount}`,
    `${label} generated rows`,
  );
  // This is intentionally a DOM comparison, not an assertion against the
  // private initialBlank flag.  It leaves a manually-added empty row valid in
  // F while proving the automatic seed disappeared in C/D/E.
  await waitFor(
    "document.querySelectorAll('[data-testid^=\"input-item-desc-\"]').length === 0",
    `${label} automatic blank row removal`,
  );
  const dom = await lineItemDom();
  assert(dom.generated.length >= expectedCount, `${label} generated row count was ${dom.generated.length}`);
  assert(dom.editable.length === 0, `${label} retained an editable blank line: ${JSON.stringify(dom.editable)}`);
  if (expectedCategories) {
    for (const category of expectedCategories) {
      assert(dom.categories.includes(category), `${label} did not render ${category} category evidence: ${JSON.stringify(dom.categories)}`);
    }
  }
  return dom;
};

const openFreshBill = async ({ route, scenario, label }) => {
  await navigate(route, scenario, label);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} fresh form`);
  const billType = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  assert(
    billType === "All Types (Combined)",
    `${label} fresh bill type was ${JSON.stringify(billType)}, not All Types (Combined)`,
  );
  return { billType };
};

const vendorSelectCreate = async ({
  route,
  scenario,
  label,
  from,
  to,
  vendor,
}) => {
  const fresh = await openFreshBill({ route, scenario, label });
  await setInput("input-period-from", from);
  await setInput("input-period-to", to);
  await waitFor(`(() => {
    const button = document.querySelector('[data-testid="button-show-vendors"]');
    return !!button && !button.disabled;
  })()`, `${label} vendor discovery button`);
  await clickTestId("button-show-vendors");
  await waitFor(`!!document.querySelector('[data-testid="row-vendor-${vendor}"]')`, `${label} discovery row`);
  await clickTestId(`button-select-vendor-${vendor}`);
  await waitFor(
    `document.querySelector('[data-testid="input-vendor-name"]')?.value === ${quote(vendor)}`,
    `${label} selected vendor`,
  );
  // Every C/D/E pull is intentionally sourced by the untouched All Types
  // default.  This also guards against a route-specific or query-specific
  // billType mutation without ever manually changing the Select UI.
  await waitFor(
    `window.__VB09Fixture?.requests.some(request => request.path.includes('/api/vendor-bills/auto-items') && request.path.includes('billType=all'))`,
    `${label} all-types auto-item request`,
  );
  return fresh;
};

const scrollToLineItems = async () => {
  await evaluate("document.querySelector('[data-testid^=\"text-item-desc-\"]')?.scrollIntoView({ block: 'center' })");
};

const mixedScenario = "vb11fix-multiple-materials-oils-and-equipment-transport-labour";
const sharedPeriod = { from: "2026-09-01", to: "2026-09-30" };
const screenshots = {};
const results = {};

// A — the main New Bill entry point must open All Types without any type
// interaction.  Capture this immediately, before setting period/vendor fields.
await openFreshBill({
  route: "/plant/vendor-bills",
  scenario: mixedScenario,
  label: "VB13-A main New Bill",
});
screenshots.A = await capture("vb13A");
results.A = { entryPoint: "mainNewBill", freshBillType: "All Types (Combined)" };

// B — the finance route is the second mounted VendorBills entry point.  The
// VB-10 monthly equipment fixture also proves generated monthly lines clear
// the untouched seed instead of leaving a blank row above them.
await vendorSelectCreate({
  route: "/finance/vendor-bills",
  scenario: "vb10",
  label: "VB13-B finance vendor selection",
  from: "2026-05-01",
  to: "2026-05-31",
  vendor: "VB10 EQUIPMENT HIRE",
});
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "VB13-B monthly summary");
await waitFor(
  "document.querySelectorAll('[data-testid^=\"monthly-hire-\"]:not([data-testid=\"monthly-hire-auto-summary\"])').length === 3",
  "VB13-B three monthly hire groups",
);
const monthlyDom = await assertPulledRows("VB13-B monthly generated lines", 3, ["EQUIP"]);
assert(monthlyDom.generated.some(description => description.includes("MONTHLY HLC EXCAVATOR")), "VB13-B monthly HLC line is missing");
screenshots.B = await capture("vb13B");
results.B = {
  entryPoint: "vendorSelectCreate",
  route: "/finance/vendor-bills",
  freshBillType: "All Types (Combined)",
  monthlyGeneratedRows: monthlyDom.generated.length,
  editableDescriptionInputsAfterVendorSelection: monthlyDom.editable.length,
};

// Each remaining case opens a separate fresh bill with the untouched All Types
// default.  The category-specific cases click only the existing grouped Pull
// action, never the bill-type Select.
const openMixedBill = async (label) => vendorSelectCreate({
  route: "/plant/vendor-bills",
  scenario: mixedScenario,
  label,
  ...sharedPeriod,
  vendor: "VB11 MIXED SUPPLIER",
});

// C — equipment-only grouped pull.
await openMixedBill("VB13-C equipment-only");
await clickTestId("button-pull-group-eq_EXCAVATOR_HRS");
const equipmentDom = await assertPulledRows("VB13-C equipment-only", 2, ["EQUIP"]);
await scrollToLineItems();
screenshots.C = await capture("vb13C");
results.C = {
  pull: "equipment-only",
  generatedRows: equipmentDom.generated.length,
  editableDescriptionInputsAfterPull: equipmentDom.editable.length,
};

// D — material-only grouped pull.
await openMixedBill("VB13-D material-only");
await clickTestId("button-pull-group-desc_material_SAND_MT");
const materialDom = await assertPulledRows("VB13-D material-only", 1, ["MATL"]);
await scrollToLineItems();
screenshots.D = await capture("vb13D");
results.D = {
  pull: "material-only",
  generatedRows: materialDom.generated.length,
  editableDescriptionInputsAfterPull: materialDom.editable.length,
};

// E — sequential mixed pulls.  Check after every category, not only after the
// final row, so a later pull cannot hide a seed that survived an earlier one.
await openMixedBill("VB13-E mixed sequential");
await clickTestId("button-pull-group-eq_EXCAVATOR_HRS");
const mixedEquipmentDom = await assertPulledRows("VB13-E equipment step", 2, ["EQUIP"]);
await clickTestId("button-pull-group-desc_material_SOIL_MT");
const mixedMaterialDom = await assertPulledRows("VB13-E material step", 4, ["EQUIP", "MATL"]);
await clickTestId("button-pull-group-transport_QUARRY_TRIP");
const mixedTransportDom = await assertPulledRows("VB13-E transport step", 6, ["EQUIP", "MATL", "TRNS"]);
await scrollToLineItems();
screenshots.E = await capture("vb13E");
results.E = {
  pull: "equipment + material + transport sequential",
  stepRows: [mixedEquipmentDom.generated.length, mixedMaterialDom.generated.length, mixedTransportDom.generated.length],
  editableDescriptionInputsAfterPull: mixedTransportDom.editable.length,
};

// F — a deliberate ADD ITEM remains valid on an otherwise empty fresh bill.
await openFreshBill({
  route: "/plant/vendor-bills",
  scenario: mixedScenario,
  label: "VB13-F manual Add Item",
});
const beforeManualAdd = await lineItemDom();
await clickTestId("button-add-item");
await waitFor("document.querySelectorAll('[data-testid^=\"input-item-desc-\"]').length === 1", "VB13-F manual row");
const afterManualAdd = await lineItemDom();
assert(afterManualAdd.generated.length === 0, "VB13-F unexpectedly pulled generated rows");
assert(afterManualAdd.editable.length === 1, "VB13-F manual ADD ITEM did not leave one editable row");
assert(beforeManualAdd.editable.length === 1, "VB13-F fresh form did not expose the empty editor affordance");
screenshots.F = await capture("vb13F");
results.F = {
  action: "manualAdd",
  freshBillType: "All Types (Combined)",
  editableDescriptionInputsBeforeAdd: beforeManualAdd.editable.length,
  editableDescriptionInputsAfterAdd: afterManualAdd.editable.length,
  generatedRows: afterManualAdd.generated.length,
};

console.log(JSON.stringify({
  scenario: "VB-13 fresh All Types default and automatic blank-row clearing",
  evidence: {
    productionDatabaseUsed: false,
    authBypassUsed: true,
    writes: "in-memory fetch mock only; no production API writes",
    fixtureContracts: ["vb11fix-multiple-materials-oils-and-equipment-transport-labour", "vb10"],
    routeCoverage: ["/plant/vendor-bills", "/finance/vendor-bills"],
    screenshots,
  },
  verified: results,
}, null, 2));
socket.close();