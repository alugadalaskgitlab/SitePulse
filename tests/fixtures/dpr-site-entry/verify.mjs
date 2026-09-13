/*
 * Isolated DPR + Plant Equipment browser evidence.
 *
 * Run with the fixture Vite server on port 4178 and Chromium's CDP endpoint
 * on port 9222, for example:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178
 *   node tests/fixtures/dpr-site-entry/verify.mjs
 *
 * The script deliberately drives the rendered controls rather than calling
 * React handlers.  All API writes remain in the fixture's in-memory fetch
 * adapter and are asserted through window.__DprSiteFixture.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = "http://127.0.0.1:4178";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
if (!page) throw new Error("Chromium did not expose a page target on CDP port 9222");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});

let sequence = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (message.method === "Page.javascriptDialogOpening") {
    void cdp("Page.handleJavaScriptDialog", { accept: true });
  }
  if (message.method === "Runtime.exceptionThrown") {
    console.error(`Browser exception: ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`);
  }
  if (!message.id || !pending.has(message.id)) return;
  const callback = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
});

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method} ${JSON.stringify(params).slice(0, 250)}`)); }, 20000);
  pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(new Error(`${method}: ${error.message}`)); } });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitFor = async (expression, label, attempts = 200) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const bodyText = () => evaluate("document.body.innerText");

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not click [data-testid=${testId}]`);
};

const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node) return false;
    const proto = node instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(node, ${quote(value)});
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};

const clickOptionContaining = async (text) => {
  const clicked = await evaluate(`(() => {
    const wanted = ${quote(text)}.toLowerCase();
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const node = options.find(candidate => (candidate.textContent || "").toLowerCase().includes(wanted));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not select option containing ${text}`);
};

const selectOption = async (testId, text) => {
  await clickTestId(testId);
  await waitFor(
    `Array.from(document.querySelectorAll('[role="option"]')).some(node => (node.textContent || "").toLowerCase().includes(${quote(text.toLowerCase())}))`,
    `${testId} option ${text}`,
  );
  await clickOptionContaining(text);
  await sleep(80);
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const fixtureState = () => evaluate("window.__DprSiteFixture || null");

const navigate = async (pathName, width = 1440, height = 900, mobile = false) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await cdp("Page.enable");
  await cdp("Page.navigate", { url: `${baseUrl}${pathName}` });
  await waitFor("document.readyState === 'complete'", `${pathName} document`);
};

const prepareDprHeader = async () => {
  await navigate("/site/new", 1440, 900, false);
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", "DPR report header");
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", "DPR engineer selector");
  await setInput("input-date", "2026-08-05");
  await selectOption("select-engineer", "SURESH KUMAR");
  await waitFor("!!document.querySelector('[data-testid=\"checkbox-no-site-work-0\"]')", "DPR no-site-work control");
  await clickTestId("checkbox-no-site-work-0");
};

const selectDprEquipment = async (index, label) => {
  await selectOption(`select-equipment-${index}`, label);
  await waitFor(
    `!!document.querySelector('[data-testid="equipment-row-${index}"] [data-testid="input-equipment-opening-${index}"]')`,
    `DPR equipment row ${index}`,
  );
};

const verifyDprDieselDraft = async () => {
  await prepareDprHeader();

  // A — Plant stock, positive quantity with missing physical observations:
  // Save Draft must reject it through the rendered validation path.
  await selectDprEquipment(0, "JCB 3DX");
  await selectOption("select-diesel-source-0", "Plant Stock");
  await setInput("input-equipment-diesel-0", "20");
  await setInput("input-equipment-opening-0", "100");
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft\"]')", "DPR incomplete draft action");
  await clickTestId("button-save-draft");
  await sleep(120);
  let state = await fixtureState();
  assert(state.dprDraftPayloads.length === 0, "DPR accepted positive stock diesel without tank readings");
  assert(
    String(state.toasts.at(-1)?.title || "").includes("Diesel tank balance required"),
    "DPR missing tank readings did not show the validation toast",
  );

  // Fill zero values deliberately: zero is a valid physical observation.
  await setInput("input-opening-diesel-0", "0");
  await setInput("input-diesel-balance-0", "0");
  await clickTestId("checkbox-diesel-balance-confirmed-0");
  await setInput("input-equipment-opening-0", "100");
  await setInput("input-equipment-closing-0", "108");
  await waitFor("!!document.querySelector('[data-testid=\"panel-actual-consumption-0\"]')", "DPR tank visible panel");
  const stockVisibleImage = await capture("dpr-diesel-stock-tank-visible");

  // B — contractor fuel remains positive, but source-specific tank inputs
  // must disappear and the issued quantity must survive normalization.
  await clickTestId("button-add-equipment");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-row-1\"]')", "DPR contractor equipment row");
  await selectDprEquipment(1, "Water Tanker");
  await selectOption("select-diesel-source-1", "Contractor");
  await setInput("input-equipment-diesel-1", "6");
  await setInput("input-equipment-opening-1", "200");
  await setInput("input-equipment-closing-1", "210");
  await waitFor("!document.querySelector('[data-testid=\"equipment-tank-balance-1\"]')", "DPR contractor tank fields hidden");
  const contractorHiddenImage = await capture("dpr-diesel-contractor-tank-hidden");

  // D — direct purchase fields are source-specific and must retain their
  // uppercase station/bill values and numeric amount.
  await clickTestId("button-add-equipment");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-row-2\"]')", "DPR direct-purchase equipment row");
  await selectDprEquipment(2, "JCB 3DX");
  await selectOption("select-diesel-source-2", "Direct Site Purchase");
  await setInput("input-equipment-diesel-2", "7");
  await setInput("input-equipment-opening-2", "300");
  await setInput("input-equipment-closing-2", "308");
  await setInput("input-fuel-station-2", "hp central");
  await setInput("input-bill-number-2", "bill-42");
  await setInput("input-amount-paid-2", "1250");

  // F — stock source with a zero issued quantity is exempt from tank
  // observations. Leave its tank controls blank and still save successfully.
  await clickTestId("button-add-equipment");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-row-3\"]')", "DPR zero-stock equipment row");
  await selectDprEquipment(3, "Water Tanker");
  await selectOption("select-diesel-source-3", "Plant Stock");
  await setInput("input-equipment-diesel-3", "0");
  await setInput("input-equipment-opening-3", "400");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-tank-balance-3\"]')", "DPR zero-stock tank controls");
  assert(
    await evaluate("document.querySelector('[data-testid=\"input-opening-diesel-3\"]')?.value === ''"),
    "zero-stock row unexpectedly received an opening tank value",
  );

  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft\"]')", "DPR valid draft action");
  await clickTestId("button-save-draft");
  await waitFor("window.__DprSiteFixture?.dprDraftPayloads.length >= 1", "DPR diesel draft mutation");
  state = await fixtureState();
  const draft = state.dprDraftPayloads.at(-1).payload;
  const stock = draft.equipment.find((row) => row.dieselSource === "plant_stock" && row.diesel === 20);
  const contractor = draft.equipment.find((row) => row.dieselSource === "contractor");
  const direct = draft.equipment.find((row) => row.dieselSource === "direct_purchase");
  const zero = draft.equipment.find((row) => row.dieselSource === "plant_stock" && row.diesel === 0);
  assert(stock?.openingDiesel === 0 && stock?.dieselBalanceInTank === 0, "DPR zero tank observations were not retained");
  assert(contractor?.diesel === 6 && contractor?.openingDiesel == null && contractor?.dieselBalanceInTank == null, "DPR contractor quantity/tanks were not normalized correctly");
  assert(direct?.fuelStation === "HP CENTRAL" && direct?.billNumber === "BILL-42" && direct?.amountPaid === 1250, "DPR direct-purchase details were not retained");
  assert(zero?.diesel === 0 && zero?.openingDiesel == null && zero?.dieselBalanceInTank == null, "DPR zero-stock row did not save without tank readings");
  return { stockVisibleImage, contractorHiddenImage, payload: draft };
};

const verifySiteEdit = async () => {
  await navigate("/site/edit/6101?complete=1", 1440, 900, false);
  await waitFor("!!document.querySelector('[data-testid=\"button-save\"]')", "DPR edit form");
  await waitFor("!!document.querySelector('[data-testid=\"input-opening-diesel-0\"]')", "seed DPR tank controls");
  await evaluate(`(() => {
    const summary = document.querySelector('[data-testid="equipment-row-0"] details summary');
    if (!summary) return false;
    summary.click();
    return true;
  })()`);
  await waitFor("document.querySelector('[data-testid=\"equipment-row-0\"] details')?.open === true", "SiteEdit tank fields");
  assert(
    await evaluate("document.querySelector('[data-testid=\"input-opening-diesel-0\"]')?.disabled === false"),
    "SiteEdit linked plant row incorrectly locked its opening tank balance",
  );
  await setInput("input-opening-diesel-0", "32");
  const image = await capture("dpr-edit");
  await clickTestId("button-save");
  await waitFor("window.__DprSiteFixture?.dprVersionPayloads.length >= 1", "DPR version mutation");
  const version = (await fixtureState()).dprVersionPayloads.at(-1);
  assert(version.id === 6101, `DPR version source id was ${version.id}`);
  assert(version.payload?.data?.equipment?.[0]?.plantUsageId === 8101, "SiteEdit dropped the linked plant usage id");
  assert(version.payload?.data?.equipment?.[0]?.openingReading === 100 && version.payload?.data?.equipment?.[0]?.closingReading === 108, "SiteEdit changed the existing meter readings");
  assert(version.payload?.data?.equipment?.[0]?.openingDiesel === 32, "SiteEdit opening tank balance was not saved");
  return { image, sourceId: version.id, payload: version.payload };
};

const openPlantEntry = async () => {
  await clickTestId("button-add-usage");
  await waitFor("!!document.querySelector('[data-testid=\"button-save-usage\"]')", "Plant usage dialog");
};

const selectPlantEquipment = async (label) => {
  await selectOption("select-equipment", label);
  // The previous-balance request is intentionally asynchronous.  Waiting for
  // the opening field before writing it prevents a late response from
  // replacing the value entered by this scenario.
  await waitFor("!document.querySelector('[data-testid=\"input-opening-reading\"]')?.disabled", "Plant opening meter");
  await waitFor("!document.querySelector('[data-testid=\"input-opening-diesel\"]')?.disabled", "Plant opening diesel");
};

const verifyPlantAStockPositive = async () => {
  await navigate("/plant/equipment-usage?plant=HMP%20PLANT", 1440, 900, false);
  await waitFor("!!document.querySelector('[data-testid=\"button-add-usage\"]')", "Plant usage page");
  await openPlantEntry();
  await setInput("input-usage-date", "2026-08-05");
  await selectPlantEquipment("JCB 3DX");
  await setInput("input-opening-reading", "100");
  await setInput("input-closing-reading", "108");
  await selectOption("select-diesel-source", "Plant Stock");
  await setInput("input-opening-diesel", "50");
  await setInput("input-diesel-issued", "30");
  // Positive plant-stock diesel must not be accepted without the physical
  // tank observations.  This is a real click on Save, not a direct handler
  // call, and gives the fixture evidence for the validation branch.
  await clickTestId("button-save-usage");
  await sleep(120);
  const invalidState = await fixtureState();
  assert(invalidState.plantCreatePayloads.length === 0, "positive diesel bypassed tank validation");
  assert(
    String(invalidState.toasts.at(-1)?.title || "").includes("Diesel Balance in Tank"),
    "positive diesel validation toast was not shown",
  );
  await setInput("input-diesel-balance", "40");
  await clickTestId("checkbox-diesel-balance-confirmed");
  await waitFor("!!document.querySelector('[data-testid=\"panel-actual-consumption\"]')", "Plant tank panel");
  const tankVisibleImage = await capture("plant-a-tank-visible");
  await clickTestId("button-save-usage");
  await waitFor("window.__DprSiteFixture?.plantCreatePayloads.length >= 1", "Plant completed create");
  const payload = (await fixtureState()).plantCreatePayloads.at(-1);
  assert(payload.openingReading === 100 && payload.closingReading === 108, "Plant meter create payload was incorrect");
  assert(payload.dieselSource === "plant_stock", "Plant stock source was not serialized");
  assert(payload.dieselBalanceInTank === 40, "Plant tank balance was not serialized");
  return { tankVisibleImage, payload };
};

const verifyPlantBContractorPositive = async () => {
  await openPlantEntry();
  await setInput("input-usage-date", "2026-08-06");
  await selectPlantEquipment("JCB 3DX");
  await setInput("input-opening-reading", "108");
  await setInput("input-closing-reading", "112");
  await selectOption("select-diesel-source", "Contractor Provided");
  await setInput("input-diesel-issued", "2");
  await waitFor("!document.querySelector('[data-testid=\"input-diesel-balance\"]')", "contractor tank fields hidden");
  const tankHiddenImage = await capture("plant-b-contractor-tank-hidden");
  await clickTestId("button-save-usage");
  await waitFor("window.__DprSiteFixture?.plantCreatePayloads.length >= 2", "Plant contractor create");
  const payload = (await fixtureState()).plantCreatePayloads.at(-1);
  assert(payload.dieselIssued === 2, "Plant contractor positive diesel quantity was not retained");
  assert(payload.dieselIncluded === true && payload.dieselSource === "contractor", "Plant contractor source was not serialized");
  assert(payload.openingDiesel === null && payload.dieselBalanceInTank === null, "Plant contractor payload retained hidden tank values");
  return { tankHiddenImage, payload };
};

const verifyPlantCStockZero = async () => {
  await openPlantEntry();
  await setInput("input-usage-date", "2026-08-07");
  await selectPlantEquipment("JCB 3DX");
  await setInput("input-opening-reading", "112");
  await setInput("input-closing-reading", "116");
  await selectOption("select-diesel-source", "Plant Stock");
  await setInput("input-diesel-issued", "0");
  await waitFor("!!document.querySelector('[data-testid=\"input-diesel-balance\"]')", "zero-stock tank controls");
  assert(
    await evaluate("document.querySelector('[data-testid=\"input-diesel-issued\"]')?.value === '0'"),
    "Plant zero-stock scenario unexpectedly received positive diesel",
  );
  await clickTestId("button-save-usage");
  await waitFor("window.__DprSiteFixture?.plantCreatePayloads.length >= 3", "Plant zero-stock create");
  const payload = (await fixtureState()).plantCreatePayloads.at(-1);
  assert(payload.dieselIssued === 0, "Plant zero-stock diesel was not normalized to zero");
  assert(payload.dieselBalanceInTank === null, "Plant zero-stock incorrectly required a tank balance");
  return payload;
};

await cdp("Runtime.enable");
const dieselDraft = await verifyDprDieselDraft();
const edit = await verifySiteEdit();
const plantA = await verifyPlantAStockPositive();
const plantB = await verifyPlantBContractorPositive();
const plantC = await verifyPlantCStockZero();
const state = await fixtureState();

assert(state.requests.some((request) => request.path === "/api/plant-module/equipment-usage" && request.method === "POST"), "Plant POST was not observed");

console.log(JSON.stringify({
  scenario: "DPR + Plant Equipment isolated browser fixture",
  server: { baseUrl, cdp: "127.0.0.1:9222" },
  evidenceDirectory: evidenceDir,
  dieselDraft,
  edit,
  plant: {
    A_stockPositive: plantA,
    B_contractorPositive: plantB,
    C_stockZeroExempt: plantC,
  },
  writes: {
    dprDrafts: 1,
    dprVersions: 1,
    plantCreates: state.plantCreatePayloads.length,
  },
}, null, 2));

socket.close();