/*
 * Saved-null DPR project recovery browser regression.
 *
 * This is deliberately separate from verify-dpr-boq-picker.mjs: the picker
 * verifier starts with a resolved project and does not click a save control.
 * This verifier starts from an explicit saved `boqProjectId:null`, chooses the
 * site project through the real controls, saves, and reopens the same fixture
 * record. All API traffic is handled by main.tsx's in-memory adapter and its
 * session-storage persistence layer; no operational server or database is
 * contacted.
 *
 * Run with:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178 --strictPort
 *   node tests/fixtures/dpr-site-entry/verify-dpr-null-project.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort = process.env.DPR_NULL_CDP_PORT
  || process.env.DPR_BOQ_CDP_PORT
  || process.env.DPR07_CDP_PORT
  || "9222";
const tablet = { width: 1024, height: 768, mobile: true };
const recoveryProjectId = 5510;
const recoveryProjectName = "ALLADURG PWD ROAD TO PAMPAD BOQ";
const recoverySiteName = "ALLADURG PWD ROAD TO PAMPAD";

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

// A previous verifier run leaves its page target alive after the WebSocket
// closes. Close those fixture pages before clearing IndexedDB; otherwise an
// old useAutosave connection can block the cleanup transaction indefinitely.
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

const selectRecoverySite = async () => {
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", "recorded recovery site selector");
  await selectOption("input-site", recoverySiteName);
  await waitFor(
    `document.querySelector('[data-testid="input-site"]')?.textContent?.includes(${quote(recoverySiteName)})`,
    "recorded recovery site",
  );
};

const capture = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const navigate = async (pathname, { expectNullBanner = true } = {}) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width: tablet.width,
    height: tablet.height,
    deviceScaleFactor: 1,
    mobile: tablet.mobile,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Page.navigate", { url: `${baseUrl}${pathname}` });
  await waitFor("document.readyState === 'complete'", `${pathname} document`);
  if (expectNullBanner) {
    await waitFor("!!document.querySelector('[data-testid=\"dpr-null-evidence-banner\"]')", `${pathname} fixture banner`);
  }
};

const readProjectStatus = () => evaluate(`(() => {
  const status = document.querySelector('[data-testid="dpr-boq-status"]');
  const select = document.querySelector('[data-testid="dpr-boq-project-select"]');
  return {
    text: status?.textContent?.trim() || "",
    projectText: select?.textContent?.trim() || "",
    projectValue: select?.getAttribute("data-value") || null,
    projectDisabled: !!select?.disabled,
    hasSelector: !!select,
    noProject: !!status?.querySelector('[data-testid="dpr-boq-no-project"]'),
  };
})()`);

/*
 * The recovery contract may render the selector immediately or behind a
 * plainly labelled recovery action. Support both shapes while still failing
 * if the saved-null screen only exposes a dead "No BOQ project" label.
 */
const openRecoveryProjectSelector = async () => {
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-status\"]')", "BOQ status");
  let status = await readProjectStatus();
  if (!status.hasSelector || status.projectDisabled) {
    const action = await evaluate(`(() => {
      const candidates = Array.from(document.querySelectorAll('button,[role="button"]'));
      const node = candidates.find(candidate =>
        /choose|select|recover|available.*boq|project/i.test(candidate.textContent || "")
        && !candidate.disabled
        && candidate.getAttribute("data-testid") !== "dpr-boq-retry"
      );
      if (!node) return null;
      node.click();
      return { testId: node.getAttribute("data-testid"), text: node.textContent || "" };
    })()`);
    assert(action, `Saved-null screen did not expose an actionable BOQ recovery control: ${JSON.stringify(status)}`);
    await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-project-select\"]')", "recovery project selector");
    status = await readProjectStatus();
  }
  assert(status.hasSelector, `Saved-null screen omitted project choice: ${JSON.stringify(status)}`);
  assert(!status.projectDisabled, `Saved-null project choice remained disabled: ${JSON.stringify(status)}`);
  return status;
};

const selectRecoveryProject = async () => {
  await openRecoveryProjectSelector();
  await selectOption("dpr-boq-project-select", recoveryProjectName);
  // Saved-null recovery deliberately requires an affirmative second click.
  // Do not let the verifier's generic CDP dialog handler mistake this
  // application AlertDialog for a browser JavaScript dialog.
  await waitFor(
    `!!document.querySelector('[data-testid="button-confirm-boq-project-recovery"]')`,
    "saved-null project recovery confirmation",
  );
  await clickTestId("button-confirm-boq-project-recovery");
  await waitFor(
    `!document.querySelector('[data-testid="button-confirm-boq-project-recovery"]')`,
    "saved-null project recovery confirmation close",
  );
  await waitFor(
    `document.querySelector('[data-testid="dpr-boq-project-select"]')?.textContent?.includes(${quote(recoveryProjectName)})`,
    "selected recovery project",
  );
  await waitFor(
    `!document.querySelector('[data-testid="dpr-boq-project-select"]')?.disabled`,
    "enabled selected recovery project",
  );
  return readProjectStatus();
};

