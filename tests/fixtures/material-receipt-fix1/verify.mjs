import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const evidenceDir = path.resolve("tests/fixtures/material-receipt-fix1/evidence");
mkdirSync(evidenceDir, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => JSON.stringify(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const targets = await (await fetch("http://127.0.0.1:9240/json/list")).json();
let target = targets.find((entry) => entry.type === "page");
if (!target) target = await (await fetch("http://127.0.0.1:9240/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
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
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const capture = async (name) => {
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const targetPath = path.join(evidenceDir, `${name}.png`);
  writeFileSync(targetPath, Buffer.from(screenshot.data, "base64"));
  return targetPath;
};
const scrollDialogBottom = async () => {
  await evaluate("(() => { const dialog = document.querySelector('[role=\"dialog\"]'); if (dialog) dialog.scrollTop = dialog.scrollHeight; return !!dialog; })()");
  await sleep(200);
};
const click = async (testId) => {
  const clicked = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    element.click();
    return true;
  })()`);
  assert(clicked, `Missing [data-testid=${testId}]`);
};
const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const element = document.querySelector('[data-testid=${quote(testId)}]');
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, ${quote(String(value))});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Missing input [data-testid=${testId}]`);
};
const select = async (testId, text) => {
  await click(testId);
  await waitFor(`Array.from(document.querySelectorAll('[role="option"]')).some(option => (option.textContent || "").includes(${quote(text)}))`, `${text} option`);
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(option => (option.textContent || "").includes(${quote(text)}))?.click()`);
};
const openAndFill = async () => {
  await waitFor("document.readyState === 'complete'", "fixture document");
  await waitFor("!!document.querySelector('[data-testid=\"button-add-receipt\"]')", "New Receipt");
  await click("button-add-receipt");
  await waitFor("!!document.querySelector('[data-testid=\"button-save-receipt\"]')", "receipt form");
  await select("select-material", "Cement");
  await select("select-party", "FIX1 JOB");
  await setInput("input-quantity", "12.5");
  await waitFor("document.querySelector('[data-testid=\"button-save-receipt\"]')?.disabled === false", "enabled receipt button");
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

await cdp("Page.navigate", { url: "http://127.0.0.1:4190/?scenario=success" });
await openAndFill();
await evaluate(`(() => {
  const button = document.querySelector('[data-testid="button-save-receipt"]');
  button?.click();
  button?.click();
})()`);
await waitFor("document.querySelector('[data-testid=\"button-save-receipt\"]')?.disabled === true", "pending disabled button");
const pendingState = await evaluate("JSON.stringify({ requests: window.__RECEIPT_FIXTURE.requests, creates: window.__RECEIPT_FIXTURE.createRequests, disabled: document.querySelector('[data-testid=\"button-save-receipt\"]')?.disabled })");
assert(JSON.parse(pendingState).creates === 1, "same-tick double click sent more than one POST");
assert(JSON.parse(pendingState).disabled === true, "button was not disabled while response was deferred");
await scrollDialogBottom();
await capture("pending");

await evaluate("window.__RECEIPT_FIXTURE.resolveCreate()");
await waitFor("!!document.querySelector('[data-testid=\"receipt-submission-success\"]')", "persistent success summary");
const successText = await evaluate("document.querySelector('[data-testid=\"receipt-submission-success\"]')?.textContent || ''");
assert(successText.includes("GRN GRN-FIX1-001"), "success summary omitted GRN");
assert(successText.includes("12.5 Ton"), "success summary omitted saved quantity");
assert(successText.includes("Next: choose New Receipt"), "success summary omitted next action");
await sleep(700);
await capture("success");
await click("button-add-receipt");
await waitFor("!!document.querySelector('[data-testid=\"button-save-receipt\"]')", "explicit new receipt form");
assert(!(await evaluate("!!document.querySelector('[data-testid=\"receipt-submission-success\"]')")), "success state did not clear for explicit New Receipt");

await cdp("Page.navigate", { url: "http://127.0.0.1:4190/?scenario=error" });
await openAndFill();
await click("button-save-receipt");
await waitFor("!!document.querySelector('[data-testid=\"receipt-submission-error\"]')", "inline error");
assert(await evaluate("document.querySelector('[data-testid=\"button-save-receipt\"]')?.disabled === false"), "button did not re-enable after error");
assert(await evaluate("document.querySelector('[data-testid=\"input-quantity\"]')?.value === '12.5'"), "failed quantity was not preserved");
assert(await evaluate("document.querySelector('[data-testid=\"select-material\"]')?.textContent?.includes('Cement')"), "failed material was not preserved");
const errorText = await evaluate("document.querySelector('[data-testid=\"receipt-submission-error\"]')?.textContent || ''");
assert(errorText.includes("DIESEL_RECEIPT_EXCEEDS_REMAINING"), "inline error omitted server reason");
await scrollDialogBottom();
await capture("error");

console.log(JSON.stringify({
  pending: path.join(evidenceDir, "pending.png"),
  success: path.join(evidenceDir, "success.png"),
  error: path.join(evidenceDir, "error.png"),
  successText,
  errorText,
  successRequests: await evaluate("window.__RECEIPT_FIXTURE.createRequests"),
}, null, 2));
socket.close();