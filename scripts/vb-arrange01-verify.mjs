// Disposable development acceptance fixtures. No production connection is used.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
const out="reports/vb-arrange01", priv="/tmp/vb-arrange01-private.json";
const base="http://127.0.0.1:5000"; // Proxy domain returned 404; target verified dev workflow directly.
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
const assertDev=async()=>{if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Not development");};
const write=async(sql,args)=>{await assertDev();return pool.query(sql,args);};
const save=(name,data)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2));
const hash=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const snap=async table=>(await pool.query(`select to_jsonb(t) row from ${table} t order by id`)).rows;
let state=fs.existsSync(priv)?JSON.parse(fs.readFileSync(priv)):null;
const persist=()=>fs.writeFileSync(priv,JSON.stringify(state),{mode:0o600});
let ws;
async function api(path,method="GET",body){
 if(method!=="GET")await assertDev();
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of r.headers.getSetCookie()){const v=c.split(";")[0],i=v.indexOf("=");state.cookies[v.slice(0,i)]=v.slice(i+1);}
 persist();let data;try{data=await r.json();}catch{data=null;}
 return {path,status:r.status,data};
}
async function browser(){
 const target=(await(await fetch("http://127.0.0.1:9233/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let id=0;const pending=new Map();ws.on("message",raw=>{let m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 await call("Network.clearBrowserCookies");
 for(const[name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Network.setBypassServiceWorker",{bypass:true});
 await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 const shot=async(name)=>{await wait(600);fs.writeFileSync(`${out}/${name}.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));save(name,{text:await evaluate("document.body.innerText")});};
 const nav=async(path)=>{await call("Page.navigate",{url:base+path});await wait(5500);};
 return {call,evaluate,wait,shot,nav};
}
try{
 await assertDev();
 const user=(await pool.query("select email,is_admin,is_owner from users where id=16")).rows[0];
 if(user?.email!=="agent.verification@test.invalid"||user.is_admin||user.is_owner)throw Error("Dedicated verification account not confirmed");
 const mode=process.argv[2];
 if(mode==="setup"||mode==="login"){
 if(mode==="setup"){
  if(state)throw Error("Existing run; do not replace baseline");
  state={cookies:{},trips:[],vendors:[],before:{vendors:await snap("vendors"),permissions:await snap("user_permissions")},sessions:(await pool.query("select id from user_sessions where user_id=16")).rows,devices:(await pool.query("select id from user_devices where user_id=16")).rows};persist();
  state.permission=(await pool.query("select id,can_create from user_permissions where user_id=16 and section_key='site_materials'")).rows[0];persist();
  if(!state.permission)throw Error("Expected preexisting verification grant");
  await write("update user_permissions set can_create=true where id=$1 and user_id=16",[state.permission.id]);
  for(const letter of ["A","B"]){state.vendors.push((await write("insert into vendors(name) values($1) returning id,name",[`ZZ TEST VENDOR ${letter} — VB-ARRANGE-01`])).rows[0]);persist();}
 }
  const payload={identifier:user.email,password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"VB-ARRANGE-01 disposable verification"};
  if(!payload.password)throw Error("Verification secret missing");
  let login=await api("/api/auth/login","POST",payload);
  if(login.status===202){
   const tokens=Object.values(state.cookies).map(v=>decodeURIComponent(v).split(".")[0]);
   const devices=(await pool.query("select id from user_devices where user_id=16 and status='pending' and device_token=ANY($1::text[])",[tokens])).rows;
   if(devices.length!==1||state.devices.some(d=>d.id===devices[0].id))throw Error("Own new device not uniquely identified");
   await write("update user_devices set status='approved',approved_at=now() where id=$1 and user_id=16 and status='pending'",[devices[0].id]);
   login=await api("/api/auth/login","POST",payload);
  }
  if(login.status!==200)throw Error(`Login ${login.status}`);
  save("login",{status:login.status,meStatus:(await api("/api/auth/me")).status,userId:16});
  save("fixture-inventory",{accountCreated:false,permissionCreated:false,temporarilyChangedPermission:state.permission.id,vendors:state.vendors});
 }else if(mode==="api"){
  if(state.trips.length)throw Error("Trips already created");
  const equipment=(await pool.query("select id from equipment_master where ownership='owned' and is_active=1 order by id limit 1")).rows[0];
  const common={date:"2026-10-09",site:"THAKADPALLY - SIRUR",material:"SOIL",quantity:600,uom:"CFT",enteredBy:"Agent Verification",notes:"ZZ TEST VB-ARRANGE-01 disposable",unloadedAt:"stretch",transportType:"agency_vendor",vehicleNumber:"",boqProjectId:2,boqItemId:21};
  // Empty vehicle on API fixtures avoids generating persistent vehicle associations.
  const cases=[
   ["own-agency",{materialSourceType:"own_source",materialSourceLabel:"ZZ TEST borrow area 212",supplier:state.vendors[1].name}],
   ["own-fleet",{materialSourceType:"own_source",materialSourceLabel:"ZZ TEST borrow area 212",transportType:"in_house",internalEquipmentId:equipment.id,supplier:null}],
   ["same-party",{materialSourceType:"vendor",materialSourceSupplier:state.vendors[0].name,supplier:state.vendors[0].name}],
   ["different-parties",{materialSourceType:"vendor",materialSourceSupplier:state.vendors[0].name,supplier:state.vendors[1].name}],
   ["vendor-fleet",{materialSourceType:"vendor",materialSourceSupplier:state.vendors[0].name,supplier:null,transportType:"in_house",internalEquipmentId:equipment.id}],
   ["unresolved",{supplier:state.vendors[1].name}]
  ];
  for(const[label,facts]of cases){
   const result=await api("/api/site-material-trips","POST",{...common,...facts,receiptNumber:`ZZ-TEST-${label}`});
   if(result.status!==201){save(`failed-${label}`,result);throw Error(`${label} ${result.status}`);}
   state.trips.push({id:result.data.id,label});persist();save(`case-${label}`,result);
  }
  const missing=await api("/api/site-material-trips","POST",{...common,materialSourceType:"own_source",supplier:state.vendors[1].name});
  save("case-missing-label",missing);if(missing.status!==400)throw Error("Label not blocked");
  const results=[];
  for(const vendor of state.vendors)for(const billType of ["all","material"]){
   const result=await api(`/api/vendor-bills/auto-items?${new URLSearchParams({vendorName:vendor.name,billType,periodFrom:common.date,periodTo:common.date,siteId:"16"})}`);
   results.push({vendor:vendor.name,billType,...result});
   if(result.status!==200)throw Error(`Bill pull ${result.status}`);
   const ownIds=state.trips.filter(t=>t.label.startsWith("own")).map(t=>t.id);
   if(result.data.some(r=>r.category==="material"&&ownIds.some(id=>r.sourceId===id||r.sourceId===`site_material_trip:${id}`)))throw Error("Own material offered");
  }
  save("bill-pulls",results);
  save("stored-rows",(await pool.query("select * from site_material_trips where id=any($1::int[]) order by id",[state.trips.map(t=>t.id)])).rows);
 }else if(mode==="screens"){
  const b=await browser();await b.nav("/site/material-trips");
  const set=async(id,value)=>b.evaluate(`(()=>{const e=document.querySelector('[data-testid="${id}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await set("input-filter-date-from","2026-10-09");await set("input-filter-date-to","2026-10-09");await b.wait(1500);
  await b.evaluate(`document.querySelector('[data-testid="select-filter-trip-role"]').scrollIntoView({block:'start'})`);
  await b.shot("signed-in-trips");
  for(const[label,text]of [["own-agency-filter","Our own source · Another transporter"],["own-fleet-filter","Our own source · Our own vehicle"]]){
   await b.evaluate(`document.querySelector('[data-testid="select-filter-trip-role"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,ctrlKey:false,pointerType:'mouse'}))`);
   await b.wait(400);
   await b.evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent===${JSON.stringify(text)})?.click()`);
   await b.wait(700);await b.shot(label);
  }
  save("vendor-list-access",await api("/api/vendor-master"));
  await b.evaluate(`window.scrollTo(0,0);document.querySelector('[data-testid="trip-source-own-source"]').click();document.querySelector('[data-testid="trip-role-in_house"]').click()`);
  await b.shot("own-source-entry");
  const choose=async(id,text)=>{
   await b.evaluate(`document.querySelector('[data-testid="${id}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,ctrlKey:false,pointerType:'mouse'}))`);
   await b.wait(250);
   await b.evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.includes(${JSON.stringify(text)}))?.click()`);
   await b.wait(250);
  };
  await choose("select-trip-site","THAKADPALLY");
  await choose("select-trip-material","Soil");
  await choose("select-trip-internal-equipment","600 KVA");
  await set("input-trip-quantity","600");
  await choose("trip-work-ctx-select-item","Wet Mix");
  await b.evaluate(`document.querySelector('[data-testid="button-submit-trip"]').click()`);
  await b.wait(600);await b.shot("missing-label-browser");
  console.log((await b.evaluate("document.body.innerText")).slice(0,2500));
 }else if(mode==="cleanup"){
  const deleted={trips:(await write("delete from site_material_trips where id=any($1::int[]) and notes='ZZ TEST VB-ARRANGE-01 disposable' returning id",[state.trips.map(t=>t.id)])).rows};
  deleted.vendors=(await write("delete from vendors where id=any($1::int[]) and name like 'ZZ TEST VENDOR % — VB-ARRANGE-01' returning id",[state.vendors.map(v=>v.id)])).rows;
  await write("update user_permissions set can_create=$1 where id=$2 and user_id=16",[state.permission.can_create,state.permission.id]);
  deleted.sessions=(await write("delete from user_sessions where user_id=16 and not(id=any($1::int[])) returning id",[state.sessions.map(x=>x.id)])).rows;
  deleted.devices=(await write("delete from user_devices where user_id=16 and not(id=any($1::int[])) returning id",[state.devices.map(x=>x.id)])).rows;
  const proof={deleted,accountsCreated:0,permissionRowsCreated:0};
  for(const table of ["vendors","permissions"]){const after=await snap(table==="permissions"?"user_permissions":table),before=state.before[table];proof[table]={beforeCount:before.length,afterCount:after.length,beforeChecksum:hash(before),afterChecksum:hash(after),exactMatch:hash(before)===hash(after)};}
  const before=JSON.parse(fs.readFileSync(`${out}/historical-before.json`)),after=(await pool.query("select id,to_jsonb(t)-'material_source_type'-'material_source_label' as content from site_material_trips t order by id")).rows;
  proof.trips={beforeCount:before.length,afterCount:after.length,beforeChecksum:hash(before),afterChecksum:hash(after),exactMatch:hash(before)===hash(after)};
  proof.historicalNewFieldsNull=Number((await pool.query("select count(*) n from site_material_trips where material_source_type is not null or material_source_label is not null")).rows[0].n)===0;
  save("cleanup-proof",proof);
  if(!proof.vendors.exactMatch||!proof.permissions.exactMatch||!proof.trips.exactMatch)throw Error("Cleanup mismatch");
  fs.rmSync(priv);
 }else throw Error("setup | api | screens | cleanup required");
 console.log(`${mode}: complete`);
}finally{ws?.close();await pool.end();}
