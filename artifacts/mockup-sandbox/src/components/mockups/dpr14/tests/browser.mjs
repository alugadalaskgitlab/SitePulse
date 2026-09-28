// Isolated DPR 14 browser regression. Run from workspace root:
// node artifacts/mockup-sandbox/src/components/mockups/dpr14/tests/browser.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const base = "http://127.0.0.1:23636";
const preview = `${base}/__mockup/preview/dpr14/CondensedDpr`;
const screenshots = path.resolve("screenshots");
let browser, socket, profile;
let nextId = 0;
const pending = new Map();
const browserErrors = [];
const forbiddenRequests = [];

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(source) {
  const result = await send("Runtime.evaluate", {
    expression: source,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
const js = (code) => evaluate(`(() => { ${code} })()`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const click = selector => js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error(${JSON.stringify(`Missing ${selector}`)}); el.click();`);
const value = (selector, text) => js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error(${JSON.stringify(`Missing ${selector}`)}); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event("input",{bubbles:true}));`);
const snapshot = async name => {
  await sleep(250);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(path.join(screenshots, `dpr14-${name}.png`), Buffer.from(data, "base64"));
};
const check = async (name, test) => {
  await test();
  console.log(`PASS ${name}`);
};

try {
  await mkdir(screenshots, { recursive: true });
  profile = await mkdtemp(path.join(tmpdir(), "dpr14-chrome-"));
  browser = spawn("/repl/tools/bin/chromium", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let port;
  for (let i = 0; i < 100; i++) {
    if (browser.exitCode !== null) throw new Error(`Chromium exited: ${browser.exitCode}`);
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; }
    catch { await sleep(100); }
  }
  assert.ok(port, "Chromium debugging port did not start");
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const tab = tabs.find(t => t.type === "page");
  assert.ok(tab, "No Chromium page target");
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.on("message", bytes => {
    const msg = JSON.parse(bytes.toString());
    if (msg.id && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown") browserErrors.push(msg.params.exceptionDetails.text);
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") browserErrors.push(msg.params.entry.text);
    if (msg.method === "Network.requestWillBeSent") {
      const url = msg.params.request.url;
      if (/\/api(?:\/|\?|$)/.test(url)) forbiddenRequests.push(url);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: preview });
  for (let i = 0; i < 100; i++) {
    if (await js('return !!document.querySelector(".dpr14-card")')) break;
    await sleep(100);
  }

  await check("initial two blockers and collapsed activities", async () => {
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 2);
    assert.equal(await js('return document.querySelectorAll(".dpr14-activity-toggle[aria-expanded=true]").length'), 0);
    assert.equal(await js('return document.querySelectorAll(".dpr14-details").length'), 0);
    assert.equal(await js('return document.querySelector(".dpr14-alert-title").textContent'), "2 items to resolve before submission");
  });
  await snapshot("desktop-initial");

  await check("Fix opens excavation and focuses precise outcome", async () => {
    await click('.dpr14-fix[aria-label^="Fix Roadway excavation"]');
    await sleep(160);
    assert.equal(await js('return document.querySelector("#dpr14-excavation .dpr14-activity-toggle").getAttribute("aria-expanded")'), "true");
    assert.equal(await js('return document.activeElement.id'), "dpr14-outcome-first");
    assert.equal(await js('return document.querySelector("#dpr14-embankment .dpr14-activity-toggle").getAttribute("aria-expanded")'), "false");
  });
  await check("outcome clears only excavation blocker", async () => {
    await click("#dpr14-outcome-first");
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 1);
    assert.match(await js('return document.querySelector(".dpr14-alert").textContent'), /closing tank reading not confirmed/);
    assert.equal(await js('return document.querySelector("#dpr14-outcome-first").getAttribute("aria-pressed")'), "true");
  });
  await check("equipment Fix focuses reading, confirmation clears banner", async () => {
    await click('.dpr14-fix[aria-label^="Fix Excavator"]');
    await sleep(160);
    assert.equal(await js('return document.activeElement.id'), "dpr14-tank-input");
    await click(".dpr14-confirm");
    assert.equal(await js('return document.querySelector(".dpr14-alert") === null'), true);
    assert.match(await js('return document.querySelector(".dpr14-consumption").textContent'), /47 L/);
  });
  await snapshot("desktop-resolved");

  await check("source Change stays local to embankment", async () => {
    await click("#dpr14-embankment .dpr14-activity-toggle");
    await click("#dpr14-embankment .dpr14-textbutton");
    assert.equal(await js('return document.querySelectorAll("#dpr14-embankment .dpr14-source-option").length'), 3);
    await click("#dpr14-embankment .dpr14-source-option:nth-child(3)");
    assert.match(await js('return document.querySelector("#dpr14-embankment .dpr14-sourcebox").textContent'), /Approved external borrow/);
    assert.equal(await js('return document.querySelector("#dpr14-embankment .dpr14-source-picker") === null'), true);
    assert.equal(await js('return document.querySelectorAll("#dpr14-excavation .dpr14-sourcebox").length'), 0);
  });
  await check("personnel and geometry update individual rows", async () => {
    await value("#dpr14-crew-embankment", "Earthworks crew · 9");
    await value("#dpr14-width-excavation", "8");
    assert.equal(await js('return document.querySelector("#dpr14-crew-embankment").value'), "Earthworks crew · 9");
    assert.equal(await js('return document.querySelector("#dpr14-excavation .dpr14-quantity").textContent'), "504CUM");
    assert.equal(await js('return document.querySelector("#dpr14-embankment .dpr14-quantity").textContent'), "280CUM");
  });
  await check("photos add and remove locally", async () => {
    const { root } = await send("DOM.getDocument");
    const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: '#dpr14-embankment input[type="file"]' });
    assert.ok(nodeId);
    const fixture = path.join(profile, "sample-photo.png");
    await writeFile(fixture, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64"));
    await send("DOM.setFileInputFiles", { nodeId, files: [fixture] });
    assert.match(await js('return document.querySelector("#dpr14-embankment .dpr14-upload").textContent'), /1 selected locally/);
    assert.match(await js('return document.querySelector("#dpr14-embankment .dpr14-photolist").textContent'), /sample-photo.png/);
    await click("#dpr14-embankment .dpr14-photo button");
    assert.match(await js('return document.querySelector("#dpr14-embankment .dpr14-upload").textContent'), /No photos selected/);
  });
  await check("meter/clock each have one summary label", async () => {
    assert.equal(await js('return [...document.querySelectorAll(".dpr14-stat-label")].filter(x=>x.textContent==="Meter hours").length'), 1);
    assert.equal(await js('return [...document.querySelectorAll(".dpr14-stat-label")].filter(x=>x.textContent==="Clock duration").length'), 1);
  });
  await snapshot("desktop-expanded");
  await check("reset restores both blockers and seed values", async () => {
    await click(".dpr14-reset");
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 2);
    assert.equal(await js('return document.querySelectorAll(".dpr14-details").length'), 0);
    assert.equal(await js('return document.querySelector(".dpr14-consumption").textContent'), "Consumption: Incomplete — tank not confirmed");
    assert.equal(await js('return document.querySelector("#dpr14-excavation .dpr14-quantity").textContent'), "441CUM");
  });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await check("390px mobile has no horizontal overflow, collapsed or expanded", async () => {
    assert.equal(await js('return document.documentElement.scrollWidth <= window.innerWidth'), true);
    await click("#dpr14-excavation .dpr14-activity-toggle");
    await click("#dpr14-embankment .dpr14-activity-toggle");
    assert.equal(await js('return document.documentElement.scrollWidth <= window.innerWidth'), true);
  });
  await snapshot("mobile-expanded");
  assert.deepEqual(forbiddenRequests, [], "Unexpected API calls");
  assert.deepEqual(browserErrors, [], "Browser errors");
  console.log("Browser errors: none; API requests: none");
} finally {
  if (socket) socket.close();
  if (browser) {
    browser.kill("SIGTERM");
    await new Promise(resolve => { if (browser.exitCode !== null) return resolve(); browser.once("exit", resolve); setTimeout(resolve, 3000); });
    if (browser.exitCode === null) browser.kill("SIGKILL");
  }
  if (profile) await rm(profile, { recursive: true, force: true });
}