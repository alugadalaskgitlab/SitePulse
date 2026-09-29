// DPR15 Part D: isolated personnel interactions in the already-running mockup.
// node artifacts/mockup-sandbox/src/components/mockups/dpr14/tests/browser-personnel.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";

const preview = "http://127.0.0.1:23636/__mockup/preview/dpr14/CondensedDpr";
const screenshots = path.resolve("screenshots");
let browser, socket, profile, nextId = 0;
const pending = new Map(), browserErrors = [], forbiddenRequests = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(source) {
  const result = await send("Runtime.evaluate", { expression: source, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const js = code => evaluate(`(() => { ${code} })()`);
const click = selector => js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error("Missing element: " + ${JSON.stringify(selector)}); el.click();`);
const value = (selector, text) => js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error("Missing input: " + ${JSON.stringify(selector)}); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event("input",{bubbles:true}));`);
// Radix Select opens on pointerdown; dispatch a real CDP mouse gesture rather than HTMLElement.click().
async function mouse(selector) {
  const point = await js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error("Missing pointer target: " + ${JSON.stringify(selector)}); let r=el.getBoundingClientRect(); if(r.top<0 || r.bottom>innerHeight || r.left<0 || r.right>innerWidth) { el.scrollIntoView({block:"center",behavior:"instant"}); r=el.getBoundingClientRect(); } return { x:r.left+r.width/2, y:r.top+r.height/2 };`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
}
const options = () => js('return [...document.querySelectorAll("[role=option]")].filter(e => e.getBoundingClientRect().width > 0).map(e => e.textContent.trim())');
async function choose(text) {
  for (let i = 0; i < 10 && !(await options()).includes(text); i++) await sleep(50);
  const selector = await js(`const el=[...document.querySelectorAll("[role=option]")].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!el) throw Error("Option not present: " + ${JSON.stringify(text)}); el.setAttribute("data-test-target",""); return "[data-test-target]";`);
  await mouse(selector);
  await sleep(80);
}
async function picker(row) {
  await sleep(180);
  await mouse(`#dpr14-${row} [data-testid="select-personnel-${row === "excavation" ? 0 : 1}"]`);
  await sleep(80);
  if (!(await options()).length) {
    await sleep(200);
    await mouse(`#dpr14-${row} [data-testid="select-personnel-${row === "excavation" ? 0 : 1}"]`);
    await sleep(80);
  }
  return options();
}
const badges = row => js(`return [...document.querySelectorAll("#dpr14-${row} .dpr14-detail-pane .bg-secondary")].map(e=>e.textContent.trim())`);
async function screenshot(name, fullPage = false) {
  await sleep(250);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage, fromSurface: true });
  await writeFile(path.join(screenshots, `dpr15-${name}.png`), Buffer.from(data, "base64"));
}
const noOverflow = async label => assert.equal(await js('return document.documentElement.scrollWidth <= window.innerWidth'), true, `${label}: horizontal overflow`);
const dialogOpen = () => js('return !!document.querySelector("[role=dialog]")');
async function waitForDialogClose() {
  for (let i = 0; i < 15 && await dialogOpen(); i++) await sleep(50);
  assert.equal(await dialogOpen(), false);
}
async function newDialog(row) {
  await picker(row);
  await choose("New Personnel");
  assert.equal(await dialogOpen(), true);
}
async function cancel() {
  await js('const button=[...document.querySelectorAll("[role=dialog] button")].find(e=>e.textContent.trim()==="Cancel"); if(!button) throw Error("Missing Cancel"); button.click();');
  await waitForDialogClose();
}

