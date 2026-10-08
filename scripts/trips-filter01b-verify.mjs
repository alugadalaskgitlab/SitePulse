// Read-only trip verification. Only disposable normal-login session/device rows
// may be created; never changes grants or trips.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
const out="reports/trips-filter01b",base="http://127.0.0.1:5000";
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
 const loginBody={identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"TRIPS-FILTER-01B disposable verifier"};
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

 await set("input-filter-date-from","2026-07-01");await set("input-filter-date-to","2026-10-08");await wait(1600);
 const capture=async(name)=>{await wait(400);const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:85});fs.writeFileSync(out+"/"+name+".jpg",Buffer.from(shot.data,"base64"));};
 await evaluate("document.querySelector('table').scrollIntoView({block:'start'})");await capture('desktop-dates-challans');
 save('rendered-desktop',{text:await evaluate("document.querySelector('table').innerText"),listStatus:before.status});
 await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await wait(900);
 await evaluate("document.querySelector('table').scrollIntoView({block:'start'})");await capture('phone-dates');
 await evaluate("(()=>{const t=document.querySelector('table'),c=t.parentElement;c.scrollLeft=t.querySelectorAll('th')[5].offsetLeft-c.offsetLeft;})()");await capture('phone-challans');
 save('phone-width',{viewport:390,...await evaluate("(()=>{const c=document.querySelector('table').parentElement;return {pageWidth:document.documentElement.scrollWidth,containerWidth:c.clientWidth,scrollWidth:c.scrollWidth,overflowX:getComputedStyle(c).overflowX};})()")});

}finally{
 ws?.close();await check();
 await pool.query("delete from user_sessions where user_id=16 and not(id=any($1::int[]))",[sessions]);
 if(deviceId){await check();await pool.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);}
 const rows=(await pool.query("select to_jsonb(t) row from site_material_trips t order by id")).rows;
 const after={count:rows.length,checksum:crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex")};
 const before=JSON.parse(fs.readFileSync(`${out}/before.json`));save("integrity",{before,after,unchanged:JSON.stringify(before)===JSON.stringify(after)});
 await pool.end();
}
