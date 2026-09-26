import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/diesel04-part-b");
const evidence = path.join(fixture, "evidence");
const port = 4227, cdpPort = 9377;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, message) => { if (!ok) throw new Error(message); };
mkdirSync(evidence, { recursive: true });
const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
let browser, socket;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
    if (i === 99) throw new Error("Mock fixture unavailable");
    await sleep(100);
  }
  browser = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/diesel-b-${process.pid}`, `http://127.0.0.1:${port}/`], { stdio: "ignore" });
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
    throw new Error(`${label}: ${(await evaluate("document.body.innerText")).slice(0, 1800)}`);
  };
  const click = async selector => assert(await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true })()`), `Missing ${selector}`);
  const badge = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent?.trim()`);
  const shot = async name => {
    await cdp("Runtime.evaluate", { expression: `document.querySelector('[data-testid="diesel-stock-badge"]')?.scrollIntoView({block:"center"})` });
    await sleep(150);
    const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(evidence, `${name}-mock-api-actual-component.png`);
    writeFileSync(file, Buffer.from(result.data, "base64"));
    return file;
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  await wait(`document.querySelector('[data-testid="diesel-stock-badge"]')?.textContent?.includes('90.000 Liters')`, "Initial diesel stock");
  assert((await badge('[data-testid="diesel-issued-badge"]')).includes("12.000 Liters"), "Issued mismatch");
  assert((await evaluate("document.body.innerText")).includes("100.000 Liters"), "Original Filtered Totals absent");
  const before = await shot("A-before-pending-receipt");
  await click('[data-testid="button-add-receipt"]');
  await click('[data-testid="select-material"]');
  await wait(`!!document.querySelector('[role="option"]')`, "Diesel material option");
  assert(await evaluate(`(() => { const option=[...document.querySelectorAll('[role="option"]')].find(o => o.textContent?.includes('DIESEL')); option?.click(); return !!option })()`), "Diesel material missing");
  await click('[data-testid="select-party"]');
  await wait(`!!document.querySelector('[role="option"]')`, "Party option");
  assert(await evaluate(`(() => { const option=[...document.querySelectorAll('[role="option"]')].find(o => o.textContent?.includes('SYNTHETIC JOB')); option?.click(); return !!option })()`), "Party missing");
  await wait(`!!document.querySelector('[data-testid="input-diesel-exception-reason"]')`, "Exception reason field");
  const setValue = (selector, value, tag) => evaluate(`(() => {
    const el=document.querySelector(${JSON.stringify(selector)});
    const setter=Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set;
    setter.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await setValue('[data-testid="input-quantity"]', "5", "HTMLInputElement");
  await setValue('[data-testid="input-diesel-exception-reason"]', "Synthetic pending receipt for isolated stock test", "HTMLTextAreaElement");
  await wait(`!!document.querySelector('[data-testid="button-save-receipt"]:not([disabled])')`, "Save enabled");
  await click('[data-testid="button-save-receipt"]');
  await wait(`document.querySelector('[data-testid="diesel-stock-badge"]')?.textContent?.includes('95.000 Liters')`, "Stock refresh after pending creation");
  const result = await evaluate(`({ stock:document.querySelector('[data-testid="diesel-stock-badge"]').textContent.trim(), issued:document.querySelector('[data-testid="diesel-issued-badge"]').textContent.trim(), reads:window.__dieselB.stockReads, writes:window.__dieselB.writes, status:window.__dieselB.receipts[1]?.documentStatus })`);
  assert(result.status === "pending" && result.reads >= 2 && result.writes.length === 1, "Pending mock creation / stock refetch failed");
  const after = await shot("B-after-pending-receipt");
  await setValue('[data-testid="input-filter-date-from"]', "2026-09-20", "HTMLInputElement");
  await wait(`document.querySelector('[data-testid="diesel-issued-badge"]')?.textContent?.includes('0.000 Liters')`, "Date-scoped issued");
  assert((await badge('[data-testid="diesel-stock-badge"]')).includes("95.000 Liters"), "Stock must remain current across date filters");
  await evaluate(`window.__dieselB.failLedger = true; window.__dieselB.refetchLedger()`);
  await wait(`document.querySelector('[data-testid="diesel-issued-badge"]')?.textContent?.includes('Unavailable')`, "Ledger error not displayed");
  assert((await badge('[data-testid="diesel-stock-badge"]')).includes("95.000 Liters"), "Ledger failure must not hide stock");
  await click('[data-testid="select-filter-party"]');
  await wait(`!!document.querySelector('[role="option"]')`, "Party filter option");
  await evaluate(`([...document.querySelectorAll('[role="option"]')].find(o => o.textContent?.includes('SYNTHETIC JOB')))?.click()`);
  await wait(`!document.querySelector('[data-testid="diesel-issued-badge"]')`, "Party-filtered global issued hidden");
  console.log(JSON.stringify({ before, after, result }));
} finally {
  socket?.close(); browser?.kill("SIGTERM"); vite.kill("SIGTERM");
}