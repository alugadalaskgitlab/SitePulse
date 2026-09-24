/*
 * PI-02B isolated real-component browser verification. API traffic is
 * intercepted by main.tsx and visibly labelled synthetic. Database/storage
 * behavior is separately proven by tests/purchase-indent-pi02b.test.ts.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/pi02b");
const vitePort = 4196;
const cdpPort = 9346;
const chromiumProfile = "/tmp/pi02b-chromium-profile";
mkdirSync(evidenceDir, { recursive: true });
rmSync(chromiumProfile, { recursive: true, force: true });

const children = [];
const stop = () => {
  for (const child of children.reverse()) { try { child.kill("SIGTERM"); } catch {} }
  try { rmSync(chromiumProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); } catch {}
};
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });

const vite = spawn(path.join(workspace, "node_modules/.bin/vite"), ["--config", path.join(fixtureDir, "vite.config.ts")], {
  cwd: workspace, stdio: ["ignore", "pipe", "pipe"],
});
children.push(vite);
let viteLog = "";
vite.stdout.on("data", chunk => { viteLog += chunk; });
vite.stderr.on("data", chunk => { viteLog += chunk; });
async function waitHttp(url, label, attempts = 200) {
  for (let i = 0; i < attempts; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}. ${viteLog.slice(-1000)}`);
}
await waitHttp(`http://127.0.0.1:${vitePort}`, "PI-02B Vite");

const chromium = spawn("/repl/tools/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${chromiumProfile}`, "--window-size=1920,1080", `http://127.0.0.1:${vitePort}`,
], { cwd: workspace, stdio: "ignore" });
children.push(chromium);
await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "PI-02B Chromium");
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error("No PI-02B Chromium page");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id); pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i++) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const click = async testId => {
  const ok = await evaluate(`(() => { const e=document.querySelector('[data-testid="${testId}"]'); if(!e||e.disabled)return false; e.click(); return true })()`);
  assert(ok, `Could not click ${testId}`);
};
const screenshot = async name => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await waitFor("document.readyState==='complete' && !!document.querySelector('[data-testid=pi02-fixture-disclosure]')", "fixture");
await waitFor("!!document.querySelector('[data-testid=card-indent-90]')", "PI list");

await click("button-review-route-corrections");
await waitFor("!!document.querySelector('[data-testid=route-correction-row-9001]')", "route proposal");
const dialogText = await evaluate("document.querySelector('[data-testid=dialog-route-corrections]').innerText");
assert(dialogText.includes("SYNTHETIC/PI02/BEFORE/0090"), "A1 indent number missing");
assert(dialogText.includes("PRE-FIX STORED ROW") && dialogText.includes("stores") && dialogText.includes("material"), "A1 current/proposed route missing");
assert(!dialogText.includes("ALREADY VALID BULK ROUTE"), "A1 incorrectly listed valid bulk_plant row");
assert(!dialogText.includes("ALREADY VALID MATERIAL ROUTE"), "A1 incorrectly listed valid material row");
const a1 = await screenshot("A1-review-current-proposed-valid-excluded-SYNTHETIC-API");

// A3: opening/scanning is read-only. No Apply request or audit exists.
assert(await evaluate("window.__PI02Fixture.routeApplyRequests.length") === 0, "A3 scan unexpectedly applied");
assert(await evaluate("window.__PI02Fixture.audits.length") === 0, "A3 scan unexpectedly audited");
assert(await evaluate("window.__PI02Fixture.existingBefore.procurementRoute") === "stores", "A3 fixture baseline changed");
const a3 = await screenshot("A3-before-explicit-apply-zero-writes-SYNTHETIC-API");

const selected = await evaluate(`(() => {
  const e=document.querySelector('input[aria-label="Select WMM — PRE-FIX STORED ROW"]');
  if(!e)return false; e.click(); return e.checked;
})()`);
assert(selected, "Could not select correction row");
await click("button-apply-route-corrections");
await waitFor("window.__PI02Fixture.routeApplyRequests.length===1 && window.__PI02Fixture.audits.length===1", "explicit apply and audit");
await waitFor("!!document.querySelector('[data-testid=route-corrections-empty]')", "empty corrected scan");
await evaluate(`[...document.querySelectorAll('[data-testid=dialog-route-corrections] button')].find(e=>e.textContent.trim()==='Close')?.click()`);
await waitFor("!document.querySelector('[data-testid=dialog-route-corrections]')", "dialog close");
await click("card-indent-90");
await waitFor("!!document.querySelector('[data-testid=card-procure-item-9001]')", "corrected detail");
assert(!(await evaluate("!!document.querySelector('[data-testid=button-expand-delivery-9001]')")), "A2 Record Delivery still visible");
const audit = JSON.parse(await evaluate("JSON.stringify(window.__PI02Fixture.audits[0])"));
assert(audit.module === "purchase_indent_route_correction" && audit.transactionId === 9001, "A2 audit module/item mismatch");
assert(audit.oldValues.procurementRoute === "stores" && audit.newValues.procurementRoute === "material", "A2 audit old/new mismatch");
const a2 = await screenshot("A2-after-explicit-apply-detail-no-Record-Delivery-audit-SYNTHETIC-API");

// Part B: isolated, role-specific synthetic API fixture of the actual component.
// A non-material parent contains null-route WMM and mistagged GSB linked to bulk
// catalog records, alongside a genuine catalog-linked Stores item.
const partBShots = {};
for (const role of ["stores", "purchaser", "pm"]) {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/?partB=1&role=${role}` });
  await waitFor("!!document.querySelector('[data-testid=card-indent-92]') && document.body.innerText.includes('PART B')", `${role} synthetic indent list`);
  await click("card-indent-92");
  await waitFor("!!document.querySelector('[data-testid=delivery-panel-9201]') && !!document.querySelector('[data-testid=card-procure-item-9202]')", `${role} bulk and Stores detail`);
  assert(!(await evaluate("!!document.querySelector('[data-testid=button-expand-delivery-9201]')")), `${role}: null-route bulk offered Stores delivery`);
  assert(!(await evaluate("!!document.querySelector('[data-testid=button-expand-delivery-9203]')")), `${role}: mistagged bulk offered Stores delivery`);
  assert(await evaluate("!!document.querySelector('[data-testid=button-expand-delivery-9202]')"), `${role}: genuine Stores delivery missing`);
  assert(!(await evaluate("!!document.querySelector('[data-testid=delivery-panel-9202]')")), `${role}: Stores received bulk progress panel`);
  assert((await evaluate("document.querySelector('[data-testid=delivery-progress-9201]').textContent")).includes("25 of 100 MT delivered"), `${role}: WMM site-trip progress missing`);
  assert((await evaluate("document.querySelector('[data-testid=delivery-panel-9201]').innerText")).includes("SYN-TRIP-101"), `${role}: linked trip missing`);
  assert((await evaluate("document.querySelector('[data-testid=delivery-panel-9203]').innerText")).includes("SYN-RECEIPT-102"), `${role}: linked receipt missing`);
  partBShots[`${role}-A-B-D`] = await screenshot(`B-${role}-nonmaterial-bulk-progress-and-true-stores-SYNTHETIC`);
  await click("button-back-to-list");
  await waitFor("!!document.querySelector('[data-testid=card-indent-92]')", `${role} back to list`);
  await click("button-review-route-corrections");
  await waitFor("!!document.querySelector('[data-testid=route-correction-row-9201]')", `${role} route review`);
  assert(await evaluate("!!document.querySelector('[data-testid=route-correction-row-9203]')"), `${role}: mistagged bulk omitted`);
  assert(!(await evaluate("!!document.querySelector('[data-testid=route-correction-row-9202]')")), `${role}: genuine Stores proposed for correction`);
  partBShots[`${role}-C`] = await screenshot(`B-${role}-route-correction-review-SYNTHETIC`);
  if (role === "pm") {
    assert(await evaluate(`(() => { const e=document.querySelector('input[aria-label="Select SYNTHETIC WMM · NULL ROUTE"]'); if(!e)return false; e.click(); return e.checked; })()`), "PM WMM selection unavailable");
    await click("button-apply-route-corrections");
    await waitFor("window.__PI02Fixture.routeApplyRequests.length === 1", "explicit non-material WMM correction");
    assert((await evaluate("window.__PI02Fixture.audits[0].oldValues.procurementRoute")) === null, "null-to-material audit missing");
    partBShots["pm-C-applied"] = await screenshot("B-pm-explicit-WMM-correction-audit-SYNTHETIC");
  }
}

const evidence = {
  scenario: "PI-02B real PurchaseIndents component with visibly labelled synthetic intercepted API",
  limitation: "Browser/UI evidence uses intercepted synthetic API. Actual storage/database flow is independently verified with isolated PGlite in tests/purchase-indent-pi02b.test.ts.",
  safety: { productionDatabaseUsed: false, liveApiWrites: false, mountedProductionComponent: "client/src/pages/PurchaseIndents.tsx" },
  screenshots: { A1: a1, A2: a2, A3: a3, partB: partBShots },
  verified: {
    A1: { listedMistagged: true, current: "stores", proposed: "material", validMaterialExcluded: true, validBulkPlantExcluded: true },
    A3: { applyRequestsBeforeClick: 0, auditRowsBeforeClick: 0, storedRouteBeforeClick: "stores" },
    A2: { explicitApplyRequests: 1, correctedRoute: "material", recordDeliveryVisible: false, audit },
  },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close(); stop(); await sleep(250);