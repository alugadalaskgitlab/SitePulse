// Development acceptance only: native sign-in, no application auth bypass.
import fs from "node:fs";
import pg from "pg";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
const out="reports/perm-prod01", privatePath="/tmp/permprod01-private.json", base="http://127.0.0.1:5000";
fs.mkdirSync(out,{recursive:true});
const save=(n,x)=>fs.writeFileSync(`${out}/${n}.json`,JSON.stringify(x,null,2));
const read=n=>JSON.parse(fs.readFileSync(`${out}/${n}.json`));
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Wrong database");
let state=fs.existsSync(privatePath)?JSON.parse(fs.readFileSync(privatePath)):null;
const persist=()=>fs.writeFileSync(privatePath,JSON.stringify(state),{mode:0o600});
const target=(await(await fetch("http://127.0.0.1:9232/json")).json()).find(t=>t.type==="page");
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
let seq=0;const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true})).result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const cookie=a=>Object.entries(a.cookies).map(([k,v])=>`${k}=${v}`).join("; ");
async function request(a,path,method="GET",body){
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:cookie(a)},body:body?JSON.stringify(body):undefined});
 for(const c of r.headers.getSetCookie()){const part=c.split(";")[0],i=part.indexOf("=");a.cookies[part.slice(0,i)]=part.slice(i+1);}
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=null;}
 return {path,status:r.status,data};
}
async function login(a,password,email){
 const payload={identifier:email,password,deviceLabel:"PERM-PROD-01 own verification device"};
 const first=await request(a,"/api/auth/login","POST",payload);
 if(first.status===202){
  const tokens=Object.values(a.cookies).map(v=>decodeURIComponent(v).split(".")[0]);
  const devices=(await pool.query("select id from user_devices where user_id=$1 and status='pending' and device_token=ANY($2::text[])",[a.id,tokens])).rows;
  if(devices.length!==1)throw Error("Cannot identify own pending device");
  a.deviceId=devices[0].id;
  await pool.query("update user_devices set status='approved',approved_at=now() where id=$1 and user_id=$2",[a.deviceId,a.id]);
 }else if(first.status!==200)throw Error(`Login failed ${first.status}`);
 const result=await request(a,"/api/auth/login","POST",payload);if(result.status!==200)throw Error(`Login failed ${result.status}`);
}
async function screen(a,path,label,expected){
 await call("Network.clearBrowserCookies");for(const[name,value]of Object.entries(a.cookies))await call("Network.setCookie",{name,value,url:base});
 await call("Network.setBypassServiceWorker",{bypass:true});await call("Network.setCacheDisabled",{cacheDisabled:true});
 await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await call("Page.navigate",{url:base+path});
 for(let i=0;i<70;i++){await wait(300);if(await evaluate(`document.body.innerText.toLowerCase().includes(${JSON.stringify(expected.toLowerCase())})`))break;}
 await wait(1000);
 const text=await evaluate("document.body.innerText");
 const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:78});
 fs.writeFileSync(`${out}/${label}.jpg`,Buffer.from(shot.data,"base64"));
 const result={userId:a.id,path,text,expectedVisible:text.toLowerCase().includes(expected.toLowerCase()),screenshot:`${label}.jpg`,documentStatus:(await request(a,path)).status};
 save(label,result);if(!result.expectedVisible)throw Error(`${label}: expected text absent`);return result;
}
const snapshot=async()=>({
 permissions:(await pool.query("select * from user_permissions order by id")).rows,
 flags:(await pool.query("select id,is_admin,is_owner,is_field_engineer,can_manage_permissions from users order by id")).rows,
 migration:(await pool.query("select * from app_settings where key like 'permission-access-preservation:PERM-PROD-01%' order by id")).rows,
});
try{
 const mode=process.argv[2];
 if(mode==="setup"||mode==="fixtures"){
  if(mode==="setup"){
  if(fs.existsSync(privatePath)||fs.existsSync(`${out}/before.json`))throw Error("Setup already exists");
  const initial=await snapshot();if(initial.migration.length)throw Error("Migration already completed; do not reset marker");
  save("original",initial);
  state={accounts:[],verification:{id:16,cookies:{}}};persist();
  const sessionsBefore=(await pool.query("select id from user_sessions where user_id=16")).rows.map(r=>r.id);
  if(!process.env.DEV_VERIFICATION_PASSWORD)throw Error("Verification secret missing");
  await login(state.verification,process.env.DEV_VERIFICATION_PASSWORD,"agent.verification@test.invalid");
  state.verification.newSessions=(await pool.query("select id from user_sessions where user_id=16")).rows.map(r=>r.id).filter(id=>!sessionsBefore.includes(id));persist();
  }
  if(state.accounts.length)throw Error("Fixtures already created");
  await screen(state.verification,"/account","verification-signin","Account Details");
  const site=(await pool.query("select s.id,s.name from sites s join user_site_access a on a.site_id=s.id where a.user_id=16 order by a.id limit 1")).rows[0];
  for(const [label,section,bit]of [["create","site_dprs","can_create"],["edit","site_dprs","can_edit"],["reports","site_dprs","can_view_reports"],["boq","qto_boq","can_view"],["none",null,null],["auditor","admin_settings","can_view"]]){
   const password=crypto.randomBytes(24).toString("base64url"),email=`permprod01-${label}@test.invalid`;
   const id=(await pool.query("insert into users(email,password_hash,full_name,session_policy,setup_complete) values($1,$2,$3,'sticky',true) returning id",[email,await bcrypt.hash(password,12),`PERM-PROD-01 ${label}`])).rows[0].id;
   const a={id,label,cookies:{}};state.accounts.push(a);persist();
   if(section)await pool.query(`insert into user_permissions(user_id,section_key,${bit}) values($1,$2,true)`,[id,section]);
   await pool.query("insert into user_site_access(user_id,site_id,access_level) values($1,$2,'view')",[id,site.id]);
   await login(a,password,email);persist();
  }
  state.dprId=(await pool.query("insert into dprs(date,site,engineer,dpr_status,author_user_id) values('2026-10-07',$1,'PERM-PROD-01 temporary','draft',$2) returning id",[site.name,state.accounts[0].id])).rows[0].id;persist();
  save("fixtures",{accounts:state.accounts.map(({id,label})=>({id,label})),dprId:state.dprId,verificationDeviceId:state.verification.deviceId,verificationNewSessions:state.verification.newSessions});
  save("before",await snapshot());
  const create=state.accounts[0];const api=await request(create,`/api/dprs/${state.dprId}`);
  save("api-before",{path:api.path,status:api.status});if(api.status!==403)throw Error(`Expected 403, got ${api.status}`);
  await screen(create,"/site/dashboard","create-before","No access");
 }else if(mode==="after"){
  save("after",await snapshot());
  const create=state.accounts[0],auditor=state.accounts.find(a=>a.label==="auditor");
  const api=await request(create,`/api/dprs/${state.dprId}`);save("api-after",{path:api.path,status:api.status});if(api.status!==200)throw Error(`Expected 200, got ${api.status}`);
  await screen(create,"/site/dashboard","create-after","Site Reports");
  const denied=await request(create,"/api/admin/permission-migration-audit");
  if(denied.status!==403)throw Error("Audit leaked to non-admin-section user");
  const audit=await request(auditor,"/api/admin/permission-migration-audit");
  save("audit-api",{deniedStatus:denied.status,allowedStatus:audit.status,data:audit.data});
  if(audit.status!==200||!audit.data.completed)throw Error("Audit unavailable");
  await screen(auditor,"/admin/permission-migration-audit","audit-screen","PERM-PROD-01 create");
 }else if(mode==="second"){
  const second=await snapshot();save("second",second);
  if(JSON.stringify(second)!==JSON.stringify(read("after")))throw Error("Second start changed permissions, flags or migration rows");
  save("second-start",{permissionsUnchanged:true,flagsUnchanged:true,markerAndAuditUnchanged:true});
 }else if(mode==="cleanup"){
  const deleted={};
  if(state.dprId)deleted.dprs=(await pool.query("delete from dprs where id=$1 returning id",[state.dprId])).rows;
  const ids=state.accounts.map(a=>a.id);
  for(const table of ["audit_logs","user_permissions","user_sessions","user_devices","user_site_access","push_subscriptions"]){
   deleted[table]=(await pool.query(`delete from ${table} where user_id=any($1::int[]) returning id`,[ids])).rows;
  }
  deleted.users=(await pool.query("delete from users where id=any($1::int[]) and email like 'permprod01-%@test.invalid' returning id",[ids])).rows;
  deleted.verificationSessions=(await pool.query("delete from user_sessions where id=any($1::int[]) and user_id=16 returning id",[state.verification.newSessions??[]])).rows;
  if(state.verification.deviceId)deleted.verificationDevice=(await pool.query("delete from user_devices where id=$1 and user_id=16 returning id",[state.verification.deviceId])).rows;
  const remaining={};
  for(const table of ["audit_logs","user_permissions","user_sessions","user_devices","user_site_access","push_subscriptions"]){
   remaining[table]=Number((await pool.query(`select count(*) n from ${table} where user_id=any($1::int[])`,[ids])).rows[0].n);
  }
  remaining.users=Number((await pool.query("select count(*) n from users where id=any($1::int[])",[ids])).rows[0].n);
  remaining.dprs=Number((await pool.query("select count(*) n from dprs where id=$1",[state.dprId])).rows[0].n);
  save("cleanup",{deleted,remaining,retained:"Durable migration completion marker and required historical audit rows (including deleted temporary subjects); never reset or deleted."});
  save("final",await snapshot());
  if(Object.values(remaining).some(Boolean))throw Error("Cleanup incomplete");
  fs.rmSync(privatePath);
 }else throw Error("Expected setup, after, second or cleanup");
 console.log(`${mode}: complete`);
}finally{ws.close();await pool.end();}
