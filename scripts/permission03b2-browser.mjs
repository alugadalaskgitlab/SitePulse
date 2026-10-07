// Live development-only permission evidence; no intercepted API responses.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
if (!process.env.DEV_DATABASE_URL) throw Error("Development connection missing");
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Wrong database");
const out="reports/perm-03b2"; fs.mkdirSync(out,{recursive:true});
const privateFile="/tmp/perm03b2-session.json";
const mode=process.argv[2];
let state=fs.existsSync(privateFile)?JSON.parse(fs.readFileSync(privateFile,"utf8")):null;
const load=(name,fallback)=>fs.existsSync(`${out}/${name}.json`)?JSON.parse(fs.readFileSync(`${out}/${name}.json`,"utf8")):fallback;
const save=(name,data)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2));
const evidence=load("browser-evidence",[]),writes=load("writes",[]);
const hash=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function snapshot(){
  const users=(await pool.query("select * from users order by id")).rows,permissions=(await pool.query("select * from user_permissions order by id")).rows;
  return {users:users.map(({password_hash,...u})=>({...u,credentialChecksum:hash(password_hash)})),permissions,counts:{users:users.length,permissions:permissions.length},checksums:{users:hash(users),permissions:hash(permissions)}};
}
const target=(await(await fetch("http://127.0.0.1:9232/json")).json()).find(t=>t.type==="page");
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>ws.once("open",r));let seq=0;const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await call("Network.enable");await call("Network.setBypassServiceWorker",{bypass:true});await call("Network.setCacheDisabled",{cacheDisabled:true});
await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
async function screen(path,label,expected){
  await call("Page.navigate",{url:state.base+path});await wait(1500);
  for(let i=0;i<50;i++){
    const ready=await evaluate(`!document.body.innerText.includes("Loading page") && document.body.innerText.length>150 && ${expected?`document.body.innerText.includes(${JSON.stringify(expected)})`:"true"}`);
    if(ready)break;await wait(400);
  }
  await wait(800);
  const visible=await evaluate(`({url:location.pathname,text:document.body.innerText,outputs:Array.from(document.querySelectorAll('button,a[download]')).filter(e=>e.getClientRects().length&&/export|download|print|excel|pdf/i.test(e.innerText)).map(e=>e.innerText),exportCount:document.querySelectorAll('[data-testid="button-export"]').length})`);
  const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:72});
  fs.writeFileSync(`${out}/${label}.jpg`,Buffer.from(shot.data,"base64"));
  const row={label,path,screenshot:`${label}.jpg`,...visible};evidence.push(row);save("browser-evidence",evidence);return row;
}
async function request(path,method="GET",body){
  const r=await fetch(state.base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
  const row={path,method,status:r.status};evidence.push(row);save("browser-evidence",evidence);await r.arrayBuffer();return r.status;
}
async function grant(keys,{edit=false,exportKey=null}={}){
  const before=(await pool.query("select * from user_permissions where user_id=$1 order by id",[state.userId])).rows;
  const after=(await pool.query("update user_permissions set can_view=section_key=ANY($2::text[]),can_edit=(section_key='work_programme' and $3),can_export=(section_key=$4) IS TRUE where user_id=$1 returning *",[state.userId,keys,edit,exportKey])).rows;
  writes.push({table:"user_permissions",before,after});save("writes",writes);
}
try{
  if(mode==="setup"){
    if(fs.existsSync(`${out}/before.json`))throw Error("Baseline exists; refusing duplicate setup");
    save("before",await snapshot());
    // Reuse the already signed-in, approved ordinary verification device.
    const existing=await evaluate(`fetch('/api/auth/me').then(async r=>({status:r.status,user:await r.json()}))`);
    if(existing.status!==200 || (existing.user.user??existing.user).id!==16)throw Error("Expected existing ordinary verification sign-in");
    const currentOrigin=await evaluate("location.origin");state={base:currentOrigin};
    await screen("/account","verification-account","Account Details");
    save("verification-session",{status:existing.status,userId:16,path:"/account",screenshot:"verification-account.jpg",reused:true});
    const preservation=[];
    const before=load("before",{});
    for(const u of before.users.filter(u=>!u.is_admin&&!u.is_owner)){
      if(!before.permissions.some(p=>p.user_id===u.id&&p.section_key==="qto_boq"&&p.can_view))continue;
      for(const key of ["planning_masters","work_programme","work_programme_review","norms_library"]){
        const row=before.permissions.find(p=>p.user_id===u.id&&p.section_key===key);
        if(!row?.can_view)throw Error(`Missing additive View ${u.id}/${key}; stop for explicit tracked migration`);
        preservation.push({userId:u.id,section:key,before:true,after:true,written:false,permissionId:row.id});
      }
    }save("view-preservation",preservation);
    const password=crypto.randomBytes(30).toString("base64url");
    const user=(await pool.query("insert into users(email,password_hash,full_name,session_policy,setup_complete) values($1,$2,$3,'sticky',true) returning id",["perm03b2@test.invalid",await bcrypt.hash(password,12),"PERM-03B-2 Temporary Verification"])).rows[0];
    state={base:currentOrigin,userId:user.id,cookies:{}};
    fs.writeFileSync(privateFile,JSON.stringify(state),{mode:0o600});
    writes.push({table:"users",inserted:{id:user.id,email:"perm03b2@test.invalid"}});
    for(const key of Object.keys(JSON.parse(fs.readFileSync("shared/permission-actions.generated.json","utf8")))){
      const row=(await pool.query("insert into user_permissions(user_id,section_key,can_view_reports) values($1,$2,true) returning *",[user.id,key])).rows[0];
      writes.push({table:"user_permissions",inserted:row});
    }
    const sites=(await pool.query("select site_id from user_site_access where user_id=16")).rows;
    for(const s of sites){const row=(await pool.query("insert into user_site_access(user_id,site_id,access_level) values($1,$2,'view') returning *",[user.id,s.site_id])).rows[0];writes.push({table:"user_site_access",inserted:row});}
    state.projectId=(await pool.query("insert into boq_projects(name,site_id,start_date,total_months,chainage_from,chainage_to,corridor_confirmed) values('PERM-03B-2 temporary',$1,'2026-10-01',12,0,1000,1) returning id",[sites[0].site_id])).rows[0].id;
    writes.push({table:"boq_projects",inserted:{id:state.projectId}});
    const login=async()=>{const r=await fetch(state.base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",cookie:Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:JSON.stringify({identifier:"perm03b2@test.invalid",password,deviceLabel:"PERM-03B-2 own device"})});for(const c of r.headers.getSetCookie()){const part=c.split(";")[0],i=part.indexOf("=");state.cookies[part.slice(0,i)]=part.slice(i+1);}return r.status;};
    if(await login()!==202)throw Error("Expected own pending device");
    const tokens=Object.values(state.cookies).map(v=>decodeURIComponent(v).split(".")[0]);
    const dev=(await pool.query("update user_devices set status='approved',approved_at=now() where user_id=$1 and status='pending' and device_token=ANY($2::text[]) returning id",[user.id,tokens])).rows;
    if(dev.length!==1)throw Error("Own device mismatch");writes.push({table:"user_devices",approved:dev});
    if(await login()!==200)throw Error("Login failed");
    fs.writeFileSync(privateFile,JSON.stringify(state),{mode:0o600});save("writes",writes);
    console.log({userId:state.userId,projectId:state.projectId,login:200});
  }else if(mode==="evidence"){
    save("earlier-attempt-evidence",evidence.slice());
    const verification=evidence.filter(e=>e.label==="verification-account");
    evidence.splice(0,evidence.length,...verification);
    for(const[name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});
    await grant(["work_programme"],{edit:true});
    await screen(`/work-program/${state.projectId}/programme`,"programme-only","Work");
    await request(`/api/boq/projects/${state.projectId}/programme`);
    await screen("/work-program/planning-masters","programme-denies-planning","No access");await request("/api/planning/equipment-types");
    await screen(`/work-program/${state.projectId}/settings`,"programme-save","Settings");
    const saveStatus=await request(`/api/boq/projects/${state.projectId}/program-settings`,"PUT",{workingDaysPerMonth:24});
    if(saveStatus!==200)throw Error(`Programme save failed ${saveStatus}`);
    await screen(`/work-program/${state.projectId}/settings`,"programme-saved","Settings");
    await grant(["planning_masters"]);
    await screen("/work-program/planning-masters","planning-only","Planning Masters");await request("/api/planning/equipment-types");
    await screen(`/work-program/${state.projectId}/programme`,"planning-denies-programme","No access");await request(`/api/boq/projects/${state.projectId}/programme`);
    for(const [key,path,api,other]of [["norms_library","/norms","/api/snl/sources","/edit-requests"],["edit_requests_review","/edit-requests","/api/edit-requests/pending","/norms"]]){
      await grant([key]);await screen(path,`${key}-allowed`);await request(api);await screen(other,`${key}-denies-other`,"No access");await request(key==="norms_library"?"/api/edit-requests/pending":"/api/snl/sources");
    }
    await grant(["site_dprs"]);
    await screen(`/reports/progress?projectId=${state.projectId}`,"reports-no-export","Progress");await request(`/api/reports/progress/export?projectId=${state.projectId}`);
    await grant(["site_dprs"],{exportKey:"site_dprs"});
    await screen(`/reports/progress?projectId=${state.projectId}`,"reports-export-allowed","Progress");await request(`/api/reports/progress/export?projectId=${state.projectId}`);
    console.log(evidence.filter(e=>e.status));
  }else if(mode==="reports"){
    await grant(Object.keys(JSON.parse(fs.readFileSync("shared/permission-actions.generated.json","utf8"))));
    for(const[name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});
    const pages=["/reports/hub","/reports/equipment-performance","/reports/progress","/site/purchases","/plant/variance-report","/plant/audit-report","/plant/diesel-procurement","/plant/daily-reports","/plant/daily-report","/plant/dispatch-summary","/plant/heating-trends","/plant/rmc/daily-report","/plant/rmc/batch-records","/plant/rmc/cube-tests","/plant/rmc/delivery-challans","/admin/reports","/admin/mix-impact","/admin/mix-comparison","/admin/scenario-comparison"];
    pages.push("/admin/management-report");
    const dprs=await evaluate(`fetch('/api/dprs').then(r=>r.json()).then(x=>Array.isArray(x)?x:(x.dprs??[]))`);
    if(dprs?.length)pages.push(`/site/report/${dprs[0].id}`);
    const checks=[];
    for(const path of pages){const shot=await screen(path,`report-${path.replaceAll("/","-")}`);checks.push({path,screenshot:shot.screenshot,outputs:shot.outputs,denied:/No access|Access denied|404|Not Found/i.test(shot.text),status:await request(path)});}
    save("report-screen-checks",checks);console.log(checks);
  }else if(mode==="cleanup"){
    const deleted={};
    deleted.boq_program_settings=(await pool.query("delete from boq_program_settings where project_id=$1 returning id",[state.projectId])).rows;
    deleted.boq_projects=(await pool.query("delete from boq_projects where id=$1 and upper(name)=upper('PERM-03B-2 temporary') returning id",[state.projectId])).rows;
    for(const table of ["user_permissions","user_devices","user_sessions","user_site_access"]){
      deleted[table]=(await pool.query(`select id from ${table} where user_id=$1`,[state.userId])).rows;
    }
    deleted.users=(await pool.query("delete from users where id=$1 and email='perm03b2@test.invalid' returning id",[state.userId])).rows;
    const remaining={};
    for(const table of ["user_permissions","user_devices","user_sessions","user_site_access"])remaining[table]=Number((await pool.query(`select count(*) n from ${table} where user_id=$1`,[state.userId])).rows[0].n);
    remaining.users=Number((await pool.query("select count(*) n from users where id=$1",[state.userId])).rows[0].n);
    remaining.projects=Number((await pool.query("select count(*) n from boq_projects where id=$1",[state.projectId])).rows[0].n);
    save("cleanup",{userId:state.userId,projectId:state.projectId,deleted,remaining});save("after",await snapshot());
    if(Object.values(remaining).some(Boolean))throw Error("Cleanup incomplete");
    console.log(remaining);
  }else if(mode==="cleanup-final"){
    const previous=load("cleanup",{});
    previous.deleted.boq_projects=(await pool.query("delete from boq_projects where id=$1 and upper(name)=upper('PERM-03B-2 temporary') returning id",[state.projectId])).rows;
    previous.remaining.projects=Number((await pool.query("select count(*) n from boq_projects where id=$1",[state.projectId])).rows[0].n);
    if(Object.values(previous.remaining).some(Boolean))throw Error("Cleanup incomplete");
    save("cleanup",previous);save("after",await snapshot());console.log(previous.remaining);
  }else throw Error("Expected setup, evidence, reports, cleanup");
}finally{ws.close();await pool.end();}
