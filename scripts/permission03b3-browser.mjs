// Development-only live Delete acceptance. No mocked responses, real-user writes or push events.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
const out=process.argv[3]==="repeat"?"reports/perm-03b3/repeat":"reports/perm-03b3", privateFile="/tmp/perm03b3-private.json";
fs.mkdirSync(out,{recursive:true});
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Wrong database");
const save=(name,x)=>fs.writeFileSync(`${out}/${name}.json`,JSON.stringify(x,null,2));
const load=(name,fallback)=>fs.existsSync(`${out}/${name}.json`)?JSON.parse(fs.readFileSync(`${out}/${name}.json`)):fallback;
const digest=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function snapshot(){
  const u=(await pool.query("select * from users order by id")).rows;
  const p=(await pool.query("select * from user_permissions order by id")).rows;
  return {counts:{users:u.length,permissions:p.length},checksums:{users:digest(u),permissions:digest(p)},
    users:u.map(({password_hash,...row})=>({...row,credentialChecksum:digest(password_hash)})),permissions:p};
}
let state=fs.existsSync(privateFile)?JSON.parse(fs.readFileSync(privateFile)):null;
const writes=load("writes",[]),evidence=load("browser-evidence",[]);
const target=(await(await fetch("http://127.0.0.1:9232/json")).json()).find(t=>t.type==="page");
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
let seq=0;const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.value;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await call("Network.enable");await call("Network.setBypassServiceWorker",{bypass:true});await call("Network.setCacheDisabled",{cacheDisabled:true});
await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
const cookieHeader=()=>Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join("; ");
const installCookies=async()=>{for(const[name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});};
async function screen(path,label,selector,expected){
  await call("Page.navigate",{url:state.base+path});
  for(let i=0;i<60;i++){
    await wait(350);
    if(await evaluate(`!document.body.innerText.includes("Loading page")&&document.body.innerText.includes(${JSON.stringify(expected)})`))break;
  }
  await wait(1600);
  if(selector)await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:"center"})`);
  if(path.endsWith("/settings"))await evaluate(`document.querySelector('[data-testid="mix-link-row-${state.linkId}"]')?.scrollIntoView({block:"center"})`);
  await wait(300);
  const info=await evaluate(`({url:location.pathname,text:document.body.innerText,controlCount:${selector?`document.querySelectorAll(${JSON.stringify(selector)}).length`:"null"}})`);
  const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:78});
  fs.writeFileSync(`${out}/${label}.jpg`,Buffer.from(shot.data,"base64"));
  const row={label,path,...info,screenshot:`${label}.jpg`};evidence.push(row);save("browser-evidence",evidence);return row;
}
async function request(path,method,body,expected){
  const r=await fetch(state.base+path,{method,headers:{"Content-Type":"application/json",cookie:cookieHeader()},body:body?JSON.stringify(body):undefined});
  const row={path,method,status:r.status};evidence.push(row);save("browser-evidence",evidence);
  if(r.status!==expected)throw Error(`${method} ${path}: ${r.status}, expected ${expected}: ${(await r.text()).slice(0,220)}`);
  await r.arrayBuffer();
}
async function permission(section,enabled){
  const before=(await pool.query("select * from user_permissions where user_id=$1 and section_key=$2",[state.userId,section])).rows[0];
  const after=(await pool.query("update user_permissions set can_delete=$3 where user_id=$1 and section_key=$2 returning *",[state.userId,section,enabled])).rows[0];
  writes.push({table:"user_permissions",before,after});save("writes",writes);
}
async function insert(table,sql,params){
  const row=(await pool.query(sql,params)).rows[0];writes.push({table,inserted:row});save("writes",writes);return row.id;
}
function privateSave(){fs.writeFileSync(privateFile,JSON.stringify(state),{mode:0o600});}
try{
  const mode=process.argv[2];
  if(mode==="setup"){
    if(fs.existsSync(`${out}/before.json`))throw Error("Refusing duplicate setup");
    save("before",await snapshot());
    // Reuse the existing approved ordinary session; do not reset its password or login timestamp.
    state=JSON.parse(fs.readFileSync("/tmp/perm03b-private/session.json"));
    const me=await fetch(state.base+"/api/auth/me",{headers:{cookie:cookieHeader()}});
    const user=(await me.json()).user;
    if(me.status!==200||user?.id!==16||user.isAdmin||user.isOwner)throw Error("Existing ordinary session unavailable");
    await installCookies();await screen("/account","ordinary-verification-account",null,"Account Details");
    evidence.push({path:"/api/auth/me",status:200,userId:16,sessionReused:true});save("browser-evidence",evidence);
    const before=load("before");
    const actionRows=before.permissions.filter(p=>p.can_delete||p.can_export||p.can_notify);
    save("real-action-grants",{rows:actionRows,ordinaryUserViolations:actionRows.filter(p=>{const u=before.users.find(u=>u.id===p.user_id);return !u.is_admin&&!u.is_owner;})});
    const subscriptions=(await pool.query("select id,user_id from push_subscriptions order by id")).rows;
    const recipients=(await pool.query(`select p.section_key,p.user_id,count(s.id)::int subscriptions
      from user_permissions p join users u on u.id=p.user_id join push_subscriptions s on s.user_id=u.id
      where p.can_notify and u.notifications_enabled group by p.section_key,p.user_id order by p.section_key`)).rows;
    save("push-safety-preflight",{subscriptions,eligibleRealRecipients:recipients,eventFired:false,
      reason:"Existing real administrator has Notify grants and active subscriptions. Sending a section event would risk notifying that user. No permission, flag, subscription or push transport changed."});
    const base=state.base;
    const password=crypto.randomBytes(30).toString("base64url");
    const userId=(await pool.query("insert into users(email,password_hash,full_name,session_policy,setup_complete) values($1,$2,$3,'sticky',true) returning id",["perm03b3@test.invalid",await bcrypt.hash(password,12),"PERM-03B-3 Temporary Verification"])).rows[0].id;
    state={base,userId,cookies:{}};privateSave();writes.push({table:"users",inserted:{id:userId,email:"perm03b3@test.invalid",flags:"ordinary defaults; unchanged"}});
    for(const section of ["qto_boq","work_programme","project_scope"])
      await insert("user_permissions","insert into user_permissions(user_id,section_key,can_view,can_edit) values($1,$2,true,true) returning *",[userId,section]);
    const site=(await pool.query("select site_id from user_site_access where user_id=16 order by id limit 1")).rows[0].site_id;
    await insert("user_site_access","insert into user_site_access(user_id,site_id,access_level) values($1,$2,'view') returning *",[userId,site]);
    state.projectId=await insert("boq_projects","insert into boq_projects(name,site_id,start_date,total_months,chainage_from,chainage_to,corridor_confirmed) values('PERM-03B-3 temporary acceptance',$1,'2026-10-01',12,0,1000,1) returning *",[site]);privateSave();
    state.itemId=await insert("boq_items","insert into boq_items(boq_project_id,description,unit,boq_qty,current_qty,item_code) values($1,'PERM-03B-3 temporary item','Cum',100,100,'PERM03B3') returning *",[state.projectId]);privateSave();
    state.linkId=await insert("boq_mix_template_links","insert into boq_mix_template_links(boq_project_id,mix_type,mix_template_name) values($1,'DBM','PERM-03B-3 temporary link') returning *",[state.projectId]);privateSave();
    state.scopeId=await insert("project_scope_segments","insert into project_scope_segments(boq_project_id,segment_type,chainage_from,chainage_to,status) values($1,'working_reach',0,1000,'draft') returning *",[state.projectId]);privateSave();
    async function login(){
      const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",cookie:cookieHeader()},body:JSON.stringify({identifier:"perm03b3@test.invalid",password,deviceLabel:"PERM-03B-3 own device"})});
      for(const c of r.headers.getSetCookie()){const part=c.split(";")[0],i=part.indexOf("=");state.cookies[part.slice(0,i)]=part.slice(i+1);}return r.status;
    }
    if(await login()!==202)throw Error("Expected pending own device");
    const devices=(await pool.query("update user_devices set status='approved',approved_at=now() where user_id=$1 and status='pending' returning id",[userId])).rows;
    if(devices.length!==1)throw Error("Own device mismatch");writes.push({table:"user_devices",approved:devices});
    if(await login()!==200)throw Error("Temporary login failed");
    privateSave();save("writes",writes);console.log({userId,projectId:state.projectId});
  }else if(mode==="settings-screens"){
    await installCookies();await permission("work_programme",false);
    const path=`/work-program/${state.projectId}/settings`,selector=`[data-testid="button-delete-mix-link-${state.linkId}"]`;
    const denied=await screen(path,"work_programme-delete-denied",selector,"PERM-03B-3 temporary link");
    if(denied.controlCount!==0)throw Error("Delete control present without Delete");
    await request(`/api/boq/projects/${state.projectId}/mix-links/${state.linkId}`,"DELETE",null,403);
    await permission("work_programme",true);
    const allowed=await screen(path,"work_programme-delete-allowed",selector,"PERM-03B-3 temporary link");
    if(allowed.controlCount!==1)throw Error("Delete control absent with Delete");
    await request(`/api/boq/projects/${state.projectId}/mix-links/${state.linkId}`,"DELETE",null,200);
  }else if(mode==="delete"){
    await installCookies();
    const cases=[
      ["qto_boq",`/work-program/${state.projectId}`,`[data-testid="button-delete-item-${state.itemId}"]`,`/api/boq/items/${state.itemId}`,"PERM03B3"],
      ["work_programme",`/work-program/${state.projectId}/settings`,`[data-testid="button-delete-mix-link-${state.linkId}"]`,`/api/boq/projects/${state.projectId}/mix-links/${state.linkId}`,"PERM-03B-3 temporary link"],
      ["project_scope",`/work-program/${state.projectId}/scope`,'button[title="Delete draft"]',`/api/boq/scope-segments/${state.scopeId}`,"Draft"],
    ];
    for(const[section,path,selector,api,expected]of cases){
      await permission(section,false);
      const denied=await screen(path,`${section}-delete-denied`,selector,expected);
      if(denied.controlCount!==0)throw Error(`${section}: delete control visible without Delete`);
      await request(api,"DELETE",null,403);
      if(section==="qto_boq"){
        await request(api,"PATCH",{description:"PERM-03B-3 edited without Delete"},200);
        await screen(path,"edit-without-delete-saved",selector,"PERM-03B-3 edited without Delete");
        await request(api,"DELETE",null,403);
      }
      await permission(section,true);
      const allowed=await screen(path,`${section}-delete-allowed`,selector,section==="qto_boq"?"PERM-03B-3 edited without Delete":expected);
      if(allowed.controlCount<1)throw Error(`${section}: delete control absent with Delete`);
    }
    for(const[,,,api]of cases)await request(api,"DELETE",null,200);
    console.log(evidence.filter(e=>e.status));
  }else if(mode==="cleanup"){
    const deleted={};
    for(const table of ["boq_items","boq_mix_template_links","project_scope_segments"]){
      deleted[table]=(await pool.query(`delete from ${table} where boq_project_id=$1 returning id`,[state.projectId])).rows;
    }
    deleted.boq_program_settings=(await pool.query("delete from boq_program_settings where project_id=$1 returning id",[state.projectId])).rows;
    deleted.boq_projects=(await pool.query("delete from boq_projects where id=$1 and upper(name)=upper('PERM-03B-3 temporary acceptance') returning id",[state.projectId])).rows;
    for(const table of ["user_permissions","user_devices","user_sessions","user_site_access","push_subscriptions"]){
      deleted[table]=(await pool.query(`select id from ${table} where user_id=$1`,[state.userId])).rows;
    }
    // Audit rows created by the authorized temporary account are test records too.
    deleted.audit_logs=(await pool.query("delete from audit_logs where user_id=$1 returning id",[state.userId])).rows;
    deleted.users=(await pool.query("delete from users where id=$1 and email='perm03b3@test.invalid' returning id",[state.userId])).rows;
    const remaining={};
    for(const table of ["user_permissions","user_devices","user_sessions","user_site_access","push_subscriptions","audit_logs"])
      remaining[table]=Number((await pool.query(`select count(*) n from ${table} where user_id=$1`,[state.userId])).rows[0].n);
    remaining.users=Number((await pool.query("select count(*) n from users where id=$1",[state.userId])).rows[0].n);
    remaining.projects=Number((await pool.query("select count(*) n from boq_projects where id=$1",[state.projectId])).rows[0].n);
    for(const table of ["boq_items","boq_mix_template_links","project_scope_segments"])
      remaining[table]=Number((await pool.query(`select count(*) n from ${table} where boq_project_id=$1`,[state.projectId])).rows[0].n);
    save("cleanup",{deleted,remaining,apiDeleted:evidence.filter(e=>e.method==="DELETE"&&e.status===200).map(e=>e.path)});
    save("after",await snapshot());
    if(Object.values(remaining).some(Boolean))throw Error("Cleanup incomplete");
    fs.rmSync(privateFile,{force:true});
    console.log(remaining);
  }else throw Error("Expected setup, delete, cleanup");
}finally{ws.close();await pool.end();}
