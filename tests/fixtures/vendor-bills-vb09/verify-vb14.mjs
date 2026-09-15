/*
 * VB-14 browser evidence for the mounted production VendorBills component.
 *
 * The fixture owns every response and records only in-memory fetch activity.
 * Start the fixture Vite server and Chromium CDP endpoint before running this
 * verifier; it never opens a production API connection or writes a bill.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

// main.tsx retains the same conditional baseline import used by the existing
// browser verifiers.  The temporary module is needed for Vite's module graph
// even though this verifier never navigates with mode=baseline.
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

const fixtureState = async () => {
  const serialized = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return serialized ? JSON.parse(serialized) : null;
};

const bodyText = () => evaluate("document.body.innerText");

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

const navigate = async (scenario, label) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:4177/plant/vendor-bills?scenario=${encodeURIComponent(scenario)}`,
  });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`);
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

const groupRows = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="pull-group-"]')).map(row => ({
  id: row.getAttribute("data-testid"),
  text: row.textContent?.replace(/\\s+/g, " ").trim(),
  button: row.querySelector("button")?.textContent?.replace(/\\s+/g, " ").trim(),
  disabled: !!row.querySelector("button")?.disabled,
}))`);

const lineDescriptions = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="text-item-desc-"]'))
  .map(item => item.textContent?.replace(/\\s+/g, " ").trim())`);

const billedBadges = () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="badge-billed-"]'))
  .map(item => item.textContent?.replace(/\\s+/g, " ").trim())`);

const scrollTo = async (selector) => {
  await evaluate(`document.querySelector(${quote(selector)})?.scrollIntoView({ block: "center" })`);
};

const assertUniqueFlagIndices = (state, label) => {
  const flags = state?.duplicateFlags?.at(-1) || [];
  const indices = flags.map((flag) => flag.index);
  assert(new Set(indices).size === indices.length, `${label} duplicate flags repeated an item index: ${JSON.stringify(flags)}`);
  return flags;
};

const duplicateFlagsForPayloadLength = (state, itemCount, label) => {
  const checks = state?.duplicateChecks || [];
  const flagSets = state?.duplicateFlags || [];
  for (let index = Math.min(checks.length, flagSets.length) - 1; index >= 0; index -= 1) {
    if (Array.isArray(checks[index]?.items) && checks[index].items.length === itemCount) {
      const flags = flagSets[index] || [];
      const indices = flags.map((flag) => flag.index);
      assert(new Set(indices).size === indices.length, `${label} duplicate flags repeated an item index: ${JSON.stringify(flags)}`);
      return flags;
    }
  }
  throw new Error(`${label} did not record a duplicate check with ${itemCount} candidate items`);
};

const configureMixedBill = async ({ scenario = "vb14-mixed", label, vendor = "VB14 MIXED SUPPLIER" }) => {
  await navigate(scenario, label);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} form`);
  const billType = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  assert(billType === "All Types (Combined)", `${label} fresh bill type changed to ${JSON.stringify(billType)}`);

  await setInput("input-period-from", "2026-09-01");
  await setInput("input-period-to", "2026-09-30");
  await waitFor(`(() => {
    const button = document.querySelector('[data-testid="button-show-vendors"]');
    return !!button && !button.disabled;
  })()`, `${label} vendor discovery button`);
  await clickTestId("button-show-vendors");
  await waitFor(`!!document.querySelector('[data-testid="row-vendor-${vendor}"]')`, `${label} vendor discovery row`);
  await clickTestId(`button-select-vendor-${vendor}`);
  await waitFor(
    `document.querySelector('[data-testid="input-vendor-name"]')?.value === ${quote(vendor)}`,
    `${label} selected vendor`,
  );
  await waitFor(
    "window.__VB09Fixture?.requests.some(request => request.path.includes('/api/vendor-bills/auto-items') && request.path.includes('billType=all'))",
    `${label} all-types auto-item request`,
  );
  await waitFor("document.querySelectorAll('[data-testid^=\"pull-group-\"]').length === 5", `${label} grouped candidates`);
  // VB-14's pre-pull count evidence is backed by the existing duplicate
  // endpoint, rather than a hand-authored count in the fixture.
  await waitFor("window.__VB09Fixture?.duplicateChecks.length >= 1", `${label} duplicate preflight`);
  return { billType, groups: await groupRows() };
};

const assertMixedPreflightCounts = (groups, label) => {
  const expected = {
    "pull-group-eq_EXCAVATOR_HRS": { total: 2, billed: 1, pull: 1 },
    "pull-group-desc_material_SOIL_MT": { total: 2, billed: 1, pull: 1 },
  };
  assert(groups.length === 5, `${label} expected five candidate groups, got ${groups.length}`);
  for (const [id, counts] of Object.entries(expected)) {
    const row = groups.find((candidate) => candidate.id === id);
    assert(row, `${label} missing ${id}`);
    const text = String(row.text || "").replace(/\s+/g, " ").toLowerCase();
    assert(new RegExp(`${counts.total}\\s*items?`).test(text), `${label} ${id} total count missing: ${row.text}`);
    assert(text.includes(`${counts.billed} already billed`), `${label} ${id} billed count missing: ${row.text}`);
    assert(text.includes(`${counts.pull} to pull`), `${label} ${id} to-pull count missing: ${row.text}`);
  }
};

const waitForPulledRows = async (count, label) => {
  await waitFor(
    `document.querySelectorAll('[data-testid^="text-item-desc-"]').length === ${count}`,
    `${label} generated row count`,
  );
  await waitFor(
    "document.querySelectorAll('[data-testid^=\"input-item-desc-\"]').length === 0",
    `${label} initial blank row removal`,
  );
  const descriptions = await lineDescriptions();
  assert(descriptions.length === count, `${label} generated ${descriptions.length} rows, expected ${count}`);
  return descriptions;
};

const waitForPullToast = async (pulled, skipped, label) => {
  await waitFor(`(() => {
    const text = (window.__VB09Fixture?.toastMessages || [])
      .map(toast => [toast.title, toast.description].filter(Boolean).join(" "))
      .join(" ")
      .toLowerCase();
    return text.includes(${quote(`${pulled} item`)}) &&
      text.includes("pulled") &&
      text.includes(${quote(`${skipped} already billed`)}) &&
      text.includes("skipped");
  })()`, `${label} pulled/skipped toast`);
};

/*
 * Resolve the opt-in control by its accessible label rather than baking a
 * component-library-specific checkbox test id into the evidence.  This
 * accepts an input, Radix checkbox, Radix switch, or a pressed button while
 * requiring the visible "Include already-billed items" wording.
 */
