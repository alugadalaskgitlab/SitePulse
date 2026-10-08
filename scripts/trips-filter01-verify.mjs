// Read-only trip verification. Only disposable normal-login session/device rows
// may be created; never changes grants or trips.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
const out="reports/trips-filter01",base="http://127.0.0.1:5000";
const check=async()=>{if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Development only");};
const save=(name,data)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2));
const cookies={};let ws,deviceId;
await check();
const sessions=(await pool.query("select id from user_sessions where user_id=16")).rows.map(r=>r.id);
const devices=(await pool.query("select id from user_devices where user_id=16")).rows.map(r=>r.id);
const api=async(path,body)=>{
 const response=await fetch(base+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of response.headers.getSetCookie()){const s=c.split(";")[0],i=s.indexOf("=");cookies[s.slice(0,i)]=s.slice(i+1);}
 return {url:path,status:response.status,data:await response.json()};
};
try{
 const loginBody={identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"TRIPS-FILTER-01 disposable verifier"};
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
 const before=await api("/api/site-material-trips");if(before.status!==200)throw Error("List unavailable");
 const sample=before.data.find(r=>r.supplier?.trim()&&r.vehicleNumber?.trim());
 if(!sample)throw Error("No existing transporter/vehicle evidence");
 const cases=[
  ["all",{}],
  ["transporter",{supplier:sample.supplier.trim()}],
  ["vehicle",{vehicleNumber:sample.vehicleNumber.trim()}],
  ["unassigned",{onlyUnassigned:"true"}],
  ["combined",{supplier:sample.supplier.trim(),site:sample.site,material:sample.material,dateFrom:sample.date,dateTo:sample.date}],
  ["no-match",{supplier:"ZZ NO MATCH TRIPS FILTER 01"}],
 ];
 const results=[];
 for(const[name,filters]of cases){
  const result=await api(`/api/site-material-trips?${new URLSearchParams(filters)}`);
  if(result.status!==200)throw Error(`${name} ${result.status}`);
  results.push({name,filters,...result});
 }
 save("requests",results);
 // Dry comparison uses the unchanged bulk predicate; never invokes its write.
 const combined=results.find(r=>r.name==="combined");
 const sql=await pool.query(`select id from site_material_trips
  where is_cancelled=false and is_deleted=false
  and material_source_type IS DISTINCT FROM 'own_source'
  and UPPER(TRIM(site))=$1 and UPPER(TRIM(material))=$2
  and date >= $3 and date <= $4 and UPPER(TRIM(supplier))=$5
  and site=ANY($6::text[]) order by id`,
  [sample.site.trim().toUpperCase(),sample.material.trim().toUpperCase(),sample.date,sample.date,sample.supplier.trim().replace(/\s+/g," ").toUpperCase(),[...new Set(before.data.map(r=>r.site))]]);
 const eligible=combined.data.filter(r=>r.materialSourceType!=="own_source").map(r=>r.id).sort((a,b)=>a-b);
 save("dry-comparison",{listCount:combined.data.length,eligibleIds:eligible,bulkIds:sql.rows.map(r=>r.id),equal:JSON.stringify(eligible)===JSON.stringify(sql.rows.map(r=>r.id))});
 const target=(await(await fetch("http://127.0.0.1:9234/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let seq=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true})).result?.value;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 for(const[name,value]of Object.entries(cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await call("Page.navigate",{url:base+"/site/material-trips"});await wait(6500);
 const set=async(id,value)=>{await evaluate(`(()=>{const e=document.querySelector('[data-testid="${id}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(600);};
 await set("input-filter-date-from","");await set("input-filter-date-to","");
 for(const name of ["all","transporter","vehicle","unassigned","no-match","combined"]){
  await set("input-filter-supplier",name==="transporter"||name==="combined"?sample.supplier:name==="no-match"?"ZZ NO MATCH TRIPS FILTER 01":"");
  await set("input-filter-vehicle",name==="vehicle"?sample.vehicleNumber:"");
  await evaluate(`(()=>{const e=document.querySelector('[data-testid="checkbox-filter-only-unassigned"]');if((e.checked ?? (e.getAttribute('data-state')==='checked'))!==${name==="unassigned"})e.click();})()`);
  if(name==="combined"){
   await set("input-filter-date-from",sample.date);await set("input-filter-date-to",sample.date);
   for(const[id,text]of [["select-filter-site",sample.site],["select-filter-material",sample.material]]){
    await evaluate(`document.querySelector('[data-testid="${id}"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,ctrlKey:false,pointerType:'mouse'}))`);
    await wait(300);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)})?.click()`);
    await wait(300);
   }
  }
  await wait(1200);
  await evaluate(`document.activeElement?.blur();document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`);
  await evaluate(`document.querySelector('[data-testid="select-filter-trip-role"]').scrollIntoView({block:'center'})`);
  const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:80});
  fs.writeFileSync(`${out}/${name}.jpg`,Buffer.from(shot.data,"base64"));
  save(`screen-${name}`,{text:await evaluate("document.body.innerText"),bulkPanelVisible:await evaluate(`!!document.querySelector('[data-testid="bulk-material-source-panel"]')`)});
 }
}finally{
 ws?.close();await check();
 await pool.query("delete from user_sessions where user_id=16 and not(id=any($1::int[]))",[sessions]);
 if(deviceId){await check();await pool.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);}
 const rows=(await pool.query("select to_jsonb(t) row from site_material_trips t order by id")).rows;
 const after={count:rows.length,checksum:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")};
 const before=JSON.parse(fs.readFileSync(`${out}/before.json`));save("integrity",{before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)});
 await pool.end();
}
