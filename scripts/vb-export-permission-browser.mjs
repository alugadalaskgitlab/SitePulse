// Browser-only fixture responses: no session changes or database writes.
import WebSocket from "ws";
import fs from "node:fs/promises";
const out = ".agents/outputs/vb-export-part-a";
await fs.mkdir(out, { recursive: true });
const target = (await (await fetch("http://127.0.0.1:9230/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let serial = 0, allowed = false;
const pending = new Map(), errors = [];
const dpr = JSON.parse(await fs.readFile(".agents/outputs/dpr-page-01/DPR-262-before.json", "utf8")).body;
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on("message", async raw => {
  const message = JSON.parse(raw);
  if (pending.has(message.id)) {
    const p = pending.get(message.id); pending.delete(message.id);
    message.error ? p.reject(message.error) : p.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  const path = new URL(request.url).pathname;
  const permissions = Object.fromEntries(["vendor_bills", "vendor_bills_view", "site_dprs", "reports"].map(key =>
    [key, { view: true, view_reports: allowed }]));
  let data = [];
  if (path === "/api/auth/me") data = { user: { id: 99999, fullName: "Permission test manager", isAdmin: false, isOwner: false, isActive: true, setupComplete: true }, permissions };
  else if (path === "/api/config") data = { companyName: "Permission test fixture", companyShortName: "TEST", licensedModules: [] };
  else if (path === "/api/vendor-bills/summary") data = { total: 0, totalAmount: 0, draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0, totalGst: 0, gstByCategory: {} };
  else if (path === "/api/dprs/262") data = dpr;
  else if (path === "/api/sites") data = [{ id: 1, name: dpr.site, isActive: 1 }];
  else if (path.endsWith("/unread-count")) data = { count: 0 };
  else if (path.includes("edit-requests/check")) data = { hasPermission: false };
  await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(data)).toString("base64") });
});
await call("Page.enable");
await call("Runtime.enable");
await call("Network.enable");
await call("Network.setBypassServiceWorker", { bypass: true });
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
await call("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] });
const results = [];
for (const allow of [false, true]) {
  allowed = allow;
  for (const [name, path, selectors] of [
    ["vendor-bills", "/finance/vendor-bills", ["button-export-gst-csv", "button-export-gst-excel"]],
    ["site-report", "/site/report/262", ["button-print", "button-share-whatsapp"]],
  ]) {
    await call("Page.navigate", { url: `https://${process.env.REPLIT_DEV_DOMAIN}${path}` });
    await new Promise(resolve => setTimeout(resolve, 5000));
    const evaluation = await call("Runtime.evaluate", { expression: `JSON.stringify({path:location.pathname,body:document.body.innerText.slice(0,400),counts:${JSON.stringify(selectors)}.map(id=>document.querySelectorAll('[data-testid="'+id+'"]').length)})`, returnByValue: true });
    const state = JSON.parse(evaluation.result.value);
    results.push({ name, allowed, ...state });
    if (name === "vendor-bills") {
      await call("Runtime.evaluate", { expression: `document.querySelector('[data-testid="button-export-gst-csv"]')?.scrollIntoView({block:"center"})` });
    }
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await fs.writeFile(`${out}/${name}-${allowed ? "allowed" : "denied"}.png`, Buffer.from(shot.data, "base64"));
  }
}
await fs.writeFile(`${out}/browser-results.json`, JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ results, errors }, null, 2));
ws.close();
if (results.some(r => r.counts.some(n => n !== (r.allowed ? 1 : 0))) || errors.length) process.exitCode = 1;