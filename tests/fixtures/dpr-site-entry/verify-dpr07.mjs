/*
 * DPR-07 isolated browser evidence.
 *
 * This verifier drives the real SiteEdit and SiteEntry components against the
 * dpr-site-entry fixture's in-memory fetch adapter.  It does not invoke the
 * production Express routes or database.  The result JSON records that
 * boundary explicitly so these screenshots are not mistaken for backend
 * integration evidence.
 *
 * Run with the fixture Vite server and an already-running Chromium CDP page:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178 --strictPort
 *   node tests/fixtures/dpr-site-entry/verify-dpr07.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort = process.env.DPR07_CDP_PORT || "9222";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
let page = pages.find((target) => target.type === "page" && target.url === "about:blank");
if (!page) {
  await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" });
  const refreshed = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  page = refreshed.find((target) => target.type === "page" && target.url === "about:blank")
    || refreshed.find((target) => target.type === "page");
}
if (!page) throw new Error(`Chromium did not expose a page target on CDP port ${cdpPort}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.once("open", resolve);
  socket.once("error", reject);
});
let sequence = 0;
const pending = new Map();
const browserErrors = [];
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (message.method === "Page.javascriptDialogOpening") void cdp("Page.handleJavaScriptDialog", { accept: true });
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    browserErrors.push(details.text || details.exception?.description || "unknown browser exception");
  }
  if (!message.id || !pending.has(message.id)) return;
  const callback = pending.get(message.id);
  pending.delete(message.id);
  message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result);
});

const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`CDP timeout: ${method}`));
  }, 20000);
  pending.set(id, {
    resolve: (value) => { clearTimeout(timer); resolve(value); },
    reject: (error) => { clearTimeout(timer); reject(new Error(`${method}: ${error.message}`)); },
  });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  return result.result?.value;
};
const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const bodyText = () => evaluate("document.body?.innerText || ''");
const fixtureState = () => evaluate("window.__DprSiteFixture || null");

const waitFor = async (expression, label, attempts = 300) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 2800) || ''");
  throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(body)}`);
};

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node || node.disabled) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not click enabled [data-testid=${testId}]`);
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
    node.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set [data-testid=${testId}]`);
};

const clickOptionContaining = async (text) => {
  const clicked = await evaluate(`(() => {
    const wanted = ${quote(text)}.toLowerCase();
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find(node => (node.textContent || "").toLowerCase().includes(wanted));
    if (!option) return false;
    option.click();
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
  await sleep(100);
};

const navigate = async (pathname, width = 1440, height = 1100) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitFor("document.readyState === 'complete'", `${pathname} document`);
  await waitFor("!!document.querySelector('[data-testid=\"dpr07-evidence-banner\"]')", `${pathname} DPR-07 banner`);
};

const captureTarget = async (name, selector) => {
  const positioned = await evaluate(`(() => {
    const node = document.querySelector(${quote(selector)});
    if (!node) return false;
    node.scrollIntoView({ block: "start", inline: "center", behavior: "instant" });
    return true;
  })()`);
  assert(positioned, `Could not position screenshot target ${selector}`);
  await sleep(180);
  const box = await evaluate(`(() => {
    const node = document.querySelector(${quote(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, rect.left - 12),
      y: Math.max(0, rect.top + window.scrollY - 12),
      width: Math.max(1, rect.width + 24),
      height: Math.max(1, rect.height + 24),
    };
  })()`);
  assert(box, `Could not read screenshot target ${selector}`);
  const screenshot = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { ...box, scale: 1 },
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(screenshot.data, "base64"));
  return target;
};

const expandCompact = async (index = 0) => {
  const expanded = await evaluate(`(() => {
    const row = document.querySelector('[data-testid="equipment-compact-${index}"]');
    const button = row?.querySelector('button[aria-expanded]');
    if (!button) return false;
    if (button.getAttribute("aria-expanded") === "false") button.click();
    return true;
  })()`);
  assert(expanded, `Could not expand compact equipment row ${index}`);
  await waitFor(
    `!!document.querySelector('[data-testid="equipment-compact-${index}"] [data-testid="equipment-compact-diesel-${index}"]')`,
    `compact equipment row ${index}`,
  );
};

const siteEditMatrix = async ({
  id,
  role,
  scenario,
  expected,
  screenshot,
}) => {
  await navigate(`/site/edit/${id}?complete=1&dpr07=1&role=${role}&scenario=${scenario}`);
  await waitFor("!!document.querySelector('[data-testid=\"button-save\"]')", `${scenario} SiteEdit`);
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-0\"]')", `${scenario} compact row`);
  await expandCompact(0);
  const state = await evaluate(`(() => {
    const get = (testId) => document.querySelector('[data-testid="' + testId + '"]');
    return {
      openingMeterDisabled: !!get("equipment-compact-opening-meter-0")?.disabled,
      startDisabled: !!get("equipment-compact-start-0")?.disabled,
      dieselDisabled: !!get("equipment-compact-diesel-0")?.disabled,
      source: document.querySelector('[data-testid="equipment-row-0"]')?.innerText || "",
    };
  })()`);
  assert(state.openingMeterDisabled === expected.openingMeterDisabled,
    `${scenario}: opening-meter disabled=${state.openingMeterDisabled}`);
  assert(state.startDisabled === expected.startDisabled,
    `${scenario}: start disabled=${state.startDisabled}`);
  assert(state.dieselDisabled === expected.dieselDisabled,
    `${scenario}: diesel disabled=${state.dieselDisabled}`);
  const image = await captureTarget(screenshot, '[data-testid="equipment-row-0"]');
  return { image, role, id, state, expected };
};

const verifyE = async () => {
  await navigate("/site/new?dpr07=1&scenario=E-creation");
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", "E SiteEntry");
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", "E engineer selector");
  await setInput("input-date", "2026-08-05");
  await selectOption("select-engineer", "SURESH KUMAR");
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-0\"]')", "E first equipment row");

  // SiteEntry is the real creation screen.  These rows are unlinked, so the
  // source-independent creation behavior must remain editable for all three
  // diesel scopes (the plant-stock row also keeps its normal tank controls).
  await selectOption("select-equipment-0", "JCB 3DX");
  await selectOption("select-diesel-source-0", "Plant Stock");
  await setInput("input-equipment-diesel-0", "0");
  await clickTestId("button-add-equipment");
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-1\"]')", "E contractor equipment row");
  await selectOption("select-equipment-1", "Water Tanker");
  await selectOption("select-diesel-source-1", "Contractor");
  await setInput("input-equipment-diesel-1", "4");
  await clickTestId("button-add-equipment");
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-2\"]')", "E direct-purchase equipment row");
  await selectOption("select-equipment-2", "JCB 3DX");
  await selectOption("select-diesel-source-2", "Direct Site Purchase");
  await setInput("input-equipment-diesel-2", "5");

  const state = await evaluate(`(() => {
    const row = (index) => document.querySelector('[data-testid="equipment-row-' + index + '"]');
    const opening = (index) => row(index)?.querySelector('[data-testid="input-equipment-opening-' + index + '"]');
    const start = (index) => row(index)?.querySelector('[data-testid="input-equipment-start-' + index + '"]');
    const diesel = (index) => row(index)?.querySelector('[data-testid="input-equipment-diesel-' + index + '"]');
    const source = (index) => row(index)?.querySelector('[data-testid="select-diesel-source-' + index + '"]');
    return [0, 1, 2].map(index => ({
      index,
      openingMeterDisabled: !!opening(index)?.disabled,
      startDisabled: !!start(index)?.disabled,
      dieselDisabled: !!diesel(index)?.disabled,
      sourceDisabled: !!source(index)?.getAttribute("aria-disabled"),
      rowText: row(index)?.innerText || "",
    }));
  })()`);
  assert(state.every((row) => row.openingMeterDisabled === false
    && row.startDisabled === false
    && row.dieselDisabled === false),
  `E creation unexpectedly locked an equipment field: ${JSON.stringify(state)}`);
  const image = await captureTarget("dpr07-E-creation-all-scopes", '[data-testid="equipment-row-2"]');
  return {
    image,
    scopes: ["plant_stock", "contractor", "direct_purchase"],
    state,
    screen: "real SiteEntry creation UI",
  };
};

const verifyF = async () => {
  // Legacy invalid activity is untouched; only the Labour field changes.
  // The fixture route emulates the version endpoint's changed-row scope and
  // returns a successful version response without re-checking the old row.
  await navigate("/site/edit/6214?complete=1&dpr07=1&role=admin&scenario=F-labour-only");
  await waitFor("!!document.querySelector('[data-testid=\"button-save\"]')", "F SiteEdit");
  await waitFor("!!document.querySelector('[data-testid=\"input-labour-task-0\"]')", "F labour row");
  const before = await fixtureState();
  const beforeVersions = before.dprVersionPayloads.length;
  await setInput("input-labour-task-0", "CORRECTED LABOUR");
  await waitFor(
    "document.querySelector('[data-testid=\"input-labour-task-0\"]')?.value === 'CORRECTED LABOUR'",
    "F labour correction",
  );
  const image = await captureTarget("dpr07-F-labour-only-legacy-untouched", '[data-testid="labour-row-0"]');
  await clickTestId("button-save");
  try {
    await waitFor(
      `window.__DprSiteFixture?.dprVersionPayloads.length >= ${beforeVersions + 1}`,
      "F successful version mutation",
    );
  } catch (error) {
    const debug = await fixtureState();
    throw new Error(`${error.message}; F fixture debug=${JSON.stringify({
      versions: debug.dprVersionPayloads,
      checks: debug.dpr07VersionChecks,
      toasts: debug.toasts?.slice(-3),
      requests: debug.requests?.slice(-8),
    })}`);
  }
  const state = await fixtureState();
  const version = state.dprVersionPayloads.at(-1);
  const check = state.dpr07VersionChecks.at(-1);
  assert(check?.result === "accepted" && check?.changedRows === 0 && check?.labourChanged === true,
    `F changed-row scope was not recorded: ${JSON.stringify(check)}`);
  assert(version?.payload?.data?.labour?.[0]?.task === "CORRECTED LABOUR",
    "F labour correction was not carried through");
  assert(version?.payload?.data?.progress?.[0]?.activity === "LEGACY INVALID ACTIVITY",
    "F untouched legacy activity was not carried through");
  return { image, check, version, screen: "real SiteEdit; mocked version handler" };
};

const verifyG = async () => {
  // This time the activity quantity is genuinely changed.  The same mocked
  // version handler must reject the changed invalid row and keep the form on
  // SiteEdit with a rendered error toast.
  await navigate("/site/edit/6214?complete=1&dpr07=1&role=admin&scenario=G-changed-invalid");
  await waitFor("!!document.querySelector('[data-testid=\"button-save\"]')", "G SiteEdit");
  await waitFor("!!document.querySelector('[data-testid=\"input-qty-0\"]')", "G activity quantity");
  await setInput("input-qty-0", "11");
  await waitFor(
    "document.querySelector('[data-testid=\"input-qty-0\"]')?.value === '11'",
    "G changed invalid quantity",
  );
  const before = await fixtureState();
  const beforeVersions = before.dprVersionPayloads.length;
  const image = await captureTarget("dpr07-G-changed-invalid-before-save", '[data-testid="progress-row-0"]');
  await clickTestId("button-save");
  await waitFor(
    "document.body.innerText.toLowerCase().includes('changed quantity-source') || document.body.innerText.toLowerCase().includes('invalid')",
    "G validation error",
  );
  const state = await fixtureState();
  const check = state.dpr07VersionChecks.at(-1);
  assert(state.dprVersionPayloads.length === beforeVersions,
    "G changed invalid activity unexpectedly created a version");
  assert(check?.result === "rejected" && check?.changedRows === 1,
    `G changed-row rejection was not recorded: ${JSON.stringify(check)}`);
  const failureImage = await captureTarget("dpr07-G-changed-invalid-rejected", '[data-testid="progress-row-0"]');
  return { image, failureImage, check, screen: "real SiteEdit; mocked version handler" };
};

const verifyH = async () => {
  // H first renders a real fresh SiteEntry with an invalid manual quantity
  // source.  The final POST is then sent to the fixture adapter's explicit
  // invalid-create branch to isolate the unchanged fresh-create contract.
  await navigate("/site/new?dpr07=1&scenario=H-fresh-create");
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", "H fresh SiteEntry");
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", "H engineer selector");
  await setInput("input-date", "2026-08-06");
  await selectOption("select-engineer", "SURESH KUMAR");
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-0\"]')", "H equipment row");

  // A valid-looking activity is filled through rendered controls, then made
  // invalid at the manual quantity-source boundary (empty source).
  const triggerClicked = await evaluate(`(() => {
    const row = document.querySelector('[data-testid="progress-row-0"]');
    const trigger = row?.querySelector('[role="combobox"]');
    if (!trigger) return false;
    trigger.click();
    return true;
  })()`);
  assert(triggerClicked, "H could not open the real activity bill picker");
  await waitFor(
    `Array.from(document.querySelectorAll('[role="option"]')).some(node => (node.textContent || "").toLowerCase().includes("road work"))`,
    "H activity bill",
  );
  await clickOptionContaining("Road Work");
  await clickTestId("progress-0-item-select");
  await waitFor("!!document.querySelector('[data-testid=\"option-boq-item-8801\"]')", "H BOQ item");
  await clickTestId("option-boq-item-8801");
  await sleep(120);
  await selectOption("select-progress-side-0", "LHS");
  await setInput("input-progress-from-0", "12+000");
  await setInput("input-progress-to-0", "12+100");
  await setInput("input-progress-width-0", "7");
  await setInput("input-progress-qty-0", "701");
  await waitFor("!!document.querySelector('[data-testid=\"select-qty-source-0\"]')", "H manual quantity source");

  const image = await captureTarget("dpr07-H-fresh-create-invalid", '[data-testid="progress-row-0"]');
  const response = await evaluate(`(async () => {
    const result = await fetch("/api/dprs?dpr07=1&validation=invalid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-08-06",
        site: "NARASIMHULU ROAD",
        engineer: "SURESH KUMAR",
        boqProjectId: 5501,
        progress: [{
          activity: "GSB LAYING",
          boqItemId: 8801,
          programmeBarId: null,
          quantity: 701,
          quantitySource: null,
          materialOutcome: "legacy_invalid_outcome",
        }],
      }),
    });
    return { status: result.status, body: await result.json() };
  })()`);
  assert(response.status === 422, `H fresh invalid create returned ${JSON.stringify(response)}`);
  const state = await fixtureState();
  const check = state.dpr07FreshCreateChecks.at(-1);
  assert(check?.result === "rejected" && check?.scope === "all-rows-fresh-create",
    `H all-row create validation was not recorded: ${JSON.stringify(check)}`);
  const failureImage = await captureTarget("dpr07-H-fresh-create-rejected", '[data-testid="progress-row-0"]');
  return {
    image,
    failureImage,
    response,
    check,
    screen: "real SiteEntry; explicit fixture create-handler probe",
  };
};

await cdp("Page.enable");
await cdp("Runtime.enable");

const A = await siteEditMatrix({
  id: 6210,
  role: "manager",
  scenario: "A-manager-contractor-linked",
  expected: { openingMeterDisabled: true, startDisabled: true, dieselDisabled: false },
  screenshot: "dpr07-A-manager-contractor-linked",
});
const B = await siteEditMatrix({
  id: 6211,
  role: "manager",
  scenario: "B-manager-direct-purchase-linked",
  expected: { openingMeterDisabled: true, startDisabled: true, dieselDisabled: false },
  screenshot: "dpr07-B-manager-direct-purchase-linked",
});
const C = await siteEditMatrix({
  id: 6212,
  role: "manager",
  scenario: "C-manager-plant-stock-linked",
  expected: { openingMeterDisabled: true, startDisabled: true, dieselDisabled: true },
  screenshot: "dpr07-C-manager-plant-stock-linked",
});
const D = await siteEditMatrix({
  id: 6213,
  role: "admin",
  scenario: "D-admin-plant-stock-linked-all-unlocked",
  expected: { openingMeterDisabled: false, startDisabled: false, dieselDisabled: false },
  screenshot: "dpr07-D-admin-plant-stock-linked-all-unlocked",
});
const E = await verifyE();
const F = await verifyF();
const G = await verifyG();
const H = await verifyH();

const finalState = await fixtureState();
assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);
const result = {
  scenario: "DPR-07 shared compact lock matrix and changed-row validation",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    productionDatabaseUsed: false,
    customerWrites: false,
    apiRouteMode: "browser fetch adapter with in-memory fixture state",
    backendIntegrationTest: false,
    evidenceDirectory: evidenceDir,
  },
  evidenceClassification: {
    browserFixture: "Rendered SiteEntry/SiteEdit browser evidence over the fixture's in-memory fetch adapter (API mock).",
    actualBackendTests: "None in this verifier; production Express/database route coverage remains a separate backend test.",
  },
  matrix: {
    A: "Non-admin manager + linked Contractor: Opening Meter/Start locked; Diesel Issued/Added enabled.",
    B: "Non-admin manager + linked Direct-Purchase: Opening Meter/Start locked; Diesel Issued/Added enabled.",
    C: "Non-admin manager + linked Plant Stock: Opening Meter/Start/Diesel Issued locked.",
    D: "Authenticated admin + linked Plant Stock: Opening Meter/Start/Diesel Issued all enabled.",
    E: "Fresh SiteEntry creation renders all three source scopes without changing the creation contract.",
    F: "Admin SiteEdit changes Labour only; untouched legacy invalid activity is carried through and version accepted.",
    G: "Admin SiteEdit changes the invalid activity; changed-row validation rejects and no version is created.",
    H: "Fresh SiteEntry controls are rendered; explicit fixture create probe rejects invalid progress under all-row semantics.",
  },
  screenshots: {
    A: A.image,
    B: B.image,
    C: C.image,
    D: D.image,
    E: E.image,
    F: F.image,
    G_before: G.image,
    G_rejected: G.failureImage,
    H_before: H.image,
    H_rejected: H.failureImage,
  },
  assertions: { A, B, C, D, E, F, G, H },
  mockValidationLog: {
    // Page.navigate creates a fresh fixture document, so retain the exact
    // per-document assertions returned by F/G/H rather than only the final
    // document's in-memory arrays.
    versionChecks: [F.check, G.check],
    freshCreateChecks: [H.check],
  },
  limitations: [
    "A-D and E are real production components in an isolated Vite browser fixture.",
    "F-H use the fixture's in-memory API adapter; they do not prove the production Express route or database behavior.",
    "F/G/H backend behavior must still be covered by the server route tests owned by the backend agent.",
  ],
  browserExceptions: browserErrors,
};
writeFileSync(path.join(evidenceDir, "dpr07-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(
  path.join(evidenceDir, "dpr07-request-log.json"),
  `${JSON.stringify({
    requests: finalState.requests,
    finalDocumentVersionPayloads: finalState.dprVersionPayloads,
    freshCreateChecks: [H.check],
    versionChecks: [F.check, G.check],
  }, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
socket.close();
