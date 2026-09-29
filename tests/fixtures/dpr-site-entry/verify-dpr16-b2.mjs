/*
 * DPR16 B2 browser contract: actual SiteEntry/SiteEdit React routes, synthetic
 * intercepted HTTP/BOQ/auth and session-only fixture persistence. Never an
 * operational database or customer DPR. Parent supplies existing Vite/CDP.
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
const exceptions = [];
socket.on("message", raw => {
  const msg = JSON.parse(raw);
  if (msg.method === "Runtime.exceptionThrown") exceptions.push(msg.params.exceptionDetails);
  if (msg.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
  const item = pending.get(msg.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(msg.id);
  msg.error ? item.reject(new Error(msg.error.message)) : item.resolve(msg.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expression) {
  const response = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
async function wait(expression) {
  for (let n = 0; n < 180; n++) {
    if (await evalJs(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const state = await evalJs(`(() => ({
    path: location.pathname + location.search,
    outcome: document.querySelector('[data-testid="select-cut-fill-outcome"]')?.textContent,
    reusableField: document.querySelector('[data-testid="input-reusable-qty"]')?.value ?? null,
    drafts: window.__DprSiteFixture?.dprDraftPayloads?.map(x => ({ id: x.id, progress: x.payload?.progress?.map(p => ({ activity: p.activity, quantity: p.quantity, materialOutcome: p.materialOutcome, reusableQty: p.reusableQty })), equipment: x.payload?.equipment?.map(e => ({ dieselBalanceInTank: e.dieselBalanceInTank, dieselBalanceConfirmed: e.dieselBalanceConfirmed })) })),
    writes: window.__DprSiteFixture?.requests?.filter(x => /\\/api\\/dprs(?:\\/|$)/.test(x.path) && x.method !== 'GET').map(x => ({ method: x.method, path: x.path, outcome: x.body?.progress?.[0]?.materialOutcome, reusableQty: x.body?.progress?.[0]?.reusableQty })),
    toasts: window.__DprSiteFixture?.toasts,
  }))()`);
  throw new Error(`Timed out: ${expression}; fixture=${JSON.stringify(state)}; text=${(await evalJs("document.body.innerText")).slice(0, 1500)}; exceptions=${JSON.stringify(exceptions)}`);
}
async function check(expression, reason) {
  if (!(await evalJs(expression))) throw new Error(reason);
}
async function navigate(path) {
  await call("Page.navigate", { url: base + path });
  await wait("document.readyState === 'complete' && !!window.__DprSiteFixture");
}
async function click(selector) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evalJs(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function input(selector, value) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
}
async function option(label) {
  await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(n => n.textContent.includes(${JSON.stringify(label)}))`);
  await evalJs(`Array.from(document.querySelectorAll('[role="option"]')).find(n => n.textContent.includes(${JSON.stringify(label)})).click()`);
}
async function button(label) {
  const selector = `Array.from(document.querySelectorAll('button')).find(n => !n.disabled && n.textContent.trim() === ${JSON.stringify(label)})`;
  await wait(`!!(${selector})`);
  await evalJs(`(${selector}).click()`);
}
async function shot(name) {
  mkdirSync("screenshots", { recursive: true });
  const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`screenshots/dpr16-b2-${name}.png`, Buffer.from(result.data, "base64"));
}
const edit = "/site/edit/6258?dpr16b2=1";
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(edit);
  await wait("!!document.querySelector('[data-testid=\"classic-edit-readiness-banner\"]')");
  await check("document.querySelector('[data-testid=\"classic-edit-readiness-banner\"]').innerText.includes('ROADWAY EXCAVATION')", "BOQ-enriched edit readiness missing");
  await click('[data-testid="classic-edit-readiness-banner"] button');
  await wait("document.querySelector('[data-testid=\"edit-activity-toggle-0\"]')?.getAttribute('aria-expanded') === 'true'");
  await wait("document.activeElement?.getAttribute('data-testid') === 'input-qty-0'");
  await check("document.activeElement?.getAttribute('data-testid') === 'input-qty-0'", "Edit Fix did not focus exact quantity field");
  await check("document.querySelector('[data-testid=\"edit-activity-geometry-0\"]')?.children.length === 8 && !document.querySelector('[data-testid=\"edit-activity-geometry-0\"] [data-testid=\"select-uom-0\"]') && !!document.querySelector('[data-testid=\"select-uom-0\"]')", "Edit geometry must contain eight fields and retain outside UOM");
  await shot("edit-fix-desktop");
  await click('[data-testid="select-cut-fill-outcome"]');
  await option("Partly reusable");
  await input('[data-testid="input-reusable-qty"]', "120");
  await wait("!!document.querySelector('[data-testid=\"text-reusable-qty-error\"]')");
  await check("document.querySelector('[data-testid=\"classic-edit-readiness-banner\"]')?.innerText.includes('between 0 and 100')", "Actual invalid reusable quantity missing edit readiness");
  await input('[data-testid="input-reusable-qty"]', "40");
  await wait("!document.querySelector('[data-testid=\"text-reusable-qty-error\"]')");
  await check("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40' && document.querySelector('[data-testid=\"select-cut-fill-outcome\"]')?.textContent.includes('Partly reusable')", "Edit reusable qty control lost value before save");
  await click('[data-testid="select-personnel-0"]');
  await option("SURESH KUMAR");
  await evalJs(`Array.from(document.querySelectorAll('button[aria-label]')).find(b => b.getAttribute('aria-label')?.startsWith('Expand SYNTHETIC B2 EXCAVATOR'))?.click()`);
  await wait("!!document.querySelector('[data-testid=\"equipment-compact-closing-tank-0\"]')");
  await check("document.querySelector('[data-testid=\"equipment-compact-closing-tank-0\"]')?.value === '25' && !!document.querySelector('[data-testid=\"equipment-compact-tank-confirmed-0\"]')", "Classic edit must retain the original tank controls before confirmation");
  await input('[data-testid="equipment-compact-closing-tank-0"]', "24");
  await click('[data-testid="equipment-compact-tank-confirmed-0"]');
  await check("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40'", "Equipment edit reset activity reusable qty");
  await click('[data-testid="button-save-draft-progress"]');
  await wait("window.__DprSiteFixture.dprDraftPayloads.some(x => x.id === 6258)");
  const savedProgress = await evalJs("window.__DprSiteFixture.dprDraftPayloads.find(x => x.id === 6258)?.payload.progress?.[0]");
  if (savedProgress?.reusableQty !== 40) throw new Error(`Edit draft reached fixture but saved progress differs: ${JSON.stringify({ quantity: savedProgress?.quantity, materialOutcome: savedProgress?.materialOutcome, reusableQty: savedProgress?.reusableQty })}`);
  await check("window.__DprSiteFixture.dprDraftPayloads.some(x => x.id === 6258 && x.payload.progress?.[0]?.personnelIds?.includes(6101) && x.payload.equipment?.[0]?.dieselBalanceInTank === 24 && x.payload.equipment?.[0]?.dieselBalanceConfirmed === true)", "Edit save dropped personnel or tank");
  await navigate(edit);
  await wait("!!document.querySelector('[data-testid=\"edit-activity-toggle-0\"]')");
  await click('[data-testid="edit-activity-toggle-0"]');
  await wait("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40'");
  await evalJs(`Array.from(document.querySelectorAll('button[aria-label]')).find(b => b.getAttribute('aria-label')?.startsWith('Expand SYNTHETIC B2 EXCAVATOR'))?.click()`);
  await check("document.querySelector('[data-testid=\"equipment-compact-closing-tank-0\"]')?.value === '24' && document.querySelector('[data-testid=\"activity-resources-block-0\"]')?.innerText.includes('SURESH KUMAR')", "Edit reload lost tank or personnel");
  await shot("edit-reloaded-desktop");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(edit);
  await wait("!!document.querySelector('[data-testid=\"edit-activity-toggle-0\"]')");
  await click('[data-testid="edit-activity-toggle-0"]');
  await check("document.documentElement.scrollWidth <= window.innerWidth + 1", "Edit mobile viewport overflows horizontally");
  await shot("edit-mobile");

  // A separate classic create route is intentionally not the section-menu
  // alias (/site/new); save goes through SiteEntry's existing POST handler.
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate("/fixture/dpr16-b2-create?dpr16b2=1");
  await wait("!!document.querySelector('[data-testid=\"input-site\"]')");
  await click('[data-testid="input-site"]');
  await option("NARASIMHULU ROAD");
  await click('[data-testid="select-engineer"]');
  await option("SURESH KUMAR");
  await click('[data-testid="section-activity-toggle-0"]');
  await wait("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')");
  await click('[data-testid="progress-0-item-select"]');
  await click('[data-testid="option-boq-item-8816"]');
  await input('[data-testid="input-progress-from-0"]', "0+000");
  await input('[data-testid="input-progress-to-0"]', "0+100");
  await input('[data-testid="input-progress-width-0"]', "1");
  await input('[data-testid="input-progress-thickness-0"]', "1");
  await wait("!!document.querySelector('[data-testid=\"classic-readiness-banner\"]')");
  await check("document.querySelector('[data-testid=\"classic-readiness-banner\"]')?.innerText.includes('ROADWAY EXCAVATION')", "Classic create BOQ readiness not live");
  await evalJs(`Array.from(document.querySelectorAll('[data-testid="classic-readiness-banner"] button')).find(b => /outcome|reusab/i.test(b.parentElement?.textContent || ''))?.click()`);
  await wait("document.activeElement?.getAttribute('data-testid') === 'select-cut-fill-outcome'");
  await click('[data-testid="select-cut-fill-outcome"]');
  await option("Partly reusable");
  await input('[data-testid="input-reusable-qty"]', "120");
  await wait("!!document.querySelector('[data-testid=\"text-reusable-qty-error\"]')");
  await check("document.querySelector('[data-testid=\"classic-readiness-banner\"]')?.innerText.includes('between 0 and 100')", "Classic create invalid reusable quantity missing");
  await click('[data-testid="select-personnel-0"]');
  await option("SURESH KUMAR");
  await check(`(() => {
    const grid = document.querySelector('[data-testid="section-geometry-0"]');
    const ids = Array.from(grid?.children ?? [], child => child.querySelector('[data-testid]')?.getAttribute('data-testid'));
    return grid?.classList.contains('xl:grid-cols-8')
      && JSON.stringify(ids) === JSON.stringify([
        'select-progress-side-0', 'input-progress-from-0', 'input-progress-to-0',
        'input-progress-length-0', 'input-progress-width-0', 'input-progress-thickness-0',
        'input-progress-qty-0',
      ])
      && !grid.querySelector('[data-testid="input-progress-layer-no-0"]')
      && !!grid.nextElementSibling?.querySelector('[data-testid="select-progress-uom-0"]');
  })()`, "Create excavation geometry must use the eight-column desktop grid, omit non-applicable layer, and retain UOM as a separate sibling");
  await shot("create-readiness-desktop");
  await click('[data-testid="button-preview"]');
  await wait("!document.querySelector('[data-testid=\"button-preview\"]')");
  await shot("create-preview");
  await check("!!document.querySelector('[data-testid=\"classic-readiness-banner\"]')", "Preview must show live readiness before Submit");
  await evalJs(`document.querySelector('[data-testid="classic-readiness-banner"] button')?.click()`);
  await wait("document.activeElement?.getAttribute('data-testid') === 'input-reusable-qty'");
  await check("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '120'", "Preview banner Fix lost unsaved quantity");
  await click('[data-testid="button-preview"]');
  await click('[data-testid="button-submit-final"]');
  await wait("!!document.querySelector('[data-testid=\"dialog-dpr-readiness\"]')");
  await click('[data-testid="button-readiness-issue-activities-0"]');
  await wait("!!document.querySelector('[data-testid=\"button-preview\"]')");
  await wait("document.activeElement?.getAttribute('data-testid') === 'input-reusable-qty'");
  await check("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '120' && document.activeElement?.getAttribute('data-testid') === 'input-reusable-qty'", "Preview Fix failed to return to exact invalid field with form intact");
  await shot("create-preview-fix-return");
  await input('[data-testid="input-reusable-qty"]', "40");
  await wait("!document.querySelector('[data-testid=\"text-reusable-qty-error\"]')");
  await click('[data-testid="button-preview"]');
  await wait("!!document.querySelector('[data-testid=\"button-back-edit\"]')");
  await click('[data-testid="button-back-edit"]');
  await wait("!!document.querySelector('[data-testid=\"button-preview\"]')");
  await check("document.querySelector('[data-testid=\"input-site\"]')?.textContent.includes('NARASIMHULU ROAD') && document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40'", "Preview return lost create form");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await check("document.documentElement.scrollWidth <= window.innerWidth + 1", "Create mobile viewport overflows horizontally");
  await shot("create-mobile");
  // A complete report only offers Preview. Begin a second, genuinely unfinished
  // activity so the existing Save Start / Draft path becomes available without
  // discarding or invalidating the completed excavation row we just reviewed.
  await click('[data-testid="button-add-progress-bottom"]');
  await click('[data-testid="section-activity-toggle-1"]');
  await wait("!!document.querySelector('[data-testid=\"progress-1-item-select\"]')");
  await click('[data-testid="progress-1-item-select"]');
  await click('[data-testid="option-boq-item-8816"]');
  await input('[data-testid="input-progress-from-1"]', "0+101");
  await input('[data-testid="input-progress-to-1"]', "");
  await wait("!!document.querySelector('[data-testid=\"button-save-draft\"]')");
  await check("document.querySelector('[data-testid=\"input-progress-from-1\"]')?.value === '0+101' && document.querySelector('[data-testid=\"input-progress-to-1\"]')?.value === '' && document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40'", "Incomplete second activity must preserve the completed excavation before draft save");
  await click('[data-testid="button-save-draft"]');
  await wait("window.__DprSiteFixture.dprDraftPayloads.some(x => x.payload?.site === 'NARASIMHULU ROAD' && x.payload?.dprStatus === 'draft')");
  await check("window.__DprSiteFixture.dprDraftPayloads.some(x => x.payload?.progress?.[0]?.reusableQty === 40 && x.payload?.progress?.[0]?.personnelIds?.includes(6101))", "Create save lost outcome or personnel");
  await check("window.__DprSiteFixture.dprDraftPayloads.some(x => x.payload?.progress?.[1]?.boqItemId === 8816 && x.payload.progress[1].chainageFrom === '0+101' && !x.payload.progress[1].chainageTo)", "Create draft did not retain the unfinished second activity");
  await check("window.__DprSiteFixture.requests.some(x => x.method === 'POST' && x.path === '/api/dprs')", "Classic create draft did not reach fixture storage endpoint");
  const createdId = await evalJs("window.__DprSiteFixture.dprDraftPayloads.find(x => x.payload?.progress?.[0]?.reusableQty === 40)?.id");
  await navigate(`/site/edit/${createdId}?dpr16b2=1`);
  await wait("!!document.querySelector('[data-testid=\"edit-activity-toggle-0\"]')");
  await click('[data-testid="edit-activity-toggle-0"]');
  await check("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40' && document.querySelector('[data-testid=\"activity-resources-block-0\"]')?.innerText.includes('SURESH KUMAR')", "Fresh edit of classic-created draft did not hydrate outcome/personnel");
  await shot("created-draft-reloaded");
  console.log("PASS DPR16 B2 synthetic classic SiteEdit persistence/reload/readiness and SiteEntry preview/create readiness (intercepted API, no operational DB).");
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
}