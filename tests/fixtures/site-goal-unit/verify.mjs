import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const page = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (!message.id || !pending.has(message.id)) return;
  const callback = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Page.navigate", { url: "http://127.0.0.1:4181" });
for (let attempt = 0; attempt < 200; attempt += 1) {
  if (await evaluate("document.querySelectorAll('[data-testid^=\"goal-row-\"]').length === 4")) break;
  await new Promise((resolve) => setTimeout(resolve, 50));
}
const text = await evaluate("document.body.innerText");
assert(text.includes("4,800 Sqm"), "Sqm completion was not rendered");
assert(text.includes("0.48 Ha"), "Ha completion was not rendered");
assert(text.includes("Unit warning · completed value retained"), "advisory warning hid valid credit");
assert(text.includes("Needs unit review"), "unresolved credit was not explicit");
assert(text.includes("0 MT"), "planned-zero unresolved row was hidden");
assert(!text.includes("4,000 MT balance"), "unresolved row fabricated a balance");
assert(text.includes("Cumulative programme plan through the current month"), "planning horizon was not explained");

const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
writeFileSync(path.join(evidenceDir, "site-goal-unit-cases.png"), Buffer.from(shot.data, "base64"));
writeFileSync(path.join(evidenceDir, "site-goal-unit-result.json"), JSON.stringify({ passed: true }, null, 2));
await cdp("Page.close");
socket.close();
console.log("Site goal unit fixture passed");