const includeBilledToggleState = () => evaluate(`(() => {
  const phrase = "include already-billed items";
  const controls = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"], button[aria-pressed]'));
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find(candidate => (candidate.textContent || "").toLowerCase().includes(phrase));
  let control = label?.querySelector('input[type="checkbox"], [role="checkbox"], [role="switch"], button[aria-pressed]');
  if (!control && label?.htmlFor) control = document.getElementById(label.htmlFor);
  if (!control) {
    control = controls.find(candidate => {
      let current = candidate;
      for (let i = 0; i < 5 && current; i += 1, current = current.parentElement) {
        if ((current.textContent || "").toLowerCase().includes(phrase)) return true;
      }
      return false;
    });
  }
  if (!control) return null;
  const checked = control instanceof HTMLInputElement
    ? control.checked
    : control.getAttribute("aria-checked") === "true" ||
      control.getAttribute("aria-pressed") === "true" ||
      control.getAttribute("data-state") === "checked" ||
      control.getAttribute("data-state") === "on";
  return { testId: control.getAttribute("data-testid"), checked, text: label?.textContent?.trim() || control.parentElement?.textContent?.trim() || "" };
})()`);

const setIncludeBilled = async (checked, label) => {
  const before = await includeBilledToggleState();
  assert(before, `${label} Include already-billed items control is missing`);
  if (before.checked !== checked) {
    const clicked = await evaluate(`(() => {
      const phrase = "include already-billed items";
      const labels = Array.from(document.querySelectorAll("label"));
      const label = labels.find(candidate => (candidate.textContent || "").toLowerCase().includes(phrase));
      let control = label?.querySelector('input[type="checkbox"], [role="checkbox"], [role="switch"], button[aria-pressed]');
      if (!control && label?.htmlFor) control = document.getElementById(label.htmlFor);
      if (!control) {
        control = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"], button[aria-pressed]')).find(candidate => {
          let current = candidate;
          for (let i = 0; i < 5 && current; i += 1, current = current.parentElement) {
            if ((current.textContent || "").toLowerCase().includes(phrase)) return true;
          }
          return false;
        });
      }
      if (!control) return false;
      control.click();
      return true;
    })()`);
    assert(clicked, `${label} could not toggle Include already-billed items`);
  }
  await waitFor(`(() => {
    const controls = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="switch"], button[aria-pressed]'));
    const labels = Array.from(document.querySelectorAll("label"));
    const label = labels.find(candidate => (candidate.textContent || "").toLowerCase().includes("include already-billed items"));
    let control = label?.querySelector('input[type="checkbox"], [role="checkbox"], [role="switch"], button[aria-pressed]');
    if (!control && label?.htmlFor) control = document.getElementById(label.htmlFor);
    if (!control) control = controls.find(candidate => {
      let current = candidate;
      for (let i = 0; i < 5 && current; i += 1, current = current.parentElement) {
        if ((current.textContent || "").toLowerCase().includes("include already-billed items")) return true;
      }
      return false;
    });
    if (!control) return false;
    return (control instanceof HTMLInputElement ? control.checked :
      control.getAttribute("aria-checked") === "true" ||
      control.getAttribute("aria-pressed") === "true" ||
      control.getAttribute("data-state") === "checked" ||
      control.getAttribute("data-state") === "on") === ${checked};
  })()`, `${label} Include already-billed items=${checked}`);
  return includeBilledToggleState();
};

