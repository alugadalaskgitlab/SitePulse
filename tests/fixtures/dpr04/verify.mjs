/*
 * DPR-04 isolated browser evidence.
 *
 * Run this verifier only with the fixture Vite server on port 4184 and an
 * existing Chromium CDP endpoint on port 9222:
 *
 *   npx vite --config tests/fixtures/dpr04/vite.config.ts \
 *     --host 127.0.0.1 --port 4184 --strictPort
 *   node tests/fixtures/dpr04/verify.mjs
 *
 * The browser drives the real GuidedDpr, SiteEdit, SiteReport and SiteSuccess
 * components. The fixture's route adapter owns all API responses and keeps
 * every mutation in memory; no customer or production write is possible.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR04_FIXTURE_BASE_URL || "http://127.0.0.1:4184";
const cdpPort = process.env.DPR04_CDP_PORT || "9222";

const SITE = "TAKKADPALLY-SIRUR";
const ENGINEER = "DPR-04 FIXTURE ENGINEER";
const PROJECT_A = 8410;
const PROJECT_B = 8420;
const DRAFT_A = 8460;
const EDIT_DRAFT = 8461;
const EXISTING_B_DRAFT = 8463;
const NEW_AUTOSAVE_DRAFT = 8464;
const NO_WORK_ACTIVITY = "SIDE DRAIN RESTORATION AT BODAPALLY VILLAGE";
const LOCAL_AUTOSAVE_MARKER = "LOCAL AUTOSAVE SAVED A";
const LOCAL_NEW_MARKER = "LOCAL NEW AUTOSAVE PROJECT A";
const EDIT_MARKER = "EDIT DRAFT SAVED BY DPR04";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
let page = pages.find((target) => target.type === "page" && target.url === "about:blank");
if (!page) {
  await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" });
  pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  page = pages.find((target) => target.type === "page" && target.url === "about:blank")
    || pages.find((target) => target.type === "page");
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
};

const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const containsText = (text, expected) =>
  String(text).toLocaleLowerCase().includes(String(expected).toLocaleLowerCase());

const waitFor = async (expression, label, attempts = 300) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 2600) || ''");
  throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(body)}`);
};

const bodyText = () => evaluate("document.body?.innerText || ''");
const fixtureState = () => evaluate("window.__Dpr04Fixture || null");

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

const navigate = async (pathname, width = 1440, height = 1200, mobile = false) => {
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
  await waitFor(
    "!!document.querySelector('[data-testid=\"fixture-evidence-notice\"]')",
    `${pathname} fixture notice`,
  );
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

const seedGuidedAutosave = async () => {
  const localData = {
    formKey: `guided-dpr-${DRAFT_A}`,
    savedAt: Date.now(),
    version: 1,
    data: {
      date: "2026-09-15",
      siteName: SITE,
      engineer: `${ENGINEER} - ENGINEER`,
      entries: [{
        entryKey: "local-a",
        noSiteWork: true,
        noSiteWorkDescription: "LOCAL AUTOSAVE DESCRIPTION A",
        activity: LOCAL_AUTOSAVE_MARKER,
        boqItemId: null,
        programmeBarId: null,
        earthworkArrangementId: null,
        side: "",
        chainageFrom: "",
        chainageTo: "",
        quantity: null,
        uom: "RMT",
        expanded: false,
        width: null,
        thickness: null,
        remark: "",
        quantitySource: "",
        quantitySourceNote: "",
        chainageOverrideReason: "",
        executedBy: "",
        qtyOverridden: false,
        layerNo: null,
        isIncidental: false,
        incidentalDescription: "",
      }],
      equipment: [],
      labour: [],
      remarks: "LOCAL AUTOSAVE REMARK A",
      draftId: DRAFT_A,
      step: 3,
    },
  };
  await evaluate(`(async () => {
    window.__Dpr04ResetLogs?.();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("keyval-store");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.setItem(
      ${quote(`autosave_guided-dpr-${DRAFT_A}`)},
      ${quote(JSON.stringify(localData))},
    );
    return true;
  })()`);
};

const seedNewGuidedAutosave = async () => {
  const localData = {
    formKey: "guided-dpr-new",
    savedAt: Date.now(),
    version: 1,
    data: {
      date: "2026-09-15",
      siteName: SITE,
      engineer: `${ENGINEER} - ENGINEER`,
      entries: [{
        entryKey: "local-new-a",
        noSiteWork: true,
        noSiteWorkDescription: "LOCAL NEW AUTOSAVE DESCRIPTION A",
        activity: LOCAL_NEW_MARKER,
        boqItemId: null,
        programmeBarId: null,
        earthworkArrangementId: null,
        side: "",
        chainageFrom: "",
        chainageTo: "",
        quantity: null,
        uom: "RMT",
        expanded: false,
        width: null,
        thickness: null,
        remark: "",
        quantitySource: "",
        quantitySourceNote: "",
        chainageOverrideReason: "",
        executedBy: "",
        qtyOverridden: false,
        layerNo: null,
        isIncidental: false,
        incidentalDescription: "",
      }],
      equipment: [],
      labour: [],
      remarks: "LOCAL NEW AUTOSAVE REMARK A",
      draftId: null,
      // This is the critical local-only project preference. The API returns B
      // first and both are active, so only the restored preference can select A.
      boqProjectId: PROJECT_A,
      step: 3,
    },
  };
  await evaluate(`(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("keyval-store");
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.setItem(
      ${quote("autosave_guided-dpr-new")},
      ${quote(JSON.stringify(localData))},
    );
    return true;
  })()`);
};

const resolutionForRoute = async (routePart) => {
  const state = await fixtureState();
  const projectRows = state.projectResponses.filter((row) => row.route.includes(routePart));
  const itemRows = state.itemRequests.filter((row) => row.route.includes(routePart));
  return { projectRows, itemRows };
};

const verifyA = async () => {
  // Load the same server draft first, then seed its draft-specific browser
  // silo and reload. This keeps the real server hydration and Restore banner
  // on one stable draft ID while avoiding an unrelated "new DPR" autosave
  // write racing the seed operation.
  await navigate(`/guided?draftId=${DRAFT_A}&scenario=server-draft-reopen`);
  await waitFor(
    "!!document.querySelector('[data-testid=\"badge-editing-draft\"]')",
    "initial server draft badge before autosave seed",
  );
  await seedGuidedAutosave();
  await navigate(`/guided?draftId=${DRAFT_A}&scenario=server-draft-reopen`);
  await waitFor(
    "!!document.querySelector('[data-testid=\"badge-editing-draft\"]')",
    "server draft badge",
  );
  await waitFor(
    "!!document.querySelector('[data-testid=\"button-restore-draft\"]')",
    "Guided local autosave restore banner",
  );
  await clickTestId("button-restore-draft");
  await waitFor(
    `document.body.innerText.includes(${quote(LOCAL_AUTOSAVE_MARKER)})`,
    "local autosave A content",
  );
  await waitFor(
    `document.querySelector('[data-testid="card-entry-0"]')?.textContent.includes(${quote(LOCAL_AUTOSAVE_MARKER)})`,
    "restored A activity card",
  );
  const text = await bodyText();
  assert(containsText(text, LOCAL_AUTOSAVE_MARKER), "A did not restore the saved local activity");
  const { projectRows, itemRows } = await resolutionForRoute("draftId=" + DRAFT_A);
  assert(projectRows.some((row) =>
    row.projectIds[0] === PROJECT_B && row.projectIds.includes(PROJECT_A)
  ), `A did not receive the B-first project list: ${JSON.stringify(projectRows)}`);
  assert(
    itemRows.some((row) => row.projectId === PROJECT_A),
    `A reopened the draft without resolving persisted project A: ${JSON.stringify(itemRows)}`,
  );
  assert(
    !itemRows.some((row) => row.projectId === PROJECT_B),
    `A incorrectly loaded project B items: ${JSON.stringify(itemRows)}`,
  );
  const loadedDrafts = (await fixtureState()).loadedDrafts.filter((draft) => draft.id === DRAFT_A);
  assert(
    loadedDrafts.length > 0 && loadedDrafts.every((draft) =>
      draft.boqProjectId === PROJECT_A && draft.site === SITE
    ),
    `A server draft payload was not stable at project A/site: ${JSON.stringify(loadedDrafts)}`,
  );
  const screenshot = await captureTarget(
    "dpr04-A-server-draft-reopen-local-autosave-project-a",
    '[data-testid="card-entry-0"]',
  );
  return { screenshot, projectRows, itemRows, loadedDrafts, localMarker: LOCAL_AUTOSAVE_MARKER };
};

const verifyLocalAutosave = async () => {
  // This is deliberately a NEW DPR URL with no draftId. It first resolves
  // active Project B, then the local blob's explicit Project A preference is
  // restored and causes the real Guided hook to request A's items.
  await navigate("/guided?scenario=local-autosave-project-a");
  await waitFor(
    `window.__Dpr04Fixture?.itemRequests?.some(row => row.projectId === ${PROJECT_B} && row.route.includes("local-autosave-project-a"))`,
    "new Guided active Project B before local restore",
  );
  await seedNewGuidedAutosave();
  await navigate("/guided?scenario=local-autosave-project-a");
  await waitFor(
    "!!document.querySelector('[data-testid=\"button-restore-draft\"]')",
    "new Guided local autosave restore banner",
  );
  await clickTestId("button-restore-draft");
  await waitFor(
    `window.__Dpr04Fixture?.itemRequests?.some(row => row.projectId === ${PROJECT_A} && row.route.includes("local-autosave-project-a"))`,
    "restored local Project A items",
  );
  await waitFor(
    `document.querySelector('[data-testid="card-entry-0"]')?.textContent.includes(${quote(LOCAL_NEW_MARKER)})`,
    "new local Project A activity card",
  );
  const text = await bodyText();
  assert(containsText(text, LOCAL_NEW_MARKER), "new local autosave content was not restored");
  const { projectRows, itemRows } = await resolutionForRoute("local-autosave-project-a");
  assert(
    projectRows.some((row) => row.projectIds[0] === PROJECT_B && row.projectIds.includes(PROJECT_A)),
    `new local route did not receive the B-first active list: ${JSON.stringify(projectRows)}`,
  );
  assert(
    itemRows.some((row) => row.projectId === PROJECT_B)
      && itemRows.some((row) => row.projectId === PROJECT_A),
    `new local route did not show B-before-restore and A-after-restore item requests: ${JSON.stringify(itemRows)}`,
  );
  const screenshot = await captureTarget(
    "dpr04-A-new-local-autosave-project-a",
    '[data-testid="card-entry-0"]',
  );
  await clickTestId("button-save-draft");
  await waitFor(
    `window.__Dpr04Fixture?.persistedPayloads?.some(row => row.method === "POST" && row.path === "/api/dprs" && row.id === ${NEW_AUTOSAVE_DRAFT} && row.body?.boqProjectId === ${PROJECT_A})`,
    "new local autosave save payload with canonical Project A",
  );
  const state = await fixtureState();
  const saved = state.persistedPayloads.find((row) =>
    row.method === "POST" && row.path === "/api/dprs" && row.id === NEW_AUTOSAVE_DRAFT
  );
  assert(saved?.body?.site === SITE, "new local save payload lost the exact site");
  assert(saved?.body?.boqProjectId === PROJECT_A, "new local save payload lost Project A");
  return { screenshot, projectRows, itemRows, saved, marker: LOCAL_NEW_MARKER };
};

const verifyB = async () => {
  // B is an existing server draft. This must exercise POST
  // /api/dprs/:id/submit rather than the new-DPR POST /api/dprs route.
  await navigate(`/guided?draftId=${EXISTING_B_DRAFT}&scenario=submit-existing-no-site-work`);
  await waitFor(
    "!!document.querySelector('[data-testid=\"select-site\"]')",
    "existing Guided header",
  );
  await waitFor(
    `window.__Dpr04Fixture?.itemRequests?.some(row => row.projectId === ${PROJECT_A} && row.route.includes("submit-existing-no-site-work"))`,
    "existing draft Project A items",
  );
  const initialBState = await fixtureState();
  assert(
    initialBState.loadedDrafts.some((draft) => draft.id === EXISTING_B_DRAFT && draft.boqProjectId === PROJECT_A),
    `B did not load the existing Project A draft: ${JSON.stringify(initialBState.loadedDrafts)}`,
  );
  await clickTestId("button-step-next");
  await waitFor(
    "!!document.querySelector('[data-testid=\"button-add-activity\"]')",
    "Guided activity step",
  );
  await clickTestId("button-add-activity");
  await waitFor(
    "!!document.querySelector('[data-testid=\"checkbox-no-site-work-0\"]')",
    "No site work activity card",
  );
  await clickTestId("checkbox-no-site-work-0");
  await setInput("input-nowork-activity-0", NO_WORK_ACTIVITY);
  await setInput(
    "input-nowork-description-0",
    "NO SITE WORK — SIDE DRAIN RESTORATION AT BODAPALLY VILLAGE",
  );
  for (let index = 0; index < 4; index += 1) {
    await clickTestId("button-step-next");
    await sleep(100);
  }
  await waitFor(
    "!!document.querySelector('[data-testid=\"card-review\"]')",
    "No site work review",
  );
  const reviewText = await bodyText();
  assert(containsText(reviewText, NO_WORK_ACTIVITY), "B review missed the exact activity");
  assert(containsText(reviewText, "No site work"), "B review missed the No site work state");
  assert(containsText(reviewText, SITE), "B review missed the exact site");
  const review = await captureTarget("dpr04-B-submit-no-site-work-review", '[data-testid="card-review"]');
  await clickTestId("button-submit");
  await waitFor(
    `window.__Dpr04Fixture?.persistedPayloads?.some(row => row.method === "POST" && row.path === "/api/dprs/${EXISTING_B_DRAFT}/submit" && row.body?.boqProjectId === ${PROJECT_A})`,
    "B submitted existing-draft payload with project A",
  );
  await waitFor(
    `window.location.pathname === "/site/success/${EXISTING_B_DRAFT}"`,
    "B success route",
  );
  await waitFor(
    "document.body.innerText.includes('Report Saved Successfully')",
    "B success message",
  );
  const successCardMarked = await evaluate(`(() => {
    const button = document.querySelector('[data-testid="button-view-report"]');
    const card = button?.closest("div.max-w-md");
    if (!card) return false;
    card.setAttribute("data-testid", "success-card-target");
    return true;
  })()`);
  assert(successCardMarked, "B success card was not found");
  const success = await captureTarget("dpr04-B-submit-success", '[data-testid="success-card-target"]');

  // Keep this route transition inside the same fixture document so the
  // in-memory POST record is still available to the real SiteReport loader.
  // A full Page.navigate would correctly model a new browser document, but
  // would intentionally discard this fixture's browser-memory mutation.
  await evaluate("window.__Dpr04ClearBoqQueries?.()");
  await clickTestId("button-view-report");
  await waitFor(
    `window.location.pathname === "/site/report/${EXISTING_B_DRAFT}"`,
    "B report route from success screen",
  );
  await waitFor(
    `!!document.querySelector('[data-testid="row-progress-0"]') && document.body.innerText.includes(${quote(NO_WORK_ACTIVITY)})`,
    "B persisted success report",
  );
  const reportText = await bodyText();
  assert(containsText(reportText, "No site work"), "B report missed No site work");
  assert(containsText(reportText, SITE), "B report missed exact site");
  assert(containsText(reportText, NO_WORK_ACTIVITY), "B report missed exact activity");
  const report = await captureTarget("dpr04-B-submit-persisted-report", '[data-testid="row-progress-0"]');
  const { projectRows, itemRows } = await resolutionForRoute(`report/${EXISTING_B_DRAFT}`);
  assert(projectRows.some((row) => row.projectIds.includes(PROJECT_A)), `B report did not resolve project A: ${JSON.stringify(projectRows)}`);
  assert(itemRows.some((row) => row.projectId === PROJECT_A), `B report did not request project A items: ${JSON.stringify(itemRows)}`);
  const bState = await fixtureState();
  const submitPayload = bState.persistedPayloads.find((row) =>
    row.method === "POST" && row.path === `/api/dprs/${EXISTING_B_DRAFT}/submit`
  );
  assert(submitPayload?.body?.boqProjectId === PROJECT_A, "B captured submit payload lost Project A");
  assert(
    !bState.persistedPayloads.some((row) =>
      row.method === "POST"
      && row.path === "/api/dprs"
      && row.body?.progress?.some((progress) => progress.activity === NO_WORK_ACTIVITY)
    ),
    "B unexpectedly used the new-DPR create route",
  );
  return { review, success, report, projectRows, itemRows, persistedId: EXISTING_B_DRAFT, submitPayload };
};

const verifyD = async () => {
  await navigate(`/site/edit/${EDIT_DRAFT}?draft&scenario=edit-draft-save`);
  await waitFor(
    "!!document.querySelector('[data-testid=\"button-save-draft-progress\"]')",
    "D SiteEdit draft actions",
  );
  await waitFor(
    "!!document.querySelector('[data-testid=\"progress-row-0\"]')",
    "D SiteEdit draft row",
  );
  const before = await bodyText();
  const beforeActivity = await evaluate(
    "document.querySelector('[data-testid=\"input-nowork-activity-0\"]')?.value || ''",
  );
  assert(beforeActivity === "EDIT DRAFT ACTIVITY", "D loaded the wrong draft fixture");
  assert(containsText(before, SITE), "D edit screen missed the exact site");
  await setInput("input-description-0", EDIT_MARKER);
  await waitFor(
    `document.querySelector('[data-testid="input-description-0"]')?.value === ${quote(EDIT_MARKER)}`,
    "D edited draft description",
  );
  const edit = await captureTarget("dpr04-D-edit-draft-before-save", '[data-testid="progress-row-0"]');
  await clickTestId("button-save-draft-progress");
  await waitFor(
    `window.__Dpr04Fixture?.persistedPayloads?.some(row => row.method === "PATCH" && row.path === "/api/dprs/${EDIT_DRAFT}/draft")`,
    "D draft save fixture request",
  );
  const state = await fixtureState();
  const saved = state.persistedPayloads.find((row) =>
    row.method === "PATCH" && row.path === `/api/dprs/${EDIT_DRAFT}/draft`
  );
  assert(saved?.body?.boqProjectId === PROJECT_A, `D draft save changed project: ${JSON.stringify(saved?.body)}`);
  assert(saved?.body?.progress?.[0]?.noSiteWork === true, "D draft save lost No site work");
  assert(saved?.body?.progress?.[0]?.boqItemId == null, "D draft save unexpectedly assigned a BOQ item");
  assert(
    saved?.body?.progress?.[0]?.noSiteWorkDescription === EDIT_MARKER,
    `D draft save lost the edited description: ${JSON.stringify(saved?.body?.progress?.[0])}`,
  );
  const { projectRows, itemRows } = await resolutionForRoute(`edit/${EDIT_DRAFT}`);
  assert(itemRows.some((row) => row.projectId === PROJECT_A), "D edit did not resolve project A items");
  return { edit, saved, projectRows, itemRows, draftId: EDIT_DRAFT };
};

const verifyE = async () => {
  await navigate("/site/report/8462?scenario=single-project");
  await waitFor(
    "!!document.querySelector('[data-testid=\"row-progress-0\"]')",
    "E single-project report",
  );
  const text = await bodyText();
  assert(containsText(text, "SINGLE PROJECT REPORT"), "E single-project report row missing");
  const { projectRows, itemRows } = await resolutionForRoute("report/8462");
  assert(
    projectRows.some((row) => row.scenario === "single-project" && row.projectIds.length === 1 && row.projectIds[0] === PROJECT_A),
    `E did not receive exactly one project A: ${JSON.stringify(projectRows)}`,
  );
  assert(
    itemRows.some((row) => row.projectId === PROJECT_A),
    `E did not load single project A items: ${JSON.stringify(itemRows)}`,
  );
  assert(
    !itemRows.some((row) => row.projectId === PROJECT_B),
    `E loaded distractor project B items: ${JSON.stringify(itemRows)}`,
  );
  const screenshot = await captureTarget("dpr04-E-single-project-report", '[data-testid="row-progress-0"]');
  return { screenshot, projectRows, itemRows };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const A = await verifyA();
const Local = await verifyLocalAutosave();
const B = await verifyB();
const D = await verifyD();
const E = await verifyE();

const finalState = await fixtureState();
const allowedWrites = new Set([
  "/api/dprs",
  `/api/dprs/${EXISTING_B_DRAFT}/submit`,
  `/api/dprs/${EDIT_DRAFT}/draft`,
]);
assert(
  finalState?.writes?.every((row) => allowedWrites.has(row.path)),
  `Unexpected fixture write route: ${JSON.stringify(finalState?.writes)}`,
);
assert(finalState?.customerWrites === false, "Fixture claimed customer writes");
assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);

const evidence = {
  scenario: "DPR-04 draft/project resolution isolated browser evidence",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    productionDatabaseUsed: false,
    customerWrites: false,
    fixtureData: "Synthetic TAKKADPALLY-SIRUR / Project A+B rows; no customer records.",
    evidenceDirectory: evidenceDir,
  },
  screenshots: {
    A_serverDraftReopenLocalAutosave: A.screenshot,
    A_newLocalAutosaveProjectA: Local.screenshot,
    B_submitReview: B.review,
    B_submitSuccess: B.success,
    B_persistedSuccessReport: B.report,
    D_editDraftBeforeSave: D.edit,
    E_singleProjectReport: E.screenshot,
  },
  resolvedIds: {
    projectA: PROJECT_A,
    projectBListFirstDistractor: PROJECT_B,
    A_serverDraftReopen: {
      projectRows: A.projectRows,
      itemRows: A.itemRows,
      loadedDrafts: A.loadedDrafts,
    },
    A_newLocalAutosaveProjectA: {
      projectRows: Local.projectRows,
      itemRows: Local.itemRows,
      savePayload: Local.saved,
    },
    B_submitReport: {
      projectRows: B.projectRows,
      itemRows: B.itemRows,
      persistedId: B.persistedId,
      submitPayload: B.submitPayload,
    },
    D_editDraft: { projectRows: D.projectRows, itemRows: D.itemRows },
    E_singleProject: { projectRows: E.projectRows, itemRows: E.itemRows },
  },
  assertions: {
    A: "A server draft reopened through GuidedDpr restores local saved-A content while the B-first API list resolves persisted project A.",
    localAutosave: "A NEW Guided route with no draftId restores a blob explicitly carrying Project A, changes item resolution from active-list Project B to A, and captures a Project A save payload.",
    B: "An EXISTING draft submits through POST /api/dprs/8463/submit (not new create), preserving SIDE DRAIN RESTORATION AT BODAPALLY VILLAGE, TAKKADPALLY-SIRUR, and Project A through success/report.",
    D: "SiteEdit reopened the synthetic draft, saved a no-BOQ progress row through the same draft id, and preserved canonical Project A.",
    E: "A single-project API response resolves exactly Project A and never loads Project B items.",
    writes: "Only in-memory fixture POST /api/dprs (local NEW save), POST /api/dprs/8463/submit (existing B), and PATCH /api/dprs/8461/draft (D) were issued; no customer or production writes occurred.",
    browserExceptions: "No Runtime.exceptionThrown events.",
  },
  evidence: { A, Local, B, D, E },
};
writeFileSync(
  path.join(evidenceDir, "dpr04-result.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
writeFileSync(
  path.join(evidenceDir, "dpr04-request-log.json"),
  `${JSON.stringify({
    requests: finalState.requests,
    writes: finalState.writes,
    loadedDrafts: finalState.loadedDrafts,
    projectResponses: finalState.projectResponses,
    itemRequests: finalState.itemRequests,
    persistedPayloads: finalState.persistedPayloads,
  }, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
socket.close();