/*
 * DPR-02 isolated browser evidence.
 *
 * Start the fixture and an existing Chromium CDP endpoint before running:
 *
 *   npx vite --config tests/fixtures/dpr02/vite.config.ts \
 *     --host 127.0.0.1 --port 4182
 *   node tests/fixtures/dpr02/verify.mjs
 *
 * The script drives rendered production components.  The fixture's fetch
 * adapter owns every API response and keeps any non-GET request in memory;
 * this verifier intentionally performs no save/submit action.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = process.env.DPR02_FIXTURE_BASE_URL || "http://127.0.0.1:4182";
const cdpPort = process.env.DPR02_CDP_PORT || "9222";

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
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (message.method === "Page.javascriptDialogOpening") {
    void cdp("Page.handleJavaScriptDialog", { accept: true });
  }
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    console.error(`Browser exception: ${details.text || details.exception?.description || "unknown"}`);
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
const waitFor = async (expression, label, attempts = 300) => {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  const body = await evaluate("document.body?.innerText?.slice(0, 1600) || ''");
  throw new Error(`Timed out waiting for ${label}; body=${JSON.stringify(body)}`);
};
const bodyText = () => evaluate("document.body?.innerText || ''");
const fixtureState = () => evaluate("window.__Dpr02Fixture || null");

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

/*
 * Evidence is clipped to the selected target rather than capturing the
 * viewport's top form.  This keeps each screenshot readable even when the
 * equipment row is below the page header, and works at both desktop and
 * mobile metrics.
 */
