/*
 * DPR20 B2: real SiteReport + real pure performance-report builder, synthetic
 * intercepted GETs. Parent owns Vite4178/CDP9222; never starts servers/writes.
 * Run only after the B2 implementation is ready.
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
  for (let i = 0; i < 400; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText.slice(-1600)")}`);
}
function check(condition, message, evidence) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(evidence)}`);
}
async function screenshot(name, selector = '[data-testid="row-equipment-0"]') {
  await evaluate(`(() => {
    const row=document.querySelector(${JSON.stringify(selector)});
    const actual=row?.querySelector('[data-testid^="equipment-table-efficiency-"]');
    (actual ?? row)?.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const table=row?.closest('table');
    const cell=row?.querySelector(':scope > td:nth-child(9)');
    if(table && cell) table.parentElement.scrollLeft=Math.max(0,cell.offsetLeft-100);
  })()`);
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = `${output}/dpr20-b2-${name}.png`;
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  return path;
}
async function navigate(role = "manager", scenario = "normal") {
  await call("Page.navigate", { url: `${base}/site/report/22601?dpr20b2=1&role=${role}&scenario=${scenario}` });
  await wait(`document.querySelectorAll('[data-testid^="row-equipment-"]').length===11
    && !!document.querySelector('[data-testid="badge-equipment-lifecycle-0"]')`);
}
async function settled() {
  await wait(`Array.from(document.querySelectorAll('[data-testid^="row-equipment-"]'))
    .every(r=>/Actual:/.test(r.querySelector(':scope > td:nth-child(9)').textContent)
      && !/loading|fetching|checking confirmed/i.test(r.querySelector(':scope > td:nth-child(9)').textContent))`);
}
async function collect() {
  return evaluate(`(() => {
    const rows=Array.from(document.querySelectorAll('[data-testid^="row-equipment-"]'));
    const table=rows[0].closest('table');
    return {
      equipmentTables:new Set(rows.map(r=>r.closest('table'))).size,
      compactCards:document.querySelectorAll('[data-testid^="equipment-compact-readonly-"],[data-testid^="equipment-compact-read-group-"]').length,
      headers:Array.from(table.querySelectorAll('thead th')).map(h=>h.textContent.trim()),
      efficiencies:rows.map(r=>r.querySelector(':scope > td:nth-child(9)').textContent),
      lifecycle:rows.slice(0,3).map(r=>r.querySelector('[data-testid^="badge-equipment-lifecycle-"]')?.textContent),
      moveButtons:rows.map(r=>!!r.querySelector('[data-testid^="button-move-equipment-"]')),
      writes:window.__DprSiteFixture.requests.filter(r=>r.method!=='GET'),
      performanceRequests:window.__DprSiteFixture.requests.filter(r=>r.path.startsWith('/api/reports/equipment-performance')),
      canonicalReferences:window.__DprSiteFixture.dpr20B2Performance.events.map(e=>e.reference),
      canonicalEventBases:window.__DprSiteFixture.dpr20B2Performance.events.map(e=>({reference:e.reference,usageBasis:e.usageBasis,usageValue:e.usageValue,unit:e.dieselEfficiencyUnit})),
      actualBlocks:rows.map(r=>r.querySelector('[data-testid^="equipment-table-efficiency-"]').textContent),
      canonicalDay:window.__DprSiteFixture.dpr20B2Performance.fleet.find(f=>f.equipmentId===21701).dailyRows,
      viewport:innerWidth,
    };
  })()`);
}

await call("Page.enable");
await call("Runtime.enable");
const result = [];
try {
  for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await call("Emulation.setEmulatedMedia", { media: "screen" });
    await navigate();
    await settled();
    const evidence = await collect();
    check(evidence.equipmentTables === 1 && evidence.compactCards === 0, "B1 one table preserved", evidence);
    check(evidence.headers.join("|") === "Machine|Vehicle No|Operator|Task|Time/Meter|Operating Quantity|Diesel (L)|Expected Diesel|Norm / Efficiency|Breakdown / Stoppage|Diesel Source|Lifecycle",
      "Existing 12 columns preserved", evidence.headers);
    for (const [row, value, unit] of [[8, "3.75", "L/hr"], [1, "0.20", "L/km"], [2, "0", "L/hr"], [10, "2.5", "L/hr"]]) {
      // Parse rather than assuming a particular decimal precision.
      const actual = evidence.efficiencies[row].match(/Actual:\s*([0-9.]+)\s*(L\/hr|L\/km)/);
      check(actual && Number(actual[1]) === Number(value) && actual[2] === unit,
        `Exact canonical row ${row} actual ${value} ${unit}, not snapshot or fleet/day rate`, evidence.efficiencies[row]);
      check(/Norm:/i.test(evidence.efficiencies[row]), `Row ${row} retains labeled saved Norm`, evidence.efficiencies[row]);
    }
    check(/Norm:\s*5(?:\.0+)?\s*L\/hr/.test(evidence.efficiencies[0]), "Existing saved hourly norm", evidence.efficiencies[0]);
    check([0, 6].every(row => /Actual:\s*unavailable.*multiple same-day records/i.test(evidence.efficiencies[row])),
      "Same-day source rows preserve conservative canonical chronology guard, never manufactured isolated or day rates", evidence.efficiencies);
    check(/Norm:\s*0\.3(?:0+)?\s*L\/km/.test(evidence.efficiencies[1]), "Existing saved odometer norm", evidence.efficiencies[1]);
    check(/Actual:\s*pending/i.test(evidence.efficiencies[3]), "Missing confirmed tank data is pending", evidence.efficiencies[3]);
    check(/Actual:\s*unavailable/i.test(evidence.efficiencies[4]), "No runtime never invents a number", evidence.efficiencies[4]);
    check(/Actual:\s*unavailable/i.test(evidence.efficiencies[5]), "Absent exact source ignores other DPR's same equipment/day", evidence.efficiencies[5]);
    check(/Actual:\s*(pending|unavailable)/i.test(evidence.efficiencies[7]), "Legacy exact log does not use issued-only or saved-dip rate as canonical", evidence.efficiencies[7]);
    check(/Actual:\s*unavailable/i.test(evidence.efficiencies[9]) && /estimat/i.test(evidence.actualBlocks[9]),
      "Time-only odometer distance is estimated, never a confirmed Actual km rate", evidence.efficiencies[9]);
    const estimatedEvent = evidence.canonicalEventBases.find(event => event.reference.plantUsageId === 22810);
    check(estimatedEvent?.usageBasis === "time_fallback" && estimatedEvent?.unit === "L/km" && estimatedEvent?.usageValue > 0,
      "Estimated-distance fixture exercises the real builder's time_fallback L/km event", estimatedEvent);
    const clockEvent = evidence.canonicalEventBases.find(event => event.reference.plantUsageId === 22811);
    check(clockEvent?.usageBasis === "time_fallback" && clockEvent?.unit === "L/hr" && clockEvent?.usageValue === 4,
      "Clock-hour fixture supplies real measured start/end duration, no meter delta", clockEvent);
    check(/clock|start.?end/i.test(evidence.actualBlocks[10]),
      "Clock-derived L/hr rate declares clock provenance rather than suggesting meter runtime", evidence.actualBlocks[10]);
    check(/runtime from recorded hour-meter readings/i.test(evidence.actualBlocks[8]),
      "Measured hour-meter rate keeps its distinct real-meter provenance", evidence.actualBlocks[8]);
    check(evidence.efficiencies.every(text => (text.match(/Actual:/g) || []).length === 1),
      "Exactly one clearly labeled canonical Actual per row", evidence.efficiencies);
    check(!/Actual variance:/.test(evidence.efficiencies.join("")) && /Issued\s*[−-]\s*expected/i.test(evidence.efficiencies[0]),
      "Old liters delta accurately labeled, not actual efficiency", evidence.efficiencies[0]);
    check(evidence.canonicalDay[0].consumptionRate !== 3.75 && evidence.canonicalDay[0].consumptionRate !== 1.5,
      "Fixture genuinely contains a distinct mixed-shift day aggregate", evidence.canonicalDay);
    check(evidence.lifecycle.join("|") === "Closed by Synthetic operator|Pending at SITE: NARASIMHULU ROAD|Completed at HMP",
      "B1 Lifecycle labels unchanged", evidence.lifecycle);
    check(evidence.moveButtons[0] && !evidence.moveButtons[1] && !evidence.moveButtons[2],
      "Closed/open/successor Send onward eligibility unchanged", evidence.moveButtons);
    check(evidence.writes.length === 0 && evidence.performanceRequests.length > 0, "Intercepted read-only report requests only", evidence);
    for (const request of evidence.performanceRequests) {
      const url = new URL(request.path, base);
      check(request.method === "GET" && url.searchParams.get("dateFrom") === "2026-08-05"
        && url.searchParams.get("dateTo") === "2026-08-05"
        && !url.searchParams.has("projectId") && !url.searchParams.has("scope"),
      "Same-day canonical context without project/site narrowing", request);
    }
    result.push({ device, evidence, screenshot: await screenshot(device, '[data-testid="row-equipment-8"]') });
    result.push({ device, zeroScreenshot: await screenshot(`${device}-zero`, '[data-testid="row-equipment-2"]'),
      pendingScreenshot: await screenshot(`${device}-pending`, '[data-testid="row-equipment-3"]') });
    result.push({ device, estimatedScreenshot: await screenshot(`${device}-estimated`, '[data-testid="row-equipment-9"]'),
      clockScreenshot: await screenshot(`${device}-clock`, '[data-testid="row-equipment-10"]') });
  }

  for (const [role, scenario] of [["site-only", "normal"], ["manager", "failure"], ["manager", "forbidden"], ["manager", "restricted"]]) {
    await navigate(role, scenario);
    await settled();
    const evidence = await collect();
    check(evidence.efficiencies.every(text => /Actual:\s*unavailable/i.test(text)),
      `${role}/${scenario} actual is safely unavailable`, evidence.efficiencies);
    check(evidence.efficiencies.every(text => !/Actual:\s*[0-9]/.test(text)),
      "No norm/snapshot/issued fallback masquerades as Actual", evidence.efficiencies);
    if (role === "site-only") check(evidence.performanceRequests.length === 0, "Denied permissions make no performance fetch", evidence.performanceRequests);
    else if (scenario !== "restricted") check(evidence.performanceRequests.length > 0, "Service failure was actually exercised", evidence.performanceRequests);
    if (scenario === "restricted") {
      check(evidence.efficiencies.every(text => /complete equipment-day access is not verified/.test(text)),
        "Restricted caller cannot verify full chronology despite visible measured data", evidence.efficiencies);
      check(evidence.performanceRequests.length === 0,
        "Restricted context does not load a report later reusable as complete data", evidence.performanceRequests);
    }
    check(evidence.writes.length === 0, "Failure cases make no writes", evidence.writes);
    result.push({ role, scenario, evidence, screenshot: await screenshot(`${role}-${scenario}`) });
  }

  await navigate("viewer");
  await settled();
  const viewer = await collect();
  check(!viewer.moveButtons.some(Boolean) && viewer.lifecycle[0] === "Closed by Synthetic operator",
    "Viewer retains Lifecycle labels without actions", viewer);
  result.push({ viewer });

  await navigate();
  await settled();
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call("Emulation.setEmulatedMedia", { media: "print" });
  const pdf = await call("Page.printToPDF", { printBackground: true, landscape: true, preferCSSPageSize: true });
  writeFileSync(`${output}/dpr20-b2-print.pdf`, Buffer.from(pdf.data, "base64"));
  const pdfText = execFileSync("pdftotext", ["-raw", `${output}/dpr20-b2-print.pdf`, "-"], { encoding: "utf8" });
  writeFileSync(`${output}/dpr20-b2-print-raw.txt`, pdfText);
  const foldedPdf = pdfText.replace(/\s+/g, "");
  const required = ["Norm:", "Actual:3.750L/hr", "Actual:0.200L/km", "Actual:0.000L/hr", "Actual:2.500L/hr",
    "Actual:pending", "Actual:unavailable", "Repair/payment scope", "synthetic-dpr20-hose.svg",
    "Machine", "Vehicle No", "Operator", "Task", "Time/Meter", "Operating Quantity",
    "Diesel (L)", "Expected Diesel", "Norm / Efficiency", "Breakdown / Stoppage", "Diesel Source",
    "SYNTHETIC B2 HOURS", "SYNTHETIC B2 ODOMETER", "SYNTHETIC B2 ZERO",
    "SYNTHETIC B2 PENDING", "SYNTHETIC B2 NO RUNTIME", "SYNTHETIC B2 EXCLUDED",
    "SYNTHETIC B2 HOURS SECOND SHIFT", "SYNTHETIC B2 LEGACY EXACT LOG", "SYNTHETIC B2 SINGLE CANONICAL",
    "SYNTHETIC B2 ESTIMATED ODOMETER", "SYNTHETIC B2 REAL CLOCK HOURS",
    "distance is estimated, not measured or recorded from trips",
    "runtime from recorded start/end clock time, not hour-meter readings",
    "multiple same-day records; source rate cannot be isolated safely", "runtime or distance is missing",
    "no matching canonical performance record", "DPR snapshot consumed", "DPR20_LONG_NOTE_END"];
  for (const token of required) check(foldedPdf.includes(token.replace(/\s+/g, "")), `Actual PDF retains ${token}`, foldedPdf.slice(-1200));
  for (const token of ["Actual:3.750L/hr", "Actual:0.200L/km", "Actual:0.000L/hr", "Actual:2.500L/hr"]) {
    check(foldedPdf.split(token).length - 1 === 1, `Actual PDF has exactly one verified ${token}, no duplicate/fleet rates`, token);
  }
  check(!foldedPdf.includes("Sendonward"), "Lifecycle actions remain print-hidden", foldedPdf);
  // Render every page and audit coordinate bounds using the already-installed
  // PDF tools, without creating a separate script or touching production.
  const audit = JSON.parse(execFileSync("python3", ["-c", [
    "import pymupdf as f,json",
    `d=f.open('${output}/dpr20-b2-print.pdf')`,
    "outside=[]",
    "for i,p in enumerate(d):",
    ` p.get_pixmap(matrix=f.Matrix(1.5,1.5)).save('${output}/dpr20-b2-print-page-'+str(i+1)+'.png')`,
    " for w in p.get_text('words'):",
    "  if w[0]<-0.5 or w[1]<-0.5 or w[2]>p.rect.width+0.5 or w[3]>p.rect.height+0.5: outside.append({'page':i+1,'word':w[4]})",
    "print(json.dumps({'pages':len(d),'outside':outside}))",
  ].join("\n")], { encoding: "utf8" }));
  check(audit.outside.length === 0, "No printed rate/evidence extends beyond paper bounds", audit);
  result.push({ print: { requiredTokens: required.length, audit, file: `${output}/dpr20-b2-print.pdf` } });
  check(exceptions.length === 0, "No uncaught browser exceptions", exceptions);
  writeFileSync(`${output}/dpr20-b2-result.json`, JSON.stringify({
    source: "Synthetic DPR + real canonical report builder; real SiteReport; all API intercepted; no customer writes",
    result,
  }, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}