// Authorized development acceptance: ordinary login and disposable planning/trip
// fixtures only. Never changes grants, credentials, or pre-existing business rows.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
const out="reports/dev-acct02",base="http://127.0.0.1:5000";
const check=async()=>{if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Development only");};
const save=(name,data)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2));
const cookies={};let ws,deviceId,fixtureStarted=false;
await check();
const sessions=(await pool.query("select id from user_sessions where user_id=16")).rows.map(r=>r.id);
const devices=(await pool.query("select id from user_devices where user_id=16")).rows.map(r=>r.id);
const api=async(path,body)=>{
 const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of response.headers.getSetCookie()){const s=c.split(";")[0],i=s.indexOf("=");cookies[s.slice(0,i)]=s.slice(i+1);}
 return {url:path,status:response.status,data:await response.json()};
};
try{
 const loginBody={identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"DEV-ACCT-02 disposable verifier"};
 if(!loginBody.password)throw Error("Missing verification secret");
 await check();let login=await api("/api/auth/login",loginBody);
 if(login.status===202){
  const tokens=Object.values(cookies).map(v=>decodeURIComponent(v).split(".")[0]);
  const matches=(await pool.query("select id from user_devices where user_id=16 and status='pending' and device_token=ANY($1::text[])",[tokens])).rows;
  if(matches.length!==1||devices.includes(matches[0].id))throw Error("Cannot identify own new device");
  deviceId=matches[0].id;await check();
  await pool.query("update user_devices set status='approved',approved_at=now() where id=$1 and user_id=16 and status='pending'",[deviceId]);
  login=await api("/api/auth/login",loginBody);
 }
 const me=await api("/api/auth/me");
 if(login.status!==200||me.data.user?.id!==16)throw Error("Verification login failed");
 save("login",{status:login.status,meStatus:me.status,userId:16});

 const target=(await(await fetch("http://127.0.0.1:9234/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let seq=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 for(const[name,value]of Object.entries(cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});

 const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value;
 const wait=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+expression);};
 const click=async selector=>{await wait('!!document.querySelector('+JSON.stringify(selector)+')');await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');};
 const fill=async(selector,value)=>evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');
 const shot=async name=>{await new Promise(r=>setTimeout(r,500));const s=await call('Page.captureScreenshot',{format:'jpeg',quality:85});fs.writeFileSync(out+'/'+name+'.jpg',Buffer.from(s.data,'base64'));};
 const responses=[];await call('Network.enable');ws.on('message',raw=>{const m=JSON.parse(raw);if(m.method==='Network.responseReceived'&&m.params.response.url.includes('/api/'))responses.push({url:m.params.response.url.replace(base,''),status:m.params.response.status});});
 // Positive reserved IDs, checked absent, for disposable planning/trip fixtures.
 const fid=1900000000;
 for(const table of ['boq_projects','boq_items','site_material_trips'])if((await pool.query('select id from '+table+' where id=$1',[fid])).rows.length)throw Error('Fixture ID occupied');
 fixtureStarted=true;
 await pool.query("insert into boq_projects select (jsonb_populate_record(null::boq_projects,to_jsonb(t)||jsonb_build_object('id',1900000000,'site_id',16,'name','DEV ACCT DISPOSABLE PROJECT'))).* from boq_projects t where id=2");
 await pool.query("insert into boq_items select (jsonb_populate_record(null::boq_items,to_jsonb(t)||jsonb_build_object('id',1900000000,'boq_project_id',1900000000,'current_qty',1000,'description','DEV ACCT DISPOSABLE EMBANKMENT'))).* from boq_items t where boq_project_id=2 limit 1");
 const created=await api('/api/boq/projects/'+fid+'/earthwork-arrangements',{boqItemId:fid,materialLabel:'DEV ACCT FIXTURE',arrangementType:'hlc_source_outsourced_execution',agencyName:'DEV ACCT DISPOSABLE',allocatedQty:1,uom:'CUM',saveIntent:'draft',tripRates:[{quantity:600,uom:'CFT',rate:1200}]});
 save('create',created);if(created.status!==201&&created.status!==200)throw Error('Fixture arrangement rejected');
 const aid=created.data.id;save('fixture-ids',{project:fid,item:fid,trip:fid,arrangement:aid});
 await pool.query("insert into site_material_trips (id,date,site,material,quantity,uom,supplier,vehicle_number,material_source_type,transport_type,internal_equipment_id,boq_project_id,boq_item_id,receipt_number) values ($1,current_date,'THAKADPALLY - SIRUR','Soil',600,'CFT','','DEVACCTFIXTURE','own_source','in_house',2,$1,$1,'DEV-ACCT-DISPOSABLE')",[fid]);
 await call('Page.navigate',{url:base+'/work-program/'+fid+'/execution-arrangements'});
 await wait("document.body.innerText.includes('DEV ACCT DISPOSABLE')");
 await click(`[data-testid=button-open-${aid}]`);
 await click('[data-testid=button-edit-arrangement]');
 await wait(`!!document.querySelector('[aria-label="Rate per trip 1"]')`);
 await fill('[aria-label="Rate per trip 1"]','1250');await shot('rate-edit');
 await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Save Draft')?.click()");
 await wait("!document.querySelector('[data-testid=arrangement-trip-rates-editor]')");
 save('saved-rate',(await pool.query('select id,trip_rates from earthwork_arrangements where id=$1',[aid])).rows);
 await shot('rate-saved');
 await call('Page.navigate',{url:base+'/site/material-trips'});await wait("!!document.querySelector('[data-testid=select-filter-site]')");
 await click('[data-testid=select-filter-site]');await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes('THAKADPALLY - SIRUR'))?.click()");
 await fill('[data-testid=input-filter-vehicle]','DEVACCTFIXTURE');
 await wait("document.body.innerText.includes('DEV-ACCT-DISPOSABLE')");
 await evaluate("const d=document.querySelector('[data-testid=bulk-arrangement-tool]');d.open=true;d.dispatchEvent(new Event('toggle'))");
 await wait(`Array.from(document.querySelectorAll('select[aria-label="Bulk Execution Arrangement"] option')).some(e=>e.value==='${aid}')`);
 await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Bulk Execution Arrangement"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'${aid}');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 // Restrict material before confirmation so no pre-existing row can be selected.
 await click('[data-testid=select-filter-material]');await evaluate("Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent==='Soil')?.click()");
 await wait("document.querySelector('[data-testid=arrangement-eligible-count]')?.textContent.includes('1 eligible trips')");
 await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Link 1 eligible trips')?.click()");await shot('bulk-confirm');
 await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Confirm arrangement links')?.click()");
 await wait("document.body.innerText.includes('Linked 1 trips.')");await shot('bulk-saved');
 await click('[data-testid=button-edit-trip-roles-1900000000]');await shot('roles-edit');await click('[data-testid=button-save-trip-roles]');
 await wait("!document.querySelector('[data-testid=dialog-trip-roles]')");await shot('roles-saved');
 save('responses',responses);save('trip-proof',(await pool.query('select id,earthwork_arrangement_id,quantity,date,receipt_number from site_material_trips where id=$1',[fid])).rows);
}finally{
 ws?.close();await check();
 const f=1900000000;
 if(fixtureStarted){
 const ownArr=(await pool.query("select id from earthwork_arrangements where boq_project_id=$1",[f])).rows.map(r=>r.id);
 await pool.query("delete from audit_logs where user_id=16 and ((module='earthwork_arrangements' and transaction_id=any($1::int[])) or (module='site_material_trips' and transaction_id=$2))",[ownArr,f]);
 await pool.query('delete from site_material_trips where id=$1',[f]);
 await pool.query('delete from earthwork_arrangements where boq_project_id=$1',[f]);
 await pool.query('delete from boq_items where boq_project_id=$1',[f]);
 await pool.query('delete from boq_projects where id=$1',[f]);
 }

 await pool.query("delete from user_sessions where user_id=16 and not(id=any($1::int[]))",[sessions]);
 if(deviceId){await check();await pool.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);}
 await pool.end();
}
