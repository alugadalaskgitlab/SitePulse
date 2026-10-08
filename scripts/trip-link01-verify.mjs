// Read-only trip verification. Only disposable normal-login session/device rows
// may be created; never changes grants or trips.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import WebSocket from "ws";
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
// The public dev domain currently routes to the separate mockup sandbox.
// Use the verified main-app port for this disposable development-only harness.
const out="reports/trip-link01",base="http://127.0.0.1:5000";
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
 const loginBody={identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"TRIP-LINK-01 disposable verifier"};
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


 const all=await api('/api/site-material-trips');
 if(all.status!==200||!Array.isArray(all.data))throw Error('Trip list unavailable');
 const site=all.data[0]?.site;
 if(!site)throw Error('No accessible trips for verification');
 const unlinked=await api('/api/site-material-trips?onlyWithoutArrangement=true');
 const outside=await api('/api/site-material-trips?onlyWithoutArrangement=true&supplier=NONEXISTENT_TRIP_LINK_TEST_CARRIER');
 if(unlinked.status!==200||unlinked.data.some(x=>x.earthworkArrangementId!=null)||outside.status!==200||outside.data.length)throw Error('No-arrangement filter mismatch');
 const options=await api('/api/site-material-trips/arrangement-options?site='+encodeURIComponent(site));
 const preview=await api('/api/site-material-trips/arrangement/preview',{site,roleFilter:'all',earthworkArrangementId:1,onlyUnlinked:true});
 // Do not write any owner rows; only probe the known denied write guard.
 let bulk=null;if(preview.status===403)bulk=await api('/api/site-material-trips/arrangement/bulk',{site,roleFilter:'all',earthworkArrangementId:1,onlyUnlinked:true});
 save('http',{login:login.status,listStatus:all.status,total:all.data.length,unlinkedStatus:unlinked.status,unlinkedIds:unlinked.data.map(x=>x.id),emptyStatus:outside.status,emptyCount:outside.data.length,options,preview,bulk});
 const target=(await(await fetch("http://127.0.0.1:9234/json")).json()).find(t=>t.type==="page");
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let seq=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 for(const[name,value]of Object.entries(cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});

 await call('Network.setBypassServiceWorker',{bypass:true});
 await call('Page.navigate',{url:base+'/site/material-trips'});
 for(let n=0;n<100;n++){const r=await call('Runtime.evaluate',{expression:"!!document.querySelector('[data-testid=checkbox-filter-no-arrangement]')",returnByValue:true});if(r.result?.value)break;await new Promise(r=>setTimeout(r,500));}
 const title=await call('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true});save('page',{text:title.result?.value});
 await call('Runtime.evaluate',{expression:`for (const id of ['input-filter-date-from','input-filter-date-to']) {
   const e=document.querySelector('[data-testid="'+id+'"]');
   if(e){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
 }`});
 await call('Runtime.evaluate',{expression:"document.querySelector('[data-testid=checkbox-filter-no-arrangement]')?.click()"});
 await new Promise(r=>setTimeout(r,1800));
 await call('Runtime.evaluate',{expression:"document.querySelector('[data-testid=checkbox-filter-no-arrangement]')?.scrollIntoView({block:'start'})"});
 const shot=await call('Page.captureScreenshot',{format:'jpeg',quality:85});fs.writeFileSync(out+'/signed-in-filter.jpg',Buffer.from(shot.data,'base64'));
 await call('Runtime.evaluate',{expression:"document.querySelector('[data-testid=input-filter-supplier]')?.focus()"});
 await call('Input.insertText',{text:'NONEXISTENT_TRIP_LINK_TEST_CARRIER'});
 for(let n=0;n<50;n++){const r=await call('Runtime.evaluate',{expression:"document.body.innerText.includes('No trips match these filters.')",returnByValue:true});if(r.result?.value)break;await new Promise(r=>setTimeout(r,200));}
 await call('Runtime.evaluate',{expression:"document.activeElement?.blur();document.querySelector('[data-testid=checkbox-filter-no-arrangement]')?.scrollIntoView({block:'start'})"});
 const emptyShot=await call('Page.captureScreenshot',{format:'jpeg',quality:85});fs.writeFileSync(out+'/signed-in-empty.jpg',Buffer.from(emptyShot.data,'base64'));
}finally{
 ws?.close();await check();
 await pool.query("delete from user_sessions where user_id=16 and not(id=any($1::int[]))",[sessions]);
 if(deviceId){await check();await pool.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);}
 await pool.end();
}
