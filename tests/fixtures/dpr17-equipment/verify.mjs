/*
 * Run: node tests/fixtures/dpr17-equipment/verify.mjs
 * Requires the already-running mockup sandbox on port 23636. Starts only a
 * disposable Chromium; never starts Vite or allows an /api/ request through.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const root = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.join(root, "evidence");
const base = process.env.DPR17_EQUIPMENT_BASE_URL || "http://127.0.0.1:23636";
const route = "/__mockup/preview/dpr17/EquipmentRows";
const cdpPort = Number(process.env.DPR17_EQUIPMENT_CDP_PORT || 19317);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
const apiRequests = [];
const exceptions = [];
let chromium, socket, sequence = 0;

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out`));
    }, 20000);
    pending.set(id, {
      method,
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label) {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${(await evaluate("document.body.innerText")).slice(0, 500)}`);
}

const scope = editable => `[aria-label="${editable ? "Editable" : "Read-only"} equipment card"]`;
const datum = (editable, label) => evaluate(`(() => {
  const card = document.querySelector(${JSON.stringify(scope(editable))});
  return [...card.querySelectorAll("dl.datum")].find(el => el.querySelector("dt")?.textContent.trim() === ${JSON.stringify(label)})?.querySelector("dd")?.textContent.trim() ?? null;
})()`);
const text = editable => evaluate(`document.querySelector(${JSON.stringify(scope(editable))}).innerText`);
async function setField(label, value, tag = "input") {
  const changed = await evaluate(`(() => {
    const card = document.querySelector(${JSON.stringify(scope(true))});
    const control = [...card.querySelectorAll("label.field")].find(el => el.querySelector(":scope > span")?.textContent.trim() === ${JSON.stringify(label)})?.querySelector(${JSON.stringify(tag)});
    if (!control) return false;
    const proto = ${tag === "textarea" ? "HTMLTextAreaElement" : tag === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event(${JSON.stringify(tag === "select" ? "change" : "input")}, { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Missing editable ${tag}: ${label}`);
}

async function select(selector, value) {
  const ok = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, ${JSON.stringify(String(value))});
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(ok, `Missing select ${selector}`);
}

async function click(selector) {
  assert(await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`), `Missing ${selector}`);
}

async function clickButton(label, editable = true) {
  const ok = await evaluate(`(() => {
    const button = [...document.querySelector(${JSON.stringify(scope(editable))}).querySelectorAll("button")]
      .find(el => el.textContent.trim() === ${JSON.stringify(label)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(ok, `Missing button: ${label}`);
}

async function shot(name) {
  const { cssContentSize } = await cdp("Page.getLayoutMetrics");
  const image = await cdp("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true, fromSurface: true,
    clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 },
  });
  const file = path.join(evidence, `${name}.png`);
  writeFileSync(file, Buffer.from(image.data, "base64"));
  return file;
}

async function layout(width) {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 });
  await cdp("Page.navigate", { url: `${base}${route}` });
  await waitFor(`!!document.querySelector(${JSON.stringify(scope(true))}) && !!document.querySelector(${JSON.stringify(scope(false))})`, `${width}px equipment cards`);
  const state = await evaluate(`(() => {
    const cards = [...document.querySelectorAll(".dpr17 .card")];
    const root = document.documentElement;
    return {
      viewport: innerWidth, documentWidth: root.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      overflowing: [...document.querySelectorAll(".dpr17 *")].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > innerWidth + 2 || r.left < -2);
      }).slice(0, 8).map(el => ({ tag: el.tagName, className: el.className, width: el.getBoundingClientRect().width })),
      cards: cards.map(el => ({ title: el.querySelector("h2")?.textContent, width: el.getBoundingClientRect().width })),
    };
  })()`);
  assert.equal(state.viewport, width);
  assert(state.documentWidth <= width, `Horizontal document overflow at ${width}px: ${JSON.stringify(state)}`);
  assert(state.bodyWidth <= width + 1, `Horizontal body overflow at ${width}px: ${JSON.stringify(state)}`);
  assert.deepEqual(state.overflowing, [], `Overflowing elements at ${width}px`);
  assert.deepEqual(state.cards.map(card => card.title), ["Edit machine day", "Read-only machine day"]);
  assert(state.cards.every(card => card.width > 0), `Both cards visible at ${width}px`);
  return state;
}

async function run() {
  const desktop = await layout(1440);
  assert.equal(await datum(false, "Owner / vendor"), "Sahyadri Earthmovers");
  assert.equal(await datum(false, "Diesel source"), "Plant stock");
  const initial = await shot("desktop-initial");

  await select('[aria-label="Select equipment"]', 58);
  assert.equal(await datum(false, "Equipment"), "Tata Signa Tipper");
  assert.equal(await datum(false, "Owner / vendor"), "HLC own");
  assert.equal(await datum(false, "Opening odometer"), "38106.2");
  assert.equal(await datum(false, "Diesel source"), "Direct purchase");
  assert.equal(await datum(false, "Actual consumed"), "—");
  await setField("Closing odometer", "38200.5");
  assert.equal(await datum(false, "Closing odometer"), "38200.5");
  const tipper = await shot("desktop-tipper-edited");

  await select('[aria-label="Select equipment"]', 63);
  assert.equal(await datum(false, "Owner / vendor"), "Kedar Plant Hire");
  assert.equal(await datum(false, "Diesel source"), "Contractor");
  await select('[aria-label="Select equipment"]', 41);
  assert.equal(await datum(false, "Diesel source"), "Plant stock");
  assert.equal(await datum(false, "Closing meter"), "1490.1");

  await setField("Closing meter", "1491.2");
  assert.equal(await datum(false, "Closing meter"), "1491.2");
  await setField("Diesel issued / added (L)", "45");
  assert.equal(await datum(false, "Issued / added"), "45.00 L");
  assert.equal(await datum(false, "Actual consumed"), "44.30 L", "Measured liters should follow physical tank arithmetic");
  await click(`${scope(true)} label.tick input[type="checkbox"]`);
  assert.equal(await datum(false, "Confirmation"), "Pending confirmation");
  assert.equal(await datum(false, "Expected rate · norm only"), "5.60 L/hr");
  assert.equal(await datum(false, "Actual consumption rate"), null);
  await click(`${scope(true)} label.tick input[type="checkbox"]`);
  assert.equal(await datum(false, "Confirmation"), "Confirmed");
  assert.equal(await datum(false, "Actual consumption rate"), "5.03 L/hr");
  const tank = await shot("desktop-tank-confirmed");

  await clickButton("+ Add BOQ Item");
  assert.match(await text(true), /Select a BOQ Item\./);
  // The new additional-item selector is confined to the first segment.
  await select(`${scope(true)} .allocation .allocation-actions select`, "242");
  assert.match(await text(false), /Granular sub-base, 200 mm/);
  const boq = await shot("desktop-boq-added");
  await clickButton("Remove BOQ item");
  assert.doesNotMatch(await text(false), /Granular sub-base, 200 mm/);
  assert.match(await text(false), /Excavation in ordinary soil/);

  await clickButton("Breakdown / Stoppage");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(`${scope(true)} button[aria-expanded]`)})?.getAttribute("aria-expanded")`), "true");
  await clickButton("+ Add stoppage");
  await setField("From time", "10:00");
  await setField("To time", "10:30");
  await setField("Reason", "Hydraulic hose replacement");
  await setField("Remarks", "Local-only note", "textarea");
  assert.match(await text(false), /Hydraulic hose replacement/);
  assert.match(await text(false), /Local-only note/);
  assert.match(await text(false), /30 min/);
  const stoppage = await shot("desktop-local-stoppage");
  await clickButton("Hide breakdown / stoppage");
  assert.match(await text(false), /Hydraulic hose replacement/, "Disclosure only hides editor, not locally staged preview");
  await clickButton("Breakdown / Stoppage");
  await clickButton("Remove");
  assert.doesNotMatch(await text(false), /Hydraulic hose replacement/);

  const mobile = await layout(390);
  const mobileShot = await shot("mobile-initial");
  assert.deepEqual(apiRequests, [], "No API requests, including writes, are permitted");
  assert.deepEqual(exceptions, [], "No browser runtime exceptions");
  return { desktop, mobile, screenshots: [initial, tipper, tank, boq, stoppage, mobileShot], apiRequests, exceptions };
}

mkdirSync(evidence, { recursive: true });
try {
  const response = await fetch(`${base}${route}`);
  assert(response.ok, `Existing sandbox unavailable: ${base}${route} (${response.status})`);
  chromium = spawn("/repl/tools/bin/chromium", [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/dpr17-equipment-${process.pid}`, "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" });
      if (response.ok) { target = await response.json(); break; }
    } catch {}
    await sleep(100);
  }
  assert(target?.webSocketDebuggerUrl, "Disposable Chromium CDP unavailable");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.on("message", raw => {
    const message = JSON.parse(raw.toString());
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Network.requestWillBeSent" && /\/api(?:\/|[?#]|$)/.test(new URL(message.params.request.url).pathname)) {
      apiRequests.push({ method: message.params.request.method, url: message.params.request.url });
    }
    if (message.method === "Fetch.requestPaused") {
      apiRequests.push({ method: message.params.request.method, url: message.params.request.url });
      cdp("Fetch.failRequest", { requestId: message.params.requestId, errorReason: "BlockedByClient" }).catch(console.error);
    }
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      message.error ? callback.reject(new Error(`${callback.method}: ${message.error.message}`)) : callback.resolve(message.result);
    }
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Fetch.enable", { patterns: [{ urlPattern: "*://*/api/*", requestStage: "Request" }] });
  const result = await run();
  writeFileSync(path.join(evidence, "results.json"), JSON.stringify({ mockupOnly: true, productionApiWrites: false, ...result }, null, 2));
  console.log(`DPR17 equipment browser verification passed: ${result.screenshots.length} screenshots in ${evidence}`);
} finally {
  socket?.close();
  chromium?.kill();
}