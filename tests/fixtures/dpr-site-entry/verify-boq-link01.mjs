/*
 * BOQ-LINK-01 fixture evidence, real Guided/SiteEdit screens. All requests
 * are synthetic adapter/session storage operations, never database writes.
 * Requires isolated fixture :4178 and temporary Chromium CDP :9222.
 */
import WebSocket from "ws";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";

const out = ".agents/outputs/boq-link-01/screenshots";
mkdirSync(out, { recursive: true });
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
let serial = 0, stage = "start";
const pending = new Map(), exceptions = [], results = [];
socket.on("message", raw => {
  const m = JSON.parse(raw);
  if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails);
  if (m.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
  const p = pending.get(m.id);
  if (!p) return;
  clearTimeout(p.timer); pending.delete(m.id);
  m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${stage}: ${method} timed out`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await sleep(100); }
  throw new Error(`${stage}: ${expression}\n${await evaluate("document.body.innerText.slice(-4500)")}\n${JSON.stringify(await evaluate("({requests:window.__BoqLinkFixture?.requests,toasts:window.__DprSiteFixture?.toasts,lastRequests:window.__DprSiteFixture?.requests.slice(-5)})"))}`);
}
function check(value, message) { if (!value) throw new Error(`${stage}: ${message}`); }
async function click(selector) {
  stage = `click ${selector}`; await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await sleep(150);
}
async function fill(selector, value) {
  stage = `fill ${selector}`; await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});
    n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(100);
}
async function select(selector, label) {
  await click(selector); await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(n=>n.textContent.includes(${JSON.stringify(label)}))`);
  await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(n=>n.textContent.includes(${JSON.stringify(label)})).click()`);
  await sleep(100);
}
async function navigate(kind, scenario, section = "labour") {
  stage = `navigate ${kind}/${scenario}`;
  // Same synthetic ID is deliberately reused; discard this isolated browser's
  // cross-scenario UI autosave, not the adapter's scoped reopen session data.
  await evaluate("(() => { if(location.origin!=='http://127.0.0.1:4178') return; localStorage.clear(); Object.keys(sessionStorage).filter(key=>!key.startsWith('boq-link01-fixture-')).forEach(key=>sessionStorage.removeItem(key)); })()");
  const path = kind === "guided" ? `/guided?draftId=6351&section=${section}` : "/site/edit/6351?draft";
  await call("Page.navigate", { url: `http://127.0.0.1:4178${path}&dpr16b2=1&labour01=1&labour01stay=1&boqlink01=1&boqcase=${scenario}` });
  await wait("!!window.__BoqLinkFixture && !!document.querySelector('[data-testid=\"boq-link01-fixture-banner\"]')");
  await wait("window.__BoqLinkFixture.draft != null");
  await sleep(1000);
}
async function shot(name, selector) {
  if (selector) await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);
  await sleep(350);
  const r = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`${out}/fixture-${name}.png`, Buffer.from(r.data, "base64"));
}
async function step(number) {
  const current = await evaluate("Number(Array.from(document.querySelectorAll('[data-testid^=\"wizard-step-\"]')).find(n=>n.querySelector('span')?.classList.contains('bg-primary'))?.getAttribute('data-testid').split('-').pop())");
  if (number < current) await click(`[data-testid="wizard-step-${number}"]`);
  else for (let i = current; i < number; i++) await click('[data-testid="button-step-next"]');
}
async function saveGuided() {
  await click('[data-testid="button-save-draft"]');
  await wait("window.__BoqLinkFixture.requests.some(r=>r.method==='PATCH')");
}
try {
  await call("Page.enable"); await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate("guided", "B");
  await evaluate("window.__BoqLinkFixture.reset()");
  await navigate("guided", "B");
  await click('[data-testid="button-add-labour"]');
  await wait("document.querySelector('[data-testid=\"select-labour-workitem-0\"]')?.textContent.includes('GSB')");
  await shot("B-labour-single", '[data-testid="labour-row-0"]');
  await step(5); await click('[data-testid="button-add-equipment"]');
  await select('[data-testid="select-eq-machine-0"]', "JCB 3DX");
  await fill('[data-testid="equipment-compact-start-0"]', "08:00");
  await fill('[data-testid="equipment-compact-end-0"]', "12:00");
  await wait("document.body.innerText.includes('Suggested from today')");
  await shot("B-machine-full-segment", '[data-testid="equipment-compact-group-work-0"]');
  await click('[data-testid="button-add-equipment"]');
  await select('[data-testid="select-eq-machine-1"]', "DAILY HIRE ROLLER");
  await fill('[data-testid="equipment-compact-start-1"]', "");
  await fill('[data-testid="equipment-compact-end-1"]', "");
  await fill('[data-testid="equipment-compact-opening-meter-1"]', "150");
  await fill('[data-testid="equipment-compact-closing-meter-1"]', "154");
  await shot("B-meter-only-no-segment", '[data-testid="equipment-row-1"]');
  await saveGuided();
  const payloadB = await evaluate("window.__BoqLinkFixture.requests.find(r=>r.method==='PATCH').body");
  check(payloadB.equipment[0].activitySegments?.length === 1, "first new machine segment missing");
  check(payloadB.equipment[0].activitySegments[0].boqItems[0].programmeBarId === 9901, "must use today's bar, not second project bar");
  check(payloadB.equipment[0].activitySegments[0].startTime === "08:00" && payloadB.equipment[0].activitySegments[0].endTime === "12:00", "full-duration segment changed");
  check(!payloadB.equipment[1].activitySegments?.length && !payloadB.equipment[1].startTime && !payloadB.equipment[1].endTime, "meter-only invented assignment/time");
  check(payloadB.equipment.every(row => row.boqItemId == null), "new equipment parent link");
  results.push({ test: "B", adapterPayload: payloadB, databasePersistence: false });

  await navigate("guided", "C"); await click('[data-testid="button-add-labour"]');
  check(await evaluate("document.querySelector('[data-testid=\"select-labour-workitem-0\"]').textContent.includes('No work item')"), "two activities guessed labour");
  await click('[data-testid="select-labour-workitem-0"]');
  check(await evaluate("Array.from(document.querySelectorAll('[role=\"option\"]')).slice(0,2).map(n=>n.textContent).join('|').includes('GSB')"), "activities not first");
  await shot("C-two-activities-options");
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  results.push({ test: "C", twoActivitiesNoDefault: true });

  await navigate("guided", "D"); await click('[data-testid="button-add-labour"]');
  await select('[data-testid="select-labour-workitem-0"]', "CLEARING AND GRUBBING ROAD");
  await step(2); await click('[data-testid="button-suggested-bar-9902"]');
  await step(4);
  check(await evaluate("document.querySelector('[data-testid=\"select-labour-workitem-0\"]').textContent.includes('CLEARING')"), "manual choice overwritten");
  await shot("D-manual-choice-preserved", '[data-testid="labour-row-0"]');
  results.push({ test: "D", explicitChoicePreserved: true, addedSecondBoqActivity: true });

  await navigate("guided", "E", "equipment"); await click('[data-testid="button-add-equipment"]');
  await select('[data-testid="select-eq-machine-0"]', "JCB 3DX");
  await fill('[data-testid="equipment-compact-start-0"]', "08:00");
  await fill('[data-testid="equipment-compact-end-0"]', "12:00");
  await click('[data-testid="equipment-general-0"]');
  await saveGuided();
  const payloadE = await evaluate("window.__BoqLinkFixture.requests.find(r=>r.method==='PATCH').body");
  check(payloadE.equipment[0].resourceScope === "general" && payloadE.equipment[0].activitySegments?.length === 0, "General payload wrong");
  await navigate("guided", "E", "equipment");
  check(await evaluate("document.querySelector('[data-testid=\"equipment-general-0\"]').getAttribute('data-state')==='checked'"), "General fixture reopen wrong");
  await shot("E-general-readings-fixture-reopen", '[data-testid="equipment-row-0"]');
  await shot("E-general-fixture-reopen", '[data-testid="equipment-general-0"]');
  results.push({ test: "E", syntheticReopen: true, adapterPayload: payloadE, databasePersistence: false });

  await navigate("edit", "F");
  await click('[data-testid="button-add-material-top"]');
  await select('[data-testid="select-material-type-0"]', "Issued");
  await fill('[data-testid="input-material-name-0"]', "GSB ISSUED FIXTURE");
  await click('[data-testid="button-add-material-top"]');
  await fill('[data-testid="input-material-name-1"]', "GSB DELIVERY FIXTURE");
  check(await evaluate("document.querySelector('[data-testid=\"select-material-boqitem-0\"]').textContent.includes('GSB') && document.querySelector('[data-testid=\"select-material-boqitem-1\"]').textContent.includes('No work item')"), "Issued/Received defaults wrong");
  await shot("F-issued-received", '[data-testid="material-row-0"]');
  results.push({ test: "F", issuedSuggestedReceivedEmpty: true });

  await navigate("guided", "G", "equipment");
  await step(7); await click('[data-testid="button-submit"]');
  await wait("!!document.querySelector('[data-testid=\"button-readiness-advisory-equipment-0\"]')");
  check(await evaluate("!!document.querySelector('[data-testid=\"button-readiness-submit-anyway\"]')"), "advisory blocked submit");
  await shot("G-nonblocking-advisory");
  await click('[data-testid="button-readiness-advisory-equipment-0"]');
  await wait("document.querySelector('[data-dpr-row-key=\"equipment-0\"]')?.classList.contains('ring-2')");
  await shot("G-equipment-row-highlight", '[data-dpr-row-key="equipment-0"]');
  await step(7); await click('[data-testid="button-submit"]');
  await click('[data-testid="button-readiness-submit-anyway"]');
  await wait("window.__BoqLinkFixture.requests.some(r=>r.path.endsWith('/submit'))");
  results.push({ test: "G", nonblocking: true, highlight: true, syntheticSubmit: true, databasePersistence: false });

  await navigate("edit", "G-edit");
  await click('[data-testid="button-submit-dpr-bottom"]');
  await wait("!!document.querySelector('[data-testid=\"button-readiness-advisory-equipment-0\"]')");
  await shot("G-edit-advisory");
  await click('[data-testid="button-readiness-advisory-equipment-0"]');
  await wait("document.querySelector('[data-dpr-row-key=\"equipment-0\"]')?.classList.contains('ring-2')");
  await shot("G-edit-row-highlight", '[data-dpr-row-key="equipment-0"]');
  results.push({ test: "G-edit", exactRowHighlight: true });

  await navigate("edit", "no-work");
  await shot("G-no-site-work");
  await click('[data-testid="button-submit-dpr-bottom"]');
  await wait("window.__BoqLinkFixture.requests.some(r=>r.path.endsWith('/submit')) || !!document.querySelector('[data-testid=\"dialog-dpr-readiness\"]')");
  check(await evaluate("!document.body.innerText.includes('not linked to a work item')"), "No Site Work advisory present after readiness");
  results.push({ test: "G-no-work", attributionAdvisoryAbsent: true });
  check(exceptions.length === 0, `browser exceptions: ${JSON.stringify(exceptions)}`);
  writeFileSync(".agents/outputs/boq-link-01/fixture-frontend-result.json", JSON.stringify({ fixtureOnly: true, results, exceptions }, null, 2));
  try { unlinkSync(`${out}/fixture-failure.png`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  console.log("BOQ-LINK-01 fixture browser checks passed", results.map(r => r.test).join(", "));
} catch (error) {
  await shot("failure");
  writeFileSync(".agents/outputs/boq-link-01/fixture-frontend-result.json", JSON.stringify({ fixtureOnly: true, stage, error: String(error), results, exceptions }, null, 2));
  console.error(error); process.exitCode = 1;
} finally { socket.close(); }