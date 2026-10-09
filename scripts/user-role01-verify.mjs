// Development-only acceptance using disposable accounts and ordinary auth.
// Run: node --import tsx scripts/user-role01-verify.mjs
// Requires Chromium CDP :9234 and the dev Node inspector :9229.
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
import { applyRoleTemplate, fullMatrix } from "../shared/permissions.ts";
const out="reports/user-role01", id=1900000700, base="http://127.0.0.1:5000";
fs.mkdirSync(out,{recursive:true});
const p=new pg.Client({connectionString:process.env.DEV_DATABASE_URL});await p.connect();
assert.equal((await p.query("select current_database() name")).rows[0].name,"sitelog_dev");
assert(process.env.DEV_VERIFICATION_PASSWORD,"Development verification secret required");
const save=(name,value)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2));
const tables=["users","user_permissions","user_site_access","sites","boq_projects","boq_items","earthwork_arrangements","site_material_trips","vendors","vendor_bills","vendor_bill_items"];
const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>{
 const rows=(await p.query(`select * from ${table} order by id`)).rows;
 return [table,{count:rows.length,sha256:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")}];
})));
const before=await snapshot();save("integrity-before",before);
const accounts=[id], tripIds=[]; let inspector,browser;
const newClient=()=>({cookies:{}});
async function api(client,path,body,method=body?"POST":"GET"){
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(client.cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const cookie of r.headers.getSetCookie()){const v=cookie.split(";")[0],i=v.indexOf("=");client.cookies[v.slice(0,i)]=v.slice(i+1);}
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={text:text.slice(0,200)}}
 return {status:r.status,data};
}
async function login(client,email,uid){
 let r=await api(client,"/api/auth/login",{identifier:email,password:process.env.DEV_VERIFICATION_PASSWORD});
 if(r.status===202){
  const tokens=Object.values(client.cookies).map(v=>decodeURIComponent(v).split(".")[0].replace(/^s:/,""));
  const pending=(await p.query("select id from user_devices where user_id=$1 and status='pending' and device_token=any($2::text[])",[uid,tokens])).rows;
  assert.equal(pending.length,1);
  await p.query("update user_devices set status='approved',approved_at=now() where id=$1",[pending[0].id]);
  r=await api(client,"/api/auth/login",{identifier:email,password:process.env.DEV_VERIFICATION_PASSWORD});
 }
 assert.equal(r.status,200,JSON.stringify(r.data));return client;
}
async function connect(port){
 const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();
 const ws=new WebSocket((targets.find(t=>t.type==="page")??targets[0]).webSocketDebuggerUrl);
 await new Promise(r=>ws.once("open",r));let n=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const rid=++n;pending.set(rid,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id:rid,method,params}));});
 const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result?.value;};
 return {ws,call,evaluate};
}
async function clone(table,from,patch){
 const row=(await p.query(`select to_jsonb(t) value from ${table} t where id=$1`,[from])).rows[0]?.value;
 assert(row,`Missing ${table} template`);
 await p.query(`insert into ${table} select * from jsonb_populate_record(null::${table},$1::jsonb)`,[JSON.stringify({...row,...patch})]);
}
try{
 const hash=await bcrypt.hash(process.env.DEV_VERIFICATION_PASSWORD,10);
 await p.query("insert into users(id,email,full_name,password_hash,is_admin,is_owner,setup_complete,notifications_enabled) values($1,'userrole01-admin@test.invalid','USERROLE01 Admin',$2,true,false,true,false)",[id,hash]);
 for(const [siteId,name]of [[id,"USERROLE01 A"],[id+1,"USERROLE01 B"]])
  await p.query("insert into sites(id,name,is_active) values($1,$2,1)",[siteId,name]);
 await clone("boq_projects",2,{id,site_id:id,name:"USERROLE01 Project"});
 await clone("boq_items",1151,{id,boq_project_id:id,item_code:"USERROLE01",category_id:null});
 await clone("earthwork_arrangements",2,{id,boq_project_id:id,boq_item_id:id,agency_name:"USERROLE01 Agency",status:"approved",scope_segment_ids:null});
 const admin=await login(newClient(),"userrole01-admin@test.invalid",id);
 const roles=["operations_director","project_manager","site_engineer","site_supervisor","stores_procurement","equipment_plant","billing_measurements","viewer"];
 const mappings={};let opsId;
 for(const role of roles){
  const created=await api(admin,"/api/auth/users",{email:`userrole01-${role}@test.invalid`,fullName:`USERROLE01 ${role}`,password:process.env.DEV_VERIFICATION_PASSWORD,roleTemplate:role,isAdmin:false,siteAccess:{mode:"selected",siteIds:[id]},notificationsEnabled:false});
  assert.equal(created.status,201,JSON.stringify(created.data));accounts.push(created.data.id);
  assert.equal(created.data.setupOk,true);assert.equal(created.data.isAdmin,false);assert.equal(created.data.isOwner,false);
  const perms=await api(admin,`/api/auth/users/${created.data.id}/permissions`);
  assert.equal(perms.status,200);assert.deepEqual(perms.data.matrix,applyRoleTemplate(role));
  mappings[role]={userId:created.data.id,createStatus:created.status,...perms.data};
  if(role==="operations_director")opsId=created.data.id;
 }
 const adminCreated=await api(admin,"/api/auth/users",{email:"userrole01-newadmin@test.invalid",fullName:"USERROLE01 New Administrator",password:process.env.DEV_VERIFICATION_PASSWORD,isAdmin:true,siteAccess:{mode:"all"}});
 assert.equal(adminCreated.status,201);accounts.push(adminCreated.data.id);assert.equal(adminCreated.data.isOwner,false);assert.equal(adminCreated.data.isAdmin,true);
 const adminPerms=await api(admin,`/api/auth/users/${adminCreated.data.id}/permissions`);
 assert.deepEqual(adminPerms.data.matrix,fullMatrix());
 mappings.administrator={userId:adminCreated.data.id,createStatus:201,...adminPerms.data};
 save("role-mappings",mappings);
 const ops=await login(newClient(),"userrole01-operations_director@test.invalid",opsId);
 const denials=[];
 for(const [path,body,method]of [
  ["/api/auth/users",null,"GET"],["/api/auth/users",{fullName:"Forbidden"},"POST"],
  [`/api/auth/users/${accounts.at(-1)}/permissions`,mappings.viewer.matrix,"PUT"],
  ["/api/admin/branding",{},"POST"],["/api/admin/licensed-modules",{},"POST"],["/api/site-material-trips/0",null,"DELETE"],
 ]){
  const r=await api(ops,path,body,method);denials.push({path,method,status:r.status});
  assert.equal(r.status,403,JSON.stringify({path,...r}));
 }
 save("backend-denials",denials);
 inspector=await connect(9229);
 await inspector.evaluate(`(()=>{const s=process.getBuiltinModule("module").createRequire(process.cwd()+"/package.json")("web-push"),original=s.sendNotification;globalThis.__userrole01={s,original,ids:[],blocked:0};s.sendNotification=function(sub,payload,...args){let d;try{d=JSON.parse(payload)}catch{}const t=globalThis.__userrole01;if((d?.title==="Site Material Trip Added"&&d.body?.includes("USERROLE01"))||(d?.title==="Site Material Trip Updated"&&t.ids.some(id=>d.body==="Trip #"+id+" updated"))){t.blocked++;return Promise.resolve({statusCode:204})}return original.call(this,sub,payload,...args)}})()`);
 const payload={date:"2026-10-09",site:"USERROLE01 A",material:"Soil",quantity:600,uom:"CFT",supplier:"USERROLE01 Agency",vehicleNumber:"USERROLE01",materialSourceType:"own_source",materialSourceLabel:"USERROLE01 Borrow area",transportType:"agency_vendor",boqProjectId:id,boqItemId:id};
 const created=await api(ops,"/api/site-material-trips",payload);save("trip-create",created);
 assert.equal(created.status,201);tripIds.push(created.data.id);
 await inspector.evaluate(`globalThis.__userrole01.ids=${JSON.stringify(tripIds)}`);
 const edit=await api(ops,`/api/site-material-trips/${tripIds[0]}`,{materialSourceLabel:"USERROLE01 corrected source",earthworkArrangementId:id},"PATCH");
 save("trip-edit-and-link",edit);assert.equal(edit.status,200);
 const options=await api(ops,"/api/site-material-trips/arrangement-options?site=USERROLE01%20A");
 save("ordinary-arrangement-options",options);assert.equal(options.status,200);assert(options.data.some(a=>a.id===id));
 const outside=await api(ops,"/api/site-material-trips",{...payload,site:"USERROLE01 B"});
 save("other-site-refused",outside);assert.equal(outside.status,403);
 const duplicate=await api(ops,"/api/site-material-trips",{...payload,vehicleNumber:"USERROLE01 BULK"});
 assert.equal(duplicate.status,201);tripIds.push(duplicate.data.id);
 await inspector.evaluate(`globalThis.__userrole01.ids=${JSON.stringify(tripIds)}`);
 const filters={site:"USERROLE01 A",dateFrom:"2026-10-09",dateTo:"2026-10-09",vehicleNumber:"USERROLE01 BULK",roleFilter:"all",onlyUnlinked:true,earthworkArrangementId:id};
 const preview=await api(ops,"/api/site-material-trips/arrangement/preview",filters);
 save("bulk-preview",preview);assert.equal(preview.status,200);
 const bulk=await api(ops,"/api/site-material-trips/arrangement/bulk",{...filters,previewToken:preview.data.previewToken});
 save("bulk-apply",bulk);assert.equal(bulk.status,200);
 // Site scope is independent: only our disposable user is changed.
 assert.equal((await api(admin,`/api/auth/users/${opsId}/site-access`,{siteIds:[],allSites:false},"PUT")).status,200);
 const noSites=await api(ops,"/api/site-material-trips?site=USERROLE01%20A");
 save("no-site",noSites);assert.equal(noSites.status,200);assert.deepEqual(noSites.data,[]);
 assert.equal((await api(admin,`/api/auth/users/${opsId}/site-access`,{siteIds:[id],allSites:false},"PUT")).status,200);
 await p.query("update users set setup_complete=false where id=$1",[opsId]);
 const incomplete=await api(ops,"/api/site-material-trips?site=USERROLE01%20A");save("incomplete-setup",incomplete);assert.deepEqual(incomplete.data,[]);
 await p.query("update users set setup_complete=true where id=$1",[opsId]);
 browser=await connect(9234);await browser.call("Network.enable");
 for(const[name,value]of Object.entries(admin.cookies))await browser.call("Network.setCookie",{name,value,url:base});
 await browser.call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await browser.call("Page.navigate",{url:base+"/admin/users"});
 const wait=async expression=>{for(let n=0;n<120;n++){if(await browser.evaluate(expression))return;await new Promise(r=>setTimeout(r,500));}throw Error("UI timeout "+expression);};
 await wait(`document.body?.innerText.includes("USERROLE01")`);
 const click=async selector=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})`);await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
 const fill=async(selector,value)=>{await wait(`!!document.querySelector(${JSON.stringify(selector)})`);await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()`);};
 const shot=async name=>{await new Promise(r=>setTimeout(r,500));fs.writeFileSync(`${out}/${name}.jpg`,Buffer.from((await browser.call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));};
 fs.writeFileSync(`${out}/user-management.jpg`,Buffer.from((await browser.call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));
 save("signed-in-ui",{text:await browser.evaluate("document.body.innerText")});
 await click('[data-testid="button-create-user"]');
 await fill('[data-testid="input-new-fullname"]',"USERROLE01 UI Account");
 await fill('[data-testid="input-new-email"]',"userrole01-ui@test.invalid");
 await fill('[data-testid="input-new-password"]',process.env.DEV_VERIFICATION_PASSWORD);
 await click('[data-testid="button-wizard-next"]');
 await click('[data-testid="wizard-template-operations_director"]');
 await shot("role-choice");
 await click('[data-testid="button-wizard-next"]');
 await click('[data-testid="wizard-sites-selected"]');
 await click(`[data-testid="wizard-site-${id}"]`);
 await click('[data-testid="button-wizard-next"]');
 await shot("creation-review");
 await click('[data-testid="button-create-user-confirm"]');
 await wait(`!!document.querySelector('[data-testid="wizard-advanced"]')`);
 await shot("advanced-step");
 await browser.call("Page.navigate",{url:base+"/admin/users"});
 const viewerId=mappings.viewer.userId;
 const individual=structuredClone(mappings.viewer.matrix);individual.site_dprs.export=true;individual.site_dprs.notify=true;
 assert.equal((await api(admin,`/api/auth/users/${viewerId}/permissions`,individual,"PUT")).status,200);
 await click(`[data-testid="button-perms-${viewerId}"]`);
 await click('[data-testid="select-role-template"]');await click('[data-testid="template-operations_director"]');
 await wait(`!!document.querySelector('[data-testid="role-change-preview"]')`);
 assert.deepEqual((await api(admin,`/api/auth/users/${viewerId}/permissions`)).data.matrix,individual,"Preview saved without confirmation");
 await shot("role-change-preview");
 await click('[data-testid="button-cancel-role"]');
 assert.deepEqual((await api(admin,`/api/auth/users/${viewerId}/permissions`)).data.matrix,individual);
 await click('[data-testid="select-role-template"]');await click('[data-testid="template-operations_director"]');
 await click('[data-testid="button-confirm-role"]');
 assert.deepEqual((await api(admin,`/api/auth/users/${viewerId}/permissions`)).data.matrix,individual,"Staging saved without Save");
 await click('[data-testid="button-save-perms"]');
 await wait(`!document.querySelector('[data-testid="button-save-perms"]')`);
 const merged=(await api(admin,`/api/auth/users/${viewerId}/permissions`)).data.matrix;
 assert.equal(merged.site_dprs.create,true);assert.equal(merged.site_dprs.export,true);assert.equal(merged.site_dprs.notify,true);
 await click(`[data-testid="button-perms-${viewerId}"]`);
 await click('[data-testid="select-role-template"]');await click('[data-testid="template-viewer"]');
 await click('[data-testid="role-mode-replace"]');await shot("replacement-differences");
 await click('[data-testid="button-confirm-role"]');await click('[data-testid="button-save-perms"]');
 await wait(`!document.querySelector('[data-testid="button-save-perms"]')`);
 const replaced=(await api(admin,`/api/auth/users/${viewerId}/permissions`)).data.matrix;
 assert.equal(replaced.site_dprs.export,false);assert.equal(replaced.site_dprs.notify,false);assert.equal(replaced.site_dprs.create,false);
 save("role-confirmation",{previewUnchanged:true,cancelUnchanged:true,stagingUnchanged:true,merged,replaced});
 assert.equal((await api(admin,`/api/auth/users/${opsId}/site-access`,{siteIds:[],allSites:true},"PUT")).status,200);
 const allSites=await api(ops,"/api/sites");assert(allSites.data.some(s=>s.id===id+1));
 save("explicit-all-sites",{status:allSites.status,otherFixtureSiteVisible:true});
 assert.equal((await api(admin,`/api/auth/users/${opsId}/site-access`,{siteIds:[],allSites:false},"PUT")).status,200);
 await p.query("update users set setup_complete=false where id=$1",[opsId]);
 await browser.call("Page.navigate",{url:base+"/admin/users"});
 await wait(`document.querySelector('[data-testid="row-user-${opsId}"]')?.innerText.includes("Setup incomplete")`);
 await wait(`!!document.querySelector('[data-testid="banner-site-access-audit"]')`);
 await shot("no-site-incomplete-warning");
 assert.equal((await api(admin,`/api/auth/users/${opsId}/site-access`,{siteIds:[id],allSites:false},"PUT")).status,200);
 for(const[name,value]of Object.entries(ops.cookies))await browser.call("Network.setCookie",{name,value,url:base});
 await browser.call("Page.navigate",{url:base+"/site/material-trips"});
 await wait(`document.body?.innerText.includes("USERROLE01")`);await shot("ordinary-material-trips");
 save("disposable-ids",{accounts,sites:[id,id+1],project:id,item:id,arrangement:id,tripIds});
}finally{
 browser?.ws.close();
 if(inspector){save("notification-fence",await inspector.evaluate("(()=>{const t=globalThis.__userrole01;t.s.sendNotification=t.original;delete globalThis.__userrole01;return {blocked:t.blocked,restored:true}})()"));inspector.ws.close();}
 await p.query("delete from site_material_trips where id=any($1::int[])",[tripIds]);
 await p.query("delete from earthwork_arrangements where id=$1",[id]);
 await p.query("delete from boq_items where id=$1",[id]);
 await p.query("delete from boq_projects where id=$1",[id]);
 const found=(await p.query("select id from users where email like 'userrole01-%@test.invalid'")).rows.map(r=>r.id);
 for(const table of ["user_sessions","user_devices","user_permissions","user_site_access"])await p.query(`delete from ${table} where user_id=any($1::int[])`,[found]);
 await p.query("delete from users where id=any($1::int[])",[found]);
 await p.query("delete from sites where id=any($1::int[])",[[id,id+1]]);
 save("removed",{users:found,sites:[id,id+1],project:id,item:id,arrangement:id,trips:tripIds});
 const after=await snapshot();save("integrity-after",after);assert.deepEqual(after,before,"Existing records changed");
 await p.end();
}
