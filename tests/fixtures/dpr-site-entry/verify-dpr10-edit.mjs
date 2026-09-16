/*
 * DPR-10 SiteEdit browser verification.
 *
 * This drives the real SiteEdit controls against the browser-only fixture
 * adapter in main.tsx. It does not invoke the production Express routes or
 * database and never writes customer data.
 *
 * The overlap scenario intentionally delays the prior-DPR response. The
 * rendered, programme-linked row is an unchanged saved draft claim (the exact
 * exemption-root-cause shape), so the warning must still appear on that row
 * once the prior is ready.
 *
 * Run with an already-running fixture Vite server and Chromium CDP page:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178 --strictPort
 *   node tests/fixtures/dpr-site-entry/verify-dpr10-edit.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort = process.env.DPR10_CDP_PORT || "9222";
const viewport = { width: 1440, height: 1000, mobile: false };

const bottomDraftId = 6250;
const overlapDraftId = 6253;
const submittedAdminId = 6251;

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

// Keep this verifier deterministic when a previous fixture run left a tab
// mounted with an old in-memory request recorder.
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
  const body = await evaluate("document.body?.innerText?.slice(0, 4000) || ''");
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

const visibleButtonsWithText = async (text) => evaluate(`(() => {
  const expected = ${quote(text.toLowerCase())};
  return Array.from(document.querySelectorAll("button"))
    .filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.disabled
        && style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 0
        && rect.height > 0
        && (node.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase() === expected;
    })
    .map((node) => ({
      testId: node.getAttribute("data-testid"),
      text: (node.textContent || "").replace(/\\s+/g, " ").trim(),
    }));
})()`);

const clickLastButtonWithText = async (text) => {
  const clicked = await evaluate(`(() => {
    const expected = ${quote(text.toLowerCase())};
    const buttons = Array.from(document.querySelectorAll("button"))
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return !node.disabled
          && style.visibility !== "hidden"
          && style.display !== "none"
          && rect.width > 0
          && rect.height > 0
          && (node.textContent || "").replace(/\\s+/g, " ").trim().toLowerCase() === expected;
      });
    const node = buttons.at(-1);
    if (!node) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not click the last enabled button labelled ${text}`);
};

const clickOptionContaining = async (text) => {
  const clicked = await evaluate(`(() => {
    const expected = ${quote(text.toLowerCase())};
    const option = Array.from(document.querySelectorAll('[role="option"]'))
      .find((node) => (node.textContent || "").toLowerCase().includes(expected));
    if (!option) return false;
    option.click();
    return true;
  })()`);
  assert(clicked, `Could not select option containing ${text}`);
};

const captureVisible = async (name) => {
  const result = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(result.data, "base64"));
  return target;
};

const captureTarget = async (name, selector) => {
  const positioned = await evaluate(`(() => {
    const node = document.querySelector(${quote(selector)});
    if (!node) return false;
    node.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    return true;
  })()`);
  assert(positioned, `Could not position screenshot target ${selector}`);
  await sleep(160);
  const box = await evaluate(`(() => {
    const node = document.querySelector(${quote(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Math.max(0, rect.left - 16),
      y: Math.max(0, rect.top + window.scrollY - 16),
      width: Math.max(1, rect.width + 32),
      height: Math.max(1, rect.height + 32),
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
    "!!document.querySelector('[data-testid=\"dpr10-evidence-banner\"]')",
    `${pathname} DPR-10 fixture banner`,
  );
};

const scrollToBottom = async () => {
  await evaluate("window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })");
  await sleep(160);
};

const requestPaths = async () => {
  const state = await fixtureState();
  return state?.requests || [];
};

const verifyDraftBottomSave = async () => {
  const scenario = "dpr10-A-bottom-draft-save";
  await navigate(`/site/edit/${bottomDraftId}?dpr10=1&complete=1&role=admin&scenario=${scenario}`);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} progress row`);
  await setInput("input-dpr-remarks", "DPR10 BOTTOM SAVE VERIFIED");
  await waitFor(
    "document.querySelector('[data-testid=\"input-dpr-remarks\"]')?.value === 'DPR10 BOTTOM SAVE VERIFIED'",
    `${scenario} changed remarks`,
  );
  const controls = await visibleButtonsWithText("Save Progress");
  assert(
    controls.length >= 2,
    `${scenario} did not render both top and bottom draft save controls: ${JSON.stringify(controls)}`,
  );
  await scrollToBottom();
  const image = await captureVisible("dpr10-A-draft-bottom-controls");

  const before = await fixtureState();
  const beforeDrafts = before.dprDraftPayloads.length;
  const beforeVersions = before.dprVersionPayloads.length;
  const beforeConflicts = before.dpr10DraftVersionAttempts.length;
  await clickLastButtonWithText("Save Progress");
  await waitFor(
    `window.__DprSiteFixture?.dprDraftPayloads.length >= ${beforeDrafts + 1}`,
    `${scenario} PATCH draft save`,
  );
  const state = await fixtureState();
  const mutation = state.dprDraftPayloads.at(-1);
  assert(mutation?.id === bottomDraftId, `${scenario} saved the wrong draft: ${JSON.stringify(mutation)}`);
  assert(
    state.dprVersionPayloads.length === beforeVersions,
    `${scenario} unexpectedly created a version: ${JSON.stringify(state.dprVersionPayloads)}`,
  );
  assert(
    state.dpr10DraftVersionAttempts.length === beforeConflicts,
    `${scenario} still attempted draft versioning: ${JSON.stringify(state.dpr10DraftVersionAttempts)}`,
  );
  const request = state.requests
    .slice()
    .reverse()
    .find((candidate) => candidate.path.includes(`/api/dprs/${bottomDraftId}/draft`));
  assert(
    request?.method === "PATCH",
    `${scenario} did not use PATCH /draft: ${JSON.stringify(request)}`,
  );
  return {
    scenario,
    image,
    controls,
    mutation,
    request,
    versionCount: state.dprVersionPayloads.length,
    draftVersionAttempts: state.dpr10DraftVersionAttempts,
    requests: state.requests,
  };
};

const verifySubmittedAdminVersion = async () => {
  const scenario = "dpr10-B-submitted-admin-version";
  await navigate(`/site/edit/${submittedAdminId}?dpr10=1&complete=1&role=admin&scenario=${scenario}`);
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} progress row`);
  await setInput("input-dpr-remarks", "DPR10 ADMIN VERSION VERIFIED");
  await waitFor(
    "document.querySelector('[data-testid=\"input-dpr-remarks\"]')?.value === 'DPR10 ADMIN VERSION VERIFIED'",
    `${scenario} changed remarks`,
  );
  const controls = await visibleButtonsWithText("Save Changes");
  assert(
    controls.length >= 2,
    `${scenario} did not render top and bottom Save Changes controls: ${JSON.stringify(controls)}`,
  );
  await scrollToBottom();
  const image = await captureVisible("dpr10-B-submitted-bottom-controls");

  const before = await fixtureState();
  const beforeVersions = before.dprVersionPayloads.length;
  await clickLastButtonWithText("Save Changes");
  await waitFor(
    `window.__DprSiteFixture?.dprVersionPayloads.length >= ${beforeVersions + 1}`,
    `${scenario} POST version`,
  );
  const state = await fixtureState();
  const version = state.dprVersionPayloads.at(-1);
  assert(
    version?.id === submittedAdminId,
    `${scenario} version source id was not ${submittedAdminId}: ${JSON.stringify(version)}`,
  );
  const request = state.requests
    .slice()
    .reverse()
    .find((candidate) => candidate.path.includes(`/api/dprs/${submittedAdminId}/version`));
  assert(
    request?.method === "POST",
    `${scenario} did not use POST /version: ${JSON.stringify(request)}`,
  );
  await waitFor(
    "window.location.pathname.startsWith('/site/report/')",
    `${scenario} submitted report route`,
  );
  const reportImage = await captureVisible("dpr10-B-submitted-version-created");
  return {
    scenario,
    image,
    reportImage,
    controls,
    version,
    request,
    requests: state.requests,
  };
};

const verifyDelayedOverlapAndReasonedSubmit = async () => {
  const scenario = "dpr10-C-D-delayed-prior-overlap-reasoned-submit";
  await navigate(
    `/site/edit/${overlapDraftId}?dpr10=1&dpr10DelayedPriors=1&complete=1&role=admin`
      + `&returnTo=${encodeURIComponent(`/site/report/${overlapDraftId}`)}&scenario=${scenario}`,
  );
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} progress row`);
  await waitFor(
    "!!document.querySelector('[data-testid=\"edit-progress-0-item-select\"]')",
    `${scenario} programme-linked BOQ picker`,
  );
  await waitFor(
    "!!document.querySelector('[data-testid=\"progress-0-linked-summary\"]')"
      + " || !!document.querySelector('[data-testid=\"progress-0-programme-optional-status\"]')",
    `${scenario} programme linkage`,
  );

  // Leave the real rendered row unchanged while the delayed prior-DPR request
  // is in flight. This is the saved-draft exemption shape that regressed:
  // unchangedChainageRowKeys must not suppress a draft's prior overlap.
  const unchangedClaim = await evaluate(`(() => ({
    from: document.querySelector('[data-testid="input-chainage-from-0"]')?.value || null,
    to: document.querySelector('[data-testid="input-chainage-to-0"]')?.value || null,
  }))()`);
  assert(
    unchangedClaim?.from === "3+100" && unchangedClaim?.to === "3+250",
    `${scenario} did not start with the unchanged saved claim: ${JSON.stringify(unchangedClaim)}`,
  );
  await sleep(120);
  const beforePriors = await evaluate(
    "!!document.querySelector('[data-testid=\"progress-0-overlap-warning\"]')",
  );
  assert(
    beforePriors === false,
    `${scenario} warning rendered before delayed prior context completed`,
  );
  const pendingImage = await captureTarget("dpr10-C-overlap-before-delayed-prior", '[data-testid="progress-row-0"]');

  await waitFor(
    "!!document.querySelector('[data-testid=\"progress-0-overlap-warning\"]')",
    `${scenario} inline overlap warning after delayed priors`,
    100,
  );
  const warningText = await evaluate(
    "document.querySelector('[data-testid=\"progress-0-overlap-warning\"]')?.innerText || ''",
  );
  assert(/possible overlap|previously recorded/i.test(warningText), `Missing possible-overlap text: ${warningText}`);
  assert(
    await evaluate("!!document.querySelector('[data-testid=\"progress-0-button-overlap-reason\"]')"),
    `${scenario} warning did not render Give reason on the flagged row`,
  );
  const warningImage = await captureTarget(
    "dpr10-C-overlap-warning-give-reason",
    '[data-testid="progress-0-overlap-warning"]',
  );

  // Prove the real submit handler blocks while the inline warning has no
  // reason, rather than relying only on the fixture adapter's validation.
  const beforeSubmit = await fixtureState();
  const beforeSubmitted = beforeSubmit.dprSubmitPayloads.length;
  await clickLastButtonWithText("Submit DPR");
  await sleep(180);
  const blockedState = await fixtureState();
  assert(
    blockedState.dprSubmitPayloads.length === beforeSubmitted,
    `${scenario} submitted before a reason was saved: ${JSON.stringify(blockedState.dprSubmitPayloads)}`,
  );
  const blockedToast = blockedState.toasts.at(-1);
  assert(
    /reason required/i.test(String(blockedToast?.title || "")),
    `${scenario} missing client reason-required block: ${JSON.stringify(blockedToast)}`,
  );
  const blockedImage = await captureTarget("dpr10-D-submit-blocked-no-reason", '[data-testid="progress-row-0"]');

  await clickTestId("progress-0-button-overlap-reason");
  await waitFor(
    "!!document.querySelector('[data-testid=\"progress-0-overlap-reason-modal\"]')",
    `${scenario} overlap reason modal`,
  );
  const modalImage = await captureTarget(
    "dpr10-D-overlap-reason-modal",
    '[data-testid="progress-0-overlap-reason-modal"]',
  );
  await clickTestId("progress-0-select-overlap-reason");
  await waitFor(
    "Array.from(document.querySelectorAll('[role=\"option\"]')).some((node) => (node.textContent || '').toLowerCase().includes('genuine separately payable'))",
    `${scenario} overlap reason options`,
  );
  await clickOptionContaining("Genuine separately payable repeated operation");
  await clickTestId("progress-0-button-overlap-save");
  await waitFor(
    "!!document.querySelector('[data-testid=\"progress-0-overlap-reason-ok\"]')",
    `${scenario} saved overlap reason`,
  );
  const reasonText = await evaluate(
    "document.querySelector('[data-testid=\"progress-0-overlap-reason-ok\"]')?.innerText || ''",
  );
  assert(/genuine separately payable/i.test(reasonText), `Saved reason missing from flagged row: ${reasonText}`);
  const reasonImage = await captureTarget(
    "dpr10-D-overlap-reason-saved",
    '[data-testid="progress-0-overlap-warning"]',
  );

  const beforeReasonedSubmit = await fixtureState();
  const beforeReasonedSubmits = beforeReasonedSubmit.dprSubmitPayloads.length;
  await clickLastButtonWithText("Submit DPR");
  await waitFor(
    `window.__DprSiteFixture?.dprSubmitPayloads.length >= ${beforeReasonedSubmits + 1}`,
    `${scenario} POST submit after reason`,
  );
  const state = await fixtureState();
  assert(
    state.dpr10OverlapContextRequests.some((request) => request.delayed === true),
    `${scenario} did not record a delayed prior-context request`,
  );
  const submit = state.dprSubmitPayloads.at(-1);
  assert(
    submit?.id === overlapDraftId,
    `${scenario} submit route used wrong DPR id: ${JSON.stringify(submit)}`,
  );
  const request = state.requests
    .slice()
    .reverse()
    .find((candidate) => candidate.path.includes(`/api/dprs/${overlapDraftId}/submit`));
  assert(
    request?.method === "POST",
    `${scenario} did not hit POST /submit: ${JSON.stringify(request)}`,
  );
  await waitFor(
    "window.location.pathname.startsWith('/site/report/')",
    `${scenario} submitted report route`,
  );
  const submittedImage = await captureVisible("dpr10-D-submit-success");
  return {
    scenario,
    unchangedClaim,
    beforePriors,
    pendingImage,
    warningText,
    warningImage,
    blockedImage,
    blockedToast,
    modalImage,
    reasonText,
    reasonImage,
    submittedImage,
    submit,
    request,
    overlapContextRequests: state.dpr10OverlapContextRequests,
    requests: state.requests,
  };
};

await cdp("Page.enable");
await cdp("Runtime.enable");

const A = await verifyDraftBottomSave();
const B = await verifySubmittedAdminVersion();
const C_D = await verifyDelayedOverlapAndReasonedSubmit();

const finalState = await fixtureState();
assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);

const result = {
  scenario: "DPR-10 SiteEdit bottom gating, submitted version, delayed-prior overlap reason",
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
    browserFixture: "Rendered SiteEdit controls over the fixture's in-memory API adapter.",
    actualBackendTests: "None in this verifier; production Express/database route coverage remains separate.",
  },
  assertions: {
    A: "Draft bottom Save Progress used PATCH /api/dprs/:id/draft and did not attempt POST /version.",
    B: "Submitted admin bottom Save Changes continued to use POST /api/dprs/:id/version.",
    C: "An unchanged saved programme-linked draft row received delayed prior context and rendered an inline overlap warning with Give reason.",
    D: "Submit was blocked without a reason; saving the row reason allowed POST /api/dprs/:id/submit.",
  },
  evidence: { A, B, C_D },
  finalDocumentRequests: finalState?.requests || [],
  limitations: [
    "This is isolated browser evidence, not production backend/database evidence.",
    "The material-trip fixture data is available to SiteEdit's existing read-only day-trips panel; Fix 3 report composition is intentionally not changed here.",
  ],
  browserExceptions: browserErrors,
};

writeFileSync(path.join(evidenceDir, "dpr10-edit-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(
  path.join(evidenceDir, "dpr10-edit-request-log.json"),
  `${JSON.stringify({
    finalDocumentRequests: finalState?.requests || [],
    finalDocumentOverlapContext: finalState?.dpr10OverlapContextRequests || [],
    A: { requestLog: A.requests, mutation: A.mutation },
    B: { requestLog: B.requests, version: B.version },
    C_D: { requestLog: C_D.requests, submit: C_D.submit },
  }, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
socket.close();