import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = "http://127.0.0.1:4182";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const target = await (await fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let seq = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const msg = JSON.parse(raw);
  if (!msg.id || !pending.has(msg.id)) return;
  const p = pending.get(msg.id);
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const assert = (value, message) => { if (!value) throw new Error(message); };
const waitFor = async (expression, label) => {
  // First-load Vite transformation includes the real dashboard/report modules.
  for (let i = 0; i < 600; i += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out: ${label}`);
};
const navigate = async (pathname, width = 1440, height = 1000) => {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
  await cdp("Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitFor("document.readyState === 'complete' && !!document.querySelector('[data-testid=\"fixture-host\"]')", pathname);
};
const screenshot = async (name) => {
  const data = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: true });
  const file = path.join(evidenceDir, `${name}.png`);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  return file;
};
const input = async (testId, value) => {
  await evaluate(`(() => {
    const el = document.querySelector('[data-testid="${testId}"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
};
const cards = () => evaluate("[...document.querySelectorAll('[data-testid^=\"card-report-\"]')].map(x => x.getAttribute('data-testid'))");

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.clear(); sessionStorage.clear();" });

await navigate("/site/reports");
await waitFor("document.querySelectorAll('[data-testid^=\"card-report-\"]').length === 3", "three references");
for (const id of [338, 349, 350]) {
  assert(await evaluate(`document.querySelector('[data-testid="reference-dpr-${id}"]')?.textContent.trim() === 'DPR-${id}'`), `DPR-${id} list reference missing`);
}
await input("input-dpr-reference", "349");
await waitFor("document.querySelectorAll('[data-testid^=\"card-report-\"]').length === 1", "numeric search");
assert(JSON.stringify(await cards()) === JSON.stringify(["card-report-349"]), "numeric search did not target actual id 349");

await navigate("/site/reports?site=REFERENCE%20NORTH");
await waitFor("document.querySelectorAll('[data-testid^=\"card-report-\"]').length === 2", "site intersection baseline");
await input("input-dpr-reference", "DPR-350");
await waitFor("document.body.innerText.includes('No Reports Found')", "site/reference empty intersection");
await input("input-dpr-reference", "DPR-349");
await waitFor("!!document.querySelector('[data-testid=\"card-report-349\"]')", "prefixed search intersection");
assert((await cards()).length === 1, "DPR- reference and site filters did not intersect");
await evaluate("document.querySelector('[data-testid=\"button-view-349\"]').click()");
await waitFor("location.pathname === '/site/report/349'", "View route");
assert(await evaluate("document.body.innerText.includes('DPR-349')"), "SiteReport did not show actual DPR-349 reference");
assert(await evaluate("!!document.querySelector('[data-testid=\"fixture-host\"]')"), "fixture host was lost on dashboard route navigation");
const desktop = await screenshot("dpr-reference-desktop-site-report-349");

await navigate("/dpr/349");
await waitFor("document.body.innerText.includes('Report Details')", "generic detail");
assert(await evaluate("document.body.innerText.includes('DPR-349')"), "generic DprDetails reference missing");

await navigate("/overlap");
await evaluate("document.querySelector('[data-testid=\"reference-fixture-overlap-dpr-link-0\"]').click()");
await waitFor("!!document.querySelector('[data-testid=\"dpr-preview-dialog\"]') && document.body.innerText.includes('DPR-349')", "matching overlap preview");
assert(await evaluate("!!document.querySelector('[data-testid=\"dpr-preview-highlight-row\"]')"), "matching entry 3490 not highlighted");
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
await waitFor("!document.querySelector('[data-testid=\"dpr-preview-dialog\"]')", "preview close");
assert(await evaluate("document.querySelector('[data-testid=\"host-retained-value\"]').value === 'Host value retained'"), "closing preview did not retain host state");

await navigate("/site/reports?reference=349", 390, 844);
await waitFor("!!document.querySelector('[data-testid=\"reference-dpr-349\"]')", "mobile reference");
const mobileVisible = await evaluate(`(() => {
  const el = document.querySelector('[data-testid="reference-dpr-349"]');
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.left >= 0 && r.right <= innerWidth;
})()`);
assert(mobileVisible, "DPR-349 reference is not visible at 390px");
const mobile = await screenshot("dpr-reference-mobile-390");
const state = await evaluate("window.__DprReferenceFixture");
assert(state.writes.length === 0, `fixture emitted writes: ${JSON.stringify(state.writes)}`);

console.log(JSON.stringify({
  scenario: "Task1482 DPR reference browser fixture",
  assertions: {
    list: "DPR-338, DPR-349, DPR-350 use exact saved row ids",
    searches: "numeric and DPR- forms intersect with site filter",
    routes: "View opens /site/report/349; generic /dpr/349 shows the same reference",
    overlap: "DPR-349 opens in read-only preview, highlights entry 3490, and close retains host",
    responsive: "reference visible at desktop and 390px",
    writes: state.writes,
  },
  screenshots: { desktop, mobile },
}, null, 2));
socket.close();