// A — Pull All skips the approved and paid candidates and reports exact
// pulled/skipped counts while retaining only real unbilled activity rows.
const aSetup = await configureMixedBill({ label: "VB14-A Pull All" });
assertMixedPreflightCounts(aSetup.groups, "A");
await clickTestId("button-auto-populate");
const aDescriptions = await waitForPulledRows(6, "A");
await waitForPullToast(6, 2, "A");
assert(aDescriptions.filter((description) => description.includes("EXCAVATOR")).length === 1, "A pulled the approved equipment row");
assert(aDescriptions.filter((description) => description.includes("SOIL")).length === 1, "A pulled the paid SOIL row");
assert(aDescriptions.filter((description) => description.includes("SAND")).length === 1, "A lost the unbilled SAND row");
assert(aDescriptions.filter((description) => description.includes("TIPPER TRUCK")).length === 2, "A lost an unbilled transport row");
assert(aDescriptions.filter((description) => description.includes("LABOUR OPERATOR")).length === 1, "A lost the unbilled labour row");
assert((await billedBadges()).length === 0, "A displayed BILLED badges for skipped rows");
const aState = await fixtureState();
const aFlags = duplicateFlagsForPayloadLength(aState, 8, "A Pull All");
assert(aFlags.length === 2, `A duplicate preflight returned ${aFlags.length} flags`);
assert(aFlags.some((flag) => flag.billStatus === "approved" && flag.billNo === "VB14-APPROVED-001"), "A approved duplicate flag is missing");
assert(aFlags.some((flag) => flag.billStatus === "paid" && flag.billNo === "VB14-PAID-002"), "A paid duplicate flag is missing");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotA = await capture("vb14A");

