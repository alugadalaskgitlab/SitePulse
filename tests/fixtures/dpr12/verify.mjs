import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const base = process.env.DPR12_BASE_URL || "http://127.0.0.1:4193";
const cdpPort = process.env.DPR12_CDP_PORT || "9343";
const out = path.resolve(process.cwd(), "screenshots/dpr12");
mkdirSync(out, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
const target = targets.find(item => item.type === "page");
if (!target) throw new Error("No Chromium page target found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let seq = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw.toString());
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (expression, label) => {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
};
const go = async (route, width = 1440, height = 1000) => {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `${base}${route}` });
  await waitFor("document.readyState === 'complete'", route);
  await sleep(500);
};
const shot = async name => {
  const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  const file = path.join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(result.data, "base64"));
  return file;
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const row = () => evaluate("JSON.parse(document.querySelector('[data-testid=\"fixture-row-json\"]').textContent)");
const setInput = async (testId, value) => {
  await evaluate(`(() => { const el = document.querySelector('[data-testid="${testId}"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(150);
};
const selectStatus = async label => {
  await evaluate("document.querySelector('[data-testid=\"equipment-compact-usage-status-0\"]').click()");
  await sleep(150);
  await evaluate(`([...document.querySelectorAll('[role="option"]')].find(el => el.textContent.includes(${JSON.stringify(label)}))).click()`);
  await sleep(250);
};

await cdp("Page.enable");
await cdp("Runtime.enable");

// A/B — the production DprDetails table with incidental, ordinary and no-site-work-shaped rows.
await go("/dpr/120");
await waitFor("document.body.innerText.includes('Emergency diversion repair')", "DPR details");
const body = await evaluate("document.body.innerText");
assert(body.includes("Incidental"), "A Incidental badge missing");
assert(body.includes("Granular sub-base"), "B normal row missing");
assert(body.includes("No Site Work — rain"), "B no-site-work row missing");
const A = await shot("A-incidental-badge");
const B = await shot("B-normal-and-no-site-work");

// C — continuity comes from the true prior date despite a four-day gap.
await go("/compact?scenario=continuity");
await waitFor("JSON.parse(document.querySelector('[data-testid=\"fixture-row-json\"]').textContent).openingReading === 418.6", "continuity reading");
let current = await row();
assert(current.openingReading === 418.6, "C latest closing did not carry forward");
assert((await evaluate("window.__DPR12_FIXTURE__.latestClosingRequests[0]")).includes("beforeDate=2026-12-12"), "C continuity request missing date");
const C = await shot("C-latest-reading-across-gap");

// D — a person's existing reading is never replaced.
await go("/compact?scenario=manual");
await sleep(500);
current = await row();
assert(current.openingReading === 777.7, "D manual opening reading was overwritten");
assert((await evaluate("window.__DPR12_FIXTURE__.latestClosingRequests.length")) === 0, "D continuity fetched despite a manual value");
const D = await shot("D-manual-reading-preserved");

// E/E2 — real component defaults idle fields, remains editable, and survives synthetic reload.
await go("/compact?scenario=continuity");
await waitFor("JSON.parse(document.querySelector('[data-testid=\"fixture-row-json\"]').textContent).openingReading === 418.6", "idle setup");
await selectStatus("Idle — No Work Available");
current = await row();
assert(current.closingReading === 418.6, "E2 idle closing reading did not default");
assert(current.openingDiesel === 76 && current.dieselBalanceInTank === 76, "E2 idle tank values did not default");
await setInput("equipment-compact-closing-meter-0", "419.2");
await evaluate(`(() => { const el = document.querySelector('[data-testid="equipment-compact-usage-reason-0"]'); const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, 'Work front awaiting survey approval'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
await sleep(150);
current = await row();
assert(current.closingReading === 419.2, "E2 defaulted closing reading is not editable");
await evaluate("document.querySelector('[data-testid=\"save-synthetic\"]').click()");
await sleep(100);
assert((await evaluate("window.__DPR12_FIXTURE__.writes.length")) === 0, "E fixture issued a live write");
const E = await shot("E-idle-reason-editable-synthetic-save");
await go("/compact?scenario=reload");
current = await row();
assert(current.usageStatus === "idle_no_work" && current.usageStatusReason === "Work front awaiting survey approval", "E status/reason not preserved after reload");
assert(current.closingReading === 419.2, "E2 edited closing reading not preserved");
const E2 = await shot("E2-idle-defaults-reloaded");

// Breakdown must not receive idle defaults.
await go("/compact?scenario=continuity");
await waitFor("JSON.parse(document.querySelector('[data-testid=\"fixture-row-json\"]').textContent).openingReading === 418.6", "breakdown setup");
await selectStatus("Breakdown");
current = await row();
assert(current.closingReading == null, "E2 Breakdown incorrectly defaulted closing reading");

// F — legacy null status remains visibly unspecified and otherwise unchanged.
await go("/compact?scenario=legacy");
current = await row();
assert(current.usageStatus == null && current.openingReading === 400 && current.closingReading === 405, "F legacy row changed");
assert((await evaluate("document.body.innerText")).includes("Not specified (legacy behavior)"), "F legacy status label missing");
const F = await shot("F-legacy-status-unset");

// E/F — production EquipmentStatus with four legacy logs and 27 truly unlogged days.
await go("/equipment-status");
await waitFor("document.body.innerText.includes('HIRED EXCAVATOR — AUGUST 2026')", "fleet status");
await evaluate("document.querySelector('[data-testid=\"equipment-status-1201\"]').querySelector('button').click()");
await sleep(200);
let fleet = await evaluate("document.body.innerText");
for (const label of ["Logged — No Status", "Legacy log · status unspecified", "Not Logged"]) {
  assert(fleet.includes(label), `E/F missing ${label}`);
}
assert(fleet.includes("4 Logged · No Status"), "E/F logged-unspecified summary is not 4");
assert(fleet.includes("27 Not Logged"), "E/F Not Logged summary is not 27");
assert(!fleet.includes("1 Working"), "E/F fixture is contaminated by an explicit Working day");

// G — explicit status is verified in a separate scenario.
await go("/equipment-status?scenario=explicit");
await waitFor("document.body.innerText.includes('HIRED EXCAVATOR — AUGUST 2026')", "explicit fleet status");
await evaluate("document.querySelector('[data-testid=\"equipment-status-1201\"]').querySelector('button').click()");
await sleep(200);
fleet = await evaluate("document.body.innerText");
assert(fleet.includes("31 Aug 2026") && fleet.includes("Working"), "G explicit Working day missing");
const G = await shot("G-fleet-mixed-explicit-and-not-logged");

const evidence = {
  fixture: "DPR-12 isolated real-component browser verification",
  productionDatabaseUsed: false,
  productionApiWrites: false,
  components: ["DprDetails", "DprEquipmentCompact", "EquipmentStatus"],
  screenshots: { A, B, C, D, E, E2, F, G },
};
writeFileSync(path.join(out, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
socket.close();