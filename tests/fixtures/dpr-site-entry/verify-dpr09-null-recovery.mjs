/*
 * DPR-09 automatic saved-null recovery browser evidence.
 *
 * This verifier is intentionally separate from the older saved-null verifier.
 * DPR-08 removed the manual BOQ-project chooser. DPR-09 covers both the
 * literal empty-draft path (saved null stays null until the first item is
 * chosen, while the site's catalogue is available) and evidence-based
 * recovery when the currently hydrated DPR data already contains a real BOQ
 * item reference. No-reference No Site Work / Incidental rows remain null and
 * do not render a picker.
 *
 * The fixture adapter is browser-only and session-persisted. It does not call
 * an operational server or database and it does not write customer data.
 *
 * Run with:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178 --strictPort
 *   node tests/fixtures/dpr-site-entry/verify-dpr09-null-recovery.mjs
 *
 * The client/server workers' real-DB validation is reported independently from
 * this fixture-only evidence by the owning agent.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort = process.env.DPR09_CDP_PORT
  || process.env.DPR_BOQ_CDP_PORT
  || process.env.DPR_NULL_CDP_PORT
  || "9222";
const viewport = { width: 1440, height: 1000, mobile: false };
const recoveryProjectId = 5510;
const recoveryProjectName = "ALLADURG PWD ROAD TO PAMPAD BOQ";
const recoverySiteName = "ALLADURG PWD ROAD TO PAMPAD";
const liveBoqItemId = 8801;
const liveBoqItemName = "GSB LAYING";
const guidedLiveDraftId = 6230;
const siteEditLiveDraftId = 6231;
const guidedNoSiteWorkDraftId = 6232;
const siteEditIncidentalDraftId = 6233;
const positiveProjectDraftId = 6234;
const literalFreshDraftId = 6240;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

let targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
let page = targets.find((target) => target.type === "page" && target.url === "about:blank");
if (!page) {
  await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" });
  targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  page = targets.find((target) => target.type === "page" && target.url === "about:blank")
    || targets.find((target) => target.type === "page");
}
if (!page) throw new Error(`Chromium did not expose a page target on CDP port ${cdpPort}`);

// Close stale fixture tabs so an old autosave connection cannot race the
// browser-only local-draft seed below.
await Promise.all(
  targets
    .filter((target) => target.type === "page" && target.id !== page.id)
    .map((target) => fetch(`http://127.0.0.1:${cdpPort}/json/close/${target.id}`).catch(() => null)),
);
await sleep(100);

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
  message.error
    ? callback.reject(new Error(message.error.message))
    : callback.resolve(message.result);
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result?.value;
};

const fixtureState = () => evaluate("window.__DprSiteFixture || null");

const waitFor = async (expression, label, attempts = 300) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 3500) || ''");
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

const chooseSelectOption = async (triggerTestId, optionText, stage) => {
  await clickTestId(triggerTestId);
  await waitFor(
    `Array.from(document.querySelectorAll('[role="option"]')).some((node) => (node.textContent || "").toLowerCase().includes(${quote(optionText.toLowerCase())}))`,
    `${stage} ${triggerTestId} options`,
  );
  const selected = await evaluate(`(() => {
    const expected = ${quote(optionText.toLowerCase())};
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find((node) => (node.textContent || "").toLowerCase().includes(expected));
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(selected, `${stage} could not choose ${optionText} from ${triggerTestId}`);
};

const chooseBoqItem = async (prefix, stage) => {
  await clickTestId(`${prefix}-item-select`);
  await waitFor(
    `!!document.querySelector('[data-testid="option-boq-item-${liveBoqItemId}"]')`,
    `${stage} BOQ item catalogue`,
  );
  const catalogue = await evaluate(`(() => {
    const node = document.querySelector('[data-testid="option-boq-item-${liveBoqItemId}"]');
    return { present: !!node, text: node?.textContent?.trim() || "" };
  })()`);
  assert(
    catalogue.text.toLowerCase().includes(liveBoqItemName.toLowerCase()),
    `${stage} catalogue omitted ${liveBoqItemName}: ${JSON.stringify(catalogue)}`,
  );
  await clickTestId(`option-boq-item-${liveBoqItemId}`);
  return catalogue;
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const navigate = async (pathname) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitFor("document.readyState === 'complete'", `${pathname} document`);
  await waitFor(
    "!!document.querySelector('[data-testid=\"dpr09-evidence-banner\"]')",
    `${pathname} DPR-09 fixture banner`,
  );
};

const getDpr = async (id) => evaluate(`fetch("/api/dprs/${id}", { credentials: "include" }).then(async response => ({
  ok: response.ok,
  status: response.status,
  data: await response.json(),
}))`);

const requestProjectIdsSince = async (requestStart) => {
  const state = await fixtureState();
  const requests = state?.requests || [];
  // A full Page.navigate remounts the fixture and resets its in-memory
  // request recorder. Every scenario uses a fresh route/document, so the
  // current document's complete item-request set is the reliable boundary;
  // requestStart remains in the signature for readable scenario call sites.
  void requestStart;
  return requests
    .filter((request) => request.method === "GET" && /\/api\/boq\/projects\/\d+\/items$/.test(request.path))
    .map((request) => Number(request.path.match(/\/projects\/(\d+)\/items$/)?.[1]))
    .filter(Number.isFinite);
};

const assertNoManualProjectUi = async (stage) => {
  const state = await evaluate(`(() => {
    const body = document.body?.innerText || "";
    return {
      hasProjectSelector: !!document.querySelector('[data-testid="dpr-boq-project-select"]'),
      hasStatusPanel: !!document.querySelector('[data-testid="dpr-boq-status"]'),
      hasRecoveryDialog: !!document.querySelector('[data-testid="dpr-boq-project-recovery-confirm"]')
        || !!document.querySelector('[data-testid="button-confirm-boq-project-recovery"]'),
      visibleManualProjectCopy: /select boq project|attach this dpr to a boq project|confirm a boq project before/i.test(body),
      bodyExcerpt: body.slice(0, 1800),
    };
  })()`);
  assert(!state.hasProjectSelector, `${stage} rendered a manual project selector: ${JSON.stringify(state)}`);
  assert(!state.hasStatusPanel, `${stage} rendered a BOQ status/manual recovery panel: ${JSON.stringify(state)}`);
  assert(!state.hasRecoveryDialog, `${stage} rendered a manual recovery dialog: ${JSON.stringify(state)}`);
  assert(!state.visibleManualProjectCopy, `${stage} rendered manual project copy: ${JSON.stringify(state)}`);
  return state;
};

const readPicker = async (testId) => evaluate(`(() => {
  const node = document.querySelector('[data-testid=${quote(testId)}]');
  return {
    present: !!node,
    text: node?.textContent?.trim() || "",
    value: node?.getAttribute("data-value") || null,
    disabled: !!node?.disabled,
  };
})()`);

const assertLivePicker = async (prefix, stage) => {
  const pickerTestId = `${prefix}-item-select`;
  await waitFor(`!!document.querySelector('[data-testid=${quote(pickerTestId)}]')`, `${stage} live BOQ picker`);
  const picker = await readPicker(pickerTestId);
  assert(
    picker.text.toLowerCase().includes(liveBoqItemName.toLowerCase()),
    `${stage} did not retain ${liveBoqItemName} in the BOQ picker: ${JSON.stringify(picker)}`,
  );
  return picker;
};

const assertGuidedLiveReference = async (stage) => {
  const pickerTestId = "guided-progress-0-item-select";
  await waitFor(
    `!!document.querySelector('[data-testid=${quote(pickerTestId)}]')
      || !!document.querySelector('[data-testid="guided-0-linked-summary"]')`,
    `${stage} live BOQ picker or linked context`,
  );
  const pickerPresent = await evaluate(
    `!!document.querySelector('[data-testid=${quote(pickerTestId)}]')`,
  );
  if (pickerPresent) {
    return assertLivePicker("guided-progress-0", stage);
  }

  // Guided hides the item picker once its live BOQ row is linked to a
  // programme reach. In that state the saved BOQ item is represented by the
  // real programme-context summary instead of a second picker control.
  const summary = await evaluate(`(() => {
    const node = document.querySelector('[data-testid="guided-0-linked-summary"]');
    return { present: !!node, text: node?.textContent?.trim() || "" };
  })()`);
  assert(summary.text.length > 0, `${stage} rendered an empty linked BOQ context: ${JSON.stringify(summary)}`);
  return { present: false, linkedContext: summary.text };
};

const assertNoPicker = async (prefix, stage) => {
  await sleep(250);
  const state = await evaluate(`(() => ({
    picker: !!document.querySelector('[data-testid=${quote(`${prefix}-item-select`)}]'),
    noWorkInput: !!document.querySelector('[data-testid="input-nowork-activity-0"]'),
    incidentalInput: !!document.querySelector('[data-testid="input-incidental-description-0"]')
      || !!document.querySelector('[data-testid="input-description-0"]'),
    activityInput: !!document.querySelector('[data-testid="input-activity-0"]')
      || !!document.querySelector('[data-testid="input-progress-activity-0"]'),
  }))()`);
  assert(!state.picker, `${stage} rendered a BOQ item picker despite having no BOQ reference: ${JSON.stringify(state)}`);
  return state;
};

const assertRecoveredProjects = async (requestStart, stage, { reject = [] } = {}) => {
  const projectIds = await requestProjectIdsSince(requestStart);
  assert(
    projectIds.includes(recoveryProjectId),
    `${stage} did not request live items for ${recoveryProjectName}: ${JSON.stringify(projectIds)}`,
  );
  for (const rejected of reject) {
    assert(!projectIds.includes(rejected), `${stage} requested an unexpected BOQ project ${rejected}: ${JSON.stringify(projectIds)}`);
  }
  return projectIds;
};

const verifyLiteralGuidedEmptyDraftRecovery = async () => {
  const scenario = "dpr09-A-literal-guided-empty-save-then-live-boq-item";
  const freshPath = `/guided?dpr09=1&dpr09Literal=1&scenario=${scenario}&section=report`;
  await navigate(freshPath);
  await waitFor(
    `((document.querySelector('[data-testid="select-site"]')?.textContent || "").toLowerCase().includes(${quote(recoverySiteName.toLowerCase())}))`,
    "literal fresh Guided site",
  );
  await chooseSelectOption("select-engineer", "SURESH KUMAR", scenario);
  await clickTestId("button-step-next");
  await waitFor("!!document.querySelector('[data-testid=\"button-add-activity\"]')", "literal empty activity step");
  await clickTestId("button-add-activity");
  await waitFor("!!document.querySelector('[data-testid=\"guided-progress-0-item-select\"]')", "literal empty activity picker");
  const freshUi = await assertNoManualProjectUi(`${scenario} before save`);
  const freshImage = await capture("dpr09-A-literal-guided-fresh-empty");
  const beforeCreates = (await fixtureState()).dpr09LiteralCreatePayloads?.length || 0;

  // This is the literal first save: the activity row exists but has no BOQ
  // item evidence. The fixture's POST route deliberately persists an explicit
  // null even if the fresh client sends its deterministic site fallback.
  await clickTestId("button-save-draft");
  await waitFor(
    `window.__DprSiteFixture?.dpr09LiteralCreatePayloads?.length >= ${beforeCreates + 1}`,
    "literal empty Guided POST save",
  );
  const literalCreate = (await fixtureState()).dpr09LiteralCreatePayloads.at(-1);
  assert(literalCreate?.id === literalFreshDraftId, `Literal empty save used unexpected id: ${JSON.stringify(literalCreate)}`);
  assert(
    literalCreate?.requestedPayload?.progress?.length === 1
      && literalCreate.requestedPayload.progress.every((row) => row?.boqItemId == null && !String(row?.activity || "").trim()),
    `Literal empty save did not contain exactly one unlinked, empty progress row: ${JSON.stringify(literalCreate)}`,
  );
  assert(
    literalCreate?.persistedPayload?.boqProjectId === null && literalCreate?.enforcedNull === true,
    `Fixture did not enforce explicit null for literal empty POST: ${JSON.stringify(literalCreate)}`,
  );
  const firstSaved = await getDpr(literalFreshDraftId);
  assert(
    firstSaved.ok
      && firstSaved.data.boqProjectId === null
      && firstSaved.data.progress?.length === 1
      && firstSaved.data.progress[0]?.boqItemId == null,
    `Literal empty saved draft was not null/no-item: ${JSON.stringify(firstSaved)}`,
  );

  // Reopen the same server draft. It must stay null before the first real BOQ
  // selection, but its site's catalogue must now be available to choose from.
  const reopenPath = `/guided?draftId=${literalFreshDraftId}&dpr09=1&dpr09Literal=1&scenario=${scenario}&section=activities`;
  await navigate(reopenPath);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "literal null draft before item");
  const reopenedBeforeItemUi = await assertNoManualProjectUi(`${scenario} before item`);
  await waitFor("!!document.querySelector('[data-testid=\"guided-progress-0-item-select\"]')", "literal reopened empty-row catalogue");
  const reopenedBeforeItemPicker = await readPicker("guided-progress-0-item-select");
  assert(
    reopenedBeforeItemPicker.present
      && !reopenedBeforeItemPicker.text.toLowerCase().includes(liveBoqItemName.toLowerCase()),
    `Literal null draft unexpectedly had a selected BOQ item before first selection: ${JSON.stringify(reopenedBeforeItemPicker)}`,
  );
  const beforeItemImage = await capture("dpr09-A-literal-guided-reopened-null");

  const catalogue = await chooseBoqItem("guided-progress-0", scenario);
  const catalogueImage = await capture("dpr09-A-literal-guided-boq-catalogue");
  const beforeMutations = (await fixtureState()).dprRecoveryPayloads?.length || 0;

  await clickTestId("button-save-draft");
  await waitFor(
    `window.__DprSiteFixture?.dprRecoveryPayloads?.length >= ${beforeMutations + 1}`,
    "literal selected-item PATCH save",
  );
  const mutation = (await fixtureState()).dprRecoveryPayloads.at(-1);
  assert(mutation?.id === literalFreshDraftId, `Literal selected-item save used wrong id: ${JSON.stringify(mutation)}`);
  assert(
    mutation?.payload?.boqProjectId === recoveryProjectId,
    `Literal selected-item save did not persist project ${recoveryProjectId}: ${JSON.stringify(mutation?.payload)}`,
  );
  assert(
    mutation?.payload?.progress?.[0]?.boqItemId === liveBoqItemId,
    `Literal selected-item save did not persist BOQ item ${liveBoqItemId}: ${JSON.stringify(mutation?.payload)}`,
  );
  const selectedSaved = await getDpr(literalFreshDraftId);
  assert(
    selectedSaved.ok
      && selectedSaved.data.boqProjectId === recoveryProjectId
      && selectedSaved.data.progress?.[0]?.boqItemId === liveBoqItemId,
    `Literal selected-item record was not durable: ${JSON.stringify(selectedSaved)}`,
  );

  // The same id must reopen in Detailed/Edit, then remain positive when Guided
  // is loaded again. No route-local or duplicate draft may satisfy this check.
  const editPath = `/site/edit/${literalFreshDraftId}?draft&dpr09=1&dpr09Literal=1&scenario=${scenario}-edit`;
  await navigate(editPath);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "literal same-id Detailed/Edit row");
  const editUi = await assertNoManualProjectUi(`${scenario} Detailed/Edit`);
  const editPicker = await assertLivePicker("edit-progress-0", `${scenario} Detailed/Edit`);
  const editImage = await capture("dpr09-A-literal-site-edit-same-id");

  const guidedReloadPath = `/guided?draftId=${literalFreshDraftId}&dpr09=1&dpr09Literal=1&scenario=${scenario}-guided-reload&section=activities`;
  await navigate(guidedReloadPath);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "literal same-id Guided reload row");
  const guidedReloadUi = await assertNoManualProjectUi(`${scenario} Guided reload`);
  const guidedReloadReference = await assertGuidedLiveReference(`${scenario} Guided reload`);
  const guidedReloadImage = await capture("dpr09-A-literal-guided-same-id-reload");
  const guidedReload = await getDpr(literalFreshDraftId);
  assert(
    guidedReload.ok
      && guidedReload.data.boqProjectId === recoveryProjectId
      && guidedReload.data.progress?.[0]?.boqItemId === liveBoqItemId,
    `Literal same-id Guided reload lost project/item: ${JSON.stringify(guidedReload)}`,
  );
  const projectIds = await requestProjectIdsSince(0);
  assert(projectIds.includes(recoveryProjectId), `Literal selected-item reload did not request recovery project items: ${JSON.stringify(projectIds)}`);

  return {
    freshUi,
    freshImage,
    literalCreate,
    firstSaved,
    reopenedBeforeItemUi,
    reopenedBeforeItemPicker,
    beforeItemImage,
    catalogue,
    catalogueImage,
    mutation,
    selectedSaved,
    editUi,
    editPicker,
    editImage,
    guidedReloadUi,
    guidedReloadReference,
    guidedReloadImage,
    guidedReload,
    projectIds,
  };
};

const verifyGuidedSavedNullLiveReference = async () => {
  const scenario = "dpr09-A-guided-saved-null-live-reference";
  const pathName = `/guided?draftId=${guidedLiveDraftId}&dpr09=1&scenario=${scenario}&section=activities`;
  const original = await getDpr(guidedLiveDraftId);
  assert(original.ok, `Guided fixture record was not available: ${JSON.stringify(original)}`);
  assert(original.data.boqProjectId === null, `Guided fixture did not start with explicit null: ${JSON.stringify(original.data)}`);
  assert(original.data.progress?.[0]?.boqItemId === liveBoqItemId, "Guided fixture did not contain the synthetic live BOQ reference");

  const requestStart = (await fixtureState()).requests.length;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "Guided saved-null/live row");
  const ui = await assertNoManualProjectUi(scenario);
  const picker = await assertGuidedLiveReference(scenario);
  const beforeImage = await capture("dpr09-A-guided-live-reference");
  const beforeMutations = (await fixtureState()).dprRecoveryPayloads?.length || 0;

  await clickTestId("button-save-draft");
  await waitFor(
    `window.__DprSiteFixture?.dprRecoveryPayloads?.length >= ${beforeMutations + 1}`,
    "Guided recovered draft mutation",
  );
  const mutation = (await fixtureState()).dprRecoveryPayloads.at(-1);
  assert(mutation?.id === guidedLiveDraftId, `Guided recovery saved the wrong DPR id: ${JSON.stringify(mutation)}`);
  assert(
    mutation?.payload?.boqProjectId === recoveryProjectId,
    `Guided recovery did not persist project ${recoveryProjectId}: ${JSON.stringify(mutation?.payload)}`,
  );
  assert(
    mutation?.payload?.progress?.[0]?.boqItemId === liveBoqItemId,
    "Guided recovery did not preserve the live BOQ item reference",
  );
  const saved = await getDpr(guidedLiveDraftId);
  assert(saved.ok && saved.data.boqProjectId === recoveryProjectId, `Guided recovery was not durable: ${JSON.stringify(saved)}`);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "Guided recovered row after reload");
  const reopenedUi = await assertNoManualProjectUi(`${scenario} after reload`);
  const reopenedPicker = await assertGuidedLiveReference(`${scenario} after reload`);
  const reopenedImage = await capture("dpr09-A-guided-live-reference-reopened");
  const projectIds = await assertRecoveredProjects(requestStart, scenario, { reject: [5511, 5502] });
  return { original, ui, picker, beforeImage, mutation, saved, reopenedUi, reopenedPicker, reopenedImage, projectIds };
};

const verifySiteEditSavedNullLiveReference = async () => {
  const scenario = "dpr09-B-site-edit-saved-null-live-reference";
  const pathName = `/site/edit/${siteEditLiveDraftId}?draft&dpr09=1&scenario=${scenario}`;
  const original = await getDpr(siteEditLiveDraftId);
  assert(original.ok, `SiteEdit fixture record was not available: ${JSON.stringify(original)}`);
  assert(original.data.boqProjectId === null, `SiteEdit fixture did not start with explicit null: ${JSON.stringify(original.data)}`);
  assert(original.data.progress?.[0]?.boqItemId === liveBoqItemId, "SiteEdit fixture did not contain the synthetic live BOQ reference");

  const requestStart = (await fixtureState()).requests.length;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "SiteEdit saved-null/live row");
  const ui = await assertNoManualProjectUi(scenario);
  const picker = await assertLivePicker("edit-progress-0", scenario);
  const beforeImage = await capture("dpr09-B-site-edit-live-reference");
  const beforeMutations = (await fixtureState()).dprRecoveryPayloads?.length || 0;

  await clickTestId("button-save-draft-progress");
  await waitFor(
    `window.__DprSiteFixture?.dprRecoveryPayloads?.length >= ${beforeMutations + 1}`,
    "SiteEdit recovered draft mutation",
  );
  const mutation = (await fixtureState()).dprRecoveryPayloads.at(-1);
  assert(mutation?.id === siteEditLiveDraftId, `SiteEdit recovery saved the wrong DPR id: ${JSON.stringify(mutation)}`);
  assert(
    mutation?.payload?.boqProjectId === recoveryProjectId,
    `SiteEdit recovery did not persist project ${recoveryProjectId}: ${JSON.stringify(mutation?.payload)}`,
  );
  assert(
    mutation?.payload?.progress?.[0]?.boqItemId === liveBoqItemId,
    "SiteEdit recovery did not preserve the live BOQ item reference",
  );
  const saved = await getDpr(siteEditLiveDraftId);
  assert(saved.ok && saved.data.boqProjectId === recoveryProjectId, `SiteEdit recovery was not durable: ${JSON.stringify(saved)}`);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "SiteEdit recovered row after reload");
  const reopenedUi = await assertNoManualProjectUi(`${scenario} after reload`);
  const reopenedPicker = await assertLivePicker("edit-progress-0", `${scenario} after reload`);
  const reopenedImage = await capture("dpr09-B-site-edit-live-reference-reopened");
  const projectIds = await assertRecoveredProjects(requestStart, scenario, { reject: [5511, 5502] });
  return { original, ui, picker, beforeImage, mutation, saved, reopenedUi, reopenedPicker, reopenedImage, projectIds };
};

const verifyNoBoqReferenceProtection = async () => {
  const scenario = "dpr09-C-no-site-work-and-incidental-null-protection";
  const guidedPath = `/guided?draftId=${guidedNoSiteWorkDraftId}&dpr09=1&scenario=${scenario}-guided&section=activities`;
  const guidedRequestStart = (await fixtureState()).requests.length;
  const guidedOriginal = await getDpr(guidedNoSiteWorkDraftId);
  assert(guidedOriginal.data.boqProjectId === null, "No-site-work fixture must start with explicit null");
  await navigate(guidedPath);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "Guided no-site-work row");
  const guidedUi = await assertNoManualProjectUi(`${scenario} Guided`);
  const guidedNoPicker = await assertNoPicker("guided-progress-0", `${scenario} Guided`);
  const guidedImage = await capture("dpr09-C-guided-no-site-work-null");
  const guidedItems = await requestProjectIdsSince(guidedRequestStart);
  assert(!guidedItems.includes(recoveryProjectId), `Guided no-site-work guessed a BOQ project: ${JSON.stringify(guidedItems)}`);

  const editPath = `/site/edit/${siteEditIncidentalDraftId}?draft&dpr09=1&scenario=${scenario}-edit`;
  const editRequestStart = (await fixtureState()).requests.length;
  const editOriginal = await getDpr(siteEditIncidentalDraftId);
  assert(editOriginal.data.boqProjectId === null, "Incidental fixture must start with explicit null");
  await navigate(editPath);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "SiteEdit incidental row");
  const editUi = await assertNoManualProjectUi(`${scenario} SiteEdit`);
  const editNoPicker = await assertNoPicker("edit-progress-0", `${scenario} SiteEdit`);
  const editImage = await capture("dpr09-C-site-edit-incidental-null");
  const editItems = await requestProjectIdsSince(editRequestStart);
  assert(!editItems.includes(recoveryProjectId), `SiteEdit incidental row guessed a BOQ project: ${JSON.stringify(editItems)}`);

  return {
    guided: { original: guidedOriginal, ui: guidedUi, noPicker: guidedNoPicker, image: guidedImage, projectIds: guidedItems },
    siteEdit: { original: editOriginal, ui: editUi, noPicker: editNoPicker, image: editImage, projectIds: editItems },
  };
};

const seedDetailedLocalDraft = async (localDraft, label) => {
  // Leave the mounted React form before changing browser-only storage. Delete
  // IndexedDB first so an older verifier's value cannot shadow this fixture.
  await cdp("Page.navigate", { url: `${baseUrl}/favicon.ico?dpr09-storage=${Date.now()}&label=${encodeURIComponent(label)}` });
  await waitFor("document.readyState === 'complete'", `${label} local storage document`);
  await evaluate(`(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = request.onupgradeneeded = () => resolve();
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("keyval")) {
          database.close();
          resolve();
          return;
        }
        const transaction = database.transaction("keyval", "readwrite");
        transaction.objectStore("keyval").delete("autosave_site-entry-new");
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
          database.close();
          resolve();
        };
      };
    });
    localStorage.setItem("autosave_site-entry-new", ${quote(JSON.stringify(localDraft))});
    return true;
  })()`);
};

const seedDetailedLocalNullWithLiveReference = async () => seedDetailedLocalDraft({
  formKey: "site-entry-new",
  savedAt: Date.now(),
  version: 1,
  data: {
      header: {
        date: "2026-08-12",
        site: recoverySiteName,
        engineer: "SURESH KUMAR - ENGINEER",
        boqProjectId: null,
      },
      workType: "road",
      progress: [{
        entryKey: "dpr09-local-live-boq-progress",
        activity: liveBoqItemName,
        side: "LHS",
        chainageFrom: "12+000",
        chainageTo: "12+100",
        length: 100,
        width: 7,
        thickness: 20,
        quantity: 700,
        uom: "SQM",
        noSiteWork: false,
        noSiteWorkDescription: "",
        personnelIds: [6101],
        boqItemId: liveBoqItemId,
        programmeBarId: null,
        earthworkArrangementId: null,
        quantitySource: "measured",
        quantitySourceNote: "",
        chainageOverrideReason: "",
        lengthOverrideReason: "",
        uomOverrideReason: "",
        executedBy: "hlc",
        layerNo: null,
        isIncidental: false,
        incidentalDescription: "",
      }],
      structureItems: [],
      equipment: [],
      labour: [],
      materials: [],
      sitePurchases: [],
    },
  }, "Detailed local live-reference");

const seedDetailedLocalEmptyDraft = async () => seedDetailedLocalDraft({
  formKey: "site-entry-new",
  savedAt: Date.now(),
  version: 1,
  data: {
    header: {
      date: "2026-08-12",
      site: recoverySiteName,
      engineer: "SURESH KUMAR - ENGINEER",
      boqProjectId: null,
    },
    workType: "road",
    progress: [],
    structureItems: [],
    equipment: [],
    labour: [],
    materials: [],
    sitePurchases: [],
  },
}, "Detailed local empty");

const readDetailedLocalAutosave = async () => evaluate(`(async () => {
  try {
    const value = await new Promise((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("keyval")) {
          database.close();
          resolve(null);
          return;
        }
        const transaction = database.transaction("keyval", "readonly");
        const getRequest = transaction.objectStore("keyval").get("autosave_site-entry-new");
        getRequest.onsuccess = () => {
          database.close();
          resolve(getRequest.result || null);
        };
        getRequest.onerror = () => {
          database.close();
          reject(getRequest.error);
        };
      };
    });
    return value;
  } catch {
    return null;
  }
})()`);

const verifyDetailedLocalRestoreLiveReference = async () => {
  const scenario = "dpr09-D-detailed-local-restore-live-reference";
  const pathName = `/site/new?dpr09=1&scenario=${scenario}&type=road`;
  await seedDetailedLocalNullWithLiveReference();
  const requestStart = (await fixtureState()).requests.length;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", "Detailed local live-reference restore banner");
  const beforeImage = await capture("dpr09-D-detailed-local-before-restore");
  await clickTestId("button-restore-draft");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "Detailed local restored row");
  const ui = await assertNoManualProjectUi(scenario);
  const picker = await assertLivePicker("progress-0", scenario);
  const selectedImage = await capture("dpr09-D-detailed-local-live-reference");
  const projectIds = await assertRecoveredProjects(requestStart, scenario);

  // Let the real autosave debounce write, then reload the same fresh-DPR route.
  await sleep(1300);
  const persisted = await readDetailedLocalAutosave();
  assert(
    persisted?.data?.progress?.[0]?.boqItemId === liveBoqItemId,
    `Detailed local autosave lost the live BOQ item: ${JSON.stringify(persisted)}`,
  );
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", "Detailed local live-reference reload banner");
  await clickTestId("button-restore-draft");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "Detailed local row after reload");
  const reopenedUi = await assertNoManualProjectUi(`${scenario} after reload`);
  const reopenedPicker = await assertLivePicker("progress-0", `${scenario} after reload`);
  const reopenedImage = await capture("dpr09-D-detailed-local-reopened");
  const restoredAgain = await readDetailedLocalAutosave();
  assert(
    restoredAgain?.data?.progress?.[0]?.boqItemId === liveBoqItemId,
    `Detailed local reload lost the live BOQ item: ${JSON.stringify(restoredAgain)}`,
  );
  return {
    beforeImage,
    ui,
    picker,
    selectedImage,
    projectIds,
    persisted,
    reopenedUi,
    reopenedPicker,
    reopenedImage,
    restoredAgain,
  };
};

const verifyDetailedLocalEmptyDraftCatalogue = async () => {
  const scenario = "dpr09-D-empty-detailed-local-autosave-catalogue";
  const pathName = `/site/new?dpr09=1&dpr09Literal=1&scenario=${scenario}&type=road`;
  await seedDetailedLocalEmptyDraft();
  const requestStart = (await fixtureState()).requests.length;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", "Detailed empty local restore banner");
  const beforeImage = await capture("dpr09-D-empty-detailed-local-before-restore");
  await clickTestId("button-restore-draft");
  const beforeItemAutosave = await readDetailedLocalAutosave();
  assert(
    (beforeItemAutosave?.data?.progress || []).length === 0,
    `Detailed empty local restore unexpectedly contained a progress item: ${JSON.stringify(beforeItemAutosave)}`,
  );
  await clickTestId("button-add-progress");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "Detailed empty local activity row");
  const ui = await assertNoManualProjectUi(scenario);
  await waitFor("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')", "Detailed empty local BOQ catalogue");
  const catalogueImage = await capture("dpr09-D-empty-detailed-local-catalogue");
  const catalogue = await chooseBoqItem("progress-0", scenario);
  const selectedPicker = await assertLivePicker("progress-0", `${scenario} after item selection`);
  const selectedImage = await capture("dpr09-D-empty-detailed-local-selected");

  await sleep(1300);
  const persisted = await readDetailedLocalAutosave();
  assert(
    persisted?.data?.progress?.[0]?.boqItemId === liveBoqItemId,
    `Detailed empty local autosave did not retain ${liveBoqItemName}: ${JSON.stringify(persisted)}`,
  );
  const projectIds = await assertRecoveredProjects(requestStart, scenario);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", "Detailed empty local reload banner");
  await clickTestId("button-restore-draft");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "Detailed empty local row after reload");
  const reopenedUi = await assertNoManualProjectUi(`${scenario} after reload`);
  const reopenedPicker = await assertLivePicker("progress-0", `${scenario} after reload`);
  const reopenedImage = await capture("dpr09-D-empty-detailed-local-reopened");
  const restoredAgain = await readDetailedLocalAutosave();
  assert(
    restoredAgain?.data?.progress?.[0]?.boqItemId === liveBoqItemId,
    `Detailed empty local reload lost ${liveBoqItemName}: ${JSON.stringify(restoredAgain)}`,
  );
  return {
    beforeImage,
    beforeItemAutosave,
    ui,
    catalogue,
    catalogueImage,
    selectedPicker,
    selectedImage,
    persisted,
    projectIds,
    reopenedUi,
    reopenedPicker,
    reopenedImage,
    restoredAgain,
  };
};

const verifyPositiveProjectPin = async () => {
  const scenario = "dpr09-E-positive-project-pin-preserved";
  const pathName = `/site/edit/${positiveProjectDraftId}?draft&dpr09=1&dpr09Multi=1&scenario=${scenario}`;
  const original = await getDpr(positiveProjectDraftId);
  assert(original.ok && original.data.boqProjectId === 5501, `Positive fixture did not start pinned to 5501: ${JSON.stringify(original)}`);
  const requestStart = (await fixtureState()).requests.length;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "positive project activity");
  const ui = await assertNoManualProjectUi(scenario);
  const picker = await assertLivePicker("edit-progress-0", scenario);
  const image = await capture("dpr09-E-positive-project-pin-preserved");
  const projectIds = await requestProjectIdsSince(requestStart);
  assert(projectIds.includes(5501), `Positive project did not load its pinned BOQ: ${JSON.stringify(projectIds)}`);
  assert(!projectIds.includes(5502), `Positive project was silently reguessed to alternate 5502: ${JSON.stringify(projectIds)}`);
  assert(!projectIds.includes(recoveryProjectId), `Positive project loaded the null-recovery project: ${JSON.stringify(projectIds)}`);
  return { original, ui, picker, image, projectIds };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
// Start clean. This only clears browser fixture/session state and never
// contacts an application server or database.
await cdp("Page.navigate", { url: `${baseUrl}/favicon.ico?dpr09-initial-clean=${Date.now()}` });
await waitFor("document.readyState === 'complete'", "DPR-09 initial storage document");
await evaluate(`(async () => {
  localStorage.clear();
  sessionStorage.clear();
  if (!indexedDB.databases) return true;
  await new Promise((resolve) => {
    const request = indexedDB.open("keyval-store");
    request.onerror = request.onupgradeneeded = () => resolve();
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("keyval")) {
        database.close();
        resolve();
        return;
      }
      const transaction = database.transaction("keyval", "readwrite");
      transaction.objectStore("keyval").clear();
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
        database.close();
        resolve();
      };
    };
  });
  return true;
})()`);

const literalA = await verifyLiteralGuidedEmptyDraftRecovery();
const siteEdit = await verifySiteEditSavedNullLiveReference();
const noBoqReference = await verifyNoBoqReferenceProtection();
const detailedLocal = await verifyDetailedLocalRestoreLiveReference();
const detailedEmptyLocal = await verifyDetailedLocalEmptyDraftCatalogue();
const positivePin = await verifyPositiveProjectPin();

assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);
const finalState = await fixtureState();
const result = {
  scenario: "DPR-09 automatic saved-null recovery with live BOQ references",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    viewport,
    productionDatabaseUsed: false,
    customerWrites: false,
    persistenceMode: "fixture in-memory adapter with sessionStorage records and browser autosave storage",
    evidenceDirectory: evidenceDir,
  },
  assertions: {
    A: "A literal fresh Guided save with an unlinked activity/no item is persisted as explicit boqProjectId:null, reopens with the site's BOQ catalogue available, lets the engineer choose GSB LAYING, saves the same draft id with project 5510 + item 8801, and retains both through Detailed/Edit and Guided reload.",
    B: "The same saved-null/live-reference recovery contract works in Detailed/Edit without a manual project selector and persists after reload.",
    C: "Guided No Site Work and Detailed/Edit Incidental / Non-BOQ rows retain explicit null and do not request BOQ items or render a picker.",
    D: "Detailed local autosaves with an empty saved-null state can show the site's BOQ catalogue for the first item, and an explicit-null/live-reference autosave retains its linked row across reload.",
    E: "A positive saved project pin remains 5501 even when another project is available; no alternate project is guessed.",
  },
  evidence: { literalA, siteEdit, noBoqReference, detailedLocal, detailedEmptyLocal, positivePin },
  browserExceptions: browserErrors,
  writes: {
    fixtureOnly: true,
    guidedDraftId: literalFreshDraftId,
    siteEditDraftId: siteEditLiveDraftId,
    noProductionPersistence: true,
    finalFixtureRequestCount: finalState?.requests?.length || 0,
  },
  investigation: {
    literalFirstSave: "The literal first-save path is covered: a fresh Guided POST with one unlinked activity and no BOQ item is fixture-enforced to persist explicit boqProjectId:null, the same draft id reopens with the site's catalogue, and selecting GSB LAYING then persists project 5510 + item 8801 through Detailed/Edit and Guided reload.",
    fixtureNullPostDisclosure: "literalA.literalCreate records requestedPayload separately from persistedPayload. The fixture adapter's literal POST branch enforces boqProjectId:null for the empty/no-item save and marks enforcedNull:true; that adapter mutation is fixture evidence only and is not a claim about a production server first-save response.",
    realDatabaseEvidence: "Server-worker real-DB validation is independent evidence and is not represented as fixture traffic here.",
    manualSelector: "No manual BOQ-project selector, status panel, recovery dialog, or project confirmation is used or expected.",
  },
  limitations: [
    "All GET/PATCH requests and persisted records stay inside the fixture's in-memory/sessionStorage adapter.",
    "The local autosave blob is synthetic browser storage seeded by this verifier; no customer browser state is touched.",
    "The verifier clicks rendered controls and inspects browser requests; it does not call React handlers directly.",
  ],
};
writeFileSync(path.join(evidenceDir, "dpr09-null-recovery-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(evidenceDir, "dpr09-null-recovery-request-log.json"), `${JSON.stringify({
  requests: finalState?.requests ?? [],
  recoveryPayloads: finalState?.dprRecoveryPayloads ?? [],
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
socket.close();