// B — An individual group applies the same skip policy without touching the
// remaining groups.
const bSetup = await configureMixedBill({ label: "VB14-B equipment-only" });
assertMixedPreflightCounts(bSetup.groups, "B");
await clickTestId("button-pull-group-eq_EXCAVATOR_HRS");
const bDescriptions = await waitForPulledRows(1, "B");
await waitForPullToast(1, 1, "B");
assert(bDescriptions.length === 1 && bDescriptions[0].includes("EXCAVATOR"), "B equipment group did not leave one unbilled row");
assert((await billedBadges()).length === 0, "B added the approved equipment duplicate");
const bAfterGroups = await groupRows();
for (const id of ["pull-group-desc_material_SOIL_MT", "pull-group-desc_material_SAND_MT", "pull-group-transport_QUARRY_TRIP", "pull-group-lab_LAB_OPERATOR_MALE_HEAD-DAY"]) {
  const row = bAfterGroups.find((candidate) => candidate.id === id);
  assert(row && !row.disabled && String(row.button).toUpperCase().includes("PULL"), `B remaining group ${id} was consumed`);
}
const bState = await fixtureState();
const bFlags = duplicateFlagsForPayloadLength(bState, 2, "B equipment pull");
assert(bFlags.length === 1 && bFlags[0].billStatus === "approved", `B expected one approved duplicate flag: ${JSON.stringify(bFlags)}`);
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotB = await capture("vb14B");

// C — Capture the pre-pull breakdown itself, including both duplicate and
// to-pull counts for each mixed group.
const cSetup = await configureMixedBill({ label: "VB14-C pre-pull counts" });
assertMixedPreflightCounts(cSetup.groups, "C");
const cState = await fixtureState();
const cFlags = assertUniqueFlagIndices(cState, "C");
assert(cFlags.length === 2, `C preflight did not identify the two mixed duplicates: ${JSON.stringify(cFlags)}`);
await scrollTo('[data-testid^="pull-group-"]');
const screenshotC = await capture("vb14C");

// D — Explicitly opt in, pull a flagged item with its BILLED badge, then turn
// the option back off before the next group pull.  A fresh bill must reset it.
const dSetup = await configureMixedBill({ label: "VB14-D opt-in" });
assertMixedPreflightCounts(dSetup.groups, "D");
const dInitialToggle = await setIncludeBilled(false, "D default");
assert(dInitialToggle.checked === false, "D Include already-billed items is not OFF by default");
const dEnabledToggle = await setIncludeBilled(true, "D opt-in");
assert(dEnabledToggle.checked === true, "D Include already-billed items did not turn ON");
await clickTestId("button-pull-group-eq_EXCAVATOR_HRS");
const dEquipmentDescriptions = await waitForPulledRows(2, "D opt-in equipment");
assert(dEquipmentDescriptions.filter((description) => description.includes("EXCAVATOR")).length === 2, "D opt-in did not add both equipment rows");
await waitFor("document.querySelectorAll('[data-testid^=\"badge-billed-\"]').length === 1", "D BILLED badge");
const dEquipmentBadges = await billedBadges();
assert(dEquipmentBadges.some((badge) => badge.includes("VB14-APPROVED-001 - APPROVED")), `D approved BILLED badge is missing: ${JSON.stringify(dEquipmentBadges)}`);
const dAfterEquipment = await fixtureState();
const dEquipmentFlags = duplicateFlagsForPayloadLength(dAfterEquipment, 2, "D equipment pull");
assert(dEquipmentFlags.length === 1 && dEquipmentFlags[0].billStatus === "approved", "D equipment did not preflight its approved duplicate");
await setIncludeBilled(false, "D next pull");
await clickTestId("button-pull-group-desc_material_SOIL_MT");
const dMaterialDescriptions = await waitForPulledRows(3, "D next group");
assert(dMaterialDescriptions.filter((description) => description.includes("SOIL")).length === 1, "D OFF next pull added the paid SOIL duplicate");
assert((await billedBadges()).length === 1, "D OFF next pull changed the existing BILLED badge count");
await waitForPullToast(1, 1, "D next group");
const dState = await fixtureState();
const dSoilFlags = duplicateFlagsForPayloadLength(dState, 2, "D SOIL pull");
assert(dSoilFlags.length === 1 && dSoilFlags[0].billStatus === "paid", "D next group did not identify the paid duplicate");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotD = await capture("vb14D");

