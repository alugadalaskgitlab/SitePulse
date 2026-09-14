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

const captureEquipmentEvidence = async (name, index = 0) => {
  const visible = await evaluate(`(() => {
    const node = document.querySelector('[data-testid="equipment-compact-${index}"]')
      || document.querySelector('[data-testid="equipment-row-${index}"]');
    if (!node) return false;
    node.scrollIntoView({ block: "start", inline: "nearest" });
    return true;
  })()`);
  assert(visible, `Could not position equipment row ${index} for ${name}`);
  await sleep(120);
  return capture(name);
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
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-opening-tank-0\"]')", "seed DPR tank controls");
  await evaluate(`(() => {
    const summary = document.querySelector('[data-testid="equipment-row-0"] details summary');
    if (!summary) return false;
    summary.click();
    return true;
  })()`);
  await waitFor("document.querySelector('[data-testid=\"equipment-row-0\"] details')?.open === true", "SiteEdit tank fields");
  assert(
    await evaluate("document.querySelector('[data-testid=\"equipment-compact-opening-tank-0\"]')?.disabled === false"),
    "SiteEdit linked plant row incorrectly locked its opening tank balance",
  );
  await setInput("equipment-compact-opening-tank-0", "32");
  const linkedImage = await captureEquipmentEvidence("diesel02-siteedit-linked-legacy-tank");
  await clickTestId("button-save");
  await waitFor("window.__DprSiteFixture?.dprVersionPayloads.length >= 1", "DPR version mutation");
  const version = (await fixtureState()).dprVersionPayloads.at(-1);
  assert(version.id === 6101, `DPR version source id was ${version.id}`);
  assert(version.payload?.data?.equipment?.[0]?.plantUsageId === 8101, "SiteEdit dropped the linked plant usage id");
  assert(version.payload?.data?.equipment?.[0]?.openingReading === 100 && version.payload?.data?.equipment?.[0]?.closingReading === 108, "SiteEdit changed the existing meter readings");
  assert(version.payload?.data?.equipment?.[0]?.openingDiesel === 32, "SiteEdit opening tank balance was not saved");

  // Primary SiteEdit evidence: an unlinked draft with two hired Daily Hire
  // rows exercises the actual Save Progress and Submit DPR buttons.  It is
  // intentionally separate from the linked legacy row above, whose tank
  // continuity remains covered without making contractor rows look linked.
  await navigate("/site/edit/6203?returnTo=%2Fsite%2Fedit%2F6203", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft-progress\"]')", "SiteEdit draft actions");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-0\"]') && !!document.querySelector('[data-testid=\"equipment-compact-1\"]')", "SiteEdit contractor compact rows");
  await expandGuidedCompact(0);
  await expandGuidedCompact(1);
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-opening-tank-\"]').length === 0 && document.querySelectorAll('[data-testid^=\"equipment-compact-closing-tank-\"]').length === 0"), "SiteEdit contractor rows exposed hidden tank controls");
  assert(await evaluate("document.body.innerText.includes('Hired: FASI UDDIN')"), "SiteEdit contractor vendor was not displayed");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-start-\"]').length === 2 && document.querySelectorAll('[data-testid^=\"equipment-compact-end-\"]').length === 2 && document.querySelectorAll('[data-testid^=\"equipment-compact-diesel-\"]').length === 2"), "SiteEdit contractor compact inputs were not rendered once per row");
  const contractorImage = await captureEquipmentEvidence("diesel02-A-siteedit-contractor-daily");
  const beforeDraft = (await fixtureState()).dprDraftPayloads.length;
  await clickTestId("button-save-draft-progress");
  await waitFor(`window.__DprSiteFixture?.dprDraftPayloads.length >= ${beforeDraft + 1}`, "SiteEdit contractor draft mutation");
  const draft = (await fixtureState()).dprDraftPayloads.at(-1);
  assert(draft.id === 6203, `SiteEdit draft source id was ${draft.id}`);
  const draftRows = draft.payload?.equipment || [];
  assert(draftRows.filter((row) => row.dieselSource === "contractor").length === 2, "SiteEdit draft did not retain both contractor rows");
  assert(draftRows.some((row) => row.dieselSource === "contractor" && Number(row.diesel) === 0), "SiteEdit draft lost zero-diesel contractor row");
  assert(draftRows.some((row) => row.dieselSource === "contractor" && Number(row.diesel) === 12), "SiteEdit draft lost positive-diesel contractor row");
  assert(draftRows.every((row) => row.dieselSource !== "contractor" || (row.openingDiesel == null && row.dieselBalanceInTank == null)), "SiteEdit contractor draft retained hidden tank values");

  // Save Progress navigates away by design; reopen the same fixture draft so
  // Submit DPR is also a real rendered action against the persisted mock row.
  await navigate("/site/edit/6203?returnTo=%2Fsite%2Fedit%2F6203", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"button-submit-dpr\"]')", "SiteEdit contractor submit action");
  assert(await evaluate("!document.querySelector('[data-testid=\"button-submit-dpr\"]').disabled"), "SiteEdit contractor submit button was disabled for no-meter Daily Hire rows");
  const submitImage = await captureEquipmentEvidence("diesel02-D-siteedit-contractor-submit");
  const beforeSubmit = (await fixtureState()).dprSubmitPayloads.length;
  await clickTestId("button-submit-dpr");
  try {
    await waitFor(`window.__DprSiteFixture?.dprSubmitPayloads.length >= ${beforeSubmit + 1}`, "SiteEdit contractor submit mutation");
  } catch (error) {
    const blocked = await fixtureState();
    throw new Error(`${error.message}; SiteEdit contractor submission blocked by toast ${JSON.stringify(blocked.toasts.at(-1) || {})}; captured payloads=${blocked.dprSubmitPayloads.length}`);
  }
  const submitted = (await fixtureState()).dprSubmitPayloads.at(-1);
  assert(submitted.id === 6203, `SiteEdit submit source id was ${submitted.id}`);
  const submittedRows = submitted.payload?.equipment || [];
  assert(submittedRows.some((row) => row.dieselSource === "contractor" && Number(row.diesel) === 0), "SiteEdit zero-diesel contractor row was not submitted");
  assert(submittedRows.some((row) => row.dieselSource === "contractor" && Number(row.diesel) === 12), "SiteEdit positive-diesel contractor row was not submitted");
  assert(submittedRows.every((row) => row.dieselSource !== "contractor" || (row.openingDiesel == null && row.dieselBalanceInTank == null)), "SiteEdit contractor submit retained hidden tank values");
  return { linkedImage, contractorImage, submitImage, sourceId: version.id, payload: version.payload, draft, submitted };
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

