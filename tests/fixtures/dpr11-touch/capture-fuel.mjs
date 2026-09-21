/*
 * Captures real DprEquipmentCompact source/mode evidence from the DPR-11
 * fixture server already running on 4192 and Chromium CDP on 9342.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const baseUrl = process.env.DPR11_BASE_URL || "http://127.0.0.1:4192";
const cdpPort = process.env.DPR11_CDP_PORT || "9342";
const evidenceDir = path.resolve(new URL(".", import.meta.url).pathname, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const page = await (
  await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })
).json();
if (!page?.webSocketDebuggerUrl) throw new Error("Could not create Chromium page target");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async expression => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out: ${expression}`);
};

await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});

const cases = [
  { source: "contractor", mode: "editable", performance: false, tanks: false },
  { source: "contractor", mode: "readonly", performance: false, tanks: false },
  { source: "direct_purchase", mode: "editable", performance: false, tanks: false },
  { source: "direct_purchase", mode: "readonly", performance: false, tanks: false },
  { source: "plant_stock", mode: "editable", performance: false, tanks: true },
  { source: "plant_stock", mode: "readonly", performance: true, tanks: true },
];
const results = [];

for (const [caseIndex, evidenceCase] of cases.entries()) {
  const captureToken = `fuel-${caseIndex}`;
  const url = `${baseUrl}/fuel.html?source=${evidenceCase.source}&mode=${evidenceCase.mode}&capture=${captureToken}`;
  await cdp("Page.navigate", { url });
  await waitFor(`document.readyState === 'complete' && location.search.includes(${JSON.stringify(`capture=${captureToken}`)}) && document.body.innerText.includes("DPR-11 Fuel Visibility Evidence") && !!document.querySelector('[data-testid="equipment-compact-0"]')`);

  const visibility = await evaluate(`(() => {
    const body = document.body.innerText.toLowerCase();
    return {
      dieselIssued: body.includes("diesel issued / added"),
      fuelPerformance: body.includes("fuel performance"),
      openingTank: body.includes("opening tank (l)"),
      closingTank: body.includes("closing / physical dip (l)") || body.includes("closing tank / physical dip (l)"),
      actualConsumed: body.includes("actual consumed"),
      expected: body.includes("expected"),
      variance: body.includes("variance"),
      consumptionRate: body.includes("consumption rate"),
    };
  })()`);

  if (!visibility.dieselIssued) throw new Error(`${evidenceCase.source}/${evidenceCase.mode}: issued diesel missing`);
  if (visibility.fuelPerformance !== evidenceCase.performance) {
    throw new Error(`${evidenceCase.source}/${evidenceCase.mode}: unexpected Fuel Performance visibility`);
  }
  if (visibility.openingTank !== evidenceCase.tanks || visibility.closingTank !== evidenceCase.tanks) {
    throw new Error(`${evidenceCase.source}/${evidenceCase.mode}: unexpected tank visibility`);
  }
  for (const metric of ["actualConsumed", "expected", "variance", "consumptionRate"]) {
    if (visibility[metric] !== evidenceCase.performance) {
      throw new Error(`${evidenceCase.source}/${evidenceCase.mode}: unexpected ${metric} visibility`);
    }
  }

  const { contentSize } = await cdp("Page.getLayoutMetrics");
  const image = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.ceil(contentSize.width),
      height: Math.ceil(contentSize.height),
      scale: 1,
    },
  });
  const filename = `fuel-${evidenceCase.source}-${evidenceCase.mode}.png`;
  const screenshot = path.join(evidenceDir, filename);
  writeFileSync(screenshot, Buffer.from(image.data, "base64"));
  results.push({ ...evidenceCase, visibility, screenshot });
}

writeFileSync(
  path.join(evidenceDir, "fuel-result.json"),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
await cdp("Page.close");
socket.close();