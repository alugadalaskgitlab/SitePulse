import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

const vitePort = Number(process.env.VITE_PORT || 4196);
const cdpPort = Number(process.env.CDP_PORT || 9346);
const evidenceDir = "screenshots/vb23b";
mkdirSync(evidenceDir, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let sequence = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
  return result.result?.value;
};
const waitFor = async (expression, label) => {
  for (let index = 0; index < 300; index += 1) {
    if (await evaluate(`!!(${expression})`)) return;
    await sleep(50);
  }
  throw Error(`Timed out waiting for ${label}`);
};
const node = id => `document.querySelector('[data-testid=${JSON.stringify(id)}]')`;
const click = async id => {
  await waitFor(node(id), id);
  await evaluate(`${node(id)}.click()`);
  await sleep(150);
};
const select = async (id, label) => {
  await click(id);
  const option = `[...document.querySelectorAll('[role="option"]')].find(node => node.textContent.trim() === ${JSON.stringify(label)})`;
  await waitFor(option, label);
  await evaluate(`${option}.click()`);
};
const input = async (id, value) => evaluate(`(() => {
  const element=${node(id)};
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(element,${JSON.stringify(value)});
  element.dispatchEvent(new Event("input",{bubbles:true}));
  element.dispatchEvent(new Event("change",{bubbles:true}));
})()`);
const capture = async name => {
  await evaluate(`${node("section-payment-details")}.scrollIntoView({block:"center"})`);
  await sleep(250);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const path = `${evidenceDir}/${name}.png`;
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
};
const assert = (value, message) => { if (!value) throw Error(message); };

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
try {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}/plant/vendor-bills` });
  await waitFor(node("card-bill-2302"), "combined bill card");
  await click("card-bill-2302");
  await click("button-edit-payment-details");
  await select("select-vb-paid-by", "COMPANY ACCOUNT");
  await select("select-vb-payment-account", "HDFC CURRENT A/C · bank");
  await input("input-vb-amount-paid", "1000");
  const entered = await capture("A-combined-payment-entered");
  await click("button-save-payment-details");
  await waitFor(`!${node("input-vb-amount-paid")}`, "HTTP payment save");
  await click("button-advance-status");
  await waitFor(`${node("badge-bill-status")}?.textContent.toLowerCase()==="paid"`, "HTTP paid transition");
  await waitFor(`${node("status-paid-account")}?.textContent==="HDFC CURRENT A/C"`, "resolved paid account");
  assert(await evaluate(`${node("status-steps")}.textContent.includes("VB23B ACCOUNTS USER")`), "paid actor missing");
  const paid = await capture("B-combined-saved-and-paid");
  const evidence = await (await fetch("http://127.0.0.1:4197/api/vb23b/evidence")).json();
  assert(evidence.storageCalls[0].method === "updateVendorBillPaymentDetails", "real payment storage call missing");
  assert(evidence.storageCalls[1].method === "updateVendorBillStatus", "real status storage call missing");
  assert(evidence.row.status === "paid" && evidence.row.amountPaid === 1000, "saved/paid state mismatch");
  assert(evidence.row.paymentAccountKey === "hdfc-current", "saved account mismatch");
  assert(evidence.row.paymentRecordedBy === "VB23B ACCOUNTS USER" && evidence.row.paidAt, "paid audit fields missing");
  writeFileSync(`${evidenceDir}/evidence.json`, JSON.stringify({
    disclosure: evidence.isolation,
    mounted: "actual client/src/pages/VendorBills.tsx",
    server: "HTTP handlers invoke unchanged DatabaseStorage.updateVendorBillPaymentDetails and updateVendorBillStatus",
    screenshots: [entered, paid],
    persisted: evidence.row,
    storageCalls: evidence.storageCalls,
    writes: evidence.writes,
  }, null, 2));
  writeFileSync("tests/fixtures/vb23b/.stop", "done\n");
  console.log(JSON.stringify(evidence.row, null, 2));
} finally {
  socket.close();
}