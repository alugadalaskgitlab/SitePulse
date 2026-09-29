/*
 * Run: node tests/fixtures/dpr17-materials/verify.mjs
 * Starts ONLY the isolated Vite fixture and a disposable headless Chromium.
 * Both real production page components render with browser-local synthetic API
 * responses; every API write and unexpected API GET is blocked.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.join(root, "evidence");
mkdirSync(evidence, { recursive: true });
const port = 4179;
const cdpPort = 19279;
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, chromium, socket;
let sequence = 0;
const pending = new Map();
const exceptions = [];
const requests = [];

async function waitHttp(url, label) {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json().catch(() => true);
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 20000);
    pending.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value); },
      reject: error => { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${label}: ${(await evaluate("document.body.innerText")).slice(0, 700)}`);
}

async function screenshot(name) {
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.cssContentSize;
  const image = await cdp("Page.captureScreenshot", {
    format: "png", fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 },
  });
  const file = path.join(evidence, `${name}.png`);
  writeFileSync(file, Buffer.from(image.data, "base64"));
  return file;
}

async function verify(page, empty, width = 1280) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width, height: 900, deviceScaleFactor: 1, mobile: width < 600,
  });
  const id = empty ? 1702 : 1701;
  const pathname = page === "DprDetails" ? `/dpr/${id}` : `/site/report/${id}`;
  const expectedDate = empty ? "2026-09-16" : "2026-09-15";
  const expectedQuery = `/api/materials-received?site=DPR17+TEST+SITE&dateFrom=${expectedDate}&dateTo=${expectedDate}`;
  await cdp("Page.navigate", { url: `${base}${pathname}` });
  await waitFor("document.readyState === 'complete' && !!document.querySelector('[data-testid=\"dpr17-fixture-label\"]')", `${page} fixture`);
  await waitFor(`document.querySelector('[data-testid="dpr-materials-received"]') && window.__dpr17Fixture.requests.some(r => r.path === ${JSON.stringify(expectedQuery)})`, `${page} material request`);
  await waitFor(
    empty
      ? "document.querySelector('[data-testid=\"dpr-materials-received\"]')?.innerText.includes('No materials received this day.')"
      : "document.querySelectorAll('[data-testid=\"dpr-materials-received\"] tbody tr').length === 5",
    `${page} ${empty ? "empty note" : "receipt rows"}`,
  );
  const state = await evaluate(`(() => {
    const section = document.querySelector('[data-testid="dpr-materials-received"]');
    const materialsLog = section.parentElement.parentElement;
    const progress = [...document.querySelectorAll('*')].find(el =>
      !el.children.length && el.textContent.trim() === 'Activity Progress');
    const entries = [...section.querySelectorAll('h3')].find(el => el.textContent.startsWith('Material Entries'));
    return {
      title: document.querySelector('h1')?.innerText,
      sectionText: section.innerText,
      html: section.outerHTML,
      inMaterialsLog: !!materialsLog.querySelector('*') && [...materialsLog.querySelectorAll('*')].some(el =>
        !el.children.length && el.textContent.trim() === 'Materials Log'),
      afterProgress: !!progress && !!(progress.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING),
      summaryBeforeEntries: !entries || !!(section.querySelector('[data-testid^="card-material-"]')?.compareDocumentPosition(entries) & Node.DOCUMENT_POSITION_FOLLOWING),
      receivedSections: document.querySelectorAll('[data-testid="dpr-materials-received"]').length,
      oldSummaryCount: document.querySelectorAll('[data-testid^="card-material-abstract-"], [data-testid^="card-material-summary-"]').length,
      legacyRows: [...materialsLog.querySelectorAll('[data-testid^="row-material-"]')]
        .filter(el => !section.contains(el)).map(el => el.innerText),
      receiptOccurrences: (materialsLog.innerText.match(/DPR-105/g) || []).length,
      inputs: section.querySelectorAll('button, input, select, textarea, [contenteditable="true"]').length,
      rows: [...section.querySelectorAll('tbody tr')].map(row => row.innerText),
      cards: [...section.querySelectorAll('[data-testid^="card-material-"]')].map(card => card.innerText),
      validBoq: section.querySelector('[data-testid="boq-total-Aggregate-MT"]')?.innerText || null,
      invalidBoq: section.querySelector('[data-testid="boq-total-Sand-MT"]')?.innerText || null,
      requests: window.__dpr17Fixture.requests,
      blocked: window.__dpr17Fixture.blocked,
    };
  })()`);
  assert.match(state.title, page === "DprDetails" ? /Report Details/ : /Site Report/, `${page} real page heading`);
  assert(state.inMaterialsLog, `${page}: Materials Received must be inside Materials Log`);
  assert(state.afterProgress, `${page}: Materials Log must follow Activity Progress`);
  assert(state.summaryBeforeEntries, `${page}: richer summary must precede Material Entries`);
  assert.equal(state.receivedSections, 1, `${page}: one received section`);
  assert.equal(state.oldSummaryCount, 0, `${page}: no old mini-summary`);
  assert.equal(state.inputs, 0, `${page}: receipt section must be read-only`);
  assert.deepEqual(state.blocked, [], `${page}: unexpected API calls or writes`);
  assert.deepEqual(state.requests.filter(r => r.path.startsWith("/api/materials-received")), [
    { method: "GET", path: expectedQuery },
  ], `${page}: exactly one same-site same-day scoped query`);
  assert(state.requests.every(r => r.method === "GET"), `${page}: no API mutations`);
  if (empty) {
    assert.match(state.sectionText, /No materials received this day\./);
    assert.equal(state.rows.length, 0);
    assert.equal(state.cards.length, 0);
    assert.equal(state.legacyRows.length, 0);
  } else {
    assert.equal(state.rows.length, 5);
    assert.equal(state.cards.length, 3);
    assert.match(state.sectionText, /Material Entries \(5\)/);
    assert.match(state.sectionText, /Trip unloading: Stretch 5\.00 · Yard 7\.00 · Not recorded 0\.00/);
    assert.match(state.sectionText, /Other entries \(DPR\/equipment\) 4\.00/);
    assert.match(state.rows[0], /Test Transport/);
    assert.match(state.rows[1], /Test Yard/);
    assert.match(state.rows[2], /Not recorded/);
    assert.match(state.rows[4], /Not applicable/);
    assert.equal(state.validBoq, "≈ 7.500 CUM (BOQ unit)");
    assert.equal(state.invalidBoq, null, `${page}: incomplete conversion must not display a partial BOQ total`);
    if (page === "SiteReport") {
      assert.equal(state.legacyRows.length, 2, `${page}: preserve both received and issued DPR records`);
      assert.match(state.legacyRows[0], /DPR-105/);
      assert.match(state.legacyRows[0], /Old stockyard/);
      assert.match(state.legacyRows[1], /ISS-106/);
      assert.match(state.legacyRows[1], /Pier 2/);
      assert.equal(state.receiptOccurrences, 2, `${page}: receipt retained in both historical and day views`);
    } else {
      assert.equal(state.legacyRows.length, 1, `${page}: preserve supplier-grouped DPR abstract`);
      assert.match(state.legacyRows[0], /Cement/);
      assert.match(state.legacyRows[0], /5\.000/);
      assert.equal(state.receiptOccurrences, 1, `${page}: receipt shown in day view`);
    }
    assert(state.cards.some(c => /12\.00[\s\S]*MT[\s\S]*Aggregate/.test(c)), `${page}: native MT total`);
    assert(state.cards.some(c => /5\.00[\s\S]*MT[\s\S]*Sand/.test(c)), `${page}: invalid BOQ does not discard native quantity`);
  }
  const image = await screenshot(`${page}-${empty ? "empty" : "populated"}-${width}`);
  return { pathname, image, query: expectedQuery, rows: state.rows.length, cards: state.cards.length, validBoq: state.validBoq };
}

try {
  vite = spawn(path.resolve(root, "../../../node_modules/.bin/vite"), [
    "--config", path.join(root, "vite.config.ts"), "--host", "127.0.0.1",
    "--port", String(port), "--strictPort",
  ], { cwd: path.resolve(root, "../../.."), stdio: "ignore" });
  await waitHttp(base, "isolated Vite fixture");
  chromium = spawn("/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/dpr17-materials-${process.pid}`,
    "about:blank",
  ], { stdio: "ignore" });
  const version = await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "Chromium CDP");
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
  assert(version.webSocketDebuggerUrl && target.webSocketDebuggerUrl, "Chromium CDP target unavailable");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent" && message.params.request.url.includes("/api/")) {
      requests.push({ method: message.params.request.method, url: message.params.request.url });
    }
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  const results = [
    await verify("DprDetails", false),
    await verify("SiteReport", false),
    await verify("DprDetails", true),
    await verify("SiteReport", true),
    await verify("SiteReport", false, 390),
  ];
  assert.deepEqual(exceptions, [], "Browser runtime exceptions");
  assert.deepEqual(requests, [], "Native network API traffic escaped the browser-local interceptor");
  writeFileSync(path.join(evidence, "results.json"), JSON.stringify({
    fixtureOnly: true, realPages: ["DprDetails", "SiteReport"],
    productionWrites: false, results,
  }, null, 2));
  console.log(`DPR17 browser verification passed; ${results.length} screenshots in ${evidence}`);
} finally {
  socket?.close();
  chromium?.kill();
  vite?.kill();
}