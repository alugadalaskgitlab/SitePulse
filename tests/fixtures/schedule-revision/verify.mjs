/*
 * WP-01 isolated browser evidence.
 *
 * Start the fixture Vite server on port 4179 and Chromium's CDP endpoint on
 * port 9222 before running this script. It drives the exported production
 * ScheduleRevisionActions component; it does not reimplement the component.
 * Every schedule API request is answered by main.tsx's in-memory adapter.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureDir = path.resolve(new URL(".", import.meta.url).pathname);
const evidenceDir = path.join(fixtureDir, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const baseUrl = "http://127.0.0.1:4179";

const page = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
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
  if (message.method === "Runtime.exceptionThrown") {
    console.error(`Browser exception: ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};

const quote = (value) => JSON.stringify(String(value));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const waitFor = async (expression, label, attempts = 200) => {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const clickScenario = async (scenario) => {
  const clicked = await evaluate(`(() => {
    const card = document.querySelector('[data-scenario=${quote(scenario)}]');
    const button = card && Array.from(card.querySelectorAll('button')).find((node) => node.textContent?.includes('Revise'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not open scenario ${scenario}`);
};

const clickDialogButton = async (scenario, label) => {
  const clicked = await evaluate(`(() => {
    const dialog = document.querySelector('[data-testid="dialog-revise-schedule-${scenario === "a" ? 101 : scenario === "b" ? 102 : scenario === "c" ? 103 : scenario === "d" ? 104 : 105}"]');
    const button = dialog && Array.from(dialog.querySelectorAll('button')).find((node) => node.textContent?.trim() === ${quote(label)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert(clicked, `Could not click ${label} in scenario ${scenario}`);
};

const setInput = async (testId, value) => {
  const changed = await evaluate(`(() => {
    const node = document.querySelector('[data-testid=${quote(testId)}]');
    if (!node) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(node, ${quote(value)});
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert(changed, `Could not set ${testId}`);
};

const inputValue = (testId) => evaluate(`document.querySelector('[data-testid=${quote(testId)}]')?.value || ""`);
const capture = async (name) => {
  const screenshot = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(evidenceDir, `${name}.png`);
  writeFileSync(target, Buffer.from(screenshot.data, "base64"));
  return target;
};

await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Page.navigate", { url: baseUrl });
await waitFor("document.readyState === 'complete'", "fixture document");
await waitFor("document.querySelectorAll('[data-scenario]').length === 5", "five fixture scenarios");

// A — Jan 1 → Jan 3 becomes Jan 10 → Jan 12 from the start edit alone.
await clickScenario("a");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-101\"]')", "A dialog");
await setInput("input-revision-start-101", "2026-01-10");
await waitFor("document.querySelector('[data-testid=\"input-revision-finish-101\"]')?.value === '2026-01-12'", "A suggested finish");
assert(await inputValue("input-revision-start-101") === "2026-01-10", "A start date changed unexpectedly");
const screenshotA = await capture("wp01-A-start-jan10-suggests-finish-jan12");
await clickDialogButton("a", "Cancel");
await waitFor("!document.querySelector('[data-testid=\"dialog-revise-schedule-101\"]')", "A dialog close");

// B — The suggested Jan 12 finish remains a normal editable field.
await clickScenario("b");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-102\"]')", "B dialog");
await setInput("input-revision-start-102", "2026-01-10");
await waitFor("document.querySelector('[data-testid=\"input-revision-finish-102\"]')?.value === '2026-01-12'", "B initial suggestion");
await setInput("input-revision-finish-102", "2026-01-15");
assert(await inputValue("input-revision-finish-102") === "2026-01-15", "B finish override snapped back");
const screenshotB = await capture("wp01-B-finish-override-jan15");
await clickDialogButton("b", "Cancel");
await waitFor("!document.querySelector('[data-testid=\"dialog-revise-schedule-102\"]')", "B dialog close");

// C — Editing finish directly does not revise start.
await clickScenario("c");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-103\"]')", "C dialog");
await setInput("input-revision-finish-103", "2026-01-08");
assert(await inputValue("input-revision-start-103") === "2026-01-01", "C direct finish edit changed start");
assert(await inputValue("input-revision-finish-103") === "2026-01-08", "C finish edit was not accepted");
const screenshotC = await capture("wp01-C-direct-finish-keeps-start");
await clickDialogButton("c", "Cancel");
await waitFor("!document.querySelector('[data-testid=\"dialog-revise-schedule-103\"]')", "C dialog close");

// D — Preview and commit both use the overridden field values and cascade=true.
await clickScenario("d");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-104\"]')", "D dialog");
await setInput("input-revision-start-104", "2026-01-10");
await waitFor("document.querySelector('[data-testid=\"input-revision-finish-104\"]')?.value === '2026-01-12'", "D initial suggestion");
await setInput("input-revision-finish-104", "2026-01-15");
await setInput("input-revision-reason-104", "Access handover delayed");
assert(await evaluate("document.querySelector('[data-testid=\"checkbox-revision-cascade-104\"]')?.checked === true"), "D cascade was not enabled");
await clickDialogButton("d", "Preview revision");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-104\"]') && document.body.innerText.includes('Confirm & commit')", "D preview");
const screenshotD = await capture("wp01-D-preview-override-cascade");
const dPreview = await evaluate("window.__ScheduleRevisionFixture.previewPayloads.at(-1)");
assert(dPreview?.payload?.startDate === "2026-01-10", "D preview did not use override start");
assert(dPreview?.payload?.endDate === "2026-01-15", "D preview did not use override finish");
assert(dPreview?.payload?.cascade === true, "D preview did not retain cascade=true");
assert(dPreview?.payload?.reason === "Access handover delayed", "D preview reason was not retained");
const dPreviewToken = await evaluate("window.__ScheduleRevisionFixture.previewTokens.at(-1)");
await clickDialogButton("d", "Confirm & commit");
await waitFor("!document.querySelector('[data-testid=\"dialog-revise-schedule-104\"]')", "D commit close");
const dState = await evaluate("window.__ScheduleRevisionFixture");
const dCommit = dState.commitPayloads.at(-1);
assert(dCommit?.payload?.startDate === "2026-01-10", "D commit did not use override start");
assert(dCommit?.payload?.endDate === "2026-01-15", "D commit did not use override finish");
assert(dCommit?.payload?.cascade === true, "D commit did not retain cascade=true");
assert(dCommit?.payload?.previewToken === dPreviewToken, "D commit token did not match preview token");

// E — Started bars keep actual start locked and omit startDate from both writes.
await clickScenario("e");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-105\"]')", "E dialog");
assert(await evaluate("document.querySelector('[data-testid=\"input-revision-start-105\"]')?.disabled === true"), "E start input was not locked");
assert(await inputValue("input-revision-start-105") === "2026-01-05", "E did not show actual start");
await setInput("input-revision-finish-105", "2026-01-12");
assert(await inputValue("input-revision-start-105") === "2026-01-05", "E finish edit changed locked start");
await setInput("input-revision-reason-105", "Started activity finish adjustment");
const screenshotE = await capture("wp01-E-started-actual-start-locked");
await clickDialogButton("e", "Preview revision");
await waitFor("!!document.querySelector('[data-testid=\"dialog-revise-schedule-105\"]') && document.body.innerText.includes('Confirm & commit')", "E preview");
const ePreview = await evaluate("window.__ScheduleRevisionFixture.previewPayloads.at(-1)");
assert(!Object.prototype.hasOwnProperty.call(ePreview.payload, "startDate"), "E preview unexpectedly included startDate");
assert(ePreview?.payload?.endDate === "2026-01-12", "E preview did not use edited finish");
await clickDialogButton("e", "Confirm & commit");
await waitFor("!document.querySelector('[data-testid=\"dialog-revise-schedule-105\"]')", "E commit close");
const eState = await evaluate("window.__ScheduleRevisionFixture");
const eCommit = eState.commitPayloads.at(-1);
assert(!Object.prototype.hasOwnProperty.call(eCommit.payload, "startDate"), "E commit unexpectedly included startDate");
assert(eCommit?.payload?.endDate === "2026-01-12", "E commit did not use edited finish");

const result = {
  scenario: "WP-01 ScheduleRevisionActions isolated browser evidence",
  baseUrl,
  evidenceDirectory: evidenceDir,
  screenshots: { A: screenshotA, B: screenshotB, C: screenshotC, D: screenshotD, E: screenshotE },
  assertions: {
    A: "Jan 10 start auto-suggested Jan 12 finish from original 3-day duration",
    B: "Jan 15 finish override remained accepted",
    C: "Direct finish edit preserved Jan 1 start",
    D: "Preview and commit used Jan 10/Jan 15, cascade=true, matching preview token",
    E: "Started actual start Jan 5 stayed locked; preview and commit omitted startDate",
  },
  previewPayloads: await evaluate("window.__ScheduleRevisionFixture.previewPayloads"),
  commitPayloads: await evaluate("window.__ScheduleRevisionFixture.commitPayloads"),
};
console.log(JSON.stringify(result, null, 2));
socket.close();