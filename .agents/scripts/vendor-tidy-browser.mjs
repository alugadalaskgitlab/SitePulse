import fs from "node:fs/promises";
import WebSocket from "ws";
import assert from "node:assert/strict";
const out = "attached_assets/vendor-ui-tidy";
await fs.mkdir(out, { recursive: true });
await fs.mkdir("/tmp/vendor-tidy-downloads", { recursive: true });
const target = (await (await fetch("http://127.0.0.1:9230/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let id = 0;
const pending = new Map(), errors = [];
const call = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
ws.on("message", async raw => {
  const msg = JSON.parse(raw);
  if (pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(msg.error) : p.resolve(msg.result);
  }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method !== "Fetch.requestPaused") return;
  const { requestId, request } = msg.params;
  try {
    const u = new URL(request.url);
    const r = await fetch("http://127.0.0.1:3211" + u.pathname + u.search);
    await call("Fetch.fulfillRequest", { requestId, responseCode: r.status,
      responseHeaders: [...r.headers].filter(([k]) => !["content-length", "connection", "keep-alive", "transfer-encoding"].includes(k)).map(([name, value]) => ({ name, value })),
      body: Buffer.from(await r.arrayBuffer()).toString("base64") });
  } catch (e) { console.error(e); await call("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async expression => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const shot = async name => {
  const r = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(`${out}/${name}.png`, Buffer.from(r.data, "base64"));
};
await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
await call("Network.setBypassServiceWorker", { bypass: true });
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp/vendor-tidy-downloads" });
await call("Page.addScriptToEvaluateOnNewDocument", { source: "window.showSaveFilePicker=undefined;" });
// The shared external preview currently targets the separate mockup service.
// Capture the existing main-app listener directly, without changing routing.
await call("Page.navigate", { url: "http://127.0.0.1:5000/finance/vendor-bills" });
await pause(11000);
if (process.argv.includes("--gst")) {
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="button-export-gst-csv"]')`), false);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="button-export-gst-pdf"]')`), true);
  await evaluate(`document.querySelector('[data-testid="card-gst-register"]').scrollIntoView({block:"center"})`);
  await shot("gst-register-desktop");
  await evaluate(`document.querySelector('[data-testid="button-export-gst-excel"]').click();document.querySelector('[data-testid="button-export-gst-pdf"]').click()`);
  await pause(2000);
  await call("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.querySelector('[data-testid="card-gst-register"]').scrollIntoView({block:"start"})`);
  await pause(300); await shot("gst-register-mobile");
} else {
  console.log("Bill available", await evaluate(`!!document.querySelector('[data-testid="card-bill-48"]')`));
  await evaluate(`document.querySelector('[data-testid="card-bill-48"]').click()`);
  await pause(1800);
  await evaluate("window.scrollTo(0,0)"); await shot("bill-detail-header");
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="button-export-pdf"]')`), true);
  await evaluate(`document.querySelector('[data-testid="button-export-whole-bill-pdf-header"]').click()`);
  await pause(1800);
  await evaluate(`document.querySelector('[data-testid="whole-bill-export-footer"]').scrollIntoView({block:"end"})`);
  await shot("bill-detail-footer");
  const pdfs = (await fs.readdir("/tmp/vendor-tidy-downloads")).filter(f => f.endsWith(".pdf"));
  assert.equal(pdfs.length, 1);
  await fs.copyFile(`/tmp/vendor-tidy-downloads/${pdfs[0]}`, `${out}/HLC-VB-2026-0048-whole-bill.pdf`);
  const legacy = await fetch("http://127.0.0.1:3211/api/vendor-bills/48/pdf");
  assert.equal(legacy.status, 200);
  await fs.writeFile(`${out}/HLC-VB-2026-0048-legacy-server.pdf`, Buffer.from(await legacy.arrayBuffer()));
}
assert.deepEqual(errors, []);
console.log("Verified browser-only fixture with real read-only production bill snapshot; no authenticated production browser or database writes.");
ws.close();
