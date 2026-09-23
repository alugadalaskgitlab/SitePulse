import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/vendor-bills-vb26");
const evidence = path.join(fixture, "evidence");
const vitePort = Number(process.env.VITE_PORT || 4206);
const cdpPort = Number(process.env.CDP_PORT || 9356);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
mkdirSync(evidence, { recursive: true });

const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"], { cwd: root, stdio: "ignore" });
let chromium;
let socket;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${vitePort}/`)).ok) break; } catch {}
    if (i === 99) throw new Error("Fixture Vite did not start");
    await sleep(100);
  }
  chromium = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/vb26-${process.pid}`, `http://127.0.0.1:${vitePort}/`], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      if (targets.some(target => target.type === "page" && target.url.includes(String(vitePort)))) break;
    } catch {}
    if (i === 99) throw new Error("Chromium CDP did not start");
    await sleep(100);
  }
  const page = targets.find(target => target.type === "page" && target.url.includes(String(vitePort)));
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let id = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 200; i++) {
    if (await evaluate(`document.querySelectorAll("tbody tr").length === 6`).catch(() => false)) break;
    if (i === 199) throw new Error("Synthetic EquipmentHireDailyTable did not render");
    await sleep(50);
  }
  const text = await evaluate(`document.body.innerText`);
  assert(text.includes("VB-26 SYNTHETIC ACCEPTANCE FIXTURE"), "Synthetic evidence label missing");
  assert(text.includes("OWNED · Hour meter") && text.includes("HIRED · Odometer"), "Owned/hired scenarios missing");
  assert(text.includes("Tank Readings N/A") && text.includes("25 L"), "Unconfirmed/confirmed actual states missing");
  assert(text.includes("24 L") && text.includes("8 L"), "Expected values missing");
  assert(text.includes("3 L/Hr") && text.includes("0.2 L/Km"), "Norm units missing");
  assert(text.includes("Earth cutting, Shoulder grading") && text.includes("Aggregate haulage, Return material"), "Distinct tasks missing");
  assert(text.includes("No Work — No activity recorded"), "No-activity state missing");
  assert(text.includes("Period Expected: 48 L") && text.includes("Period Expected: 16 L"), "Period Expected totals missing");
  assert(!text.includes("Difference") && !text.includes("Variance") && !text.includes("Actual Consumption | Master Norm"), "Removed variance/combined labels remain");
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const screenshotPath = path.join(evidence, "VB-26-synthetic-owned-hired-actual-component.png");
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  const sectionShots = [];
  for (const [index, name] of ["owned-Hr", "hired-Km"].entries()) {
    const clip = await evaluate(`(() => { const r=document.querySelectorAll("section")[${index}].getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}; })()`);
    const section = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true, clip });
    const target = path.join(evidence, `VB-26-synthetic-${name}-actual-component.png`);
    writeFileSync(target, Buffer.from(section.data, "base64"));
    sectionShots.push(target);
  }
  const result = { passed: true, screenshots: [screenshotPath, ...sectionShots], assertions: ["owned+hired", "Hr+Km norms", "unconfirmed+confirmed actual", "distinct multiple tasks", "no activity", "period Expected", "variance absent"] };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}