// Existing parent-owned Vite/CDP; production components, synthetic APIs only.
import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const output = "screenshots/vb27";
mkdirSync(output, { recursive: true });
const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let id = 0;
const pending = new Map();
ws.on("message", raw => {
  const m = JSON.parse(raw), p = pending.get(m.id);
  if (p) { pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
const ev = async expression => {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = async expression => {
  for (let i = 0; i < 250; i++) { if (await ev(`Boolean(${expression})`)) return; await sleep(40); }
  throw Error(`Timeout ${expression}`);
};
const assert = (v, message) => { if (!v) throw Error(message); };
const sel = id => `[data-testid="${id}"]`;
const click = async id => {
  await wait(`!!document.querySelector(${JSON.stringify(sel(id))})`);
  await ev(`document.querySelector(${JSON.stringify(sel(id))}).click()`);
  await sleep(100);
};
const input = async (id, value) => {
  await ev(`(() => {const e=document.querySelector(${JSON.stringify(sel(id))}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()`);
};
const shot = async name => {
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${output}/${name}-SYNTHETIC.png`, Buffer.from(r.data, "base64"));
};
const load = async path => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:4194${path}?scenario=vb27` });
  await sleep(600);
};
try {
  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await load("/finance/rate-cards");
  await wait(`!!document.querySelector('[aria-label="Reset unsaved rate for DUST"]')`);
  await input("input-rate-1", "45");
  await click("button-remove-discovered-1");
  assert(await ev(`document.querySelector('${sel("input-rate-1")}').value==="" && !window.__VB22Fixture.requests.some(r=>r.method==="DELETE")`), "unsaved reset");
  await input("input-rate-1", "45");
  await click("button-save-all-rates");
  await wait(`!!document.querySelector('[aria-label="Remove saved rate for DUST"]')`);
  await shot("A1-saved-discovered-and-manual-controls");
  await ev(`window.__confirmations=[];window.confirm=m=>{window.__confirmations.push(m);return true}`);
  await click("button-remove-discovered-1");
  await wait(`!!document.querySelector('[aria-label="Reset unsaved rate for DUST"]')`);
  await ev(`document.querySelector('[aria-label="Remove MANUAL MATERIAL"]').click()`);
  await wait(`!document.querySelector('[aria-label="Remove MANUAL MATERIAL"]')`);
  assert(await ev(`window.__VB22Fixture.requests.filter(r=>r.method==="DELETE").length===2`), "saved/manual delete");
  await shot("A2-deleted-rate-local-reset");
  await load("/plant/vendor-bills");
  await click("button-new-bill");
  await input("input-period-from", "2027-02-14");
  await input("input-period-to", "2027-02-15");
  await click("button-show-vendors");
  await click("button-select-vendor-VB22 BORROW OWNER");
  await wait(`document.querySelector('${sel("button-auto-populate")}')?.disabled===false`);
  await ev(`([...document.querySelectorAll('[data-testid^="button-pull-group-"]')].find(e=>e.getAttribute("data-testid").toUpperCase().includes("SOIL"))).click()`);
  await wait(`document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]')`);
  await ev(`window.__confirmations=[];window.confirm=m=>{window.__confirmations.push(m);return false};document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]').scrollIntoView({block:"center"})`);
  await shot("B1-large-group-remove-control");
  await ev(`document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]').click()`);
  assert(await ev(`window.__confirmations.at(-1).includes("111 items")`), "confirmation count");
  assert(await ev(`!!document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]')`), "cancel preserves group");
  await ev(`window.confirm=m=>{window.__confirmations.push(m);return true};document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]').click()`);
  await wait(`!document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]')`);
  assert(await ev(`!!document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-15"]')`), "other date preserved");
  await click("button-auto-populate");
  await sleep(800);
  assert(await ev(`!document.querySelector('[data-testid^="button-remove-date-group-"][data-testid$="2027-02-14"]')`), "suppressed rows resurrected");
  await shot("B2-other-date-preserved-after-repull");
  await click("button-expand-all-dates");
  await click("button-add-item");
  await input("input-item-desc-2", "SYNTHETIC FILLED MANUAL");
  await input("input-item-qty-2", "3");
  await input("input-item-rate-2", "7");
  await click("button-add-item");
  await ev(`document.querySelector('${sel("input-item-desc-3")}').scrollIntoView({block:"center"})`);
  await shot("B3-blank-and-filled-manual-before-save");
  await click("button-save-bill");
  await wait(`window.__VB22Fixture.createdBills.length===1`);
  const saved = await ev("window.__VB22Fixture.createdBills[0]");
  assert(saved.items.length === 3, "blank row persisted or nonblank/source row lost");
  assert(saved.items.some(i => i.description === "SYNTHETIC FILLED MANUAL" && i.qty === 3 && i.rate === 7 && i.amount === 21), "filled manual amount changed");
  await shot("B4-saved-bill-without-blank-row");
  writeFileSync(`${output}/results.json`, JSON.stringify({ scenario: "SYNTHETIC production-component browser evidence, no live writes", confirmations: await ev("window.__confirmations"), savedBill: saved, requests: await ev("window.__VB22Fixture.requests"), passed: ["A1 saved discovered delete", "A2 local reset without DELETE", "manual deletion", "B1 111-row confirmation and cancel", "B2 batched group removal, other date retained, actual second pull of DUST without SOIL resurrection", "B3 blank manual row excluded from saved payload", "B4 filled manual row saved with quantity/rate/amount intact"] }, null, 2));
  console.log("VB-27 browser assertions passed including blank filtering and filled manual save");
} finally { ws.close(); }