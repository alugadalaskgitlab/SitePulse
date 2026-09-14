/*
 * DPR-01 isolated browser evidence.
 *
 * Start the fixture Vite server on port 4179 and Chromium's CDP endpoint on
 * port 9222 before running this script:
 *
 *   npx vite --config tests/fixtures/dpr-site-report/vite.config.ts \
 *     --host 127.0.0.1 --port 4179
 *   node tests/fixtures/dpr-site-report/verify.mjs
 *
 * The script drives the real SiteReport and SiteEdit components through their
 * rendered browser UI.  API responses and the one SiteEdit version payload
 * are held by main.tsx's in-memory adapter; no production API is contacted.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = "http://127.0.0.1:4179";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = await (
  await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })
).json();
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
    console.error(
      `Browser exception: ${
        message.params.exceptionDetails.exception?.description
        || message.params.exceptionDetails.text
      }`,
    );
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

const waitFor = async (expression, label, attempts = 240) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const bodyText = () => evaluate("document.body.innerText || ''");

const fixtureState = () => evaluate("window.__DprSiteReportFixture || null");

const navigate = async (pathname, width = 1440, height = 1000) => {
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
  await waitFor(
    "!!document.querySelector('[data-testid=\"fixture-evidence-notice\"]')",
    `${pathname} fixture notice`,
  );
};

const captureFullPage = async (name) => {
  const metrics = await cdp("Page.getLayoutMetrics");
  const content = metrics.cssContentSize || metrics.contentSize;
  const screenshot = await cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.ceil(content.width),
      height: Math.ceil(content.height),
      scale: 1,
    },
  });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(screenshot.data, "base64"));
  return target;
};

const clickTestId = async (testId) => {
  const clicked = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node) return false;
    node.click();
    return true;
  })()`);
  assert(clicked, `Could not click [data-testid=${testId}]`);
};

const countText = (text, value) => {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(escaped, "g")) || []).length;
};

const assertBoqNormalization = async (label, dprId) => {
  const state = await fixtureState();
  assert(state?.expectedDecoratedSite?.includes("Edited by Admin"), `${label}: decorated site fixture missing`);
  assert(state?.expectedBaseSite === "TAKKADPALLY-SIRUR", `${label}: base site fixture missing`);
  const siteIndex = state.requests.findIndex((request) => request.path === "/api/sites");
  const dprIndex = state.requests.findIndex(
    (request) => request.path === `/api/dprs/${dprId}`,
  );
  const projectIndex = state.requests.findIndex(
    (request) => request.path === "/api/boq/projects?siteId=18",
  );
  const itemsIndex = state.requests.findIndex(
    (request) => request.path === "/api/boq/projects/1/items",
  );
  assert(siteIndex >= 0, `${label}: /api/sites was not requested`);
  assert(dprIndex >= 0, `${label}: /api/dprs/${dprId} was not requested`);
  assert(projectIndex > siteIndex, `${label}: exact project request did not follow site resolution`);
  assert(itemsIndex > projectIndex, `${label}: exact item request did not follow project request`);
  assert(
    state.boqProjectRequests.some((request) => request.siteId === "18"),
    `${label}: exact project siteId=18 request missing`,
  );
  assert(
    state.boqItemsRequests.some((request) => request.projectId === "1"),
    `${label}: exact project 1 items request missing`,
  );
  assert(
    state.normalizedSiteRequests.some((request) =>
      request.decoratedSite === state.expectedDecoratedSite
      && request.normalizedSite === state.expectedBaseSite
      && request.siteId === "18"
    ),
    `${label}: decorated DPR site was not observed normalized before BOQ lookup`,
  );
  assert(
    !state.boqProjectRequests.some((request) => request.siteId === null),
    `${label}: hook attempted a null-site BOQ project lookup`,
  );
  return {
    siteRequestIndex: siteIndex,
    dprRequestIndex: dprIndex,
    projectRequestIndex: projectIndex,
    itemsRequestIndex: itemsIndex,
    normalizedSite: state.normalizedSiteRequests.at(-1),
  };
};

const verifyARealRecordDerived = async () => {
  await navigate("/site/report/364");
  await waitFor(
    "document.body.innerText.includes('roadway excavation') && document.body.innerText.includes('embankment - excavated earth')",
    "A matching BOQ names",
  );
  const text = await bodyText();
  assert(text.includes("TAKKADPALLY-SIRUR"), "A report site was not rendered");
  assert(!text.includes("BOQ activity unavailable"), "A still rendered an unavailable BOQ activity");
  assert(
    await evaluate("document.querySelectorAll('[data-testid=\"equipment-compact-0\"]').length === 1"),
    "A did not render the JCB compact report card",
  );
  assert(
    countText(text, "roadway excavation") >= 2,
    "A roadway excavation was not present in both activity/report assignment evidence",
  );
  assert(
    countText(text, "embankment - excavated earth") >= 1,
    "A embankment assignment name was not rendered",
  );
  const requests = await assertBoqNormalization("A", 364);
  const screenshot = await captureFullPage("dpr01-A-dpr364-matching-boq-names");
  return { screenshot, requests };
};

const verifyBSingleItem = async () => {
  await navigate("/site/report/362");
  await waitFor(
    "document.body.innerText.includes('clearing and grubbing') && !document.body.innerText.includes('BOQ activity unavailable')",
    "B single BOQ name",
  );
  const text = await bodyText();
  assert(!text.includes("BOQ activity unavailable"), "B rendered an unavailable BOQ activity");
  assert(
    !text.includes("roadway excavation") && !text.includes("embankment - excavated earth"),
    "B unexpectedly rendered an additional assignment name",
  );
  assert(
    countText(text, "clearing and grubbing") >= 2,
    "B single assignment was not rendered in both activity/report evidence",
  );
  const requests = await assertBoqNormalization("B", 362);
  const screenshot = await captureFullPage("dpr01-B-single-boq-item");
  return { screenshot, requests };
};

const verifyCSeparatePhysicalSegment = async () => {
  await navigate("/site/report/363?scenario=second-physical-segment");
  await waitFor(
    "document.body.innerText.includes('roadway excavation') && document.body.innerText.includes('embankment - excavated earth')",
    "C second physical segment BOQ names",
  );
  const text = await bodyText();
  assert(!text.includes("BOQ activity unavailable"), "C rendered an unavailable BOQ activity");
  assert(
    countText(text, "roadway excavation") >= 2
      && countText(text, "embankment - excavated earth") >= 2,
    "C did not render both names for the separate physical segments",
  );
  assert(
    text.includes("8:50 AM") && text.includes("12:00 PM") && text.includes("3:50 PM"),
    "C did not render the two physical segment time boundaries",
  );
  const segmentCards = await evaluate(`(() => {
    const compact = document.querySelector('[data-testid="equipment-compact-0"]');
    const work = Array.from(compact?.querySelectorAll('section') || [])
      .find(node => (node.textContent || '').includes('Work Assignment'));
    const grid = Array.from(work?.children || [])
      .find(node => node.className?.toString().includes('grid') && node.children.length === 2);
    return grid?.children.length || 0;
  })()`);
  assert(segmentCards === 2, `C expected two physical assignment cards, found ${segmentCards}`);
  const requests = await assertBoqNormalization("C", 363);
  const screenshot = await captureFullPage("dpr01-C-second-physical-segment");
  return { screenshot, requests, segmentCards };
};

const verifyDSiteEditNoChangeSave = async () => {
  await navigate("/site/edit/364?complete=1", 1440, 1200);
  await waitFor(
    "document.querySelector('[data-testid=\"button-save\"]') && document.body.innerText.includes('roadway excavation') && document.body.innerText.includes('embankment - excavated earth')",
    "D SiteEdit assignment names and save button",
  );
  assert(
    await evaluate("!document.querySelector('[data-testid=\"button-save\"]').disabled"),
    "D SiteEdit save button was disabled",
  );
  const before = await fixtureState();
  const originalRequestCount = before.requests.length;
  const screenshot = await captureFullPage("dpr01-D-site-edit-unchanged-assignment");
  await clickTestId("button-save");
  await waitFor(
    "window.__DprSiteReportFixture?.versionPayloads.length >= 1",
    "D SiteEdit version save payload",
  );
  const state = await fixtureState();
  const saved = state.versionPayloads.at(-1);
  const response = state.versionResponses.at(-1);
  assert(saved?.id === 364, `D SiteEdit version source id was ${saved?.id}`);
  const savedRow = saved?.payload?.data?.equipment?.[0];
  assert(savedRow?.machine === "JCB", "D SiteEdit save payload changed the machine row");
  assert(
    savedRow?.activitySegments == null
      || JSON.stringify(savedRow.activitySegments) === JSON.stringify([
        {
          startTime: "09:00",
          endTime: "16:42",
          boqItems: [
            { boqItemId: 3, programmeBarId: null },
            { boqItemId: 4, programmeBarId: null },
          ],
        },
      ]),
    "D SiteEdit changed the untouched assignment values in its save payload",
  );
  assert(
    JSON.stringify(response?.equipment?.[0]?.activitySegments) === JSON.stringify([
      {
        startTime: "09:00",
        endTime: "16:42",
        boqItems: [
          { boqItemId: 3, programmeBarId: null },
          { boqItemId: 4, programmeBarId: null },
        ],
      },
    ]),
    "D SiteEdit mock version response did not preserve the untouched assignments",
  );
  const writes = state.requests
    .slice(originalRequestCount)
    .filter((request) => request.method !== "GET");
  assert(
    writes.every((request) => request.path === "/api/dprs/364/version"),
    "D emitted a non-version or non-fixture write",
  );
  return {
    screenshot,
    versionSourceId: saved.id,
    sentAssignment: savedRow?.activitySegments ?? "omitted intentionally for untouched persisted row",
    persistedAssignment: response.equipment[0].activitySegments,
    writes: writes.map((request) => request.path),
  };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const A = await verifyARealRecordDerived();
const B = await verifyBSingleItem();
const C = await verifyCSeparatePhysicalSegment();
const D = await verifyDSiteEditNoChangeSave();

console.log(JSON.stringify({
  scenario: "DPR-01 SiteReport/SiteEdit isolated browser evidence",
  baseUrl,
  evidenceDirectory: evidenceDir,
  provenance: {
    authenticatedLiveRecord: false,
    productionWrites: false,
    copiedVerifiedShape: "DPR364/log913, DPR363/log912, DPR362/log911; site 18; BOQ project 1",
  },
  rootCauseEvidence: {
    beforeFixEquivalent: "A raw decorated site string has no exact /api/sites match and therefore no siteId/project/items request.",
    verifiedFixBoundary: "The real SiteReport caller normalizes dpr.site before useDprBoqItems; this fixture asserts siteId=18 then project 1 then items.",
  },
  screenshots: { A: A.screenshot, B: B.screenshot, C: C.screenshot, D: D.screenshot },
  assertions: {
    A: "DPR364 renders roadway excavation and embankment - excavated earth in read-only Work Assignment.",
    B: "DPR362 renders its one clearing and grubbing assignment without an additional item.",
    C: "DPR363 fixture variation renders two distinct physical time segments with the correct names.",
    D: "SiteEdit reopens both assignments and an unchanged save preserves them in the in-memory version response.",
    boqRequests: "Each scenario requests exact siteId=18 project 1 and project 1 items only after site resolution.",
  },
  evidence: { A, B, C, D },
}, null, 2));

socket.close();