const expandGuidedCompact = async (index) => {
  const expanded = await evaluate(`(() => {
    const row = document.querySelector('[data-testid="equipment-compact-${index}"]');
    const button = row?.querySelector('button[aria-expanded]');
    if (!button) return false;
    if (button.getAttribute("aria-expanded") === "false") button.click();
    return true;
  })()`);
  assert(expanded, `Could not expand Guided compact equipment row ${index}`);
  await waitFor(
    `document.querySelector('[data-testid="equipment-compact-${index}"] input[data-testid="equipment-compact-diesel-${index}"]') !== null`,
    `Guided compact equipment row ${index} inputs`,
  );
};

const guidedRows = async () => evaluate(`Array.from(document.querySelectorAll('[data-testid^="equipment-compact-"]')).length`);

const verifyGuidedContractor = async () => {
  await navigate("/guided?draftId=6201&section=equipment", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"text-guided-title\"]')", "Guided DPR title");
  await waitFor("!!document.querySelector('[data-testid=\"card-equipment-step\"]')", "Guided equipment step");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-row-0\"] [data-testid=\"select-eq-machine-0\"]')", "Guided contractor row");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-0\"]') && !!document.querySelector('[data-testid=\"equipment-compact-1\"]')", "Guided contractor compact rows");

  // A: both Daily Hire rows have one compact time/fuel surface, no meter
  // controls, no tank controls, and the old setup details remain collapsed.
  assert(await evaluate("Array.from(document.querySelectorAll('[data-testid^=\"equipment-row-\"] details')).every(node => !node.open)"), "Guided contractor setup details unexpectedly open");
  const duplicateSelectors = [
    '[data-testid^="input-eq-start-"]',
    '[data-testid^="input-eq-end-"]',
    '[data-testid^="input-eq-opening-"]',
    '[data-testid^="input-eq-closing-"]',
    '[data-testid^="input-eq-diesel-"]',
    '[data-testid^="input-equipment-start-"]',
    '[data-testid^="input-equipment-end-"]',
    '[data-testid^="input-equipment-opening-"]',
    '[data-testid^="input-equipment-closing-"]',
    '[data-testid^="input-equipment-diesel-"]',
  ];
  for (const selector of duplicateSelectors) {
    assert(await evaluate(`document.querySelectorAll(${quote(selector)}).length === 0`), `Guided retained old duplicate selector ${selector}`);
  }
  await expandGuidedCompact(0);
  await expandGuidedCompact(1);
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-start-\"]').length === 2"), "Guided did not render one start input per Daily Hire row");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-end-\"]').length === 2"), "Guided did not render one end input per Daily Hire row");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-diesel-\"]').length === 2"), "Guided did not render one diesel input per Daily Hire row");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-opening-meter-\"]').length === 0 && document.querySelectorAll('[data-testid^=\"equipment-compact-closing-meter-\"]').length === 0"), "Guided Daily Hire unexpectedly rendered meter controls");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-opening-tank-\"]').length === 0 && document.querySelectorAll('[data-testid^=\"equipment-compact-closing-tank-\"]').length === 0 && document.querySelectorAll('[data-testid^=\"equipment-compact-tank-confirmed-\"]').length === 0"), "Guided contractor unexpectedly rendered tank controls");
  assert(await evaluate("document.body.innerText.includes('Hired: FASI UDDIN')"), "Guided editable hired vendor label was not visible");
  const contractorImage = await captureEquipmentEvidence("diesel02-A-guided-contractor-no-duplicate");

  const beforeDraft = (await fixtureState()).dprDraftPayloads.length;
  await clickTestId("button-save-draft");
  await waitFor(`window.__DprSiteFixture?.dprDraftPayloads.length >= ${beforeDraft + 1}`, "Guided contractor draft mutation");
  const draft = (await fixtureState()).dprDraftPayloads.at(-1);
  const draftRows = draft.payload?.equipment || [];
  const zero = draftRows.find((row) => row.dieselSource === "contractor" && Number(row.diesel) === 0);
  const positive = draftRows.find((row) => row.dieselSource === "contractor" && Number(row.diesel) === 12);
  assert(zero && positive, "Guided contractor draft did not retain both zero and positive diesel rows");
  assert(zero.openingDiesel == null && zero.dieselBalanceInTank == null && positive.openingDiesel == null && positive.dieselBalanceInTank == null, "Guided contractor draft retained hidden tank values");
  assert(zero.entryType === "daily" && positive.entryType === "daily", "Guided contractor draft did not retain Daily Hire entry type");

  // The actual draft response is reused by the read-only report route.  This
  // proves the vendor label survives save/view without claiming a production
  // DPR was written.
  await navigate("/guided/report?source=contractor", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"text-fixture-report-title\"]')", "Guided saved report");
  await waitFor("document.body.innerText.includes('Hired: FASI UDDIN')", "read-only hired vendor label");
  assert(await evaluate("document.body.innerText.includes('Fixture saved report') && document.body.innerText.includes('not a customer DPR')"), "read-only report was not clearly labelled fixture evidence");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-opening-tank-\"]').length === 0"), "read-only contractor report exposed tank fields");
  const readonlyImage = await captureEquipmentEvidence("diesel02-B-guided-contractor-readonly-saved");

  // D: return to the real Guided review page.  The submit control is the
  // rendered button used below, not a direct mutation or fixture-only control.
  await navigate("/guided?draftId=6201&section=review", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"card-review\"]')", "Guided review step");
  await waitFor("!!document.querySelector('[data-testid=\"button-submit\"]')", "Guided submit button");
  assert(await evaluate("!document.querySelector('[data-testid=\"button-submit\"]').disabled"), "Guided contractor submit button was disabled for no-meter Daily Hire rows");
  const reviewImage = await capture("diesel02-D-guided-review-submit");
  const beforeSubmit = (await fixtureState()).dprSubmitPayloads.length;
  await clickTestId("button-submit");
  try {
    await waitFor(`window.__DprSiteFixture?.dprSubmitPayloads.length >= ${beforeSubmit + 1}`, "Guided contractor submit mutation");
  } catch (error) {
    const blocked = await fixtureState();
    const toast = blocked.toasts.at(-1) || {};
    throw new Error(`${error.message}; Guided contractor submission blocked by toast ${JSON.stringify(toast)}; captured payloads=${blocked.dprSubmitPayloads.length}`);
  }
  const submitted = (await fixtureState()).dprSubmitPayloads.at(-1);
  const submittedRows = submitted.payload?.equipment || [];
  assert(submittedRows.some((row) => row.dieselSource === "contractor" && Number(row.diesel) === 0), "Guided zero-diesel contractor row was not submitted");
  assert(submittedRows.some((row) => row.dieselSource === "contractor" && Number(row.diesel) === 12), "Guided positive-diesel contractor row was not submitted");
  return { contractorImage, readonlyImage, reviewImage, draft, submitted };
};

