import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);
const fixture = path.join(root, "tests/fixtures/purchase-order-part-c");
const evidence = path.join(fixture, "evidence");
const port = Number(process.env.VITE_PORT || 4223);
const cdpPort = Number(process.env.CDP_PORT || 9373);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
mkdirSync(evidence, { recursive: true });
for (const file of readdirSync(evidence).filter(name => name.startsWith("SYNTHETIC-PO") && name.endsWith(".pdf"))) unlinkSync(path.join(evidence, file));
const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
let browser, socket;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
    if (i === 99) throw new Error("Synthetic fixture Vite did not start");
    await sleep(100);
  }
  browser = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/po-c-${process.pid}`, `http://127.0.0.1:${port}/`], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 100; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(p => p.type === "page" && p.url.includes(String(port)));
      if (page) break;
    } catch {}
    if (i === 99) throw new Error("Synthetic fixture Chromium did not start");
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
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const wait = async (expression, label) => {
    for (let i = 0; i < 160; i++) { if (await evaluate(expression).catch(() => false)) return; await sleep(100); }
    throw new Error(`Timed out: ${label}; body=${(await evaluate("document.body.innerText")).slice(0, 1100)}`);
  };
  const click = async selector => {
    assert(await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true })()`), `Missing ${selector}`);
  };
  const shot = async (name, selector) => {
    if (selector) await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
    await sleep(250);
    const png = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(evidence, `${name}.png`);
    writeFileSync(file, Buffer.from(png.data, "base64"));
    return file;
  };
  const input = async (selector, value) => {
    assert(await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`), `Missing input ${selector}`);
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: evidence });
  await wait(`!!document.querySelector('[data-testid="card-indent-11"]') && !!document.querySelector('[data-testid="fixture-label"]')`, "actual PurchaseIndents list");
  const screenshots = [await shot("C0-synthetic-indent-list-actual-component")];
  for (const [id, label] of [[11, "bulk-linked"], [12, "store-unlinked"], [13, "bulk-unlinked"], [14, "store-linked"]]) {
    await click(`[data-testid="card-indent-${id}"]`);
    await wait(`!!document.querySelector('[data-testid="button-po-preview-${id}"]')`, `${label} ordered panel`);
    assert(!(await evaluate(`!!document.querySelector('[data-testid="button-po-download"]')`)), `${label} download bypasses review`);
    screenshots.push(await shot(`C-${label}-ordered-actual-component`, `[data-testid="button-po-preview-${id}"]`));
    await click(`[data-testid="button-po-preview-${id}"]`);
    await wait(`!!document.querySelector('[data-testid="po-pdf-preview"]') && !!document.querySelector('[data-testid="button-po-download"]')`, `${label} PDF review dialog`);
    assert((await evaluate(`window.__poFixture.previews.at(-1)`)).includes(`items/${id}/purchase-order.pdf?preview=1`), `${label} real PDF preview not requested`);
    await sleep(2200); // Chromium's built-in PDF viewer paints after the iframe mounts.
    screenshots.push(await shot(`C-${label}-review-actual-component`));
    if (id === 11) {
      // A second review request replaces the first blob URL before dialog close.
      await click(`[data-testid="button-po-preview-${id}"]`);
      await wait(`window.__poFixture.previewUrls.created.length === 2 && window.__poFixture.previewUrls.revoked.length === 1`, "replacement revokes previous PDF URL");
      assert((await evaluate("window.__poFixture.previewUrls.revoked[0]")) === (await evaluate("window.__poFixture.previewUrls.created[0]")), "incorrect URL revoked on replacement");
    }
    const pdfCount = readdirSync(evidence).filter(name => name.endsWith(".pdf")).length;
    await click('[data-testid="button-po-download"]');
    for (let i = 0; i < 90 && readdirSync(evidence).filter(name => name.endsWith(".pdf")).length === pdfCount; i++) await sleep(100);
    assert(readdirSync(evidence).filter(name => name.endsWith(".pdf")).length > pdfCount, `${label} PDF was not downloaded from review`);
    const currentUrl = await evaluate("window.__poFixture.previewUrls.created.at(-1)");
    await click('[role="dialog"] button.absolute');
    await wait(`window.__poFixture.previewUrls.revoked.includes(${JSON.stringify(currentUrl)})`, `${label} closing review revokes PDF URL`);
    await click('[data-testid="button-back-to-list"]');
    await wait(`!!document.querySelector('[data-testid="card-indent-11"]')`, "back to indent list");
  }
  await click('[data-testid="card-indent-15"]');
  await wait(`!!document.querySelector('[data-testid="select-pa-action-15"]')`, "store purchase action panel");
  assert(!(await evaluate(`!!document.querySelector('[data-testid="button-po-preview-15"]')`)), "PO preview shown before order");
  await click('[data-testid="select-pa-action-15"]');
  await wait(`!!document.querySelector('[role="option"][data-value="ordered"]') || !!document.querySelector('[role="option"]')`, "ordered action option");
  assert(await evaluate(`(() => { const el=Array.from(document.querySelectorAll('[role="option"]')).find(x => x.textContent.includes('Ordered')); el?.click(); return !!el })()`), "Missing ordered action option");
  await wait(`!!document.querySelector('[data-testid="input-pa-rate-15"]')`, "ordered store form");
  await input('[data-testid="input-pa-vendor-15"]', "SYNTHETIC Supplier");
  await input('[data-testid="input-pa-rate-15"]', "735");
  await input('[data-testid="input-pa-delivery-15"]', "2026-09-29");
  screenshots.push(await shot("C-order-without-export-before-actual-component", '[data-testid="button-submit-purchaser-action"]'));
  await click('[data-testid="button-submit-purchaser-action"]');
  await wait(`!!document.querySelector('[data-testid="button-po-preview-15"]')`, "ordered without PO generation").catch(async error => {
    console.error("Synthetic mutation diagnostics:", await evaluate("JSON.stringify({ writes:window.__poFixture.writes, row:window.__poFixture.indents.find(i=>i.id===15), unexpected:window.__poFixture.unexpected, body:document.body.innerText.slice(-1400) })"));
    throw error;
  });
  assert((await evaluate("window.__poFixture.previews.length")) === 5, "PO generated during order");
  screenshots.push(await shot("C-order-without-export-after-actual-component", '[data-testid="button-po-preview-15"]'));
  const result = {
    fixture: "actual PurchaseIndents component; synthetic browser fetch; real PDFKit documents; no live writes",
    screenshots,
    previewRequests: await evaluate("window.__poFixture.previews"),
    previewUrlLifecycle: await evaluate("({created:window.__poFixture.previewUrls.created.length,revoked:window.__poFixture.previewUrls.revoked.length})"),
    writes: await evaluate("window.__poFixture.writes"),
    unexpected: await evaluate("window.__poFixture.unexpected"),
  };
  assert(result.unexpected.length === 0, `Unexpected synthetic API calls: ${result.unexpected.join(", ")}`);
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  socket?.close(); browser?.kill("SIGTERM"); vite.kill("SIGTERM");
}