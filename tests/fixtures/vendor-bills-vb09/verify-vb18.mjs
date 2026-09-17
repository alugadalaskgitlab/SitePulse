/*
 * VB-18 browser evidence. This verifier mounts the production VendorBills
 * component through the isolated vb09 fixture. Every API mutation is an
 * in-memory fixture mutation; no production/customer record is written.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence", "vb18");
const downloadDir = path.join(evidenceDir, "downloads");
mkdirSync(downloadDir, { recursive: true });
for (const file of readdirSync(downloadDir)) {
  try { execFileSync("rm", ["-f", path.join(downloadDir, file)]); } catch { /* stale lock */ }
}

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
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject: error => reject(new Error(`${method}: ${error.message}`)) });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const quote = value => JSON.stringify(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const clickTestId = async id => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(id)}]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Could not click enabled [data-testid=${id}]`);
};
const clickText = async (text, label, exact = false) => {
  const clicked = await evaluate(`(() => {
    const needle = ${quote(text.toLowerCase())};
    const element = Array.from(document.querySelectorAll("button,[role=button],[role=option]")).find(candidate => {
      const value = (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      return !candidate.disabled && ${exact ? "value === needle" : "value.includes(needle)"};
    });
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `${label || text} control not found`);
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
const state = async () => {
  const raw = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return raw ? JSON.parse(raw) : null;
};
const bodyText = () => evaluate("document.body.innerText");
const screenshot = async name => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const navigate = async (scenario, label) => {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `http://127.0.0.1:4177/plant/vendor-bills?scenario=${encodeURIComponent(scenario)}` });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`, 600);
};
const value = testId => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.value ?? ""`);
const rowCount = () => evaluate("document.querySelectorAll('[data-testid^=\"additional-adjustment-row-\"]').length");

await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

