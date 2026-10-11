// Normal-login operational check. No trip/master/bill data writes.
import pg from "pg";
import WebSocket from "ws";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const p = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
const base = "http://127.0.0.1:5000";
const cookies = {}; let deviceId, ws;
await p.connect();
try {
  assert.equal((await p.query("select current_database() n")).rows[0].n, "sitelog_dev");
  if (!process.env.DEV_VERIFICATION_PASSWORD) throw Error("Verification secret absent");
  const devices = (await p.query("select id from user_devices where user_id=16")).rows.map(r => r.id);
  const login = async () => {
    const r = await fetch(base + "/api/auth/login", { method: "POST",
      headers: { "Content-Type": "application/json", cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ") },
      body: JSON.stringify({ identifier: "agent.verification@test.invalid", password: process.env.DEV_VERIFICATION_PASSWORD }) });
    for (const c of r.headers.getSetCookie()) { const s=c.split(";")[0], n=s.indexOf("="); cookies[s.slice(0,n)]=s.slice(n+1); }
    return r.status;
  };
  let status = await login();
  if (status === 202) {
    const tokens = Object.values(cookies).map(v => decodeURIComponent(v).split(".")[0]);
    const matches = (await p.query("select id from user_devices where user_id=16 and status='pending' and device_token=any($1::text[])", [tokens])).rows;
    assert.equal(matches.length, 1); deviceId=matches[0].id; assert(!devices.includes(deviceId));
    await p.query("update user_devices set status='approved',approved_at=now() where id=$1 and user_id=16 and status='pending'", [deviceId]);
    status=await login();
  }
  assert.equal(status, 200, "Normal sign-in failed; no password or permissions changed");
  const pages=await (await fetch("http://127.0.0.1:9232/json")).json();
  ws=new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);
  await new Promise(r=>ws.once("open",r));
  let seq=0; const pending=new Map();
  ws.on("message",raw=>{const d=JSON.parse(raw); if(pending.has(d.id)){ const {resolve,reject}=pending.get(d.id); pending.delete(d.id); d.error?reject(Error(d.error.message)):resolve(d.result); }});
  const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>(await cmd("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.value;
  await cmd("Network.enable");
  for (const [name,value] of Object.entries(cookies)) await cmd("Network.setCookie",{name,value,url:base});
  const response = await fetch(base + "/api/site-material-trips", { headers: {
    cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ") } });
  assert.equal(response.status, 200);
  const trips = await response.json();
  assert(trips.length, "Verification account has no permitted trips");
  await cmd("Page.navigate",{url:base+"/site/material-trips?hireDate="+encodeURIComponent(trips[0].date)});
  for(let i=0;i<40;i++){ if(await evaluate(`!!document.querySelector('[data-testid^="button-edit-trip-roles-"]')`))break;await new Promise(r=>setTimeout(r,500)); }
  assert(await evaluate(`!!document.querySelector('[data-testid^="button-edit-trip-roles-"]')`), "No permitted trip action available");
  await evaluate(`document.querySelector('[data-testid^="button-edit-trip-roles-"]').click()`);
  for(let i=0;i<30;i++){if(await evaluate(`!!document.querySelector('[data-testid="dialog-trip-roles"]')`))break;await new Promise(r=>setTimeout(r,200));}
  const result=await evaluate(`({dialog:!!document.querySelector('[data-testid="dialog-trip-roles"]'),title:document.querySelector('[data-testid="dialog-trip-roles"]')?.innerText.includes('Trip Details'),financialRate:document.querySelector('[data-testid="dialog-trip-roles"]')?.innerText.includes('Hire Rate')})`);
  assert(result.dialog);assert(!result.financialRate);
  await new Promise(r=>setTimeout(r,1500));
  await fs.writeFile("/tmp/trip-integration-review.png", Buffer.from((await cmd("Page.captureScreenshot",{format:"png"})).data,"base64"));
  console.log(JSON.stringify({normalLogin:true,operationalReviewOpened:true,financialRateAbsent:true,noTripWrites:true}));
} finally {
  ws?.close();
  if(deviceId) await p.query("delete from user_devices where id=$1 and user_id=16",[deviceId]);
  await p.end();
}