try {
  await mkdir(screenshots, { recursive: true });
  profile = await mkdtemp(path.join(tmpdir(), "dpr15-personnel-"));
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
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") browserErrors.push(msg.params.args.map(arg => arg.value ?? arg.description).join(" "));
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") browserErrors.push(msg.params.entry.text);
    if (msg.method === "Network.requestWillBeSent" && /\/api(?:\/|\?|$)/.test(msg.params.request.url)) forbiddenRequests.push(msg.params.request.url);
  });
  for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) await send(method);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: preview });
  for (let i = 0; i < 100; i++) {
    if (await js('return !!document.querySelector("#dpr14-excavation")')) break;
    await sleep(100);
  }
  assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 2);
  await js('window.__caught=[]; window.addEventListener("error", e => window.__caught.push({message:e.message, stack:e.error?.stack}), true); window.addEventListener("unhandledrejection", e => window.__caught.push({message:String(e.reason), stack:e.reason?.stack}), true);');
  await click("#dpr14-excavation .dpr14-activity-toggle");
  await click("#dpr14-embankment .dpr14-activity-toggle");
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);
  assert.deepEqual(await badges("embankment"), ["M. DESHMUKH"]);
  await noOverflow("desktop expanded");

  assert.deepEqual(await picker("excavation"), ["M. DESHMUKH (Supervisor)", "S. KUMAR (Foreman)", "New Personnel"]);
  await screenshot("personnel-picker");
  assert.ok((await options()).includes("S. KUMAR (Foreman)"), "Picker remains open after screenshot");
  await choose("S. KUMAR (Foreman)");
  assert.deepEqual(await badges("excavation"), ["A. PATIL", "S. KUMAR"]);
  assert.deepEqual(await badges("embankment"), ["M. DESHMUKH"]);
  await mouse('[aria-label="Remove S. KUMAR from Roadway excavation"]');
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);
  assert.ok((await picker("excavation")).includes("S. KUMAR (Foreman)"));
  await choose("New Personnel");
  assert.equal(await js('return document.querySelector("[role=dialog] [data-testid=select-new-personnel-role]").textContent.trim()'), "Engineer");
  await value("#dpr14-new-personnel-name", "  jane doe  ");
  await value("#dpr14-new-personnel-phone", "ab123");
  assert.equal(await js('return document.querySelector("#dpr14-new-personnel-name").value'), "  JANE DOE  ");
  assert.equal(await js('return document.querySelector("#dpr14-new-personnel-phone").value'), "AB123");
  await screenshot("personnel-dialog");
  assert.deepEqual(await pickerRoles(), ["Engineer", "Supervisor", "Assistant", "Foreman", "Other"]);
  await choose("Assistant");
  await cancel();
  assert.equal(await dialogOpen(), false);
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);
  assert.deepEqual(await badges("embankment"), ["M. DESHMUKH"]);
  assert.ok(!(await picker("embankment")).some(x => x.includes("JANE DOE")));
  await choose("New Personnel");
  assert.equal(await js('return document.querySelector("#dpr14-new-personnel-name").value'), "");
  await value("#dpr14-new-personnel-name", "jane doe");
  await pickerRoles();
  await choose("Assistant");
  await value("#dpr14-new-personnel-phone", "ab123");
  await click('[data-testid="button-save-new-personnel"]');
  await waitForDialogClose();
  assert.deepEqual(await badges("embankment"), ["M. DESHMUKH", "JANE DOE"]);
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);
  assert.ok((await picker("excavation")).includes("JANE DOE (Assistant)"));
  await choose("JANE DOE (Assistant)");
  assert.deepEqual(await badges("excavation"), ["A. PATIL", "JANE DOE"]);
  await mouse('[aria-label="Remove JANE DOE from Roadway excavation"]');
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);

  await newDialog("excavation");
  await value("#dpr14-new-personnel-name", " m. deshmukh ");
  await click('[data-testid="button-save-new-personnel"]');
  assert.match(await js('return document.querySelector("[data-testid=alert-duplicate-personnel]").textContent'), /M\. DESHMUKH already exists \(Supervisor\)/);
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);
  await click('[data-testid="button-use-existing-personnel"]');
  await waitForDialogClose();
  assert.deepEqual(await badges("excavation"), ["A. PATIL", "M. DESHMUKH"]);
  assert.deepEqual(await badges("embankment"), ["M. DESHMUKH", "JANE DOE"]);

  await newDialog("excavation");
  await value("#dpr14-new-personnel-name", " jane doe ");
  await click('[data-testid="button-save-new-personnel"]');
  assert.match(await js('return document.querySelector("[data-testid=alert-duplicate-personnel]").textContent'), /JANE DOE already exists \(Assistant\)/);
  await click('[data-testid="button-use-existing-personnel"]');
  assert.deepEqual(await badges("excavation"), ["A. PATIL", "M. DESHMUKH", "JANE DOE"]);
  assert.equal((await badges("embankment")).filter(x => x === "JANE DOE").length, 1);
  await noOverflow("desktop personnel");

  // Both rows expanded, excavation's conditional Partly quantity shown, and all blockers resolved.
  await click("#dpr14-outcome-first"); // Fully reusable
  await js('return [...document.querySelectorAll("#dpr14-excavation .dpr14-outcome")].find(e => e.textContent.trim() === "Partly reusable").click()');
  assert.ok(await js('return !!document.querySelector("#dpr14-reusable-qty")'));
  await value("#dpr14-reusable-qty", "125.5");
  await click(".dpr14-confirm");
  assert.equal(await js('return document.querySelector(".dpr14-alert")'), null);
  assert.equal(await js('return document.querySelectorAll(".dpr14-details").length'), 2);
  await screenshot("complete-desktop", true);

  await click(".dpr14-reset");
  assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 2);
  assert.equal(await js('return document.querySelectorAll(".dpr14-details").length'), 0);
  await click("#dpr14-excavation .dpr14-activity-toggle");
  await click("#dpr14-embankment .dpr14-activity-toggle");
  assert.deepEqual(await badges("excavation"), ["A. PATIL"]);
  assert.deepEqual(await badges("embankment"), ["M. DESHMUKH"]);
  assert.deepEqual(await picker("excavation"), ["M. DESHMUKH (Supervisor)", "S. KUMAR (Foreman)", "New Personnel"]);
  await choose("New Personnel");
  await pickerRoles();
  await choose("Other");
  await cancel();
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await noOverflow("mobile both expanded");
  assert.deepEqual(await picker("embankment"), ["A. PATIL (Engineer)", "S. KUMAR (Foreman)", "New Personnel"]);
  await noOverflow("mobile picker");
  await choose("New Personnel");
  await noOverflow("mobile dialog");
  await screenshot("personnel-mobile");
  await cancel();
  assert.deepEqual(forbiddenRequests, [], "Unexpected API calls");
  assert.deepEqual(browserErrors, [], "Browser errors");
  const observedErrors = await js('return window.__caught');
  assert.deepEqual(observedErrors, [], "Window errors");
  assert.equal(await js('return !!document.querySelector("vite-error-overlay")'), false, "Dev error overlay");
  console.log("PASS Part D: named roles, row-local attach/remove, create, cancel, duplicates, reset, mobile/desktop; API requests: none; browser errors: none");
} finally {
  if (socket) socket.close();
  if (browser) {
    browser.kill("SIGTERM");
    await new Promise(resolve => { if (browser.exitCode !== null) return resolve(); browser.once("exit", resolve); setTimeout(resolve, 3000); });
    if (browser.exitCode === null) browser.kill("SIGKILL");
  }
  if (profile) await rm(profile, { recursive: true, force: true });
}

async function pickerRoles() {
  await mouse('[data-testid="select-new-personnel-role"]');
  await sleep(80);
  return options();
}