await configureMixedBill({ label: "VB14-D context reset" });
const resetToggle = await includeBilledToggleState();
assert(resetToggle && resetToggle.checked === false, `D context reset retained opt-in state: ${JSON.stringify(resetToggle)}`);

// E — A clean vendor with no billed activity remains a full Pull All.  Check
// rate-card values plus unchanged fresh bill type/GST/TDS controls here.
const eSetup = await configureMixedBill({
  scenario: "vb14-clean",
  label: "VB14-E no duplicates",
  vendor: "VB14 CLEAN SUPPLIER",
});
assert(eSetup.billType === "All Types (Combined)", "E clean fresh bill did not preserve All Types default");
await clickTestId("button-auto-populate");
const eDescriptions = await waitForPulledRows(8, "E");
assert(eDescriptions.filter((description) => description.includes("EXCAVATOR")).length === 2, "E no-duplicate equipment rows changed");
assert(eDescriptions.filter((description) => description.includes("SOIL")).length === 2, "E no-duplicate SOIL rows changed");
assert(eDescriptions.filter((description) => description.includes("SAND")).length === 1, "E no-duplicate SAND row changed");
assert(eDescriptions.filter((description) => description.includes("TIPPER TRUCK")).length === 2, "E no-duplicate transport rows changed");
assert(eDescriptions.filter((description) => description.includes("LABOUR OPERATOR")).length === 1, "E no-duplicate labour row changed");
assert((await billedBadges()).length === 0, "E clean pull unexpectedly displayed a BILLED badge");
await waitFor("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).every(input => input.value !== '0')", "E rate-card values");
const eRates = await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).map(input => input.value)");
assert(eRates.filter((rate) => rate === "3500").length === 2, `E equipment rates changed: ${JSON.stringify(eRates)}`);
assert(eRates.filter((rate) => rate === "1250").length === 2, `E SOIL rates changed: ${JSON.stringify(eRates)}`);
assert(eRates.filter((rate) => rate === "900").length === 1, `E SAND rate changed: ${JSON.stringify(eRates)}`);
assert(eRates.filter((rate) => rate === "2400").length === 2, `E transport rates changed: ${JSON.stringify(eRates)}`);
assert(eRates.filter((rate) => rate === "800").length === 1, `E labour rate changed: ${JSON.stringify(eRates)}`);
for (const [testId, value] of [
  ["input-gst-equipment-rate", 18],
  ["input-gst-material-rate", 18],
  ["input-gst-transport-rate", 18],
  ["input-gst-labour-rate", 18],
  ["input-tds-rate", 2],
]) {
  await setInput(testId, value);
  await waitFor(`document.querySelector('[data-testid=${quote(testId)}]')?.value === ${quote(String(value))}`, `E ${testId}`);
}
assert(await evaluate("document.body.innerText.includes('GST ON EQUIPMENT')"), "E GST control disappeared");
assert(await evaluate("document.body.innerText.includes('IT TDS')"), "E TDS control disappeared");
const eState = await fixtureState();
assert((eState.duplicateFlags.at(-1) || []).length === 0, "E clean duplicate preflight returned flags");
assertUniqueFlagIndices(eState, "E");
await scrollTo('[data-testid^="text-item-desc-"]');
const screenshotE = await capture("vb14E");