// Establish a real new-bill flow and pull the fixture's contractor activity.
await navigate("vb18-new", "A");
await clickTestId("button-new-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "A form");
await setInput("input-period-from", "2026-12-01");
await setInput("input-period-to", "2026-12-05");
await waitFor("!document.querySelector('[data-testid=\"button-show-vendors\"]')?.disabled", "A discovery");
await clickTestId("button-show-vendors");
await waitFor(`!!document.querySelector('[data-testid=${quote("row-vendor-VB18 DIESEL CONTRACTOR")}]')`, "A vendor");
await clickTestId("button-select-vendor-VB18 DIESEL CONTRACTOR");
await waitFor("document.querySelector('[data-testid=\"input-vendor-name\"]')?.value === 'VB18 DIESEL CONTRACTOR'", "A selected vendor");
await waitFor("document.querySelector('[data-testid=\"input-adjustment-amount\"]')?.value === '-1000'", "A diesel suggestion");
assert((await value("input-adjustment-label")).includes("DIESEL ADVANCE"), "A primary diesel-advance label missing");
await waitFor("!!document.querySelector('[data-testid=\"button-auto-populate\"]')", "A pull button");
await clickTestId("button-auto-populate");
await waitFor("!!document.querySelector('[data-testid=\"text-item-desc-0\"]')", "A pulled item");

// A — primary diesel recovery plus independent signed debit and credit.
await clickTestId("button-add-adjustment");
await setInput("input-additional-adjustment-label-0", "CASH ADVANCE");
await setInput("input-additional-adjustment-amount-0", "-400");
await clickTestId("button-add-adjustment");
await setInput("input-additional-adjustment-label-1", "PROMPT PAYMENT CREDIT");
await setInput("input-additional-adjustment-amount-1", "150");
await waitFor("document.querySelector('[data-testid=\"text-net-total\"]')?.textContent?.includes('8,750.00')", "A net total");
const aText = await bodyText();
assert(aText.includes("DIESEL ADVANCE") && aText.includes("CASH ADVANCE") && aText.includes("PROMPT PAYMENT CREDIT"), "A independent adjustment lines missing");
assert(await rowCount() === 2, "A expected two additional rows");
const screenshotA = await screenshot("vb18A");

// The remove control must remove only the selected extra; re-add it to prove
// the editor's list remains independently editable before saving.
await clickTestId("button-remove-adjustment-1");
assert(await rowCount() === 1, "A remove control did not remove only credit row");
assert((await bodyText()).includes("CASH ADVANCE"), "A cash advance disappeared when credit was removed");
await clickTestId("button-add-adjustment");
await setInput("input-additional-adjustment-label-1", "PROMPT PAYMENT CREDIT");
await setInput("input-additional-adjustment-amount-1", "150");
await waitFor("document.querySelector('[data-testid=\"text-net-total\"]')?.textContent?.includes('8,750.00')", "A restored net total");

// Save, then reopen the persisted fixture record through the real list/detail
// flow. The fixture API records this payload and returns it from GET by id.
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "B saved list");
const savedState = await state();
const created = savedState?.createdSnapshots?.at(-1);
assert(created?.id, "B fixture did not record a created bill");
assert(created.additionalAdjustments?.length === 2, "B save payload did not include two additional adjustments");
await clickTestId(`card-bill-${created.id}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "B detail");
await clickTestId("button-edit-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "B reopened form");
await waitFor("document.querySelector('[data-testid=\"input-adjustment-amount\"]')?.value === '-1000'", "B primary persisted");
await waitFor("document.querySelector('[data-testid=\"input-additional-adjustment-amount-0\"]')?.value === '-400'", "B cash persisted");
await waitFor("document.querySelector('[data-testid=\"input-additional-adjustment-amount-1\"]')?.value === '150'", "B credit persisted");
assert((await value("input-additional-adjustment-label-0")) === "CASH ADVANCE", "B cash label not restored");
assert((await value("input-additional-adjustment-label-1")) === "PROMPT PAYMENT CREDIT", "B credit label not restored");
const screenshotB = await screenshot("vb18B");

// A blank added row must be pruned on update, while explicit GST/TDS remain
// part of the same persisted arithmetic used by detail, list, and print.
await setInput("input-gst-equipment-rate", "18");
await setInput("input-tds-rate", "2");
await clickTestId("button-add-adjustment");
assert(await rowCount() === 3, "Blank-row setup did not add a third row");
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "C taxed update list");
const taxedState = await state();
const taxedUpdate = taxedState?.updatedPayloads?.at(-1);
assert(Array.isArray(taxedUpdate?.payload?.additionalAdjustments), "C update payload omitted explicit adjustment array");
assert(taxedUpdate.payload.additionalAdjustments.length === 2, "C untouched blank adjustment row was not pruned");
await clickTestId(`card-bill-${created.id}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "C detail");
const detailTaxText = await bodyText();
assert(detailTaxText.includes("GST") && detailTaxText.includes("1,800.00"), `C detail omitted GST: ${detailTaxText.slice(-1200)}`);
assert(detailTaxText.includes("IT TDS") && detailTaxText.includes("2%"), `C detail omitted TDS: ${detailTaxText.slice(-1200)}`);
assert(detailTaxText.includes("10,350.00"), "C detail taxed net total should be 10,350.00");

// C — print iframe is built by the actual client handlePrint implementation.
await clickTestId("button-print");
await waitFor("((window.__VB09Fixture?.printDocuments || []).length >= 1)", "C print document");
const printState = await state();
const printHtml = printState?.printDocuments?.at(-1) || "";
assert(printHtml.includes("CASH ADVANCE") && printHtml.includes("PROMPT PAYMENT CREDIT"), "C print omitted separate adjustment lines");
assert(printHtml.includes("DIESEL ADVANCE") && printHtml.includes("NET TOTAL"), "C print omitted primary/net lines");
assert(printHtml.includes("GST") && printHtml.includes("1,800.00"), "C print omitted GST");
assert(printHtml.includes("TDS") && printHtml.includes("2%") && printHtml.includes("10,350.00"), "C print omitted TDS or taxed net");
const screenshotC = await screenshot("vb18C");

