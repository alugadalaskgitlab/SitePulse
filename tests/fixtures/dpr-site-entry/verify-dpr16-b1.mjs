/*
 * Isolated B1 browser regression. Production section routes/components run in
 * Chromium; auth, BOQ and canonical DPR HTTP storage are synthetic fixture
 * services. No operational DPR or database is accessed.
 * Parent starts the existing fixture server (:4178) and Chromium CDP (:9222).
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
  const message = JSON.parse(raw);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  if (message.method === "Page.javascriptDialogOpening") void call("Page.handleJavaScriptDialog", { accept: true });
  if (pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id);
    clearTimeout(timer); pending.delete(message.id);
    message.error ? reject(new Error(message.error.message)) : resolve(message.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => reject(new Error(`CDP timed out: ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  for (let i = 0; i < 200; i++) {
    if (await evaluate(expression)) return;
    await sleep(75);
  }
  throw new Error(`Timed out: ${expression}; page=${await evaluate("document.body.innerText")}; errors=${JSON.stringify(errors)}`);
}
async function check(expression, reason) {
  if (!(await evaluate(expression))) throw new Error(reason);
}
async function clickButton(label) {
  const expression = `Array.from(document.querySelectorAll('button')).find(b => !b.disabled && b.textContent.trim() === ${JSON.stringify(label)})`;
  await wait(`!!(${expression})`);
  await evaluate(`(${expression}).click()`);
}
async function clickSection(label) {
  const expression = `Array.from(document.querySelectorAll('button')).find(b => b.querySelector('h2')?.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())})`;
  await wait(`!!(${expression})`);
  await evaluate(`(${expression}).click()`);
}
async function click(selector) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function input(selector, value) {
  await wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, ${JSON.stringify(value)}); node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); })()`);
}
async function navigate(path) {
  await call("Page.navigate", { url: base + path });
  await wait("!!window.__Dpr13Fixture && document.readyState === 'complete'");
}
async function screenshot(name) {
  const directory = "tests/fixtures/dpr-site-entry/evidence";
  mkdirSync(directory, { recursive: true });
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${directory}/${name}.png`, Buffer.from(shot.data, "base64"));
}
const route = "/site/work/1301?dpr16=1";
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  if (process.argv.includes("--equipment-only")) {
    await navigate("/fixture/dpr13?dpr16=1&site=NARASIMHULU%20ROAD&date=2026-08-05&type=road&boqProjectId=5501");
    await evaluate(`(() => {
      window.__Dpr13Fixture.reset();
      const context={site:'NARASIMHULU ROAD',date:'2026-08-05',workType:'road',boqProjectId:5501};
      window.__Dpr13Fixture.seed({
        context,headerToken:'h0',sectionTokens:{activity:'a0',equipment:'e0',labour:'l0',materials:'m0'},
        dpr:{id:1301,...context,engineer:'SYNTHETIC B1 ENGINEER',dprStatus:'draft',
          progress:[],labour:[],materials:[],sitePurchases:[],structureItems:[],
          equipment:[{id:18116,machine:'SYNTHETIC B1 EXCAVATOR',vehicleNo:'B1-001',
            entryType:'time_meter',usageStatus:'working',openingReading:100,closingReading:106,
            startTime:'08:00',endTime:'16:00',dieselSource:'plant_stock',diesel:20,
            openingDiesel:30,dieselBalanceInTank:25,dieselBalanceConfirmed:false,
            breakdowns:[],equipmentId:null,plantUsageId:null}]}
      });
    })()`);
    await navigate(route);
    await clickSection("equipment");
    await wait("!!document.querySelector('[data-testid=\"panel-consumption-incomplete-0\"]')");
    await check("document.querySelector('[data-testid=\"panel-consumption-incomplete-0\"]').innerText.includes('Incomplete — tank balance not confirmed') && !document.querySelector('[data-testid=\"panel-actual-consumption-0\"]')", "Unconfirmed section tank displays calculated consumption");
    await screenshot("dpr16-b1-desktop-equipment");
    await input('[data-testid="input-diesel-balance-0"]', "24");
    await click('[data-testid="checkbox-diesel-balance-confirmed-0"]');
    await wait("!!document.querySelector('[data-testid=\"panel-actual-consumption-0\"]')");
    await check("!document.querySelector('[data-testid=\"panel-consumption-incomplete-0\"]') && document.querySelector('[data-testid=\"text-actual-consumption-0\"]')?.textContent === '26.000'", "Confirmed tank does not display calculated consumption");
    await clickButton("Save & return");
    await wait("window.__Dpr13Fixture.snapshot?.dpr.equipment?.[0]?.dieselBalanceConfirmed === true");
    await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate(route);
    await clickSection("equipment");
    await wait("!!document.querySelector('[data-testid=\"panel-actual-consumption-0\"]')");
    await check("document.querySelector('[data-testid=\"input-diesel-balance-0\"]')?.value === '24' && !document.querySelector('[data-testid=\"panel-consumption-incomplete-0\"]')", "Fresh mobile load lost confirmed tank display");
    await screenshot("dpr16-b1-mobile-equipment");
    console.log("PASS DPR16 B1 focused equipment: unconfirmed Incomplete display; confirmed consumption after save/mobile reload.");
  } else {
  await navigate("/fixture/dpr13?dpr16=1&site=NARASIMHULU%20ROAD&date=2026-08-05&type=road&boqProjectId=5501");
  await evaluate(`(() => {
    window.__Dpr13Fixture.reset();
    const context={site:'NARASIMHULU ROAD',date:'2026-08-05',workType:'road',boqProjectId:5501};
    window.__Dpr13Fixture.seed({
      context,headerToken:'h0',sectionTokens:{activity:'a0',equipment:'e0',labour:'l0',materials:'m0'},
      dpr:{id:1301,...context,engineer:'SYNTHETIC B1 ENGINEER',dprStatus:'draft',
        progress:[{id:19116,entryKey:'b1-cut-row',activity:'ROADWAY EXCAVATION',boqItemId:8816,
          chainageFrom:'0+000',chainageTo:'0+100',length:100,width:1,depth:1,
          quantity:100,uom:'CUM',materialOutcome:null,reusableQty:null,personnelIds:[]}],
        equipment:[{id:18116,machine:'SYNTHETIC B1 EXCAVATOR',vehicleNo:'B1-001',
          entryType:'time_meter',usageStatus:'working',openingReading:100,closingReading:106,
          startTime:'08:00',endTime:'16:00',dieselSource:'plant_stock',diesel:20,
          openingDiesel:30,dieselBalanceInTank:25,dieselBalanceConfirmed:false,
          breakdowns:[],equipmentId:null,plantUsageId:null}],
        labour:[],materials:[],sitePurchases:[],structureItems:[]}
    });
  })()`);
  await navigate(route);
  await wait("!!document.querySelector('[data-testid=\"section-readiness-banner\"]')");
  await check("document.querySelector('[data-testid=\"section-readiness-banner\"]').innerText.includes('ROADWAY EXCAVATION')", "BOQ-enriched excavation outcome did not appear in readiness");
  await click('[data-testid="section-readiness-banner"] button');
  await wait("!!document.querySelector('[data-testid=\"section-activity-toggle-0\"]')");
  await check("document.querySelector('[data-testid=\"section-activity-toggle-0\"]').getAttribute('aria-expanded') === 'true'", "Fix failed to expand targeted activity");
  await check("!!document.querySelector('[data-testid=\"input-progress-width-0\"]') && !!document.querySelector('[data-testid=\"input-progress-thickness-0\"]')", "Geometry fields missing from expanded row");
  await check("document.querySelector('[data-testid=\"section-geometry-0\"]')?.classList.contains('grid-cols-2')", "Section geometry did not use the compact responsive grid");
  await screenshot("dpr16-b1-desktop-activity-fix");
  await click('[data-testid="select-cut-fill-outcome"]');
  await wait("Array.from(document.querySelectorAll('[role=\"option\"]')).some(n=>n.textContent.includes('Partly reusable'))");
  await evaluate("Array.from(document.querySelectorAll('[role=\"option\"]')).find(n=>n.textContent.includes('Partly reusable')).click()");
  await input('[data-testid="input-reusable-qty"]', "120");
  await wait("!!document.querySelector('[data-testid=\"text-reusable-qty-error\"]')");
  await check("document.querySelector('[data-testid=\"section-activity-toggle-0\"]').innerText.includes('Needs attention')", "Invalid reusable quantity lost readiness warning");
  await input('[data-testid="input-reusable-qty"]', "40");
  await wait("!document.querySelector('[data-testid=\"text-reusable-qty-error\"]')");
  await click('[data-testid="select-personnel-0"]');
  await wait("Array.from(document.querySelectorAll('[role=\"option\"]')).some(n=>n.textContent.includes('SURESH KUMAR'))");
  await evaluate("Array.from(document.querySelectorAll('[role=\"option\"]')).find(n=>n.textContent.includes('SURESH KUMAR')).click()");
  await clickButton("Save & return");
  await wait("window.__Dpr13Fixture.snapshot?.dpr.progress?.[0]?.reusableQty === 40 && !document.querySelector('[data-testid=\"section-activity-toggle-0\"]')");
  await check("!document.querySelector('[data-testid=\"section-readiness-banner\"]')?.innerText.includes('ROADWAY EXCAVATION')", "Corrected outcome still appears as an activity issue");
  await check("window.__Dpr13Fixture.snapshot.dpr.progress[0].personnelIds.includes(6101)", "Personnel was not saved with activity");
  await navigate(route);
  await wait("document.body.innerText.includes('Activity / Progress')");
  await clickSection("Activity / Progress");
  await wait("!!document.querySelector('[data-testid=\"section-activity-toggle-0\"]')");
  await check("document.querySelector('[data-testid=\"section-activity-toggle-0\"]').getAttribute('aria-expanded') === 'false'", "Reopened row is not collapsed");
  await check("document.querySelector('[data-testid=\"section-geometry-0\"]')?.closest('[id^=\"section-activity-details-\"]')?.classList.contains('hidden')", "Collapsed geometry still occupies the visible editor");
  await check("document.querySelector('[data-testid=\"section-activity-toggle-0\"]').innerText.includes('Recorded')", "Reopened activity readiness is stale");
  await click('[data-testid="section-activity-toggle-0"]');
  await wait("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40'");
  await check("document.querySelector('[data-testid=\"activity-resources-block-0\"]').innerText.includes('SURESH KUMAR')", "Personnel lost on fresh activity load");
  await clickButton("Return to sections");
  await clickSection("equipment");
  await wait("!!document.querySelector('[data-testid=\"section-equipment-summary-0\"]')");
  await check("document.querySelector('[data-testid=\"section-equipment-summary-0\"]').children.length === 4", "Collapsed equipment summary is not a four-cell grid");
  await check("!!document.querySelector('[data-testid=\"input-diesel-balance-0\"]')", "Tank balance field missing");
  await screenshot("dpr16-b1-desktop-equipment");
  await input('[data-testid="input-diesel-balance-0"]', "24");
  await click('[data-testid="checkbox-diesel-balance-confirmed-0"]');
  await clickButton("Save & return");
  await wait("window.__Dpr13Fixture.snapshot?.dpr.equipment?.[0]?.dieselBalanceInTank === 24");
  await check("window.__Dpr13Fixture.snapshot.dpr.equipment[0].dieselBalanceConfirmed === true", "Tank confirmation not persisted");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(route);
  await clickSection("Activity / Progress");
  await wait("!!document.querySelector('[data-testid=\"section-activity-toggle-0\"]')");
  await check("document.querySelector('[data-testid=\"section-activity-toggle-0\"]').getAttribute('aria-expanded') === 'false' && document.querySelector('[data-testid=\"section-geometry-0\"]')?.closest('[id^=\"section-activity-details-\"]')?.classList.contains('hidden')", "Mobile activity geometry was not collapsed");
  await click('[data-testid="section-activity-toggle-0"]');
  await wait("document.querySelector('[data-testid=\"input-reusable-qty\"]')?.value === '40'");
  await check("document.querySelector('[data-testid=\"activity-resources-block-0\"]').innerText.includes('SURESH KUMAR')", "Mobile activity personnel did not hydrate");
  await screenshot("dpr16-b1-mobile-activity");
  await clickButton("Return to sections");
  await clickSection("equipment");
  await wait("!!document.querySelector('[data-testid=\"section-equipment-summary-0\"]')");
  await check("document.querySelector('[data-testid=\"section-equipment-summary-0\"]').children.length === 4 && document.querySelector('[data-testid=\"input-diesel-balance-0\"]')?.value === '24'", "Mobile equipment summary/tank failed fresh reload");
  await screenshot("dpr16-b1-mobile-equipment");
  await clickButton("Return to sections");
  await clickButton("Review & Submit");
  await wait("document.body.innerText.includes('Review persisted DPR')");
  await check("!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Submit DPR')?.disabled", "Submission unavailable despite corrected rows");
  await clickButton("Submit DPR");
  await wait("document.body.innerText.includes('Section editing is closed')");
  await check("window.__Dpr13Fixture.snapshot.dpr.dprStatus === 'submitted' && window.__Dpr13Fixture.requests.some(r=>r.path.endsWith('/submit') && r.method==='POST')", "Submit did not reach synthetic canonical endpoint");
  console.log("PASS DPR16 B1 routed Chromium fixture: desktop fix/edit/save/reload, mobile tank/reload, submit (mock auth/API storage/BOQ; real React routes).");
  }
} finally {
  socket.close();
  await fetch(`${cdp}/json/close/${target.id}`).catch(() => {});
}