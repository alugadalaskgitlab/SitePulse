import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/vendor-bills-part-b");
const evidence = path.join(fixture, "evidence");
const port = Number(process.env.VITE_PORT || 4219);
const cdpPort = Number(process.env.CDP_PORT || 9369);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
mkdirSync(evidence, { recursive: true });
const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
let browser, socket;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
    if (i === 99) throw new Error("Synthetic fixture server unavailable");
    await sleep(100);
  }
  browser = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/vendor-b-${process.pid}`, `http://127.0.0.1:${port}/`], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 100; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === "page" && t.url.includes(String(port))); if (page) break; } catch {}
    if (i === 99) throw new Error("Chromium CDP unavailable");
    await sleep(100);
  }
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let seq = 0;
  const pending = new Map();
  socket.on("message", raw => {
    const msg = JSON.parse(raw);
    if (msg.method === "Runtime.exceptionThrown") console.error("Fixture page exception:", msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (!pending.has(msg.id)) return;
    const task = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? task.reject(new Error(msg.error.message)) : task.resolve(msg.result);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const wait = async (expression, label) => {
    for (let i = 0; i < 120; i++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); }
    throw new Error(`${label}: ${(await evaluate("document.body.innerText")).slice(0, 1200)}`);
  };
  const click = async selector => {
    assert(await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`), `Missing ${selector}`);
  };
  const selectUnit = async (unit, index = 0) => {
    await click(`[data-testid="select-item-unit-${index}"]`);
    await wait(`!!Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.trim() === ${JSON.stringify(unit)})`, `Unit option ${unit}`);
    assert(await evaluate(`(() => { const el=Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.trim() === ${JSON.stringify(unit)}); el?.click(); return !!el })()`), `Unit ${unit} not selected`);
  };
  const row = () => evaluate(`(() => ({
    qty: document.querySelector('[data-testid="input-item-qty-0"]')?.value,
    rate: document.querySelector('[data-testid="input-item-rate-0"]')?.value,
    amount: document.querySelector('[data-testid="text-item-amount-0"]')?.textContent,
    warning: document.querySelector('[data-testid="warning-item-unit-0"]')?.textContent || "",
    unit: document.querySelector('[data-testid="select-item-unit-0"]')?.textContent.trim()
  }))()`);
  const shot = async name => {
    await sleep(120);
    const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(evidence, `${name}-synthetic-actual-component.png`);
    writeFileSync(file, Buffer.from(result.data, "base64"));
    return file;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  await wait(`!!document.querySelector('[data-testid="button-new-bill"]')`, "VendorBills list");
  await click('[data-testid="button-new-bill"]');
  const setDate = async (selector, value) => evaluate(`(() => {
    const el=document.querySelector(${JSON.stringify(selector)});
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await setDate('[data-testid="input-period-from"]', "2026-09-01");
  await setDate('[data-testid="input-period-to"]', "2026-09-30");
  await wait(`!!document.querySelector('[data-testid="button-show-vendors"]:not([disabled])')`, "Vendor discovery");
  await click('[data-testid="button-show-vendors"]');
  await wait(`!!document.querySelector('[data-testid="button-select-vendor-SYNTHETIC SUPPLIER"]')`, "Supplier option");
  await click('[data-testid="button-select-vendor-SYNTHETIC SUPPLIER"]');
  await wait(`!!document.querySelector('[data-testid="button-auto-populate"]:not([disabled])')`, "Pull option");
  await click('[data-testid="button-auto-populate"]');
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "600"`, "Actual pulled material row");
  await selectUnit("TRIP");
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "1" && document.querySelector('[data-testid="input-item-rate-0"]')?.value === "800"`, "B1 conversion");
  assert((await row()).amount?.includes("800"), "B1 amount");
  const screenshots = [await shot("B1-converted")];
  await selectUnit("CFT");
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "600"`, "Physical source restored");
  await selectUnit("MT");
  await wait(`!!document.querySelector('[data-testid="warning-item-unit-0"]')`, "B2 missing-card warning");
  assert((await row()).qty === "600" && (await row()).rate === "12", "B2 changed qty/rate");
  screenshots.push(await shot("B2-no-match-warning"));
  await evaluate(`window.__vendorB.cards.push({ vendorName:"SYNTHETIC LINE SUPPLIER",category:"material",itemKey:"MAT_SOIL_TRIP",unit:"TRIP",rate:900 })`);
  await selectUnit("TRIP");
  await wait(`!!document.querySelector('[data-testid="warning-item-unit-0"]')`, "B3 ambiguous warning");
  assert((await row()).qty === "600" && (await row()).rate === "12", "B3 guessed qty/rate");
  screenshots.push(await shot("B3-ambiguous-warning"));
  await evaluate(`window.__vendorB.linked = true; window.__vendorB.cards.pop()`);
  await selectUnit("CFT");
  await wait(`!document.querySelector('[data-testid="warning-item-unit-0"]')`, "B4 linked original-unit restoration");
  await selectUnit("TRIP");
  await wait(`document.querySelector('[data-testid="input-item-rate-0"]')?.value === "800"`, "B4 linked conversion");
  screenshots.push(await shot("B4-linked-parity"));
  await evaluate(`window.__vendorB.holdNextRate = true`);
  await selectUnit("CFT");
  await wait(`typeof window.__vendorB.releaseRate === 'function'`, "Delayed inline rate response");
  await evaluate(`(() => {
    const el=document.querySelector('[data-testid="input-item-qty-0"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'777');
    el.dispatchEvent(new Event('input',{bubbles:true}));
    window.__vendorB.releaseRate();
  })()`);
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "777"`, "User qty edit");
  await sleep(150);
  assert((await row()).qty === "777" && (await row()).rate === "800", "Stale inline response overwrote newer qty edit");
  screenshots.push(await shot("B4-stale-qty-protected"));
  await click('[data-testid="button-set-rates"]');
  await wait(`!!document.querySelector('[data-testid="button-apply-rates"]')`, "B5 Set Rates remains openable");
  screenshots.push(await shot("B5-set-rates"));
  await click('[data-testid="button-apply-rates"]');
  await wait(`!document.querySelector('[data-testid="button-apply-rates"]')`, "B5 bulk rate application");
  assert((await row()).rate === "800", "B5 bulk Set Rates changed rate");
  await click('[data-testid="button-add-item"]');
  await wait(`!!document.querySelector('[data-testid="input-item-desc-1"]')`, "Manual row");
  await evaluate(`(() => {
    const el=document.querySelector('[data-testid="input-item-desc-1"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'SOIL');
    el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await click('[data-testid="select-item-category-1"]');
  await wait(`!!Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.trim()==='MATL')`, "Material category");
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(el=>el.textContent.trim()==='MATL').click()`);
  await selectUnit("CFT", 1);
  await evaluate(`(() => {
    const el=document.querySelector('[data-testid="input-item-qty-1"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'600');
    el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await wait(`document.querySelector('[data-testid="input-item-qty-1"]')?.value === "600"`, "Manual physical quantity");
  await selectUnit("TRIP", 1);
  await wait(`!!document.querySelector('[data-testid="warning-item-unit-1"]')`, "Manual trip conversion must not be guessed");
  assert((await evaluate(`document.querySelector('[data-testid="input-item-qty-1"]').value`)) === "600", "Manual source quantity overwritten");
  await selectUnit("CFT", 1);
  await wait(`document.querySelector('[data-testid="input-item-rate-1"]')?.value === "12"`, "Manual original unit matched its rate card");
  assert((await evaluate(`document.querySelector('[data-testid="input-item-qty-1"]').value`)) === "600", "Manual provenance lost");
  // A persisted row has no editor-only physical provenance. This tests that
  // Set Rates seeds it before converting the row to a commercial unit.
  await click('[data-testid="button-cancel"]');
  await wait(`!!document.querySelector('[data-testid="card-bill-41"]')`, "Saved synthetic bill");
  await click('[data-testid="card-bill-41"]');
  await wait(`!!document.querySelector('[data-testid="button-edit-bill"]')`, "Saved bill detail");
  await click('[data-testid="button-edit-bill"]');
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "600"`, "Loaded no-provenance source");
  await click('[data-testid="button-set-rates"]');
  await wait(`!!document.querySelector('[data-testid^="select-bulk-unit-"]')`, "Bulk billing-unit selector");
  await click('[data-testid^="select-bulk-unit-"]');
  await wait(`!!Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.trim().startsWith('TRIP'))`, "Bulk TRIP option");
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(el => el.textContent.trim().startsWith('TRIP')).click()`);
  await click('[data-testid="button-apply-rates"]');
  await wait(`!!document.querySelector('[data-testid="button-confirm-unit-conversion"]')`, "Bulk confirmation");
  await click('[data-testid="button-confirm-unit-conversion"]');
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "1" && document.querySelector('[data-testid="input-item-rate-0"]')?.value === "800"`, "Bulk converted source");
  await selectUnit("CFT");
  await wait(`document.querySelector('[data-testid="input-item-qty-0"]')?.value === "600" && document.querySelector('[data-testid="input-item-rate-0"]')?.value === "12" && !document.querySelector('[data-testid="warning-item-unit-0"]')`, "Bulk→inline physical restoration");
  assert((await row()).amount?.includes("7,200"), "Bulk→inline restored amount");
  screenshots.push(await shot("B5-bulk-inline-physical-roundtrip"));
  assert(!(await evaluate(`window.__vendorB.writes.length`)), "Unexpected business write");
  const result = { passed: true, syntheticFixture: true, actualComponent: "VendorBills", screenshots, assertions: ["B1 single-card trip conversion and amount (per-line vendor differs from bill vendor)", "B2 absent card preserves qty/rate and warns", "B3 ambiguous cards preserve qty/rate and warns", "B4 linked/unlinked name matching and repeat restoration", "Delayed inline rate-card response cannot overwrite subsequent qty edit", "B5 existing Set Rates opens/applies", "Manual unconvertible source stays 600; original-unit restoration uses original rate", "Persisted row without provenance: bulk Set Rates conversion then inline restore qty 600/rate 12/amount 7200", "No live APIs or writes"] };
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close(); browser?.kill("SIGTERM"); vite.kill("SIGTERM");
}