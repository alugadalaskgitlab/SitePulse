import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const output = path.resolve("reports/evidence");
mkdirSync(output, { recursive: true });
const pageInfo = await (await fetch("http://127.0.0.1:9224/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(pageInfo.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let nextId = 0;
const pending = new Map();
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") {
    console.error(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  }
  if (!message.id || !pending.has(message.id)) return;
  const callback = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callback.reject(new Error(`${callback.method}: ${message.error.message}`)) : callback.resolve(message.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject, method });
  socket.send(JSON.stringify({ id, method, params }));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = async expression => {
  try {
    const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result?.value;
  } catch (error) {
    if (String(error).includes("Inspected target navigated or closed")) return undefined;
    throw error;
  }
};
const waitFor = async expression => {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${expression}`);
};
const capture = async name => {
  const shot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  writeFileSync(path.join(output, name), Buffer.from(shot.data, "base64"));
};
const navigate = async url => {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 1, mobile: true });
  await cdp("Emulation.setEmulatedMedia", { media: "screen" });
  await cdp("Page.navigate", { url });
  await sleep(100);
  await waitFor("document.readyState === 'complete'");
  await sleep(250);
};
const base = "http://127.0.0.1:4178";
await cdp("Page.enable");
await cdp("Runtime.enable");

await navigate(`${base}/fixture/dpr-activity-home?dprActivity02=1`);
await waitFor("document.body.innerText.includes('Pending Before Submit') && document.body.innerText.includes('Site activities')");
await evaluate(`document.body.innerText.includes("1 recorded")`);
await evaluate(`Array.from(document.querySelectorAll("h2")).find(e => e.textContent?.includes("Pending Before Submit"))?.scrollIntoView({block:"start"})`);
await capture("dpr-activity-02-field-home-phone.png");

await navigate(`${base}/site/work/24602?dprActivity02=1`);
await waitFor("document.body.innerText.includes('Site activities') && document.body.innerText.includes('1 recorded')");
await capture("dpr-activity-02-work-hub-phone.png");

const guidedUrl = `${base}/site/guided?draftId=24602&section=siteActivities&dprActivity02=1`;
await navigate(guidedUrl);
await waitFor("!!document.querySelector('[data-testid=\"card-site-activities-step\"]') && !!document.querySelector('[data-testid=\"wizard-step-4\"]')");
assert.equal(await evaluate(`document.querySelector('[data-testid="wizard-step-label-4"]')?.textContent?.trim()`), "Site activities");
await capture("dpr-activity-02-step-indicator-phone.png");

await evaluate(`Array.from(document.querySelectorAll("button")).find(node => node.textContent?.trim() === "Edit")?.click()`);
await waitFor("document.body.innerText.includes('Activity details') && document.body.innerText.includes('Result')");
await capture("dpr-activity-02-site-activities-phone.png");

const changed = await evaluate(`(() => {
  const label = Array.from(document.querySelectorAll("label")).find(node => node.textContent?.trim() === "Result");
  const input = label && document.getElementById(label.htmlFor);
  if (!input) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, "96.4");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
assert.equal(changed, true, "existing detailed-screen activity should be editable in Guided");
await evaluate(`Array.from(document.querySelectorAll("button")).find(node => node.textContent?.includes("Done"))?.click()`);
await evaluate(`document.querySelector('[data-testid="button-save-draft"]')?.click()`);
await waitFor("(window.__DprSiteFixture?.dprDraftPayloads?.length ?? 0) > 0");
const saved = await evaluate(`window.__DprSiteFixture.dprDraftPayloads.at(-1)`);
assert.equal(saved.siteActivities.length, 5);
assert.equal(saved.siteActivities[0].persistedId, 24801);
assert.equal(String(saved.siteActivities[0].resultValue), "96.4");
assert.deepEqual(
  [...new Set(saved.siteActivities.map(row => row.activityType))].sort(),
  ["levels", "office", "other", "test", "visit"],
);

await navigate(guidedUrl);
await waitFor("document.body.innerText.includes('96.4')");
assert.equal(await evaluate(`window.__DprSiteFixture.dprActivity02Draft.siteActivities.length`), 5);
await capture("dpr-activity-02-site-activities-reloaded-phone.png");

for (let step = 0; step < 4; step++) {
  await evaluate(`document.querySelector('[data-testid="button-step-next"]')?.click()`);
  await sleep(150);
}
await waitFor("!!document.querySelector('[data-testid=\"card-review\"]') && !!document.querySelector('[data-testid=\"dpr-site-activities-readonly\"]')");
await evaluate(`document.querySelector('[data-testid="dpr-site-activities-readonly"]')?.scrollIntoView({block:"center"})`);
await sleep(150);
await capture("dpr-activity-02-review-phone.png");

const submitDisabled = await evaluate(`document.querySelector('[data-testid="button-submit"]')?.disabled`);
assert.equal(submitDisabled, false, "fixture DPR should be submit-ready");
await evaluate(`document.querySelector('[data-testid="button-submit"]')?.click()`);
await waitFor("(window.__DprSiteFixture?.dprSubmitPayloads?.length ?? 0) > 0");
const submitted = await evaluate(`window.__DprSiteFixture.dprActivity02Draft`);
assert.equal(submitted.dprStatus, "submitted");
assert.equal(submitted.siteActivities.length, 5);

await socket.close();
console.log("Guided Site activities save, reload, review and submit checks passed; five phone screenshots captured.");
