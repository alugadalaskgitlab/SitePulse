/*
 * DPR20 B1: actual SiteReport, synthetic isolated fixture API only.
 * Parent owns Vite :4178 and Chromium CDP :9222; this script never starts,
 * stops or changes servers, production schema, or customer data.
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
const output = "tests/fixtures/dpr-site-entry/evidence";
mkdirSync(output, { recursive: true });
const target = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let serial = 0;
const pending = new Map();
const exceptions = [];
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  if (message.method === "Fetch.requestPaused") {
    // Image request is browser-native, not fetch(): supply an isolated SVG.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180"><rect width="480" height="180" fill="#fff7ed"/><text x="20" y="95" font-size="22">Synthetic DPR20 hose attachment</text></svg>';
    void call("Fetch.fulfillRequest", {
      requestId: message.params.requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "image/svg+xml" }],
      body: Buffer.from(svg).toString("base64"),
    }).catch(error => exceptions.push({ description: error.message }));
  }
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(message.id);
  message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 25000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 300; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText.slice(-1200)")}`);
}
function check(condition, message, evidence) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(evidence)}`);
}
async function screenshot(name, selector = '[data-testid="row-equipment-0"]') {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start',behavior:'instant'})`);
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = `${output}/dpr20-b1-${name}.png`;
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  return path;
}
async function navigate(role = "manager") {
  await call("Page.navigate", { url: `${base}/site/report/20601?dpr20b1=1&role=${role}` });
  await wait(`document.querySelectorAll('[data-testid^="row-equipment-"]').length===4
    && !!document.querySelector('[data-testid="row-equipment-0"]')?.textContent.includes('FASI UDDIN')
    && !!document.querySelector('[data-testid="row-equipment-0"]')?.textContent.includes('GSB')
    && !!document.querySelector('[data-testid="row-equipment-2"]')?.textContent.includes('Synthetic linked-maintenance fallback')
    && !!document.querySelector('[data-testid="badge-equipment-lifecycle-0"]')`);
}

await call("Page.enable");
await call("Runtime.enable");
await call("Fetch.enable", { patterns: [{ urlPattern: "*/objects/dpr20b1-hose.svg", requestStage: "Request" }] });
const result = [];
try {
  for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    // The fixture index has no viewport meta: mobile:false gives actual
    // narrow CSS width rather than Chromium's legacy 980px mobile viewport.
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await call("Emulation.setEmulatedMedia", { media: "screen" });
    await navigate();
    const evidence = await evaluate(`(() => {
      const rows=Array.from(document.querySelectorAll('[data-testid^="row-equipment-"]'));
      const table=rows[0].closest('table');
      return {
        equipmentTables:new Set(rows.map(r=>r.closest('table'))).size,
        compactCards:document.querySelectorAll('[data-testid^="equipment-compact-readonly-"],[data-testid^="equipment-compact-read-group-"]').length,
        nestedEquipmentTables:table.querySelectorAll('table').length,
        headers:Array.from(table.querySelectorAll('thead th')).map(h=>h.textContent.trim()),
        rows:rows.map(r=>r.textContent),
        row0Cells:Array.from(rows[0].querySelectorAll(':scope > td')).map(c=>c.textContent),
        moveButtons:rows.map(r=>!!r.querySelector('[data-testid^="button-move-equipment-"]')),
        lifecycle:rows.map(r=>r.querySelector('[data-testid^="badge-equipment-lifecycle-"]')?.textContent ?? r.lastElementChild.textContent.trim()),
        writes:window.__DprSiteFixture.requests.filter(r=>r.method!=='GET'),
        viewport:innerWidth,
        tableScrollable:table.parentElement.scrollWidth>table.parentElement.clientWidth,
      };
    })()`);
    check(evidence.equipmentTables === 1 && evidence.compactCards === 0 && evidence.nestedEquipmentTables === 0,
      `One equipment table, no duplicate cards (${device})`, evidence);
    check(evidence.headers.join("|") === "Machine|Vehicle No|Operator|Task|Time/Meter|Operating Quantity|Diesel (L)|Expected Diesel|Norm / Efficiency|Breakdown / Stoppage|Diesel Source|Lifecycle",
      "Existing table header structure preserved", evidence.headers);
    const expected = [
      [0, ["Hired: FASI UDDIN", "Daily Status", "Working", "Synthetic shift note",
        "Opening Meter", "100", "Closing Meter", "108", "Start Time", "End Time", "Clock Duration",
        "Meter Working Hours", "8.00 h", "Opening Tank", "30.00 L", "Closing Tank", "20.00 L",
        "Confirmed", "Actual Consumed", "Consumed − expected variance", "Actual Consumption Rate",
        "Synthetic incidental diversion", "Non-BOQ", "not payable progress", "GSB",
        "Synthetic authoritative hydraulic hose", "Repair/payment scope: vendor",
        "Debitable to vendor: Yes", "Synthetic repair paid by vendor", "DPR20_LONG_NOTE_END",
        "synthetic-dpr20-hose.svg"]],
      [1, ["Hired: Vendor not recorded", "Idle", "Operator Unavailable", "Synthetic operator unavailable",
        "Opening Odometer", "Closing Odometer", "Calculated Distance", "40.00 km",
        "Pending confirmation", "Physical tank balance has not been confirmed.", "0.00 L",
        "Expected Consumption Rate", "actual unavailable"]],
      [2, ["Synthetic linked-maintenance fallback", "Synthetic fallback remarks", "completed",
        "Repair/payment scope: hlc", "Debitable to vendor: No",
        "Synthetic station", "SYN-D20-BILL"]],
      [3, ["Synthetic independent hauling", "3 trips × 5 km", "Saved quantity: 15.000 km",
        "Calculated Distance: 30.00 km", "trip based"]],
    ];
    for (const [index, tokens] of expected) for (const token of tokens) {
      check(evidence.rows[index].includes(token), `Parity row ${index} missing '${token}' (${device})`, evidence.rows[index]);
    }
    check(evidence.moveButtons.join() === "true,false,false,false", "Original lifecycle eligibility", evidence);
    check(evidence.lifecycle[0] === "Closed by Synthetic operator"
      && evidence.lifecycle[1].startsWith("Pending at SITE")
      && evidence.lifecycle[2] === "Completed at HMP" && evidence.lifecycle[3] === "—",
    "Lifecycle labels and neutral free-text placeholder", evidence.lifecycle);
    check(evidence.writes.length === 0, "Read-only render makes no writes", evidence.writes);
    result.push({ device, evidence, screenshot: await screenshot(device) });

    // Preserve saved attachment viewing, not just its filename.
    await evaluate(`Array.from(document.querySelectorAll('[data-testid="row-equipment-0"] button'))
      .find(b=>b.textContent.includes('View attachment:'))?.click()`);
    await wait(`!!document.querySelector('[data-testid="viewer-image-20991"]')`);
    check(await evaluate(`document.querySelector('[data-testid="viewer-image-20991"]').getAttribute('src') === '/objects/dpr20b1-hose.svg'`),
      "Attachment viewer retains safe object path", device);
    result.push({ device, attachmentScreenshot: await screenshot(`${device}-attachment`, '[data-testid="attachment-viewer"]') });
    // Navigate rather than alter fixture's history handler while dismissing.
    await navigate();
  }

  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setEmulatedMedia", { media: "print" });
  await navigate();
  const print = await evaluate(`(() => {
    const rows=Array.from(document.querySelectorAll('[data-testid^="row-equipment-"]'));
    const table=rows[0].closest('table');
    return {
      tables:new Set(rows.map(r=>r.closest('table'))).size,
      visibleHeaders:Array.from(table.querySelectorAll('thead th')).filter(h=>getComputedStyle(h).display!=='none').map(h=>h.textContent.trim()),
      lifecycleHidden:rows.every(r=>getComputedStyle(r.lastElementChild).display==='none'),
      detailsPresent:rows[0].textContent.includes('Synthetic authoritative hydraulic hose') && rows[0].textContent.includes('GSB'),
    };
  })()`);
  check(print.tables === 1 && print.visibleHeaders.length === 11 && print.lifecycleHidden && print.detailsPresent,
    "Print retains one audit table with original print-hidden Lifecycle", print);
  result.push({ print, screenshot: await screenshot("print") });
  const pdf = await call("Page.printToPDF", { printBackground: true, landscape: true, preferCSSPageSize: true });
  writeFileSync(`${output}/dpr20-b1-print.pdf`, Buffer.from(pdf.data, "base64"));
  // DOM presence alone is not proof of print preservation: inspect the
  // actual paginated PDF, including rightmost columns and oversized notes.
  const pdfText = execFileSync("pdftotext", ["-raw", `${output}/dpr20-b1-print.pdf`, "-"], { encoding: "utf8" });
  writeFileSync(`${output}/dpr20-b1-print-raw.txt`, pdfText);
  const foldedPdf = pdfText.replace(/\s+/g, "");
  const printedRequired = [
    "Machine", "Vehicle No", "Operator", "Task", "Time/Meter", "Operating Quantity",
    "Diesel (L)", "Expected Diesel", "Norm / Efficiency", "Breakdown / Stoppage", "Diesel Source",
    "SYNTHETIC DPR20 HIRE ROLLER", "SYNTHETIC DPR20 MISSING VENDOR",
    "SYNTHETIC DPR20 LINKED FALLBACK", "FREE TEXT", "Machine day: 4",
    "FASI UDDIN", "Vendor not recorded", "Synthetic shift note", "Synthetic operator unavailable",
    "GSB LAYING", "Assigned: 2 h", "Unassigned: 2 h", "Clock Duration: 4 h",
    "Meter Working Hours: 8.00 h", "30.00 L", "20.00 L", "Pending confirmation",
    "Actual Consumed", "3.75 L/hr", "Synthetic authoritative hydraulic hose",
    "Repair/payment scope: vendor", "Debitable to vendor: Yes", "Synthetic repair paid by vendor",
    "SYNTHETIC_DPR20_LONG_REFERENCE_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "DPR20_LONG_NOTE_END", "synthetic-dpr20-hose.svg",
    "Synthetic linked-maintenance fallback", "Synthetic fallback remarks",
    "Direct Purchase", "Synthetic station", "SYN-D20-BILL", "Contractor", "Plant Stock",
    // The fourth row intentionally fragments over pages: repeated table
    // headers can occur between its label and value in extracted text.
    "15.000 km", "Calculated Distance: 30.00 km",
  ];
  for (const token of printedRequired) check(foldedPdf.includes(token.replace(/\s+/g, "")),
    `Actual PDF lost '${token}' (print clipping/fragmentation)`, `${output}/dpr20-b1-print.pdf`);
  check(!foldedPdf.includes("Sendonward") && !foldedPdf.includes("ClosedbySyntheticoperator"),
    "PDF retains original hidden Lifecycle/actions", `${output}/dpr20-b1-print.pdf`);
  const longNoteSentence = "Synthetic long audit note preserves responsibility, work assignment, fuel evidence and repair history across printed page boundaries.";
  const longNoteCount = foldedPdf.split(longNoteSentence.replace(/\s+/g, "")).length - 1;
  check(longNoteCount === 6, "All six long-note sentences survive page fragmentation", longNoteCount);
  const coordinateAudit = JSON.parse(execFileSync("python3", [".agents/scripts/dpr20-b1-pdf.py"], { encoding: "utf8" }));
  check(coordinateAudit.out_of_page_words.length === 0, "No printed words extend past page bounds", coordinateAudit);
  const printAudit = { requiredTokens: printedRequired.length,
    allTokensPresent: true, longNoteCount, coordinateAudit,
    pageCount: pdfText.split("\f").filter(part => part.trim()).length };
  result.push({ printAudit });
  await call("Emulation.setEmulatedMedia", { media: "screen" });

  // Existing viewer permissions: status text still visible, action absent.
  await navigate("viewer");
  const viewer = await evaluate(`({
    moves:document.querySelectorAll('[data-testid^="button-move-equipment-"]').length,
    closed:document.querySelector('[data-testid="badge-equipment-lifecycle-0"]').textContent,
    deletes:document.querySelectorAll('[data-testid="button-delete-report"]').length,
    writes:window.__DprSiteFixture.requests.filter(r=>r.method!=='GET')
  })`);
  check(viewer.moves === 0 && viewer.closed === "Closed by Synthetic operator" && viewer.writes.length === 0,
    "Viewer keeps lifecycle label without move permission", viewer);
  result.push({ viewer });

  for (const [label, destinationType, destinationSite] of [
    ["HMP Plant", "hmp", undefined], ["RMC Plant", "rmc", undefined],
    ["NARASIMHULU ROAD", "site", "NARASIMHULU ROAD"],
  ]) {
    await navigate("manager");
    await evaluate(`document.querySelector('[data-testid="button-move-equipment-0"]').click()`);
    await wait(`!!document.querySelector('[data-testid="select-move-destination-0"]')`);
    check(await evaluate(`document.querySelector('[data-testid="button-confirm-move-0"]').disabled`),
      "Send disabled until destination selected", label);
    check(await evaluate(`document.querySelector('[data-testid="input-successor-date-0"]').value==='2026-08-05'`),
      "Send onward initializes date from DPR", label);
    await evaluate(`document.querySelector('[data-testid="select-move-destination-0"]').click()`);
    await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(o=>o.textContent.includes(${JSON.stringify(label)}))`);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(o=>o.textContent.includes(${JSON.stringify(label)})).click()`);
    await evaluate(`(() => {
      const input=document.querySelector('[data-testid="input-successor-date-0"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2026-08-06');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    check(!await evaluate(`document.querySelector('[data-testid="button-confirm-move-0"]').disabled`),
      "Selected destination enables existing Send action", label);
    const controlsScreenshot = await screenshot(`send-${destinationType}`, '[data-testid="select-move-destination-0"]');
    await evaluate(`document.querySelector('[data-testid="button-confirm-move-0"]').click()`);
    await wait(`window.__DprSiteFixture.requests.some(r=>r.method==='POST'&&r.path==='/api/equipment-usage/20801/move')
      && !document.querySelector('[data-testid="button-confirm-move-0"]')`);
    const writes = await evaluate(`window.__DprSiteFixture.requests.filter(r=>r.method!=='GET')`);
    const body = { destinationType, ...(destinationSite ? { destinationSite } : {}), successorDate: "2026-08-06" };
    check(writes.length === 1 && writes[0].method === "POST" && writes[0].path === "/api/equipment-usage/20801/move"
      && JSON.stringify(writes[0].body) === JSON.stringify(body), "Unchanged move endpoint and payload (intercepted only)", writes);
    result.push({ destination: label, writes, screenshot: controlsScreenshot });
  }
  check(exceptions.length === 0, "No uncaught browser exceptions", exceptions);
  writeFileSync(`${output}/dpr20-b1-result.json`, JSON.stringify({
    source: "isolated synthetic fixture, real SiteReport and move UI, intercepted APIs, no customer database",
    result,
  }, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}