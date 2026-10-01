/*
 * DPR20 B4: actual SiteReport, DprDetails and section hub with isolated data.
 * Parent owns fixture Vite :4178 and Chromium CDP :9222.
 * Every API is intercepted; native API requests are blocked before networking.
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
const output = "tests/fixtures/dpr-site-entry/evidence";
mkdirSync(output, { recursive: true });
const target = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let serial = 0;
const pending = new Map();
const exceptions = [];
const blockedNativeApiRequests = [];
const results = [];
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  if (message.method === "Fetch.requestPaused") {
    blockedNativeApiRequests.push(message.params.request);
    void call("Fetch.fulfillRequest", {
      requestId: message.params.requestId,
      responseCode: 418,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ message: "B4 verifier blocks native API traffic" })).toString("base64"),
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
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 25000);
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
  throw new Error(`Timed out: ${expression}; ${await evaluate("document.body.innerText.slice(-1800)")}`);
}
function check(condition, message, evidence) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(evidence)}`);
}
async function screenshot(name, selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'start',behavior:'instant'})`);
  await evaluate("window.scrollBy({top:-60,behavior:'instant'})");
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = `${output}/dpr20-b4-${name}.png`;
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  return path;
}
const consumedSelector = 'section[aria-label="Materials Consumed / Issued"]';
const receivedSelector = '[data-testid="dpr-materials-received"]';
const note = "Bulk vehicle deliveries are tracked separately in Materials Received.";
const emptyMessage = "No materials consumed or issued recorded.";
const hubTitle = "Materials Consumed / Issued & Site Purchases";
async function navigate(page, scenario) {
  const path = page === "SiteReport" ? "/site/report/24601" : page === "DprDetails" ? "/dpr/24601" : "/fixture/dpr20-b4-hub";
  await call("Page.navigate", { url: `${base}${path}?dpr20b4=1&role=manager&scenario=${scenario}` });
  if (page === "hub") {
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.querySelector('h2')?.textContent===${JSON.stringify(hubTitle)})
      && document.body.innerText.includes('DPR #24601')`);
  } else {
    await wait(`!!document.querySelector(${JSON.stringify(consumedSelector)})
      && (document.querySelector(${JSON.stringify(receivedSelector)}).innerText.includes('No materials received this day.')
        || document.querySelectorAll('[data-testid^="row-material-trip-"]').length===2)`);
  }
}
async function materialsEvidence() {
  return evaluate(`(() => {
    const consumed=document.querySelector(${JSON.stringify(consumedSelector)});
    const received=document.querySelector(${JSON.stringify(receivedSelector)});
    const texts=selector=>Array.from(document.querySelectorAll(selector)).map(r=>Array.from(r.querySelectorAll('td')).map(c=>c.textContent.trim()));
    const visibility=el=>!!el&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden';
    return {
      heading:consumed.querySelector('h3')?.textContent,
      note:consumed.querySelector('p')?.textContent,
      consumed:consumed.innerText,
      received:received.innerText,
      receivedHeading:received.querySelector('h2')?.textContent,
      receivedRows:texts('[data-testid^="row-material-trip-"]'),
      legacyRows:texts('[data-testid^="row-material-abstract-"],[data-testid^="row-material-"]:not([data-testid^="row-material-trip-"])'),
      purchases:texts('[data-testid^="row-site-purchase-"]'),
      visible:{heading:visibility(consumed.querySelector('h3')),note:visibility(consumed.querySelector('p')),consumed:visibility(consumed),received:visibility(received)},
      ambiguous:document.body.innerText.includes('No materials recorded.'),
      writes:window.__DprSiteFixture.requests.filter(r=>r.method!=='GET'),
      receivedRequests:window.__DprSiteFixture.requests.filter(r=>r.path.startsWith('/api/materials-received?')).map(r=>r.path),
      supplierBreakdown:consumed.querySelector('h4')?.textContent??null,
    };
  })()`);
}
function verifyMaterials(evidence, page, scenario) {
  const populated = scenario === "populated";
  check(evidence.heading === "Materials Consumed / Issued" && evidence.note === note
    && evidence.receivedHeading === "Materials Received" && !evidence.ambiguous,
  "Always-labeled distinct consumed and received sections without contradictory generic empty text", evidence);
  check(Object.values(evidence.visible).every(Boolean), "Both sections and their explanatory note remain visible", evidence.visible);
  check(evidence.writes.length === 0 && evidence.receivedRequests.length > 0, "Intercepted read-only same-day material request", evidence);
  for (const path of evidence.receivedRequests) {
    const url = new URL(path, base);
    check(url.searchParams.get("site") === "NARASIMHULU ROAD"
      && url.searchParams.get("dateFrom") === "2026-08-05" && url.searchParams.get("dateTo") === "2026-08-05",
    "Unchanged Materials Received scoping", path);
  }
  if (scenario === "empty") {
    check(evidence.receivedRows.length === 0 && evidence.received.includes("No materials received this day."),
      "Distinct all-empty received state", evidence);
  } else {
    check(evidence.receivedRows.length === 2
      && evidence.received.includes("20.00") && evidence.received.includes("2 entries")
      && JSON.stringify(evidence.receivedRows) === JSON.stringify([
        ["10:15", "B4 HAULERB4-TRIP-01", "B4 RECEIVED GSB", "12.5 MT", "Stretch", "B4 QUARRY", "B4-TRIP-REC-01"],
        ["10:15", "B4 HAULERB4-TRIP-02", "B4 RECEIVED GSB", "7.5 MT", "Yard · B4 STORAGE YARD", "B4 QUARRY", "B4-TRIP-REC-02"],
      ]), "Received trips, totals, unloading, transport/source and receipt evidence remain intact", evidence);
  }
  if (!populated) {
    check(evidence.consumed.includes(emptyMessage) && evidence.legacyRows.length === 0 && evidence.purchases.length === 0,
      "Explicit consumed-empty wording despite real trips; no invented legacy/purchases records", evidence);
  } else if (page === "SiteReport") {
    check(!evidence.consumed.includes(emptyMessage)
      && JSON.stringify(evidence.legacyRows) === JSON.stringify([
        ["Issued", "B4 CEMENT ISSUED", "3.500", "MT", "B4-ISSUE-VEHICLE", "B4 SITE STORE", "B4 concrete work", "B4-ISSUE-RECEIPT"],
      ]) && JSON.stringify(evidence.purchases) === JSON.stringify([
        ["B4 STORE PURCHASE", "B4 LOCAL VENDOR", "B4-BILL-01", "525.000", "5.000", "Nos"],
      ]), "SiteReport retains all consumed-row and separate Site Purchases values", evidence);
  } else {
    check(!evidence.consumed.includes(emptyMessage) && evidence.supplierBreakdown === "Supplier breakdown"
      && JSON.stringify(evidence.legacyRows) === JSON.stringify([["B4 CEMENT ISSUED", "MT", "B4 SITE STORE", "3.500", "1"]])
      && evidence.purchases.length === 0,
    "DprDetails retains supplier abstract; does not introduce a purchases renderer", evidence);
  }
}

try {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
  for (const device of ["desktop", "mobile"]) {
    await call("Emulation.setDeviceMetricsOverride", { width: device === "desktop" ? 1440 : 390, height: 1050, deviceScaleFactor: 1, mobile: device === "mobile" });
    for (const page of ["SiteReport", "DprDetails"]) {
      for (const scenario of ["trips-only", "populated", "empty"]) {
        await navigate(page, scenario);
        const evidence = await materialsEvidence();
        verifyMaterials(evidence, page, scenario);
        const receivedScreenshot = await screenshot(`${device}-${page}-${scenario}-received`, receivedSelector);
        const consumedScreenshot = await screenshot(`${device}-${page}-${scenario}-consumed`, consumedSelector);
        await call("Emulation.setEmulatedMedia", { media: "print" });
        const printEvidence = await materialsEvidence();
        verifyMaterials(printEvidence, page, scenario);
        await call("Emulation.setEmulatedMedia", { media: "" });
        results.push({ device, page, scenario, evidence, printVisibilityPassed: true, receivedScreenshot, consumedScreenshot });
      }
    }
    for (const scenario of ["trips-only", "populated", "empty"]) {
      await navigate("hub", scenario);
      const evidence = await evaluate(`(() => {
        const tile=Array.from(document.querySelectorAll('button')).find(b=>b.querySelector('h2')?.textContent===${JSON.stringify(hubTitle)});
        tile.setAttribute('data-b4-hub-evidence','materials');
        const fixture=window.__DprSiteFixture.dpr20B4Scenario();
        return {title:tile.querySelector('h2').textContent,paragraphs:Array.from(tile.querySelectorAll('p')).map(p=>p.textContent),
          state:fixture.snapshot.sections.materials,receivedCount:fixture.receipts.length,
          disabled:tile.disabled,writes:window.__DprSiteFixture.requests.filter(r=>r.method!=='GET'),
          loads:window.__DprSiteFixture.requests.filter(r=>r.path==='/api/dpr-sections/24601').length};
      })()`);
      const state = scenario === "populated" ? "ready" : "empty";
      const label = scenario === "populated" ? "Ready" : "Not yet entered";
      check(evidence.title === hubTitle && evidence.paragraphs.includes(`${state} — ${label}`)
        && evidence.state.state === state && evidence.state.label === label,
      "Hub presentation changes only; existing shared readiness remains unchanged", evidence);
      check(evidence.paragraphs.some(p=>p.includes("Materials Received") && /separately/i.test(p))
        && !evidence.disabled && evidence.writes.length === 0 && evidence.loads > 0
        && evidence.receivedCount === (scenario === "empty" ? 0 : 2),
      "Hub clarifies bulk trips are separate without readiness or editing side effects", evidence);
      results.push({ device, page: "hub", scenario, evidence,
        screenshot: await screenshot(`${device}-hub-${scenario}`, '[data-b4-hub-evidence="materials"]') });
    }
  }
  check(blockedNativeApiRequests.length === 0, "All requests resolved in isolated fixture; no native API traffic", blockedNativeApiRequests);
  check(exceptions.length === 0, "No uncaught browser exceptions", exceptions);
  writeFileSync(`${output}/dpr20-b4-result.json`, JSON.stringify({
    source: "isolated synthetic scenario GETs, actual SiteReport/DprDetails/DprSections; no customer writes",
    reportCases: 12, hubCases: 6, printDomCases: 12, blockedNativeApiRequests, exceptions, results,
  }, null, 2));
  console.log(JSON.stringify({ reportCases: 12, hubCases: 6, printDomCases: 12,
    nativeApiRequests: blockedNativeApiRequests.length, exceptions: exceptions.length, passed: true }, null, 2));
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`);
}