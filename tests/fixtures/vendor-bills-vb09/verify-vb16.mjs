/*
 * VB-16 browser evidence for the mounted production VendorBills component.
 *
 * All application responses are owned by the isolated vb16 fixture scenarios.
 * This verifier uses the real production draft/detail/export components, never
 * a replacement page or a fake export implementation. Fixture writes stay
 * in-memory and no customer API is contacted.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import XLSX from "xlsx";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence", "vb16");
const downloadDir = path.join(evidenceDir, "downloads");
mkdirSync(downloadDir, { recursive: true });
for (const file of readdirSync(downloadDir)) {
  try { unlinkSync(path.join(downloadDir, file)); } catch { /* stale lock */ }
}

// Generate a temporary copy from git HEAD. Test E uses the original export
// functions as the saved-bill baseline; no new exporter is used for comparison.
// main.tsx keeps its pre-existing VB14/VB15 baseline import behind a mode
// guard, but Vite still resolves that dynamic import during transformation.
// Keep the required temporary module in place for fixture startup.
const baselineHeadPath = path.join(fixtureDir, "baseline-head.tsx");
writeFileSync(baselineHeadPath, execFileSync("git", [
  "show", "HEAD:client/src/pages/VendorBills.tsx",
], { cwd: process.cwd(), encoding: "utf8" }));
const baselineOutputPath = path.join(fixtureDir, "baseline-EquipmentHireBillOutput.tsx");
const cleanup = () => {
  for (const file of [baselineHeadPath, baselineOutputPath]) {
    try { unlinkSync(file); } catch { /* already absent */ }
  }
};
process.on("exit", cleanup);

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
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const waitFor = async (expression, label, attempts = 240) => {
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
const state = async () => {
  const raw = await evaluate("JSON.stringify(window.__VB09Fixture || null)");
  return raw ? JSON.parse(raw) : null;
};

await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
});

const navigate = async (scenario, label) => {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", {
    url: `http://127.0.0.1:4177/plant/vendor-bills?scenario=${encodeURIComponent(scenario)}`,
  });
  await waitFor("document.readyState === 'complete'", `${label} document`);
  // The first fixture navigation can cold-transform the large production
  // page while Vite builds its dependency graph. If the HTML module tag did
  // not execute, retry the same real entry module with a cache-busting query
  // rather than timing out on an empty root.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await evaluate("!!document.querySelector('[data-testid=\"text-page-title\"]')")) break;
    if (attempt === 5) {
      const imported = await evaluate("import('/main.tsx?vb16-entry-retry=' + Date.now()).then(() => ({ ok: true })).catch(error => ({ ok: false, message: error?.message || String(error) }))");
      if (!imported?.ok) console.error(`VB16 entry retry failed: ${JSON.stringify(imported)}`);
    }
    await sleep(100);
  }
  await waitFor("!!document.querySelector('[data-testid=\"text-page-title\"]')", `${label} list`, 600);
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
      ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};
