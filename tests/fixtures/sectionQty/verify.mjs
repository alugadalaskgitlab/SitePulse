import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/section-qty-01");
const vitePort = 4197;
const cdpPort = 9347;
const chromiumProfile = "/tmp/section-qty-01-chromium-profile";
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
  throw new Error(`Timed out waiting for ${label}. ${viteLog.slice(-1200)}`);
}
await waitHttp(`http://127.0.0.1:${vitePort}`, "SECTION-QTY Vite");

const chromium = spawn("/repl/tools/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${chromiumProfile}`, "--window-size=1920,1400",
  `http://127.0.0.1:${vitePort}/?view=item`,
], { cwd: workspace, stdio: "ignore" });
children.push(chromium);
await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "SECTION-QTY Chromium");
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error("No SECTION-QTY Chromium page");
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
const setInput = async (label, value) => {
  const changed = await evaluate(`(() => {
    const e=[...document.querySelectorAll('input')].find(node=>node.getAttribute('aria-label')===${JSON.stringify(label)});
    if(!e)return false;
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set;
    setter?.call(e,${JSON.stringify(String(value))});
    e.dispatchEvent(new Event("input",{bubbles:true}));
    e.dispatchEvent(new Event("change",{bubbles:true}));
    return true;
  })()`);
  assert(changed, `Could not set ${label}`);
};
const screenshot = async name => {
  await sleep(300);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1400, deviceScaleFactor: 1, mobile: false });
await waitFor("document.readyState==='complete' && !!document.querySelector('[data-testid=boq-typical-sections]')", "BOQ item editor");
await click("button-add-typical-section");
await setInput("Section 1 from km", "0");
await setInput("Section 1 to km", "1.25");
await setInput("Section 1 top width", "10.5");
await setInput("Section 1 thickness", "500");
await setInput("Section 1 side slope", "2");
await waitFor("!document.querySelector('[data-testid=button-save-typical-sections]').disabled", "valid section save");
await click("button-save-typical-sections");
await waitFor("window.__SECTION_QTY_FIXTURE.sections.length===1", "synthetic section save");
await waitFor("document.body.innerText.includes('7,187.5 cum')", "section quantity shown");
const itemFixtureState = JSON.parse(await evaluate("JSON.stringify(window.__SECTION_QTY_FIXTURE)"));
assert(itemFixtureState.writes.length === 1, "Expected one intercepted section save");
const itemScreenshot = await screenshot("item-edit-typical-section-SYNTHETIC");

await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/?view=results` });
await waitFor("document.readyState==='complete' && !!document.querySelector('[data-testid=section-qty-fixture-results]')", "work value and BOM fixture");
const resultsText = await evaluate("document.body.innerText");
assert(resultsText.includes("10,00,000") && resultsText.includes("7,18,750"), "Work value before/after values missing");
assert(resultsText.includes("10,000 cum") && resultsText.includes("7,187.5 cum"), "BOM before/after values missing");
const resultsScreenshot = await screenshot("work-value-and-bom-before-after-SYNTHETIC");
const evidence = {
  fixture: "SECTION-QTY-01 synthetic item and scope fixture",
  noDatabaseWrites: true,
  interceptedSectionSaves: itemFixtureState.writes.length,
  screenshots: { item: itemScreenshot, workValueAndBom: resultsScreenshot },
  values: { quantityPerMetre: 5.75, sectionQuantity: 7187.5, workValueBefore: 1000000, workValueAfter: 718750 },
};
writeFileSync(path.join(evidenceDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();
stop();
await sleep(250);
