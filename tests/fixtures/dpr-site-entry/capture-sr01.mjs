import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const out = path.resolve("reports/evidence");
mkdirSync(out, { recursive: true });
const pageInfo = await (await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(pageInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let nextId = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (!message.id || !pending.has(message.id)) return;
  const callback = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callback.reject(new Error(`${callback.method}: ${message.error.message}`)) : callback.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject, method });
  socket.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const waitFor = async expression => {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${expression}\n${(await evaluate("document.body.innerText"))?.slice(0, 1800)}`);
};
const capture = async name => {
  const shot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(path.join(out, name), Buffer.from(shot.data, "base64"));
};
const navigate = async url => {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await cdp("Emulation.setEmulatedMedia", { media: "screen" });
  await cdp("Page.navigate", { url });
  await waitFor("document.readyState === 'complete'");
  await sleep(200);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const base = "http://127.0.0.1:4178";

await navigate(`${base}/site/new?dprActivity01=1&sr01=1&site=NARASIMHULU%20ROAD&date=2026-08-05&type=road&boqProjectId=5501`);
await waitFor("!!document.querySelector('[data-testid=\"select-engineer-personnel\"]')");
await waitFor(`document.querySelector('[data-testid="select-engineer-personnel"]')?.value === "6101"`);
await capture("sr01-dpr-engineer-picker-phone.png");

await navigate(`${base}/fixture/sr01-users?sr01=1`);
await waitFor("!!document.querySelector('[data-testid=\"select-staff-link-6602\"]')");
assert.equal(await evaluate(`document.querySelector('[data-testid="select-staff-link-6601"]')?.textContent?.includes("SURESH KUMAR")`), true);
await capture("sr01-user-management-phone.png");

await socket.close();
console.log("Captured synthetic phone-width engineer and Owner staff-link screens.");
