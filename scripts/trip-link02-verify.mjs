// Ordinary signed-in browser verification, disposable development fixtures only.
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import WebSocket from "ws";
const p=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
const base="http://127.0.0.1:5000",out="reports/trip-link02",f=1900000200;
fs.mkdirSync(out,{recursive:true});
const evidence=new Map();
const save=(name,data)=>evidence.set(`${name}.json`,JSON.stringify(data,null,2));
const hash=rows=>({count:rows.length,checksum:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")});
await p.connect();
const check=async()=>assert.equal((await p.query("select current_database() n")).rows[0].n,"sitelog_dev");
await check();console.log("Before writes: current_database() = sitelog_dev");
const snapshot=async()=>({trips:(await p.query("select * from site_material_trips order by id")).rows,arrangements:(await p.query("select * from earthwork_arrangements order by id")).rows});
const baseline=await snapshot(),cookies={};let ws,deviceId,created=false;
const priorDevices=(await p.query("select id from user_devices where user_id=16")).rows.map(r=>r.id);
const api=async(path,body,method=body?"POST":"GET")=>{
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of r.headers.getSetCookie()){const v=c.split(";")[0],i=v.indexOf("=");cookies[v.slice(0,i)]=v.slice(i+1);}
 return {path,status:r.status,data:await r.json()};
};
try{
 const password=process.env.DEV_VERIFICATION_PASSWORD;if(!password)throw Error("Verification secret missing");
 const body={identifier:"agent.verification@test.invalid",password,deviceLabel:"TRIP-LINK-02 disposable verifier"};
 let login=await api("/api/auth/login",body);
 if(login.status===202){
  const tokens=Object.values(cookies).map(v=>decodeURIComponent(v).split(".")[0]);
  const rows=(await p.query("select id from user_devices where user_id=16 and status='pending' and device_token=any($1::text[])",[tokens])).rows;
  assert.equal(rows.length,1);deviceId=rows[0].id;assert(!priorDevices.includes(deviceId));await check();
  await p.query("update user_devices set status='approved',approved_at=now() where id=$1 and user_id=16 and status='pending'",[deviceId]);
  login=await api("/api/auth/login",body);
 }
 assert.equal(login.status,200);const me=await api("/api/auth/me");assert.equal(me.data.user.id,16);
 save("login",{status:login.status,userId:16});
 // All status history is initial fixture data; no arrangement is updated.
 for(const table of ["boq_projects","boq_items","earthwork_arrangements","site_material_trips"])
  assert.equal((await p.query(`select id from ${table} where id between $1 and $2`,[f,f+20])).rows.length,0);
 await p.query("BEGIN");
 try{
  await p.query("insert into boq_projects select (jsonb_populate_record(null::boq_projects,to_jsonb(t)||jsonb_build_object('id',$1::int,'site_id',16,'name','TRIP LINK02 DISPOSABLE'))).* from boq_projects t where id=2",[f]);
  await p.query("insert into boq_items select (jsonb_populate_record(null::boq_items,to_jsonb(t)||jsonb_build_object('id',$1::int,'boq_project_id',$1::int,'description','TRIP LINK02 DISPOSABLE'))).* from boq_items t where boq_project_id=2 limit 1",[f]);
  const history=[{eventType:"status_change",previousStatus:"draft",status:"approved",effectiveFrom:"2026-06-01"},{eventType:"status_change",previousStatus:"approved",status:"cancelled",effectiveFrom:"2026-10-02"}];
  for(const [n,status]of [[10,"approved"],[11,"draft"],[12,"cancelled"]])
   await p.query("insert into earthwork_arrangements (id,boq_project_id,boq_item_id,material_label,agency_name,arrangement_type,status,revision_history) values ($1,$2,$2,'Soil',$3,'hlc_source_outsourced_execution',$4,$5)",[f+n,f,`LINK02 ${status}`,status,JSON.stringify(n===12?history:[])]);
  for(const [n,date,vehicle,link]of [[1,"2026-10-08","LINK02P1",null],[2,"2026-10-08","LINK02P2",null],[3,"2026-10-01","LINK02P3",null],[4,"2026-10-03","LINK02P3",null],[5,"2026-10-03","LINK02P6",f+12]])
   await p.query("insert into site_material_trips (id,date,site,material,quantity,uom,supplier,vehicle_number,material_source_type,transport_type,internal_equipment_id,boq_project_id,boq_item_id,earthwork_arrangement_id,receipt_number) values ($1,$2,'THAKADPALLY - SIRUR','Soil',600,'CFT','',$3,'own_source','in_house',2,$4,$4,$5,$6)",[f+n,date,vehicle,f,link,`LINK02-${n}`]);
  await p.query("COMMIT");created=true;
 }catch(e){await p.query("ROLLBACK");throw e;}
 const before=await snapshot();
 const target=(await(await fetch("http://127.0.0.1:9234/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let seq=0;const pending=new Map(),responses=[];
 ws.on("message",raw=>{const m=JSON.parse(raw),v=pending.get(m.id);if(v){pending.delete(m.id);m.error?v.reject(Error(m.error.message)):v.resolve(m.result);}if(m.method==="Network.responseReceived"&&m.params.response.url.includes("/api/"))responses.push({url:m.params.response.url.replace(base,""),status:m.params.response.status});});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true})).result?.value;
 const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error("Timeout: "+expression);};
 const click=async selector=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event("input",{bubbles:true}));})()`);
 const shot=async name=>{await new Promise(r=>setTimeout(r,600));evidence.set(`${name}.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));};
 for(const[name,value]of Object.entries(cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Emulation.setDeviceMetricsOverride",{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await call("Network.enable");
 await call("Page.navigate",{url:base+"/site/material-trips"});
 await click('[data-testid=select-filter-site]');
 await evaluate(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes('THAKADPALLY - SIRUR')).click()`);
 await fill('[data-testid=input-filter-date-from]',"2026-10-01");
 await fill('[data-testid=input-filter-date-to]',"2026-10-08");
 await fill('[data-testid=input-filter-vehicle]',"LINK02P1");
 await wait(`document.body.innerText.includes('LINK02-1')`);
 await evaluate(`document.querySelector('[data-testid=bulk-arrangement-tool]').open=true`);
 // React toggle handler controls the lazy options query.
 await evaluate(`document.querySelector('[data-testid=bulk-arrangement-tool]').dispatchEvent(new Event('toggle'))`);
 const choose=async n=>{
  await wait(`!!document.querySelector('select[aria-label="Bulk Execution Arrangement"] option[value="${f+n}"]')`);
  await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Bulk Execution Arrangement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(e,'${f+n}');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 };
 await choose(10);
 await wait(`document.querySelector('[data-testid=arrangement-eligible-count]')?.textContent.includes('1 eligible trips')`);
 await evaluate(`document.querySelector('[data-testid=bulk-arrangement-tool]').scrollIntoView({block:'center'})`);
 const bulkSave=async()=>{
  await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Link 1 eligible trips').click()`);
  await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Confirm arrangement links')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Confirm arrangement links').click()`);
  await wait(`document.body.innerText.includes('Linked 1 trips.')`);
 };
 await bulkSave();await shot("P1-approved");
 // Native disabled options remain disabled; API refusal is separately exercised.
 const optionStates=await evaluate(`Array.from(document.querySelector('select[aria-label="Bulk Execution Arrangement"]').options).filter(o=>Number(o.value)>=${f}).map(o=>({value:o.value,text:o.text,disabled:o.disabled}))`);
 assert.equal(optionStates.find(o=>Number(o.value)===f+11).disabled,true);save("P4-options",optionStates);
 await shot("P4-selector");
 const filters={site:"THAKADPALLY - SIRUR",dateFrom:"2026-10-01",dateTo:"2026-10-08",vehicleNumber:"LINK02P2",roleFilter:"all",onlyUnlinked:true};
 const preview=await api("/api/site-material-trips/arrangement/preview",{...filters,earthworkArrangementId:f+11});
 const rejected=await api("/api/site-material-trips/arrangement/bulk",{...filters,earthworkArrangementId:f+11,previewToken:preview.data.previewToken});
 assert.equal(rejected.status,400);save("P2-refused",rejected);
 await fill('[data-testid=input-filter-vehicle]',"LINK02P2");await choose(12);
 await wait(`document.querySelector('[data-testid=arrangement-eligible-count]')?.textContent.includes('0 eligible trips') && document.querySelector('[data-testid=arrangement-excluded-count]')?.textContent.includes('1 trips excluded')`);
 await shot("P2-refused");
 await fill('[data-testid=input-filter-vehicle]',"LINK02P3");await choose(12);
 await wait(`document.querySelector('[data-testid=arrangement-excluded-count]')?.textContent.includes('1 trips excluded')`);
 await shot("P3-preview");await bulkSave();await shot("P3-saved");
 await evaluate("window.scrollBy(0,300)");await shot("P3-rows");
 const cancelledRefusal=await api("/api/site-material-trips/arrangement/bulk",{...filters,earthworkArrangementId:f+12});
 assert.equal(cancelledRefusal.status,400);save("P2-cancelled-refused",cancelledRefusal);
 await fill('[data-testid=input-filter-vehicle]',"LINK02P6");await wait(`document.body.innerText.includes('LINK02-5')`);
 await wait(`document.body.innerText.includes('Historical arrangement:')`);await shot("P6-preserved");
 await fill('[data-testid=input-filter-vehicle]',"LINK02P2");await click(`[data-testid=button-edit-trip-roles-${f+2}]`);
 await click('[data-testid=edit-trip-work-context-select-arrangement]');await shot("P5-roles");
 save("P5-role-options",await evaluate(`Array.from(document.querySelectorAll('[role=option]')).map(e=>({text:e.textContent,disabled:e.getAttribute('aria-disabled')}))`));
 const deniedRoles=await api(`/api/site-material-trips/${f+2}`,{earthworkArrangementId:f+11},"PATCH");
 assert.equal(deniedRoles.status,400);save("P5-roles-rejected",deniedRoles);
 await call("Page.navigate",{url:base+"/site/materials-received"});
 await wait(`!!document.querySelector('[data-testid=input-date-from]')`);
 await fill('[data-testid=input-date-from]',"2026-10-01");await fill('[data-testid=input-date-to]',"2026-10-08");
 await click(`[data-testid=button-view-${f+2}]`);
 await click('[data-testid=btn-admin-edit]');
 await click('[data-testid=received-edit-work-ctx-select-arrangement]');await shot("P5-materials-received");
 const deniedReceipt=await api(`/api/site-material-trips/${f+2}`,{earthworkArrangementId:f+12},"PATCH");
 assert.equal(deniedReceipt.status,400);save("P5-received-rejected",deniedReceipt);
 const after=await snapshot(),changes=[];
 assert.deepEqual(after.arrangements,before.arrangements);
 for(const old of before.trips){
  const row=after.trips.find(r=>r.id===old.id);
  const columns=Object.keys(old).filter(k=>JSON.stringify(old[k])!==JSON.stringify(row[k]));
  if(columns.length){assert.deepEqual(columns,["earthwork_arrangement_id"]);changes.push({id:old.id,columns,before:old.earthwork_arrangement_id,after:row.earthwork_arrangement_id});}
 }
 assert.deepEqual(changes.map(c=>c.id),[f+1,f+3]);
 save("integrity",{before:{trips:hash(before.trips),arrangements:hash(before.arrangements)},after:{trips:hash(after.trips),arrangements:hash(after.arrangements)},changes,fixtureRows:after.trips.filter(r=>r.id>f&&r.id<f+10)});
 save("responses",responses);
}finally{
 ws?.close();await check();
 if(created){
  await p.query("delete from audit_logs where module='site_material_trips' and transaction_id between $1 and $2 and user_id=16",[f+1,f+5]);
  await p.query("delete from site_material_trips where id between $1 and $2",[f+1,f+5]);
  await p.query("delete from earthwork_arrangements where id between $1 and $2 and boq_project_id=$3",[f+10,f+12,f]);
  await p.query("delete from boq_items where id=$1 and boq_project_id=$1",[f]);
  await p.query("delete from boq_projects where id=$1",[f]);
 }
 if(deviceId){await p.query("delete from user_sessions where device_id=$1 and user_id=16",[deviceId]);await p.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);}
 const final=await snapshot();assert.deepEqual(final,baseline);
 save("cleanup",{baseline:{trips:hash(baseline.trips),arrangements:hash(baseline.arrangements)},final:{trips:hash(final.trips),arrangements:hash(final.arrangements)},removed:{project:f,item:f,trips:[1,2,3,4,5].map(n=>f+n),arrangements:[10,11,12].map(n=>f+n),deviceId},preExistingRowsUnchanged:true});
 await p.end();
 for(const [name,data]of evidence)fs.writeFileSync(`${out}/${name}`,data);
}
