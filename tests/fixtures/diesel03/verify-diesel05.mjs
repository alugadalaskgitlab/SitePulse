// Real Chromium + production page; API data explicitly isolated/synthetic.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";
import XLSX from "xlsx";

const evidence = path.resolve("tests/fixtures/diesel03/evidence/diesel05");
mkdirSync(evidence, { recursive: true });
for (const name of readdirSync(evidence)) if (/^E-opened-pdf-(page|browser-page)\d+\.png$/.test(name)) unlinkSync(path.join(evidence, name));
const pages = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = pages.find(p => p.type === "page");
if (!page) throw Error("No Chromium page on CDP 9223");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let next = 0;
const pending = new Map();
ws.on("message", raw => {
  const msg = JSON.parse(raw);
  if (!pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const js = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const wait = async (expression, label) => {
  for (let i = 0; i < 100; i++) {
    if (await js(expression)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw Error(`Timeout: ${label}: ${await js("document.body.innerText.slice(-1200)")}`);
};
const click = id => js(`document.querySelector('[data-testid="${id}"]').click()`);
const input = (id, value, element = "HTMLInputElement") => js(`(() => {
  const el = document.querySelector('[data-testid="${id}"]');
  Object.getOwnPropertyDescriptor(${element}.prototype, "value").set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
const shot = async name => {
  await new Promise(r => setTimeout(r, 300));
  const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(path.join(evidence, name + ".png"), Buffer.from(result.data, "base64"));
};
const assert = (ok, message) => { if (!ok) throw Error(message); };
const results = [];
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: evidence });
await cdp("Page.navigate", { url: "http://127.0.0.1:4181/?scenario=diesel05" });
await wait(`!!document.querySelector('[data-testid="button-daily-report"]')`, "daily button");
await shot("00-list-entry");
await click("button-daily-report");
await wait(`!!document.querySelector('[data-testid="daily-summary"]')`, "today report");
const today = await js(`document.querySelector('[data-testid="daily-to"]').value`);
const start = await js(`(() => {const d = new Date(${JSON.stringify(today)} + "T12:00:00"); d.setDate(d.getDate()-6); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-")})()`);
const report = await js(`fetch('/api/diesel-requirements/daily-report?from=${today}&to=${today}').then(r=>r.json())`);
const comparison = await js(`fetch('/api/diesel-requirements/comparison?dateFrom=${today}&dateTo=${today}').then(r=>r.json())`);
for (const row of comparison.equipmentWise) {
  const dailyRow = report.groups[0].rows.find(r => r.equipmentId === row.equipmentId);
  assert(dailyRow && dailyRow.planned === row.planned && dailyRow.purchased === row.purchased && dailyRow.issued === row.actual, "A comparison mismatch");
}
await shot("A-today");
results.push("A PASS: today rows independently match existing Comparison API values (isolated fixture).");
await js(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='BACK').click()`);
await click("button-comparison-report");
await input("input-report-date-from", today);
await input("input-report-date-to", today);
await click("button-generate-report");
await wait(`!!document.querySelector('[data-testid="table-report-datewise"]')`, "comparison table");
await shot("A-existing-comparison");
await cdp("Page.navigate", { url: "http://127.0.0.1:4181/?scenario=diesel05" });
await wait(`!!document.querySelector('[data-testid="button-daily-report"]')`, "return daily");
await click("button-daily-report");
await input("daily-from", start);
await wait(`document.querySelectorAll('details[data-testid^="daily-group-"]').length===7`, "seven groups");
const initialOpen = await js(`Array.from(document.querySelectorAll('details')).filter(d=>d.open).map(d=>d.dataset.testid)`);
assert(JSON.stringify(initialOpen) === JSON.stringify([`daily-group-${today}`]), "B expansion defaults");
await shot("B-seven-days");
results.push("B PASS: seven calendar sections, only today expanded by default.");
const fullRange = await js(`fetch('/api/diesel-requirements/daily-report?from=${start}&to=${today}').then(r=>r.json())`);
const flags = [...new Set(fullRange.groups.flatMap(g=>g.rows.map(r=>r.statusFlag)))];
assert(["Not purchased", "Purchased not issued", "Worked but no diesel issued", "OK"].every(f=>flags.includes(f)), "D fixture flags missing");
results.push("D FIXTURE ONLY: four source-reachable flags observed; Issued but not logged tested by status unit test, not fabricated as source data. Real-data evidence is separate.");
await input("daily-equipment", "1701", "HTMLSelectElement");
await wait(`document.querySelector('[data-testid="daily-summary"]')?.textContent.includes('Planned: 130 L')`, "filtered totals");
await js(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
const shown = await js(`Array.from(document.querySelectorAll('tbody tr')).map(r=>r.innerText)`);
assert(shown.length === 2 && shown.every(r=>r.includes("Fixture Excavator")), "C filter row mismatch");
assert(await js(`document.querySelectorAll('details').length`) === 7, "C dates lost");
await shot("C-filtered-seven-days");
results.push("C PASS: selected Excavator only on its two active dates; five empty dates retained, inactive rows omitted; totals 130/100/20 L, 2 issues.");
await input("daily-equipment", "", "HTMLSelectElement");
await wait(`document.querySelector('[data-testid="daily-summary"]')?.textContent.includes('Planned: 215 L')`, "all totals");
await js(`document.querySelectorAll('details').forEach(d=>d.open=true)`);
await shot("D-all-date-flags");
const base = `daily-diesel-${start}-${today}`;
for (const extension of ["xlsx", "pdf"]) if (existsSync(path.join(evidence, `${base}.${extension}`))) unlinkSync(path.join(evidence, `${base}.${extension}`));
await click("daily-export-excel");
await click("daily-export-pdf");
for (let i = 0; i < 100 && (!existsSync(path.join(evidence, base + ".xlsx")) || !existsSync(path.join(evidence, base + ".pdf"))); i++) await new Promise(r=>setTimeout(r,100));
assert(existsSync(path.join(evidence, base + ".xlsx")) && existsSync(path.join(evidence, base + ".pdf")), "E exports missing");
const workbook = XLSX.readFile(path.join(evidence, base + ".xlsx"));
const openedRows = XLSX.utils.sheet_to_json(workbook.Sheets["Daily equipment"], { header: 1 });
writeFileSync(path.join(evidence, "E-opened-excel-data.json"), JSON.stringify(openedRows, null, 2));
assert(openedRows[3][2] === fullRange.totals.planned && openedRows[3][4] === fullRange.totals.purchased && openedRows[3][6] === fullRange.totals.issued && openedRows[3][8] === fullRange.totals.issueCount, "E Excel summary mismatch");
let index = 4;
for (const group of fullRange.groups) {
  assert(openedRows[index][0] === group.date && openedRows[index][1] === `${group.issueCount} issues`, "E Excel grouping mismatch");
  index += 2;
  if (!group.rows.length) { assert(openedRows[index++][0] === "No activity", "E empty day missing"); continue; }
  for (const r of group.rows) {
    assert(JSON.stringify(openedRows[index++]) === JSON.stringify([r.equipmentName, r.planned, r.purchased, r.issued, r.loggedWork ? "Yes" : "No", r.statusFlag]), "E Excel row mismatch");
  }
}
execFileSync("pdftotext", ["-layout", path.join(evidence, base + ".pdf"), path.join(evidence, "E-opened-pdf.txt")]);
const pdfText = readFileSync(path.join(evidence, "E-opened-pdf.txt"), "utf8");
for (const group of fullRange.groups) {
  assert(pdfText.includes(group.date), "E PDF date missing");
  for (const r of group.rows) {
    const line = pdfText.split("\n").find(l=>l.includes(r.equipmentName) && l.includes(r.statusFlag) && new RegExp(`\\s${r.planned}\\s+${r.purchased}\\s+${r.issued}\\s+${r.loggedWork ? "Yes" : "No"}\\s`).test(l));
    assert(line, `E PDF actual row mismatch: ${JSON.stringify(r)}`);
  }
}
assert(pdfText.includes("Planned: 215 L | Purchased: 185 L | Issued: 75 L | Flagged equipment-days: 6"), "E PDF summary mismatch");
execFileSync("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1800", "-png", path.join(evidence, base + ".pdf"), path.join(evidence, "E-opened-pdf-page1")]);
const escape = v => String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
writeFileSync(path.join(evidence, "E-opened-excel.html"), `<!doctype html><meta charset="utf-8"><style>body{font:14px sans-serif;padding:20px}td{border:1px solid #ddd;padding:8px}table{border-collapse:collapse}</style><h1>Opened actual Excel file: ${base}.xlsx</h1><p>ISOLATED API FIXTURE — actual workbook cells read with XLSX.readFile, not a production screenshot.</p><table>${openedRows.map(row=>`<tr>${row.map(c=>`<td>${escape(c)}</td>`).join("")}</tr>`).join("")}</table>`);
await cdp("Page.navigate", { url: `file://${path.join(evidence, "E-opened-excel.html")}` });
await wait(`document.body.innerText.includes('Opened actual Excel file')`, "opened Excel");
await shot("E-opened-excel-browser");
await cdp("Page.navigate", { url: `file://${path.join(evidence, "E-opened-pdf-page1.png")}` });
await wait(`!!document.querySelector('img') && document.querySelector('img').complete`, "opened PDF raster");
await shot("E-opened-pdf-browser");
const pageCount = Number(execFileSync("pdfinfo", [path.join(evidence, base + ".pdf")], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)?.[1] || 1);
for (let pageNumber = 2; pageNumber <= pageCount; pageNumber++) {
  const output = path.join(evidence, `E-opened-pdf-page${pageNumber}`);
  execFileSync("pdftoppm", ["-f", String(pageNumber), "-singlefile", "-scale-to", "1800", "-png", path.join(evidence, base + ".pdf"), output]);
  await cdp("Page.navigate", { url: `file://${output}.png` });
  await wait(`!!document.querySelector('img') && document.querySelector('img').complete`, "opened PDF next page");
  await shot(`E-opened-pdf-browser-page${pageNumber}`);
}
results.push("E PASS: browser downloaded actual PDF/XLSX. Opened workbook cells exactly match every date, row, flag and totals; pdftotext checked every PDF row/date/flag and totals; pdftoppm rendered actual PDF page, opened in browser. Full range 215/185/75 L; 6 flagged equipment-days.");
writeFileSync(path.join(evidence, "browser-results.json"), JSON.stringify({ fixture: "Isolated synthetic API data; production DieselRequirements and DailyDieselReport components", today, start, fullRange, results }, null, 2));
console.log(results.join("\n"));
await cdp("Page.navigate", { url: "http://127.0.0.1:4181/?scenario=diesel05" });
ws.close();