const captureTarget = async (name, selector) => {
  const positioned = await evaluate(`(() => {
    const node = document.querySelector(${quote(selector)});
    if (!node) return null;
    // Put the target at the top of the visible surface. A target can be
    // taller than the viewport (notably SiteEntry's legacy wrapper), so the
    // target's document y coordinate is retained for CDP's beyond-viewport
    // clip rather than accidentally clipping the page origin.
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
  assert(box, `Could not position screenshot target ${selector}`);
  await sleep(150);
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

const textOf = (selector) => evaluate(
  `document.querySelector(${quote(selector)})?.textContent?.replace(/\\s+/g, " ").trim() || ""`,
);
const countText = (text, value) => {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(escaped, "gi")) || []).length;
};

const expandCompact = async (index) => {
  const expanded = await evaluate(`(() => {
    const row = document.querySelector('[data-testid="equipment-compact-${index}"]');
    const button = row?.querySelector('button[aria-expanded]');
    if (!button) return false;
    if (button.getAttribute("aria-expanded") === "false") button.click();
    return true;
  })()`);
  assert(expanded, `Could not expand compact equipment row ${index}`);
  await waitFor(
    `!!document.querySelector('[data-testid="equipment-compact-${index}"] [data-testid="equipment-compact-start-${index}"]')`,
    `compact equipment ${index} inputs`,
  );
};

const verifyGuidedHireBases = async () => {
  await navigate("/guided?draftId=6250&section=equipment");
  await waitFor("!!document.querySelector('[data-testid=\"card-equipment-step\"]')", "Guided equipment step");
  await waitFor("document.querySelectorAll('[data-testid^=\"equipment-compact-\"]').length >= 6", "six Guided compact rows");
  for (let index = 0; index < 6; index += 1) await expandCompact(index);

  const text = await bodyText();
  assert(await evaluate("document.querySelectorAll('details').length === 0"), "Guided still contains a collapsible setup wrapper");
  assert(!text.includes("Equipment setup and additional usage details"), "Guided retained the vague setup label");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-opening-meter-\"]').length === 6"), "Guided meter fields are not present for every hire basis");
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-compact-closing-meter-\"]').length === 6"), "Guided closing meter fields are not present for every hire basis");
  assert(await evaluate("!!document.querySelector('[data-testid=\"section-eq-trip-2\"]')"), "Guided Trip Based fields disappeared beside meter fields");
  assert(await evaluate(`(() => {
    const source = document.querySelector('[data-testid="select-eq-diesel-source-2"]');
    const trip = document.querySelector('[data-testid="section-eq-trip-2"]');
    const waterSource = document.querySelector('[data-testid="select-eq-diesel-source-5"]');
    const water = document.querySelector('[data-testid="section-eq-water-5"]');
    return !!source && !!trip && !!waterSource && !!water
      && !!(source.compareDocumentPosition(trip) & Node.DOCUMENT_POSITION_FOLLOWING)
      && !!(waterSource.compareDocumentPosition(water) & Node.DOCUMENT_POSITION_FOLLOWING);
  })()`), "Guided Diesel Source is not before Trip Based / Water fields");
  assert(text.includes("Monthly Hire") && text.includes("Daily Hire") && text.includes("Trip Based"), "Guided hire-basis labels are incomplete");
  const a = await captureTarget("dpr02-A-guided-monthly-hire-desktop", '[data-testid="equipment-row-0"]');
  const b = await captureTarget("dpr02-A-guided-daily-hire-desktop", '[data-testid="equipment-row-1"]');
  const c = await captureTarget("dpr02-A-guided-trip-based-desktop", '[data-testid="equipment-row-2"]');

  await navigate("/guided?draftId=6250&section=equipment", 390, 900, true);
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-0\"]')", "Guided mobile monthly row");
  await expandCompact(0);
  const mobile = await captureTarget("dpr02-A-guided-monthly-hire-mobile", '[data-testid="equipment-row-0"]');
  return { monthlyDesktop: a, dailyDesktop: b, tripDesktop: c, monthlyMobile: mobile };
};

const verifyCalculationFields = async () => {
  await navigate("/harness", 1440, 1100, false);
  await waitFor("document.querySelectorAll('[data-testid^=\"dpr02-harness-row-\"]').length === 5", "calculation harness rows");
  for (let index = 0; index < 5; index += 1) await expandCompact(index);

  // Meter-only Monthly Hire: no clock values, and the changed delta is the
  // working-hours result shown by the shared production calculation.
  await setInput("equipment-compact-opening-meter-0", "111");
  await setInput("equipment-compact-closing-meter-0", "117");
  await waitFor("document.querySelector('[data-testid=\"equipment-compact-working-hours-0\"]')?.textContent.includes('6.000 h')", "monthly meter-only calculation");

  // Clock-only Daily and Monthly Hire: no readings, so the same calculation
  // uses clock duration for both entry types.
  await setInput("equipment-compact-start-1", "08:00");
  await setInput("equipment-compact-end-1", "11:00");
  await setInput("equipment-compact-start-4", "08:00");
  await setInput("equipment-compact-end-4", "14:00");
  await waitFor("document.querySelector('[data-testid=\"equipment-compact-working-hours-1\"]')?.textContent.includes('3.000 h')", "daily clock-only calculation");
  await waitFor("document.querySelector('[data-testid=\"equipment-compact-working-hours-4\"]')?.textContent.includes('6.000 h')", "monthly clock-only calculation");

  // Odometer meter-only Trip Based row: meter delta remains usable alongside
  // the existing trip fields.
  await setInput("equipment-compact-opening-meter-2", "1000");
  await setInput("equipment-compact-closing-meter-2", "1025");
  await waitFor("document.querySelector('[data-testid=\"equipment-compact-working-hours-2\"]')?.textContent.includes('25.00 km')", "trip odometer calculation");
  assert(await evaluate("!!document.querySelector('[data-testid=\"equipment-compact-opening-meter-1\"]') && !!document.querySelector('[data-testid=\"equipment-compact-opening-meter-4\"]')"), "Clock-only rows did not retain usable meter controls");
  const image = await captureTarget("dpr02-B-meter-and-clock-calculations", '[data-testid="dpr02-calculation-harness"]');
  const monthly = await captureTarget("dpr02-B-monthly-meter-only", '[data-testid="dpr02-harness-row-0"]');
  const daily = await captureTarget("dpr02-B-daily-clock-only", '[data-testid="dpr02-harness-row-1"]');
  const trip = await captureTarget("dpr02-B-trip-odometer-only", '[data-testid="dpr02-harness-row-2"]');
  return { image, monthly, daily, trip };
};

const verifyIdentityOrder = async () => {
  await navigate("/guided?draftId=6250&section=equipment");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-row-0\"]')", "Guided identity row");
  const guidedText = await textOf('[data-testid="equipment-row-0"]');
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-row-\"] details').length === 0"), "Guided has a hidden details wrapper");
  assert(countText(guidedText, "MONTHLY HOUR METER") === 1, `Guided identity was not presented once: ${guidedText}`);
  assert(guidedText.includes("Deployment / Usage Type") && guidedText.includes("Operator") && guidedText.includes("Diesel Source"), "Guided setup fields are not directly below identity");
  const guided = await captureTarget("dpr02-D-guided-identity-once", '[data-testid="equipment-row-0"]');

  await navigate("/site/edit/6252");
  await waitFor("!!document.querySelector('[data-testid=\"button-save-draft-progress\"], [data-testid=\"button-save\"]')", "SiteEdit form");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-row-0\"]')", "SiteEdit identity row");
  await waitFor("!!document.querySelector('[data-testid=\"select-diesel-source-2\"]') && !!document.querySelector('[data-testid=\"select-diesel-source-5\"]')", "SiteEdit source fields");
  const editText = await textOf('[data-testid="equipment-row-0"]');
  assert(await evaluate("document.querySelectorAll('[data-testid^=\"equipment-row-\"] details').length === 0"), "SiteEdit has a hidden details wrapper");
  assert(countText(editText, "MONTHLY HOUR METER") === 1, `SiteEdit identity was not presented once: ${editText}`);
  assert(countText(editText, "DPR02-MON-01") === 1, `SiteEdit registration literal was duplicated in the visible card: ${editText}`);
  assert(editText.includes("Operator") && editText.includes("Diesel Source"), "SiteEdit setup fields are not directly below identity");
  assert(await evaluate(`(() => {
    const sourceBefore = (rowIndex, markerText) => {
      const row = document.querySelector('[data-testid="equipment-row-' + rowIndex + '"]');
      const source = row?.querySelector('[data-testid="select-diesel-source-' + rowIndex + '"]');
      const marker = Array.from(row?.querySelectorAll("p") || []).find(node => node.textContent?.trim() === markerText);
      return !!source && !!marker
        && !!(source.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING);
    };
    return sourceBefore(2, "Trip Based Entry") && sourceBefore(5, "Water Delivery");
  })()`), "SiteEdit Diesel Source is not before Trip Based / Water fields");
  const edit = await captureTarget("dpr02-D-siteedit-identity-once", '[data-testid="equipment-row-0"]');
  return { guided, edit };
};

const verifyReportFacts = async () => {
  await navigate("/site/report/6301", 1440, 1200, false);
  await waitFor("document.querySelectorAll('article[data-testid^=\"equipment-compact-\"]').length === 4", "historical report equipment cards");
  const text = await bodyText();
  const fallbackLabel = "Expected Consumption Rate · from norm, actual unavailable";
  const actualLabel = "Actual Consumption Rate · from confirmed tank dip";
  assert(text.includes(fallbackLabel), "Contractor report did not show the norm fallback label");
  assert(text.includes(actualLabel), "Confirmed plant-stock report did not show the actual-rate label");
  assert(await evaluate("document.body.innerText.includes('Actual Consumed') && document.body.innerText.includes('15.00 L')"), "Confirmed actual consumed value was not rendered");
  assert(countText(text, fallbackLabel) >= 2, "Historical monthly/daily rows did not both receive the norm fallback");
  assert(text.includes("HISTORICAL TRIP"), "Historical trip snapshot row did not render");
  assert(text.includes("0.50 L/km"), "Historical trip did not pair stored total KM with its confirmed actual rate unit");
  assert(text.includes("20.00 L"), "Historical trip stored actual/expected fuel value did not render");
  const contractor = await captureTarget("dpr02-E-contractor-norm-no-dip", '[data-testid="equipment-compact-0"] > section:nth-of-type(3)');
  const actual = await captureTarget("dpr02-F-confirmed-actual-rate", '[data-testid="equipment-compact-2"] > section:nth-of-type(3)');
  const historical = await captureTarget("dpr02-G-historical-monthly-daily-fallback", '[data-testid="equipment-compact-1"] > section:nth-of-type(3)');
  const historicalTrip = await captureTarget("dpr02-G-historical-trip-stored-rate", '[data-testid="equipment-compact-3"] > section:nth-of-type(3)');

  await navigate("/site/report/6301", 390, 980, true);
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-1\"]')", "historical mobile report");
  const historicalMobile = await captureTarget("dpr02-G-historical-daily-mobile", '[data-testid="equipment-compact-1"] > section:nth-of-type(3)');
  return { contractor, actual, historical, historicalTrip, historicalMobile, fallbackLabel, actualLabel };
};

const verifySiteEntrySharedMeter = async () => {
  await navigate("/site/new", 1440, 1100, false);
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-0\"]')", "SiteEntry equipment row");
  await selectOption("select-equipment-0", "MONTHLY HOUR METER");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-0\"]')", "SiteEntry compact row");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-opening-meter-0\"]')", "SiteEntry shared opening meter");
  assert(await evaluate("!!document.querySelector('[data-testid=\"equipment-compact-closing-meter-0\"]')"), "SiteEntry shared closing meter is missing");
  const legacyOuterMeterBaseline = await evaluate(`!!document.querySelector('[data-testid="input-equipment-opening-0"]')
    && !!document.querySelector('[data-testid="input-equipment-closing-0"]')`);
  assert(legacyOuterMeterBaseline, "SiteEntry legacy outer meter baseline is absent; expected duplicate structure was not preserved");
  await selectOption("select-entry-type-0", "Monthly Hire");
  await setInput("equipment-compact-opening-meter-0", "50");
  await setInput("equipment-compact-closing-meter-0", "55");
  await waitFor("document.querySelector('[data-testid=\"equipment-compact-working-hours-0\"]')?.textContent.includes('5.000 h')", "SiteEntry monthly meter calculation");
  const desktop = await captureTarget("dpr02-H-siteentry-shared-meter-desktop", '[data-testid="equipment-compact-0"]');

  await navigate("/site/new", 390, 900, true);
  await waitFor("!!document.querySelector('[data-testid=\"select-equipment-0\"]')", "SiteEntry mobile row");
  await selectOption("select-equipment-0", "MONTHLY HOUR METER");
  await waitFor("!!document.querySelector('[data-testid=\"equipment-compact-opening-meter-0\"]')", "SiteEntry mobile shared meter");
  const mobile = await captureTarget("dpr02-H-siteentry-shared-meter-mobile", '[data-testid="equipment-compact-0"]');
  return {
    desktop,
    mobile,
    legacyOuterMeterBaseline: true,
    duplicateOuterMeterVsCompact: "Present as existing SiteEntry baseline; intentionally not treated as a DPR-02 failure.",
  };
};

await cdp("Page.enable");
await cdp("Runtime.enable");
const A = await verifyGuidedHireBases();
const B = await verifyCalculationFields();
const D = await verifyIdentityOrder();
const EFG = await verifyReportFacts();
const H = await verifySiteEntrySharedMeter();
const finalState = await fixtureState();
assert(finalState?.writes?.length === 0, `Unexpected non-GET fixture writes: ${JSON.stringify(finalState?.writes)}`);

console.log(JSON.stringify({
  scenario: "DPR-02 equipment-log reorganisation isolated browser evidence",
  fixture: {
    baseUrl,
    cdp: `127.0.0.1:${cdpPort}`,
    productionDatabaseUsed: false,
    customerWrites: false,
    fixtureData: "Representative contractor/plant-stock and pre-existing DPR-shaped rows; not customer data.",
    evidenceDirectory: evidenceDir,
  },
  screenshots: {
    A_guidedHireBases: A,
    B_meterAndClockCalculation: B,
    D_identityOrder: D,
    EFG_reportRatesAndHistory: EFG,
    H_siteEntrySharedMeter: H,
  },
  assertions: {
    A: "Guided Monthly, Daily, and Trip Based rows expose meter/odometer controls; Trip Based fields remain present.",
    B: "Meter-only Monthly/Trip and clock-only Daily/Monthly calculations update from rendered field changes.",
    D: "Guided and SiteEdit expose setup fields without a collapsible wrapper, show machine identity once, and place Diesel Source before Trip/Water fields.",
    E: "Contractor-scope report shows expected consumption from equipment norm when no tank dip exists.",
    F: "Confirmed plant-stock report shows actual consumption rate and confirmed actual consumed value.",
    G: "Historical pre-existing Monthly/Daily rows receive fallback, and a Trip row pairs stored total KM with a confirmed 0.50 L/km rate.",
    H: "SiteEntry uses the shared compact meter fields and derives working hours; existing outer-meter duplication is recorded as baseline, not failure.",
    writes: "No non-GET request was issued by this verifier; all fixture APIs are in-memory.",
  },
}, null, 2));

socket.close();