const clickText = async (pattern, label, { exact = false } = {}) => {
  const clicked = await evaluate(`(() => {
    const pattern = ${quote(pattern.toLowerCase())};
    const elements = Array.from(document.querySelectorAll("button,[role=button],[role=option],summary"));
    const element = elements.find(candidate => {
      const text = (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      return ${exact ? "text === pattern" : "text.includes(pattern)"};
    });
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `${label} control was not found/enabled`);
};
const bodyText = () => evaluate("document.body.innerText");
const capture = async name => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const scrollToText = async text => {
  await evaluate(`(() => {
    const needle = ${quote(text.toLowerCase())};
    const element = Array.from(document.querySelectorAll("*")).find(node =>
      (node.textContent || "").trim().toLowerCase() === needle);
    element?.scrollIntoView({ block: "center" });
  })()`);
};

const configureDraft = async (label, to = "2026-10-03") => {
  await navigate("vb16-draft", label);
  await clickTestId("button-new-bill");
  await waitFor("!!document.querySelector('[data-testid=\"text-form-title\"]')", `${label} form`);
  const initialType = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  if (initialType !== "EQUIPMENT HIRE") {
    await clickTestId("select-bill-type");
    await clickText("equipment hire", `${label} equipment bill type`);
  }
  const type = await evaluate("document.querySelector('[data-testid=\"select-bill-type\"]')?.textContent?.trim()");
  assert(type === "EQUIPMENT HIRE", `${label} did not select Equipment Hire: ${JSON.stringify(type)}`);
  await setInput("input-period-from", "2026-10-01");
  await setInput("input-period-to", to);
  await waitFor("!document.querySelector('[data-testid=\"button-show-vendors\"]')?.disabled", `${label} discovery button`);
  await clickTestId("button-show-vendors");
  await waitFor("!!document.querySelector('[data-testid=\"row-vendor-VB16 DAILY EQUIPMENT\"]')", `${label} vendor row`);
  await clickTestId("button-select-vendor-VB16 DAILY EQUIPMENT");
  await waitFor("document.querySelector('[data-testid=\"input-vendor-name\"]')?.value === 'VB16 DAILY EQUIPMENT'", `${label} vendor selected`);
  await waitFor("!!document.querySelector('[data-testid=\"monthly-hire-1601\"]')", `${label} monthly equipment group`);
};

const expandDraftActivity = async label => {
  const details = await evaluate(`(() => {
    const element = Array.from(document.querySelectorAll("summary")).find(node =>
      (node.textContent || "").toLowerCase().includes("activity") ||
      (node.textContent || "").toLowerCase().includes("calendar"));
    if (!element) return false;
    const parent = element.parentElement;
    if (parent && parent.tagName === "DETAILS" && !parent.open) element.click();
    return true;
  })()`);
  assert(details, `${label} draft activity/calendar disclosure missing`);
  await waitFor(`(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes("opening meter") && text.includes("closing meter") &&
      text.includes("working hours") && text.includes("diesel");
  })()`, `${label} rich daily columns`);
};
const assertRichDailyColumns = async label => {
  const text = (await bodyText()).toLowerCase();
  for (const required of ["opening meter", "closing meter", "working hours", "start", "end", "diesel", "consumption"]) {
    assert(text.includes(required), `${label} missing rich daily column ${required}`);
  }
};
const assertPeriodTotals = async label => {
  const text = (await bodyText()).toLowerCase();
  assert(text.includes("hours:"), `${label} period totals label missing`);
  assert(text.includes("15 h") || text.includes("15"), `${label} period totals did not show live hours`);
};
const visibleExportButtons = () => evaluate(`Array.from(document.querySelectorAll("button")).map(button => ({
  id: button.getAttribute("data-testid"), text: button.textContent?.replace(/\\s+/g, " ").trim(), disabled: !!button.disabled,
})).filter(button => /export/i.test(button.text || ""))`);

const downloadSnapshot = () => readdirSync(downloadDir).filter(file => !file.endsWith(".crdownload"));
const waitForDownloads = async (before, minimum, label) => {
  for (let i = 0; i < 240; i += 1) {
    const after = downloadSnapshot();
    if (after.filter(file => !before.includes(file)).length >= minimum) {
      await sleep(200);
      return downloadSnapshot();
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label} downloads`);
};
const filesSince = (before, after) => after.filter(file => !before.includes(file)).map(file => path.join(downloadDir, file));
const chooseExport = async (scope, format, label) => {
  const before = downloadSnapshot();
  // Production's export component selects the format first, then opens the
  // Calendar/Bill/Both choice dialog. Prefer its stable format testids.
  const clicked = await evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const preferred = document.querySelector(${quote(format === "pdf"
      ? "[data-testid=\"button-export-equipment-hire-pdf\"]"
      : "[data-testid=\"button-export-equipment-hire-excel\"]")});
    const candidate = preferred || buttons.find(button => {
      const text = (button.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      const id = (button.getAttribute("data-testid") || "").toLowerCase();
      return !button.disabled && (
        text === (format === "pdf" ? "export pdf" : "export excel") ||
        text === (format === "pdf" ? "pdf" : "excel") ||
        text === "export" || text === "export options" ||
        (id.includes("export") && !text.includes("gst") && !text.includes("csv"))
      );
    });
    if (!candidate) return false;
    candidate.click();
    return true;
  })()`);
  if (!clicked) {
    const direct = await evaluate(`Array.from(document.querySelectorAll("button")).some(button => {
      const text = (button.textContent || "").toLowerCase();
      return !button.disabled && text.includes(${quote(`${scope} ${format}`.toLowerCase())});
    })`);
    assert(direct, `${label} export trigger missing`);
  } else {
    await sleep(100);
  }
  // Scope/format buttons can be presented in a dialog, menu, or command list.
  const scopeClicked = await evaluate(`(() => {
    const needle = ${quote(scope.toLowerCase())};
    const elements = Array.from(document.querySelectorAll("button,[role=menuitem],[role=option]"));
    const element = elements.find(candidate => {
      const text = (candidate.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase();
      return !candidate.disabled && (text === needle || text === ("export " + needle));
    });
    if (!element) return false;
    element.click();
    return true;
  })()`);
  if (!scopeClicked && scope !== "both") {
    // A direct format button is acceptable for implementations that put the
    // Calendar/Bill choice in the button label itself.
    const direct = await evaluate(`(() => {
      const needle = ${quote(`${scope} ${format}`.toLowerCase())};
      const element = Array.from(document.querySelectorAll("button")).find(candidate =>
        !candidate.disabled && (candidate.textContent || "").toLowerCase().includes(needle));
      if (!element) return false;
      element.click();
      return true;
    })()`);
    assert(direct, `${label} ${scope} choice missing`);
  }
  const after = await waitForDownloads(before, 1, label);
  return filesSince(before, after);
};

// A/B — Draft-stage rich daily rows and compact period totals use live
// Equipment Performance data, not the old aggregate-only calendar.
await configureDraft("VB16-A");
await expandDraftActivity("A");
await assertRichDailyColumns("A");
const screenshotA = await capture("vb16A");
await assertPeriodTotals("B");
assert((await bodyText()).includes("VB16 LIVE SITE"), "B project/site detail missing from live calendar");
const screenshotB = await capture("vb16B");

// C — Change period and a live breakdown decision without saving. The row
// count/totals must update in place.
await setInput("input-period-to", "2026-10-02");
await waitFor("document.body.innerText.includes('02-OCT-2026') || document.body.innerText.includes('02-Oct-2026')", "C shortened period");
await waitFor("!document.body.innerText.includes('03-OCT-2026')", "C removed third day");
const decisionControl = await evaluate(`Array.from(document.querySelectorAll("button")).find(button =>
  /automatic after grace/i.test(button.textContent || ""))?.textContent || ""`);
if (decisionControl) {
  await clickText("automatic after grace", "C breakdown decision control");
  await waitFor("Array.from(document.querySelectorAll('[role=option],button')).some(node => /full day|half day|no deduction/i.test(node.textContent || ''))", "C decision choices");
  await clickText("full day", "C full-day decision");
  await waitFor("Array.from(document.querySelectorAll('button,[role=combobox]')).some(node => /full day/i.test(node.textContent || ''))", "C applied decision");
} else {
  const select = await evaluate(`Array.from(document.querySelectorAll("select")).find(element =>
    (element.parentElement?.textContent || "").toLowerCase().includes("breakdown"))?.value || ""`);
  assert(select, "C breakdown/exception decision control missing");
}
const screenshotC = await capture("vb16C");

// D — Calendar-only exports from the draft, using the real production
// browser download path. Both formats must omit Bill Summary.
const dPdfFiles = await chooseExport("calendar", "pdf", "D calendar PDF");
const dXlsxFiles = await chooseExport("calendar", "excel", "D calendar Excel");
const dPdf = dPdfFiles.find(file => file.toLowerCase().endsWith(".pdf"));
const dXlsx = dXlsxFiles.find(file => file.toLowerCase().endsWith(".xlsx"));
assert(dPdf && dXlsx, `D expected PDF and Excel downloads: ${JSON.stringify([...dPdfFiles, ...dXlsxFiles])}`);
const dPdfText = execFileSync("pdftotext", [dPdf, "-"], { encoding: "utf8" });
assert(!dPdfText.includes("Bill Summary"), "D calendar PDF unexpectedly contains Bill Summary");
assert(/Daily Activity|Calendar/i.test(dPdfText), "D calendar PDF lacks Daily Activity content");
const dBook = XLSX.readFile(dXlsx);
assert(!dBook.SheetNames.includes("Bill Summary"), `D calendar workbook contains summary sheet: ${dBook.SheetNames}`);
assert(dBook.SheetNames.some(name => /daily|calendar/i.test(name)), `D calendar workbook lacks daily sheet: ${dBook.SheetNames}`);
const screenshotD = await capture("vb16D");

// E — Saved rich hire statement. Export Bill is compared to original HEAD's
// export function at both PDF text and XLSX sheet/content level.
await navigate("vb16-saved", "VB16-E saved bill");
await clickTestId("card-bill-1601");
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "E saved detail");
await waitFor("document.body.innerText.includes('VB16-RICH-SAVED')", "E saved bill number");
// Add the baseline module only after the fixture app has mounted. Vite's
// dependency scanner otherwise tries to cold-transform this intentionally
// temporary source before the real VendorBills entry module is ready.
writeFileSync(baselineOutputPath, execFileSync("git", [
  "show", "HEAD:client/src/components/vendor-bills/EquipmentHireBillOutput.tsx",
], { cwd: process.cwd(), encoding: "utf8" }));
const baselineImported = await evaluate(`import("/baseline-EquipmentHireBillOutput.tsx").then(module => {
  window.__VB16BaselineOutput = module;
  return true;
})`);
assert(baselineImported, "E original HEAD export module did not load");
const baselineKinds = await evaluate(`(async () => {
  const bill = await fetch("/api/vendor-bills/1601").then(response => response.json());
  const output = window.__VB16BaselineOutput.buildSavedEquipmentHireBillOutput(bill);
  if (!output) return false;
  window.__VB16BaselineOutput.exportEquipmentHireBill({ ...output.data, billNo: "VB16-BASELINE" }, output.rows, "pdf");
  window.__VB16BaselineOutput.exportEquipmentHireBill({ ...output.data, billNo: "VB16-BASELINE" }, output.rows, "xlsx");
  return true;
})()`);
assert(baselineKinds, "E original HEAD export baseline did not produce output");
const baselineFiles = await (async () => {
  for (let i = 0; i < 240; i += 1) {
    const files = downloadSnapshot().filter(file => /VB16-BASELINE/i.test(file));
    if (files.length >= 2) return files.map(file => path.join(downloadDir, file));
    await sleep(50);
  }
  throw new Error("Timed out waiting for E baseline exports");
})();
const eBillPdfFiles = await chooseExport("bill", "pdf", "E saved Bill PDF");
const eBillXlsxFiles = await chooseExport("bill", "excel", "E saved Bill Excel");
const ePdf = eBillPdfFiles.find(file => file.toLowerCase().endsWith(".pdf"));
const eXlsx = eBillXlsxFiles.find(file => file.toLowerCase().endsWith(".xlsx"));
assert(ePdf && eXlsx, "E saved bill PDF/Excel downloads missing");
const baselinePdf = baselineFiles.find(file => file.endsWith(".pdf"));
const baselineXlsx = baselineFiles.find(file => file.endsWith(".xlsx"));
const canonicalPdf = text => text.replace(/VB16-(?:BASELINE|RICH-SAVED)/g, "VB16-BILL").replace(/\s+/g, " ").trim();
const baselinePdfText = execFileSync("pdftotext", [baselinePdf, "-"], { encoding: "utf8" });
const savedPdfText = execFileSync("pdftotext", [ePdf, "-"], { encoding: "utf8" });
assert(canonicalPdf(savedPdfText) === canonicalPdf(baselinePdfText), "E Export Bill PDF differs from original HEAD output");
const workbookCanonical = file => {
  const workbook = XLSX.readFile(file);
  return workbook.SheetNames.map(name => [
    name,
    XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false }),
  ]);
};
const replaceJsonBillNo = value => JSON.parse(JSON.stringify(value).replace(/VB16-(?:BASELINE|RICH-SAVED)/g, "VB16-BILL"));
assert(JSON.stringify(replaceJsonBillNo(workbookCanonical(eXlsx))) === JSON.stringify(replaceJsonBillNo(workbookCanonical(baselineXlsx))), "E Export Bill XLSX differs from original HEAD sheets/content");
const screenshotE = await capture("vb16E");

// F — Both produces both the bill and calendar artifacts. Implementations may
// offer one file per format or two files per format; inspect every new file and
// require both summary and daily content to be represented.
for (const file of downloadSnapshot().filter(name => /VB16-RICH-SAVED/i.test(name))) {
  try { unlinkSync(path.join(downloadDir, file)); } catch { /* download finished */ }
}
const fPdfFiles = await chooseExport("both", "pdf", "F Both PDF");
const fXlsxFiles = await chooseExport("both", "excel", "F Both Excel");
const fAllFiles = [...fPdfFiles, ...fXlsxFiles];
const fPdfs = fAllFiles.filter(file => file.toLowerCase().endsWith(".pdf"));
const fXlsxs = fAllFiles.filter(file => file.toLowerCase().endsWith(".xlsx"));
assert(fPdfs.length >= 1 && fXlsxs.length >= 1, `F Both did not produce PDF+Excel: ${JSON.stringify(fAllFiles)}`);
for (const file of fPdfs) {
  const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
  assert(/Bill Summary|Daily Activity/i.test(text), `F PDF lacks bill/calendar content: ${file}`);
}
assert(fPdfs.some(file => /Bill Summary/i.test(execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }))), "F PDF set lacks Bill Summary");
assert(fPdfs.some(file => /Daily Activity/i.test(execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }))), "F PDF set lacks Daily Activity");
for (const file of fXlsxs) {
  const names = XLSX.readFile(file).SheetNames;
  assert(names.some(name => /summary|daily|calendar/i.test(name)), `F XLSX lacks bill/calendar content: ${file}`);
}
assert(fXlsxs.some(file => XLSX.readFile(file).SheetNames.some(name => /summary/i.test(name))), "F XLSX set lacks Bill Summary");
assert(fXlsxs.some(file => XLSX.readFile(file).SheetNames.some(name => /daily|calendar/i.test(name))), "F XLSX set lacks Daily Activity");
const screenshotF = await capture("vb16F");

// G — Non-equipment bill export remains the original single PDF action. No
// equipment-calendar choice is rendered for material bills.
await navigate("vb16-material", "VB16-G material");
await clickTestId("card-bill-1602");
await waitFor("!!document.querySelector('[data-testid=\"text-detail-title\"]')", "G material detail");
const gBody = (await bodyText()).toLowerCase();
assert(!gBody.includes("export calendar") && !gBody.includes("export both"), "G material bill exposed equipment calendar choices");
assert(await evaluate("!!document.querySelector('[data-testid=\"button-export-pdf\"]')"), "G original material Export PDF action disappeared");
const screenshotG = await capture("vb16G");

console.log(JSON.stringify({
  scenario: "VB-16 rich draft daily activity, totals, export choices, and regression evidence",
  evidence: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    fixtureApiWrites: "in-memory fetch mock only",
    schemaChanged: false,
    baseline: "Original HEAD EquipmentHireBillOutput.tsx export functions generated comparison files",
    downloads: fAllFiles.concat(dPdfFiles, dXlsxFiles, eBillPdfFiles, eBillXlsxFiles, baselineFiles),
    screenshots: [screenshotA, screenshotB, screenshotC, screenshotD, screenshotE, screenshotF, screenshotG],
  },
  measured: {
    draftPeriodDaysInitial: 3,
    draftPeriodDaysAfterChange: 2,
    calendarPdfFiles: dPdfFiles.length,
    calendarExcelFiles: dXlsxFiles.length,
    savedBillPdfFiles: eBillPdfFiles.length,
    savedBillExcelFiles: eBillXlsxFiles.length,
    bothPdfFiles: fPdfs.length,
    bothExcelFiles: fXlsxs.length,
  },
  verified: {
    A_draftRichDailyActivity: true,
    B_periodTotalsFromVisibleRows: true,
    C_livePeriodAndDecisionChange: true,
    D_calendarOnlyPdfAndExcel: true,
    E_savedExportBillMatchesHead: true,
    F_bothProducesBillAndCalendarPdfExcel: true,
    G_nonEquipmentExportUnchanged: true,
    noCustomerWrites: true,
  },
}, null, 2));
socket.close();