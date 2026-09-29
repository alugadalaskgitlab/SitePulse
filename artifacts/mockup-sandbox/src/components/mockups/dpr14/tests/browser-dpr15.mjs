// DPR15 isolated Chromium/CDP regression, against the already-running mockup preview.
// node artifacts/mockup-sandbox/src/components/mockups/dpr14/tests/browser-dpr15.mjs
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
const js = code => evaluate(`(() => { ${code} })()`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const click = selector => js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error(${JSON.stringify(`Missing ${selector}`)}); el.click();`);
const value = (selector, text) => js(`const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw Error(${JSON.stringify(`Missing ${selector}`)}); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set; setter.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event("input",{bubbles:true}));`);
const snapshot = async name => {
  await sleep(300);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  await writeFile(path.join(screenshots, `dpr15-${name}.png`), Buffer.from(data, "base64"));
};
const check = async (name, test) => {
  await test();
  console.log(`PASS ${name}`);
};
const physical = id => js(`const card=document.querySelector("#dpr14-${id}"); return { summary: card.querySelector(".dpr14-quantity").textContent, input: card.querySelector('input[aria-label$="calculated physical quantity in cubic metres"]').value };`);
const assertPhysical = async (id, number) => {
  assert.deepEqual(await physical(id), { summary: `${number}CUM`, input: String(number) });
};

try {
  await mkdir(screenshots, { recursive: true });
  profile = await mkdtemp(path.join(tmpdir(), "dpr15-chrome-"));
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
    if (msg.method === "Network.requestWillBeSent") {
      const url = msg.params.request.url;
      if (/\/api(?:\/|\?|$)/.test(url)) forbiddenRequests.push(url);
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: preview });
  for (let i = 0; i < 100; i++) {
    if (await js('return !!document.querySelector(".dpr14-card")')) break;
    await sleep(100);
  }
  await check("initial blockers and collapsed state", async () => {
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 2);
    assert.equal(await js('return document.querySelectorAll(".dpr14-details").length'), 0);
    assert.equal(await js('return document.querySelector(".dpr14-alert-title").textContent'), "2 items to resolve before submission");
  });
  await check("banner Fix opens excavation and focuses outcome", async () => {
    await click('.dpr14-fix[aria-label^="Fix Roadway excavation"]');
    await sleep(160);
    assert.equal(await js('return document.querySelector("#dpr14-excavation .dpr14-activity-toggle").getAttribute("aria-expanded")'), "true");
    assert.equal(await js('return document.activeElement.id'), "dpr14-outcome-first");
    assert.equal(await js('return document.querySelector("#dpr14-embankment .dpr14-activity-toggle").getAttribute("aria-expanded")'), "false");
    await click("#dpr14-embankment .dpr14-activity-toggle");
  });
  await check("1280px both expanded: all eight field input tops align and badges absent", async () => {
    const layouts = await js(`return ["excavation","embankment"].map(id => {
      const card=document.querySelector("#dpr14-"+id);
      const fields=[...card.querySelectorAll(".dpr14-fields .dpr14-field")];
      return { id, fields: fields.map(field => ({
        top: field.querySelector("input,select").getBoundingClientRect().top,
        label: field.querySelector("label").textContent,
        badges: field.querySelectorAll(".dpr14-chip,[class*='badge']").length
      })), columns: getComputedStyle(card.querySelector(".dpr14-fields")).gridTemplateColumns.split(" ").length };
    });`);
    for (const { id, fields, columns } of layouts) {
      assert.equal(fields.length, 8, `${id}: eight fields`);
      assert.equal(columns, 8, `${id}: eight desktop columns`);
      assert.equal(new Set(fields.map(field => field.top)).size, 1, `${id}: input rect tops ${fields.map(f => f.top).join(", ")}`);
      assert.ok(fields.every(field => field.badges === 0), `${id}: no badges inside fields`);
    }
    console.log("1280px field input top coordinates:", layouts.map(({ id, fields }) => `${id}=${fields[0].top}`).join(", "));
  });
  await snapshot("expanded-desktop");

  await check("L, W and T are individually editable and recompute exact physical qty", async () => {
    for (const [id, steps] of [
      ["excavation", [["length", "200", 490], ["width", "8", 560], ["depth", "0.4", 640]]],
      ["embankment", [["length", "170", 297.5], ["width", "8", 340], ["depth", "0.3", 408]]],
    ]) {
      for (const [dimension, entry, expected] of steps) {
        const selector = `#dpr14-${dimension}-${id}`;
        assert.equal(await js(`return document.querySelector(${JSON.stringify(selector)}).readOnly`), false);
        await value(selector, entry);
        assert.equal(await js(`return document.querySelector(${JSON.stringify(selector)}).value`), entry);
        await assertPhysical(id, expected);
      }
    }
    assert.equal(await js('return [...document.querySelectorAll(".dpr14-fields input[aria-label$=\\"calculated physical quantity in cubic metres\\"]")].length'), 2);
    assert.equal(await js('return [...document.querySelectorAll(".dpr14-fields input[aria-label$=\\"calculated physical quantity in cubic metres\\"]")].every(x => x.readOnly)'), true);
    await value("#dpr14-length-excavation", "180");
    await value("#dpr14-width-excavation", "7");
    await value("#dpr14-depth-excavation", "0.35");
    await value("#dpr14-length-embankment", "160");
    await value("#dpr14-width-embankment", "7");
    await value("#dpr14-depth-embankment", "0.25");
    await assertPhysical("excavation", 441);
    await assertPhysical("embankment", 280);
  });
  await check("Partly only shows editable reusable quantity, and Reset clears it", async () => {
    const outcome = text => js(`const el=[...document.querySelectorAll("#dpr14-excavation .dpr14-outcome")].find(x=>x.textContent.trim()===${JSON.stringify(text)}); if(!el) throw Error("Missing outcome"); el.click();`);
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty")'), null);
    await outcome("Fully reusable");
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty")'), null);
    await outcome("Unsuitable");
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty")'), null);
    await outcome("Partly reusable");
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty").readOnly'), false);
    await value("#dpr14-reusable-qty", "125.5");
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty").value'), "125.5");
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 1);
    assert.match(await js('return document.querySelector(".dpr14-alert").textContent'), /closing tank reading not confirmed/);
  });
  await snapshot("partly-desktop");
  await check("switching outcome hides conditional quantity; reset restores empty Partly value", async () => {
    await js('return [...document.querySelectorAll("#dpr14-excavation .dpr14-outcome")].find(x=>x.textContent.trim()==="Fully reusable").click()');
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty")'), null);
    await js('return [...document.querySelectorAll("#dpr14-excavation .dpr14-outcome")].find(x=>x.textContent.trim()==="Partly reusable").click()');
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty").value'), "125.5");
    await click(".dpr14-reset");
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 2);
    assert.equal(await js('return document.querySelectorAll(".dpr14-details").length'), 0);
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty")'), null);
    await click("#dpr14-excavation .dpr14-activity-toggle");
    await js('return [...document.querySelectorAll("#dpr14-excavation .dpr14-outcome")].find(x=>x.textContent.trim()==="Partly reusable").click()');
    assert.equal(await js('return document.querySelector("#dpr14-reusable-qty").value'), "");
  });
  await check("tank Fix focuses reading; confirm clears remaining banner, edit reopens it", async () => {
    await click('.dpr14-fix[aria-label^="Fix Excavator"]');
    await sleep(160);
    assert.equal(await js('return document.activeElement.id'), "dpr14-tank-input");
    await click(".dpr14-confirm");
    assert.equal(await js('return document.querySelector(".dpr14-alert")'), null);
    assert.match(await js('return document.querySelector(".dpr14-consumption").textContent'), /47 L/);
    await value("#dpr14-tank-input", "40");
    assert.equal(await js('return document.querySelectorAll(".dpr14-alert-item").length'), 1);
    assert.match(await js('return document.querySelector(".dpr14-consumption").textContent'), /Incomplete/);
    await click(".dpr14-confirm");
    assert.equal(await js('return document.querySelector(".dpr14-alert")'), null);
    assert.match(await js('return document.querySelector(".dpr14-consumption").textContent'), /49 L/);
  });
  await check("390px mobile has no horizontal overflow collapsed or expanded", async () => {
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await click(".dpr14-reset");
    assert.equal(await js('return document.documentElement.scrollWidth <= window.innerWidth'), true);
    await click("#dpr14-excavation .dpr14-activity-toggle");
    await click("#dpr14-embankment .dpr14-activity-toggle");
    assert.equal(await js('return document.documentElement.scrollWidth <= window.innerWidth'), true);
  });
  await snapshot("mobile");
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