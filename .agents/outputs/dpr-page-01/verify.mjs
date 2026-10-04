import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {go,shot,evaluate,call,click,tid,api,save,close,sleep,out} from "./browser.mjs";
const seed=JSON.parse(await fs.readFile(`${out}/seeded-records.json`));
const evidence={signedInDevelopment:true,seededDevelopmentRecords:true,apiMocking:false,checks:[]};
async function text(){return evaluate('document.querySelector(".dpr-management")?.innerText || ""');}
async function load(id,width=1280){
  await call("Emulation.setDeviceMetricsOverride",{width,height:1000,deviceScaleFactor:1,mobile:width<640});
  await go(`/site/report/${id}`);await sleep(6000);
  assert((await text()).includes("Remarks / hold-ups"),"report not loaded");
}
try{
  assert.equal((await api("/api/dprs/"+seed.mainId)).status,200);
  await load(seed.mainId);
  let t=await text();
  for(const expected of ["56.25 Cum","412 / 900 Cum (46%)","past planned end","10.5 L/hr","▲16%","▼60% check","▲14%","20.5 L used","25.8 L expected","141.03 MT","Stretch (used on site)","— none recorded —"])assert(t.includes(expected),expected);
  assert(!/Details|Canonical|Lifecycle|Machine day|Physical measurement|Recorded quantity|meter vs clock/.test(t),"audit wording leaked");
  assert(!/\d+\.\d{3}\b/.test(t),"three-decimal value");
  assert.equal(await evaluate('document.querySelectorAll(".equipment-legend").length'),1);
  await shot("A-main-desktop",true);
  await save("main-rendered-text",t);
  evidence.checks.push("A/F/H real signed-in development main report, quantities/totals/legend/remarks");
  await call("Emulation.setEmulatedMedia",{media:"print"});
  await shot("J-print-preview",true);
  const pdf=await call("Page.printToPDF",{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
  await fs.writeFile(`${out}/J-main.pdf`,Buffer.from(pdf.data,"base64"));
  await call("Emulation.setEmulatedMedia",{media:""});
  // Intercept only external sharing, never API/report data, to capture exact text safely.
  await evaluate(`window.__shareEvidence={};Object.defineProperty(navigator,"share",{configurable:true,value:undefined});window.open=(url)=>{window.__shareEvidence.url=url;return null};Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__shareEvidence.text=text}}})`);
  await click(tid("button-share-whatsapp"));await sleep(500);
  const share=await evaluate("window.__shareEvidence");
  assert(share.url.startsWith("https://wa.me/?text="));assert(share.text.includes("42 L"));assert(share.text.includes("141.03 MT"));assert((await evaluate("document.body.innerText")).includes("DPR summary copied"));
  await save("K-share-output",share);await shot("K-share-copy-confirmation",true);
  evidence.checks.push("K actual Share control, wa.me URL and clipboard fallback text captured; external send not performed");
  await load(seed.mainId,390);
  assert(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),"main phone overflow");
  await shot("A-main-phone",true);
  await load(seed.edgeId);
  t=await text();
  for(const expected of ["▲15%","▼12% check","Rain stopped work","Hydraulic repair","km/L","82","Yard (stock)","Rain delayed the afternoon shift.","Reusable 8","BOQ credit 24"])assert(t.includes(expected),expected);
  const rows=await evaluate('[...document.querySelectorAll("[data-testid^=row-equipment-]")].map(e=>e.innerText)');
  assert(!/[▲▼]/.test(rows.find(x=>x.includes("Norm test 3"))),"within-norm mark shown");
  assert(!rows.find(x=>x.includes("Idle machine")).includes("L/hr"),"idle consumption");
  assert(!rows.find(x=>x.includes("Breakdown machine")).includes("L/hr"),"breakdown consumption");
  assert(rows.find(x=>x.includes("Missing closing")).includes("no closing reading"),"missing closing reason");
  const programmeCells=await evaluate('[...document.querySelectorAll("[data-label=Programme]")].map(x=>x.textContent.trim())');
  assert(programmeCells.every(x=>x===""),"unlinked programme should be empty");
  await shot("B-H-edge-desktop",true);await save("edge-rendered-text",t);
  evidence.checks.push("B-H edge report: unlinked programme, differing credit, earthwork line, flags, missing closing, idle/breakdown, vehicle, labour hours/tasks, yard, remarks");
  await load(seed.edgeId,390);assert(await evaluate("document.documentElement.scrollWidth<=window.innerWidth"),"edge phone overflow");await shot("B-H-edge-phone",true);
  await save("browser-verification",evidence);
  console.log(evidence);
}finally{await close();}