// Development-only ordinary-user verification. No application permission logic changes.
// Start Chromium on 9234 and the running dev Node inspector on loopback 9229.
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
const root="reports/perm-babu01", uid=1900000300, trips=[1900000301,1900000302,1900000303];
const base="http://127.0.0.1:5000", site="THAKADPALLY - SIRUR";
const p=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});
const evidence=new Map(), save=(name,data)=>evidence.set(`${name}.json`,JSON.stringify(data,null,2));
const digest=rows=>({count:rows.length,sha256:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")});
const tables=["users","user_permissions","user_site_access","earthwork_arrangements","vendors"];
const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,digest((await p.query(`select * from ${t} order by id`)).rows)])));
async function connect(port){
 const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
 const ws=new WebSocket((targets.find(t=>t.type==="page")??targets[0]).webSocketDebuggerUrl);
 await new Promise(r=>ws.once("open",r));let n=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw),r=pending.get(m.id);if(r){pending.delete(m.id);m.error?r.reject(Error(m.error.message)):r.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++n;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??"Evaluation failed");return r.result?.value;};
 return {ws,call,evaluate};
}
await p.connect();assert.equal((await p.query("select current_database() n")).rows[0].n,"sitelog_dev");
const before=await snapshot();let inspector,browser,created=false,fenced=false;
const cookies={}, requests=[];
async function api(path,body,method=body?"POST":"GET"){
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of r.headers.getSetCookie()){const v=c.split(";")[0],i=v.indexOf("=");cookies[v.slice(0,i)]=v.slice(i+1);}
 const data=await r.json();requests.push({path,method,status:r.status,...(r.ok?{}:{data})});return {status:r.status,data};
}
const flags=async()=>{const row=(await p.query("select is_admin,is_owner,is_field_engineer,can_manage_permissions,setup_complete,all_sites_access from users where id=$1",[uid])).rows[0];for(const k of ["is_admin","is_owner","is_field_engineer","can_manage_permissions"])assert.equal(row[k],false);return row;};
const settings=async({selected=false,all=false,complete=true,edit=true})=>{
 await p.query("update users set all_sites_access=$2,setup_complete=$3 where id=$1",[uid,all,complete]);
 await p.query("update user_permissions set can_edit=$2 where user_id=$1",[uid,edit]);
 await p.query("delete from user_site_access where user_id=$1",[uid]);
 if(selected)await p.query("insert into user_site_access (id,user_id,site_id) values ($1,$1,16)",[uid]);
};
const filters={site,dateFrom:"2026-10-08",dateTo:"2026-10-08",vehicleNumber:"BABU01BULK",roleFilter:"all",onlyUnlinked:true,earthworkArrangementId:2};
async function operations(name,expected){
 await p.query("update site_material_trips set earthwork_arrangement_id=null where id=any($1::int[])",[trips]);
 const result={flags:await flags()};
 result.roles=await api(`/api/site-material-trips/${trips[0]}`,{materialSourceType:"own_source",materialSourceLabel:"BABU01 disposable borrow area",transportType:"in_house",internalEquipmentId:2},"PATCH");
 result.single=await api(`/api/site-material-trips/${trips[1]}`,{earthworkArrangementId:2},"PATCH");
 result.options=await api(`/api/site-material-trips/arrangement-options?site=${encodeURIComponent(site)}`);
 result.vendorOptions=await api(`/api/site-material-trips/vendor-options?site=${encodeURIComponent(site)}`);
 result.preview=await api("/api/site-material-trips/arrangement/preview",filters);
 result.bulk=await api("/api/site-material-trips/arrangement/bulk",{...filters,previewToken:result.preview.data.previewToken});
 for(const k of ["roles","single","options","vendorOptions","preview","bulk"])assert.equal(result[k].status,expected,`${name}/${k}: ${JSON.stringify(result[k])}`);
 result.rows=(await p.query("select id,material_source_type,material_source_label,transport_type,internal_equipment_id,earthwork_arrangement_id from site_material_trips where id=any($1::int[]) order by id",[trips])).rows;
 if(expected===200){assert.equal(result.rows[0].material_source_type,"own_source");assert.equal(result.rows[1].earthwork_arrangement_id,2);assert.equal(result.rows[2].earthwork_arrangement_id,2);}
 else assert(result.rows.every(r=>r.earthwork_arrangement_id===null));
 save(name,result);
}
try {
 assert.equal((await p.query("select id from users where id=$1",[uid])).rowCount,0);
 assert.equal((await p.query("select id from site_material_trips where id=any($1::int[])",[trips])).rowCount,0);
 inspector=await connect(9229);
 // Fence only notifications generated by our three uniquely identified trips.
 // Every other payload retains the original sender; no grants/settings are touched.
 assert.equal(await inspector.evaluate(`(()=>{
  if(globalThis.__permBabuFence)throw Error("Fence already installed");
  const sender=process.getBuiltinModule("module").createRequire(process.cwd()+"/package.json")("web-push");
  const original=sender.sendNotification,state={sender,original,blocked:[]};
  state.wrapper=function(subscription,payload,...args){
   let data;try{data=JSON.parse(payload)}catch{}
   if(data?.title==="Site Material Trip Updated"&&/^Trip #190000030[123] updated$/.test(data?.body??"")){
    state.blocked.push({title:data.title,body:data.body});
    return Promise.resolve({statusCode:204,body:"Disposable verification: delivery suppressed before network"});
   }
   return original.call(this,subscription,payload,...args);
  };
  sender.sendNotification=state.wrapper;globalThis.__permBabuFence=state;
  return sender.sendNotification===state.wrapper;
 })()`),true);fenced=true;
 const password=process.env.DEV_VERIFICATION_PASSWORD;assert(password,"Verification password secret required");
 await p.query("insert into users (id,email,password_hash,full_name) values ($1,'perm-babu01@test.invalid',$2,'Disposable ordinary verifier')",[uid,await bcrypt.hash(password,10)]);created=true;
 await p.query("insert into vendors (id,name) values ($1,'BABU01 DISPOSABLE TRANSPORTER')",[uid]);
 await p.query("insert into user_permissions (id,user_id,section_key,can_view,can_edit) values ($1,$1,'site_materials',true,true)",[uid]);
 for(const [index,id]of trips.entries())await p.query("insert into site_material_trips (id,date,site,material,quantity,uom,supplier,vehicle_number,material_source_type,material_source_label,transport_type,internal_equipment_id,boq_project_id,boq_item_id,receipt_number) values ($1,'2026-10-08',$2,'Selected Soil / Subgrade Material',600,'CFT','',$3,'own_source','Disposable source','in_house',2,2,1151,$4)",[id,site,index===2?"BABU01BULK":`BABU01-${index+1}`,`BABU01-${index+1}`]);
 let login=await api("/api/auth/login",{identifier:"perm-babu01@test.invalid",password});
 if(login.status===202){
  const devices=(await p.query("update user_devices set status='approved',approved_at=now() where user_id=$1 and status='pending' returning id",[uid])).rows;
  assert.equal(devices.length,1);save("devices",devices);
  login=await api("/api/auth/login",{identifier:"perm-babu01@test.invalid",password});
 }
 assert.equal(login.status,200);assert.equal((await api("/api/auth/me")).data.user.id,uid);
 await operations("P1-no-site",403);
 await settings({selected:true});await operations("P2-selected-site",200);
 await settings({all:true});await operations("A4-all-sites-only",200);
 await settings({selected:true,complete:false});await operations("A4-incomplete-selected-site",403);
 // Only setup_complete changes relative to the immediately preceding state.
 await p.query("update users set setup_complete=true where id=$1",[uid]);await operations("A4-complete-only",200);
 await settings({all:true,complete:false});await operations("A4-incomplete-all-sites",403);
 await settings({});await operations("P5-no-site",403);
 await settings({selected:true,edit:false});await operations("P6-no-edit",403);
 const denied={};
 for(const [name,path,method]of [["users","/api/auth/users","GET"],["permissions",`/api/auth/users/${uid}/permissions`,"GET"],["delete",`/api/site-material-trips/${trips[0]}`,"DELETE"]]){
  denied[name]=await api(path,undefined,method);assert.equal(denied[name].status,403);
 }
 save("P4-denied",denied);
 await settings({selected:true});
 const grants=(await p.query("select section_key,can_view,can_edit,can_delete,can_export,can_notify from user_permissions where user_id=$1",[uid])).rows;
 assert(grants.every(g=>!g.can_delete&&!g.can_export&&!g.can_notify));save("P3-flags-and-grants",{flags:await flags(),grants});
 browser=await connect(9234);const {call,evaluate}=browser;
 await call("Network.enable");const browserResponses=[];
 browser.ws.on("message",raw=>{const m=JSON.parse(raw);if(m.method==="Network.responseReceived"&&m.params.response.url.includes("/api/"))browserResponses.push({path:m.params.response.url.replace(base,""),status:m.params.response.status});});
 await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 for(const[name,value]of Object.entries(cookies))await call("Network.setCookie",{name,value,url:base});
 const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error("Timeout: "+expression);};
 const click=async selector=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})`);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event("input",{bubbles:true}));})()`);
 const shot=async name=>{await new Promise(r=>setTimeout(r,650));evidence.set(`${name}.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));};
 await call("Page.navigate",{url:base+"/site/material-trips"});
 await click('[data-testid=select-filter-site]');
 await wait(`Array.from(document.querySelectorAll('[role=option]')).some(e=>e.textContent.includes(${JSON.stringify(site)}))`);
 await evaluate(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes(${JSON.stringify(site)})).click()`);
 await fill('[data-testid=input-filter-date-from]',"2026-10-08");await fill('[data-testid=input-filter-date-to]',"2026-10-08");
 await fill('[data-testid=input-filter-vehicle]',"");
 await click(`[data-testid=button-edit-trip-roles-${trips[0]}]`);
 await fill('[data-testid=input-edit-trip-material-source-label]',"BABU01 ordinary UI saved source");
 const vendorOptions=await api(`/api/site-material-trips/vendor-options?site=${encodeURIComponent(site)}`);
 const vendor=vendorOptions.data.find(v=>v.isActive);
 assert(vendor,"An existing active vendor is required");
 await evaluate(`Array.from(document.querySelectorAll('[data-testid=dialog-trip-roles] label')).find(e=>e.textContent.includes('Another transporter')).click()`);
 await fill('[data-testid=input-edit-trip-supplier]',vendor.name);
 await shot("P2-role-editor");await click('[data-testid=button-save-trip-roles]');
 await wait(`!document.querySelector('[data-testid=dialog-trip-roles]')`);
 assert.equal((await p.query("select material_source_label from site_material_trips where id=$1",[trips[0]])).rows[0].material_source_label,"BABU01 ordinary UI saved source");
 assert.equal((await p.query("select supplier,transport_type,internal_equipment_id from site_material_trips where id=$1",[trips[0]])).rows[0].supplier,vendor.name);
 await shot("P2-role-saved");
 await click(`[data-testid=button-edit-trip-roles-${trips[1]}]`);
 await click('[data-testid=edit-trip-work-context-select-arrangement]');
 await evaluate(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes("narasimulu")).click()`);
 await shot("P2-single-editor");await click('[data-testid=button-save-trip-roles]');
 await wait(`!document.querySelector('[data-testid=dialog-trip-roles]')`);
 assert.equal((await p.query("select earthwork_arrangement_id from site_material_trips where id=$1",[trips[1]])).rows[0].earthwork_arrangement_id,2);
 await shot("P2-single-saved");
 await fill('[data-testid=input-filter-vehicle]',"BABU01BULK");
 await evaluate(`document.querySelector('[data-testid=bulk-arrangement-tool]').open=true;document.querySelector('[data-testid=bulk-arrangement-tool]').dispatchEvent(new Event('toggle'))`);
 await wait(`!!document.querySelector('select[aria-label="Bulk Execution Arrangement"] option[value="2"]')`);
 await evaluate(`(()=>{const e=document.querySelector('select[aria-label="Bulk Execution Arrangement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(e,'2');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await wait(`document.querySelector('[data-testid=arrangement-eligible-count]')?.textContent.includes('1 eligible trips')`);
 await evaluate(`document.querySelector('[data-testid=bulk-arrangement-tool]').scrollIntoView({block:'center'});Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Link 1 eligible trips').click()`);
 await wait(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Confirm arrangement links')`);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Confirm arrangement links').click()`);
 await wait(`document.body.innerText.includes('Linked 1 trips.')`);await shot("P2-bulk-saved");
 assert.equal((await p.query("select earthwork_arrangement_id from site_material_trips where id=$1",[trips[2]])).rows[0].earthwork_arrangement_id,2);
 save("P2-ui-readback",(await p.query("select id,material_source_type,material_source_label,supplier,transport_type,internal_equipment_id,earthwork_arrangement_id from site_material_trips where id=any($1::int[]) order by id",[trips])).rows);
 // Exercise scope refusal from a still-open ordinary editor, not just a hidden page.
 await fill('[data-testid=input-filter-vehicle]',"");await click(`[data-testid=button-edit-trip-roles-${trips[0]}]`);
 await settings({});await click('[data-testid=button-save-trip-roles]');
 await wait(`Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.textContent.includes('Access denied for this site'))`);await shot("P1-P5-site-denied");
 await settings({selected:true,edit:false});await click('[data-testid=button-save-trip-roles]');
 await wait(`Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.textContent.includes('403') && !e.textContent.includes('Access denied for this site'))`);await shot("P6-edit-denied");
 await call("Page.navigate",{url:base+"/admin/users"});await wait(`document.body?.innerText.includes("No access")`);await shot("P4-user-management-denied");
 save("browser-responses",browserResponses);
 save("P3-final-flags",await flags());
}finally{
 browser?.ws.close();
 if(fenced){
  await new Promise(r=>setTimeout(r,1000));
  save("notification-fence",await inspector.evaluate(`(()=>{const s=globalThis.__permBabuFence;if(!s)throw Error("Missing fence");s.sender.sendNotification=s.original;const result={blocked:s.blocked,restored:s.sender.sendNotification===s.original,scope:"Only the three disposable trip IDs; no network delivery for these payloads"};delete globalThis.__permBabuFence;return result;})()`));
 }
 inspector?.ws.close();
 if(created){
  save("removed",{userId:uid,tripIds:trips,permissionIds:(await p.query("select id from user_permissions where user_id=$1",[uid])).rows,siteAccessIds:[uid],deviceIds:(await p.query("select id from user_devices where user_id=$1",[uid])).rows,sessionCount:(await p.query("select count(*) from user_sessions where user_id=$1",[uid])).rows[0].count});
  await p.query("delete from audit_logs where module='site_material_trips' and user_id=$1 and transaction_id=any($2::int[])",[uid,trips]);
  await p.query("delete from site_material_trips where id=any($1::int[])",[trips]);
  await p.query("delete from vendors where id=$1 and name='BABU01 DISPOSABLE TRANSPORTER'",[uid]);
  await p.query(`update app_settings set value=(value::jsonb - 'BABU011')::text
    where key='site_material_vehicle_supplier_associations.v1'
    and value::jsonb->'BABU011'->>'supplier'='BABU01 DISPOSABLE TRANSPORTER'`);
  await p.query("delete from user_sessions where user_id=$1",[uid]);
  await p.query("delete from user_devices where user_id=$1",[uid]);
  await p.query("delete from user_site_access where user_id=$1",[uid]);
  await p.query("delete from user_permissions where user_id=$1",[uid]);
  await p.query("delete from users where id=$1",[uid]);
 }
 const after=await snapshot();save("integrity",{before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)});save("requests",requests);
 await p.end();fs.mkdirSync(root,{recursive:true});for(const[name,value]of evidence)fs.writeFileSync(`${root}/${name}`,value);
 assert.deepEqual(after,before);
}
