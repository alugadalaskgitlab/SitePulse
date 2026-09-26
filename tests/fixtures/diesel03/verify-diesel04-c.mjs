// Isolated production-component fixture; no live API or business writes.
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import XLSX from "xlsx";

const evidence = path.resolve("tests/fixtures/diesel03/evidence");
mkdirSync(evidence, { recursive: true });
for (const name of readdirSync(evidence)) if (/^diesel-comparison-2026-09-15-2026-09-16(?: \(\d+\))?\.xlsx$/.test(name)) unlinkSync(path.join(evidence, name));
const pages = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = pages.find(p => p.type === "page");
if (!page) throw Error("No Chromium CDP page on port 9223");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let counter = 0;
const pending = new Map();
ws.on("message", raw => {
  const msg = JSON.parse(raw);
  if (!pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++counter;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async code => {
  const result = await cdp("Runtime.evaluate", { expression: code, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result.value;
};
const wait = async (code, label) => {
  for (let i = 0; i < 100; i++) {
    if (await js(code)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`Timeout ${label}: ${await js("document.body.innerText.slice(-500)")}`);
};
const click = id => js(`document.querySelector('[data-testid="${id}"]').click()`);
const input = (id, value) => js(`(() => { const e=document.querySelector('[data-testid="${id}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
const shot = async label => {
  await new Promise(r => setTimeout(r, 350));
  writeFileSync(path.join(evidence, `diesel04-c-${label}.png`), Buffer.from((await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true })).data, "base64"));
};
const assert = (condition, message) => { if (!condition) throw Error(message); };
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: evidence, eventsEnabled: true });
await cdp("Page.navigate", { url: "http://127.0.0.1:4181/?scenario=diesel04" });
await wait(`!!document.querySelector('[data-testid="button-comparison-report"]')`, "report button");
await click("button-comparison-report");
await input("input-report-date-from", "2026-09-15");
await input("input-report-date-to", "2026-09-16");
await click("button-generate-report");
await wait(`!!document.querySelector('[data-testid="button-report-actual-2026-09-15"]')`, "date table");
assert(await js(`document.querySelector('[data-testid="table-report-datewise"]').innerText.includes('PLANNED VS ACTUAL ISSUED')`), "missing delta");
await shot("A-datewise-range");
await click("button-export-comparison");
const filename = "diesel-comparison-2026-09-15-2026-09-16.xlsx";
const download = path.join(evidence, filename);
for (let i = 0; i < 100 && !readdirSync(evidence).includes(filename); i++) await new Promise(r => setTimeout(r, 100));
assert(readdirSync(evidence).includes(filename), "main XLSX missing");
const main = XLSX.readFile(download);
assert(main.SheetNames.join() === "Date-wise", "main sheet mismatch");
const mainRows = XLSX.utils.sheet_to_json(main.Sheets["Date-wise"]);
assert(mainRows.length === 3 && mainRows[2]["Planned vs Actual Issued (L)"] === 90, "main workbook totals/delta");
await shot("D-export-main");
await click("button-report-actual-2026-09-15");
await wait(`document.querySelector('[data-testid="table-report-equipment"]')?.innerText.includes('Purchased but not logged as issued')`, "single-day equipment / gap flag");
assert(await js(`document.querySelector('[data-testid="text-report-equipment-scope"]').innerText.includes('2026-09-15')`), "single scope");
await shot("B-single-date-gap");
await click("button-export-comparison-equipment");
const nextDownload = async scope => {
  for (let i = 0; i < 100; i++) {
    for (const name of readdirSync(evidence).filter(n => n.endsWith(".xlsx"))) {
      try {
        const candidate = XLSX.readFile(path.join(evidence, name));
        if (candidate.SheetNames.includes("Equipment breakdown") && XLSX.utils.sheet_to_json(candidate.Sheets["Equipment breakdown"], { header: 1 })[0]?.[1] === scope) return path.join(evidence, name);
      } catch { /* download still in progress */ }
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`Missing export scope ${scope}`);
};
const singlePath = await nextDownload("Date 2026-09-15");
const single = XLSX.readFile(singlePath);
assert(single.SheetNames.includes("Equipment breakdown"), "single date breakdown missing");
let rows = XLSX.utils.sheet_to_json(single.Sheets["Equipment breakdown"], { header: 1 });
assert(rows[0][1].includes("Date 2026-09-15") && rows.some(r => r.includes("YES")), "single date scope/gap workbook");
await shot("E-export-single");
await js(`document.querySelector('[data-state="open"][role="dialog"] button[aria-label="Close"]')?.click() || document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
await wait(`!document.querySelector('[data-testid="dialog-report-equipment"]')`, "modal closed");
await click("card-report-actual");
await wait(`document.querySelector('[data-testid="text-report-equipment-scope"]')?.innerText.includes('Selected range')`, "range scope");
await shot("C-range");
await click("button-export-comparison-equipment");
const rangePath = await nextDownload("Range 2026-09-15 to 2026-09-16");
rows = XLSX.utils.sheet_to_json(XLSX.readFile(rangePath).Sheets["Equipment breakdown"], { header: 1 });
assert(rows[0][1].includes("Range 2026-09-15 to 2026-09-16"), "range workbook scope");
await shot("E-export-range");
// Chromium may replace the same filename or assign a numbered suffix.
console.log(JSON.stringify({ evidence, workbook: download, mainRows, rangeEquipmentRows: rows }));
ws.close();