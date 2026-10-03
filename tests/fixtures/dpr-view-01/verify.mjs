import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";
const output = path.resolve(".agents/outputs/dpr-view-01");
mkdirSync(output, { recursive: true });
const base = "http://127.0.0.1:4189";
const target = await (await fetch("http://127.0.0.1:9239/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
let id = 0;
const pending = new Map();
const errors = [];
ws.on("message", raw => {
  const response = JSON.parse(raw);
  if (response.method === "Runtime.exceptionThrown") errors.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text);
  const waiting = pending.get(response.id);
  if (!waiting) return;
  pending.delete(response.id);
  response.error ? waiting.reject(new Error(JSON.stringify(response.error))) : waiting.resolve(response.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const current = ++id;
  pending.set(current, { resolve, reject });
  ws.send(JSON.stringify({ id: current, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, text) => { if (!value) throw new Error(text); };
const waitFor = async (expression, label) => {
  for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error(`Timeout: ${label}`);
};
const results = { fixtureOnly: true, baselineCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), cases: [], browserErrors: errors };
const navigate = async (page, version, width, scenario = "") => {
  await cdp("Emulation.setEmulatedMedia", { media: "screen" });
  await cdp("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false });
  const route = page === "SiteReport" ? "/site/report/409" : "/dpr/409";
  await cdp("Page.navigate", { url: `${base}${route}?version=${version}${scenario ? `&scenario=${scenario}` : ""}` });
  await waitFor("document.readyState === 'complete' && document.querySelector('[data-testid=\"fixture-evidence-notice\"]') && document.body.innerText.includes('SOIL COMPACTOR')", `${page} ${version}`);
  await sleep(450);
};
const screenshot = async (name, full = true) => {
  const { cssContentSize } = await cdp("Page.getLayoutMetrics");
  const params = { format: "png", fromSurface: true, captureBeyondViewport: full };
  if (full) params.clip = { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 };
  const result = await cdp("Page.captureScreenshot", params);
  writeFileSync(path.join(output, `${name}.png`), Buffer.from(result.data, "base64"));
};
await cdp("Page.enable");
await cdp("Runtime.enable");
try {
  for (const page of ["SiteReport", "DprDetails"]) for (const version of ["before", "after"]) for (const width of [1280, 390]) {
    await navigate(page, version, width);
    if (version === "before") {
      // Old SiteReport is always expanded. Old DprDetails uses compact buttons.
      await evaluate(`document.querySelectorAll('button[aria-expanded="true"]').forEach(b => {if(b.closest('[data-testid^="equipment-compact-"]')) b.click()}); document.querySelectorAll('details').forEach(d=>d.open=false);`);
    }
    const name = `${page.toLowerCase()}-${version}-${width === 390 ? "phone" : "desktop"}`;
    await screenshot(`${name}-closed`);
    await evaluate(`document.querySelector('[data-testid="row-equipment-0"],[data-testid="equipment-compact-0"]')?.scrollIntoView({block:'start'})`);
    await screenshot(`${name}-equipment-viewport`, false);
    const closed = await evaluate(`({width:innerWidth,documentWidth:document.documentElement.scrollWidth,panels:[...document.querySelectorAll('.equipment-audit-panel')].map(x=>({expanded:x.dataset.expanded,display:getComputedStyle(x).display})),rowHeights:[...document.querySelectorAll('.equipment-summary-row')].map(x=>x.getBoundingClientRect().height),baselineRowHeights:[...document.querySelectorAll('[data-testid^="row-equipment-"],[data-testid^="equipment-compact-readonly-"]')].map(x=>x.getBoundingClientRect().height),equipmentTables:[...document.querySelectorAll('table')].filter(t=>t.getAttribute('aria-label')==='Equipment Log').length,lifecycleContained:[...document.querySelectorAll('.equipment-lifecycle .inline-flex')].every(x=>x.getBoundingClientRect().right<=x.closest('td').getBoundingClientRect().right)})`);
    if (version === "after") {
      assert(closed.panels.length === 3 && closed.panels.every(x => x.display === "none"), `${name}: audit not closed`);
      assert(closed.equipmentTables === 1, `${name}: duplicate equipment tables`);
      assert(closed.documentWidth <= width, `${name}: horizontal overflow`);
      assert(closed.lifecycleContained, `${name}: lifecycle badge protrudes outside cell`);
      if (width === 1280) {
        closed.visualLines = await evaluate(`[...document.querySelectorAll('.equipment-summary-row')].map(row=>[...row.cells].filter(cell=>!cell.classList.contains('equipment-lifecycle')).map(cell=>{const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);const bottoms=[];while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const rect of range.getClientRects()){if(rect.width>0&&rect.height>0&&!bottoms.some(y=>Math.abs(y-rect.bottom)<4))bottoms.push(rect.bottom)}}return bottoms.length}))`);
        assert(closed.visualLines.flat().every(lines => lines <= 4), `${name}: typical summary exceeds four visual lines`);
      }
      assert(await evaluate(`document.querySelector('[data-testid="equipment-consumption-0"]').innerText.includes('10.5 L/hr') && document.querySelector('[data-testid="equipment-consumption-1"]').innerText.includes('1.6 L/hr') && document.querySelector('[data-testid="equipment-consumption-2"]').innerText.includes('2.9 L/hr')`), `${name}: consumption not mockup-derived measured figures`);
      await evaluate(`document.querySelectorAll('[data-testid^="button-equipment-details-"]').forEach(b=>b.click())`);
    } else {
      await evaluate(`document.querySelectorAll('button[aria-expanded="false"]').forEach(b=>{if(b.closest('[data-testid^="equipment-compact-"]')) b.click()}); document.querySelectorAll('details').forEach(d=>d.open=true)`);
    }
    await cdp("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
    await screenshot(`${name}-expanded`);
    const expanded = await evaluate(`({documentWidth:document.documentElement.scrollWidth,panels:[...document.querySelectorAll('.equipment-audit-panel')].map(x=>getComputedStyle(x).display)})`);
    if (version === "after") assert(expanded.panels.every(x => x !== "none") && expanded.documentWidth <= width, `${name}: expanded panels/overflow`);
    results.cases.push({ page, version, width, closed, expanded, baselineNote: version === "before" ? "Both HEAD read-only views expose equipment audit without a collapsible equipment toggle; closed screenshot denotes default screen state, not a nonexistent toggle." : undefined });
  }
  // Exercise the real preserved Lifecycle subtree with fixture-only mutation.
  await navigate("SiteReport", "after", 1280);
  await evaluate("document.querySelector('[data-testid=\"button-move-equipment-0\"]').click()");
  await waitFor("!!document.querySelector('[data-testid=\"select-move-destination-0\"]')", "move form");
  await evaluate("document.querySelector('[data-testid=\"select-move-destination-0\"]').click()");
  await waitFor("!!document.querySelector('[role=\"option\"]')", "destination options");
  await evaluate("[...document.querySelectorAll('[role=\"option\"]')].find(x=>x.innerText==='HMP Plant').click()");
  await evaluate("document.querySelector('[data-testid=\"button-confirm-move-0\"]').click()");
  await waitFor("window.__DprView01Fixture.moves.length===1", "fixture move submitted");
  results.lifecycleMove = await evaluate("window.__DprView01Fixture.moves[0]");
  assert(results.lifecycleMove.destinationType === "hmp" && results.lifecycleMove.successorDate === "2026-10-02", "Lifecycle payload changed");
  await navigate("SiteReport", "after", 1280);
  await cdp("Emulation.setEmulatedMedia", { media: "print" });
  const normalPrintPanels = await evaluate(`[...document.querySelectorAll('.equipment-audit-panel')].map(x=>getComputedStyle(x).display)`);
  assert(normalPrintPanels.length === 3 && normalPrintPanels.every(display => display !== "none"), "Normal print lost audit panels");
  const normalPdf = await cdp("Page.printToPDF", { printBackground: true, paperWidth: 8.27, paperHeight: 11.69, marginTop: .35, marginBottom: .35, marginLeft: .3, marginRight: .3, displayHeaderFooter: false });
  const normalPdfPath = path.join(output, "sitereport-after-mockup409.pdf");
  writeFileSync(normalPdfPath, Buffer.from(normalPdf.data, "base64"));
  execFileSync("pdftotext", ["-layout", normalPdfPath, path.join(output, "sitereport-after-mockup409.txt")]);
  const normalText = execFileSync("pdftotext", ["-layout", normalPdfPath, "-"], { encoding: "utf8" });
  assert((normalText.match(/uses canonical confirmed performance/g) ?? []).length === 1, "Normal PDF legend not printed exactly once");
  assert(!/Send onward|Closed by Fixture|Pending at|HMP Plant/.test(normalText), "Normal PDF exposed Lifecycle");
  execFileSync("pdftoppm", ["-scale-to", "1400", "-png", normalPdfPath, path.join(output, "sitereport-after-mockup409-print-page")]);
  results.normalPrint = { panels: normalPrintPanels, info: execFileSync("pdfinfo", [normalPdfPath], { encoding: "utf8" }) };
  // Print begins from CLOSED state: CSS, not a screen toggle, must expose audit.
  await navigate("SiteReport", "after", 1280, "audit-stress");
  await cdp("Emulation.setEmulatedMedia", { media: "print" });
  results.printPanels = await evaluate(`[...document.querySelectorAll('.equipment-audit-panel')].map(x=>({screenExpanded:x.dataset.expanded,display:getComputedStyle(x).display}))`);
  assert(results.printPanels.length === 3 && results.printPanels.every(x => x.screenExpanded === "false" && x.display !== "none"), "Print did not force closed audit open");
  assert(await evaluate(`[...document.querySelectorAll('.equipment-lifecycle')].every(x=>getComputedStyle(x).display==='none')`), "Lifecycle visible in print");
  const pdf = await cdp("Page.printToPDF", { printBackground: true, preferCSSPageSize: false, paperWidth: 8.27, paperHeight: 11.69, marginTop: .35, marginBottom: .35, marginLeft: .3, marginRight: .3, displayHeaderFooter: false });
  const pdfPath = path.join(output, "sitereport-after-audit-stress.pdf");
  writeFileSync(pdfPath, Buffer.from(pdf.data, "base64"));
  execFileSync("pdftotext", ["-layout", pdfPath, path.join(output, "sitereport-after-audit-stress.txt")]);
  const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf8" });
  const normalized = text.replace(/\s+/g, "");
  assert((text.match(/uses canonical confirmed performance/g) ?? []).length === 1, "Stress PDF legend not printed exactly once");
  const withoutRepeatedHeaders = normalized.replaceAll("MachineWorkUsageDieselConsumptionNotes", "");
  for (const expected of ["SOIL COMPACTOR", "TRACTOR – RATNAM", "TRACTOR DOZER", "Saved expected diesel", "DPR snapshot consumed", "Assigned:", "Unassigned:", "Machine Day:", "AUDIT-PARAGRAPH-1:", "AUDIT-PARAGRAPH-95:", "END-LONG-REMARKS-409", "END_FILENAME.pdf", "Linked inspection resolved", "measured"]) assert(normalized.includes(expected.replace(/\s+/g, "")), `PDF missing ${expected}`);
  const filename = await evaluate("window.__DprView01Fixture.longFilename");
  assert(normalized.includes(filename), "PDF clipped long attachment filename");
  assert(!/Send onward|Closed by Fixture|Pending at|HMP Plant/.test(text), "PDF exposed Lifecycle");
  const remarks = await evaluate("window.__DprView01Fixture.longRemarks");
  results.pdf = { path: pdfPath, pageInfo: execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" }), allRemarkParagraphs: remarks.split("\n").every(paragraph => withoutRepeatedHeaders.includes(paragraph.replace(/\s+/g, ""))), filenamePreserved: normalized.includes(filename), noLifecycle: true };
  assert(results.pdf.allRemarkParagraphs, "Some PDF remark paragraphs clipped");
  execFileSync("pdftoppm", ["-scale-to", "1400", "-png", pdfPath, path.join(output, "sitereport-after-print-page")]);
  await screenshot("sitereport-after-print-media-expanded");
  assert(errors.length === 0, `Browser exceptions: ${errors.join("\n")}`);
  results.success = true;
  console.log(JSON.stringify({ success: true, cases: results.cases.length, lifecycleMove: results.lifecycleMove, printPanels: results.printPanels, pdf: results.pdf }, null, 2));
} finally {
  writeFileSync(path.join(output, "verification-results.json"), JSON.stringify(results, null, 2));
  ws.close();
}