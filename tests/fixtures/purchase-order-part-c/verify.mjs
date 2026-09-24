import { spawn, execFileSync } from "node:child_process";
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
for (const name of readdirSync(evidence).filter(name => /^SYNTHETIC-PO-\d+\.pdf$/.test(name)))
  unlinkSync(path.join(evidence, name));
const vite = spawn(path.join(root, "node_modules/.bin/vite"), ["--config", path.join(fixture, "vite.config.ts"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
let browser, socket;
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break; } catch {}
    if (i === 119) throw new Error("Synthetic fixture Vite did not start");
    await sleep(100);
  }
  browser = spawn("/repl/tools/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/po-c-${process.pid}`, `http://127.0.0.1:${port}/`], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 120; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(p => p.type === "page" && p.url.includes(String(port)));
      if (page) break;
    } catch {}
    if (i === 119) throw new Error("Synthetic Chromium did not start");
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
    throw new Error(`Timed out: ${label}; body=${(await evaluate("document.body.innerText")).slice(-1300)}`);
  };
  const click = async selector => {
    assert(await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true })()`), `Missing ${selector}`);
  };
  const shot = async name => {
    await sleep(350);
    const png = await cdp("Page.captureScreenshot", { format: "png" });
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
  await wait(`!!document.querySelector('[data-testid="card-indent-11"]')`, "real PurchaseIndents list");
  const screenshots = [await shot("C-A-list-before-order")];
  for (const id of [11, 12]) {
    await click(`[data-testid="card-indent-${id}"]`);
    await wait(`!!document.querySelector('[data-testid="button-po-open-${id}"]:not([disabled])')`, `item ${id} PO control`);
    await click(`[data-testid="button-po-open-${id}"]`);
    await wait(`!!document.querySelector('[data-testid="button-po-save"]')`, "editable PO");
    assert(!(await evaluate(`!!document.querySelector('[data-testid="button-po-download"]')`)), "Draft PDF available");
    screenshots.push(await shot(`C-B-${id}-raise-edit-draft`));
    await input('[data-testid="po-field-description"]', `SYNTHETIC ${id} edited standalone PO`);
    await click('[data-testid="button-po-save"]');
    await wait(`!!window.__poFixture.orders[${id}]`, "draft persisted in synthetic API");
    await click(`[data-testid="button-po-open-${id}"]`);
    await wait(`!!document.querySelector('[data-testid="button-po-submit"]')`, "draft restored");
    assert((await evaluate(`document.querySelector('[data-testid="po-field-description"]').value`)).includes("edited standalone"), "Draft edit was lost");
    await click('[data-testid="button-po-submit"]');
    await wait(`!!document.querySelector('[data-testid="button-po-approve"]')`, "submitted for approval");
    assert(!(await evaluate(`!!document.querySelector('[data-testid="button-po-save"]')`)), "Submitted PO remains editable");
    assert(!(await evaluate(`!!document.querySelector('[data-testid="button-po-download"]')`)), "Submitted PDF available");
    screenshots.push(await shot(`C-CF-${id}-submitted-locked-no-pdf`));
    if (id === 11) {
      await click('[role="dialog"] button.absolute');
      await click('[data-testid="button-back-to-list"]');
      await wait(`!!document.querySelector('[data-testid="po-pending-11"]')`, "approver pending list");
      screenshots.push(await shot("C-C-approver-pending-list"));
      await click('[data-testid="po-pending-11"]');
      await wait(`!!document.querySelector('[data-testid="button-po-open-11"]:not([disabled])')`, "open pending PO");
      await click('[data-testid="button-po-open-11"]');
      await wait(`!!document.querySelector('[data-testid="button-po-approve"]')`, "approver review action");
    }
    await click('[data-testid="button-po-approve"]');
    await wait(`!!document.querySelector('[data-testid="button-po-download"]')`, "approved PDF");
    screenshots.push(await shot(`C-D-${id}-approved-real-names-download`));
    const previous = readdirSync(evidence).filter(name => name.endsWith(".pdf")).length;
    await click('[data-testid="button-po-download"]');
    for (let i = 0; i < 90 && readdirSync(evidence).filter(name => name.endsWith(".pdf")).length === previous; i++) await sleep(100);
    assert(readdirSync(evidence).filter(name => name.endsWith(".pdf")).length > previous, "Approved PO did not download");
    await click(`[data-testid="button-po-preview-${id}"]`);
    await wait(`!!document.querySelector('[data-testid="po-pdf-preview"]')`, "approved PDF iframe");
    await sleep(1500);
    screenshots.push(await shot(`C-DG-${id}-approved-pdf-preview`));
    await click('[role="dialog"] button.absolute');
    await click('[role="dialog"] button.absolute');
    await click('[data-testid="button-back-to-list"]');
    await wait(`!!document.querySelector('[data-testid="card-indent-11"]')`, "back to list");
  }
  await click('[data-testid="card-indent-14"]');
  await wait(`!!document.querySelector('[data-testid="button-po-open-14"]:not([disabled])')`, "linked-vendor store item");
  await click('[data-testid="button-po-open-14"]');
  await wait(`!!document.querySelector('[data-testid="po-field-vendorName"]')`, "editable linked vendor name");
  await input('[data-testid="po-field-vendorName"]', "SYNTHETIC Alternate Source");
  screenshots.push(await shot("C-B-linked-name-change-clears-vendor-id"));
  await click('[data-testid="button-po-save"]');
  await wait(`!!window.__poFixture.orders[14]`, "unlinked store draft saved");
  assert((await evaluate("window.__poFixture.orders[14].vendorId")) === null, "Editing linked vendor name failed to clear vendorId");
  assert((await evaluate("window.__poFixture.orders[14].vendorName")) === "SYNTHETIC Alternate Source", "Manual vendor name was lost");
  await click('[data-testid="button-back-to-list"]');
  await wait(`!!document.querySelector('[data-testid="card-indent-15"]')`, "back to list");
  await click('[data-testid="card-indent-15"]');
  await wait(`!!document.querySelector('[data-testid="select-pa-action-15"]')`, "purchase action without PO");
  await click('[data-testid="select-pa-action-15"]');
  await wait(`!!document.querySelector('[role="option"]')`, "purchase action options");
  assert(await evaluate(`(() => { const option=Array.from(document.querySelectorAll('[role="option"]')).find(x => x.textContent.includes('Ordered')); option?.click(); return !!option })()`), "Ordered action missing");
  await wait(`!!document.querySelector('[data-testid="input-pa-rate-15"]')`, "ordered form");
  await input('[data-testid="input-pa-vendor-15"]', "SYNTHETIC Supplier");
  await input('[data-testid="input-pa-rate-15"]', "735");
  await input('[data-testid="input-pa-delivery-15"]', "2026-09-29");
  screenshots.push(await shot("C-A-order-without-po-before"));
  await click('[data-testid="button-submit-purchaser-action"]');
  await wait(`window.__poFixture.indents.find(i=>i.id===15).items[0].purchaseStatus==='ORDERED'`, "order recorded without PO");
  assert(!(await evaluate("!!window.__poFixture.orders[15]")), "Ordering unexpectedly raised a PO");
  screenshots.push(await shot("C-A-order-without-po-after"));
  const files = readdirSync(evidence).filter(name => name.startsWith("SYNTHETIC-PO-") && name.endsWith(".pdf"));
  for (const filename of files) {
    const pdf = path.join(evidence, filename);
    assert(/Pages:\s+1\b/.test(execFileSync("pdfinfo", [pdf], { encoding: "utf8" })), `${filename} is not one page`);
    const text = execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" });
    assert(text.includes("Raised by: Ramesh Kumar") && text.includes("Approved by: Suresh Reddy"), `${filename} lacks real actor names`);
    assert(!/subtotal|total amount|signature/i.test(text), `${filename} has forbidden totals/signature`);
  }
  const result = {
    fixture: "Real PurchaseIndents component, synthetic browser API, real PDFKit files. No live business writes; access enforcement covered by isolated route tests.",
    screenshots, downloadedPdfs: files, writes: await evaluate("window.__poFixture.writes"),
    unexpected: await evaluate("window.__poFixture.unexpected"),
  };
  assert(result.unexpected.length === 0, `Unexpected synthetic API: ${result.unexpected.join(", ")}`);
  writeFileSync(path.join(evidence, "verification-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ screenshots: screenshots.length, downloadedPdfs: files, writes: result.writes.length }));
} finally {
  socket?.close(); browser?.kill("SIGTERM"); vite.kill("SIGTERM");
}