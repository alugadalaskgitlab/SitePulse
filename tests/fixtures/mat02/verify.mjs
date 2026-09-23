import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const vitePort = Number(process.env.VITE_PORT || 4198);
const cdpPort = Number(process.env.CDP_PORT || 9398);
const workspace = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const evidenceDir = path.join(workspace, "screenshots/mat02");
mkdirSync(evidenceDir, { recursive: true });
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
  const request = pending.get(message.id);
  if (!request) return;
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
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const waitFor = async (expression, label) => {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const navigate = async (pathName, readyExpression, label) => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}${pathName}` });
  await waitFor(readyExpression, label);
};
const screenshot = async name => {
  const image = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(image.data, "base64"));
  return target;
};
const click = testId => evaluate(`document.querySelector('[data-testid="${testId}"]')?.click()`);
const setInput = (testId, value) => evaluate(`(() => {
  const input = document.querySelector('[data-testid="${testId}"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`);

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});

await navigate(
  "/site/material-trips?scenario=assigned",
  `!!document.querySelector('[data-testid="row-trip-13021"]')`,
  "assigned material trip",
);
assert(!(await evaluate(`!!document.querySelector('[data-testid="bulk-material-source-panel"]')`)), "A: cleared backlog panel is visible");
await evaluate(`document.querySelector('[data-testid="checkbox-filter-only-unassigned"]').scrollIntoView({ block: "center" })`);
const a = await screenshot("A-cleared-filtered-backlog-hidden-SYNTHETIC");

await navigate(
  "/site/material-trips?scenario=backlog",
  `!!document.querySelector('[data-testid="bulk-material-source-panel"]')`,
  "whitespace backlog disclosure",
);
assert(!(await evaluate(`document.querySelector('[data-testid="bulk-material-source-panel"]').open`)), "B: backlog disclosure is not collapsed");
assert(await evaluate(`document.querySelector('[data-testid="trip-material-source-13021"]').textContent.trim() === "-"`), "B: whitespace source was not treated as blank");
await evaluate(`document.querySelector('[data-testid="bulk-material-source-panel"]').scrollIntoView({ block: "center" })`);
const b = await screenshot("B-whitespace-backlog-visible-collapsed-SYNTHETIC");

await navigate(
  "/site/materials-received?scenario=success",
  `!!document.querySelector('[data-testid="row-material-trip-13021"]')`,
  "received trip",
);
await click("row-material-trip-13021");
await waitFor(`!!document.querySelector('[data-testid="btn-admin-edit"]')`, "edit button");
await click("btn-admin-edit");
await waitFor(`!!document.querySelector('[data-testid="input-edit-material-source-supplier"]')`, "edit form");
await setInput("input-edit-material-source-supplier", "MAT02 SAVED QUARRY");
await click("button-save-edit");
await waitFor(
  `!document.querySelector('[data-testid="input-edit-material-source-supplier"]') && document.querySelector('[data-testid="mat02-toast"]')?.textContent.includes("Saved")`,
  "successful save to close form and toast",
);
assert(await evaluate(`document.querySelector('[role="dialog"]')?.textContent.includes("MAT02 SAVED QUARRY")`), "C: refreshed detail does not show saved source");
const c = await screenshot("C-success-closes-edit-toast-refresh-SYNTHETIC");

await navigate(
  "/site/materials-received?scenario=failure",
  `!!document.querySelector('[data-testid="row-material-trip-13021"]')`,
  "failure received trip",
);
await click("row-material-trip-13021");
await waitFor(`!!document.querySelector('[data-testid="btn-admin-edit"]')`, "failure edit button");
await click("btn-admin-edit");
await waitFor(`!!document.querySelector('[data-testid="input-edit-material-source-supplier"]')`, "failure edit form");
await setInput("input-edit-material-source-supplier", "MAT02 INPUT RETAINED");
await click("button-save-edit");
await waitFor(
  `document.querySelector('[data-testid="mat02-toast"]')?.textContent.includes("SYNTHETIC INTERCEPTED SAVE FAILURE")`,
  "failure toast",
);
assert(
  await evaluate(`document.querySelector('[data-testid="input-edit-material-source-supplier"]')?.value === "MAT02 INPUT RETAINED"`),
  "D: failed save did not retain edit mode and input",
);
const d = await screenshot("D-failure-retains-edit-and-input-SYNTHETIC");
await click("button-cancel-edit");
await waitFor(`!document.querySelector('[data-testid="input-edit-material-source-supplier"]')`, "cancel to exit edit");
assert(
  await evaluate(`document.querySelector('[role="dialog"]')?.textContent.includes("MAT02 ASSIGNED QUARRY")`),
  "D: cancel changed the underlying saved value",
);

const evidence = {
  disclosure: "MAT-02 PRODUCTION COMPONENT — SYNTHETIC INTERCEPTED API — NO LIVE API OR DATABASE WRITES",
  mountedProductionComponents: [
    "client/src/pages/SiteMaterialTrips.tsx",
    "client/src/pages/SiteMaterialsReceived.tsx",
  ],
  assertions: {
    A_clearedFilteredBacklogHidden: true,
    B_whitespaceBacklogVisibleAndCollapsed: true,
    C_successClosesEditWithToastAndRefreshedValue: true,
    D_failureRetainsInputAndCancelLeavesSavedValueUnchanged: true,
  },
  screenshots: [a, b, c, d],
};
writeFileSync(path.join(evidenceDir, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
socket.close();