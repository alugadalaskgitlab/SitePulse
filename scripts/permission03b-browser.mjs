// Real signed-in HTTP/browser acceptance. No intercepted responses or auth bypass.
import fs from "node:fs";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import WebSocket from "ws";
const pool = new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
if ((await pool.query("select current_database() name")).rows[0].name !== "sitelog_dev") throw new Error("Wrong database");
const out="reports/perm-03b";
const stateFile="/tmp/perm03b-private/acceptance.json";
const target=(await (await fetch("http://127.0.0.1:9232/json")).json()).find(x=>x.type==="page");
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>ws.once("open",r));
let seq=0;const pending=new Map();
ws.on("message",raw=>{const m=JSON.parse(raw);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>(await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true})).result?.value;
await call("Network.enable");
await call("Network.setBypassServiceWorker",{bypass:true});
await call("Network.setCacheDisabled",{cacheDisabled:true});
await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,"utf8")):null;
const evidence=fs.existsSync(`${out}/browser-evidence.json`)?JSON.parse(fs.readFileSync(`${out}/browser-evidence.json`,"utf8")):[];
const writes=fs.existsSync(`${out}/temporary-writes.json`)?JSON.parse(fs.readFileSync(`${out}/temporary-writes.json`,"utf8")):[];
const save=()=>{fs.writeFileSync(`${out}/browser-evidence.json`,JSON.stringify(evidence,null,2));fs.writeFileSync(`${out}/temporary-writes.json`,JSON.stringify(writes,null,2));};
async function insert(table,sql,params){const row=(await pool.query(sql,params)).rows[0];writes.push({table,inserted:row});save();return row.id;}
async function screen(path,label,selector){
  await call("Page.navigate",{url:`${state.base}${path}`});
  await delay(2400);
  for(let i=0;i<20;i++){
    if(await evaluate("document.body.innerText.trim().length>100"))break;
    await delay(500);
  }
  const result=await evaluate(`({url:location.pathname,title:document.title,text:document.body.innerText.slice(0,6500),controlCount:${selector?`document.querySelectorAll(${JSON.stringify(selector)}).length`:"null"}})`);
  const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:75});
  fs.writeFileSync(`${out}/${label}.jpg`,Buffer.from(shot.data,"base64"));
  const row={label,path,screenshot:`${label}.jpg`,...result};
  evidence.push(row);save();return row;
}
async function request(path,method="GET"){
  const r=await fetch(`${state.base}${path}`,{method,headers:{cookie:Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join("; ")}});
  const row={path,method,status:r.status};evidence.push(row);save();await r.arrayBuffer();return row;
}
async function permission(section,patch){
  const cols=Object.keys(patch);if(cols.some(c=>!/^can_(view|create|edit|delete|view_reports|export|approve|notify)$/.test(c)))throw new Error("Invalid permission column");
  const before=(await pool.query("select * from user_permissions where user_id=$1 and section_key=$2",[state.userId,section])).rows[0];
  const after=(await pool.query(`update user_permissions set ${cols.map((c,i)=>`${c}=$${i+3}`).join(",")} where user_id=$1 and section_key=$2 returning *`,[state.userId,section,...Object.values(patch)])).rows[0];
  writes.push({table:"user_permissions",before,after});save();
}
try {
  const mode=process.argv[2];
  if(mode==="setup"){
    if(state && !(await pool.query("select id from users where id=$1",[state.userId])).rowCount)state=null;
    if(state)throw new Error("Temporary acceptance state already exists");
    const password=crypto.randomBytes(30).toString("base64url");
    const userId=(await pool.query("insert into users(email,password_hash,full_name,session_policy,setup_complete) values($1,$2,$3,'sticky',true) returning id",["perm03b.acceptance@test.invalid",await bcrypt.hash(password,12),"PERM-03B Temporary Acceptance"])).rows[0].id;
    state={base:"http://127.0.0.1:5000",userId,cookies:{}};
    fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});
    writes.push({table:"users",inserted:{id:userId,email:"perm03b.acceptance@test.invalid",flags:"ordinary non-admin non-owner"}});
    const sections=["qto_boq","work_programme","work_programme_review","planning_masters","norms_library","edit_requests_review","project_scope","site_dprs"];
    for(const section of sections)await insert("user_permissions","insert into user_permissions(user_id,section_key,can_view,can_view_reports) values($1,$2,true,true) returning *",[userId,section]);
    const site=(await pool.query("select site_id from user_site_access where user_id=16 order by id limit 1")).rows[0].site_id;
    await insert("user_site_access","insert into user_site_access(user_id,site_id,access_level) values($1,$2,'view') returning *",[userId,site]);
    state.projectId=await insert("boq_projects","insert into boq_projects(name,site_id,start_date,total_months,chainage_from,chainage_to,corridor_confirmed) values('PERM-03B temporary acceptance',$1,'2026-10-01',12,0,1000,1) returning *",[site]);
    state.itemId=await insert("boq_items","insert into boq_items(boq_project_id,description,unit,boq_qty,current_qty,item_code) values($1,'PERM-03B temporary item','Cum',100,100,'PERM03B') returning *",[state.projectId]);
    state.linkId=await insert("boq_mix_template_links","insert into boq_mix_template_links(boq_project_id,mix_type,mix_template_name) values($1,'DBM','PERM-03B temporary link') returning *",[state.projectId]);
    state.scopeId=await insert("project_scope_segments","insert into project_scope_segments(boq_project_id,segment_type,chainage_from,chainage_to,status) values($1,'working_reach',0,1000,'draft') returning *",[state.projectId]);
    async function login(){
      const r=await fetch(`${state.base}/api/auth/login`,{method:"POST",headers:{"Content-Type":"application/json",cookie:Object.entries(state.cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:JSON.stringify({identifier:"perm03b.acceptance@test.invalid",password,deviceLabel:"PERM-03B temporary device"})});
      for(const c of r.headers.getSetCookie()){const [part]=c.split(";");const i=part.indexOf("=");state.cookies[part.slice(0,i)]=part.slice(i+1);}
      return r.status;
    }
    const first=await login();
    if(first!==202)throw new Error(`Expected pending temporary device: ${first}`);
    const device=(await pool.query("update user_devices set status='approved',approved_at=now(),approved_by_user_id=null where user_id=$1 and status='pending' returning id",[userId])).rows;
    writes.push({table:"user_devices",approved:device});
    const second=await login();if(second!==200)throw new Error(`Temporary login: ${second}`);
    fs.writeFileSync(stateFile,JSON.stringify(state),{mode:0o600});save();
    console.log({userId,projectId:state.projectId,firstLogin:first,login:second});
  } else if(mode==="durable"){
    const session=JSON.parse(fs.readFileSync("/tmp/perm03b-private/session.json","utf8"));state=session;
    for(const [name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});
    await screen("/plant/vendor-bills","durable-account");
    console.log({durableAccountScreen:true});
  } else if(mode==="report-screens"){
    const keys=Object.keys(JSON.parse(fs.readFileSync("shared/permission-actions.generated.json","utf8")));
    for(const key of keys){
      if(!(await pool.query("select id from user_permissions where user_id=$1 and section_key=$2",[state.userId,key])).rowCount)
        await insert("user_permissions","insert into user_permissions(user_id,section_key,can_view,can_view_reports) values($1,$2,true,true) returning *",[state.userId,key]);
    }
    for(const [name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});
    const pages=["/reports/equipment-performance","/site/purchases","/plant/rmc/daily-report","/plant/variance-report","/plant/audit-report","/plant/diesel-procurement","/plant/dispatch-summary","/plant/heating-trends","/admin/reports","/reports/hub"];
    const checks=[];
    for(const path of pages){
      const shot=await screen(path,`report-screen-${path.replaceAll("/","-")}`);
      const visibleOutputControls=await evaluate(`Array.from(document.querySelectorAll('button,a[download]')).filter(e=>e.getClientRects().length&&/export|download|print|excel|pdf/i.test(e.innerText)).map(e=>e.innerText)`);
      const status=await request(path);
      checks.push({path,status:status.status,screenshot:shot.screenshot,visibleOutputControls,denied:/No access|404|Not Found/i.test(shot.text||""),text:shot.text});
    }
    fs.writeFileSync(`${out}/report-screen-checks.json`,JSON.stringify(checks,null,2));
    console.log(checks.map(({path,visibleOutputControls,denied})=>({path,visibleOutputControls,denied})));
  } else if(mode==="repeat-qto"){
    for(const [name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});
    await permission("qto_boq",{can_view:true,can_delete:false});
    const id=await insert("boq_items","insert into boq_items(boq_project_id,description,unit,boq_qty,current_qty,item_code) values($1,'PERM-03B repeat temporary item','Cum',100,100,'PERM03B-R') returning *",[state.projectId]);
    await screen(`/work-program/${state.projectId}`,"qto-repeat-delete-denied",`[data-testid="button-delete-item-${id}"]`);
    await request(`/api/boq/items/${id}`,"DELETE");
    await permission("qto_boq",{can_delete:true});
    await screen(`/work-program/${state.projectId}`,"qto-repeat-delete-allowed",`[data-testid="button-delete-item-${id}"]`);
    await request(`/api/boq/items/${id}`,"DELETE");
  } else if(mode==="acceptance"){
    if(!state?.userId)throw new Error("Set up temporary account first");
    for(const [name,value]of Object.entries(state.cookies))await call("Network.setCookie",{name,value,url:state.base});
    const cases=[
      ["qto_boq",`/work-program/${state.projectId}`,`[data-testid="button-delete-item-${state.itemId}"]`,`/api/boq/items/${state.itemId}`],
      ["work_programme",`/work-program/${state.projectId}/settings`,`[data-testid="button-delete-mix-link-${state.linkId}"]`,`/api/boq/projects/${state.projectId}/mix-links/${state.linkId}`],
      ["project_scope",`/work-program/${state.projectId}/scope`,'button[title="Delete draft"]',`/api/boq/scope-segments/${state.scopeId}`],
    ];
    // Capture both UI states before deleting records needed by another screen.
    for(const[section,page,selector,api]of cases){
      await permission(section,{can_delete:false});
      await screen(page,`${section}-delete-denied`,selector);
      await request(api,"DELETE");
      await permission(section,{can_delete:true});
      await screen(page,`${section}-delete-allowed`,selector);
    }
    const report=`/reports/progress?projectId=${state.projectId}`;
    await screen(report,"reports-without-export",'[data-testid="button-export"]');
    await request(`/api/reports/progress?projectId=${state.projectId}`);
    await request(`/api/reports/progress/export?projectId=${state.projectId}`);
    await permission("site_dprs",{can_export:true});
    await screen(report,"reports-with-export",'[data-testid="button-export"]');
    await request(`/api/reports/progress/export?projectId=${state.projectId}`);
    for(const[,,,api]of cases)await request(api,"DELETE");
    const keys=[
      ["planning_masters","/work-program/planning-masters","/api/planning/equipment-types"],
      ["work_programme",`/work-program/${state.projectId}/programme`,`/api/boq/projects/${state.projectId}/programme`],
      ["work_programme_review",`/work-program/${state.projectId}/resource-review`,`/api/boq/projects/${state.projectId}/resource-review`],
      ["norms_library","/norms","/api/snl/sources"],
      ["edit_requests_review","/edit-requests","/api/edit-requests/pending"],
    ];
    for(const[section,page,api]of keys){
      for(const[k]of keys)await permission(k,{can_view:false});
      await permission("qto_boq",{can_view:false});
      await screen(page,`${section}-view-denied`);await request(api);
      await permission(section,{can_view:true});
      await screen(page,`${section}-view-allowed`);await request(api);
    }
    console.log({evidenceRows:evidence.length,temporaryUser:state.userId});
  } else if(mode==="cleanup"){
    if(!state?.userId)throw new Error("Missing temporary state");
    const tables=["project_scope_segments","boq_mix_template_links","boq_items","boq_categories"];
    for(const table of tables){const r=await pool.query(`delete from ${table} where boq_project_id=$1 returning id`,[state.projectId]);writes.push({table,deleted:r.rows});}
    const settings=await pool.query("delete from boq_program_settings where project_id=$1 returning id",[state.projectId]);
    writes.push({table:"boq_program_settings",deleted:settings.rows});
    await pool.query("delete from boq_projects where id=$1 and name='PERM-03B temporary acceptance'",[state.projectId]);
    await pool.query("delete from users where id=$1 and email='perm03b.acceptance@test.invalid'",[state.userId]);
    const checks={};
    for(const t of ["user_permissions","user_devices","user_sessions","user_site_access"])checks[t]=Number((await pool.query(`select count(*) n from ${t} where user_id=$1`,[state.userId])).rows[0].n);
    checks.users=Number((await pool.query("select count(*) n from users where id=$1",[state.userId])).rows[0].n);
    checks.projects=Number((await pool.query("select count(*) n from boq_projects where id=$1",[state.projectId])).rows[0].n);
    fs.writeFileSync(`${out}/cleanup.json`,JSON.stringify({userId:state.userId,projectId:state.projectId,remainingRows:checks},null,2));save();
    console.log(checks);
  } else throw new Error("Expected setup, durable, acceptance or cleanup");
} finally {ws.close();await pool.end();}
