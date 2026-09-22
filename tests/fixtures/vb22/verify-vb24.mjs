/*
 * VB-24 frontend-only evidence using real production components and the
 * synthetic in-memory adapter in main.tsx. No live API or database is used.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureDir = path.dirname(new URL(import.meta.url).pathname);
const workspace = path.resolve(fixtureDir, "../../..");
const evidenceDir = path.join(workspace, "screenshots/vb24");
const vitePort = 4196;
const cdpPort = 9346;
const profile = "/tmp/vb24-chromium-profile";
mkdirSync(evidenceDir, { recursive: true });
rmSync(profile, { recursive: true, force: true });

const children = [];
const stop = () => {
  for (const child of children.reverse()) {
    try { child.kill("SIGTERM"); } catch {}
  }
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
};
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });

const vite = spawn(path.join(workspace, "node_modules/.bin/vite"), [
  "--config", path.join(fixtureDir, "vite.config.ts"), "--host", "127.0.0.1",
  "--port", String(vitePort), "--strictPort",
], { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
children.push(vite);
let viteLog = "";
vite.stdout.on("data", chunk => { viteLog += chunk; });
vite.stderr.on("data", chunk => { viteLog += chunk; });

async function waitHttp(url, label, attempts = 240) {
  for (let i = 0; i < attempts; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}. ${viteLog.slice(-1000)}`);
}
await waitHttp(`http://127.0.0.1:${vitePort}`, "VB-24 fixture");

const chromium = spawn("/repl/tools/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`, "--window-size=1440,1000",
  `http://127.0.0.1:${vitePort}/site/materials-received?scenario=vb24`,
], { cwd: workspace, stdio: "ignore" });
children.push(chromium);
await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`, "VB-24 Chromium");

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error("No Chromium page target");
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result?.value;
};
const quote = value => JSON.stringify(value);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async (expression, label, attempts = 400) => {
  for (let i = 0; i < attempts; i += 1) {
    try { if (await evaluate(expression)) return; } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const click = async testId => {
  const ok = await evaluate(`(() => { const e=document.querySelector('[data-testid=${quote(testId)}]'); if(!e||e.disabled)return false; e.click(); return true; })()`);
  assert(ok, `Could not click ${testId}`);
};
const setInput = async (testId, value) => {
  const ok = await evaluate(`(() => { const e=document.querySelector('[data-testid=${quote(testId)}]'); if(!e)return false; const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set; s.call(e,${quote(value)}); e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); return true; })()`);
  assert(ok, `Could not set ${testId}`);
};
const selectOption = async (testId, label) => {
  await click(testId);
  await waitFor(`[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.trim()===${quote(label)})`, `${label} option`);
  assert(await evaluate(`(() => { const e=[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()===${quote(label)}); e?.click(); return !!e; })()`), `Could not select ${label}`);
};
const screenshot = async name => {
  await sleep(250);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(path.join(evidenceDir, `${name}.png`), Buffer.from(result.data, "base64"));
};
const load = async pathName => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}${pathName}` });
  await waitFor("document.readyState==='complete'", `${pathName} load`);
  await waitFor("!!document.querySelector('[data-testid=\"vb22-fixture-disclosure\"]')", "fixture disclosure");
};

await cdp("Page.enable");
await cdp("Runtime.enable");

await load("/site/materials-received?scenario=vb24");
await waitFor("!!document.querySelector('[data-testid=\"row-material-trip-2201\"]')", "received trip");
await click("row-material-trip-2201");
await click("btn-admin-edit");
await setInput("input-edit-material-source-supplier", "VB24 CORRECTED QUARRY");
assert(await evaluate("document.querySelector('[data-testid=\"input-edit-supplier\"]').value === 'VB22 ROAD TRANSPORT'"), "Transporter changed while editing source");
await evaluate("document.querySelector('[data-testid=\"input-edit-material-source-supplier\"]').scrollIntoView({block:'center'})");
await screenshot("A-single-trip-edit-material-source-SYNTHETIC");
await click("button-save-edit");
await waitFor("document.querySelector('[data-testid=\"button-cancel-edit\"]') && !document.querySelector('[data-testid=\"button-cancel-edit\"]').disabled", "edit save");
await click("button-cancel-edit");
await waitFor("document.querySelector('[data-testid=\"detail-material-source-supplier\"]')?.textContent.includes('VB24 CORRECTED QUARRY')", "saved source detail");

await load("/site/material-trips?scenario=vb24");
await setInput("input-filter-date-from", "2027-02-14");
await setInput("input-filter-date-to", "2027-02-14");
await selectOption("select-filter-site", "VB22 TEST ROAD");
await click("checkbox-filter-only-unassigned");
await waitFor("!!document.querySelector('[data-testid=\"button-history-trip-2201\"]')", "history button");
await click("button-history-trip-2201");
await waitFor("!!document.querySelector('[data-testid=\"audit-material-source-change-24002\"]')", "history changes");
assert((await evaluate("document.querySelector('[data-testid=\"list-audit-history\"]').innerText")).includes("Material Source / Supplier"), "Friendly history label missing");
await evaluate(`(() => {
  const label = document.createElement("div");
  label.textContent = "VB-24 REAL-COMPONENT FIXTURE — SYNTHETIC API + AUDIT HISTORY — NO LIVE API OR DATABASE WRITES";
  Object.assign(label.style, { position:"fixed", top:"0", left:"0", right:"0", zIndex:"2147483647", background:"#faf5ff", color:"#581c87", borderBottom:"1px solid #d8b4fe", padding:"7px", textAlign:"center", fontSize:"12px", fontWeight:"700" });
  document.body.appendChild(label);
})()`);
await screenshot("B-trip-history-bulk-and-single-old-new-SYNTHETIC");

writeFileSync(path.join(evidenceDir, "evidence.json"), JSON.stringify({
  disclosure: "Real production React components with synthetic intercepted API and audit data; no live API/database proof.",
  singleTripEdit: "Material source was edited independently; transporter remained VB22 ROAD TRANSPORT.",
  history: "History rendered friendly Material Source / Supplier labels with Old and New values for synthetic bulk and single-trip entries.",
  screenshots: [
    "A-single-trip-edit-material-source-SYNTHETIC.png",
    "B-trip-history-bulk-and-single-old-new-SYNTHETIC.png",
  ],
}, null, 2));

socket.close();
stop();