// The equipment bill's export control calls the isolated fixture PDF path.
// This is intentionally labelled fixture-server evidence, not production PDF
// evidence. Its bytes are downloaded by Chromium and extracted with pdftotext.
 const exportButtons = await evaluate("Array.from(document.querySelectorAll('button')).map(button => ({ id: button.getAttribute('data-testid'), text: button.textContent?.replace(/\\s+/g, ' ').trim() })).filter(button => /export|pdf/i.test(button.text || '') || /export/i.test(button.id || ''))");
 const usedPdfControl = exportButtons.some(button => ["button-export-equipment-hire-pdf", "button-export-pdf"].includes(button.id));
 if (exportButtons.some(button => button.id === "button-export-equipment-hire-pdf")) {
   await clickTestId("button-export-equipment-hire-pdf");
   await waitFor("!!document.querySelector('[data-testid=\"button-export-equipment-hire-choice-bill\"]')", "C PDF choices");
   await clickTestId("button-export-equipment-hire-choice-bill");
 } else {
   if (exportButtons.some(button => button.id === "button-export-pdf")) {
     await clickTestId("button-export-pdf");
   } else {
     // Draft equipment bills intentionally have no production export control.
     // Exercise the isolated fixture PDF route directly; the backend worker's
     // real PDF route is covered separately by its server test.
     await evaluate(`(() => {
       const link = document.createElement("a");
       link.href = "/api/vendor-bills/${created.id}/pdf";
       link.download = "VB18-fixture-server.pdf";
       link.click();
       return true;
     })()`);
   }
 }
await waitFor("((window.__VB09Fixture?.downloadFiles || []).some(file => file.type === 'application/pdf'))", "C fixture PDF", 400);
const pdfState = await state();
const pdfDownload = pdfState.downloadFiles.find(file => file.type === "application/pdf");
assert(pdfDownload?.signature === "25504446", `C PDF signature was not PDF: ${JSON.stringify(pdfDownload)}`);
await waitFor("Array.from(document.querySelectorAll('body')).length === 1", "C post-export page");
const pdfBody = pdfState.downloadBodies.find(file => file.type === "application/pdf");
assert(pdfBody?.base64, "C fixture PDF body was not captured");
const pdfPath = path.join(downloadDir, pdfBody.name || "VB18-fixture.pdf");
writeFileSync(pdfPath, Buffer.from(pdfBody.base64, "base64"));
const pdfText = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
assert(pdfText.includes("CASH ADVANCE") && pdfText.includes("PROMPT PAYMENT CREDIT"), "C extracted fixture PDF omitted separate lines");
assert(pdfText.includes("DIESEL ADVANCE") && pdfText.includes("NET TOTAL"), "C extracted fixture PDF omitted primary/net lines");
assert(pdfText.includes("GST") && pdfText.includes("1800.00"), "C extracted fixture PDF omitted GST");
assert(pdfText.includes("TDS") && pdfText.includes("200.00") && pdfText.includes("10350.00"), "C extracted fixture PDF omitted TDS or taxed net");

// D — list/history card shows every adjustment and the combined net total.
await clickTestId("button-back-detail");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "D list");
const listAdjustments = await evaluate(`document.querySelector('[data-testid=${quote(`bill-adjustments-${created.id}`)}]')?.innerText || ""`);
assert(listAdjustments.includes("DIESEL ADVANCE"), "D list omitted primary adjustment");
assert(listAdjustments.includes("CASH ADVANCE") && listAdjustments.includes("PROMPT PAYMENT CREDIT"), "D list omitted additional lines");
assert(listAdjustments.includes("Net total:") && listAdjustments.includes("10,350.00"), "D list taxed combined net total incorrect");
const screenshotD = await screenshot("vb18D");

