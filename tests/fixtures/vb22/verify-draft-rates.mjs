// Production VendorBills + RateCards, synthetic intercepted APIs ONLY.
// Parent starts existing Vite/CDP. This runner never starts servers or saves bills.
import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const port = process.env.VITE_PORT || 4194;
const cdpPort = process.env.CDP_PORT || 9223;
const output = "screenshots/vendor-bill-draft-rates";
mkdirSync(output, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let id = 0;
const pending = new Map();
socket.on("message", raw => {
  const msg = JSON.parse(raw);
  if (!pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const ev = async expression => {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (ok, label) => { if (!ok) throw new Error(label); };
const wait = async (expr, label) => {
  for (let i = 0; i < 250; i++) { if (await ev(expr)) return; await sleep(40); }
  throw new Error(`Timeout: ${label}`);
};
const q = JSON.stringify;
const selector = testId => `[data-testid="${testId}"]`;
const click = async testId => {
  const box = await ev(`(() => { const e=document.querySelector(${q(selector(testId))}); if(!e||e.disabled) return null; e.scrollIntoView({block:"center"}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  assert(box, `Missing/disabled ${testId}`);
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...box });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...box });
};
const input = async (testId, value) => {
  await ev(`(() => { const e=document.querySelector(${q(selector(testId))}); const proto=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(e,${q(String(value))}); e.dispatchEvent(new Event("input",{bubbles:true})); })()`);
};
const shot = async name => {
  const image = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${output}/${name}-SYNTHETIC.png`, Buffer.from(image.data, "base64"));
};
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: `http://127.0.0.1:${port}/plant/vendor-bills?scenario=draft-rates` });
  await wait(`!!document.querySelector('${selector("button-new-bill")}')`, "bill list");
  await click("button-new-bill");
  await input("input-period-from", "2027-02-14");
  await input("input-period-to", "2027-02-14");
  await click("select-bill-site");
  await wait(`[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.includes("VB22 TEST ROAD"))`, "site choice");
  await ev(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes("VB22 TEST ROAD")).click()`);
  await click("button-show-vendors");
  await wait(`!!document.querySelector('${selector("button-select-vendor-VB22 BORROW OWNER")}')`, "vendor discovery");
  await click("button-select-vendor-VB22 BORROW OWNER");
  await wait(`document.querySelector('${selector("button-auto-populate")}')?.disabled===false`, "pull");
  await click("button-auto-populate");
  await wait(`!!document.querySelector('${selector("input-item-qty-0")}')`, "pulled row");
  await ev(`window.__rateEvidence={frames:[],toasts:[]}; window.addEventListener("fixture-toast",e=>window.__rateEvidence.toasts.push(e.detail));
    window.__watchRates=true; function sample(){const ds=[...document.querySelectorAll('[role="dialog"]')].filter(e=>e.getBoundingClientRect().height>0 && getComputedStyle(e).visibility!=="hidden"); window.__rateEvidence.frames.push({time:performance.now(),count:ds.length,titles:ds.map(e=>e.querySelector("h2")?.textContent),states:ds.map(e=>e.dataset.state)}); if(window.__watchRates) requestAnimationFrame(sample);} sample();`);
  await click("button-set-rates");
  await wait(`!!document.querySelector('[data-testid^="select-bulk-unit-"]')`, "Set Rates");
  const unitId = await ev(`document.querySelector('[data-testid^="select-bulk-unit-"]').dataset.testid`);
  const rateId = await ev(`document.querySelector('[data-testid^="input-bulk-rate-"]').dataset.testid`);
  await click(unitId);
  await wait(`!!document.querySelector('[role="option"]')`, "unit options");
  await ev(`[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes("TRIP")).click()`);
  await input(rateId, "975");
  await click("button-apply-rates");
  await wait(`!!document.querySelector('${selector("button-confirm-unit-conversion")}')`, "confirmation");
  assert(await ev(`document.querySelectorAll('[role="dialog"]').length===1`), "overlapping dialogs");
  assert(await ev(`!document.querySelector('${selector("button-apply-rates")}')`), "old Set Rates content remains");
  await shot("A1-one-confirmation");
  // Cancel back to same rates, then confirm. No toast/write on cancellation.
  await click("button-cancel-unit-conversion");
  assert(await ev(`document.querySelector(${q(selector(rateId))}).value==="975"`), "cancel lost selection");
  await click("button-apply-rates");
  await click("button-confirm-unit-conversion");
  await wait(`window.__rateEvidence.toasts.some(t=>t.title?.startsWith("Rates and billing units applied"))`, "post-close toast");
  await sleep(250);
  const a = await ev(`window.__watchRates=false; window.__rateEvidence`);
  assert(Math.max(...a.frames.map(f => f.count)) === 1, "more than one visible modal in sampled frames");
  const success = a.toasts.find(t => t.title.startsWith("Rates and billing units applied"));
  assert(success.dialogCount === 0, "toast fired before dialog DOM removed");
  assert(await ev(`document.body.innerText.includes("Rates and billing units applied to 1 item") && document.querySelectorAll('[role="dialog"]').length===0`), "success toast not visible after close");
  await shot("A1-success-toast-after-dialog-removed");
  await ev(`document.querySelector('[toast-close]')?.click()`);
  await sleep(400);
  assert(await ev(`document.querySelector('${selector("input-item-qty-0")}').value==="1" && document.querySelector('${selector("input-item-rate-0")}').value==="975"`), "conversion not applied");
  await input("input-item-qty-0", "3");
  await input("input-item-rate-0", "1100");
  await input("input-notes", "UNSAVED draft preserved across 17 rate edits");
  await ev(`window.__draftInput=document.querySelector('${selector("input-item-qty-0")}'); window.__draftURL=location.href`);
  await click("button-manage-rate-cards");
  await wait(`document.querySelectorAll('[data-testid^="input-rate-"]').length===17`, "17 rate cards");
  assert(await ev(`window.__draftInput.isConnected && !window.__draftInput.getBoundingClientRect().height`), "draft unmounted/not hidden");
  const cardIds = await ev(`[...document.querySelectorAll('[data-testid^="input-rate-"]')].map(e=>e.dataset.testid)`);
  for (let i = 0; i < cardIds.length; i++) await input(cardIds[i], 100 + i);
  await shot("B1-17-rates-with-draft-mounted");
  const saveId = await ev(`[...document.querySelectorAll("button")].find(e=>e.textContent.includes("SAVE")&&e.dataset.testid)?.dataset.testid`);
  assert(saveId, "save rates button missing");
  await click(saveId);
  await wait(`!document.querySelector('${selector("text-rate-cards-title")}')`, "return to draft after save");
  const b = await ev(`({
    sameDOM:window.__draftInput===document.querySelector('${selector("input-item-qty-0")}'),
    sameURL:location.href===window.__draftURL,
    quantity:document.querySelector('${selector("input-item-qty-0")}').value,
    rate:document.querySelector('${selector("input-item-rate-0")}').value,
    notes:document.querySelector('${selector("input-notes")}').value,
    periodFrom:document.querySelector('${selector("input-period-from")}').value,
    periodTo:document.querySelector('${selector("input-period-to")}').value,
    site:document.querySelector('${selector("select-bill-site")}').textContent,
    title:document.querySelector('${selector("text-form-title")}').textContent,
    writes:window.__VB22Fixture.requests.filter(r=>r.method!=="GET")
  })`);
  assert(b.sameDOM && b.sameURL && b.quantity === "3" && b.rate === "1100" && b.notes.includes("UNSAVED") && b.site.includes("VB22 TEST ROAD"), "draft changed");
  const saves = b.writes.filter(r => r.path === "/api/vendor-rate-cards/bulk-upsert");
  assert(saves.length === 1 && saves[0].body.items.length === 17, "expected 17 saved rates");
  assert(!b.writes.some(r => r.path === "/api/vendor-bills"), "unexpected bill write");
  await ev(`document.querySelector('${selector("input-item-qty-0")}').scrollIntoView({block:"center"})`);
  await shot("B1-returned-same-unsaved-draft");
  await ev(`document.querySelector('[toast-close]')?.click()`);
  await sleep(400);
  await click("button-manage-rate-cards");
  await wait(`!!document.querySelector('${selector("button-back-rate-cards")}')`, "reopen cards");
  await click("button-back-rate-cards");
  assert(await ev(`window.__draftInput===document.querySelector('${selector("input-item-qty-0")}') && window.__draftInput.value==="3"`), "Back discarded draft");
  await cdp("Page.navigate", { url: `http://127.0.0.1:${port}/plant/vendor-bills?scenario=draft-rates&editing=1` });
  await wait(`!!document.querySelector('${selector("card-bill-22999")}')`, "synthetic existing bill");
  await click("card-bill-22999");
  await wait(`!!document.querySelector('${selector("button-edit-bill")}')`, "existing bill detail");
  await click("button-edit-bill");
  await wait(`!!document.querySelector('${selector("input-item-qty-0")}')`, "edit form");
  await input("input-item-qty-0", "777");
  await input("input-notes", "UNSAVED EDIT bill preserved");
  await ev(`window.__editInput=document.querySelector('${selector("input-item-qty-0")}'); true`);
  await click("button-manage-rate-cards");
  await wait(`document.querySelectorAll('[data-testid^="input-rate-"]').length===17`, "edit bill cards");
  await input("input-rate-0", "432");
  await click("button-save-all-rates");
  await wait(`!document.querySelector('${selector("text-rate-cards-title")}')`, "return to edit bill");
  const edit = await ev(`({sameDOM:window.__editInput===document.querySelector('${selector("input-item-qty-0")}'),quantity:window.__editInput.value,notes:document.querySelector('${selector("input-notes")}').value,title:document.querySelector('${selector("text-form-title")}').textContent,writes:window.__VB22Fixture.requests.filter(r=>r.method!=="GET")})`);
  assert(edit.sameDOM && edit.quantity === "777" && edit.notes === "UNSAVED EDIT bill preserved" && edit.title === "EDIT VENDOR BILL", "edit draft lost");
  assert(!edit.writes.some(r=>r.path === "/api/vendor-bills" || r.path === "/api/vendor-bills/22999"), "unexpected existing bill write");
  await ev(`window.__editInput.scrollIntoView({block:"center"})`);
  await shot("B1-returned-same-edit-draft");
  writeFileSync(`${output}/evidence.json`, JSON.stringify({ disclosure: "Real production components and Chromium interactions; synthetic API fixture only, no live business writes.", A1: a, B1: b, editDraft: edit }, null, 2));
  console.log(JSON.stringify({ result: "PASS", A1: { sampledFrames: a.frames.length, maximumVisibleDialogs: Math.max(...a.frames.map(f=>f.count)), successToast: success }, B1: { sameDOM: b.sameDOM, sameURL: b.sameURL, quantity: b.quantity, rate: b.rate, periodFrom: b.periodFrom, periodTo: b.periodTo, savedRates: saves[0].body.items.length, backPreservedDraft: true }, editDraft: {sameDOM:edit.sameDOM, quantity:edit.quantity, title:edit.title}, evidence: output }, null, 2));
} finally { socket.close(); }