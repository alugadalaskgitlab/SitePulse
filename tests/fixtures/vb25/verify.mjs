import { mkdirSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

const vitePort = Number(process.env.VITE_PORT || 4198);
const cdpPort = Number(process.env.CDP_PORT || 9348);
const evidenceDir = "screenshots/vb25";
mkdirSync(evidenceDir, { recursive: true });
const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = targets.find(target => target.type === "page");
if (!page) throw Error("No Chromium page target");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
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
const quote = JSON.stringify;
const node = id => `document.querySelector('[data-testid=${quote(id)}]')`;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const waitFor = async (expression, label, attempts = 400) => {
  for (let i = 0; i < attempts; i++) {
    try { if (await evaluate(`!!(${expression})`)) return; } catch {}
    await sleep(50);
  }
  throw Error(`Timed out waiting for ${label}`);
};
const click = async id => {
  await waitFor(node(id), id);
  assert(await evaluate(`(() => { const n=${node(id)}; if(n.disabled)return false;n.click();return true })()`), `Could not click ${id}`);
  await sleep(100);
};
const input = async (id, value) => {
  await waitFor(node(id), id);
  await evaluate(`(() => { const n=${node(id)};Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(n,${quote(value)});n.dispatchEvent(new Event("input",{bubbles:true}));n.dispatchEvent(new Event("change",{bubbles:true})) })()`);
};
const select = async (id, label) => {
  await click(id);
  const option = `[...document.querySelectorAll('[role="option"]')].find(n=>n.textContent.trim()===${quote(label)})`;
  await waitFor(option, `${label} option`);
  await evaluate(`${option}.click()`);
  await sleep(100);
};
const text = id => evaluate(`${node(id)}?.innerText||""`);
const value = id => evaluate(`${node(id)}?.value??""`);
const screenshot = async name => {
  await sleep(200);
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const path = `${evidenceDir}/${name}.png`;
  writeFileSync(path, Buffer.from(result.data, "base64"));
  return path;
};
const focus = async id => { await evaluate(`${node(id)}?.scrollIntoView({block:"center"})`); await sleep(150); };
const load = async path => {
  await cdp("Page.navigate", { url: `http://127.0.0.1:${vitePort}${path}` });
  await waitFor(node("vb25-disclosure"), "fixture disclosure");
};
const startBill = async (vendor, site = "ALL SITES") => {
  await load("/plant/vendor-bills");
  await click("button-new-bill");
  await input("input-period-from", "2027-03-01");
  await input("input-period-to", "2027-03-05");
  await select("select-bill-site", site);
  await click("button-show-vendors");
  await waitFor(node(`button-select-vendor-${vendor}`), vendor);
  await click(`button-select-vendor-${vendor}`);
  await waitFor(node("button-auto-populate"), "pull all");
};
const pull = async (vendor, site = "ALL SITES") => {
  await startBill(vendor, site);
  await click("button-auto-populate");
  await waitFor(node("text-item-desc-0"), "pulled item");
  return { qty: await value("input-item-qty-0"), unit: await text("select-item-unit-0"), rate: await value("input-item-rate-0") };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const shots = [];

await startBill("VB25 REGULAR VENDOR", "VB25 NORTH SITE");
assert((await text("button-auto-populate")).includes("1 ITEM"), "A specific site did not restrict pull to one north item");
await focus("select-bill-site");
shots.push(await screenshot("A-specific-site-restricts-item-pull"));

await startBill("VB25 REGULAR VENDOR");
assert((await text("button-auto-populate")).includes("3 ITEMS"), "B all-sites did not retain all items");
await focus("select-bill-site");
shots.push(await screenshot("B-all-sites-preserves-cross-site-pull"));

await load("/plant/vendor-bills?site=VB25%20NORTH%20SITE");
await waitFor(node("card-bill-2501"), "deep-linked matching bill");
assert(!await evaluate(`!!${node("card-bill-2503")}`), "C south-only bill leaked through north filter");
assert((await text("filter-site")).includes("VB25 NORTH SITE"), "C deep link did not populate visible site filter");
await focus("filter-site");
shots.push(await screenshot("C-management-deep-link-visible-site-filter"));

const regular = await pull("VB25 REGULAR VENDOR", "VB25 NORTH SITE");
assert(Number(regular.qty) === 1 && regular.unit.includes("TRIP") && Number(regular.rate) === 800, `D conversion mismatch ${JSON.stringify(regular)}`);
assert(Number(regular.qty) * Number(regular.rate) === 800, "D total is not 800");
await focus("text-item-desc-0");
shots.push(await screenshot("D-regular-600CFT-to-1TRIP-rate800-total800"));

const legacy = await pull("VB25 LEGACY EXPLICIT", "VB25 NORTH SITE");
assert(Number(legacy.qty) === 1 && legacy.unit.includes("TRIP") && Number(legacy.rate) === 800, "E explicit-unit legacy card was not safely converted");
await focus("text-item-desc-0");
shots.push(await screenshot("E1-legacy-key-explicit-unit-safe-conversion"));
const blank = await pull("VB25 BLANK UNIT", "VB25 NORTH SITE");
assert(Number(blank.qty) === 600 && blank.unit.includes("CFT") && Number(blank.rate || 0) === 0, "E blank-unit legacy card was guessed");
await focus("text-item-desc-0");
shots.push(await screenshot("E2-blank-unit-legacy-card-no-guess"));

const unsupported = await pull("VB25 UNSUPPORTED MT", "VB25 NORTH SITE");
assert(Number(unsupported.qty) === 600 && unsupported.unit.includes("CFT") && Number(unsupported.rate || 0) === 0, "E unsupported CFT-to-MT conversion was guessed");
const unsupportedToasts = JSON.parse(await evaluate("JSON.stringify(window.__VB22Fixture.toastMessages)"));
assert(unsupportedToasts.some(message => String(message.title).includes("Manual conversion needed") && String(message.description).includes("rate ₹0")), "E unsupported conversion did not surface the manual-conversion notice");
await focus("text-item-desc-0");
shots.push(await screenshot("E3-unsupported-CFT-to-MT-retained-rate0-manual"));

const source = await pull("VB25 MATERIAL SOURCE", "VB25 NORTH SITE");
assert(Number(source.qty) === 1 && source.unit.includes("TRIP") && Number(source.rate) === 800, "F VB22 source-role regression");
await focus("text-item-desc-0");
shots.push(await screenshot("F-material-source-conversion-regression-safe"));

await load("/plant/vendor-bills");
await waitFor(node("card-bill-2501"), "trip-heavy bill");
await click("card-bill-2501");
await waitFor(node("text-detail-total"), "trip detail");
assert((await text("text-detail-total")).includes("84,000"), "G trip grand total is not 84,000");
assert(await evaluate("document.querySelectorAll('[data-testid^=\"row-date-group-detail-all-\"]').length===3"), "G expected three date groups");
assert(!await evaluate(`!!${node("text-detail-item-desc-0")}`), "G 105-item bill did not auto-collapse");
await focus("date-group-controls");
shots.push(await screenshot("G-105-trips-date-groups-collapsed-subtotals-grand-total"));
await click("button-expand-all-dates");
await waitFor(node("text-detail-item-desc-0"), "expanded trip rows");
shots.push(await screenshot("I1-read-only-expand-all"));
await click("button-collapse-all-dates");
await waitFor(`!${node("text-detail-item-desc-0")}`, "collapsed trip rows");

await load("/plant/vendor-bills");
await click("card-bill-2502");
await waitFor(node("text-detail-total"), "combined detail");
await waitFor("document.body.innerText.includes('DPR SITE LABOUR')&&document.body.innerText.includes('PLANT SHIFT MANPOWER')", "combined labour subgroups");
const detailBody = await evaluate("document.body.innerText");
assert(detailBody.includes("EQUIPMENT") && detailBody.includes("MATERIAL") && detailBody.includes("LABOUR"), "H category bands missing");
assert((await text("text-detail-total")).includes("9,500"), "H combined total incorrect");
await focus("date-group-controls");
shots.push(await screenshot("H-combined-category-and-labour-nesting-totals"));
await focus("badge-detail-labour-source-plant");
shots.push(await screenshot("H2-labour-source-date-nesting-and-subtotals"));
await click("button-edit-bill");
await waitFor(node("text-form-title"), "combined edit view");
assert((await text("text-form-title")).includes("EDIT"), "I edit view unavailable");
assert(await evaluate("document.querySelectorAll('[data-testid^=\"row-date-group-edit-\"]').length>=3"), "I edit date groups missing");
await click("button-collapse-all-dates");
await focus("date-group-controls");
shots.push(await screenshot("I2-edit-view-collapse-all-category-labour-preserved"));

const state = JSON.parse(await evaluate("JSON.stringify(window.__VB25Fixture)"));
assert(state.requests.every(request => request.method === "GET" || request.path === "/api/vendor-bills/check-duplicates"), "Unexpected fixture write request");
const evidence = {
  scenario: "VB-25 actual VendorBills isolated browser fixture",
  disclosure: state.isolation,
  mounted: "client/src/pages/VendorBills.tsx",
  screenshots: shots,
  verified: {
    A_specificSitePullCount: 1,
    B_allSitesPullCount: 3,
    C_deepLinkAndVisibleFilter: true,
    D_regularConversion: { logged: "600 CFT", billed: "1 TRIP", rate: 800, total: 800 },
    E_legacyExplicitUnit: { billed: "1 TRIP", rate: 800 },
    E_blankUnitNoGuess: { billed: "600 CFT", rate: 0 },
    E_unsupportedAlternateUnitGuard: { logged: "600 CFT", alternateCard: "MT", retainedRate: 0, manualConversionToast: true },
    F_materialSourceRegression: { billed: "1 TRIP", rate: 800 },
    G_tripRows: 105,
    G_dateGroups: 3,
    G_grandTotal: 84000,
    H_categoryBands: ["equipment", "material", "labour"],
    H_labourGroups: ["DPR Site Labour", "Plant Shift Manpower", "Manual / Other"],
    H_grandTotal: 9500,
    I_readOnlyAndEditExpandCollapse: true,
  },
  interceptedRequests: state.requests.length,
  writeRequests: [],
  audit: "Synthetic fixture cannot audit live records; no live database was read by design.",
};
writeFileSync(`${evidenceDir}/evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
socket.close();