/*
 * LABOUR-01 isolated real-page verifier. Parent starts fixture Vite :4178
 * and Chromium CDP :9222. Synthetic responses/sessionStorage only.
 * Run: node tests/fixtures/dpr-site-entry/verify-labour01.mjs
 */
import WebSocket from "ws";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
const target = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let serial = 0;
let stage = "initial";
const pending = new Map(), exceptions = [];
socket.on("message", raw => {
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
  const item = pending.get(message.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(message.id);
  message.error ? item.reject(new Error(`${item.method}: ${message.error.message}`)) : item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timeout ${method} at ${stage}; ${JSON.stringify(params).slice(0, 400)}`)), 25000);
    pending.set(id, { method, resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 240; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}; ${JSON.stringify(await evaluate("({route:location.href,body:document.body.innerText.slice(-2000),requests:window.__DprSiteFixture?.requests.slice(-5),toasts:window.__DprSiteFixture?.toasts})"))}; exceptions=${JSON.stringify(exceptions)}`);
}
function check(value, message, details) {
  if (!value) throw new Error(`${message}: ${JSON.stringify(details)}`);
}
async function navigate(path) {
  stage = `navigate ${path}`;
  await call("Page.navigate", { url: base + path });
  await wait("document.readyState === 'complete' && !!window.__DprSiteFixture");
}
async function click(selector) {
  stage = `click ${selector}`;
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function select(selector, label) {
  await click(selector);
  await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(node=>node.textContent.includes(${JSON.stringify(label)}))`);
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(node=>node.textContent.includes(${JSON.stringify(label)})).click()`);
}
async function fill(selector, value) {
  stage = `fill ${selector}`;
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`(() => {
    const node=document.querySelector(${JSON.stringify(selector)});
    const proto=node.tagName==='TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(node,${JSON.stringify(value)});
    node.dispatchEvent(new Event('input',{bubbles:true}));
    node.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
}
async function screenshot(name, selector = '[data-testid="labour-workers-0"], [data-testid="labour-worker-names"]') {
  await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
  await new Promise(resolve => setTimeout(resolve, 150));
  const data = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`tests/fixtures/dpr-site-entry/evidence/${name}.png`, Buffer.from(data.data, "base64"));
}
const id = 6351;
const resultPath = "tests/fixtures/dpr-site-entry/evidence/labour01-result.json";
const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, "utf8")) : {};
mkdirSync("tests/fixtures/dpr-site-entry/evidence", { recursive: true });
async function workerRow(index) {
  await wait(`!!document.querySelector('[data-testid="labour-workers-${index}"]')`);
  return `[data-testid="labour-workers-${index}"]`;
}
async function editAndSave(page, viewport) {
  console.log("Checking", page, viewport);
  const route = page === "guided"
    ? `/guided?draftId=${id}&section=labour&dpr16b2=1&labour01=1&labour01stay=1`
    : `/site/edit/${id}?dpr16b2=1&labour01=1&labour01stay=1`;
  await navigate(`${route}&labour01seed=1`);
  await navigate(route);
  await workerRow(0);
  await workerRow(1);
  check(await evaluate("document.querySelector('[data-testid=\"labour-workers-0\"] button')?.textContent.includes('Worker names (2)')"), `${page}/${viewport}: persisted names summary missing`);
  check(await evaluate("!document.querySelector('[data-testid=\"labour-workers-editor-0\"]')"), `${page}/${viewport}: names should be collapsed initially`);
  check(await evaluate("document.querySelector('[data-testid=\"labour-workers-1\"] button')?.textContent.includes('Add worker names')"), `${page}/${viewport}: count-only historical row not empty`);
  await click('[data-testid="button-labour-workers-0"]');
  await wait("!!document.querySelector('[data-testid=\"input-labour-worker-0-1\"]')");
  await fill('[data-testid="input-labour-worker-0-0"]', "Raju Fixture Edited");
  await click('[data-testid="button-remove-labour-worker-0-1"]');
  await click('[data-testid="button-add-labour-worker-0"]');
  await fill('[data-testid="input-labour-worker-0-1"]', "Lata Fixture");
  await click('[data-testid="button-add-labour-worker-0"]');
  await fill('[data-testid="input-labour-worker-0-2"]', "Third Fixture");
  await wait("!!document.querySelector('[data-testid=\"labour-workers-0\"] [role=\"status\"]')");
  const geometry = await evaluate(`(() => {
    const root=document.querySelector('[data-testid="labour-workers-0"]');
    const row=root?.closest('[data-testid^="labour-row-"]');
    return { viewport:innerWidth, documentWidth:document.documentElement.scrollWidth,
      row:row?.getBoundingClientRect().toJSON(),
      controls:[...root.querySelectorAll('input,button')].map(n=>({label:n.getAttribute('aria-label')||n.textContent.trim(),...n.getBoundingClientRect().toJSON()})) };
  })()`);
  check(geometry.row && geometry.controls.length >= 4, `${page}/${viewport}: worker editor controls absent`, geometry);
  check(geometry.controls.every(c => c.width >= 35 && c.height >= 35 && c.right <= geometry.viewport + 2 && c.left >= -2), `${page}/${viewport}: worker controls clipped/mobile hit target`, geometry);
  check(geometry.controls.filter(c => c.label?.startsWith("Remove worker name")).every(c => c.width >= 44 && c.height >= 44), `${page}/${viewport}: remove target <44px`, geometry);
  await screenshot(`labour01-${page}-${viewport}`);
  const saveSelector = page === "guided" ? '[data-testid="button-save-draft"]' : '[data-testid="button-save-draft-progress"]';
  const previousSaves = await evaluate("window.__DprSiteFixture.draftPayloads.length");
  await click(saveSelector);
  await wait(`window.__DprSiteFixture.draftPayloads.length > ${previousSaves}`);
  const saved = await evaluate("window.__DprSiteFixture.draftPayloads.at(-1)");
  const rows = saved?.payload?.labour;
  check(Array.isArray(rows) && rows[0]?.workerNames?.join("|") === "Raju Fixture Edited|Lata Fixture|Third Fixture",
    `${page}/${viewport}: edited names not sent`, saved);
  check(rows[1]?.workerNames?.length === 0 && Number(rows[1]?.count) === 1,
    `${page}/${viewport}: untouched count-only row changed`, rows);
  check(Number(rows[0]?.count) === 2, `${page}/${viewport}: >count warning changed source-of-truth count`, rows);
  const firstResponse = await evaluate(`window.__DprSiteFixture.dprRecoveryPayloads.at(-1)?.payload?.labour`);
  await wait(`Number(window.__DprSiteFixture.dprRecoveryPayloads.at(-1)?.payload?.labour?.[0]?.id) !== ${Number(rows[0]?.persistedId ?? rows[0]?.id)}`);
  const rotated = await evaluate(`window.__DprSiteFixture.dprRecoveryPayloads.at(-1)?.payload?.labour`);
  check(rotated?.[0]?.id !== rows[0]?.persistedId && rotated?.[0]?.workerNames?.length === 3,
    `${page}/${viewport}: full PATCH must rotate persisted labour parent id`, { request: rows, firstResponse, rotated });
  // Production parks to Field Home on success. The LABOUR-01 fixture holds
  // this form mounted only for the save-pair probe; no reload is allowed.
  const previousRecovery = await evaluate("window.__DprSiteFixture.dprRecoveryPayloads.length");
  const previousDrafts = await evaluate("window.__DprSiteFixture.draftPayloads.length");
  await click(saveSelector);
  await wait(`window.__DprSiteFixture.draftPayloads.length > ${previousDrafts}`);
  await wait(`window.__DprSiteFixture.dprRecoveryPayloads.length > ${previousRecovery}
    || window.__DprSiteFixture.toasts.some(t => String(t.description || '').includes('no longer belongs'))`);
  const consecutive = await evaluate("window.__DprSiteFixture.draftPayloads.at(-1)");
  const secondResponse = await evaluate("window.__DprSiteFixture.dprRecoveryPayloads.at(-1)?.payload?.labour");
  check(await evaluate(`window.__DprSiteFixture.dprRecoveryPayloads.length > ${previousRecovery}`)
    && Number(consecutive?.payload?.labour?.[0]?.persistedId) === rotated[0].id
    && secondResponse[0]?.workerNames?.join("|") === "Raju Fixture Edited|Lata Fixture|Third Fixture"
    && secondResponse[0]?.id !== rotated[0]?.id,
  `${page}/${viewport}: consecutive save reused stale persistedId or lost names`, { consecutive, rotated, secondResponse });
  await navigate(route);
  await workerRow(0);
  await click('[data-testid="button-labour-workers-0"]');
  await wait("document.querySelector('[data-testid=\"input-labour-worker-0-2\"]')?.value === 'Third Fixture'");
  result[`${page}-${viewport}`] = { save: saved, consecutive, geometry };
  if (page === "guided") {
    for (const index of [2, 1, 0]) await click(`[data-testid="button-remove-labour-worker-0-${index}"]`);
    await wait("document.querySelector('[data-testid=\"button-labour-workers-0\"]')?.textContent.includes('Add worker names')");
    const beforeClear = await evaluate("window.__DprSiteFixture.draftPayloads.length");
    await click(saveSelector);
    await wait(`window.__DprSiteFixture.draftPayloads.length > ${beforeClear}`);
    const cleared = await evaluate("window.__DprSiteFixture.draftPayloads.at(-1)");
    check(cleared.payload.labour?.[0]?.workerNames?.length === 0 && Number(cleared.payload.labour[0].count) === 2,
      `${page}/${viewport}: explicit clearing names changed headcount or failed`, cleared);
    await navigate(route);
    await workerRow(0);
    check(await evaluate("document.querySelector('[data-testid=\"button-labour-workers-0\"]')?.textContent.includes('Add worker names')"),
      `${page}/${viewport}: cleared list reappeared after reload`);
    result[`${page}-${viewport}`].cleared = cleared;
  }
}
async function readonly(viewport) {
  console.log("Checking readonly", viewport);
  for (const path of [`/dpr/${id}?dpr16b2=1&labour01=1`, `/site/report/${id}?dpr16b2=1&labour01=1`]) {
    await navigate(path);
    await wait("document.body.textContent.includes('Labour Strength')");
    const snapshot = await evaluate(`(() => ({
      names:[...document.querySelectorAll('[data-testid="labour-worker-names"]')].map(n=>n.textContent.trim()),
      text:document.body.innerText.slice(-1500)
    }))()`);
    check(snapshot.names.some(n => n.includes("Raju Fixture Edited") && n.includes("Third Fixture")),
      `${path}: names absent from real read-only page`, snapshot);
    check(snapshot.names.length === 1, `${path}: count-only row should not show names`, snapshot);
    await screenshot(`labour01-${path.startsWith("/dpr/") ? "details" : "report"}-${viewport}`);
  }
}
async function createEntry(viewport) {
  console.log("Checking entry", viewport);
  const route = "/fixture/dpr16-b2-create?dpr16b2=1&labour01=1";
  await navigate(route);
  await wait("!!document.querySelector('[data-testid=\"button-add-labour\"]')");
  await click('[data-testid="button-add-labour"]');
  await workerRow(0);
  check(await evaluate("!document.querySelector('[data-testid=\"labour-workers-editor-0\"]')"), "SiteEntry: empty names editor must start hidden");
  await select('[data-testid="select-engineer"]', "SURESH KUMAR");
  await select('[data-testid="select-labour-category-0"]', "Skilled");
  await select('[data-testid="select-labour-gender-0"]', "Male");
  await fill('[data-testid="input-labour-count-0"]', "1");
  await click('[data-testid="button-labour-workers-0"]');
  await click('[data-testid="button-add-labour-worker-0"]');
  await fill('[data-testid="input-labour-worker-0-0"]', "Local Fixture");
  // The classic form offers Save Draft only for an unfinished day; a
  // synthetic opening chainage leaves the unrelated activity unfinished.
  await fill('[data-testid="input-progress-from-0"]', "1+000");
  await wait("!!document.querySelector('[data-testid=\"button-save-draft\"]')");
  await screenshot(`labour01-entry-${viewport}`);
  const previous = await evaluate("window.__DprSiteFixture.draftPayloads.length");
  await click('[data-testid="button-save-draft"]');
  await wait(`window.__DprSiteFixture.draftPayloads.length > ${previous}`);
  const saved = await evaluate("window.__DprSiteFixture.draftPayloads.at(-1)");
  check(saved.payload.labour?.[0]?.workerNames?.join("|") === "Local Fixture"
    && Number(saved.payload.labour[0].count) === 1, `SiteEntry/${viewport}: named local labour draft save`, saved);
  result[`entry-${viewport}`] = { save: saved };
}
try {
  await call("Page.enable");
  await call("Runtime.enable");
  for (const [device, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    if (process.env.LABOUR01_DEVICE && process.env.LABOUR01_DEVICE !== device) continue;
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: device === "mobile" });
    await editAndSave("edit", device);
    await readonly(device);
    await editAndSave("guided", device);
    await createEntry(device);
  }
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(`LABOUR-01: isolated real-page checks passed (${Object.keys(result).join(", ")}; current device ${process.env.LABOUR01_DEVICE || "both"})`);
} finally {
  socket.close();
}