// Explicitly clear all additional rows and save. The payload must contain []
// rather than omitting the field or retaining stale entries.
await clickTestId(`card-bill-${created.id}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "clear detail");
await clickTestId("button-edit-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "clear form");
await clickTestId("button-remove-adjustment-1");
await clickTestId("button-remove-adjustment-0");
assert(await rowCount() === 0, "Clear update did not remove all rows");
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "clear list");
const clearedState = await state();
const clearedUpdate = clearedState?.updatedPayloads?.at(-1);
assert(Array.isArray(clearedUpdate?.payload?.additionalAdjustments), "Clear update omitted explicit array");
assert(clearedUpdate.payload.additionalAdjustments.length === 0, "Clear update retained stale additional entries");

// A labelled zero-value entry remains durable and visible; zero is not the
// same as a blank row and must survive update/detail/list/print.
await clickTestId(`card-bill-${created.id}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "zero detail");
await clickTestId("button-edit-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "zero form");
await clickTestId("button-add-adjustment");
await setInput("input-additional-adjustment-label-0", "ZERO HOLD");
await setInput("input-additional-adjustment-amount-0", "0");
await clickTestId("button-save-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "zero list");
const zeroState = await state();
const zeroUpdate = zeroState?.updatedPayloads?.at(-1);
assert(zeroUpdate?.payload?.additionalAdjustments?.length === 1, "Labeled zero entry was pruned as blank");
assert(Number(zeroUpdate.payload.additionalAdjustments[0].amount) === 0, "Labeled zero amount changed");
await clickTestId(`card-bill-${created.id}`);
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "zero detail display");
const zeroDetailText = await bodyText();
assert(zeroDetailText.includes("ZERO HOLD"), "Labeled zero was not displayed in detail");
await clickTestId("button-print");
await waitFor("((window.__VB09Fixture?.printDocuments || []).length >= 2)", "zero print");
const zeroPrintState = await state();
assert(zeroPrintState.printDocuments.at(-1).includes("ZERO HOLD"), "Labeled zero was not displayed in print");
await clickTestId("button-back-detail");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "zero list display");
const zeroListText = await evaluate(`document.querySelector('[data-testid=${quote(`bill-adjustments-${created.id}`)}]')?.innerText || ""`);
assert(zeroListText.includes("ZERO HOLD"), "Labeled zero was not displayed in list");

// New form reset: start a clean bill without allowing the old adjustment list
// to leak into it.
await clickTestId("button-new-bill");
await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", "reset new form");
assert(await rowCount() === 0, "New bill retained old additional adjustments");
await clickTestId("button-cancel");
await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", "E list");

// E — ordinary legacy bill has one primary adjustment and no extras.
await navigate("vb18-legacy", "E");
const legacyCard = await evaluate("document.querySelector('[data-testid^=\"card-bill-\"]')?.getAttribute('data-testid')");
assert(legacyCard === "card-bill-1802", `E legacy bill missing: ${legacyCard}`);
const legacyAdjustments = await evaluate("document.querySelector('[data-testid=\"bill-adjustments-1802\"]')?.innerText || ''");
assert(legacyAdjustments.includes("LEGACY ADVANCE") && legacyAdjustments.includes("Net total:") && legacyAdjustments.includes("2,250.00"), "E legacy primary total changed");
assert(await evaluate("!document.querySelector('[data-testid=\"text-bill-additional-adjustment-1802-0\"]')"), "E ordinary bill rendered a phantom additional line");
const screenshotE = await screenshot("vb18E");

console.log(JSON.stringify({
  scenario: "VB-18 multiple independent bill-level adjustments A-E",
  evidence: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    fixtureApiWrites: "isolated in-memory fetch mock only",
    fixtureServerPdf: pdfPath,
    pdfExtraction: "pdftotext over Chromium-downloaded fixture PDF; not production endpoint evidence",
    clientPrintIframe: "real VendorBills handlePrint srcdoc captured",
    screenshots: [screenshotA, screenshotB, screenshotC, screenshotD, screenshotE],
  },
  arithmetic: {
    baseTotal: 10000,
    dieselAdvance: -1000,
    cashAdvance: -400,
    promptPaymentCredit: 150,
    gstRate: 18,
    gstAmount: 1800,
    tdsRate: 2,
    tdsAmount: 200,
    expectedTaxedNetTotal: 10350,
    legacyBaseTotal: 2500,
    legacyAdjustment: -250,
    legacyExpectedNetTotal: 2250,
  },
  verified: {
    A_primaryAndIndependentDebitCredit: true,
    B_saveAndReopenRestoresAllLines: true,
    C_printAndFixturePdfSeparateLinesAndTax: true,
    D_listCombinedTotal: true,
    E_legacyNoExtrasRegression: true,
    blankRowPruned: true,
    labelledZeroRetainedAndDisplayed: true,
    updateClearsExplicitArray: true,
    removeControlAndNewReset: true,
    noCustomerWrites: true,
  },
}, null, 2));
socket.close();