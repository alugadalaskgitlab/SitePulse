/*
 * VB-10 browser evidence for the mounted VendorBills component.
 *
 * Start the fixture's Vite server and Chromium/CDP in the same way as
 * verify.mjs, then run this file. Monthly availability lines remain automatic,
 * while VB-11 makes ordinary activity an explicit grouped Pull selection.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
// Vite resolves the conditional baseline import during module analysis even
// though this verifier never navigates to mode=baseline. Keep the same
// temporary baseline module contract as the VB-09 verifier so a prior
// verifier cleanup cannot leave main.tsx untransformable.
const baselineModulePath = path.join(fixtureDir, "baseline-head.tsx");
if (!existsSync(baselineModulePath)) {
  writeFileSync(baselineModulePath, execFileSync("git", ["show", "HEAD:client/src/pages/VendorBills.tsx"], {
    cwd: process.cwd(), encoding: "utf8",
  }));
}
process.on("exit", () => {
  try { unlinkSync(baselineModulePath); } catch { /* already absent */ }
});

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((target) => target.type === "page");
if (!page) throw new Error("Chromium did not expose a page target");
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
      expression, returnByValue: true, awaitPromise: true,
    });
  } catch (error) {
    throw new Error(`Runtime.evaluate failed for ${expression.slice(0, 240)}: ${error.message}`);
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
const hasTestId = (testId) => evaluate(`!!document.querySelector('[data-testid=${quote(testId)}]')`);
// Returning the raw state object over CDP hits Chromium's object-reference
// chain limit after frozen working sheets are captured. Serialize inside the
// page, then parse the same captured fixture contract in Node.
const fixtureState = async () => {
  const serialized = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return serialized ? JSON.parse(serialized) : null;
};

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click [data-testid=${testId}]`);
};
const clickButtonText = async (text, rootSelector = null) => {
  const root = rootSelector ? `document.querySelector(${quote(rootSelector)})` : "document";
  const clicked = await evaluate(`(() => {
    const root = ${root};
    if (!root) return false;
    const element = Array.from(root.querySelectorAll("button"))
      .find(candidate => candidate.textContent?.trim() === ${quote(text)});
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click button ${text}${rootSelector ? ` in ${rootSelector}` : ""}`);
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
const clickOption = async (label) => {
  const clicked = await evaluate(`(() => {
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find(candidate => candidate.textContent?.trim() === ${quote(label)});
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(clicked, `Could not select ${label}`);
};
const selectBillType = async (label) => {
  await clickTestId("select-bill-type");
  await waitFor("document.querySelectorAll('[role=\"option\"]').length > 0", `${label} bill-type menu`);
  await clickOption(label);
  await sleep(100);
};
const selectVendor = async () => {
  await clickTestId("button-show-vendors");
  await waitFor("!!document.querySelector('[data-testid=\"row-vendor-VB10 EQUIPMENT HIRE\"]')", "VB-10 discovery row");
  await clickTestId("button-select-vendor-VB10 EQUIPMENT HIRE");
  await waitFor("document.querySelector('[data-testid=\"input-vendor-name\"]')?.value === 'VB10 EQUIPMENT HIRE'", "VB-10 selected vendor");
  await waitFor("document.querySelectorAll('[data-testid^=\"monthly-hire-\"]:not([data-testid=\"monthly-hire-auto-summary\"])').length === 3", "three monthly groups");
};
const navigate = async (scenario, name) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `http://127.0.0.1:4177/?scenario=${scenario}` });
  await waitFor("document.readyState === 'complete'", `${name} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${name} list`);
};
const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const limitations = [];

// New mixed-basis bill: 90k full month, 34k 17-day overlap, and a zero-log
// monthly machine must all be present. The hourly ordinary line remains a
// grouped candidate until its explicit VB-11 Pull action.
await navigate("vb10", "VB-10 mixed-basis");
await clickTestId("button-new-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "VB-10 form");
await setInput("input-period-from", "2026-05-01");
await setInput("input-period-to", "2026-05-31");
await selectVendor();
await waitFor("document.body.innerText.includes('22.00 L')", "contractor advance preview");
let text = await bodyText();
assert(text.includes("₹90,000.00"), "full-month monthly gross is missing");
assert(text.includes("₹34,000.00"), "mid-month prorated gross is missing");
assert(text.includes("₹30,000.00"), "zero-activity monthly gross is missing");
assert(text.includes("Expected:") && text.includes("50.00 L") && text.includes("Actual:") && text.includes("55.00 L"), "HLC expected/actual reconciliation is missing");
assert(text.includes("Recovery:") && text.includes("₹525.00"), "weighted HSD recovery preview is missing");
assert(text.includes("22.00 L") && text.includes("period-weighted purchased diesel rate"), "hourly and monthly contractor advances are not combined");

// Calendar, grace and one explicit per-day override.  The grace value must
// survive the override render (a common reset-loop failure).
await setInput("input-monthly-grace-1001", "1");
await evaluate(`(() => {
  const root = document.querySelector('[data-testid="monthly-hire-1001"]');
  const summary = Array.from(root?.querySelectorAll("summary") || [])
    .find(item => item.textContent?.includes("View activity / breakdown calendar"));
  summary?.click();
  return !!summary;
})()`);
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-1001\"] details[open]')", "HLC calendar open");
const calendarRowCount = await evaluate("document.querySelectorAll('[data-testid=\"monthly-hire-1001\"] details[open] > div > div').length");
assert(calendarRowCount >= 31, `calendar has only ${calendarRowCount} rows`);
const calendarSelectOpened = await evaluate(`(() => {
  const root = document.querySelector('[data-testid="monthly-hire-1001"] details[open]');
  const trigger = Array.from(root?.querySelectorAll('[role="combobox"]') || [])
    .find(candidate => candidate.parentElement?.parentElement?.parentElement?.textContent?.includes("20-MAY-2026"));
  trigger?.click();
  return !!trigger;
})()`);
assert(calendarSelectOpened, "calendar per-day decision controls are missing");
await clickOption("Half day");
await waitFor("document.querySelector('[data-testid=\"input-monthly-grace-1001\"]')?.value === '1'", "grace value after calendar override");
assert(await evaluate("!!document.querySelector('[data-testid=\"monthly-hire-1001\"] details[open]')"), "calendar closed/reset after day override");

// Exercise all three HLC disposition controls, leaving the final bill in the
// explicit no-recovery state.  Edit gets an entered reason before it is
// replaced by No Recovery, proving neither choice is silently implicit.
const hlcRoot = '[data-testid="monthly-hire-1001"]';
await clickButtonText("Accept Suggested", hlcRoot);
await clickButtonText("Edit", hlcRoot);
const recoveryInputs = await evaluate(`Array.from(document.querySelector(${quote(hlcRoot)})?.querySelectorAll('input[type="number"]') || []).map(input => input.value)`);
assert(recoveryInputs.length >= 2, "HLC recovery edit amount control is missing");
await evaluate(`(() => {
  const root = document.querySelector(${quote(hlcRoot)});
  const input = Array.from(root?.querySelectorAll('input[type="number"]') || []).at(-1);
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "450");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await evaluate(`(() => {
  const root = document.querySelector(${quote(hlcRoot)});
  const input = Array.from(root?.querySelectorAll("input") || []).find(item => item.placeholder?.toLowerCase().includes("reason"));
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "VB10 REVIEW CAP");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await clickButtonText("No Recovery", hlcRoot);

const hourlyPullGroup = "button-pull-group-eq_HOURLY_CONTRACTOR_LOADER_HRS";
await waitFor(`!!document.querySelector('[data-testid=${quote(hourlyPullGroup)}]')`, "VB-11 hourly pull group");
assert(!(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"text-item-desc-\"]')).some(item => item.textContent?.includes('HOURLY CONTRACTOR LOADER'))")), "hourly activity was auto-loaded instead of remaining selectable");
await clickTestId(hourlyPullGroup);
await waitFor("Array.from(document.querySelectorAll('[data-testid^=\"text-item-desc-\"]')).some(item => item.textContent?.includes('HOURLY CONTRACTOR LOADER'))", "pulled hourly activity");

// Category switch must remove generated groups and rows, and switching back
// must reseed the current period without retaining stale monthly groups.
await selectBillType("MATERIAL SUPPLY");
await waitFor("!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "generated monthly summary removed on category switch");
assert(!(await hasTestId("monthly-hire-1001")), "HLC monthly group survived material category switch");
await selectBillType("EQUIPMENT HIRE");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "monthly groups reseeded after category switch");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-1001\"] input[type=\"number\"]')", "contractor edit controls after category switch");
const firstGroupNumberInputs = await evaluate("Array.from(document.querySelector('[data-testid=\"monthly-hire-1001\"]')?.querySelectorAll('input[type=\"number\"]') || []).map(input => input.value)");
assert(firstGroupNumberInputs.length >= 2, "contractor advance editor was not restored after category switch");
assert(Math.abs(Number(firstGroupNumberInputs[1]) - 2163.33) < 0.01, "contractor advance was not reseeded for the restored vendor/period/category");
// Keep the edit path covered after proving that category restoration reseeded
// the bill-level suggestion into the first monthly hire group.
await evaluate(`(() => {
  const root = document.querySelector('[data-testid="monthly-hire-1001"]');
  const inputs = Array.from(root?.querySelectorAll('input[type="number"]') || []);
  const input = inputs[1];
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "2163.33");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await evaluate(`(() => {
  const root = document.querySelector('[data-testid="monthly-hire-1001"]');
  const input = Array.from(root?.querySelectorAll("input") || []).find(item => item.placeholder === "Reason / reference");
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "VB10 CONTRACTOR DIESEL ADVANCE");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
// The switch intentionally creates a fresh seed. Re-enter the bill-specific
// review choices on that fresh seed before saving, proving they are explicit
// payload state rather than stale hidden controls.
await setInput("input-monthly-grace-1001", "1");
await evaluate(`(() => {
  const root = document.querySelector('[data-testid="monthly-hire-1001"]');
  const summary = Array.from(root?.querySelectorAll("summary") || [])
    .find(item => item.textContent?.includes("View activity / breakdown calendar"));
  summary?.click();
  return !!summary;
})()`);
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-1001\"] details[open]')", "fresh HLC calendar open");
await evaluate(`(() => {
  const root = document.querySelector('[data-testid="monthly-hire-1001"] details[open]');
  const trigger = Array.from(root?.querySelectorAll('[role="combobox"]') || [])
    .find(candidate => candidate.parentElement?.parentElement?.parentElement?.textContent?.includes("20-MAY-2026"));
  trigger?.click();
  return !!trigger;
})()`);
await clickOption("Half day");
await clickButtonText("No Recovery", hlcRoot);
await setInput("input-gst-equipment-rate", "18");
await setInput("input-tds-rate", "2");
const mixedImage = await capture("vb10-mixed-monthly-hourly-calendar");

const beforeSave = await fixtureState();
const createdBefore = beforeSave.createdPayloads.length;
await clickTestId("button-save-bill");
await waitFor(`window.__VB09Fixture?.createdPayloads.length === ${createdBefore + 1}`, "VB-10 create payload");
const createdState = await fixtureState();
const createdPayload = createdState.createdPayloads.at(-1);
assert(createdPayload.hireGroups?.length === 3, `expected three monthly hire groups, got ${createdPayload.hireGroups?.length}`);
const hlcGroup = createdPayload.hireGroups.find((group) => Number(group.equipmentId) === 1001);
const createdSnapshot = createdState.createdSnapshots.at(-1);
const hlcStatement = createdSnapshot?.hireStatements?.find((statement) => Number(statement.equipmentId) === 1001);
assert(hlcGroup?.breakdownGraceDays === 1, "bill-specific breakdown grace was not captured");
assert(hlcGroup?.dieselRecoveryDecision === "ignore" && hlcGroup?.dieselRecoveryFinalAmount === 0, "final No Recovery decision was not captured");
assert(hlcGroup?.exceptionDecisions?.some((decision) => Number(decision.sourceId) === 1603 && decision.decision === "half_day"), "per-day calendar override was not captured");
assert(Number(hlcGroup?.adjustments?.otherDebit) > 0, "contractor diesel advance edit was not captured");
assert(createdPayload.items.some((item) => String(item.source || "").startsWith("auto:") && item.description.includes("HOURLY CONTRACTOR LOADER")), "hourly auto-loaded item was not captured");
assert(hlcStatement?.calculationSnapshot?.billingIntegration === "vb10_automatic", "saved VB10 integration marker is missing");
assert(Number(hlcStatement?.calculationSnapshot?.adjustments?.breakdownDeduction) === 4_500, "duplicate breakdown rows or bill grace changed the saved deduction");

// Detail, saved edit and final approval prove that the fixture retains a
// frozen statement snapshot rather than just the transient form calculation.
await waitFor("document.querySelectorAll('[data-testid^=\"card-bill-\"]').length >= 1", "created VB-10 list card");
const cardId = await evaluate("Number(document.querySelector('[data-testid^=\"card-bill-\"]')?.getAttribute('data-testid')?.replace(/\\D/g, ''))");
await clickTestId(`card-bill-${cardId}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "VB-10 detail");
text = await bodyText();
assert(text.includes("EQUIPMENT HIRE CALCULATION SNAPSHOT"), "frozen hire snapshot is missing");
assert(text.includes("HSD ACTUAL / EXPECTED 55.00 / 50.00 L"), "frozen HLC actual/expected values are missing");
assert(text.includes("APPLICABLE WEIGHTED HSD RATE ₹105.00 / L"), "frozen weighted diesel rate is missing");
const detailImage = await capture("vb10-created-frozen-snapshot");
await clickTestId("button-edit-bill");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "saved VB-10 shared edit form");
assert(!(await hasTestId("equipment-hire-straight-form")), "VB10 marker incorrectly opened the historical straight-form editor");
await waitFor("Array.from(document.querySelectorAll('[data-testid^=\"text-item-desc-\"]')).some(item => item.textContent?.includes('HOURLY CONTRACTOR LOADER'))", "saved hourly item");
assert((await evaluate("document.querySelectorAll('[data-testid^=\"monthly-hire-\"]:not([data-testid=\"monthly-hire-auto-summary\"])').length")) === 3, "saved edit did not retain all monthly hire groups");
await selectBillType("All Types (Combined)");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "saved VB-10 all-types edit");
assert(await hasTestId("monthly-hire-1001"), "all-types edit dropped saved monthly hire groups");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"text-item-desc-\"]')).some(item => item.textContent?.includes('HOURLY CONTRACTOR LOADER'))"), "all-types edit dropped saved hourly activity");
await selectBillType("EQUIPMENT HIRE");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "saved VB-10 equipment edit restored");
await selectBillType("All Types (Combined)");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "saved VB-10 all-types round trip");
assert(await hasTestId("monthly-hire-1003"), "all-types round trip dropped saved crane group");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"text-item-desc-\"]')).some(item => item.textContent?.includes('HOURLY CONTRACTOR LOADER'))"), "all-types round trip dropped saved hourly activity");
await selectBillType("EQUIPMENT HIRE");
await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-auto-summary\"]')", "saved VB-10 equipment round trip restored");
await setInput("input-notes", "VB10 SAVED EDIT");
await clickTestId("button-save-bill");
await waitFor(`window.__VB09Fixture?.updatedPayloads.length >= 1`, "VB-10 update payload");
const updatedState = await fixtureState();
assert(updatedState.updatedPayloads.at(-1).payload.hireGroups?.length === 3, "saved edit did not retain hire groups");
await waitFor("!!document.querySelector('[data-testid^=\"card-bill-\"]')", "list after saved edit");
const updatedCardId = await evaluate("Number(document.querySelector('[data-testid^=\"card-bill-\"]')?.getAttribute('data-testid')?.replace(/\\D/g, ''))");
await clickTestId(`card-bill-${updatedCardId}`);
await waitFor("!!document.querySelector('[data-testid=\"button-advance-status\"]')", "verify status action");
await clickTestId("button-advance-status");
await waitFor("document.querySelector('[data-testid=\"badge-bill-status\"]')?.textContent?.trim() === 'verified'", "VB-10 verified status");
await clickTestId("button-advance-status");
await waitFor("document.querySelector('[data-testid=\"badge-bill-status\"]')?.textContent?.trim() === 'approved'", "VB-10 approved status");
assert(!(await hasTestId("button-edit-bill")), "approved hire bill incorrectly remains editable");
const approvedImage = await capture("vb10-approved-frozen-snapshot");
const approvedState = await fixtureState();
assert(approvedState.statusPayloads.map((entry) => entry.payload.status).join(",") === "verified,approved", "create/verify/approve status payloads were not captured");

// Missing purchase price: the UI must show a manual-price requirement, disable
// blind acceptance, and allow the contractor advance amount to be removed.
await navigate("vb10-no-price", "VB-10 missing diesel price");
await clickTestId("button-new-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "VB-10 no-price form");
await setInput("input-period-from", "2026-05-01");
await setInput("input-period-to", "2026-05-31");
await selectVendor();
await waitFor("document.body.innerText.includes('purchased diesel rate unavailable')", "missing-price contractor warning");
text = await bodyText();
assert(text.includes("purchased diesel rate unavailable"), "manual-price missing contractor advance warning is missing");
const acceptDisabled = await evaluate(`Array.from(document.querySelector('[data-testid="monthly-hire-1001"]')?.querySelectorAll("button") || []).some(button => button.textContent?.trim() === "Accept Suggested" && button.disabled)`);
assert(acceptDisabled, "HLC acceptance remained enabled without a diesel price");
const noPriceInputs = await evaluate("Array.from(document.querySelector('[data-testid=\"monthly-hire-1001\"]')?.querySelectorAll('input[type=\"number\"]') || []).map(input => input.value)");
assert(noPriceInputs.length >= 2, "missing-price contractor editor is missing");
await evaluate(`(() => {
  const inputs = Array.from(document.querySelector('[data-testid="monthly-hire-1001"]')?.querySelectorAll('input[type="number"]') || []);
  const input = inputs[1];
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, "0");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await clickButtonText("No Recovery", hlcRoot);
const noPriceImage = await capture("vb10-missing-diesel-price");
const noPriceBefore = await fixtureState();
await clickTestId("button-save-bill");
await waitFor(`window.__VB09Fixture?.createdPayloads.length === ${noPriceBefore.createdPayloads.length + 1}`, "VB-10 no-price save payload");
const noPriceState = await fixtureState();
const noPricePayload = noPriceState.createdPayloads.at(-1);
const noPriceSnapshot = noPriceState.createdSnapshots.at(-1)?.hireStatements?.find((statement) => Number(statement.equipmentId) === 1001);
assert(Number(noPricePayload.hireGroups?.find((group) => Number(group.equipmentId) === 1001)?.adjustments?.otherDebit || 0) === 0, "missing-price contractor advance was not removable");
assert(noPriceSnapshot?.calculationSnapshot?.diesel?.rateUnavailable === true && noPriceSnapshot.calculationSnapshot.diesel.applicableRate === undefined, "missing-price snapshot retained an unavailable diesel rate");

console.log(JSON.stringify({
  scenario: "VB-10 Equipment Hire mounted VendorBills browser fixture",
  evidence: {
    productionDatabaseUsed: false,
    authBypassUsed: true,
    writes: "in-memory fetch mock only; request payloads captured on window.__VB09Fixture",
    screenshots: [mixedImage, detailImage, approvedImage, noPriceImage],
  },
  verified: {
    mixedMonthlyHourly: true,
    fullMonthZeroActivityAndMidMonthProration: true,
    threeBreakdownsOneGraceAndCalendarOverride: true,
    hlcOpeningPlusIssuedMinusClosing: "100 + 55 - 100 = 55 L; expected 50 L; weighted latest purchase rate ₹105/L",
    recoveryChoices: "accept/edit/no-recovery controls exercised; final saved choice was no-recovery",
    contractorAdvances: "hourly + monthly litres surfaced, edited, and removed when price was unavailable",
    categorySwitch: true,
    savedEditFrozenSnapshot: true,
    createVerifyApprove: true,
  },
  limitations,
  fixtureState: {
    createdPayloads: createdState.createdPayloads.length,
    updatedPayloads: updatedState.updatedPayloads.length,
    statusPayloads: approvedState.statusPayloads,
    noPriceCreatedPayloads: noPriceState.createdPayloads.length,
  },
}, null, 2));
socket.close();