const chooseBoqItem = async (prefix) => {
  await waitFor(
    `!!document.querySelector('[data-testid="${prefix}-item-select"]') || !!document.querySelector('[data-testid="button-switch-to-boq-0"]')`,
    `${prefix} BOQ item selector or legacy switch`,
  );
  const hasPicker = await evaluate(`!!document.querySelector('[data-testid="${prefix}-item-select"]')`);
  if (!hasPicker) {
    await clickTestId("button-switch-to-boq-0");
    await waitFor(
      `!!document.querySelector('[data-testid="${prefix}-item-select"]')`,
      `${prefix} BOQ item selector after legacy switch`,
    );
  }
  await clickTestId(`${prefix}-item-select`);
  await waitFor(
    `!!document.querySelector('[data-testid="option-boq-item-8801"]')`,
    `${prefix} eligible BOQ item`,
  );
  await clickTestId("option-boq-item-8801");
  await waitFor(
    `document.querySelector('[data-testid="${prefix}-item-select"]')?.textContent?.toLowerCase().includes("gsb laying")`,
    `${prefix} selected BOQ item`,
  );
};

const getDpr = async (id) => evaluate(`fetch("/api/dprs/${id}", { credentials: "include" }).then(async response => ({
  ok: response.ok,
  status: response.status,
  data: await response.json(),
}))`);

