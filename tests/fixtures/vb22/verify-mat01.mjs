/*
 * MAT-01 isolated browser verification of the production
 * SiteMaterialsReceived component with explicitly synthetic intercepted APIs.
 * The parent owns the already-running Vite fixture and Chromium processes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const vitePort = Number(process.env.VITE_PORT || 4194);
const cdpPort = Number(process.env.CDP_PORT || 9344);
const workspace = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const evidenceDir = path.join(workspace, "screenshots/mat01");
mkdirSync(evidenceDir, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw new Error(`No Chromium page target on CDP port ${cdpPort}`);
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
const screenshot = async name => {
  const image = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(image.data, "base64"));
  return target;
};
const selectParty = async label => {
  await evaluate(`document.querySelector('[data-testid="select-supplier-filter"]')?.click()`);
  await waitFor(
    `[...document.querySelectorAll('[role="option"]')].some(node => node.textContent.trim() === ${JSON.stringify(label)})`,
    `${label} option`,
  );
  await evaluate(`([...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === ${JSON.stringify(label)}))?.click()`);
  await sleep(150);
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  mobile: false,
});
await cdp("Page.navigate", {
  url: `http://127.0.0.1:${vitePort}/site/materials-received?scenario=mat01`,
});
await waitFor(
  `document.querySelector('[data-testid="cell-material-source-trip-2201"]')?.textContent.includes("VB22 BORROW OWNER")`,
  "Materials Received fixture rows",
);

const initial = await evaluate(`(() => ({
  disclosure: document.querySelector('[data-testid="vb22-fixture-disclosure"]')?.textContent.trim(),
  transporter: document.querySelector('[data-testid="cell-transporter-trip-2201"]')?.innerText,
  source: document.querySelector('[data-testid="cell-material-source-trip-2201"]')?.innerText,
  blankSource: document.querySelector('[data-testid="cell-material-source-trip-2202"]')?.innerText,
  vehicleOnly: document.querySelector('[data-testid="cell-transporter-trip-2207"]')?.innerText,
  supplierOnly: document.querySelector('[data-testid="cell-transporter-trip-2208"]')?.innerText,
}))()`);
assert(initial.disclosure.includes("SYNTHETIC FIXTURE DATA"), "Synthetic disclosure is missing");
assert(initial.transporter.includes("VB22 ROAD TRANSPORT") && initial.transporter.includes("TS22AA2201"), "Transporter stack is incomplete");
assert(initial.source === "VB22 BORROW OWNER", "Material source cell is incorrect");
assert(initial.blankSource === "–", "Blank material source does not show a dash");
assert(initial.vehicleOnly === "TS22VEH2207", "Vehicle-only transporter cell is incorrect");
assert(initial.supplierOnly === "VB22 SUPPLIER ONLY", "Supplier-only transporter cell is incorrect");
await evaluate(`document.querySelector('[data-testid="cell-transporter-trip-2201"]')?.scrollIntoView({ block: "center" })`);
await sleep(150);
const tableScreenshot = await screenshot("A-transporter-stack-material-source-and-dash-synthetic");

await evaluate(`document.querySelector('[data-testid="select-supplier-filter"]')?.scrollIntoView({ block: "center" })`);
await sleep(150);
await evaluate(`document.querySelector('[data-testid="select-supplier-filter"]')?.click()`);
await waitFor(
  `[...document.querySelectorAll('[role="option"]')].some(node => node.textContent.trim() === "VB22 BORROW OWNER")`,
  "material-source-only dropdown option",
);
const optionCount = await evaluate(
  `[...document.querySelectorAll('[role="option"]')].filter(node => node.textContent.trim() === "VB22 BORROW OWNER").length`,
);
assert(optionCount === 1, "Material source option is missing or duplicated");
const dropdownScreenshot = await screenshot("B-union-filter-options-no-duplicates-synthetic");
await evaluate(`document.body.click()`);

await selectParty("VB22 BORROW OWNER");
await waitFor(
  `!!document.querySelector('[data-testid="row-material-trip-2201"]') && !document.querySelector('[data-testid="row-material-trip-2204"]')`,
  "source-role filtered rows",
);
await evaluate(`document.querySelector('[data-testid="row-material-trip-2201"]')?.scrollIntoView({ block: "center" })`);
await sleep(150);
const sourceFilterScreenshot = await screenshot("C-material-source-filter-or-match-synthetic");

await evaluate(`document.querySelector('[data-testid="select-supplier-filter"]')?.scrollIntoView({ block: "center" })`);
await sleep(150);
await selectParty("VB22 ROAD TRANSPORT");
await waitFor(
  `!!document.querySelector('[data-testid="row-material-trip-2201"]') && !document.querySelector('[data-testid="row-material-trip-2207"]')`,
  "transporter-role filtered rows",
);
await evaluate(`document.querySelector('[data-testid="row-material-trip-2201"]')?.scrollIntoView({ block: "center" })`);
await sleep(150);
const transporterFilterScreenshot = await screenshot("D-transporter-filter-regression-synthetic");

const evidence = {
  disclosure: initial.disclosure,
  assertions: {
    transporterAndVehicleStacked: true,
    materialSourceAndBlankDash: true,
    missingValuesShownAlone: true,
    materialSourceOnlyOptionUnique: true,
    materialSourceOrFilter: true,
    transporterFilterPreserved: true,
  },
  screenshots: [
    tableScreenshot,
    dropdownScreenshot,
    sourceFilterScreenshot,
    transporterFilterScreenshot,
  ],
};
writeFileSync(path.join(evidenceDir, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
socket.close();