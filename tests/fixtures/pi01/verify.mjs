/*
 * PI-01 isolated browser verification.
 *
 * Runs the production PurchaseIndents component on Vite 4195 and Chromium CDP
 * 9345. main.tsx intercepts all API reads/writes with labelled synthetic data.
 * This is UI/component evidence only, never backend or database proof.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/pi01");
const vitePort = 4195;
const cdpPort = 9345;
const chromiumProfile = "/tmp/pi01-chromium-profile";
mkdirSync(evidenceDir, { recursive: true });
rmSync(chromiumProfile, { recursive: true, force: true });

const children = [];
const stop = () => {
  for (const child of children.reverse()) {
    try { child.kill("SIGTERM"); } catch {}
  }
  // Chromium can still be flushing profile files for a few milliseconds after
  // SIGTERM. Cleanup is best-effort here; the awaited final cleanup is below.
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
  for (let i = 0; i < attempts; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}. ${viteLog.slice(-1000)}`);
}
await waitHttp(`http://127.0.0.1:${vitePort}`, "PI-01 Vite");

const chromium = spawn("/repl/tools/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${chromiumProfile}`, "--window-size=1920,1080",
  `http://127.0.0.1:${vitePort}`,
], { cwd: workspace, stdio: "ignore" });
children.push(chromium);
await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "Chromium CDP");

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error("No Chromium page target on PI-01 CDP port 9345");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (!message.id || !pending.has(message.id)) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
};
const quote = value => JSON.stringify(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i += 1) {
    try { if (await evaluate(expression)) return; } catch (error) {
      if (!/navigated|context.*destroyed/i.test(error.message)) throw error;
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const clickTestId = async testId => {
  const clicked = await evaluate(`(() => { const e=document.querySelector('[data-testid=${quote(testId)}]'); if(!e||e.disabled)return false; e.click(); return true; })()`);
  assert(clicked, `Could not click ${testId}`);
};
const clickPanelButton = async (panelId, label) => {
  const clicked = await evaluate(`(() => { const p=document.querySelector('[data-testid=${quote(panelId)}]'); const e=[...(p?.querySelectorAll('button')||[])].find(x=>x.textContent.trim()===${quote(label)}); if(!e||e.disabled)return false; e.click(); return true; })()`);
  assert(clicked, `Could not click ${label} in ${panelId}`);
};
const selectRadix = async (testId, label) => {
  await clickTestId(testId);
  await waitFor(`[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.trim()===${quote(label)})`, `${label} option`);
  const clicked = await evaluate(`(() => { const e=[...document.querySelectorAll('[role="option"]')].find(x=>x.textContent.trim()===${quote(label)}); e?.click(); return !!e; })()`);
  assert(clicked, `Could not select ${label}`);
};
const selectNative = async (testId, value) => {
  const changed = await evaluate(`(() => { const e=document.querySelector('[data-testid=${quote(testId)}]'); if(!e)return false; const s=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; s.call(e,${quote(value)}); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
  assert(changed, `Could not set ${testId}`);
};
const text = testId => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.innerText || ''`);
const exists = testId => evaluate(`!!document.querySelector('[data-testid=${quote(testId)}]')`);
const focus = async testId => {
  await evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.scrollIntoView({block:'center'})`);
  await sleep(180);
};
const screenshot = async name => {
  await sleep(200);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await waitFor("document.readyState==='complete' && !!document.querySelector('[data-testid=\"pi01-fixture-disclosure\"]')", "fixture disclosure");
await waitFor("!!document.querySelector('[data-testid=\"card-indent-1\"]')", "PI list");

// A: synthetic list shows independently-scoped sequence values for two sites.
assert((await text("text-indent-no-1")) === "HLC/PI/ALLADURG/2027/0004", "A Site A number mismatch");
assert((await text("text-indent-no-2")) === "HLC/PI/ZAHEERABAD/2027/0001", "A Site B number mismatch");
assert((await text("badge-site-1")).includes("ALLADURG"), "A Site A label missing");
assert((await text("badge-site-2")).includes("ZAHEERABAD"), "A Site B label missing");
await focus("card-indent-1");
const screenshotA = await screenshot("A-site-scoped-numbers-two-sites-SYNTHETIC");

// B: same site's Store and Bulk rows share one sequence (0004 then 0005).
await selectRadix("filter-location", "ALLADURG");
await waitFor("!!document.querySelector('[data-testid=\"card-indent-3\"]') && !document.querySelector('[data-testid=\"card-indent-2\"]')", "ALLADURG filtered rows");
assert((await text("text-indent-no-3")) === "HLC/PI/ALLADURG/2027/0005", "B Store number did not continue the site counter");
assert((await text("badge-pi-type-1")).includes("MAT"), "B Bulk type badge missing");
assert((await text("badge-pi-type-3")).includes("STORE"), "B Store type badge missing");
await focus("card-indent-1");
const screenshotB = await screenshot("B-same-site-counter-shared-by-bulk-and-store-SYNTHETIC");

// C: exercise the real create form. Bulk hides store-only fields; Store restores them.
assert(await evaluate(`(() => {
  const e=document.querySelector('[data-testid="button-raise-indent"]');
  if(!e)return false;
  e.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,ctrlKey:false,pointerType:"mouse"}));
  e.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,button:0,pointerType:"mouse"}));
  return true;
})()`), "Could not open Raise Indent menu");
await waitFor("!!document.querySelector('[data-testid=\"menu-item-bulk-indent\"]')", "new PI menu");
await clickTestId("menu-item-bulk-indent");
await waitFor("!!document.querySelector('[data-testid=\"card-item-row-0\"]')", "Bulk PI form");
assert(!(await exists("input-item-spec-0")), "C Bulk form wrongly shows Spec / Dimensions");
assert(!(await exists("input-item-partno-0")), "C Bulk form wrongly shows Part No / Cat No");
await focus("card-item-row-0");
const screenshotC1 = await screenshot("C1-bulk-form-hides-spec-and-part-fields-SYNTHETIC");
await clickTestId("button-change-pi-type");
await waitFor("!!document.querySelector('[data-testid=\"input-item-spec-0\"]') && !!document.querySelector('[data-testid=\"input-item-partno-0\"]')", "Store-only fields");
await focus("card-item-row-0");
const screenshotC2 = await screenshot("C2-store-form-keeps-spec-and-part-fields-SYNTHETIC");

// Return to list and open the real detail view.
await clickTestId("button-back-to-list");
await waitFor("!!document.querySelector('[data-testid=\"card-indent-1\"]')", "PI list after form");
await clickTestId("card-indent-1");
await waitFor("!!document.querySelector('[data-testid=\"delivery-panel-101\"]')", "Bulk delivery detail");

// D: partial progress past Required By stays informative and reports quantities.
const partial = await text("delivery-progress-101");
assert(partial.includes("600 of 1,500 MT delivered"), `D partial quantity wording missing: ${partial}`);
assert(partial.includes("partially delivered") && partial.includes("past required date"), `D partial overdue context missing: ${partial}`);
await focus("delivery-panel-101");
const screenshotD = await screenshot("D-partial-overdue-progress-600-of-1500-SYNTHETIC");

// E: full delivery after the old due date is Delivered, never Overdue.
const full = await text("delivery-progress-102");
assert(full.startsWith("Delivered"), `E full item not Delivered: ${full}`);
assert(!full.includes("Overdue"), `E fully delivered item is wrongly overdue: ${full}`);
await focus("delivery-panel-102");
const screenshotE = await screenshot("E-fully-delivered-after-date-not-overdue-SYNTHETIC");

// F: ordered item with no destination exposes and saves the explicit selection.
assert((await text("delivery-panel-103")).includes("Not confirmed"), "F missing unconfirmed destination state");
await clickPanelButton("delivery-panel-103", "Confirm destination");
await selectNative("destination-correct-103", "site");
await waitFor("!!document.querySelector('[data-testid=\"destination-site-correct-103\"]')", "receiving site selector");
await selectNative("destination-site-correct-103", "22");
await focus("delivery-panel-103");
const screenshotF = await screenshot("F-required-destination-selection-site-SYNTHETIC");
await clickPanelButton("delivery-panel-103", "Save destination");
await waitFor("(window.__PI01Fixture?.destinationUpdates||[]).length===1", "destination PATCH");
const destinationUpdate = JSON.parse(await evaluate("JSON.stringify(window.__PI01Fixture.destinationUpdates[0])"));
assert(destinationUpdate.receivingLocation === "site" && destinationUpdate.receivingSiteId === 22, "F destination PATCH payload mismatch");

// G: one item visibly combines a plant receipt and a site trip with quantities.
const combined = await text("delivery-panel-101");
assert(combined.includes("Plant receipt #7101") && combined.includes("400 MT"), "G plant receipt evidence missing");
assert(combined.includes("Site trip #8101") && combined.includes("200 MT"), "G site trip evidence missing");
await focus("delivery-panel-101");
const screenshotG = await screenshot("G-combined-plant-receipt-and-site-trip-SYNTHETIC");

const state = JSON.parse(await evaluate("JSON.stringify(window.__PI01Fixture)"));
const evidence = {
  scenario: "PI-01 real PurchaseIndents component browser verification with intercepted synthetic APIs",
  limitation: "UI/component evidence only. This does not prove backend sequencing, persistence, reconciliation, migrations, or production data.",
  safety: {
    productionDatabaseUsed: false,
    productionApiWrites: false,
    mountedProductionComponent: "client/src/pages/PurchaseIndents.tsx",
    interception: "Every /api request was intercepted by tests/fixtures/pi01/main.tsx.",
    vitePort, cdpPort,
  },
  screenshots: [screenshotA, screenshotB, screenshotC1, screenshotC2, screenshotD, screenshotE, screenshotF, screenshotG],
  verified: {
    A_syntheticSiteScopedNumbersRendered: true,
    B_syntheticSameSiteCounterSharedAcrossTypes: true,
    C_realFormConditionalFields: { bulkHidden: true, storeVisible: true },
    D_realProgressRendererPartialPastDue: partial,
    E_realProgressRendererFullDelivered: full,
    F_realDestinationControlAndInterceptedPatch: destinationUpdate,
    G_realCombinedEvidenceRenderer: { plantReceipt: "400 MT", siteTrip: "200 MT" },
  },
  interceptedRequestCount: state.requests.length,
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();
stop();
await sleep(250);
rmSync(chromiumProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });