// Isolated production-component fixture, in-memory equipment master; no business API writes.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const evidence = path.resolve(new URL("./evidence", import.meta.url).pathname);
mkdirSync(evidence, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pages = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = pages.find(p => p.type === "page") || await (await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
let id = 0;
const pending = new Map();
ws.on("message", raw => {
  const msg = JSON.parse(raw);
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  pending.set(next, { resolve, reject });
  ws.send(JSON.stringify({ id: next, method, params }));
});
const evalJs = async code => {
  const result = await cdp("Runtime.evaluate", { expression: code, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const assert = (value, label) => { if (!value) throw new Error(label); };
const wait = async (code, label) => {
  for (let n = 0; n < 100; n++) {
    if (await evalJs(code)) return;
    await sleep(75);
  }
  throw new Error(`Timed out: ${label}; ${await evalJs("document.body.innerText.slice(0, 600)")}`);
};
const q = s => JSON.stringify(s);
const click = async testId => {
  assert(await evalJs(`(() => {const e=document.querySelector('[data-testid=${q(testId)}]');if (!e || e.disabled)return false;e.click();return true})()`), `click ${testId}`);
};
const input = async (testId, value) => {
  assert(await evalJs(`(() => {const e=document.querySelector('[data-testid=${q(testId)}]');if(!e)return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${q(value)});
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`), `input ${testId}`);
};
const select = async equipment => {
  await click("select-equipment-0");
  await wait(`!!document.querySelector('[data-testid="option-equipment-${equipment}"]')`, "equipment option");
  assert(await evalJs(`(() => {const e=document.querySelector('[data-testid="option-equipment-${equipment}"]');e.click();return true})()`), "select equipment");
};
const value = testId => evalJs(`document.querySelector('[data-testid=${q(testId)}]')?.value ?? null`);
const screenshot = async name => {
  const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(path.join(evidence, `diesel04-${name}.png`), Buffer.from(data, "base64"));
};
const state = () => evalJs("window.__DIESEL03Fixture");
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await cdp("Page.navigate", { url: "http://127.0.0.1:4181/?scenario=diesel04" });
await wait(`!!document.querySelector('[data-testid="button-raise-requirement"]')`, "list screen");
await click("button-raise-requirement");
await wait(`!!document.querySelector('[data-testid="select-equipment-0"]')`, "form screen");
await select(1701);
await input("input-hours-0", "2.5");
await wait(`!!document.querySelector('[data-testid="warning-norm-0"]')`, "missing norm warning");
assert(await value("input-planned-qty-0") === "", "missing norm must keep auto quantity empty");
await screenshot("A-missing-norm");
await select(1704);
await input("input-hours-0", "2.5");
assert(await evalJs(`!!document.querySelector('[data-testid="warning-norm-0"]')`), "zero norm warning");
assert(await value("input-planned-qty-0") === "", "zero norm calculated quantity");
await screenshot("A-zero-norm");
await select(1701);
await input("input-hours-0", "2.5");
await input("input-norm-0", "3");
await click("save-norm-0");
await wait(`document.querySelector('[data-testid="input-planned-qty-0"]')?.value==='8'`, "ceil calculation");
assert((await state()).equipment.find(e => e.id === 1701).consumptionNorm === 3, "master not saved");
await wait(`window.__DIESEL03Fixture.requests.filter(x=>x.method==='GET' && x.path==='/api/plant-module/equipment').length >= 2`, "master re-fetch");
await screenshot("B-saved-ceil");
await select(1702);
await input("input-hours-0", "2.5");
await wait(`document.querySelector('[data-testid="input-planned-qty-0"]')?.value==='8'`, "preset norm calculation");
assert(!(await evalJs(`!!document.querySelector('[data-testid="warning-norm-0"]')`)), "warning on preset");
await screenshot("C-preset");
await select(1703);
await input("input-hours-0", "2.5");
assert(await evalJs(`document.querySelector('[data-testid="input-norm-0"]')?.getAttribute('aria-label') === 'Consumption norm L/km'`), "odometer unit");
await input("input-planned-qty-0", "12");
assert(await value("input-planned-qty-0") === "12", "manual quantity");
await screenshot("D-manual-km");
await input("input-norm-0", "0.2");
await click("save-norm-0");
await wait(`(window.__DIESEL03Fixture?.normSaves?.length || 0) === 2`, "km master save");
assert(await value("input-planned-qty-0") === "12", "save overwrote manual quantity");
await screenshot("D-manual-after-save");
await select(1702);
await select(1703);
await input("input-hours-0", "2.5");
await wait(`document.querySelector('[data-testid="input-planned-qty-0"]')?.value==='1'`, "km ceil calculation");
await screenshot("D-km-auto");
await select(1701);
assert(await evalJs(`!!document.querySelector('[data-testid="hint-work-qty-0"]')`), "missing hours hint");
await screenshot("C-missing-hours");
await select(1704);
await input("input-hours-0", "2.5");
await input("input-norm-0", "4");
await evalJs("window.__DIESEL03Fixture.normSaveDelayMs=200");
await click("save-norm-0");
await select(1702);
await input("input-hours-0", "2.5");
await wait(`window.__DIESEL03Fixture.normSaves.length===3`, "delayed master save");
assert(await value("input-planned-qty-0") === "8", "pending save overwrote newly selected equipment");
assert(await evalJs(`document.body.innerText.includes('3 L/hr')`), "pending save overwrote selected norm");
await screenshot("race-equipment-switch");
const successfulSaves = (await state()).normSaves;
// Failure must not display a saved norm or a calculated quantity.
await cdp("Page.navigate", { url: "http://127.0.0.1:4181/?scenario=diesel04&fail=1" });
await wait(`!!document.querySelector('[data-testid="button-raise-requirement"]')`, "failure list");
await click("button-raise-requirement");
await wait(`!!document.querySelector('[data-testid="select-equipment-0"]')`, "reload form");
await select(1703);
await input("input-hours-0", "2.5");
await input("input-norm-0", "0.2");
await click("save-norm-0");
await wait(`window.__DIESEL03Fixture.toastMessages.some(x=>x.title==='Could not save consumption norm')`, "failure toast");
assert(await value("input-planned-qty-0") === "", "failed save calculated quantity");
assert((await state()).equipment.find(e => e.id === 1703).consumptionNorm === null, "failed save mutated master");
await screenshot("failure");
console.log(JSON.stringify({ screenshots: ["A-missing-norm", "A-zero-norm", "B-saved-ceil", "C-preset", "D-manual-km", "D-manual-after-save", "D-km-auto", "C-missing-hours", "race-equipment-switch", "failure"], saves: successfulSaves }));
ws.close();