const verifyGuidedPlantStock = async () => {
  await navigate("/guided?draftId=6202&section=equipment", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"card-equipment-step\"]')", "Guided plant-stock equipment step");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-0\"]') && !!document.querySelector('[data-testid=\"equipment-compact-1\"]')", "Guided plant-stock compact rows");
  await expandGuidedCompact(0);
  await expandGuidedCompact(1);
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-opening-tank-\"]').length === 2 && document.querySelectorAll('[data-testid^=\"equipment-compact-closing-tank-\"]').length === 2 && document.querySelectorAll('[data-testid^=\"equipment-compact-tank-confirmed-\"]').length === 2"), "Guided plant-stock tank controls were not present exactly once per row");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"input-eq-start-\"]').length === 0 && document.querySelectorAll('[data-testid^=\"input-eq-diesel-\"]').length === 0"), "Guided plant-stock retained duplicate setup inputs");
  const missingImage = await captureEquipmentEvidence("diesel02-C-guided-plant-stock-tanks-required");
  const beforeInvalid = (await fixtureState()).dprDraftPayloads.length;
  await clickTestId("button-save-draft");
  await sleep(120);
  const invalid = await fixtureState();
  assert(invalid.dprDraftPayloads.length === beforeInvalid, "Guided positive plant-stock diesel saved without tank observations");
  assert(invalid.toasts.some((toast) =>
    String(toast?.title || "").includes("Diesel tank balance required")
    || String(toast?.description || "").includes("Opening Diesel Tank (L) is required")
  ), `Guided plant-stock missing-tank blocker toast was not shown; actual toasts=${JSON.stringify(invalid.toasts.slice(-3))}`);

  // Explicit zero readings are valid physical observations.  The second
  // plant-stock row stays at zero diesel with blank tank fields, proving the
  // positive-only guard does not become a zero-value blocker.
  await setInput("equipment-compact-opening-tank-0", "0");
  await setInput("equipment-compact-closing-tank-0", "0");
  await clickTestId("equipment-compact-tank-confirmed-0");
  assert(await evaluate("document.querySelector('[data-testid=\"equipment-compact-opening-tank-1\"]')?.value === '' && document.querySelector('[data-testid=\"equipment-compact-closing-tank-1\"]')?.value === ''"), "Guided zero-stock row unexpectedly received tank readings");
  const filledImage = await captureEquipmentEvidence("diesel02-C-guided-plant-stock-tanks-filled");
  const beforeValid = (await fixtureState()).dprDraftPayloads.length;
  await clickTestId("button-save-draft");
  await waitFor(`window.__DprSiteFixture?.dprDraftPayloads.length >= ${beforeValid + 1}`, "Guided plant-stock draft mutation");
  const saved = (await fixtureState()).dprDraftPayloads.at(-1);
  const plantPositive = saved.payload?.equipment?.find((row) => row.dieselSource === "plant_stock" && Number(row.diesel) === 12);
  const plantZero = saved.payload?.equipment?.find((row) => row.dieselSource === "plant_stock" && Number(row.diesel) === 0);
  assert(plantPositive?.openingDiesel === 0 && plantPositive?.dieselBalanceInTank === 0 && plantPositive?.dieselBalanceConfirmed === true, "Guided plant-stock zero tank readings were not saved");
  assert(plantZero?.openingDiesel == null && plantZero?.dieselBalanceInTank == null, "Guided zero-stock row incorrectly required tank readings");
  return { missingImage, filledImage, saved };
};

