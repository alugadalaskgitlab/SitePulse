/*
 * DPR-03 isolated browser evidence.
 *
 * Start the fixture and an existing Chromium CDP endpoint before running:
 *
 *   npx vite --config tests/fixtures/dpr03/vite.config.ts \
 *     --host 127.0.0.1 --port 4183 --strictPort
 *   node tests/fixtures/dpr03/verify.mjs
 *
 * The verifier drives rendered production components through Chromium. The
 * fixture adapter keeps the one Save Draft request in memory; no customer or
 * production write is possible.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR03_FIXTURE_BASE_URL || "http://127.0.0.1:4183";
const cdpPort = process.env.DPR03_CDP_PORT || "9222";
const taskText = "CUT TRENCH / TOE DRAIN ALONG SITE ROAD — EXISTING IRRIGATION DRAIN COVERED";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
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
  if (message.method === "Page.javascriptDialogOpening") {
    void cdp("Page.handleJavaScriptDialog", { accept: true });
  }
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
    resolve: (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    reject: (error) => {
      clearTimeout(timer);
      reject(new Error(`${method}: ${error.message}`));
    },
  });
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
const containsText = (text, expected) =>
  text.toLocaleLowerCase().includes(String(expected).toLocaleLowerCase());
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 2200) || ''");
  throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(body)}`);
};
const bodyText = () => evaluate("document.body?.innerText || ''");
const fixtureState = () => evaluate("window.__Dpr03Fixture || null");

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

const setFirstInput = async (testIds, value) => {
  for (const testId of testIds) {
    const present = await evaluate(`!!document.querySelector('[data-testid=${quote(testId)}]')`);
    if (present) {
      await setInput(testId, value);
      return testId;
    }
  }
  throw new Error(`Could not find any task input: ${testIds.join(", ")}`);
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

const navigate = async (pathname, width = 1440, height = 1100, mobile = false) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitFor("document.readyState === 'complete'", `${pathname} document`);
  await waitFor("!!document.querySelector('[data-testid=\"fixture-evidence-notice\"]')", `${pathname} fixture notice`);
};

const captureTarget = async (name, selector) => {
  const positioned = await evaluate(`(() => {
    const node = document.querySelector(${quote(selector)});
    if (!node) return false;
    node.scrollIntoView({ block: "start", inline: "center", behavior: "instant" });
    return true;
  })()`);
  assert(positioned, `Could not position screenshot target ${selector}`);
  await sleep(200);
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

const taskSectionSelector = (index = 0) =>
  `[data-testid="equipment-compact-incidental-work-${index}"]`;
const taskSelector = (index = 0) =>
  `[data-testid="equipment-compact-incidental-task-${index}"]`;

const taskInputIds = (index = 0) => [
  `equipment-compact-incidental-task-${index}`,
];

const verifyGuidedSave = async () => {
  await navigate("/guided", 1440, 1200, false);
  await waitFor("!!document.querySelector('[data-testid=\"select-site\"]')", "Guided report header");
  await selectOption("select-site", "DPR-03 FIXTURE SITE");
  await selectOption("select-engineer", "DPR-03 FIXTURE ENGINEER");
  await clickTestId("button-step-next");
  await waitFor("!!document.querySelector('[data-testid=\"button-add-activity\"]')", "Guided activities step");

  // A real Guided incidental row supplies the minimum header context while
  // deliberately carrying no BOQ item, chainage, or quantity.
  await clickTestId("button-add-activity");
  await waitFor("!!document.querySelector('[data-testid=\"checkbox-incidental-0\"]')", "Guided incidental activity row");
  await clickTestId("checkbox-incidental-0");
  await waitFor("!!document.querySelector('[data-testid=\"input-incidental-description-0\"]')", "incidental description");
  await setInput("input-incidental-description-0", "INCIDENTAL FIXTURE CONTEXT ONLY");
  await clickTestId("button-step-next");
  await clickTestId("button-step-next");
  await waitFor("!!document.querySelector('[data-testid=\"card-equipment-step\"]')", "Guided equipment step");

  await clickTestId("button-add-equipment");
  await waitFor("!!document.querySelector('[data-testid=\"select-eq-machine-0\"]')", "Guided equipment row");
  await selectOption("select-eq-machine-0", "DPR03 INCIDENTAL JCB");
  await waitFor(`!!document.querySelector(${quote(taskSelector())})`, "shared incidental task textarea");
  const taskInput = await setFirstInput(taskInputIds(), taskText);
  await waitFor(`document.querySelector('[data-testid=${quote(taskInput)}]')?.value === ${quote(taskText)}`, "task text value");
  const guided = await captureTarget("dpr03-A-guided-incidental-task", taskSectionSelector());

  await clickTestId("button-save-draft");
  await waitFor("(window.__Dpr03Fixture?.writes || []).length === 1", "one fixture Save Draft write");
  await waitFor("window.__Dpr03Fixture?.savedPayload?.equipment?.some(row => row.task)", "saved task payload");

  const state = await fixtureState();
  assert(state?.writes?.length === 1, `Expected one fixture write, got ${JSON.stringify(state?.writes)}`);
  assert(state.writes[0].method === "POST" && state.writes[0].path === "/api/dprs", `Unexpected save request ${JSON.stringify(state.writes[0])}`);
  assert(state.savedPayload?.equipment?.length === 1, "Saved payload did not contain one equipment row");
  const savedRow = state.savedPayload.equipment[0];
  assert(savedRow.task === taskText, `Saved task did not persist exactly: ${JSON.stringify(savedRow.task)}`);
  assert(savedRow.boqItemId == null, "Incidental equipment row unexpectedly carried a BOQ item");
  assert(savedRow.quantity == null, "Incidental equipment row unexpectedly carried a quantity");
  assert(savedRow.activitySegments == null || savedRow.activitySegments.length === 0, "Incidental equipment row unexpectedly carried BOQ segments");
  assert(savedRow.activityAllocations == null || savedRow.activityAllocations.length === 0, "Incidental equipment row unexpectedly carried BOQ allocations");
  const savedProgress = state.savedPayload.progress?.[0];
  assert(savedProgress?.isIncidental === true, "Guided fixture did not retain the incidental entry type");
  assert(savedProgress?.boqItemId == null && savedProgress?.quantity == null, "Incidental context row acquired BOQ quantity state");

  return { guided, taskInput, savedRow, writes: state.writes };
};

const verifyReports = async () => {
  // B: the report for the row saved by the browser shows the task as
  // documentation and explicitly says it is not payable progress.
  await navigate("/site/report/7308", 1440, 1200, false);
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-incidental-work-0\"]')", "saved task-only report");
  let text = await bodyText();
  assert(text.includes(taskText), "Saved task text was not rendered on the report");
  assert(await evaluate("!!document.querySelector('[data-testid=\"equipment-compact-incidental-task-value-0\"]')"), "Saved task value did not use the report value test id");
  assert(containsText(text, "Non-BOQ / Incidental Work"), "Report missed the non-BOQ incidental label");
  assert(containsText(text, "Not a BOQ item") && containsText(text, "not payable progress"), "Report missed the not-payable warning");
  assert(!containsText(text, "select a BOQ Item"), "Saved task-only report surfaced a BOQ validation error");
  const report = await captureTarget("dpr03-B-saved-incidental-report", '[data-testid="equipment-compact-incidental-work-0"]');

  // C: ordinary BOQ work has the assignment but no empty incidental line.
  await navigate("/site/report/7305", 1440, 1200, false);
  await waitFor("!!document.querySelector('article[data-testid=\"equipment-compact-0\"]')", "BOQ-only report");
  text = await bodyText();
  assert(containsText(text, "Roadway excavation"), "BOQ-only report missed the BOQ assignment");
  assert(!containsText(text, "Non-BOQ / Incidental Work"), "BOQ-only report showed an empty incidental line");
  assert(!containsText(text, "Not a BOQ item"), "BOQ-only report showed a not-payable incidental note");
  const boqOnly = await captureTarget("dpr03-C-boq-only-report", '[data-testid="equipment-compact-0"]');

  // D: both fields are shown independently on one equipment card.
  await navigate("/site/report/7306", 1440, 1200, false);
  await waitFor("!!document.querySelector('article[data-testid=\"equipment-compact-0\"]')", "combined report");
  text = await bodyText();
  assert(text.includes(taskText), "Combined report missed incidental task text");
  assert(containsText(text, "Roadway excavation"), "Combined report missed BOQ assignment");
  assert(containsText(text, "Not a BOQ item") && containsText(text, "8:00 AM") && containsText(text, "Assigned: 4 h"), "Combined report did not preserve independent segment details");
  const combined = await captureTarget("dpr03-D-boq-and-incidental-report", '[data-testid="equipment-compact-0"]');

  // F: this isolated legacy-shaped record uses the DRESSING task literal
  // present in tests/fixtures/dpr-site-entry's storedDpr sample, but remains
  // explicitly synthetic and is not a claim about customer history.
  await navigate("/site/report/7307", 1440, 1200, false);
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-incidental-work-0\"]')", "legacy fixture report");
  text = await bodyText();
  assert(text.includes("DRESSING"), "Legacy-shaped fixture task did not render");

  return { report, boqOnly, combined, historicalLegacyFixture: true };
};

const verifySiteEntrySharedInput = async () => {
  await navigate("/site/new", 1440, 1100, false);
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-0\"]')", "SiteEntry equipment row");
  await selectOption("select-equipment-0", "DPR03 INCIDENTAL JCB");
  await waitFor(`!!document.querySelector(${quote(taskSelector())})`, "SiteEntry shared task textarea");
  const screenshot = await captureTarget("dpr03-E-siteentry-shared-task", taskSectionSelector());
  return { screenshot, writes: (await fixtureState())?.writes?.length ?? 0 };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const A = await verifyGuidedSave();
const BCD = await verifyReports();
const E = await verifySiteEntrySharedInput();
const finalState = await fixtureState();
assert(finalState?.writes?.length === 1, `Unexpected fixture writes: ${JSON.stringify(finalState?.writes)}`);
assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);

console.log(JSON.stringify({
  scenario: "DPR-03 incidental equipment task isolated browser evidence",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    productionDatabaseUsed: false,
    customerWrites: false,
    fixtureData: "DPR-03 representative rows, including an explicitly labelled legacy-shaped fixture; not customer data.",
    evidenceDirectory: evidenceDir,
  },
  screenshots: {
    A_guidedIncidentalTask: A.guided,
    B_savedIncidentalReport: BCD.report,
    C_boqOnlyNoTask: BCD.boqOnly,
    D_boqAndIncidental: BCD.combined,
    E_siteEntrySharedInput: E.screenshot,
  },
  assertions: {
    A: "Guided records an incidental/non-BOQ context row and saves one task-only equipment payload without BOQ item, quantity, segment, or allocation.",
    B: "The saved row's report renders the task beside an explicit non-payable/non-BOQ label.",
    C: "A BOQ-only row renders its BOQ segment without an empty incidental line.",
    D: "One row renders BOQ segment details and incidental task documentation independently.",
    E: "SiteEntry exposes the same shared task input.",
    F: "An explicit synthetic legacy-shaped row renders DRESSING, matching the existing dpr-site-entry fixture literal without claiming customer history.",
    writes: "Exactly one POST /api/dprs Save Draft request was captured in fixture memory; no customer or production writes occurred.",
    browserExceptions: "No Runtime.exceptionThrown events.",
  },
}, null, 2));

socket.close();