const persistLocalDetailedNullDraft = async () => {
  const localDraft = {
    formKey: "site-entry-new",
    savedAt: Date.now(),
    version: 1,
    data: {
      header: {
        date: "2026-08-12",
        site: recoverySiteName,
        engineer: "SURESH KUMAR - ENGINEER",
        remarks: "Local saved-null recovery fixture.",
        boqProjectId: null,
      },
      workType: "road",
      progress: [{
        entryKey: "local-null-project-progress",
        activity: "LOCAL SAVED NULL PROJECT",
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
        boqItemId: null,
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
  // Seed from a non-app document on the fixture origin. Navigating away from
  // an already-mounted Detailed form lets its beforeunload autosave race and
  // overwrite the synthetic local draft with the blank initial form. A Vite
  // static 404 does not mount React, so its IndexedDB transaction can finish
  // before the real form's useAutosave first reads the store. This also works
  // when another page from a prior verifier run still has keyval-store open.
  const fixtureOrigin = new URL(baseUrl).origin;
  await cdp("Page.navigate", {
    url: `${fixtureOrigin}/favicon.ico?dpr-storage-cleanup=${Date.now()}`,
  });
  await waitFor("document.readyState === 'complete'", "fixture storage cleanup document");
  await evaluate(`(async () => {
    const storageKey = "autosave_site-entry-new";
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
        transaction.objectStore("keyval").delete(storageKey);
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => {
          database.close();
          resolve();
        };
      };
    });
    localStorage.setItem(storageKey, ${quote(JSON.stringify(localDraft))});
    return true;
  })()`);
  await navigate("/site/new?dprNull=1&scenario=detailed-local-restore");
};

const verifyGuidedSavedNullRecovery = async () => {
  const pathName = "/guided?dprNull=1&scenario=guided-saved-null&draftId=6220&section=activities";
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "Guided saved-null activity");
  const initial = await openRecoveryProjectSelector();
  assert(/no boq project|saved|null|project/i.test(initial.text), `Guided fixture did not start as saved-null: ${JSON.stringify(initial)}`);
  const beforeImage = await capture("dpr-null-guided-before-recovery");
  const selected = await selectRecoveryProject();
  await chooseBoqItem("guided-progress-0");
  const selectedImage = await capture("dpr-null-guided-project-selected");

  await clickTestId("button-save-draft");
  await waitFor(
    `fetch("/api/dprs/6220", { credentials: "include" }).then(response => response.json()).then(record => record.boqProjectId === ${recoveryProjectId} && record.progress?.[0]?.boqItemId === 8801)`,
    "Guided saved-null draft mutation",
  );
  const mutation = (await fixtureState()).dprDraftPayloads.at(-1)
    || { id: 6220, payload: (await getDpr(6220)).data };
  assert(mutation.id === 6220, `Guided recovery saved the wrong source id: ${mutation.id}`);
  assert(mutation.payload?.boqProjectId === recoveryProjectId, `Guided recovery did not persist project ${recoveryProjectId}: ${JSON.stringify(mutation.payload)}`);
  assert(mutation.payload?.progress?.[0]?.boqItemId === 8801, "Guided recovery did not persist the explicitly selected BOQ item");
  const saved = await getDpr(6220);
  assert(saved.ok && saved.data.boqProjectId === recoveryProjectId, `Guided saved-null record did not survive reopen: ${JSON.stringify(saved)}`);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"card-entry-0\"]')", "Guided reopened activity");
  const reopened = await readProjectStatus();
  assert(reopened.projectText.includes(recoveryProjectName), `Guided reopen lost selected project: ${JSON.stringify(reopened)}`);
  await waitFor(
    `document.body.innerText.toLowerCase().includes("gsb laying")`,
    "Guided reopened BOQ item",
  );
  const reopenedImage = await capture("dpr-null-guided-reopened");
  return { beforeImage, selectedImage, reopenedImage, initial, selected, mutation, saved, reopened };
};

const verifySiteEditSavedNullRecovery = async () => {
  const pathName = "/site/edit/6221?draft&dprNull=1&scenario=site-edit-saved-null";
  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft-progress\"]')", "SiteEdit saved-null draft actions");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", "SiteEdit saved-null activity");
  const initial = await openRecoveryProjectSelector();
  assert(/no boq project|saved|null|project/i.test(initial.text), `SiteEdit fixture did not start as saved-null: ${JSON.stringify(initial)}`);
  const beforeImage = await capture("dpr-null-site-edit-before-recovery");
  const selected = await selectRecoveryProject();
  await chooseBoqItem("edit-progress-0");
  const selectedImage = await capture("dpr-null-site-edit-project-selected");

  await clickTestId("button-save-draft-progress");
  await waitFor(
    `fetch("/api/dprs/6221", { credentials: "include" }).then(response => response.json()).then(record => record.boqProjectId === ${recoveryProjectId} && record.progress?.[0]?.boqItemId === 8801)`,
    "SiteEdit saved-null draft mutation",
  );
  const mutation = (await fixtureState()).dprDraftPayloads.at(-1)
    || { id: 6221, payload: (await getDpr(6221)).data };
  assert(mutation.id === 6221, `SiteEdit recovery saved the wrong source id: ${mutation.id}`);
  assert(mutation.payload?.boqProjectId === recoveryProjectId, `SiteEdit recovery did not persist project ${recoveryProjectId}: ${JSON.stringify(mutation.payload)}`);
  assert(mutation.payload?.progress?.[0]?.boqItemId === 8801, "SiteEdit recovery did not persist the explicitly selected BOQ item");
  const saved = await getDpr(6221);
  assert(saved.ok && saved.data.boqProjectId === recoveryProjectId, `SiteEdit saved-null record did not survive reopen: ${JSON.stringify(saved)}`);

  await navigate(pathName);
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft-progress\"]')", "SiteEdit reopened draft actions");
  const reopened = await readProjectStatus();
  assert(reopened.projectText.includes(recoveryProjectName), `SiteEdit reopen lost selected project: ${JSON.stringify(reopened)}`);
  await waitFor(
    `document.body.innerText.toLowerCase().includes("gsb laying")`,
    "SiteEdit reopened BOQ item",
  );
  const reopenedImage = await capture("dpr-null-site-edit-reopened");
  return { beforeImage, selectedImage, reopenedImage, initial, selected, mutation, saved, reopened };
};

const verifyDetailedLocalRestore = async () => {
  await persistLocalDetailedNullDraft();
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", "Detailed local restore banner");
  const beforeImage = await capture("dpr-null-detailed-local-before-restore");
  await clickTestId("button-restore-draft");
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-status\"]')", "Detailed restored BOQ status");
  const restoredNull = await openRecoveryProjectSelector();
  assert(restoredNull.noProject || /no boq project/i.test(restoredNull.text), `Detailed restore silently guessed a project before user action: ${JSON.stringify(restoredNull)}`);
  const selected = await selectRecoveryProject();
  await chooseBoqItem("progress-0");
  const selectedImage = await capture("dpr-null-detailed-local-selected");

  // The real autosave debounce persists the corrected project choice. Reopen
  // the browser route and restore again, proving this is not React-only state.
  await sleep(1300);
  await navigate("/site/new?dprNull=1&scenario=detailed-local-reopen");
  await waitFor("!!document.querySelector('[data-testid=\"button-restore-draft\"]')", "Detailed corrected local draft");
  await clickTestId("button-restore-draft");
  await waitFor(
    `document.querySelector('[data-testid="dpr-boq-project-select"]')?.textContent?.includes(${quote(recoveryProjectName)})`,
    "Detailed corrected project after local reopen",
  );
  await waitFor(
    `document.body.innerText.toLowerCase().includes("gsb laying")`,
    "Detailed corrected BOQ item after local reopen",
  );
  const reopenedImage = await capture("dpr-null-detailed-local-reopened");
  const reopened = await readProjectStatus();
  return { beforeImage, selectedImage, reopenedImage, restoredNull, selected, reopened };
};

