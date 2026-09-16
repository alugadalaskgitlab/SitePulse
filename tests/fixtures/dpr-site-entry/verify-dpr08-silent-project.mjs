/*
 * DPR-08 silent BOQ-project-resolution browser evidence.
 *
 * This verifier deliberately replaces the older saved-null/manual-picker
 * verifier. It proves that fresh Guided and Detailed DPRs resolve the BOQ
 * project from the selected site without rendering a project chooser, while
 * retaining the unscheduled-item affordance and the positive-project pin
 * through server-draft and browser-autosave lifecycles.
 *
 * Run with:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178 --strictPort
 *   node tests/fixtures/dpr-site-entry/verify-dpr08-silent-project.mjs
 *
 * All requests are handled by main.tsx's in-memory/session-persisted fixture
 * adapter. No operational server, database, customer DPR, or production write
 * is contacted.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort = process.env.DPR08_CDP_PORT || process.env.DPR_BOQ_CDP_PORT || "9222";
const viewport = { width: 1440, height: 1000, mobile: false };
const siteName = "NARASIMHULU ROAD";
const projectId = 5501;
const projectName = "NARASIMHULU ROAD BOQ";
const unscheduledItemId = 8804;
const unscheduledItemName = "NO-BAR SHOULDER WORK";
const savedDraftId = 6216;

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

// A stale fixture page can keep the autosave IndexedDB connection open. Close
// every other target before seeding the browser-only positive-pin draft.
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
const bodyText = () => evaluate("document.body?.innerText || ''");

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
    if (!option || option.getAttribute("aria-disabled") === "true") return false;
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
  await sleep(120);
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    // Preserve the complete rendered form, including any lower-page recovery
    // copy, for the no-manual-project evidence review.
    captureBeyondViewport: true,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const navigate = async (pathname, {
  width = viewport.width,
  height = viewport.height,
  mobile = viewport.mobile,
  expectEvidenceBanner = true,
} = {}) => {
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
  if (expectEvidenceBanner) {
    await waitFor(
      "!!document.querySelector('[data-testid=\"dpr08-evidence-banner\"]')",
      `${pathname} DPR-08 fixture banner`,
    );
  }
};

const assertSilentBoqUi = async (stage) => {
  const state = await evaluate(`(() => {
    const body = document.body?.innerText || "";
    return {
      hasStatusPanel: !!document.querySelector('[data-testid="dpr-boq-status"]'),
      hasProjectSelector: !!document.querySelector('[data-testid="dpr-boq-project-select"]'),
      hasNoProjectMessage: !!document.querySelector('[data-testid="dpr-boq-no-project"]')
        || /no boq project/i.test(body),
      hasRecoveryDialog: !!document.querySelector('[data-testid="dpr-boq-project-recovery-confirm"]')
        || !!document.querySelector('[data-testid="button-confirm-boq-project-recovery"]'),
      hasAttachConfirmation: /attach this dpr to a boq project|confirm a boq project before/i.test(body),
      visibleManualProjectCopy: /\\bboq project\\b|select boq project|attach this dpr to a boq project|confirm a boq project before/i.test(body),
      bodyExcerpt: body.slice(0, 1800),
    };
  })()`);
  assert(!state.hasStatusPanel, `${stage} still rendered dpr-boq-status: ${JSON.stringify(state)}`);
  assert(!state.hasProjectSelector, `${stage} still rendered the manual project selector: ${JSON.stringify(state)}`);
  assert(!state.hasNoProjectMessage, `${stage} rendered a No BOQ project state: ${JSON.stringify(state)}`);
  assert(!state.hasRecoveryDialog, `${stage} rendered the manual recovery dialog: ${JSON.stringify(state)}`);
  assert(!state.hasAttachConfirmation, `${stage} rendered attach/confirm BOQ-project copy: ${JSON.stringify(state)}`);
  assert(!state.visibleManualProjectCopy, `${stage} rendered manual BOQ-project copy: ${JSON.stringify(state)}`);
  return state;
};

const itemRequestProjectIds = async () => {
  const state = await fixtureState();
  return (state?.requests || [])
    .filter((request) => request.method === "GET" && /\/api\/boq\/projects\/\d+\/items$/.test(request.path))
    .map((request) => Number(request.path.match(/\/projects\/(\d+)\/items$/)?.[1]))
    .filter(Number.isFinite);
};

const assertProjectResolved = async (stage, { rejectProjectIds = [] } = {}) => {
  const projectIds = await itemRequestProjectIds();
  assert(projectIds.includes(projectId), `${stage} did not load BOQ items from ${projectName}: ${JSON.stringify(projectIds)}`);
  for (const rejected of rejectProjectIds) {
    assert(!projectIds.includes(rejected), `${stage} automatically loaded the wrong BOQ project ${rejected}: ${JSON.stringify(projectIds)}`);
  }
  return projectIds;
};

const readItemPicker = async (testId) => evaluate(`(() => {
  const node = document.querySelector('[data-testid=${quote(testId)}]');
  return {
    text: node?.textContent?.trim() || "",
    value: node?.getAttribute("data-value") || null,
    disabled: !!node?.disabled,
  };
})()`);

const chooseUnscheduledItem = async (prefix, screenshotPrefix, programmePrefix = prefix) => {
  const pickerTestId = `${prefix}-item-select`;
  await waitFor(`!!document.querySelector('[data-testid=${quote(pickerTestId)}]')`, `${prefix} item picker`);
  const billTestId = `${prefix}-bill-select`;
  if (await evaluate(`!!document.querySelector('[data-testid=${quote(billTestId)}]')`)) {
    await clickTestId(billTestId);
    await waitFor(
      `Array.from(document.querySelectorAll('[role="option"]')).some(node => (node.textContent || "").includes("BILL 9"))`,
      `${prefix} all-bill options`,
    );
    const bills = await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).map(node => node.textContent || "")`);
    assert(bills.some((text) => text.trim() === "All bills"), `${prefix} omitted the All bills option`);
    await clickOptionContaining("All bills");
  }

  await waitFor(
    `document.querySelector('[data-testid=${quote(pickerTestId)}]')?.disabled === false`,
    `${prefix} enabled item picker`,
  );
  await clickTestId(pickerTestId);
  await waitFor(
    `!!document.querySelector('[data-testid="option-boq-item-${unscheduledItemId}"]')`,
    `${prefix} unscheduled BOQ item option`,
  );
  const optionText = await evaluate(
    `document.querySelector('[data-testid="option-boq-item-${unscheduledItemId}"]')?.textContent || ""`,
  );
  assert(new RegExp(unscheduledItemName, "i").test(optionText), `${prefix} item label was not discoverable: ${optionText}`);
  const pickerImage = await capture(`${screenshotPrefix}-picker-open`);
  await setInput("input-boq-item-search", "NO-BAR");
  await waitFor(
    `document.querySelector('[data-testid="option-boq-item-${unscheduledItemId}"]')?.getAttribute("aria-disabled") !== "true"`,
    `${prefix} enabled searched unscheduled item`,
  );
  await clickTestId(`option-boq-item-${unscheduledItemId}`);
  await waitFor(
    `document.querySelector('[data-testid=${quote(pickerTestId)}]')?.textContent?.toLowerCase().includes(${quote(unscheduledItemName.toLowerCase())})`,
    `${prefix} selected unscheduled item`,
  );
  await waitFor(
    `!!document.querySelector('[data-testid=${quote(`${programmePrefix}-programme-optional-status`)}]')`,
    `${prefix} optional programme status`,
  );
  const optionalStatus = await evaluate(
    `document.querySelector('[data-testid=${quote(`${programmePrefix}-programme-optional-status`)}]')?.textContent || ""`,
  );
  assert(/not linked|optional/i.test(optionalStatus), `${prefix} optional programme hint was not explicit: ${optionalStatus}`);
  const selectedImage = await capture(`${screenshotPrefix}-no-bar-selected`);
  return {
    pickerImage,
    selectedImage,
    optionalStatus,
    picker: await readItemPicker(pickerTestId),
  };
};

const prepareGuidedFresh = async () => {
  const scenario = "dpr08-guided-new";
  // Begin on Report so the real wizard's site and engineer controls are
  // rendered, then advance through the rendered Activities step.
  await navigate(`/guided?dpr08=1&scenario=${scenario}`);
  await waitFor("!!document.querySelector('[data-testid=\"select-site\"]')", `${scenario} site selector`);
  await waitFor(
    `document.querySelector('[data-testid="select-site"]')?.textContent?.includes(${quote(siteName)})`,
    `${scenario} auto-selected site`,
  );
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", `${scenario} engineer selector`);
  if (!(await evaluate(`document.querySelector('[data-testid="select-engineer"]')?.textContent?.includes("SURESH KUMAR")`))) {
    await selectOption("select-engineer", "SURESH KUMAR");
  }
  await clickTestId("button-step-next");
  await waitFor("!!document.querySelector('[data-testid=\"button-add-activity\"]')", `${scenario} add activity`);
  const beforeItem = await assertSilentBoqUi(`${scenario} after site resolution`);
  await assertProjectResolved(scenario);
  await clickTestId("button-add-activity");
  const evidence = await chooseUnscheduledItem("guided-progress-0", scenario, "guided-0");
  await assertSilentBoqUi(`${scenario} after unscheduled item selection`);
  return { beforeItem, ...evidence, projectIds: await itemRequestProjectIds() };
};

const prepareDetailedFresh = async () => {
  const scenario = "dpr08-detailed-new";
  await navigate(`/site/new?dpr08=1&scenario=${scenario}&type=road`);
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", `${scenario} site selector`);
  await waitFor(
    `document.querySelector('[data-testid="input-site"]')?.textContent?.includes(${quote(siteName)})`,
    `${scenario} auto-selected site`,
  );
  await setInput("input-date", "2026-08-08");
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", `${scenario} engineer selector`);
  await selectOption("select-engineer", "SURESH KUMAR");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} activity row`);
  await waitFor("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')", `${scenario} item picker`);
  const beforeItem = await assertSilentBoqUi(`${scenario} after site resolution`);
  await assertProjectResolved(scenario);
  const evidence = await chooseUnscheduledItem("progress-0", scenario, "progress-0");
  await assertSilentBoqUi(`${scenario} after unscheduled item selection`);
  return { beforeItem, ...evidence, projectIds: await itemRequestProjectIds() };
};

const verifyGuidedSaveReopenPositivePin = async () => {
  const scenario = "dpr08-guided-save-reopen-positive-pin";
  const pathName = `/guided?draftId=6201&dpr08=1&scenario=${scenario}&section=activities&returnTo=%2Fguided%3FdraftId%3D6201`;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft\"]')", `${scenario} save action`);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", `${scenario} hydrated activity`);
  const beforeUi = await assertSilentBoqUi(`${scenario} before save`);
  const beforeImage = await capture(`${scenario}-before-save`);
  const beforeMutations = (await fixtureState()).dprRecoveryPayloads?.length || 0;
  await clickTestId("button-save-draft");
  await waitFor(
    `window.__DprSiteFixture?.dprRecoveryPayloads?.length >= ${beforeMutations + 1}`,
    `${scenario} draft mutation`,
  );
  const mutationState = await fixtureState();
  const mutation = mutationState.dprRecoveryPayloads.at(-1);
  assert(mutation?.id === 6201, `${scenario} saved the wrong Guided DPR id: ${JSON.stringify(mutation)}`);
  assert(
    mutation?.payload?.boqProjectId === projectId,
    `${scenario} changed the positive project pin: ${JSON.stringify(mutation?.payload)}`,
  );
  const saved = await evaluate(
    `fetch("/api/dprs/6201", { credentials: "include" }).then(response => response.json())`,
  );
  assert(saved.boqProjectId === projectId, `${scenario} GET did not retain project ${projectId}: ${JSON.stringify(saved)}`);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", `${scenario} reopened activity`);
  const reopenedUi = await assertSilentBoqUi(`${scenario} after reopen`);
  const reopenedIds = await assertProjectResolved(scenario);
  const reopenedImage = await capture(`${scenario}-after-reopen`);
  return { beforeUi, beforeImage, mutation, saved, reopenedUi, reopenedIds, reopenedImage };
};

const verifySaveReopenPositivePin = async () => {
  const scenario = "dpr08-save-reopen-positive-pin";
  const pathName = `/site/edit/${savedDraftId}?draft&dpr08=1&scenario=${scenario}&returnTo=%2Fsite%2Fedit%2F${savedDraftId}`;
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft-progress\"]')", `${scenario} save action`);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} activity row`);
  const beforeUi = await assertSilentBoqUi(`${scenario} before save`);
  const beforeImage = await capture(`${scenario}-before-save`);
  const beforeMutations = (await fixtureState()).dprRecoveryPayloads?.length || 0;
  await clickTestId("button-save-draft-progress");
  await waitFor(
    `window.__DprSiteFixture?.dprRecoveryPayloads?.length >= ${beforeMutations + 1}`,
    `${scenario} draft mutation`,
  );
  const mutationState = await fixtureState();
  const mutation = mutationState.dprRecoveryPayloads.at(-1);
  assert(mutation?.id === savedDraftId, `${scenario} saved the wrong DPR id: ${JSON.stringify(mutation)}`);
  assert(
    mutation?.payload?.boqProjectId === projectId,
    `${scenario} changed the positive project pin: ${JSON.stringify(mutation?.payload)}`,
  );
  const saved = await evaluate(
    `fetch("/api/dprs/${savedDraftId}", { credentials: "include" }).then(response => response.json())`,
  );
  assert(saved.boqProjectId === projectId, `${scenario} GET did not retain project ${projectId}: ${JSON.stringify(saved)}`);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} reopened activity`);
  await waitFor(
    `document.querySelector('[data-testid="edit-progress-0-item-select"]')?.textContent?.toLowerCase().includes(${quote(unscheduledItemName.toLowerCase())})`,
    `${scenario} reopened BOQ item`,
  );
  const reopenedUi = await assertSilentBoqUi(`${scenario} after reopen`);
  const reopenedIds = await assertProjectResolved(scenario);
  const reopenedImage = await capture(`${scenario}-after-reopen`);
  return {
    beforeUi,
    beforeImage,
    mutation,
    saved,
    reopenedUi,
    reopenedIds,
    reopenedImage,
  };
};

const positiveAutosaveData = {
  formKey: "site-entry-new",
  savedAt: Date.now(),
  version: 1,
  data: {
    header: {
      date: "2026-08-08",
      site: siteName,
      engineer: "SURESH KUMAR - ENGINEER",
      remarks: "DPR-08 positive-pin browser autosave fixture.",
      boqProjectId: projectId,
    },
    workType: "road",
    progress: [{
      entryKey: "dpr08-positive-autosave-progress",
      activity: unscheduledItemName,
      side: "LHS",
      chainageFrom: "2+000",
      chainageTo: "2+100",
      length: 100,
      width: 3,
      thickness: null,
      quantity: 300,
      uom: "SQM",
      noSiteWork: false,
      noSiteWorkDescription: "",
      personnelIds: [6101],
      boqItemId: unscheduledItemId,
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
};

const positiveGuidedAutosaveData = {
  formKey: "guided-dpr-new",
  savedAt: Date.now(),
  version: 1,
  data: {
    date: "2026-08-08",
    siteName: siteName,
    engineer: "SURESH KUMAR - ENGINEER",
    entries: [{
      entryKey: "dpr08-guided-positive-autosave-entry",
      noSiteWork: false,
      noSiteWorkDescription: "",
      activity: unscheduledItemName,
      boqItemId: unscheduledItemId,
      programmeBarId: null,
      earthworkArrangementId: null,
      side: "LHS",
      chainageFrom: "2+000",
      chainageTo: "2+100",
      quantity: 300,
      uom: "SQM",
      expanded: true,
      width: 3,
      thickness: null,
      remark: "",
      quantitySource: "measured",
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
    remarks: "DPR-08 positive-pin Guided autosave fixture.",
    draftId: null,
    boqProjectId: projectId,
    step: 3,
  },
};

const seedAutosave = async (storageKey, autosaveData) => {
  // Leave the mounted React form before changing the browser-only storage;
  // otherwise its beforeunload autosave can race and overwrite this fixture.
  await cdp("Page.navigate", { url: `${baseUrl}/favicon.ico?dpr08-storage=${Date.now()}` });
  await waitFor("document.readyState === 'complete'", "DPR-08 storage cleanup document");
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
        transaction.objectStore("keyval").delete(${quote(storageKey)});
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
          database.close();
          resolve();
        };
      };
    });
    localStorage.removeItem(${quote(storageKey)});
    localStorage.setItem(${quote(storageKey)}, ${quote(JSON.stringify(autosaveData))});
    return true;
  })()`);
};

const seedPositiveDetailedAutosave = () => seedAutosave("autosave_site-entry-new", positiveAutosaveData);
const seedPositiveGuidedAutosave = () => seedAutosave("autosave_guided-dpr-new", positiveGuidedAutosaveData);

const verifyAutosaveRestorePositivePin = async () => {
  const scenario = "dpr08-detailed-autosave-restore";
  await seedPositiveDetailedAutosave();
  await navigate(`/site/new?dpr08=1&scenario=${scenario}&type=road`);
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", `${scenario} restore banner`);
  const bannerImage = await capture(`${scenario}-banner`);
  await clickTestId("button-restore-draft");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} restored activity`);
  await waitFor(
    `document.querySelector('[data-testid="progress-0-item-select"]')?.textContent?.toLowerCase().includes(${quote(unscheduledItemName.toLowerCase())})`,
    `${scenario} restored BOQ item`,
  );
  await waitFor(
    `!!document.querySelector('[data-testid="progress-0-programme-optional-status"]')`,
    `${scenario} optional programme status`,
  );
  const ui = await assertSilentBoqUi(`${scenario} after restore`);
  const projectIds = await assertProjectResolved(scenario);
  const restoredImage = await capture(`${scenario}-after-restore`);
  const restored = await readItemPicker("progress-0-item-select");
  assert(
    restored.text.toLowerCase().includes(unscheduledItemName.toLowerCase()),
    `${scenario} item picker lost the restored BOQ item: ${JSON.stringify(restored)}`,
  );
  return { bannerImage, restoredImage, ui, projectIds, restored };
};

const verifyGuidedAutosaveRestorePositivePin = async () => {
  const scenario = "dpr08-guided-autosave-restore";
  await seedPositiveGuidedAutosave();
  await navigate(`/guided?dpr08=1&scenario=${scenario}&section=activities`);
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", `${scenario} restore banner`);
  const bannerImage = await capture(`${scenario}-banner`);
  await clickTestId("button-restore-draft");
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", `${scenario} restored activity`);
  await waitFor(
    `document.querySelector('[data-testid="guided-progress-0-item-select"]')?.textContent?.toLowerCase().includes(${quote(unscheduledItemName.toLowerCase())})`,
    `${scenario} restored BOQ item`,
  );
  await waitFor(
    `!!document.querySelector('[data-testid="guided-0-programme-optional-status"]')`,
    `${scenario} optional programme status`,
  );
  const ui = await assertSilentBoqUi(`${scenario} after restore`);
  const projectIds = await assertProjectResolved(scenario);
  const restoredImage = await capture(`${scenario}-after-restore`);
  const restored = await readItemPicker("guided-progress-0-item-select");
  assert(
    restored.text.toLowerCase().includes(unscheduledItemName.toLowerCase()),
    `${scenario} item picker lost the restored BOQ item: ${JSON.stringify(restored)}`,
  );
  return { bannerImage, restoredImage, ui, projectIds, restored };
};

const verifyMultiProjectAutomaticChoice = async () => {
  const scenario = "dpr08-multi-project-automatic-choice";
  await navigate(`/site/new?dpr08=1&dpr08Multi=1&scenario=${scenario}&type=road`);
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", `${scenario} site selector`);
  await waitFor(
    `document.querySelector('[data-testid="input-site"]')?.textContent?.includes(${quote(siteName)})`,
    `${scenario} auto-selected site`,
  );
  await setInput("input-date", "2026-08-08");
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", `${scenario} engineer selector`);
  await selectOption("select-engineer", "SURESH KUMAR");
  await waitFor("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')", `${scenario} item picker`);
  const ui = await assertSilentBoqUi(`${scenario} after automatic resolution`);
  const projectIds = await assertProjectResolved(scenario, { rejectProjectIds: [5502] });
  const evidence = await chooseUnscheduledItem("progress-0", scenario, "progress-0");
  await assertSilentBoqUi(`${scenario} after item selection`);
  return { ui, ...evidence, projectIds };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
// Start from clean fixture/session state. This is browser storage only.
await cdp("Page.navigate", { url: `${baseUrl}/favicon.ico?dpr08-initial-clean=${Date.now()}` });
await waitFor("document.readyState === 'complete'", "DPR-08 initial storage document");
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

const guidedFresh = await prepareGuidedFresh();
const detailedFresh = await prepareDetailedFresh();
const guidedPositivePin = await verifyGuidedSaveReopenPositivePin();
const detailedPositivePin = await verifySaveReopenPositivePin();
const guidedAutosaveRestore = await verifyGuidedAutosaveRestorePositivePin();
const detailedAutosaveRestore = await verifyAutosaveRestorePositivePin();
const multiProject = await verifyMultiProjectAutomaticChoice();

assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);
const finalState = await fixtureState();
const result = {
  scenario: "DPR-08 silent BOQ project resolution isolated browser regression",
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
    A: "Fresh Guided and Detailed DPRs resolve the site's BOQ automatically with no visible BOQ-project selector/status or No BOQ project copy.",
    B: "An unscheduled BOQ item remains selectable and displays the Not linked to a programme bar (optional) hint.",
    C: "Positive project pins survive rendered Guided Save Draft and Detailed/Edit Save Progress, then reopen on the same fixture drafts.",
    D: "Positive project pins and unscheduled items survive rendered Restore actions from local Guided and Detailed autosaves.",
    E: "A site with two active BOQ projects automatically selects the active project with programme bars and does not expose a chooser.",
  },
  evidence: {
    guidedFresh,
    detailedFresh,
    guidedPositivePin,
    detailedPositivePin,
    guidedAutosaveRestore,
    detailedAutosaveRestore,
    multiProject,
  },
  browserExceptions: browserErrors,
  writes: {
    fixtureOnly: true,
    savedDraftId,
    noProductionPersistence: true,
    finalFixtureRequestCount: finalState?.requests?.length || 0,
  },
  limitations: [
    "All GET/PATCH requests and persisted records stay inside the fixture's in-memory/sessionStorage adapter.",
    "The autosave blob is synthetic browser storage seeded by this verifier; no real customer persistence is exercised.",
    "The verifier clicks rendered controls and inspects browser requests; it does not call React handlers directly.",
    "verify-dpr-null-project.mjs and its screenshots intentionally remain excluded because they assert the obsolete manual saved-null recovery chooser.",
  ],
};
writeFileSync(path.join(evidenceDir, "dpr08-silent-project-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(evidenceDir, "dpr08-silent-project-request-log.json"), `${JSON.stringify({
  requests: finalState?.requests ?? [],
  dprRecoveryPayloads: finalState?.dprRecoveryPayloads ?? [],
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
socket.close();