// F — Keep the VB-13 regression seam explicit: a fresh bill still defaults to
// All Types, rate-card values still apply on a normal no-duplicate pull, and
// every category GST/TDS control remains writable after that pull.
const fSetup = await configureMixedBill({
  scenario: "vb14-clean",
  label: "VB14-F fresh bill regression",
  vendor: "VB14 CLEAN SUPPLIER",
});
assert(fSetup.billType === "All Types (Combined)", "F fresh bill type regressed from All Types (Combined)");
await clickTestId("button-auto-populate");
await waitForPulledRows(8, "F");
await waitFor("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).every(input => input.value !== '0')", "F rate-card values");
for (const [testId, value] of [
  ["input-gst-equipment-rate", 18],
  ["input-gst-material-rate", 18],
  ["input-gst-transport-rate", 18],
  ["input-gst-labour-rate", 18],
  ["input-tds-rate", 2],
]) {
  await setInput(testId, value);
  await waitFor(`document.querySelector('[data-testid=${quote(testId)}]')?.value === ${quote(String(value))}`, `F ${testId}`);
}
assert(await evaluate("document.body.innerText.includes('GST ON EQUIPMENT')"), "F GST category controls disappeared");
assert(await evaluate("document.body.innerText.includes('IT TDS')"), "F TDS control disappeared");
assert(await evaluate("document.querySelector('[data-testid=\"text-gst-equipment-amount\"]')?.textContent?.includes('8,820.00')"), "F equipment GST amount did not recalculate");
assert(await evaluate("document.querySelector('[data-testid=\"text-tds-amount\"]')?.textContent?.includes('4,380.00')"), "F TDS amount did not recalculate");
const fRates = await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).map(input => input.value)");
assert(fRates.every((rate) => rate !== "0"), `F rate-card values contain zero: ${JSON.stringify(fRates)}`);
await scrollTo('[data-testid="input-gst-equipment-rate"]');
const screenshotF = await capture("vb14F");

// Failure seam: a failed duplicate check must not silently merge candidates.
// This is intentionally not one of A-E's screenshots; it is a guard against
// reverting to the old "catch and merge everything" behavior.
const failureSetup = await configureMixedBill({
  scenario: "vb14-duplicate-failure",
  label: "VB14 duplicate-check failure",
});
assert(failureSetup.groups.length === 5, "Duplicate-check failure changed the candidate group shape");
await waitFor("!!document.querySelector('[data-testid=\"text-duplicate-preflight-error\"]')", "duplicate-check failure UI");
const failurePullDisabled = await evaluate(
  "document.querySelector('[data-testid=\"button-pull-group-eq_EXCAVATOR_HRS\"]')?.disabled === true",
);
assert(failurePullDisabled, "Duplicate-check failure left a pull action enabled");
const failureDescriptions = await lineDescriptions();
assert(failureDescriptions.length === 0, `Duplicate-check failure merged ${failureDescriptions.length} rows`);
assert(await evaluate("document.querySelectorAll('[data-testid^=\"input-item-desc-\"]').length === 1"), "Duplicate-check failure removed the blank editor row");
const failureState = await fixtureState();
assert(failureState.duplicateErrors.length >= 1, "Duplicate-check failure was not captured by the fixture");

console.log(JSON.stringify({
  scenario: "VB-14 duplicate preflight skip/include browser evidence",
  evidence: {
    productionDatabaseUsed: false,
    authBypassUsed: true,
    writes: "in-memory fetch mock only; no production API writes",
    fixtureContracts: ["vb14-mixed", "vb14-clean", "vb14-duplicate-failure"],
    screenshots: [screenshotA, screenshotB, screenshotC, screenshotD, screenshotE, screenshotF],
  },
  verified: {
    A_pullAllSkipsApprovedAndPaid: true,
    A_pulledRows: aDescriptions.length,
    A_skippedRows: 2,
    A_duplicateFlags: aFlags,
    B_groupPullSkipsOnlyItsDuplicate: true,
    B_remainingGroupsAvailable: true,
    C_prePullCounts: true,
    D_optInBilledBadgeThenOff: true,
    D_contextResetOff: true,
    E_noDuplicatePullUsual: true,
    E_pulledRows: eDescriptions.length,
    E_rates: eRates,
    F_freshBillTypeRatesGstTds: true,
    F_rates: fRates,
    duplicateCheckFailureNoMerge: true,
    uniqueFlagIndexChecks: true,
  },
}, null, 2));
socket.close();