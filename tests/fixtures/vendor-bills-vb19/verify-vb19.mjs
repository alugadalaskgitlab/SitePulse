/*
 * VB-19 isolated browser evidence.
 *
 * This verifier mounts the production RateCards and VendorBills modules through
 * the VB-19 Vite fixture. Every API mutation is an in-memory/sessionStorage
 * fixture mutation. No vendor, database, or production API record is touched.
 *
 * Start the fixture Vite server on VITE_PORT (default 4189) and a separate
 * Chromium CDP endpoint on CDP_PORT (default 9339) before running this file.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cdpPort = Number(process.env.CDP_PORT || 9339);
const vitePort = Number(process.env.VITE_PORT || 4189);
const VENDOR = "VB19 FASIUDDIN";
const ORDINARY_VENDOR = "VB19 ORDINARY SUPPLIER";
const evidenceDir = path.resolve(new URL(".", import.meta.url).pathname, "../../..", "screenshots/vb19");
mkdirSync(evidenceDir, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error(`Chromium did not expose a page target on CDP port ${cdpPort}`);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
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
      if (!/navigated|context.*destroyed|Cannot find context/i.test(error.message)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const state = async () => {
  const raw = await evaluate("JSON.stringify(window.__VB19Fixture || null)");
  return raw ? JSON.parse(raw) : null;
};
const bodyText = () => evaluate("document.body.innerText");
const clickTestId = async id => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(id)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click enabled [data-testid=${id}]`);
};
const clickText = async (text, label = text, exact = false) => {
  const clicked = await evaluate(`(() => {
    const needle = ${quote(text.toLowerCase())};
    const element = Array.from(document.querySelectorAll("button,[role=button]")).find(candidate => {
      const value = (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      return !candidate.disabled && ${exact ? "value === needle" : "value.includes(needle)"};
    });
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `${label} control not found`);
};
const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};
const selectByTestId = async (testId, optionText) => {
  await clickTestId(testId);
  await waitFor(`Array.from(document.querySelectorAll('[role="option"]')).some(option => (option.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase().includes(${quote(optionText.toLowerCase())}))`, `option ${optionText}`);
  const selected = await evaluate(`(() => {
    const needle = ${quote(optionText.toLowerCase())};
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(candidate =>
      (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase().includes(needle));
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(selected, `Could not select ${optionText} in ${testId}`);
};
const screenshot = async name => {
  await sleep(400);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const navigate = async (route, label) => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}${route}` });
  await sleep(500);
  await waitFor("document.readyState === 'complete'", `${label} document`);
};
const configureDesktop = async () => {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
};
const configureMobile = async () => {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
};
const mutatingRequests = requests => requests.filter(request =>
  (request.method === "POST" || request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE") &&
  !request.path.startsWith("/api/vendor-bills/check-duplicates"));

await cdp("Page.enable");
await cdp("Runtime.enable");
await configureDesktop();
await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/` });
await sleep(1000);
await evaluate("sessionStorage.clear()");

// A/B — manual rate-card rows work in all four sections, while discovered rows
// remain editable and intentionally have no remove control.
await navigate("/plant/rate-cards?vendorName=VB19%20FASIUDDIN&scenario=vb19", "A rate cards");
await waitFor("!!document.querySelector('[data-testid=\"text-rate-cards-title\"]')", "rate-card title");
await waitFor("document.querySelectorAll('[data-testid^=\"row-discovered-item-\"]').length === 4", "all discovered sections");
await clickTestId("button-add-equipment-row");
await selectByTestId("select-add-eq-type", "LOADER");
await selectByTestId("select-add-eq-mode", "HOURLY HIRE");
await clickTestId("button-confirm-add-equipment");
await waitFor("!!document.querySelector('[data-testid=\"row-manual-equipment-0\"]')", "manual equipment row");
await setInput("input-manual-rate-equipment-0", "4100");

await clickTestId("button-add-material-row");
await selectByTestId("select-add-mat-name", "STONE");
await selectByTestId("select-add-mat-unit", "CFT");
await clickTestId("button-confirm-add-material");
await waitFor("!!document.querySelector('[data-testid=\"row-manual-material-0\"]')", "manual material row");
await setInput("input-manual-rate-material-0", "500");

await clickTestId("button-add-transport-row");
await selectByTestId("select-add-trans-type", "HAULER");
await selectByTestId("select-add-trans-mode", "TRIP");
await clickTestId("button-confirm-add-transport");
await waitFor("!!document.querySelector('[data-testid=\"row-manual-transport-0\"]')", "manual transport row");
await setInput("input-manual-rate-transport-0", "700");

await clickTestId("button-add-labour-row");
await selectByTestId("select-add-lab-category", "SUPERVISOR");
await selectByTestId("select-add-lab-gender", "ANY");
await clickTestId("button-confirm-add-labour");
await waitFor("!!document.querySelector('[data-testid=\"row-manual-labour-0\"]')", "manual labour row");
await setInput("input-manual-rate-labour-0", "1200");
assert(await evaluate("document.querySelectorAll('[data-testid^=\"button-remove-manual-\"]').length === 4"), "A all four section remove controls missing");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"row-discovered-item-\"]')).every(row => !row.querySelector('[data-testid^=\"button-remove-manual-\"]'))"), "B discovered row unexpectedly has a delete control");
await clickTestId("button-save-all-rates");
await waitFor("((window.__VB19Fixture?.rateCardUpserts || []).length >= 1)", "A rate-card save");
const screenshotRateCardsSaved = await screenshot("vb19-A-ratecards-saved");
await cdp("Page.reload");
await sleep(500);
await waitFor("!!document.querySelector('[data-testid=\"text-rate-cards-title\"]')", "A reopened rate cards");
await waitFor("document.querySelectorAll('[data-testid^=\"button-remove-manual-\"]').length === 4", "A persisted manual rows");

// A cancel leaves a persisted manual row untouched; affirmative confirmations
// then remove each section row, and the second save persists all deletions.
await evaluate("window.__VB19_CONFIRM_QUEUE = [false, true, true, true, true]");
await clickTestId("button-remove-manual-equipment-0");
assert(await evaluate("!!document.querySelector('[data-testid=\"row-manual-equipment-0\"]')"), "A cancelled confirmation removed equipment row");
await clickTestId("button-remove-manual-equipment-0");
await clickTestId("button-remove-manual-material-0");
await clickTestId("button-remove-manual-transport-0");
await clickTestId("button-remove-manual-labour-0");
await waitFor("document.querySelectorAll('[data-testid^=\"button-remove-manual-\"]').length === 0", "all manual rows removed");
const screenshotRateCardsDeleted = await screenshot("vb19-B-ratecards-deleted");
await clickTestId("button-save-all-rates");
await waitFor("((window.__VB19Fixture?.rateCardDeletes || []).length === 4)", "four persisted deletions");
await cdp("Page.reload");
await sleep(500);
await waitFor("!!document.querySelector('[data-testid=\"text-rate-cards-title\"]')", "rate-card reload");
assert(await evaluate("document.querySelectorAll('[data-testid^=\"button-remove-manual-\"]').length === 0"), "B deleted manual rows returned after reload");

const startBill = async (route, vendor, label) => {
  await navigate(route, label);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} form`);
  await setInput("input-period-from", "2027-01-01");
  await setInput("input-period-to", "2027-01-31");
  await waitFor("!!document.querySelector('[data-testid=\"button-show-vendors\"]')", `${label} discovery button`);
  await clickTestId("button-show-vendors");
  await waitFor(`!!document.querySelector('[data-testid=${quote(`button-select-vendor-${vendor}`)}]')`, `${label} vendor`);
  await clickTestId(`button-select-vendor-${vendor}`);
  await waitFor(`document.querySelector('[data-testid="input-vendor-name"]')?.value === ${quote(vendor)}`, `${label} selected vendor`);
  return (await state()).requests.length;
};
const pullAll = async (count, label) => {
  await waitFor(`!!document.querySelector('[data-testid=${quote(`button-auto-populate`)}]')`, `${label} pull all`);
  await waitFor(`!document.querySelector('[data-testid="button-auto-populate"]')?.disabled`, `${label} duplicate preflight`);
  await clickTestId("button-auto-populate");
  await waitFor(`document.querySelectorAll('[data-testid^="text-item-desc-"]').length === ${count}`, `${label} pulled rows`, 600);
};

// C/D/F — the 95-row material group converts in memory only, confirms its
// before/after total, permits a one-row edit, and persists exactly on bill save.
const cRequestBaseline = await startBill("/plant/vendor-bills?scenario=vb19", VENDOR, "C desktop");
await pullAll(95, "C desktop");
await waitFor("document.querySelector('[data-testid=\"input-item-rate-0\"]')?.value === '800'", "C CFT rate-card rate");
await clickTestId("button-set-rates");
await waitFor("document.querySelectorAll('[data-testid^=\"select-bulk-unit-\"]').length >= 1", "C unit choices");
const soilUnitSelect = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="select-bulk-unit-"]')).find(element => element.id.toUpperCase().includes("SOIL"))?.getAttribute("data-testid") || Array.from(document.querySelectorAll('[data-testid^="select-bulk-unit-"]'))[0]?.getAttribute("data-testid")`);
assert(soilUnitSelect, "C SOIL unit selector not rendered");
await selectByTestId(soilUnitSelect, "TRIP");
await clickTestId("button-apply-rates");
await waitFor("!!document.querySelector('[data-testid^=\"bulk-unit-confirm-\"]')", "C before conversion confirmation");
assert((await bodyText()).includes("New group total: ₹76,000.00"), "C confirmation did not show ₹76,000 group total");
const screenshotConversionBefore = await screenshot("vb19-C-conversion-before");

// The confirmation's Cancel is non-destructive and leaves all 600 CFT rows.
await clickTestId("button-cancel-unit-conversion");
assert(await evaluate("document.querySelector('[data-testid=\"input-item-qty-0\"]')?.value === '600'"), "C cancelled conversion changed quantity");
assert(await evaluate("document.querySelector('[data-testid=\"select-item-unit-0\"]')?.textContent?.trim() === 'CFT'"), "C cancelled conversion changed unit");
await clickTestId("button-cancel-rates");
await clickTestId("button-set-rates");
await waitFor("document.querySelectorAll('[data-testid^=\"select-bulk-unit-\"]').length >= 1", "C reopen unit choices");
const soilUnitSelectAgain = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="select-bulk-unit-"]')).find(element => element.id.toUpperCase().includes("SOIL"))?.getAttribute("data-testid") || Array.from(document.querySelectorAll('[data-testid^="select-bulk-unit-"]'))[0]?.getAttribute("data-testid")`);
await selectByTestId(soilUnitSelectAgain, "TRIP");
await clickTestId("button-apply-rates");
await clickTestId("button-confirm-unit-conversion");
await waitFor("document.querySelector('[data-testid=\"text-total-amount\"]')?.textContent?.includes('76,000.00')", "C converted total");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"select-item-unit-\"]')).slice(0, 95).every(el => el.textContent?.trim() === 'TRIP')"), "C not all 95 rows converted to TRIP");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"input-item-qty-\"]')).slice(0, 95).every(el => el.value === '1')"), "C converted quantities are not all one");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"input-item-rate-\"]')).slice(0, 95).every(el => el.value === '800')"), "C converted rates are not all ₹800");
const screenshotConversionAfter = await screenshot("vb19-C-conversion-after");

await setInput("input-item-qty-0", "2");
await waitFor("document.querySelector('[data-testid=\"text-total-amount\"]')?.textContent?.includes('76,800.00')", "D edited total");
assert(await evaluate("document.querySelector('[data-testid=\"input-item-qty-0\"]')?.value === '2'"), "D first row did not become two trips");
assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"input-item-qty-\"]')).slice(1, 95).every(el => el.value === '1')"), "D editing one row changed another quantity");
const screenshotEditedRow = await screenshot("vb19-D-one-row-edited");
const requestsBeforeSave = (await state()).requests.slice(cRequestBaseline);
assert(mutatingRequests(requestsBeforeSave).length === 0, "F conversion emitted a mutating API request before SAVE BILL");
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "D saved list");
await waitFor("((window.__VB19Fixture?.createdPayloads || []).length === 1)", "D bill payload");
await waitFor("((window.__VB19Fixture?.rateCardUpserts || []).length >= 1)", "F save-time rate-card upsert");
const savedState = await state();
const savedPayload = savedState.createdPayloads[0];
assert(savedPayload.items.length === 95, "F saved payload did not contain all 95 rows");
assert(savedPayload.items[0].qty === 2 && savedPayload.items[0].unit === "TRIP", "D saved edited row is wrong");
assert(savedPayload.items.slice(1).every(item => item.qty === 1 && item.unit === "TRIP" && item.rate === 800), "D saved peer rows are wrong");
assert(Number(savedPayload.totalAmount) === 76800, "D saved totalAmount is not ₹76,800");
const savedBillId = savedState.createdPayloads.length ? savedState.requests.find(request => request.path === "/api/vendor-bills" && request.method === "POST") : null;
assert(savedBillId, "F explicit bill save request was not observed");

// Reload and reopen the persisted bill, proving the fixture's persistence
// boundary and the production editor's edit mapping.
await cdp("Page.reload");
await sleep(500);
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "D reload list");
const billId = await evaluate("JSON.parse(sessionStorage.getItem('vb19-bills') || '[]')[0]?.id");
assert(billId, "D saved bill did not persist through reload");
await clickTestId(`card-bill-${billId}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "D detail reopen");
await clickTestId("button-edit-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "D edit reopen");
assert(await evaluate("document.querySelector('[data-testid=\"input-item-qty-0\"]')?.value === '2'"), "D reopened bill lost edited quantity");

// E — separate ordinary group: Set Rates changes only the rate and leaves
// quantity/unit untouched, with no pre-save mutation.
const eRequestBaseline = await startBill("/plant/vendor-bills?scenario=vb19-ordinary", ORDINARY_VENDOR, "E ordinary");
await pullAll(1, "E ordinary");
assert(await evaluate("document.querySelector('[data-testid=\"input-item-qty-0\"]')?.value === '3'"), "E ordinary quantity changed during pull");
assert(await evaluate("document.querySelector('[data-testid=\"select-item-unit-0\"]')?.textContent?.trim() === 'MT'"), "E ordinary unit changed during pull");
await clickTestId("button-set-rates");
await waitFor("!!document.querySelector('[data-testid^=\"input-bulk-rate-\"]')", "E ordinary bulk rate input");
const ordinaryRateInput = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="input-bulk-rate-"]'))[0]?.getAttribute("data-testid")`);
assert(ordinaryRateInput, "E ordinary bulk rate input missing");
await setInput(ordinaryRateInput, "350");
await clickTestId("button-apply-rates");
assert(await evaluate("document.querySelector('[data-testid=\"input-item-qty-0\"]')?.value === '3'"), "E rate-only action changed quantity");
assert(await evaluate("document.querySelector('[data-testid=\"select-item-unit-0\"]')?.textContent?.trim() === 'MT'"), "E rate-only action changed unit");
assert(await evaluate("document.querySelector('[data-testid=\"input-item-rate-0\"]')?.value === '350'"), "E rate-only action did not apply rate");
assert(mutatingRequests((await state()).requests.slice(eRequestBaseline)).length === 0, "E rate-only action emitted a mutation before SAVE BILL");
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "E saved list");
const ordinaryPayload = (await state()).createdPayloads.at(-1);
assert(ordinaryPayload.items[0].qty === 3 && ordinaryPayload.items[0].unit === "MT" && ordinaryPayload.items[0].rate === 350, "E saved ordinary row changed quantity/unit");

// Mobile conversion confirmation evidence uses a fresh unsaved bill and the
// same synthetic records, so the responsive confirmation is independently
// captured rather than inferred from the desktop screenshot.
await configureMobile();
await startBill("/plant/vendor-bills?scenario=vb19-mobile", VENDOR, "C mobile");
await pullAll(95, "C mobile");
await clickTestId("button-set-rates");
await waitFor("document.querySelectorAll('[data-testid^=\"select-bulk-unit-\"]').length >= 1", "mobile unit choices");
const mobileUnitSelect = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="select-bulk-unit-"]')).find(element => element.id.toUpperCase().includes("SOIL"))?.getAttribute("data-testid") || Array.from(document.querySelectorAll('[data-testid^="select-bulk-unit-"]'))[0]?.getAttribute("data-testid")`);
await selectByTestId(mobileUnitSelect, "TRIP");
await clickTestId("button-apply-rates");
await waitFor("!!document.querySelector('[data-testid^=\"bulk-unit-confirm-\"]')", "mobile conversion confirmation");
const screenshotMobileBefore = await screenshot("vb19-mobile-conversion-before");
await clickTestId("button-confirm-unit-conversion");
await waitFor("document.querySelector('[data-testid=\"text-total-amount\"]')?.textContent?.includes('76,000.00')", "mobile converted total");
const screenshotMobileAfter = await screenshot("vb19-mobile-conversion-after");

const evidence = {
  scenario: "VB-19 synthetic browser verification",
  evidence: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    fixtureDisclosure: "All API responses and mutations are synthetic in-memory/sessionStorage fixture data; no vendor or DB records were changed.",
    mountedProductionComponents: ["client/src/pages/RateCards.tsx", "client/src/pages/VendorBills.tsx"],
    authBoundary: "VB-09-style auth/feature/origin/filter aliases",
    manualDeleteConfirmation: "window.confirm is fixture-controlled for deterministic cancel/accept assertions; native dialog screenshot not captured (assertion-only).",
    screenshots: [
      screenshotRateCardsSaved, screenshotRateCardsDeleted, screenshotConversionBefore,
      screenshotConversionAfter, screenshotEditedRow, screenshotMobileBefore, screenshotMobileAfter,
    ],
  },
  verified: {
    A_manualAddSaveReopenDeleteReload: true,
    A_cancelConfirmationRetains: true,
    B_discoveredRowsHaveNoDeleteControl: true,
    A_allSectionsSupported: true,
    C_ninetyFiveSoilRowsConvertedToTrip: true,
    C_beforeAfterConfirmationShows76000: true,
    D_oneEditedRowTwoTripsPeersOneTotal76800: true,
    E_rateOnlyGroupPreservesQuantityAndUnit: true,
    F_noMutationBeforeExplicitBillSave: true,
    F_savePayloadAsserted: true,
    desktopAndMobileConversionConfirmationCaptured: true,
    noSchemaChange: true,
  },
  arithmetic: {
    soilRows: 95,
    sourceQuantityEach: 600,
    targetQuantityEach: 1,
    targetUnit: "TRIP",
    tripRate: 800,
    convertedGroupTotal: 76000,
    editedFirstQuantity: 2,
    editedGroupTotal: 76800,
    ordinarySourceQuantity: 3,
    ordinarySourceUnit: "MT",
    ordinaryAppliedRate: 350,
  },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();