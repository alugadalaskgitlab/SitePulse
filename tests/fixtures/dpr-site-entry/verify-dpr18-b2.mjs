/*
 * Actual SiteEntry, SiteEdit, GuidedDpr browser controls; intercepted fixture
 * HTTP and sessionStorage only. NO operational/customer database assertion.
 * Parent supplies an already-running fixture Vite :4178 and Chromium CDP :9222.
 * From repo root: node tests/fixtures/dpr-site-entry/verify-dpr18-b2.mjs
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdp = process.env.CDP_URL || "http://127.0.0.1:9222";
const target = await (await fetch(`${cdp}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let serial = 0;
const pending = new Map();
const errors = [];
socket.on("message", raw => {
  const msg = JSON.parse(raw);
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails);
  if (msg.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
  const item = pending.get(msg.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(msg.id);
  msg.error ? item.reject(new Error(`${item.method}: ${msg.error.message}`)) : item.resolve(msg.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(id, { method, resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function wait(expression) {
  for (let i = 0; i < 450; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const state = await evaluate(`({ path: location.pathname + location.search, text: document.body.innerText.slice(-2400),
    equipmentRows: Array.from(document.querySelectorAll('[data-testid^="equipment-row-"]')).map(n => ({ id: n.getAttribute('data-testid'), identity: n.getAttribute('data-dpr-equipment-identity'), text: n.innerText.slice(0,150) })),
    selectors: Array.from(document.querySelectorAll('[data-testid^="select-equipment-"]')).map(n => n.outerHTML.slice(0,250)),
    writes: window.__DprSiteFixture?.requests?.filter(r => r.method !== 'GET' && r.path.startsWith('/api/dprs')).slice(-4),
    toasts: window.__DprSiteFixture?.toasts })`);
  throw new Error(`Timeout ${expression}: ${JSON.stringify(state)}; browser errors: ${JSON.stringify(errors)}`);
}
async function assert(expression, message) {
  if (!(await evaluate(expression))) throw new Error(`${message}: ${JSON.stringify(await evaluate(`({path:location.pathname, text:document.body.innerText.slice(-1200)})`))}`);
}
async function navigate(path) {
  await call("Page.navigate", { url: base + path });
  await wait("document.readyState === 'complete' && !!window.__DprSiteFixture");
}
async function click(selector) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function fill(selector, value) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)});
    const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
async function option(label) {
  await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(o => o.textContent.includes(${JSON.stringify(label)}))`);
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(o => o.textContent.includes(${JSON.stringify(label)})).click()`);
}
async function select(selector, label) { await click(selector); await option(label); }
async function expand(index = 0) {
  await wait(`!!document.querySelector('[data-testid="equipment-compact-${index}"] button[aria-expanded]')`);
  if (await evaluate(`document.querySelector('[data-testid="equipment-compact-${index}"] button[aria-expanded]')?.getAttribute('aria-expanded') === 'false'`)) {
    await click(`[data-testid="equipment-compact-${index}"] button[aria-label^="Expand"]`);
  }
}
async function shot(name) {
  mkdirSync("tests/fixtures/dpr-site-entry/evidence", { recursive: true });
  const image = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`tests/fixtures/dpr-site-entry/evidence/dpr18-b2-${name}.png`, Buffer.from(image.data, "base64"));
}
async function seed(id) {
  await evaluate(`window.__DprSiteFixture.seedDpr18(${id})`);
}
const editPath = id => `/site/edit/${id}?dpr16b2=1`;
const guidedPath = id => `/guided?draftId=${id}&section=equipment&dpr16b2=1`;
const lastEquipmentWrite = `window.__DprSiteFixture.requests.filter(r => r.method !== 'GET' && /^\\/api\\/dprs(?:\\/|$)/.test(r.path)).at(-1)?.body?.equipment?.[0]`;
const savedEquipment = id => `JSON.parse(sessionStorage.getItem('__dprSiteFixturePersistedDprs')).records[${id}].equipment[0]`;
async function groups() {
  await assert(`(() => { const root = document.querySelector('[data-testid="equipment-compact-0"]');
    const names = ['picker','owner','readings','diesel','stoppage','work'];
    const nodes = names.map(name => root?.querySelector('[data-testid="equipment-compact-group-' + name + '-0"]'));
    return nodes.every(Boolean) && nodes.every((n, i) => i === 0 || nodes[i-1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  })()`, "Compact editor's six groups missing or out of order");
}
async function status(label) {
  await select('[data-testid="equipment-compact-usage-status-0"]', label);
}
async function saveAndReload(id, path, button, expected) {
  await click(button);
  await wait(`${savedEquipment(id)}?.usageStatus === ${JSON.stringify(expected)}`);
  await assert(`${lastEquipmentWrite}?.usageStatus === ${JSON.stringify(expected)}`, `Status ${expected} not transmitted to synthetic fixture API`);
  await navigate(path);
}

try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  // Isolate this run from autosave artifacts left by an earlier CDP attempt.
  await navigate(editPath(6278));
  await evaluate("sessionStorage.clear(); localStorage.clear()");

  // Existing unlinked and linked legacy rows must remain null: simply opening
  // and saving a historical row must not impose the new Working default.
  for (const [id, route] of [[6279, editPath(6279)], [6280, editPath(6280)], [6279, guidedPath(6279)], [6280, guidedPath(6280)]]) {
    await navigate(route);
    await seed(id);
    await navigate(route);
    await wait(route.startsWith("/guided")
      ? "!!document.querySelector('[data-testid=\"card-equipment-step\"]')"
      : "document.body.innerText.includes('NO SITE WORK')");
    await wait("!!document.querySelector('[data-testid=\"equipment-compact-0\"]')");
    await assert("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Not specified')", `Historical ${id} was displayed as Working`);
    await expand();
    await groups();
    if (route.startsWith("/guided")) {
      await click('[data-testid="button-save-draft"]');
    } else {
      await click('[data-testid="button-save-draft-progress"]');
    }
    await wait(`${lastEquipmentWrite}?.usageStatus === null`);
    await assert(`${savedEquipment(id)}?.usageStatus === null && ${savedEquipment(id)}?.plantUsageId === ${id === 6280 ? 8101 : "null"}`, `Legacy or linked null changed for ${id}`);
    await navigate(route);
    await wait("!!document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')");
    await assert("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Not specified')", `Reopened historical ${id} lost null`);
  }
  await shot("historical-null");

  // Actual classic SiteEdit: add a fresh row, identify a master machine,
  // inspect its original controls inside their moved groups, save and reopen.
  await navigate(editPath(6278));
  await evaluate("sessionStorage.removeItem('dpr_draft_6278')");
  await seed(6278);
  await navigate(editPath(6278));
  await wait("!!document.querySelector('[data-testid=\"button-add-equipment\"]')");
  if (await evaluate("!!document.querySelector('[data-testid=\"banner-draft-restored\"]')")) {
    await click('[data-testid="banner-draft-restored"] button');
  }
  await wait("document.body.innerText.includes('NO SITE WORK')");
  // This must identify the actual empty-draft placeholder directly, NOT an
  // Add Row workaround: regression for missing creation identity on hydration.
  await assert("!!document.querySelector('[data-testid=\"select-equipment-0\"]') && !document.querySelector('[data-testid=\"equipment-row-1\"]')", "SiteEdit empty draft must present one directly identifiable placeholder");
  await select('[data-testid="select-equipment-0"]', "DAILY HIRE ROLLER");
  await wait("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')");
  await expand();
  await groups();
  await assert("!!document.querySelector('[data-testid=\"equipment-compact-group-picker-0\"] [data-testid=\"select-equipment-0\"]') && !!document.querySelector('[data-testid=\"equipment-compact-group-owner-0\"] [data-testid=\"input-operator-0\"]') && !!document.querySelector('[data-testid=\"equipment-compact-group-stoppage-0\"] [data-testid=\"edit-equipment-breakdown-0-editor\"]')", "Actual SiteEdit picker/operator/stoppage controls were not retained in their groups");
  await assert("document.querySelectorAll('[data-testid=\"select-entry-type-0\"]').length === 1 && !!document.querySelector('[data-testid=\"equipment-compact-group-owner-0\"] [data-testid=\"select-entry-type-0\"]')", "Classic hire override must occur exactly once in owner group");
  await select('[data-testid="select-entry-type-0"]', "Hourly Hire");
  await fill('[data-testid="input-operator-0"]', "SYNTHETIC OPERATOR");
  await shot("siteedit-new-working");
  await saveAndReload(6278, editPath(6278), '[data-testid="button-save-draft-progress"]', "working");
  await wait("!!document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')");
  await assert("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')", "SiteEdit Working did not survive reload");
  await expand();
  await status("Idle — Operator Unavailable");
  await assert("!document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')", "Operator-unavailable idle must not demand a reason");
  await saveAndReload(6278, editPath(6278), '[data-testid="button-save-draft-progress"]', "idle_no_operator");
  await expand();
  await status("Idle — No Work Available");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "   ");
  await assert("!document.querySelector('[data-testid=\"button-submit-dpr\"]')", "Whitespace-only no-work reason must block classic submit");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "SYNTHETIC WEATHER HOLD");
  await shot("siteedit-no-work-reason");
  await saveAndReload(6278, editPath(6278), '[data-testid="button-save-draft-progress"]', "idle_no_work");
  await assert(`${savedEquipment(6278)}.usageStatusReason === 'SYNTHETIC WEATHER HOLD'`, "Classic no-work reason lost on reload");
  await expand();
  await status("Breakdown");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "");
  await assert("!document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')", "Breakdown status should not demand a separate reason");
  await click('[data-testid="edit-equipment-breakdown-0-add"]');
  await fill('[data-testid="edit-equipment-breakdown-0-from-0"]', "10:00");
  await fill('[data-testid="edit-equipment-breakdown-0-to-0"]', "10:30");
  await fill('[data-testid="edit-equipment-breakdown-0-reason-0"]', "SYNTHETIC STOPPAGE");
  await saveAndReload(6278, editPath(6278), '[data-testid="button-save-draft-progress"]', "breakdown");
  await assert(`${savedEquipment(6278)}.breakdowns?.[0]?.description === 'SYNTHETIC STOPPAGE'`, "Actual stoppage editor failed to round-trip");
  await shot("siteedit-stoppage-reloaded");
  await expand();
  await fill('[data-testid="equipment-compact-end-0"]', "23:59");
  await click('[data-testid="button-submit-dpr"]');
  await wait("window.__DprSiteFixture.dprSubmitPayloads.some(x => x.id === 6278)");

  // Guided's real add/select control must default only the new row; status
  // change and draft PATCH must persist and survive a real page navigation.
  await navigate(guidedPath(6281));
  await seed(6281);
  await navigate(guidedPath(6281));
  await wait("!!document.querySelector('[data-testid=\"card-equipment-step\"]')");
  await click('[data-testid="button-add-equipment"]');
  await select('[data-testid="select-eq-machine-0"]', "DAILY HIRE ROLLER");
  await wait("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')");
  await expand();
  await groups();
  await assert("document.querySelectorAll('[data-testid=\"select-eq-entry-type-0\"]').length === 1 && !!document.querySelector('[data-testid=\"equipment-compact-group-owner-0\"] [data-testid=\"select-eq-entry-type-0\"]')", "Guided hire override must occur exactly once in owner group");
  await select('[data-testid="select-eq-entry-type-0"]', "Hourly Hire");
  await shot("guided-new-working");
  await saveAndReload(6281, guidedPath(6281), '[data-testid="button-save-draft"]', "working");
  await wait("!!document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')");
  await assert("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')", "Guided Working did not survive reload");
  await expand();
  await status("Idle — Operator Unavailable");
  await assert("!document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')", "Guided operator-unavailable idle unexpectedly requires reason");
  await saveAndReload(6281, guidedPath(6281), '[data-testid="button-save-draft"]', "idle_no_operator");
  await expand();
  await status("Idle — No Work Available");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "   ");
  await click('[data-testid="button-save-draft"]');
  await wait(`${savedEquipment(6281)}?.usageStatus === 'idle_no_work'`);
  await navigate(`/guided?draftId=6281&section=review&dpr16b2=1`);
  await click('[data-testid="button-submit"]');
  await assert("!window.__DprSiteFixture.dprSubmitPayloads.some(x => x.id === 6281)", "Guided must reject whitespace-only no-work reason");
  await navigate(guidedPath(6281));
  await expand();
  await status("Idle — No Work Available");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "SYNTHETIC GUIDED HOLD");
  await saveAndReload(6281, guidedPath(6281), '[data-testid="button-save-draft"]', "idle_no_work");
  await expand();
  await status("Breakdown");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "");
  await wait("!document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')");
  await assert("!!document.querySelector('[data-testid=\"guided-equipment-breakdown-0-editor\"]')", "Guided original stoppage editor not in actual machine card");
  await saveAndReload(6281, guidedPath(6281), '[data-testid="button-save-draft"]', "breakdown");
  await expand();
  await fill('[data-testid="equipment-compact-end-0"]', "23:59");
  await click('[data-testid="button-save-draft"]');
  await wait(`${lastEquipmentWrite}?.usageStatus === 'breakdown'`);
  await navigate(`/guided?draftId=6281&section=review&dpr16b2=1`);
  await click('[data-testid="button-submit"]');
  await wait("window.__DprSiteFixture.dprSubmitPayloads.some(x => x.id === 6281)");

  // Classic SiteEntry is a separate actual create route, not /site/new's menu.
  await navigate("/fixture/dpr16-b2-create?dpr16b2=1");
  await select('[data-testid="input-site"]', "NARASIMHULU ROAD");
  await select('[data-testid="select-engineer"]', "SURESH KUMAR");
  await select('[data-testid="select-equipment-0"]', "DAILY HIRE ROLLER");
  await wait("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')");
  await expand();
  await groups();
  await assert("document.querySelectorAll('[data-testid=\"select-entry-type-0\"]').length === 1 && !!document.querySelector('[data-testid=\"equipment-compact-group-owner-0\"] [data-testid=\"select-entry-type-0\"]')", "SiteEntry hire override must occur exactly once in owner group");
  await select('[data-testid="select-entry-type-0"]', "Hourly Hire");
  await shot("siteentry-new-working");
  await status("Idle — Operator Unavailable");
  await assert("!document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')", "SiteEntry operator-unavailable idle unexpectedly requires reason");
  await status("Idle — No Work Available");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "   ");
  await wait("document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')?.getAttribute('aria-invalid') === 'true'");
  await assert("!document.querySelector('[data-testid=\"button-preview\"]')", "SiteEntry whitespace-only no-work reason must block final preview");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "SYNTHETIC NO WORK");
  await status("Breakdown");
  await fill('[data-testid="equipment-compact-usage-reason-0"]', "");
  await wait("!document.querySelector('[data-testid=\"equipment-compact-usage-reason-0\"]')");
  await assert("!!document.querySelector('[data-testid=\"equipment-breakdown-0-editor\"]')", "SiteEntry original stoppage editor not in actual machine card");
  await status("Working");
  // A deliberately unfinished opening is how actual SiteEntry exposes Save
  // Start / Draft; completing its closing makes Preview and final Submit.
  await fill('[data-testid="equipment-compact-opening-meter-0"]', "100");
  await click('[data-testid="button-save-draft"]');
  await wait("window.__DprSiteFixture.dprDraftPayloads.some(x => x.payload?.equipment?.[0]?.usageStatus === 'working')");
  const createdId = await evaluate("window.__DprSiteFixture.dprDraftPayloads.find(x => x.payload?.equipment?.[0]?.usageStatus === 'working')?.id");
  await navigate(editPath(createdId));
  await wait("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')");
  await expand();
  await fill('[data-testid="equipment-compact-closing-meter-0"]', "106");
  await fill('[data-testid="equipment-compact-end-0"]', "23:59");
  await click('[data-testid="button-submit-dpr"]');
  await wait(`window.__DprSiteFixture.dprSubmitPayloads.some(x => x.id === ${createdId})`);
  await navigate("/fixture/dpr16-b2-create?dpr16b2=1&dpr18Final=1");
  await select('[data-testid="input-site"]', "NARASIMHULU ROAD");
  await select('[data-testid="select-engineer"]', "SURESH KUMAR");
  await select('[data-testid="select-equipment-0"]', "DAILY HIRE ROLLER");
  await wait("document.querySelector('[data-testid=\"equipment-compact-status-chip-0\"]')?.textContent.includes('Working')");
  await expand();
  await select('[data-testid="select-entry-type-0"]', "Hourly Hire");
  await fill('[data-testid="equipment-compact-end-0"]', "16:00");
  await click('[data-testid="button-preview"]');
  await click('[data-testid="button-submit-final"]');
  await wait("window.__DprSiteFixture.dprCreatePayloads.some(x => x.equipment?.[0]?.usageStatus === 'working')");
  await shot("siteentry-final");
  if (errors.length) throw new Error(`Browser exceptions: ${JSON.stringify(errors)}`);
  console.log("PASS DPR18 B2 actual SiteEntry/SiteEdit/GuidedDpr controls; synthetic intercepted API/sessionStorage only (NOT customer DB E2E).");
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
}