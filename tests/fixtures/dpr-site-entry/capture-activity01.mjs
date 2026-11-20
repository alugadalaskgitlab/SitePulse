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
  if (message.method === "Runtime.exceptionThrown") {
    console.error(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  }
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
  try {
    return (await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;
  } catch (error) {
    throw new Error(`${error.message} [${expression}]`);
  }
};
const waitFor = async expression => {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${expression}`);
};
const capture = async name => {
  const shot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(path.join(out, name), Buffer.from(shot.data, "base64"));
};
const navigate = async (url, width = 402, height = 900, mobile = true) => {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await cdp("Emulation.setEmulatedMedia", { media: "screen" });
  await cdp("Page.navigate", { url });
  await waitFor("document.readyState === 'complete'");
};

await cdp("Page.enable");
await cdp("Runtime.enable");

await navigate("http://127.0.0.1:4178/fixture/dpr-activity-hub?dprActivity01=1", 402, 1450, true);
await waitFor("document.body.innerText.includes('Site activities')");
await capture("dpr-activity-01-hub-phone.png");

await navigate("http://127.0.0.1:4178/fixture/dpr-activity-editor?dprActivity01=1", 402, 1200, true);
await waitFor("!!document.querySelector('[aria-label=\"Site activities\"]')");
await evaluate(`(() => {
  const button = Array.from(document.querySelectorAll("button")).find(node => node.textContent?.trim() === "Edit");
  button?.click();
  return !!button;
})()`);
await waitFor("document.body.innerText.includes('Chainage / sample from (km)')");
await capture("dpr-activity-01-editor-phone.png");

await navigate("http://127.0.0.1:4178/dpr/24602?dprActivity01=1", 1200, 950, false);
console.log((await evaluate("document.body.innerText")).slice(0, 1200));
await waitFor("!!document.querySelector('[data-testid=\"dpr-site-activities-readonly\"]')");
await evaluate(`document.querySelector('[data-testid="dpr-site-activities-readonly"]').scrollIntoView({block:"center"})`);
await sleep(150);
await capture("dpr-activity-01-view.png");
await cdp("Emulation.setEmulatedMedia", { media: "print" });
await sleep(250);
await capture("dpr-activity-01-print-preview.png");

await socket.close();
console.log("Captured the DPR activity hub, editor, view, and print preview fixture screenshots.");
