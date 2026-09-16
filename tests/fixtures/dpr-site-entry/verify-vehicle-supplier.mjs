/*
 * Vehicle/supplier association browser regression.
 *
 * This verifier intentionally drives the real rendered controls through
 * Chromium CDP.  The fixture's fetch adapter returns synthetic suggestions,
 * accepts only the explicitly-versioned association PATCH, and never appends
 * a site-material trip.  It therefore exercises the three receipt surfaces
 * without touching a production API or creating an operational row.
 *
 * Run with:
 *   npm run fixture:dpr:serve
 *   node tests/fixtures/dpr-site-entry/verify-vehicle-supplier.mjs
 *
 * The fixture server and a Chromium CDP endpoint are intentionally managed by
 * the caller, just like the other dpr-site-entry evidence scripts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort =
  process.env.DPR_VEHICLE_SUPPLIER_CDP_PORT
  || process.env.DPR_BOQ_CDP_PORT
  || process.env.DPR07_CDP_PORT
  || "9222";
const site = "NARASIMHULU ROAD";
const knownVehicle = "TS15-U1234";
const unlinkedVehicle = "TS99-V000";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const physicalPointerEvidence = {
  desktopQuickKnownOption: null,
  mobileInlineKnownOption: null,
};

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
let page = targets.find((target) => target.type === "page" && target.url === "about:blank");
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
  }, 20_000);
  pending.set(id, {
    resolve: (value) => { clearTimeout(timer); resolve(value); },
    reject: (error) => { clearTimeout(timer); reject(new Error(`${method}: ${error.message}`)); },
  });
  socket.send(JSON.stringify({ id, method, params }));
});

let fixtureLoaded = false;

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

const waitFor = async (expression, label, attempts = 300) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 3500) || ''");
  throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(body)}`);
};

const fixtureState = () => evaluate("window.__DprSiteFixture || null");
const bodyText = () => evaluate("document.body?.innerText || ''");
const inputValue = (testId) => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.value ?? null`);

const clickTestId = async (testId, requireEnabled = true) => {
  const clicked = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node || (${requireEnabled} && node.disabled)) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not click ${requireEnabled ? "enabled " : ""}[data-testid=${testId}]`);
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

const focusInput = async (testId) => {
  const focused = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node) return false;
    node.focus();
    return document.activeElement === node;
  })()`);
  assert(focused, `Could not focus [data-testid=${testId}]`);
};

const focusAndType = async (testId, value) => {
  await focusInput(testId);
  await setInput(testId, value);
};

const clickOptionContaining = async (text) => {
  const clicked = await evaluate(`(() => {
    const wanted = ${quote(text)}.toLowerCase();
    const node = Array.from(document.querySelectorAll('[role="option"]'))
      .find(candidate => (candidate.textContent || "").toLowerCase().includes(wanted));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not select option containing ${text}`);
};

const selectRadixOption = async (testId, text) => {
  await clickTestId(testId);
  await waitFor(
    `Array.from(document.querySelectorAll('[role="option"]')).some(node => (node.textContent || "").toLowerCase().includes(${quote(text.toLowerCase())}))`,
    `${testId} option ${text}`,
  );
  await clickOptionContaining(text);
  await sleep(100);
};

const readOptionGeometry = async (text) => {
  // FreeTextSuggestionInput measures a portalled menu in an effect after the
  // option mounts; give Radix/dialog layout one settled frame before hitting
  // the target.
  await sleep(500);
  const geometry = await evaluate(`(() => {
    const wanted = ${quote(text)}.toLowerCase();
    const node = Array.from(document.querySelectorAll('[role="option"]'))
      .find(candidate => (candidate.textContent || "").toLowerCase().includes(wanted));
    if (!node) return null;
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const rect = node.getBoundingClientRect();
    const domX = rect.left + rect.width / 2;
    const domY = rect.top + rect.height / 2;
    const visual = window.visualViewport;
    const hit = document.elementFromPoint(domX, domY);
    return {
      text: node.textContent || "",
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visual: {
        width: visual?.width ?? window.innerWidth,
        height: visual?.height ?? window.innerHeight,
        scale: visual?.scale ?? 1,
        offsetLeft: visual?.offsetLeft ?? 0,
        offsetTop: visual?.offsetTop ?? 0,
      },
      rect: {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
      },
      point: {
        x: domX - (visual?.offsetLeft ?? 0),
        y: domY - (visual?.offsetTop ?? 0),
      },
      hitTest: !!hit && (hit === node || node.contains(hit)),
      hitTag: hit?.tagName || null,
      ariaDisabled: node.getAttribute("aria-disabled"),
    };
  })()`);
  assert(geometry, `Could not measure option containing ${text}`);
  assert(
    geometry.rect.width > 0
      && geometry.rect.height > 0
      && geometry.rect.left >= 0
      && geometry.rect.top >= 0
      && geometry.rect.right <= geometry.viewport.width
      && geometry.rect.bottom <= geometry.viewport.height,
    `Option ${text} is outside viewport: ${JSON.stringify(geometry)}`,
  );
  assert(
    geometry.point.x >= 0
      && geometry.point.y >= 0
      && geometry.point.x <= geometry.visual.width
      && geometry.point.y <= geometry.visual.height,
    `Option ${text} physical point is outside visual viewport: ${JSON.stringify(geometry)}`,
  );
  assert(geometry.hitTest, `Option ${text} failed elementFromPoint hit-test: ${JSON.stringify(geometry)}`);
  assert(geometry.ariaDisabled !== "true", `Option ${text} is disabled: ${JSON.stringify(geometry)}`);
  return geometry;
};

const clickOptionPhysically = async (geometry) => {
  const { x, y } = geometry.point;
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(160);
};

const selectSuggestion = async (testId, text, { physical = false } = {}) => {
  await focusAndType(testId, text);
  await waitFor(
    `Array.from(document.querySelectorAll('[role="option"]')).some(node => (node.textContent || "").toLowerCase().includes(${quote(text.toLowerCase())}))`,
    `${testId} suggestion ${text}`,
  );
  if (physical) {
    const geometry = await readOptionGeometry(text);
    await clickOptionPhysically(geometry);
    return geometry;
  }
  await clickOptionContaining(text);
  await sleep(120);
  return null;
};

const assertEnabled = async (testId) => {
  const enabled = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    return !!node && !node.disabled;
  })()`);
  assert(enabled, `[data-testid=${testId}] is disabled or missing`);
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

const navigate = async (pathname, width = 1440, height = 1000, mobile = false) => {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  if (!fixtureLoaded) {
    await cdp("Page.navigate", { url: `${baseUrl}${pathname}` });
    fixtureLoaded = true;
  } else {
    // Keep the in-memory fixture request log across surfaces.  The fixture's
    // history.pushState wrapper dispatches popstate, which remounts the real
    // page while preserving the synthetic request state.
    await evaluate(`window.history.pushState({}, "", ${quote(pathname)})`);
  }
  await waitFor("document.readyState === 'complete'", `${pathname} document`);
  await sleep(120);
};

const quickPath = (suggestionFailure = false) =>
  `/site/material-trips?site=${encodeURIComponent(site)}${suggestionFailure ? "&suggestionFailure=1" : ""}`;
const receivedPath = (suggestionFailure = false) =>
  `/site/materials-received?dateFrom=2026-08-05&dateTo=2026-08-05&site=${encodeURIComponent(site)}${suggestionFailure ? "&suggestionFailure=1" : ""}`;

const quickEntryRegression = async () => {
  await navigate(quickPath());
  await waitFor("!!document.querySelector('[data-testid=\"input-trip-vehicle\"]')", "Quick Materials Entry");
  await waitFor("window.__DprSiteFixture?.requests.some(r => r.path.startsWith('/api/site-material-trips/suggestions'))", "Quick Entry suggestions");

  // Manual entry is never silently replaced by a background suggestion
  // refresh/rerender.  The quantity change is an ordinary parent rerender.
  await setInput("input-trip-supplier", "MANUAL SUPPLIER");
  await setInput("input-trip-quantity", "5");
  await sleep(120);
  assert(await inputValue("input-trip-supplier") === "MANUAL SUPPLIER", "Quick Entry manual supplier was overwritten by a rerender");

  // An unlinked vehicle leaves the manually-entered supplier untouched.
  await selectSuggestion("input-trip-vehicle", unlinkedVehicle);
  assert(await inputValue("input-trip-supplier") === "MANUAL SUPPLIER", "Unlinked vehicle changed the supplier");

  // Switching to the explicit known suggestion fills the stable association.
  const quickGeometry = await selectSuggestion("input-trip-vehicle", knownVehicle, { physical: true });
  assert(quickGeometry.hitTest, "Desktop Quick Entry suggestion did not pass the physical hit-test");
  physicalPointerEvidence.desktopQuickKnownOption = quickGeometry;
  assert(await inputValue("input-trip-vehicle") === knownVehicle, "Known vehicle was not selected");
  assert(await inputValue("input-trip-supplier") === "ACME", "Known vehicle did not fill stable supplier ACME");
  await capture("vehicle-supplier-quick-known");

  // Fill only the non-operational controls needed to prove failed optional
  // suggestions do not disable entry or its save action.
  await selectRadixOption("select-trip-material", "GSB");
  await selectRadixOption("select-trip-transport-type", "Agency / Vendor");
  await waitFor("!!document.querySelector('[data-testid=\"trip-work-ctx-select-item\"]')", "Quick Entry work item selector");
  await selectRadixOption("trip-work-ctx-select-item", "GSB LAYING");
  await assertEnabled("button-submit-trip");

  // A user can deliberately disagree with the stable association.  Cancel
  // must leave the input and fixture write log unchanged.
  await setInput("input-trip-supplier", "OTHER SUPPLIER");
  await waitFor("!!document.querySelector('[data-testid=\"trip-vehicle-supplier-correct\"]')", "Quick Entry correction action");
  const beforeCancel = (await fixtureState()).vehicleSupplierPatchPayloads.length;
  await clickTestId("trip-vehicle-supplier-correct");
  await waitFor("!!document.querySelector('[data-testid=\"trip-vehicle-supplier-dialog\"]')", "Quick Entry correction dialog");
  await capture("vehicle-supplier-quick-correction-dialog");
  await clickTestId("trip-vehicle-supplier-cancel");
  await waitFor("!document.querySelector('[data-testid=\"trip-vehicle-supplier-dialog\"]')", "Quick Entry correction cancel");
  assert((await fixtureState()).vehicleSupplierPatchPayloads.length === beforeCancel, "Correction cancel issued a PATCH");
  assert(await inputValue("input-trip-supplier") === "OTHER SUPPLIER", "Correction cancel changed supplier");

  // Confirming the deliberate correction is the only permitted write and
  // carries the optimistic version returned by the synthetic GET.
  await clickTestId("trip-vehicle-supplier-correct");
  await waitFor("!!document.querySelector('[data-testid=\"trip-vehicle-supplier-dialog\"]')", "Quick Entry second correction dialog");
  await clickTestId("trip-vehicle-supplier-confirm");
  await waitFor("window.__DprSiteFixture?.vehicleSupplierPatchPayloads.length > 0", "versioned vehicle supplier PATCH");
  const state = await fixtureState();
  const patch = state.vehicleSupplierPatchPayloads.at(-1);
  assert(patch.site === site, "Vehicle supplier PATCH used the wrong site");
  assert(String(patch.vehicleNumber).toUpperCase().replace(/[\s-]+/g, "") === "TS15U1234", "Vehicle supplier PATCH used the wrong normalized vehicle");
  assert(patch.supplier === "OTHER SUPPLIER", "Vehicle supplier PATCH did not preserve deliberate supplier correction");
  assert(patch.expectedVersion === "v1", "Vehicle supplier PATCH omitted expected version v1");
  assert(patch.expectedSupplier === "ACME", "Vehicle supplier PATCH omitted expected stable supplier ACME");
  assert(state.vehicleSupplierPatchFailures.length === 0, "Fixture rejected the expected-version correction PATCH");
  assert(await inputValue("input-trip-supplier") === "OTHER SUPPLIER", "Confirmed correction did not retain supplier");
};

const inlineReceiptRegression = async () => {
  await navigate("/fixture/vehicle-supplier-inline", 390, 844, true);
  await waitFor("!!document.querySelector('[data-testid=\"vehicle-supplier-fixture-banner\"]')", "inline fixture banner");
  await waitFor("!!document.querySelector('[data-testid=\"inline-receipt-strip\"]')", "inline receipt strip");
  await clickTestId("inline-record-receipt");
  await waitFor("!!document.querySelector('[data-testid=\"inline-rr-vehicle\"]')", "inline receipt dialog");
  await waitFor("!!document.querySelector('[role=\"dialog\"]')", "inline receipt modal");

  // This is a physical mobile pointer selection, not HTMLElement.click().
  await setInput("inline-rr-supplier", "MANUAL SUPPLIER");
  const geometry = await selectSuggestion("inline-rr-vehicle", knownVehicle, { physical: true });
  assert(geometry.hitTest, "Mobile inline suggestion did not pass the physical hit-test");
  physicalPointerEvidence.mobileInlineKnownOption = geometry;
  assert(await inputValue("inline-rr-vehicle") === knownVehicle, "Inline dialog known vehicle was not selected");
  assert(await inputValue("inline-rr-supplier") === "ACME", "Inline dialog known vehicle did not fill ACME");
  await capture("vehicle-supplier-inline-mobile-option");

  await setInput("inline-rr-quantity", "1");
  await assertEnabled("inline-rr-save");

  // Exercise the shared correction dialog in the inline receipt modal, but
  // cancel it so this surface also remains write-free.
  await setInput("inline-rr-supplier", "OTHER SUPPLIER");
  await waitFor("!!document.querySelector('[data-testid=\"inline-rr-vehicle-supplier-correct\"]')", "inline correction action");
  const beforeCancel = (await fixtureState()).vehicleSupplierPatchPayloads.length;
  await clickTestId("inline-rr-vehicle-supplier-correct");
  await waitFor("!!document.querySelector('[data-testid=\"inline-rr-vehicle-supplier-dialog\"]')", "inline correction dialog");
  await clickTestId("inline-rr-vehicle-supplier-cancel");
  await waitFor("!document.querySelector('[data-testid=\"inline-rr-vehicle-supplier-dialog\"]')", "inline correction cancel");
  assert((await fixtureState()).vehicleSupplierPatchPayloads.length === beforeCancel, "Inline correction cancel issued a PATCH");
  assert(await inputValue("inline-rr-supplier") === "OTHER SUPPLIER", "Inline correction cancel changed supplier");
  await clickTestId("inline-rr-done");
};

const receivedEditRegression = async () => {
  await navigate(receivedPath());
  await waitFor("!!document.querySelector('[data-testid=\"row-material-trip-9701\"]')", "Materials Received synthetic row");
  await clickTestId("row-material-trip-9701", false);
  await waitFor("!!document.querySelector('[data-testid=\"btn-admin-edit\"]')", "Materials Received admin edit");
  await clickTestId("btn-admin-edit");
  await waitFor("!!document.querySelector('[data-testid=\"input-edit-vehicle\"]')", "Materials Received edit dialog");

  await setInput("input-edit-supplier", "MANUAL SUPPLIER");
  await selectSuggestion("input-edit-vehicle", knownVehicle);
  assert(await inputValue("input-edit-vehicle") === knownVehicle, "Materials Received known vehicle was not selected");
  assert(await inputValue("input-edit-supplier") === "ACME", "Materials Received known vehicle did not fill ACME");

  // The edit form remains a normal controlled form after a parent rerender.
  await setInput("input-edit-supplier", "MANUAL SUPPLIER");
  await setInput("input-edit-quantity", "13");
  await sleep(120);
  assert(await inputValue("input-edit-supplier") === "MANUAL SUPPLIER", "Materials Received manual supplier was overwritten");
  await assertEnabled("button-save-edit");
  await capture("vehicle-supplier-materials-received-edit");
};

const failedSuggestionRegression = async () => {
  await navigate(quickPath(true));
  await waitFor("!!document.querySelector('[data-testid=\"input-trip-supplier\"]')", "failed Quick Entry suggestion input");
  await waitFor("document.body.innerText.includes('Suggestions unavailable')", "Quick Entry optional suggestion failure");
  await assertEnabled("input-trip-supplier");
  await selectRadixOption("select-trip-material", "GSB");
  await selectRadixOption("select-trip-transport-type", "Agency / Vendor");
  await waitFor("!!document.querySelector('[data-testid=\"trip-work-ctx-select-item\"]')", "failed Quick Entry work item selector");
  await selectRadixOption("trip-work-ctx-select-item", "GSB LAYING");
  await setInput("input-trip-vehicle", "UNKNOWN-99");
  await setInput("input-trip-supplier", "MANUAL SUPPLIER");
  await setInput("input-trip-quantity", "1");
  await assertEnabled("button-submit-trip");
  await capture("vehicle-supplier-suggestion-failure-quick");

  await navigate("/fixture/vehicle-supplier-inline?suggestionFailure=1", 390, 844, true);
  await waitFor("!!document.querySelector('[data-testid=\"inline-receipt-strip\"]')", "failed inline suggestion strip");
  await clickTestId("inline-record-receipt");
  await waitFor("!!document.querySelector('[data-testid=\"inline-rr-vehicle\"]')", "failed inline suggestion dialog");
  await waitFor("document.body.innerText.includes('Suggestions unavailable')", "inline optional suggestion failure");
  await assertEnabled("inline-rr-vehicle");
  await setInput("inline-rr-quantity", "1");
  await assertEnabled("inline-rr-save");

  await navigate(receivedPath(true));
  await waitFor("!!document.querySelector('[data-testid=\"row-material-trip-9701\"]')", "failed Materials Received row");
  await clickTestId("row-material-trip-9701", false);
  await waitFor("!!document.querySelector('[data-testid=\"btn-admin-edit\"]')", "failed Materials Received admin edit");
  await clickTestId("btn-admin-edit");
  await waitFor("!!document.querySelector('[data-testid=\"input-edit-vehicle\"]')", "failed Materials Received edit");
  await waitFor("document.body.innerText.includes('Suggestions unavailable')", "Materials Received optional suggestion failure");
  await assertEnabled("input-edit-vehicle");
  await assertEnabled("button-save-edit");
  await capture("vehicle-supplier-suggestion-failure-received-edit");
};

const startedAt = new Date().toISOString();
try {
  await quickEntryRegression();
  await inlineReceiptRegression();
  await receivedEditRegression();
  await failedSuggestionRegression();

  const state = await fixtureState();
  assert(state.siteMaterialTripCreatePayloads.length === 0, "Regression created an operational site-material trip");
  assert(state.siteMaterialTripUpdatePayloads.length === 0, "Regression updated an operational site-material trip");
  assert(
    state.vehicleSupplierPatchPayloads.length === 1,
    `Expected one confirmed association correction, saw ${state.vehicleSupplierPatchPayloads.length}`,
  );
  assert(browserErrors.length === 0, `Browser exceptions were reported: ${browserErrors.join("; ")}`);

  const result = {
    fixture: "dpr-site-entry",
    scenario: "vehicle-supplier-association",
    fixtureOnly: true,
    productionWrites: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    surfaces: [
      "Quick Materials Entry",
      "inline ActivityReceiptStrip receipt dialog",
      "Materials Received edit dialog",
    ],
    desktopPhysicalOptionHitTest: true,
    mobilePhysicalOptionHitTest: true,
    physicalPointerEvidence,
    suggestionFailureInputsAndSaveRemainEnabled: true,
    confirmedAssociationPatches: state.vehicleSupplierPatchPayloads,
    cancelledAssociationPatches: "none beyond the one confirmed correction",
    operationalTripCreates: state.siteMaterialTripCreatePayloads,
    operationalTripUpdates: state.siteMaterialTripUpdatePayloads,
    requests: state.requests,
    browserErrors,
    requestCount: state.requests.length,
    evidence: [
      "vehicle-supplier-quick-known.png",
      "vehicle-supplier-quick-correction-dialog.png",
      "vehicle-supplier-inline-mobile-option.png",
      "vehicle-supplier-materials-received-edit.png",
      "vehicle-supplier-suggestion-failure-quick.png",
      "vehicle-supplier-suggestion-failure-received-edit.png",
    ],
  };
  const resultPath = path.join(evidenceDir, "vehicle-supplier-result.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  socket.terminate();
  console.log(JSON.stringify({ ok: true, resultPath, evidenceDir, patch: state.vehicleSupplierPatchPayloads.at(-1) }, null, 2));
} catch (error) {
  const state = await fixtureState().catch(() => null);
  const failure = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    browserErrors,
    fixtureState: state,
  };
  const failurePath = path.join(evidenceDir, "vehicle-supplier-result.json");
  writeFileSync(failurePath, `${JSON.stringify(failure, null, 2)}\n`);
  socket.terminate();
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
