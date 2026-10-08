// Read-only trip verification. Only disposable normal-login session/device rows
// may be created; never changes grants or trips.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
const out="reports/vb-arrange02a",base="http://127.0.0.1:5000";
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
 const loginBody={identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"VB-ARRANGE-02A disposable verifier"};
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

 const projects=await api('/api/boq/projects');
 const list=await api('/api/boq/projects/2/earthwork-arrangements');
 const saveAttempt=await api('/api/boq/projects/2/earthwork-arrangements',{tripRates:[{quantity:600,uom:"CFT",rate:1200}]});
 if(list.status!==403||saveAttempt.status!==403)throw Error("Unexpected verification access; stop before any fixture write");
 save('access',{login:login.status,projectsStatus:projects.status,list,saveAttempt});
 const target=(await(await fetch("http://127.0.0.1:9234/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let seq=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 for(const[name,value]of Object.entries(cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await call("Page.navigate",{url:base+"/work-program/2/execution-arrangements"});
 await new Promise(r=>setTimeout(r,6500));
 for(let attempt=0;attempt<60;attempt++){
  const rendered=await call("Runtime.evaluate",{expression:"document.body.innerText",returnByValue:true});
  if((rendered.result?.value?.length??0)>200){save("signed-in-screen",{text:rendered.result.value});break;}
  await new Promise(r=>setTimeout(r,500));
 }
 const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:85});
 fs.writeFileSync(`${out}/signed-in-access.jpg`,Buffer.from(shot.data,"base64"));
}finally{
 ws?.close();await check();
 await pool.query("delete from user_sessions where user_id=16 and not(id=any($1::int[]))",[sessions]);
 if(deviceId){await check();await pool.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);}
 await pool.end();
}
