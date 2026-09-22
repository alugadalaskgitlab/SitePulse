// Executable real-component browser assertions. API responses are simulated;
// actual storage guard coverage lives in vendorBillVb23PaymentGuard.test.ts.
// Start isolated Vite on 4195 and Chromium with CDP 9345 before running.
import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const port = process.env.VITE_PORT || 4195;
const cdpPort = process.env.CDP_PORT || 9345;
const dir = "screenshots/vb23";
mkdirSync(dir, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let seq = 0;
const pending = new Map();
socket.on("message", raw => {
  const m = JSON.parse(raw);
  const p = pending.get(m.id);
  if (p) { pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ev = async expression => {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const assert = (v, msg) => { if (!v) throw Error(msg); };
const wait = async expr => {
  for (let n = 0; n < 300; n++) { if (await ev(`!!(${expr})`)) return; await sleep(50); }
  throw Error(`Timeout: ${expr}`);
};
const selector = id => `[data-testid="${id}"]`;
const node = id => `document.querySelector(${JSON.stringify(selector(id))})`;
const click = async id => { await wait(node(id)); await ev(`${node(id)}.click()`); await sleep(150); };
const input = async (id, value) => ev(`(() => { const e=${node(id)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event("input",{bubbles:true})); })()`);
const select = async (id, text) => {
  await click(id);
  const option = `[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
  await wait(option); await ev(`${option}.click()`); await sleep(150);
};
const evidence = { disclosure: "Production VendorBills component mounted with synthetic in-memory API. 409 screenshot is simulated API; separate storage guard tests exercise production storage.", assertions: [], screenshots: [] };
const capture = async name => {
  await ev(`${node("section-payment-details")}?.scrollIntoView({block:"center"})`);
  await sleep(250);
  const result = await cdp("Page.captureScreenshot", { format: "png" });
  const file = `${dir}/${name}.png`; writeFileSync(file, Buffer.from(result.data, "base64")); evidence.screenshots.push(file);
};
const open = async (query = "") => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${port}/?${query}` });
  await wait(node("card-bill-2301")); await click("card-bill-2301");
  await wait(node("badge-bill-status"));
};
const save = async amount => {
  await click("button-edit-payment-details");
  await select("select-vb-paid-by", "COMPANY ACCOUNT");
  await select("select-vb-payment-account", "HDFC CURRENT A/C · bank");
  await input("input-vb-amount-paid", amount);
  await click("button-save-payment-details");
  await wait(`!${node("input-vb-amount-paid")}`);
};
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
try {
  for (const status of ["draft", "verified"]) {
    await open(`status=${status}`);
    assert(await ev(`!!${node("section-payment-details")} && !${node("button-edit-payment-details")}`), `${status} permissions`);
    await capture(`A-${status}-read-only`);
  }
  await open();
  await click("button-edit-payment-details");
  await select("select-vb-paid-by", "COMPANY ACCOUNT");
  await select("select-vb-payment-account", "HDFC CURRENT A/C · bank");
  await input("input-vb-amount-paid", "1000");
  await capture("A-approved-combined-payment-inputs");
  await click("button-save-payment-details");
  await wait(`!${node("input-vb-amount-paid")}`);
  const writes = await ev("window.__VB23Fixture.requests.filter(r=>r.method==='PATCH')");
  assert(writes[0].body.amountPaid === 1000 && writes[0].body.paymentAccountKey === "hdfc-current", "combined save payload");
  await click("button-advance-status");
  await wait(`${node("badge-bill-status")}?.textContent.toLowerCase()==='paid'`);
  await capture("B-combined-paid-success");
  await wait(`${node("status-paid-account")}?.textContent==='HDFC CURRENT A/C'`);
  assert(await ev(`${node("status-steps")}.textContent.includes("FIXTURE PAYMENT USER")`), "paid actor preserved");
  assert(await ev(`${node("status-step-paid")}.parentElement.textContent.includes("22")`), "paid timestamp preserved");
  await capture("F-paid-timestamp-user-bank");
  evidence.assertions.push("A: draft/verified read-only; approved fields visible", "B: cumulative amount/account saved, simulated API paid success", "F: timestamp + actor + resolved bank shown");
  await open();
  await save("600");
  await click("button-advance-status");
  await wait(`document.getElementById("fixture-toast").textContent.includes("409")`);
  assert(await ev(`${node("badge-bill-status")}.textContent.toLowerCase()==='approved'`), "underpaid status unchanged");
  await capture("C-underpaid-409-simulated-api");
  evidence.assertions.push("C: simulated 409 rendered by real status mutation; status stays approved");
  await open("type=equipment");
  await save("1000"); await click("button-advance-status");
  await wait(`${node("badge-bill-status")}?.textContent.toLowerCase()==='paid'`);
  evidence.assertions.push("D: equipment fields/save/paid flow unchanged");
  await capture("D-equipment-regression");
  await open("type=material");
  assert(await ev(`!${node("section-payment-details")}`), "material panel visibility unchanged");
  await click("button-advance-status");
  await wait(`${node("badge-bill-status")}?.textContent.toLowerCase()==='paid'`);
  await click("button-edit-payment-details");
  assert(await ev(`!${node("input-vb-amount-paid")} && !${node("select-vb-payment-account")}`), "material fields not widened");
  await click("button-save-payment-details");
  await wait(`!${node("button-save-payment-details")}`);
  assert(await ev(`window.__VB23Fixture.requests.filter(r=>r.path.endsWith("payment-details")).every(r=>!('amountPaid' in r.body)&&!('paymentAccountKey' in r.body))`), "material payload unchanged");
  evidence.assertions.push("E: material visibility, input gates, and payload unaffected");
  await capture("E-material-regression");
  await open("status=paid");
  await wait(node("status-steps"));
  assert(await ev(`!${node("status-paid-account")} && ${node("status-steps")}.textContent.includes("FIXTURE PAYMENT USER")`), "legacy paid actor/no bank");
  assert(await ev(`${node("status-step-paid")}.parentElement.textContent.includes("22")`), "legacy timestamp");
  await capture("G-legacy-paid-no-bank");
  evidence.assertions.push("G: legacy paid timestamp/actor preserved, bank omitted");
  writeFileSync(`${dir}/evidence.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { socket.close(); }