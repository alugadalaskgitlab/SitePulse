import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/vendor-master-03");
const evidence = path.join(fixture, "evidence");
const vitePort = Number(process.env.VITE_PORT || 4223);
const cdpPort = Number(process.env.CDP_PORT || 9373);
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
  chromium = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/vendor-03-${process.pid}`, `http://127.0.0.1:${vitePort}/`], { stdio: "ignore" });
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
  let seq = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const message = JSON.parse(raw);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); }
    throw new Error(`Timed out: ${label}; text=${(await evaluate("document.body.innerText")).slice(0, 900)}`);
  };
  const clickText = async text => {
    const clicked = await evaluate(`(() => { const el=Array.from(document.querySelectorAll('button')).find(x => x.textContent.trim() === ${JSON.stringify(text)}); el?.click(); return !!el; })()`);
    assert(clicked, `Missing button: ${text}`);
  };
  const shot = async name => {
    await sleep(150);
    const png = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(evidence, `${name}.png`);
    writeFileSync(file, Buffer.from(png.data, "base64"));
    return file;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor(`document.body.innerText.includes("SYNTHETIC North Aggregates") && !!document.querySelector('[data-testid="fixture-label"]')`, "actual VendorMaster list");
  await clickText("SYNTHETIC North Aggregates");
  await waitFor(`document.body.innerText.includes("Linked activity by site") && document.body.innerText.includes("SYNTHETIC North Site")`, "activity before link");
  const before = await evaluate(`document.body.innerText`);
  assert(before.includes("Equipment hire 1 · Material supply 2 · Transport 1 · Labour 1"), "Full cross-area activity missing before link");
  const screenshots = [await shot("C-activity-before-link")];
  await clickText("Link Vendors");
  await waitFor(`document.body.innerText.includes("Bulk Material Purchase Indent vendors") && document.body.innerText.includes("SYNTHETIC Quarry Bulk") && document.body.innerText.includes("SYNTHETIC Plant Bulk")`, "bulk-only review");
  const review = await evaluate(`document.body.innerText`);
  const excluded = await evaluate(`window.__vendor03.excluded`);
  assert(excluded.every(name => !review.includes(name)), "Excluded stores/bills/rates/trip supplier appeared in review");
  assert((await evaluate(`document.querySelectorAll('select[aria-label^="Master match for"]').length`)) === 2, "Expected only two bulk PI rows");
  screenshots.push(await shot("A-D-bulk-only-review-before-link"));
  await clickText("Confirm link");
  await waitFor(`window.__vendor03.links.length === 1 && !Array.from(document.querySelectorAll('strong')).some(x => x.textContent === 'SYNTHETIC Quarry Bulk')`, "confirm removes linked bulk PI");
  assert((await evaluate(`window.__vendor03.links[0].role`)) === "indents", "Wrong role linked");
  assert((await evaluate(`window.__vendor03.links[0].vendorId`)) === 1, "Wrong vendor linked");
  screenshots.push(await shot("B-bulk-review-after-link"));
  await clickText("Vendors");
  await waitFor(`document.body.innerText.includes("Equipment hire 1 · Material supply 3 · Transport 1 · Labour 1")`, "full activity after link");
  screenshots.push(await shot("C-activity-after-link"));
  const writes = await evaluate(`window.__vendor03.writes`);
  assert(JSON.stringify(writes) === JSON.stringify(["POST /api/vendor-master/review/confirm"]), "Unexpected mocked API writes");
  const result = { passed: true, syntheticFixture: true, screenshots, assertions: ["A only bulk-material PI vendors are proposals, no bill/rate/trip names", "B confirmed link disappears from review", "C full equipment/material/transport/labour activity before and after", "D stores PI excluded", "No live API/business writes"], mockedWrites: writes };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close();
  chromium?.kill("SIGTERM");
  vite.kill("SIGTERM");
}