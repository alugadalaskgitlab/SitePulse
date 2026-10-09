// Real development HTTP acceptance; disposable accounts/records only.
import fs from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
const base = "http://127.0.0.1:5000";
const out = "reports/perm-req01";
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await db.connect();
assert.equal((await db.query("select current_database() name")).rows[0].name, "sitelog_dev");
assert(process.env.DEV_VERIFICATION_PASSWORD);
const users = [], records = [], evidence = [];
let ws;
async function api(cookies, path, body, method = body ? "POST" : "GET") {
  const r = await fetch(base + path, { method, headers: {
    "Content-Type": "application/json", Cookie: Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join("; "),
  }, body: body ? JSON.stringify(body) : undefined });
  for (const cookie of r.headers.getSetCookie()) {
    const [name, ...v] = cookie.split(";")[0].split("="); cookies[name] = v.join("=");
  }
  const data = await r.json(); return { status: r.status, data };
}
async function account(offset, admin = false, owner = false, approve = true, allocation = false) {
  const id = 1900000960 + offset, email = `permreq01-${offset}@test.invalid`;
  await db.query("insert into users(id,email,full_name,password_hash,is_admin,is_owner,setup_complete,notifications_enabled) values($1,$2,$3,$4,$5,$6,true,false)",
    [id,email,`PERMREQ01 ${offset}`,await bcrypt.hash(process.env.DEV_VERIFICATION_PASSWORD,10),admin,owner]);
  users.push(id);
  await db.query("insert into user_permissions(user_id,section_key,can_view,can_approve) values($1,'site_dprs',true,$2)",[id,approve]);
  if (allocation) for (const key of ["stores_inventory","plant_equipment","labour_management"])
    await db.query("insert into user_permissions(user_id,section_key,can_create) values($1,$2,true)",[id,key]);
  const cookies = {};
  let r = await api(cookies,"/api/auth/login",{identifier:email,password:process.env.DEV_VERIFICATION_PASSWORD});
  if (r.status === 202) {
    const tokens = Object.values(cookies).map(v => decodeURIComponent(v).split(".")[0].replace(/^s:/,""));
    const pending = (await db.query("select id from user_devices where user_id=$1 and status='pending' and device_token=any($2::text[])",[id,tokens])).rows;
    assert.equal(pending.length,1);
    await db.query("update user_devices set status='approved',approved_at=now() where id=$1",[pending[0].id]);
    r = await api(cookies,"/api/auth/login",{identifier:email,password:process.env.DEV_VERIFICATION_PASSWORD});
  }
  assert.equal(r.status,200);
  return {id,cookies};
}
async function create(actor) {
  const r=await api(actor.cookies,"/api/site-requirements",{
    date:new Date().toISOString().slice(0,10),submittedBy:1,submittedByName:"forged",
    materials:[{materialName:"PERMREQ01 material",qty:1,uom:"Cum",lineKey:"mat"}],
    equipment:[{equipmentType:"PERMREQ01 machine",numberRequired:1,lineKey:"eq"}],
    labour:[{labourType:"PERMREQ01 crew",numberRequired:1,lineKey:"lab"}],
  });
  assert.equal(r.status,200); records.push(r.data.id);
  assert.equal(r.data.submittedBy,actor.id);
  assert.equal((await db.query("select submitted_by from site_requirements where id=$1",[r.data.id])).rows[0].submitted_by,actor.id);
  return r.data.id;
}
async function check(actor,id,suffix,body,expected,label) {
  const r=await api(actor.cookies,`/api/site-requirements/${id}/${suffix}`,body,"PATCH");
  evidence.push({label,status:r.status,error:r.data.error});
  assert.equal(r.status,expected,label);
  return r.data;
}
try {
  const creator=await account(0), other=await account(1), denied=await account(2,false,false,false);
  const admin=await account(3,true,false,false), owner=await account(4,false,true,false);
  const allocator=await account(5,false,false,false,true);
  const rid=await create(creator), aid=await create(admin), oid=await create(owner);
  for (const status of ["approved","rejected"]) {
    await check(creator,rid,"status",{status,isOwner:true},403,`creator ${status}`);
    await check(admin,aid,"status",{status},403,`Administrator self ${status}`);
    await check(denied,rid,"status",{status},403,`no grant ${status}`);
    await check(other,rid,"status",{status},200,`different approver ${status}`);
    await check(owner,oid,"status",{status},200,`Owner self ${status}`);
  }
  for (const operation of ["approve","reject"]) {
    for (const [actor,id] of [[creator,rid],[admin,aid],[owner,oid]]) {
      const requested=await api(actor.cookies,`/api/site-requirements/${id}/revision-request`,{reason:"PERMREQ01 disposable revision"});
      assert.equal(requested.status,200);
      if (actor!==owner) await check(actor,id,`revision-${operation}`,{},403,`${actor===admin?"Administrator":"creator"} self revision-${operation}`);
      await check(denied,id,`revision-${operation}`,{},403,`no grant revision-${operation}`);
      await check(actor===owner?owner:other,id,`revision-${operation}`,{},200,`authorised revision-${operation}`);
    }
  }
  const unknown=await create(creator);
  await db.query("update site_requirements set submitted_by=null,revision_status='revision_requested' where id=$1",[unknown]);
  for (const actor of [creator,other,admin,owner]) {
    for (const status of ["approved","rejected"]) await check(actor,unknown,"status",{status},403,`unknown creator ${actor.id} ${status}`);
    for (const op of ["approve","reject"]) await check(actor,unknown,`revision-${op}`,{},403,`unknown creator ${actor.id} revision-${op}`);
  }
  for (const category of ["materials","equipment","labour"]) {
    await check(denied,rid,"item-status",{category,itemIndex:0,status:"arranged"},403,`denied ${category} allocation`);
    const saved=await check(allocator,rid,"item-status",{category,itemIndex:0,status:"arranged"},200,`${category} allocation preserved`);
    assert(saved.allocationStatus);
  }
  await check(other,rid,"status",{status:"arranged"},403,"Approve does not grant allocation transitions");
  const ownList=await api(denied.cookies,"/api/site-requirements");
  assert.equal(ownList.status,200); assert(ownList.data.every(x=>x.submittedBy===denied.id));
  // Actual authenticated Chromium screen, not an auth bypass.
  const targets=await(await fetch("http://127.0.0.1:9236/json")).json();
  ws=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise(r=>ws.once("open",r)); let seq=0; const pending=new Map();
  ws.on("message",raw=>{const m=JSON.parse(raw);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>(await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.value;
  const wait=async expr=>{for(let i=0;i<100;i++){if(await evaluate(expr))return;await new Promise(r=>setTimeout(r,150));}throw Error(`UI timeout: ${expr}`);};
  for(const [name,value] of Object.entries(admin.cookies))await call("Network.setCookie",{name,value,url:base});
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate",{url:base+"/site/requirements"});
  await wait(`!!document.querySelector('[data-testid="toggle-requirement-${aid}"]')`);
  // Wait for the startup splash to stop intercepting real pointer input.
  await wait(`!Array.from(document.querySelectorAll('div')).some(el=>getComputedStyle(el).zIndex==='9999')`);
  const point=await evaluate(`(()=>{const el=document.querySelector('[data-testid="toggle-requirement-${aid}"]');el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await call("Input.dispatchMouseEvent",{type:"mousePressed",...point,button:"left",clickCount:1});
  await call("Input.dispatchMouseEvent",{type:"mouseReleased",...point,button:"left",clickCount:1});
  await wait(`document.querySelector('[data-testid="approval-block-${aid}"]')?.textContent.includes('You cannot approve')`);
  await evaluate(`document.querySelector('[data-testid="approval-block-${aid}"]').scrollIntoView({block:'center'})`);
  await new Promise(r=>setTimeout(r,300));
  fs.writeFileSync(`${out}/administrator-self-block.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:85})).data,"base64"));
  evidence.push({label:"Real signed-in Administrator sees creator restriction",passed:true});
  fs.writeFileSync(`${out}/authenticated-acceptance.json`,JSON.stringify({creatorIdReadBack:true,checks:evidence},null,2));
  console.log(`${evidence.length} authenticated checks passed`);
} finally {
  ws?.close();
  if(records.length)await db.query("delete from site_requirements where id=any($1::int[])",[records]);
  for(const table of ["user_sessions","user_devices","user_permissions","user_site_access"])if(users.length)await db.query(`delete from ${table} where user_id=any($1::int[])`,[users]);
  if(users.length)await db.query("delete from users where id=any($1::int[])",[users]);
  assert.equal((await db.query("select count(*)::int n from users where id=any($1::int[])",[users])).rows[0].n,0);
  fs.writeFileSync(`${out}/cleanup.json`,JSON.stringify({removedUsers:users.length,removedRequirements:records.length,remainingFixtureUsers:0},null,2));
  await db.end();
}