const verifyGuidedBoqUnit = async () => {
  await navigate("/guided?draftId=6201&section=activities", 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "Guided BOQ activity card");
  await waitFor("!!document.querySelector('[data-testid=\"text-boq-qty-0\"]')", "Guided converted BOQ quantity");
  const text = await bodyText();
  assert(await evaluate("document.querySelector('[data-testid=\"input-length-0\"]')?.value === '1600.00' && document.querySelector('[data-testid=\"input-width-0\"]')?.value === '1.5' && document.querySelector('[data-testid=\"input-qty-0\"]')?.value === '2400'"), "Guided BOQ fixture inputs were not rendered as 1600m × 1.5m = 2400 SQM");
  assert(text.includes("Physical Qty (SQM)"), "Guided physical quantity did not retain SQM measurement label");
  assert(text.includes("BOQ Qty: 0.24 Ha"), "Guided converted 2400 SQM quantity did not display as 0.24 Ha");
  const image = await capture("diesel02-E-guided-boq-2400sqm-0.24ha");
  return { image, text: text.match(/BOQ Qty:[^\n]+/)?.[0] || "" };
};

await cdp("Runtime.enable");
const dieselDraft = await verifyDprDieselDraft();
const edit = await verifySiteEdit();
const plantA = await verifyPlantAStockPositive();
const plantB = await verifyPlantBContractorPositive();
const plantC = await verifyPlantCStockZero();
const guidedContractor = await verifyGuidedContractor();
const guidedPlantStock = await verifyGuidedPlantStock();
const guidedBoq = await verifyGuidedBoqUnit();

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
  guided: {
    contractor: guidedContractor,
    plantStock: guidedPlantStock,
    boq: guidedBoq,
  },
  writes: {
    // Page.navigate performs a real document load for each scenario, so the
    // fixture's in-memory state is intentionally inspected immediately after
    // each rendered mutation above.  Count the returned request snapshots
    // rather than the final BOQ page's freshly initialised state.
    dprDrafts: [dieselDraft.payload, edit.draft, guidedContractor.draft, guidedPlantStock.saved].filter(Boolean).length,
    dprVersions: edit.payload ? 1 : 0,
    dprSubmissions: [edit.submitted, guidedContractor.submitted].filter(Boolean).length,
    plantCreates: [plantA.payload, plantB.payload, plantC].filter(Boolean).length,
  },
}, null, 2));

socket.close();