/*
 * PI-02 isolated real-component browser verification. All API traffic is
 * intercepted by main.tsx; this is synthetic UI/payload evidence, not DB proof.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/pi02");
const vitePort = 4196;
const cdpPort = 9346;
const chromiumProfile = "/tmp/pi02-chromium-profile";
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
await waitHttp(`http://127.0.0.1:${vitePort}`, "PI-02 Vite");

const chromium = spawn("/repl/tools/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${chromiumProfile}`, "--window-size=1920,1080", `http://127.0.0.1:${vitePort}`,
], { cwd: workspace, stdio: "ignore" });
children.push(chromium);
await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "PI-02 Chromium");
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error("No PI-02 Chromium page");
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
const quote = JSON.stringify;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i++) {
    try { if (await evaluate(expression)) return; } catch (error) {
      if (!/navigated|context.*destroyed/i.test(error.message)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const click = async id => {
  const ok = await evaluate(`(() => { const e=document.querySelector('[data-testid=${quote(id)}]'); if(!e||e.disabled)return false; e.click(); return true })()`);
  assert(ok, `Could not click ${id}`);
};
const input = async (id, value) => {
  const ok = await evaluate(`(() => { const e=document.querySelector('[data-testid=${quote(id)}]'); if(!e)return false; e.focus(); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(e,${quote(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true })()`);
  assert(ok, `Could not input ${id}`);
  await sleep(40);
};
const selectOptionText = async text => {
  await waitFor(`[...document.querySelectorAll('[role=option]')].some(e=>e.textContent.trim()===${quote(text)})`, `${text} option`);
  assert(await evaluate(`(() => { const e=[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.trim()===${quote(text)}); e?.click(); return !!e })()`), `Could not select ${text}`);
};
const pickCatalog = async (id, name) => {
  await input(id, name);
  await waitFor(`[...document.querySelectorAll('div')].some(e=>e.children.length===2&&e.firstElementChild?.textContent.trim()===${quote(name)})`, `${name} catalog row`);
  assert(await evaluate(`(() => { const e=[...document.querySelectorAll('div')].find(e=>e.children.length===2&&e.firstElementChild?.textContent.trim()===${quote(name)}); if(!e)return false; e.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); return true })()`), `Could not pick ${name}`);
};
const text = id => evaluate(`document.querySelector('[data-testid=${quote(id)}]')?.innerText || ''`);
const exists = id => evaluate(`!!document.querySelector('[data-testid=${quote(id)}]')`);
const focus = async id => { await evaluate(`document.querySelector('[data-testid=${quote(id)}]')?.scrollIntoView({block:'center'})`); await sleep(150); };
const screenshot = async name => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};
const openRaiseMenu = async () => {
  assert(await evaluate(`(() => { const e=document.querySelector('[data-testid="button-raise-indent"]'); if(!e)return false; e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'})); e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerType:'mouse'})); return true })()`), "Could not open Raise Indent menu");
};
const fillHeader = async () => {
  await click("select-site"); await selectOptionText("SYNTHETIC SITE");
  await input("input-proposed-by", "SYNTHETIC REQUESTER");
  await input("input-raised-by", "SYNTHETIC ENGINEER");
  await input("input-item-qty-0", "25");
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await waitFor("document.readyState==='complete' && !!document.querySelector('[data-testid=pi02-fixture-disclosure]')", "fixture");
await waitFor("!!document.querySelector('[data-testid=card-indent-90]')", "initial list");

// Existing pre-fix row remains stores simply by opening it; no mutation occurs.
await click("card-indent-90");
await waitFor("!!document.querySelector('[data-testid=card-procure-item-9001]')", "old detail");
assert(await exists("button-expand-delivery-9001"), "Pre-fix synthetic stores route should still expose Record Delivery");
assert((await evaluate("window.__PI02Fixture.creates.length")) === 0, "Opening old row unexpectedly wrote data");
assert((await evaluate("window.__PI02Fixture.existingBefore.procurementRoute")) === "stores", "Old route changed");
await click("button-back-to-list");

// Untagged WMM in the real Bulk form must become material and save that payload.
await openRaiseMenu(); await waitFor("!!document.querySelector('[data-testid=menu-item-bulk-indent]')", "raise menu");
await click("menu-item-bulk-indent"); await waitFor("!!document.querySelector('[data-testid=card-item-row-0]')", "bulk form");
await fillHeader(); await pickCatalog("input-item-desc-0", "WMM");
assert((await text("select-item-route-0")).includes("BULK MATERIAL"), "Untagged WMM did not inherit Bulk route");
await focus("card-item-row-0");
const selectedScreenshot = await screenshot("A-new-bulk-WMM-selection-route-material-SYNTHETIC");
await click("button-submit-indent");
await waitFor("window.__PI02Fixture.creates.length===1", "Bulk create payload");
const bulkPayload = JSON.parse(await evaluate("JSON.stringify(window.__PI02Fixture.creates[0])"));
assert(bulkPayload.piType === "material" && bulkPayload.items[0].procurementRoute === "material", "Bulk save payload route mismatch");
await waitFor("!!document.querySelector('[data-testid=card-indent-92]')", "saved Bulk list");
await click("card-indent-92");
await waitFor("!!document.querySelector('[data-testid=card-procure-item-9200]')", "saved Bulk detail");
assert(await exists("card-record-mat-receipt"), "Material receipt banner missing");
assert(!(await exists("button-expand-delivery-9200")), "Record Delivery is visible for saved Bulk material");
await focus("card-record-mat-receipt");
const detailScreenshot = await screenshot("B-saved-bulk-detail-banner-no-Record-Delivery-SYNTHETIC");
await click("button-back-to-list");

// Store form preserves catalog route and untagged fallback.
await openRaiseMenu(); await waitFor("!!document.querySelector('[data-testid=menu-item-store-indent]')", "store menu");
await click("menu-item-store-indent"); await waitFor("!!document.querySelector('[data-testid=card-item-row-0]')", "store form");
await fillHeader(); await pickCatalog("input-item-desc-0", "CRANE HIRE");
assert((await text("select-item-route-0")).includes("SERVICE / HIRE"), "Tagged Store selection did not inherit service");
await click("button-submit-indent");
await waitFor("window.__PI02Fixture.creates.length===2", "tagged Store payload");
const taggedStorePayload = JSON.parse(await evaluate("JSON.stringify(window.__PI02Fixture.creates[1])"));
assert(taggedStorePayload.items[0].procurementRoute === "service", "Tagged Store payload route mismatch");

await openRaiseMenu(); await waitFor("!!document.querySelector('[data-testid=menu-item-store-indent]')", "second store menu");
await click("menu-item-store-indent"); await waitFor("!!document.querySelector('[data-testid=card-item-row-0]')", "fallback store form");
await fillHeader(); await pickCatalog("input-item-desc-0", "COTTON WASTE");
assert((await text("select-item-route-0")).includes("STORES"), "Untagged Store selection did not fallback to stores");
await click("button-submit-indent");
await waitFor("window.__PI02Fixture.creates.length===3", "fallback Store payload");
const fallbackStorePayload = JSON.parse(await evaluate("JSON.stringify(window.__PI02Fixture.creates[2])"));
assert(fallbackStorePayload.items[0].procurementRoute === "stores", "Untagged Store payload fallback mismatch");

const evidence = {
  scenario: "PI-02 real PurchaseIndents component with synthetic intercepted APIs",
  limitation: "UI/component and intercepted request evidence only; no live API, catalog, record, or database was read or written.",
  safety: { productionDatabaseUsed: false, productionApiWrites: false, mountedProductionComponent: "client/src/pages/PurchaseIndents.tsx", vitePort, cdpPort, chromiumProfile },
  screenshots: [selectedScreenshot, detailScreenshot],
  verified: {
    untaggedWmmBulkPayloadRoute: bulkPayload.items[0].procurementRoute,
    savedBulkHasMaterialReceiptBanner: true,
    savedBulkHasRecordDelivery: false,
    taggedStoreInheritedRoute: taggedStorePayload.items[0].procurementRoute,
    untaggedStoreFallbackRoute: fallbackStorePayload.items[0].procurementRoute,
    existingPreFixRouteBeforeAndAfterOpening: { before: "stores", after: "stores", writesCausedByOpening: 0 },
  },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close(); stop(); await sleep(250);
rmSync(chromiumProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });