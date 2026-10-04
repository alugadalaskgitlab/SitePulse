import fs from "node:fs/promises";
import WebSocket from "ws";
import assert from "node:assert/strict";
const out = ".agents/outputs/vb-payables-preview";
const example = process.argv.includes("--example");
const prefix = example ? "example-" : "";
const preview = JSON.parse(await fs.readFile(`${out}/${example ? "three-category-example" : "live-preview"}.json`, "utf8"));
const target = (await (await fetch("http://127.0.0.1:9230/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let id = 0, allowed = true, engineer = false, previewRequests = 0;
const waiting = new Map(), errors = [];
const call = (method, params = {}) => new Promise((resolve, reject) => {
  waiting.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
ws.on("message", async raw => {
  const msg = JSON.parse(raw);
  if (waiting.has(msg.id)) {
    const p = waiting.get(msg.id); waiting.delete(msg.id);
    msg.error ? p.reject(msg.error) : p.resolve(msg.result);
  }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.text);
  if (msg.method !== "Fetch.requestPaused") return;
  const { requestId, request } = msg.params;
  const path = new URL(request.url).pathname;
  console.log("Fixture request", path);
  let body = [];
  if (path === "/api/auth/me") body = {
    user: { id: 999999, fullName: "Browser-only preview fixture", isAdmin: false, isOwner: false,
      isActive: true, setupComplete: true, isFieldEngineer: engineer },
    permissions: Object.fromEntries(["vendor_bills", "vendor_bills_view"].map(key => [key, { view: true, view_reports: allowed }])),
  };
  else if (path === "/api/config") body = { companyName: "Browser-only preview evidence", licensedModules: [] };
  else if (path.includes("vendor-names")) body = [preview.vendorName];
  else if (path.endsWith("/summary")) body = { total: 0, totalAmount: 0, draft: 0, verified: 0, approved: 0, paid: 0, gstByCategory: {} };
  else if (path === "/api/vendor-bills/payables-preview") { body = preview; previewRequests++; }
  await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(body)).toString("base64") });
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const evaluate = async expression => (await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const navigate = async () => {
  await call("Page.navigate", { url: `https://${process.env.REPLIT_DEV_DOMAIN}/finance/vendor-bills` });
  await pause(8000);
};
try {
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] });
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: `${process.cwd()}/${out}/browser-downloads` });
  await navigate();
  console.log(await evaluate(`JSON.stringify({url:location.href,body:document.body.innerText.slice(0,900)})`), errors);
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="payables-preview-panel"]')`), true);
  await evaluate(`document.querySelector('[data-testid="payables-preview-panel"] button').click()`);
  await pause(400);
  await evaluate(`(() => { const values=${JSON.stringify({ "preview-vendor": preview.vendorName, "preview-from": preview.periodFrom, "preview-to": preview.periodTo })};
    for(const [id,value] of Object.entries(values)){const el=document.getElementById(id);if(!el)throw Error(id);
      const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===value))el.add(new Option(value,value));
      Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
      el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));}
    })()`);
  await pause(300);
  await evaluate(`document.querySelector('[data-testid="payables-preview-panel"] form button[type="submit"]').click()`);
  await pause(1800);
  assert.ok(previewRequests > 0);
  assert.ok(await evaluate(`document.body.innerText.toLowerCase().includes('vendor grand total')`));
  await evaluate(`document.querySelector('[data-testid="payables-preview-panel"]').scrollIntoView()`);
  const desktop = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(`${out}/${prefix}preview-desktop.png`, Buffer.from(desktop.data, "base64"));
  const exportTexts = await evaluate(`Array.from(document.querySelectorAll('[data-testid="payables-preview-panel"] button')).map(b=>b.textContent)`);
  await evaluate(`Array.from(document.querySelectorAll('[data-testid="payables-preview-panel"] button')).filter(b=>/Excel|PDF/i.test(b.textContent)).forEach(b=>b.click())`);
  await pause(2000);
  await call("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await pause(400);
  const mobile = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(`${out}/${prefix}preview-phone.png`, Buffer.from(mobile.data, "base64"));
  allowed = false; await navigate();
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="payables-preview-panel"]')`), false);
  allowed = true; engineer = true; await navigate();
  assert.equal(await evaluate(`!!document.querySelector('[data-testid="payables-preview-panel"]')`), false);
  assert.deepEqual(errors, []);
  const result = { mode: example
    ? "Browser-only auth/API fixture with explicitly synthetic in-memory example data; not live business records or a signed-in session"
    : "Browser-only auth/API fixture with real read-only service output; not a signed-in session",
    panelRendered: true, deniedPanelAbsent: true, engineerPanelAbsent: true, previewRequests, exportTexts, errors };
  await fs.writeFile(`${out}/${prefix}browser-evidence.json`, JSON.stringify(result, null, 2));
  console.log(result);
} finally { ws.close(); }