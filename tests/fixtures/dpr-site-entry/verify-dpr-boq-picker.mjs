/*
 * DPR BOQ picker isolated browser regression.
 *
 * This verifier renders the real GuidedDpr, SiteEntry, and SiteEdit pages
 * against tests/fixtures/dpr-site-entry's in-memory fetch adapter. It checks
 * the item picker only; no save/submit control is clicked and no production
 * route or database is used.
 *
 * Run with:
 *   npx vite --config tests/fixtures/dpr-site-entry/vite.config.ts \
 *     --host 127.0.0.1 --port 4178 --strictPort
 *   node tests/fixtures/dpr-site-entry/verify-dpr-boq-picker.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR_FIXTURE_BASE_URL || "http://127.0.0.1:4178";
const cdpPort = process.env.DPR_BOQ_CDP_PORT || process.env.DPR07_CDP_PORT || "9222";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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
  const body = await evaluate("document.body?.innerText?.slice(0, 3000) || ''");
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

const settleAndInspectOption = async (testId) => {
  // Radix Drawer/Popover animations and the Command list mount asynchronously.
  // Wait for a settled frame, then bring the actual option into its scroll
  // container's viewport before measuring the physical hit target.
  await sleep(500);
  const geometry = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node) return null;
    node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const rect = node.getBoundingClientRect();
    const domX = rect.left + rect.width / 2;
    const domY = rect.top + rect.height / 2;
    const visual = window.visualViewport;
    const x = domX - (visual?.offsetLeft || 0);
    const y = domY - (visual?.offsetTop || 0);
    const hit = document.elementFromPoint(domX, domY);
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visual: {
        width: window.visualViewport?.width,
        height: window.visualViewport?.height,
        scale: window.visualViewport?.scale,
        devicePixelRatio: window.devicePixelRatio,
        offsetLeft: window.visualViewport?.offsetLeft,
        offsetTop: window.visualViewport?.offsetTop,
        pageLeft: window.visualViewport?.pageLeft,
        pageTop: window.visualViewport?.pageTop,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      },
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      domPoint: { x: domX, y: domY },
      point: { x, y },
      hitTest: !!hit && (hit === node || node.contains(hit)),
      hitTag: hit?.tagName || null,
      hitTestId: hit?.getAttribute?.("data-testid") || null,
      ariaDisabled: node.getAttribute("aria-disabled"),
    };
  })()`);
  assert(geometry, `Could not measure [data-testid=${testId}] after the 500ms settle`);
  assert(
    geometry.rect.width > 0
      && geometry.rect.height > 0
      && geometry.rect.top >= 0
      && geometry.rect.left >= 0
      && geometry.rect.right <= geometry.viewport.width
      && geometry.rect.bottom <= geometry.viewport.height,
    `[data-testid=${testId}] is outside the 500ms viewport bounds: ${JSON.stringify(geometry)}`,
  );
  assert(
    geometry.point.x >= 0
      && geometry.point.y >= 0
      && geometry.point.x <= geometry.visual.width
      && geometry.point.y <= geometry.visual.height,
    `[data-testid=${testId}] physical input point is outside the visual viewport: ${JSON.stringify(geometry)}`,
  );
  assert(geometry.hitTest, `[data-testid=${testId}] failed elementFromPoint hit-test: ${JSON.stringify(geometry)}`);
  assert(geometry.ariaDisabled !== "true", `[data-testid=${testId}] was disabled: ${JSON.stringify(geometry)}`);
  return geometry;
};

const clickOptionPhysically = async (testId, geometry) => {
  const { x, y } = geometry.point;
  // Dispatch at the measured, hit-tested option center. This is a browser
  // input event, not HTMLElement.click(), and works for desktop and mobile
  // emulation alike. Mobile layout coordinates are translated to the visual
  // viewport in settleAndInspectOption before reaching CDP.
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(120);
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

const navigate = async (pathname, width, height, mobile) => {
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
  await waitFor("!!document.querySelector('[data-testid=\"dpr07-evidence-banner\"]')", `${pathname} evidence banner`);
};

const readPickerState = async (prefix) => evaluate(`(() => {
  const bill = document.querySelector('[data-testid="${prefix}-bill-select"]');
  const item = document.querySelector('[data-testid="${prefix}-item-select"]');
  return {
    billText: bill?.textContent?.trim() || "",
    itemText: item?.textContent?.trim() || "",
    itemDisabled: !!item?.disabled,
  };
})()`);

const chooseNoBarItem = async (prefix, screenshotName, programmePrefix = prefix) => {
  const picker = await evaluate(`!!document.querySelector('[data-testid=${quote(`${prefix}-item-select`)}]')`);
  assert(picker, `${prefix} BOQ item picker did not render after BOQ items loaded`);

  const billTrigger = await evaluate(`document.querySelector('[data-testid=${quote(`${prefix}-bill-select`)}]') !== null`);
  let billOptions = [];
  let allBillsSelected = false;
  if (billTrigger) {
    await clickTestId(`${prefix}-bill-select`);
    await waitFor(
      `Array.from(document.querySelectorAll('[role="option"]')).some(node => (node.textContent || "").includes("BILL 9"))`,
      `${prefix} all-bill list`,
    );
    billOptions = await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).map(node => node.textContent || "")`);
    assert(billOptions.some((text) => text.includes("BILL 1") || text.includes("Road Work")), `${prefix} bill list omitted the road bill`);
    assert(billOptions.some((text) => text.includes("BILL 9")), `${prefix} bill list omitted BILL 9`);
    assert(billOptions.some((text) => text.trim() === "All bills"), `${prefix} bill list omitted the all-bills option`);
    // Keep the picker intentionally unscoped: the regression is that an item
    // in a different bill, and without a programme bar, remains selectable.
    await clickOptionContaining("All bills");
    allBillsSelected = true;
  }

  await waitFor(
    `document.querySelector('[data-testid=${quote(`${prefix}-item-select`)}]')?.disabled === false`,
    `${prefix} item picker enabled`,
  );
  await clickTestId(`${prefix}-item-select`);
  await waitFor(
    `!!document.querySelector('[data-testid="option-boq-item-8804"]')`,
    `${prefix} no-bar item option`,
  );
  const optionText = await evaluate(
    `document.querySelector('[data-testid="option-boq-item-8804"]')?.textContent || ""`,
  );
  assert(/NO-BAR SHOULDER WORK/i.test(optionText), `${prefix} no-bar item label was not discoverable: ${optionText}`);
  await setInput("input-boq-item-search", "NO-BAR");
  await waitFor(
    `!!document.querySelector('[data-testid="option-boq-item-8804"]') && document.querySelector('[data-testid="option-boq-item-8804"]')?.getAttribute("aria-disabled") !== "true"`,
    `${prefix} searched no-bar item`,
  );
  const optionGeometry = await settleAndInspectOption("option-boq-item-8804");
  const beforeSelectImage = await capture(`${screenshotName}-picker-open`);
  await clickOptionPhysically("option-boq-item-8804", optionGeometry);
  await waitFor(
    `document.body.innerText.toLowerCase().includes("no-bar shoulder work")`,
    `${prefix} selected no-bar item`,
  );
  await waitFor(
    `document.querySelector('[data-testid=${quote(`${prefix}-item-select`)}]')?.textContent?.toLowerCase().includes("no-bar shoulder work")`,
    `${prefix} selected item trigger`,
  );
  await waitFor(
    `!!document.querySelector('[data-testid=${quote(`${programmePrefix}-programme-optional-status`)}]')`,
    `${prefix} no-bar programme status`,
  );
  const optionalStatus = await evaluate(
    `document.querySelector('[data-testid=${quote(`${programmePrefix}-programme-optional-status`)}]')?.textContent || ""`,
  );
  assert(/not linked|optional|unavailable/i.test(optionalStatus), `${prefix} no-bar status was not explicit: ${optionalStatus}`);
  await sleep(350);
  const afterSelectImage = await capture(`${screenshotName}-no-bar-selected`);
  return {
    beforeSelectImage,
    afterSelectImage,
    optionalStatus,
    optionGeometry,
    clickMethod: "CDP Input.dispatchMouseEvent at settled hit-tested option center",
    allBillsSelected,
    billOptions,
    picker: await readPickerState(prefix),
  };
};

const prepareGuided = async ({ width, height, mobile, scenario }) => {
  await navigate(`/guided?dprBoq=1&dpr07=1&scenario=${scenario}&section=activities`, width, height, mobile);
  await waitFor(
    `document.querySelector('[data-testid="dpr-boq-status"]')?.textContent?.includes("NARASIMHULU ROAD BOQ")`,
    `${scenario} Guided BOQ project`,
  );
  await waitFor("!!document.querySelector('[data-testid=\"button-add-activity-step3\"]')", `${scenario} Guided add activity`);
  await clickTestId("button-add-activity-step3");
  await waitFor("!!document.querySelector('[data-testid=\"guided-progress-0-item-select\"]')", `${scenario} Guided picker`);
  return chooseNoBarItem("guided-progress-0", scenario, "guided-0");
};

const prepareDetailed = async ({ width, height, mobile, scenario }) => {
  await navigate(`/site/new?dprBoq=1&dpr07=1&scenario=${scenario}`, width, height, mobile);
  await waitFor("!!document.querySelector('[data-testid=\"input-site\"]')", `${scenario} Detailed site`);
  await waitFor("!!document.querySelector('[data-testid=\"select-engineer\"]')", `${scenario} Detailed engineer`);
  await setInput("input-date", "2026-08-08");
  await selectOption("select-engineer", "SURESH KUMAR");
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} Detailed activity row`);
  await waitFor("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')", `${scenario} Detailed picker`);
  return chooseNoBarItem("progress-0", scenario, "progress-0");
};

const prepareEdit = async ({ width, height, mobile, scenario }) => {
  await navigate(`/site/edit/6216?dprBoq=1&dpr07=1&scenario=${scenario}`, width, height, mobile);
  await waitFor(
    "!!document.querySelector('[data-testid=\"button-save-draft-progress\"]') || !!document.querySelector('[data-testid=\"button-save\"]')",
    `${scenario} SiteEdit`,
  );
  await waitFor("!!document.querySelector('[data-testid=\"progress-row-0\"]')", `${scenario} SiteEdit activity row`);
  await waitFor("!!document.querySelector('[data-testid=\"edit-progress-0-item-select\"]')", `${scenario} SiteEdit picker`);
  const loaded = await readPickerState("edit-progress-0");
  assert(/NO-BAR SHOULDER WORK/i.test(loaded.itemText), `${scenario} did not hydrate the saved no-bar item: ${JSON.stringify(loaded)}`);
  const evidence = await chooseNoBarItem("edit-progress-0", scenario, "progress-0");
  return { ...evidence, loaded };
};

const verifyRetry = async () => {
  const scenario = "dpr-boq-retry-desktop";
  await navigate(`/guided?dprBoq=1&dpr07=1&boqFailure=items&scenario=${scenario}&section=activities`, 1440, 1000, false);
  await waitFor("!!document.querySelector('[data-testid=\"dpr-boq-status\"]')", `${scenario} BOQ status`);
  await waitFor(
    `window.__DprSiteFixture?.boqItemRequests?.some(request => request.failed === true)`,
    `${scenario} failed BOQ item request`,
  );
  const failedImage = await capture(`${scenario}-failure`);
  const retryButton = await evaluate(`(() => {
    const nodes = Array.from(document.querySelectorAll('button'));
    const match = nodes.find(node => /retry|try again/i.test(node.textContent || "")
      || /retry/i.test(node.getAttribute("data-testid") || ""));
    if (!match || match.disabled) return null;
    return { testId: match.getAttribute("data-testid"), text: match.textContent || "" };
  })()`);
  assert(retryButton, `${scenario} did not render an enabled retry control after the BOQ item request failed`);
  await evaluate("window.__DprSiteFixture.boqItemsRetryEnabled = true");
  const clicked = await evaluate(`(() => {
    const node = ${retryButton.testId ? `document.querySelector('[data-testid=${quote(retryButton.testId)}]')` : `Array.from(document.querySelectorAll('button')).find(candidate => (candidate.textContent || '') === ${quote(retryButton.text)})`};
    if (!node || node.disabled) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `${scenario} retry control could not be clicked`);
  await waitFor(
    `window.__DprSiteFixture?.boqItemRequests?.some(request => request.failed === false)`,
    `${scenario} successful BOQ item retry`,
  );
  await waitFor("!!document.querySelector('[data-testid=\"button-add-activity-step3\"]')", `${scenario} Guided after retry`);
  await clickTestId("button-add-activity-step3");
  await waitFor("!!document.querySelector('[data-testid=\"guided-progress-0-item-select\"]')", `${scenario} picker after retry`);
  const evidence = await chooseNoBarItem("guided-progress-0", scenario, "guided-0");
  return { failedImage, retryButton, ...evidence, requests: (await fixtureState()).boqItemRequests };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const guidedDesktop = await prepareGuided({
  width: 1440,
  height: 1000,
  mobile: false,
  scenario: "dpr-boq-guided-desktop",
});
const detailedMobile = await prepareDetailed({
  width: 390,
  height: 844,
  mobile: true,
  scenario: "dpr-boq-detailed-mobile",
});
const editDesktop = await prepareEdit({
  width: 1440,
  height: 1000,
  mobile: false,
  scenario: "dpr-boq-edit-desktop",
});
const retry = await verifyRetry();

assert(browserErrors.length === 0, `Browser exceptions: ${browserErrors.join(" | ")}`);
const result = {
  scenario: "DPR BOQ picker isolated browser regression",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    productionDatabaseUsed: false,
    customerWrites: false,
    apiRouteMode: "browser fetch adapter with in-memory fixture state",
    backendIntegrationTest: false,
    evidenceDirectory: evidenceDir,
  },
  assertions: {
    guidedDesktop: "Guided fresh activity can discover and select an eligible BOQ item from the All bills view after initial load; item has no programme bar and remains explicitly optional.",
    detailedMobile: "Narrow mobile Detailed DPR renders the same all-bill picker and selects the eligible no-bar item through its drawer.",
    editDesktop: "Detailed Edit hydrates the saved no-bar BOQ item, keeps it discoverable, and preserves the selection without saving.",
    retry: "A failed BOQ item request renders an enabled retry; retry succeeds and the same no-bar item remains selectable.",
  },
  evidence: { guidedDesktop, detailedMobile, editDesktop, retry },
  browserExceptions: browserErrors,
  limitations: [
    "All requests and writes stay inside the fixture's in-memory fetch adapter.",
    "No Save, Save Draft, Submit, or mutation control is clicked.",
    "This verifies rendered browser behavior, not production Express/database integration.",
  ],
};
const finalState = await fixtureState();
writeFileSync(path.join(evidenceDir, "dpr-boq-picker-result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(path.join(evidenceDir, "dpr-boq-picker-request-log.json"), `${JSON.stringify({
  requests: finalState.requests,
  boqItemRequests: finalState.boqItemRequests,
}, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
socket.close();