// Drives real production components against the explicitly synthetic adapter.
// Requires parent-managed fixture server :4178 and Chromium CDP :9222.
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.env.DPR_FIXTURE_URL || "http://127.0.0.1:4178";
const cdpBase = process.env.CDP_URL || "http://127.0.0.1:9222";
const target = await (await fetch(`${cdpBase}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let seq = 0;
const pending = new Map();
const browserErrors = [];
let acceptDialogs = true;
let dialogCount = 0;
socket.on("message", raw => {
  const msg = JSON.parse(raw);
  if (msg.method === "Page.javascriptDialogOpening") { dialogCount++; void call("Page.handleJavaScriptDialog", { accept: acceptDialogs }); }
  if (msg.method === "Runtime.exceptionThrown") browserErrors.push(msg.params.exceptionDetails);
  if (pending.has(msg.id)) {
    const { resolve, reject, timer } = pending.get(msg.id);
    clearTimeout(timer); pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => reject(new Error(`CDP timeout ${method}`)), 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(70); }
  throw new Error(`Timeout: ${expression}\n${await evaluate("document.body.innerText")}`);
}
const q = JSON.stringify;
async function click(text, exact = true) {
  const expr = `Array.from(document.querySelectorAll('button')).find(n => !n.disabled && ${exact ? `n.textContent.trim() === ${q(text)}` : `n.textContent.toLowerCase().includes(${q(text.toLowerCase())})`})`;
  await wait(`!!(${expr})`);
  await wait(`(() => { const node = ${expr}; if (!node) return false; node.click(); return true; })()`);
  await sleep(100);
}
async function input(selector, value) {
  await wait(`!!document.querySelector(${q(selector)})`);
  await evaluate(`(() => { const n = document.querySelector(${q(selector)}); Object.getOwnPropertyDescriptor(n.tagName === 'SELECT' ? HTMLSelectElement.prototype : n.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(n, ${q(value)}); n.dispatchEvent(new Event('input', {bubbles:true})); n.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await sleep(100);
}
async function navigate(path, ready = "(document.body.innerText.includes('Road Works DPR') || document.body.innerText.includes('Structure DPR'))") {
  await evaluate("window.__Dpr13Navigating = true");
  await call("Page.navigate", { url: base + path });
  await wait(`!window.__Dpr13Navigating && !!window.__Dpr13Fixture && (${ready})`);
}
async function screenshot(name, fullPage = true) {
  mkdirSync("tests/fixtures/dpr-site-entry/evidence", { recursive: true });
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: fullPage });
  writeFileSync(`tests/fixtures/dpr-site-entry/evidence/${name}.png`, Buffer.from(shot.data, "base64"));
}
const contextPath = "/fixture/dpr13?site=NARASIMHULU%20ROAD&date=2026-08-05&type=road";
try {
  await call("Page.enable"); await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(contextPath);
  await evaluate("window.__Dpr13Fixture.reset()");
  await input("#dpr-engineer", "SYNTHETIC ENGINEER");
  await click("Open sections");
  await click("equipment", false);
  await wait("!!document.querySelector('[data-testid=\"select-equipment-0\"]')");
  await evaluate("document.querySelector('[data-testid=\"select-equipment-0\"]').click()");
  await wait("Array.from(document.querySelectorAll('[role=\"option\"]')).some(n=>n.textContent.includes('Other / Unlisted'))");
  await evaluate("Array.from(document.querySelectorAll('[role=\"option\"]')).find(n=>n.textContent.includes('Other / Unlisted')).click()");
  await input('[data-testid="input-equipment-other-0"]', "SYNTHETIC ROLLER");
  await input('[data-testid="input-equipment-opening-0"]', "100");
  await click("Save & return");
  await wait("window.__Dpr13Fixture.snapshot?.dpr.equipment?.[0]?.openingReading === 100");
  await screenshot("dpr13-equipment-first-menu");
  if (!(await evaluate("location.search.includes('dprId=1301')"))) throw new Error("First save did not publish canonical id");
  await click("Activity / Progress", false);
  await wait("document.body.innerText.includes('Road Works Progress')");
  if (await evaluate("!!document.querySelector('[data-testid=\"select-equipment-0\"]')")) throw new Error("Equipment fields leaked into activity");
  await click("Return to sections");
  await click("labour", false);
  await click("Add Labour");
  await input('[data-testid="input-labour-count-0"]', "7");
  await click("Save & return");
  await wait("window.__Dpr13Fixture.snapshot?.dpr.labour?.[0]?.count === 7");
  if (!(await evaluate("window.__Dpr13Fixture.snapshot.dpr.equipment[0].openingReading === 100 && window.__Dpr13Fixture.snapshot.context.date === '2026-08-05'"))) throw new Error("Independent labour save changed equipment or reporting date");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').every(r=>Object.keys(r.body.data).every(k=>k === r.path.split('/').pop() || k === 'engineer'))"))) throw new Error("Section request included another section");
  // A fresh page with the same reporting context, not current date or local form autosave.
  await navigate(contextPath);
  await click("Open sections");
  await wait("document.body.innerText.includes('DPR #1301')");
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"input-equipment-opening-0\"]')?.value === '100'");
  await input('[data-testid="input-equipment-opening-0"]', "101");
  acceptDialogs = false;
  await click("Return to sections");
  if (!(await evaluate("document.querySelector('[data-testid=\"input-equipment-opening-0\"]')?.value === '101'")) || !dialogCount) throw new Error("Cancelled dirty navigation lost local equipment");
  acceptDialogs = true;
  await evaluate("window.__Dpr13Fixture.conflictNext = true");
  await click("Save Section");
  await wait("document.body.innerText.includes('Conflict:')");
  await screenshot("dpr13-conflict-retains-local");
  if (!(await evaluate("document.querySelector('[data-testid=\"input-equipment-opening-0\"]').value === '101'"))) throw new Error("Conflict discarded local values");
  await click("Reload & review persisted DPR");
  await wait("document.body.innerText.includes('DPR #1301')");
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"input-equipment-opening-0\"]')?.value === '100'");
  await input('[data-testid="input-equipment-closing-0"]', "105");
  await click("Save & return");
  await click("Review & Submit");
  await wait("document.body.innerText.includes('Review persisted DPR')");
  await evaluate("window.__Dpr13Fixture.conflictNext = true");
  await click("Submit DPR");
  await wait("document.body.innerText.includes('Conflict:')");
  if (!(await evaluate("window.__Dpr13Fixture.snapshot.dpr.dprStatus === 'draft'"))) throw new Error("Stale review unexpectedly submitted");
  await screenshot("dpr13-stale-submit");
  await click("Reload & review persisted DPR");
  await click("Review & Submit");
  await click("Submit DPR");
  await wait("document.body.innerText.includes('Section editing is closed')");
  // Duplicate selection is tested on another context opening; synthetic candidates
  // deliberately point at the stored canonical snapshot.
  await navigate(contextPath);
  await evaluate("window.__Dpr13Fixture.chooseNext = true");
  await click("Open sections");
  await wait("document.body.innerText.includes('Multiple matching drafts')");
  await screenshot("dpr13-explicit-chooser");
  if (!(await evaluate("Array.from(document.querySelectorAll('button')).filter(n => n.textContent.includes('DPR #130')).length === 2"))) throw new Error("Explicit chooser candidates missing");
  await click("DPR #1301", false);
  await wait("document.body.innerText.includes('Section editing is closed')");
  await screenshot("dpr13-submitted");

  // Structure uses the same live hierarchy/quantity/remarks fields. First-save
  // photo failure must retain the editor, then retry against the saved id.
  await evaluate("window.__Dpr13Fixture.reset()");
  const structurePath = contextPath.replace("type=road", "type=structure");
  await navigate(structurePath);
  await input("#dpr-engineer", "SYNTHETIC STRUCTURE ENGINEER");
  await click("Open sections");
  await click("Activity / Progress", false);
  await input('[data-testid="input-structure-name-0"]', "SYNTHETIC CULVERT 12+400");
  await input('[data-testid="input-structure-qty-0"]', "12.5");
  await input('[data-testid="input-structure-remarks-0"]', "HYDRATION REMARK");
  await evaluate(`(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), c => c.charCodeAt(0))], 'synthetic-photo.png', {type:'image/png'}));
    const input = document.querySelector('[data-testid="input-dpr-photo-gallery"]');
    input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    window.__Dpr13Fixture.failPhotoNext = true;
  })()`);
  await click("Save & return");
  await wait("window.__Dpr13Fixture.snapshot?.dpr.structureItems?.[0]?.quantity === 12.5");
  await wait("!Array.from(document.querySelectorAll('button')).find(n=>n.textContent === 'Save Section')?.disabled");
  if (!(await evaluate("!!document.querySelector('[data-testid=\"input-structure-name-0\"]')"))) throw new Error("Photo failure unexpectedly discarded editor");
  await screenshot("dpr13-structure-photo-retry");
  await click("Save & return");
  await wait("document.body.innerText.includes('DPR #1301') && !document.querySelector('[data-testid=\"input-structure-name-0\"]')");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT' && !r.body.dprId).length === 1 && window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').at(-1).body.dprId === 1301"))) throw new Error("Photo retry attempted a duplicate create");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').at(-1).body.data.structureItems[0].persistedId === window.__Dpr13Fixture.snapshot.dpr.structureItems[0].id"))) throw new Error("Photo retry lost the persisted structure child identity");
  await click("materials", false);
  await click("Add");
  await input('[data-testid="input-material-name-0"]', "SYNTHETIC CEMENT");
  await input('[data-testid="input-material-qty-0"]', "4.25");
  await input('[data-testid="input-material-uom-0"]', "MT");
  await input('[data-testid="input-material-location-0"]', "CULVERT");
  await evaluate("document.querySelector('[data-testid=\"button-add-site-purchase-top\"]').click()");
  await input('[data-testid="input-site-purchase-item-0"]', "SYNTHETIC LOCAL PURCHASE");
  await input('[data-testid="input-site-purchase-vendor-0"]', "SYNTHETIC VENDOR");
  await input('[data-testid="input-site-purchase-bill-0"]', "SYNTH-001");
  await input('[data-testid="input-site-purchase-amount-0"]', "125");
  await input('[data-testid="input-site-purchase-qty-0"]', "5");
  await input('[data-testid="input-site-purchase-uom-0"]', "NOS");
  await screenshot("dpr13-materials-fields");
  await click("Save & return");
  await wait("window.__Dpr13Fixture.snapshot?.dpr.materials?.[0]?.quantity === 4.25");
  await navigate(structurePath);
  await click("Open sections");
  await click("Activity / Progress", false);
  await wait("document.querySelector('[data-testid=\"input-structure-name-0\"]')?.value === 'SYNTHETIC CULVERT 12+400'");
  if (!(await evaluate("document.querySelector('[data-testid=\"input-structure-qty-0\"]').value === '12.5' && document.querySelector('[data-testid=\"input-structure-remarks-0\"]').value === 'HYDRATION REMARK' && window.__Dpr13Fixture.snapshot.context.date === '2026-08-05' && window.__Dpr13Fixture.snapshot.context.workType === 'structure'"))) throw new Error("Structure hydration/context mismatch");
  await screenshot("dpr13-structure-reopened");
  await click("Return to sections");
  await click("materials", false);
  await wait("document.querySelector('[data-testid=\"input-material-qty-0\"]')?.value === '4.25'");
  if (!(await evaluate("document.querySelector('[data-testid=\"input-material-name-0\"]').value === 'SYNTHETIC CEMENT' && document.querySelector('[data-testid=\"input-material-location-0\"]').value === 'CULVERT'"))) throw new Error("Material hydration mismatch");
  if (!(await evaluate("document.querySelector('[data-testid=\"input-site-purchase-item-0\"]').value === 'SYNTHETIC LOCAL PURCHASE' && document.querySelector('[data-testid=\"input-site-purchase-amount-0\"]').value === '125'"))) throw new Error("Site purchase card did not round-trip through Materials");
  await input('[data-testid="input-site-purchase-amount-0"]', "130");
  await click("Save Section");
  await wait("window.__Dpr13Fixture.snapshot.dpr.sitePurchases[0].amount === 130");
  await click("Return to sections");
  // Rich persisted rows exercise the real mapper and full production equipment
  // cards, including segmented and legacy-allocation formats, not substitute fields.
  await evaluate(`(() => {
    const snapshot = structuredClone(window.__Dpr13Fixture.snapshot);
    snapshot.context.boqProjectId = 5501; snapshot.dpr.boqProjectId = 5501;
    const common = {
      machine:'SYNTHETIC HYDRATED ROLLER', vehicleNo:'SYNTH-01', operator:'SYNTHETIC OPERATOR', task:'SYNTHETIC TASK',
      entryType:'time_meter', startTime:'08:00', endTime:'12:00', openingReading:500, closingReading:504,
      diesel:20, openingDiesel:30, dieselBalanceInTank:25, dieselBalanceConfirmed:true,
      dieselSource:'plant_stock', fuelStation:'SYNTHETIC STATION', billNumber:'SYNTHETIC BILL', amountPaid:123,
      equipmentId:null, plantUsageId:null, usageStatus:'working', usageStatusReason:'',
      boqItemId:8801, structureId:'SYNTHETIC-STRUCTURE', breakdowns:[],
    };
    snapshot.dpr.equipment = [
      {...common, id:18101, activitySegments:[{id:18201,startTime:'08:00',endTime:'12:00',hoursWorked:4,boqItems:[{id:18301,boqItemId:8801,programmeBarId:null}]}]},
      {...common, id:18102,machine:'SYNTHETIC LEGACY ALLOCATION', activityAllocations:[{id:18401,boqItemId:8801,programmeBarId:null,startTime:'08:00',endTime:'12:00',hoursWorked:4}]},
    ];
    snapshot.dpr.materials[0] = {...snapshot.dpr.materials[0],supplier:'SYNTHETIC SUPPLIER',vehicleNumber:'SYNTH-MAT',receiptNumber:'SYNTH-REC',structureId:'SYNTHETIC-STRUCTURE',boqItemId:8801};
    snapshot.dpr.equipment[0].breakdowns = [{
      clientKey:'synthetic-existing-stoppage', maintenanceLogId:18801,
      fromTime:'09:00', toTime:'09:30', description:'SYNTHETIC EXISTING STOPPAGE',
      responsibility:'vendor', repairScope:'hlc', debitableToVendor:true, remarks:'SYNTHETIC ORIGINAL REMARK',
      attachment:{fileName:'synthetic-existing.pdf',objectPath:'/synthetic/existing.pdf',mimeType:'application/pdf',fileSize:42},
    }];
    window.__Dpr13Fixture.seed(snapshot);
  })()`);
  await navigate(structurePath + "&boqProjectId=5501");
  await click("Open sections");
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"input-equipment-opening-0\"]')?.value === '500'");
  await screenshot("dpr13-equipment-hydration-all-fields");
  await click("Save & return");
  await wait("!document.querySelector('[data-testid=\"input-equipment-opening-0\"]')");
  if (!(await evaluate(`(() => {
    const rows = window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').at(-1).body.data.equipment;
    return rows[0].persistedId===18101 && rows[0].vehicleNo==='SYNTH-01' && rows[0].operator==='SYNTHETIC OPERATOR'
      && rows[0].task==='SYNTHETIC TASK' && rows[0].openingDiesel===30 && rows[0].dieselBalanceInTank===25
      && rows[0].dieselBalanceConfirmed===true && rows[0].fuelStation==='SYNTHETIC STATION' && rows[0].amountPaid===123
      && rows[0].boqItemId===8801 && rows[0].structureId==='SYNTHETIC-STRUCTURE'
      && rows[0].activitySegments[0].persistedId===18201 && rows[0].activitySegments[0].boqItems[0].persistedId===18301
      && rows[1].activityAllocations[0].persistedId===18401;
  })()`))) throw new Error("Equipment hydration/save lost persisted fields, segments, or allocations");
  // Stoppages use the unchanged breakdowns shape. This adapter demonstrates
  // frontend fidelity only; real draft-vs-ledger lifecycle is backend-tested.
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"equipment-breakdown-0-reason-0\"]')?.value === 'SYNTHETIC EXISTING STOPPAGE'");
  if (!(await evaluate("document.body.innerText.includes('Draft saves do not create or update maintenance ledger entries.') && document.querySelector('[data-testid=\"equipment-breakdown-0-attachment-0\"]').textContent.includes('synthetic-existing.pdf')"))) throw new Error("Draft stoppage messaging or saved evidence missing");
  await evaluate("document.querySelector('[data-testid=\"equipment-breakdown-0-add\"]').click()");
  await input('[data-testid="equipment-breakdown-0-from-1"]', "10:00");
  await input('[data-testid="equipment-breakdown-0-to-1"]', "11:15");
  await input('[data-testid="equipment-breakdown-0-reason-1"]', "SYNTHETIC DRAFT STOPPAGE");
  await input('[data-testid="equipment-breakdown-0-remarks-1"]', "SYNTHETIC DRAFT REMARK");
  for (const [field, label] of [["responsibility", "Vendor"], ["scope", "HLC's scope"]]) {
    await evaluate(`document.querySelector('[data-testid="equipment-breakdown-0-${field}-1"]').click()`);
    await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(n=>n.textContent===${q(label)})`);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(n=>n.textContent===${q(label)}).click()`);
  }
  await evaluate(`(() => {
    document.querySelector('[data-testid="equipment-breakdown-0-debitable-1"]').click();
    const transfer=new DataTransfer();
    transfer.items.add(new File(['SYNTHETIC STOPPAGE EVIDENCE'],'synthetic-stoppage.txt',{type:'text/plain'}));
    const node=document.querySelector('[data-testid="equipment-breakdown-0-file-1"]');
    node.files=transfer.files; node.dispatchEvent(new Event('change',{bubbles:true}));
    window.__Dpr13Fixture.failPhotoNext=true;
  })()`);
  const beforeStoppageSave = await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').length");
  await click("Save & return");
  await wait("!window.__Dpr13Fixture.failPhotoNext && !Array.from(document.querySelectorAll('button')).find(n=>n.textContent==='Save Section')?.disabled");
  if (!(await evaluate(`window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').length===${beforeStoppageSave} && document.querySelector('[data-testid="equipment-breakdown-0-attachment-1"]').textContent.includes('Selected: synthetic-stoppage.txt')`))) throw new Error("Failed stoppage evidence upload saved/dropped local data");
  await click("Save & return");
  await wait("window.__Dpr13Fixture.snapshot.dpr.equipment[0].breakdowns.length===2 && !document.querySelector('[data-testid=\"equipment-breakdown-0-from-1\"]')");
  const stoppageIdentity = await evaluate("window.__Dpr13Fixture.snapshot.dpr.equipment[0].breakdowns[1].clientKey");
  await navigate(structurePath + "&boqProjectId=5501");
  await click("Open sections");
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"equipment-breakdown-0-reason-1\"]')?.value === 'SYNTHETIC DRAFT STOPPAGE'");
  await evaluate("document.querySelector('[data-testid=\"equipment-breakdown-0-editor\"]').scrollIntoView()");
  await screenshot("dpr13-stoppage-draft-reopened", false);
  await input('[data-testid="equipment-breakdown-0-to-1"]', "11:45");
  await input('[data-testid="equipment-breakdown-0-remarks-1"]', "SYNTHETIC CORRECTED REMARK");
  await input('[data-testid="equipment-breakdown-0-reason-0"]', "SYNTHETIC EXISTING CORRECTED");
  await click("Save & return");
  await wait("!document.querySelector('[data-testid=\"equipment-breakdown-0-from-1\"]')");
  if (!(await evaluate(`(() => {
    const [old,row]=window.__Dpr13Fixture.snapshot.dpr.equipment[0].breakdowns;
    return old.clientKey==='synthetic-existing-stoppage' && old.maintenanceLogId===18801
      && old.description==='SYNTHETIC EXISTING CORRECTED' && old.attachment.objectPath==='/synthetic/existing.pdf'
      && old.attachment.fileSize===42 && old.responsibility==='vendor' && old.repairScope==='hlc' && old.debitableToVendor
      && row.clientKey===${q(stoppageIdentity)} && row.maintenanceLogId==null
      && row.fromTime==='10:00' && row.toTime==='11:45' && row.remarks==='SYNTHETIC CORRECTED REMARK'
      && row.responsibility==='vendor' && row.repairScope==='hlc' && row.debitableToVendor
      && row.attachment.fileName==='synthetic-stoppage.txt' && row.attachment.mimeType==='text/plain'
      && row.attachment.fileSize===27 && !!row.attachment.objectPath;
  })()`))) throw new Error("Stoppage save/reopen/edit lost fields, client identity, maintenance linkage or attachment metadata");
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"equipment-breakdown-0-to-1\"]')?.value === '11:45'");
  await evaluate("document.querySelector('[data-testid=\"equipment-breakdown-0-editor\"]').scrollIntoView()");
  await screenshot("dpr13-stoppage-draft-corrected", false);
  await click("Return to sections");
  await click("materials", false);
  await wait("document.querySelector('[data-testid=\"input-material-qty-0\"]')?.value === '4.25'");
  await click("Save & return");
  await wait("!document.querySelector('[data-testid=\"input-material-qty-0\"]')");
  if (!(await evaluate(`(() => { const row=window.__Dpr13Fixture.requests.filter(r=>r.method==='PUT').at(-1).body.data.materials[0]; return row.supplier==='SYNTHETIC SUPPLIER' && row.vehicleNumber==='SYNTH-MAT' && row.receiptNumber==='SYNTH-REC' && row.boqItemId===8801 && row.structureId==='SYNTHETIC-STRUCTURE'; })()`))) throw new Error("Material hydration/save lost receipt/context fields");
  await evaluate("window.__Dpr13Fixture.reset()");
  await navigate(contextPath);
  await input("#dpr-engineer", "SYNTHETIC CONTINUITY ENGINEER");
  await click("Open sections");
  await evaluate("window.__Dpr13Fixture.priorClosing = 432");
  await click("equipment", false);
  await wait("!!document.querySelector('[data-testid=\"select-equipment-0\"]')");
  await evaluate("document.querySelector('[data-testid=\"select-equipment-0\"]').click()");
  await wait("Array.from(document.querySelectorAll('[role=\"option\"]')).some(n=>n.textContent.includes('JCB 3DX'))");
  await evaluate("Array.from(document.querySelectorAll('[role=\"option\"]')).find(n=>n.textContent.includes('JCB 3DX')).click()");
  await wait("document.querySelector('[data-testid=\"input-equipment-opening-0\"]')?.value === '432'");
  if (!(await evaluate("window.__Dpr13Fixture.requests.some(r=>r.path.includes('latest-closing') && r.search.includes('2026-08-05'))"))) throw new Error("Continuity did not use reporting date");
  await screenshot("dpr13-equipment-reporting-date-prefill");
  await click("Save & return");
  await wait("!document.querySelector('[data-testid=\"input-equipment-opening-0\"]')");
  await navigate(contextPath);
  await click("Open sections");
  await evaluate("window.__Dpr13Fixture.priorClosing = 999");
  await click("equipment", false);
  await wait("document.querySelector('[data-testid=\"input-equipment-opening-0\"]')?.value === '432'");
  await sleep(500);
  if (!(await evaluate("document.querySelector('[data-testid=\"input-equipment-opening-0\"]').value === '432'"))) throw new Error("Reopen recalculated a persisted opening");
  await click("Return to sections");
  await click("Activity / Progress", false);
  await wait("!!document.querySelector('[data-testid=\"progress-0-item-select\"]')");
  await evaluate("document.querySelector('[data-testid=\"progress-0-item-select\"]').click()");
  await wait("!!document.querySelector('[data-testid=\"option-boq-item-8801\"]')");
  await evaluate("document.querySelector('[data-testid=\"option-boq-item-8801\"]').click()");
  await sleep(800);
  await click("Save & return");
  await wait("window.__Dpr13Fixture.snapshot.context.boqProjectId === 5501");
  if (!(await evaluate("window.__Dpr13Fixture.snapshot.dpr.id === 1301 && window.__Dpr13Fixture.snapshot.dpr.equipment[0].openingReading === 432 && window.__Dpr13Fixture.snapshot.dpr.progress[0].boqItemId === 8801"))) throw new Error("Null-project Equipment-first draft did not recover its unique BOQ project without losing Equipment");
  await screenshot("dpr13-null-project-recovery");

  const seedLegacy = async () => evaluate(`(() => {
    const s=structuredClone(window.__Dpr13Fixture.snapshot);
    s.context.workType='road'; s.context.boqProjectId=null;
    s.dpr={...s.dpr,workType:'road',boqProjectId:null,dprStatus:'draft',engineer:'SYNTHETIC LEGACY ENGINEER',
      equipment:[],labour:[],materials:[],sitePurchases:[],structureItems:[],cutFillConsumptions:[],remarks:'',
      progress:[{id:19101,entryKey:'synthetic-no-work',activity:'NO SITE WORK',noSiteWork:true,noSiteWorkDescription:'Synthetic weather',uom:'SQM',quantity:null,personnelIds:[]}]};
    s.headerToken='legacy-h0'; s.sectionTokens={activity:'legacy-a0',equipment:'legacy-e0',labour:'legacy-l0',materials:'legacy-m0'};
    window.__Dpr13Fixture.seed(s); sessionStorage.clear();
  })()`);
  await seedLegacy();
  await navigate("/site/edit/1301?draft&dpr13Legacy=1", "!!document.querySelector('[data-testid=\"button-save-draft-progress\"]')");
  await input('[data-testid="input-dpr-remarks"]', "SYNTHETIC STALE LOCAL EDIT");
  await evaluate("window.__Dpr13Fixture.remoteChange(); document.querySelector('[data-testid=\"button-save-draft-progress\"]').click()");
  await wait("window.__Dpr13Fixture.requests.some(r=>r.method==='PATCH')");
  if (!(await evaluate("window.__Dpr13Fixture.requests.find(r=>r.method==='PATCH').body.sectionTokens.equipment === 'legacy-e0' && document.querySelector('[data-testid=\"input-dpr-remarks\"]').value === 'SYNTHETIC STALE LOCAL EDIT'"))) throw new Error("Legacy SiteEdit masked a stale token or lost local edit");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='GET' && r.path==='/api/dprs/1301').length===1"))) throw new Error("Legacy SiteEdit fetched a fresh baseline at save");
  await screenshot("dpr13-legacy-siteedit-stale");
  await evaluate("sessionStorage.clear()");
  await navigate("/site/edit/1301?draft&dpr13Legacy=1", "!!document.querySelector('[data-testid=\"button-submit-dpr\"]')");
  await input('[data-testid="input-dpr-remarks"]', "SYNTHETIC LEGACY SUBMIT");
  await evaluate("document.querySelector('[data-testid=\"button-submit-dpr\"]').click()");
  await wait("window.__Dpr13Fixture.snapshot.dpr.dprStatus === 'submitted'");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='PATCH').length===1 && window.__Dpr13Fixture.requests.find(r=>r.path.endsWith('/submit')).body.sectionTokens.equipment.endsWith('legacy') && window.__Dpr13Fixture.snapshot.dpr.remarks === 'SYNTHETIC LEGACY SUBMIT'"))) throw new Error("Legacy SiteEdit submit did not persist then use returned tokens");
  await seedLegacy();
  await navigate("/guided?draftId=1301&section=review&dpr13Legacy=1", "!!document.querySelector('[data-testid=\"button-submit\"]')");
  await evaluate("window.__Dpr13Fixture.remoteChange(); document.querySelector('[data-testid=\"button-save-draft\"]').click()");
  await wait("window.__Dpr13Fixture.requests.some(r=>r.method==='PATCH')");
  if (!(await evaluate("window.__Dpr13Fixture.requests.find(r=>r.method==='PATCH').body.sectionTokens.equipment === 'legacy-e0'"))) throw new Error("Legacy Guided masked stale token");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='GET' && r.path==='/api/dprs/1301').length===1"))) throw new Error("Legacy Guided fetched a fresh baseline at save");
  await evaluate("sessionStorage.clear()");
  await navigate("/guided?draftId=1301&section=review&dpr13Legacy=1", "!!document.querySelector('[data-testid=\"button-submit\"]')");
  await evaluate("document.querySelector('[data-testid=\"button-submit\"]').click()");
  await wait("window.__Dpr13Fixture.snapshot.dpr.dprStatus === 'submitted'");
  if (!(await evaluate("window.__Dpr13Fixture.requests.filter(r=>r.method==='PATCH').length===1 && window.__Dpr13Fixture.requests.find(r=>r.path.endsWith('/submit')).body.sectionTokens.equipment.endsWith('legacy')"))) throw new Error("Legacy Guided submit did not use returned PATCH tokens");
  if (browserErrors.length) throw new Error(JSON.stringify(browserErrors));
  mkdirSync("tests/fixtures/dpr-site-entry/evidence", { recursive: true });
  const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync("tests/fixtures/dpr-site-entry/evidence/dpr13.png", Buffer.from(shot.data, "base64"));
  console.log("PASS DPR-13 synthetic browser fixture: independent sections/purchases, canonical reopen, null-project BOQ recovery, dirty/conflict/stale-submit guards, explicit chooser, photo retry identities, stoppage save/reopen/edit with evidence retry and preserved identities/metadata, field hydration/continuity, legacy SiteEdit/Guided snapshot-token PATCH then submit.");
} finally { socket.close(); }