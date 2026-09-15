/*
 * VB-17 browser evidence. This is fixture-only: all responses are served by
 * the isolated vb17 scenarios in main.tsx and no bill is saved.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence", "vb17");
mkdirSync(evidenceDir, { recursive: true });
const baselineHeadPath = path.join(fixtureDir, "baseline-head.tsx");
writeFileSync(baselineHeadPath, execFileSync("git", [
  "show", "HEAD:client/src/pages/VendorBills.tsx",
], { cwd: process.cwd(), encoding: "utf8" }));
const cleanup = () => {
  try { unlinkSync(baselineHeadPath); } catch { /* already absent */ }
};
process.on("exit", cleanup);

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error("Chromium did not expose a page target on CDP port 9222");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
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
    reject: error => reject(new Error(`${method}: ${error.message}`)),
  });
  socket.send(JSON.stringify({ id, method, params }));
});
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const quote = value => JSON.stringify(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const bodyText = () => evaluate("document.body.innerText");
const captureDetails = [];
const screenshot = async (name, equipmentId = 1701, targetSelector = null) => {
  const selector = targetSelector || `[data-testid="monthly-hire-${equipmentId}"]`;
  const target = await evaluate(`(() => {
    const element = document.querySelector(${quote(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "start", inline: "nearest" });
    window.scrollBy(0, -8);
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      height: rect.height,
      width: rect.width,
      fuel: !!element.querySelector('[data-testid="monthly-hire-excess-fuel-${equipmentId}"]'),
      text: element.innerText,
    };
  })()`);
  assert(target, `${name} screenshot target ${selector} missing`);
  await sleep(120);
  const layout = await cdp("Page.getLayoutMetrics");
  const viewportWidth = Math.ceil(
    layout.cssVisualViewport?.clientWidth ||
    layout.layoutViewport?.clientWidth ||
    1440,
  );
  const captureHeight = Math.min(900, Math.max(600, Math.ceil(target.height) + 24));
  const result = await cdp("Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: Math.max(0, Math.floor(target.top)), width: viewportWidth, height: captureHeight, scale: 1 },
  });
  const image = Buffer.from(result.data, "base64");
  const file = path.join(evidenceDir, `${name}.png`);
  writeFileSync(file, image);
  const visible = {
    monthlyCard: true,
    canonicalTaxableHeader: /Generated taxable \/ bill amount/i.test(target.text),
    grossHire: /Gross Hire/i.test(target.text),
    breakdownDeduction: /Breakdown Deduction/i.test(target.text),
    excessFuelConsumed: /Excess Fuel Consumed/i.test(target.text),
    originalSuggested: /Original suggested/i.test(target.text),
    netLine: /Net line \(pre-GST \/ TDS\)/i.test(target.text),
    hlcReconciliation: /HLC diesel reconciliation/i.test(target.text),
    historicalHsdRecovery: /HSD Recovery/i.test(target.text),
  };
  const detail = {
    name, file, selector, width: image.readUInt32BE(16), height: image.readUInt32BE(20),
    targetHeight: Math.ceil(target.height), visible,
  };
  captureDetails.push(detail);
  console.log(`Captured ${name}: ${detail.width}x${detail.height} ${selector} ${JSON.stringify(visible)}`);
  return file;
};
const clickTestId = async id => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(id)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click [data-testid=${id}]`);
};
const clickExact = async (text, label) => {
  const clicked = await evaluate(`(() => {
    const needle = ${quote(text.toLowerCase())};
    const element = Array.from(document.querySelectorAll("button,[role=button],[role=option]")).find(candidate =>
      !candidate.disabled && (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase() === needle);
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `${label || text} control not found`);
};
const clickContains = async (text, label) => {
  const clicked = await evaluate(`(() => {
    const needle = ${quote(text.toLowerCase())};
    const element = Array.from(document.querySelectorAll("button,[role=button],[role=option],summary")).find(candidate =>
      !candidate.disabled && (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase().includes(needle));
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `${label || text} control not found`);
};
const setInput = async (selector, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector(${quote(selector)});
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set ${selector}`);
};
const monthlyText = async equipmentId =>
  evaluate(`document.querySelector('[data-testid="monthly-hire-${equipmentId}"]')?.innerText || ""`);
const navigate = async (scenario, label) => {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:4177/plant/vendor-bills?scenario=${encodeURIComponent(scenario)}`,
  });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  // Vite resolves main.tsx's pre-existing guarded baseline import at
  // transform time; allow the cold production module graph to mount.
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`, 600);
};
const chooseEquipmentType = async label => {
  const type = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  if (type !== "EQUIPMENT HIRE") {
    await clickTestId("select-bill-type");
    await clickExact("EQUIPMENT HIRE", `${label} equipment type`);
  }
  assert(await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim() === 'EQUIPMENT HIRE'"), `${label} did not select Equipment Hire`);
};
const configureDraft = async (scenario, vendor, equipmentId, label) => {
  await navigate(scenario, label);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} form`);
  await chooseEquipmentType(label);
  await setInput('[data-testid="input-period-from"]', "2026-11-01");
  await setInput('[data-testid="input-period-to"]', "2026-11-03");
  await waitFor("!document.querySelector('[data-testid=\"button-show-vendors\"]')?.disabled", `${label} discovery`);
  await clickTestId("button-show-vendors");
  await waitFor(`!!document.querySelector('[data-testid=${quote(`row-vendor-${vendor}`)}]')`, `${label} vendor row`);
  await clickTestId(`button-select-vendor-${vendor}`);
  await waitFor(`document.querySelector('[data-testid="input-vendor-name"]')?.value === ${quote(vendor)}`, `${label} vendor selected`);
  await waitFor(`!!document.querySelector('[data-testid="monthly-hire-${equipmentId}"]')`, `${label} monthly group`);
  if (equipmentId === 1701) {
    await waitFor(`(document.querySelector('[data-testid="monthly-hire-${equipmentId}"]')?.innerText || '').includes('Expected:')`, `${label} diesel reconciliation`);
  }
};
const assertHlcReconciliation = async label => {
  const text = await monthlyText(1701);
  for (const expected of ["Expected: 24.00 L", "Actual: 56.00 L", "Excess: 32.00 L", "Recovery: ₹3,040.00"]) {
    assert(text.includes(expected), `${label} missing ${expected}`);
  }
};
const assertBreakdownLine = (text, label, { recovery, breakdown, net }) => {
  assert(/Excess Fuel Consumed/i.test(text), `${label} missing Excess Fuel Consumed line`);
  assert(text.includes("32") && text.includes("95"), `${label} missing original 32 L × ₹95 reference`);
  if (recovery !== undefined) assert(text.includes(recovery), `${label} missing recovery amount ${recovery}`);
  if (breakdown !== undefined) assert(text.includes(breakdown), `${label} missing Breakdown Deduction amount ${breakdown}`);
  if (net !== undefined) assert(text.includes(net), `${label} missing net line amount ${net}`);
};
const assertCanonicalTaxableHeader = async (equipmentId, amount, label) => {
  const group = await monthlyText(equipmentId);
  assert(/Generated taxable \/ bill amount/i.test(group), `${label} missing canonical Generated taxable / bill amount header`);
  const value = await evaluate(`document.querySelector('[data-testid="monthly-hire-taxable-${equipmentId}"]')?.textContent?.trim() || ""`);
  assert(value.includes(amount), `${label} canonical taxable/bill amount is not ${amount}: ${value}`);
};

// A — genuine HLC excess is visible before any decision.
await configureDraft("vb17-draft", "VB17 HLC HIRE", 1701, "A");
await assertHlcReconciliation("A");
const screenshotA = await screenshot("vb17A");

// B — accepting the suggested 32 L × ₹95 recovery must expose separate
// Gross/Breakdown/Excess Fuel/Net arithmetic, not just a collapsed net line.
await clickExact("Accept Suggested", "B Accept Suggested");
await waitFor(`/Excess Fuel Consumed/i.test(document.querySelector('[data-testid="monthly-hire-1701"]')?.innerText || '')`, "B breakdown");
const bText = await monthlyText(1701);
assertBreakdownLine(bText, "B", { recovery: "3,040", breakdown: "3,000", net: "2,960" });
assert(/Gross Hire/i.test(bText) && /9,000/.test(bText), "B missing Gross Hire ₹9,000");
assert(await evaluate("!!document.querySelector('[data-testid=\"monthly-hire-excess-fuel-1701\"]')"), "B fuel line data-testid missing");
const bFuelMarkup = await evaluate("document.querySelector('[data-testid=\"monthly-hire-excess-fuel-1701\"]')?.innerText || ''");
assert(/Excess Fuel Consumed/i.test(bFuelMarkup) && /32\.00 L/.test(bFuelMarkup) && /₹95\.00/.test(bFuelMarkup), "B fuel data-testid does not expose qty × applicable rate");
await assertCanonicalTaxableHeader(1701, "2,960", "B");
const screenshotB = await screenshot("vb17B");

// C — edit the applied amount while retaining the original suggested qty ×
// rate as a visible reference.
await clickExact("Edit", "C Edit recovery");
await waitFor(`!!document.querySelector('[data-testid="monthly-hire-1701"] input[placeholder*="Final recovery"]')`, "C recovery input");
await setInput('[data-testid="monthly-hire-1701"] input[placeholder*="Final recovery"]', 500);
await waitFor(`(document.querySelector('[data-testid="monthly-hire-1701"]')?.innerText || '').includes('500')`, "C edited amount");
const cText = await monthlyText(1701);
assertBreakdownLine(cText, "C", { recovery: "500", breakdown: "3,000", net: "5,500" });
assert(await evaluate("!!document.querySelector('[data-testid=\"monthly-hire-excess-fuel-1701\"]')"), "C fuel line data-testid missing");
const cFuelMarkup = await evaluate("document.querySelector('[data-testid=\"monthly-hire-excess-fuel-1701\"]')?.innerText || ''");
assert(/Original suggested:\s*₹3,040\.00/i.test(cFuelMarkup), "C fuel data-testid lost original suggested recovery");
await assertCanonicalTaxableHeader(1701, "5,500", "C");
const screenshotC = await screenshot("vb17C");

// D — No Recovery removes/zeros only the fuel line; the separate breakdown
// deduction remains and net returns to 9,000 − 3,000 = 6,000.
await clickExact("No Recovery", "D No Recovery");
await waitFor(`!(document.querySelector('[data-testid="monthly-hire-1701"]')?.innerText || '').includes('500')`, "D removed edit amount");
const dText = await monthlyText(1701);
const dFuelLine = dText.match(/Excess Fuel Consumed[\\s\\S]{0,120}/i)?.[0] || "";
const dFuelElement = await evaluate("document.querySelector('[data-testid=\"monthly-hire-excess-fuel-1701\"]')?.innerText || ''");
assert(!dFuelElement && !dFuelLine, "D Excess Fuel Consumed was not removed/zeroed");
assert(/Breakdown Deduction/i.test(dText) && dText.includes("3,000") && dText.includes("6,000"), "D separate breakdown/net arithmetic missing");
await assertCanonicalTaxableHeader(1701, "6,000", "D");
const screenshotD = await screenshot("vb17D");

// E — contractor/vendor diesel scope does not expose HLC recovery controls or
// an Excess Fuel Consumed line.
await configureDraft("vb17-vendor", "VB17 VENDOR HIRE", 1702, "E");
const eText = await monthlyText(1702);
assert(!/Excess Fuel Consumed/i.test(eText), "E vendor diesel scope exposed Excess Fuel Consumed");
assert(!/HLC diesel reconciliation/i.test(eText), "E vendor diesel scope exposed HLC reconciliation");
const screenshotE = await screenshot("vb17E", 1702);

// F — legacy/historical edit retains the old HSD Recovery label and does not
// get the new monthly auto-card label.
await navigate("vb17-historical", "F historical");
await clickTestId("card-bill-1703");
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "F detail");
await clickTestId("button-edit-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "F historical form");
const fText = await bodyText();
assert(/HSD Recovery/i.test(fText), "F historical block lost HSD Recovery label");
assert(!/Excess Fuel Consumed/i.test(fText), "F historical block was renamed to Excess Fuel Consumed");
const screenshotF = await screenshot("vb17F", 1701, '[data-testid="equipment-hire-straight-form"]');

// G — grace is per bill. With zero grace the breakdown remains a distinct
// ₹3,000 line; increasing grace to one removes that deduction while leaving
// the gross/net arithmetic visible.
await configureDraft("vb17-draft", "VB17 HLC HIRE", 1701, "G");
const gInitial = await monthlyText(1701);
assert(/Breakdown Deduction/i.test(gInitial) && gInitial.includes("3,000"), "G zero-grace breakdown deduction missing");
await setInput('[data-testid="input-monthly-grace-1701"]', 1);
await waitFor(`(document.querySelector('[data-testid="monthly-hire-taxable-1701"]')?.textContent || '').includes('9,000.00')`, "G grace-one taxable amount");
const gText = await monthlyText(1701);
assert(!/Breakdown Deduction/i.test(gText), "G grace-one did not remove the zero breakdown deduction line");
assert(gText.includes("Gross Hire") && gText.includes("9,000"), "G grace-one did not drop deduction/net as expected");
assert(!await evaluate("!!document.querySelector('[data-testid=\"monthly-hire-excess-fuel-1701\"]')"), "G grace-one unexpectedly changed fuel scope");
await assertCanonicalTaxableHeader(1701, "9,000", "G");
const screenshotG = await screenshot("vb17G");

console.log(JSON.stringify({
  scenario: "VB-17 monthly accepted Excess Fuel Consumed and breakdown evidence",
  evidence: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    fixtureApiWrites: "in-memory fetch mock only",
    schemaChanged: false,
    applicableRateSource: "Fixture diesel_rate activity at ₹95; production exposes the computed applicableRate",
    screenshots: [screenshotA, screenshotB, screenshotC, screenshotD, screenshotE, screenshotF, screenshotG],
    captureDetails,
  },
  arithmetic: {
    grossHire: 9000,
    breakdownDeductionWithGraceZero: 3000,
    actualDiesel: 56,
    expectedDiesel: 24,
    excessLitres: 32,
    applicableRate: 95,
    suggestedRecovery: 3040,
    editedRecovery: 500,
    acceptedNetLine: 2960,
    editedNetLine: 5500,
    noRecoveryNetLine: 6000,
    graceOneNetLine: 9000,
  },
  verified: {
    A_hlcReconciliation: true,
    B_acceptSuggestedSeparateBreakdown: true,
    C_editRetainsSuggestedReference: true,
    D_noRecovery: true,
    E_vendorDieselHidesRecovery: true,
    F_historicalHsdRecoveryUnchanged: true,
    G_breakdownGracePerBill: true,
    vb16CalendarStillOwnedByVB16: true,
    noCustomerWrites: true,
  },
}, null, 2));
socket.close();