const verifyPositivePin = async () => {
  await navigate("/site/edit/6101?scenario=positive-project-pin", { expectNullBanner: false });
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-status\"]')", "positive project pin status");
  const status = await readProjectStatus();
  assert(status.text.includes("NARASIMHULU ROAD BOQ"), `Positive saved project pin changed: ${JSON.stringify(status)}`);
  await waitFor(
    "document.body.innerText.toLowerCase().includes('gsb laying')",
    "positive saved BOQ item reference",
  );
  return { status, image: await capture("dpr-null-positive-pin-preserved") };
};

const verifyMultiProjectChoice = async () => {
  await navigate("/site/new?dprNull=1&dprNullMulti=1&scenario=multi-project-choice");
  await selectRecoverySite();
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-project-select\"]')", "multi-project selector");
  const options = await evaluate(`Array.from(document.querySelectorAll('[data-testid="dpr-boq-project-select"]')).length`);
  assert(options === 1, "Multi-project scenario did not render one project selector");
  await selectOption("dpr-boq-project-select", "ALLADURG PWD ROAD TO PAMPAD SECOND BOQ");
  await waitFor(
    `document.querySelector('[data-testid="dpr-boq-project-select"]')?.textContent?.includes("ALLADURG PWD ROAD TO PAMPAD SECOND BOQ")`,
    "second BOQ project choice",
  );
  const status = await readProjectStatus();
  assert(status.projectText.includes("ALLADURG PWD ROAD TO PAMPAD SECOND BOQ"), `Second project choice was not retained: ${JSON.stringify(status)}`);
  await waitFor("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')", "second project item picker");
  return { status, image: await capture("dpr-null-multi-project-choice") };
};

const verifyIntentionalNoBoqChoice = async () => {
  await navigate("/site/new?dprNull=1&scenario=intentional-no-boq-choice");
  await selectRecoverySite();
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-project-select\"]')", "intentional no-BOQ selector");
  await selectOption("dpr-boq-project-select", "No BOQ project");
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-no-project\"]')", "intentional no-BOQ status");
  const status = await readProjectStatus();
  assert(status.noProject, `Intentional no-BOQ choice was not retained: ${JSON.stringify(status)}`);
  return { status, image: await capture("dpr-null-intentional-no-boq") };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const guided = await verifyGuidedSavedNullRecovery();
const siteEdit = await verifySiteEditSavedNullRecovery();
const detailedLocal = await verifyDetailedLocalRestore();
const positivePin = await verifyPositivePin();
const multiProject = await verifyMultiProjectChoice();
const intentionalNoBoq = await verifyIntentionalNoBoqChoice();

assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);
const finalState = await fixtureState();
const renderedRecoveryMutations = [guided.mutation, siteEdit.mutation].filter(Boolean);
const result = {
  scenario: "DPR saved-null project recovery isolated browser regression",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    tablet,
    productionDatabaseUsed: false,
    customerWrites: false,
    apiRouteMode: "browser fetch adapter with session-persisted synthetic DPR records",
    evidenceDirectory: evidenceDir,
  },
  assertions: {
    guided: "GuidedDpr opens an explicit saved-null draft, exposes project recovery, saves project/item, and reopens the same draft.",
    siteEdit: "SiteEdit opens an explicit saved-null draft, exposes project recovery, saves project/item, and reopens the same draft.",
    detailedLocal: "Detailed SiteEntry restores an explicit local null-project blob, persists the corrected choice through autosave, and restores it after reload.",
    positivePin: "A previously linked positive project remains visible and its item reference is not remapped.",
    multiProject: "A site with two projects exposes an explicit choice and loads the selected project's items.",
    intentionalNoBoq: "A fresh Detailed DPR can deliberately choose No BOQ project without it being overwritten by fallback resolution.",
  },
  evidence: { guided, siteEdit, detailedLocal, positivePin, multiProject, intentionalNoBoq },
  browserExceptions: browserErrors,
  writes: {
    fixtureOnly: true,
    guidedDraftId: 6220,
    siteEditDraftId: 6221,
    renderedMutationCount: renderedRecoveryMutations.length,
  },
  limitations: [
    "All GET/PATCH requests and persisted records stay inside the fixture's session storage.",
    "No operational server, database, customer DPR, or production write is used.",
    "The verifier clicks real rendered controls; it does not call React handlers directly.",
  ],
};
writeFileSync(path.join(evidenceDir, "dpr-null-project-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(evidenceDir, "dpr-null-project-request-log.json"), `${JSON.stringify({
  requests: finalState?.requests ?? [],
  recoveryPayloads: finalState?.dprRecoveryPayloads ?? [],
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
socket.close();