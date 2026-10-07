// One real cancellation; two real browser subscriptions; no mocked delivery.
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import WebSocket from "ws";
const out="reports/perm-03b3/notify-rerun/live-final";
fs.mkdirSync(out,{recursive:true});
const save=(n,x)=>fs.writeFileSync(`${out}/${n}.json`,JSON.stringify(x,null,2));
if(fs.existsSync(`${out}/event.json`))throw Error("Refusing to fire a second event");
const pool=new pg.Pool({connectionString:process.env.DEV_DATABASE_URL});
if((await pool.query("select current_database() n")).rows[0].n!=="sitelog_dev")throw Error("Wrong database");
const base="http://127.0.0.1:5000", accounts=[], sockets=[];
let dprId;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const hash=x=>crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
async function snapshot(){
 const users=(await pool.query("select * from users order by id")).rows;
 const permissions=(await pool.query("select * from user_permissions order by id")).rows;
 const subs=(await pool.query("select * from push_subscriptions where user_id=2 or id in(4,5) order by id")).rows;
 return {users:{count:users.length,checksum:hash(users)},permissions:{count:permissions.length,checksum:hash(permissions)},ownerSubscriptions:subs.map(s=>({id:s.id,userId:s.user_id})),ownerSubscriptionChecksum:hash(subs)};
}
save("before",await snapshot());
async function browser(port){
 const target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==="page");
 const ws=new WebSocket(target.webSocketDebuggerUrl);sockets.push(ws);
 await new Promise(r=>ws.once("open",r));let seq=0;const pending=new Map();
 ws.on("message",raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value;};
 return {call,evaluate};
}
async function request(a,path,method="GET",body){
 const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",cookie:Object.entries(a.cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:body?JSON.stringify(body):undefined});
 for(const c of r.headers.getSetCookie()){const part=c.split(";")[0],i=part.indexOf("=");a.cookies[part.slice(0,i)]=part.slice(i+1);}
 const data=await r.json();return {status:r.status,data};
}
try{
 for(const [enabled,port]of [[false,9232],[true,9233]]){
  const password=crypto.randomBytes(24).toString("base64url"),email=`perm03b3-notify-${enabled?'on':'off'}@test.invalid`;
  const id=(await pool.query("insert into users(email,password_hash,full_name,session_policy,setup_complete,notifications_enabled) values($1,$2,$3,'sticky',true,true) returning id",[email,await bcrypt.hash(password,12),`PERM03B3 Notify ${enabled?'ON':'OFF'}`])).rows[0].id;
  const a={id,enabled,cookies:{}};accounts.push(a);save("temporary-accounts",accounts.map(({id,enabled})=>({id,enabled})));
  await pool.query("insert into user_permissions(user_id,section_key,can_view,can_edit,can_delete,can_notify) values($1,'site_dprs',true,true,true,$2),($1,'dashboard',true,true,false,false)",[id,enabled]);
  const site=(await pool.query("select site_id from user_site_access where user_id=16 order by id limit 1")).rows[0].site_id;
  await pool.query("insert into user_site_access(user_id,site_id,access_level) values($1,$2,'view')",[id,site]);
  const body={identifier:email,password,deviceLabel:"PERM03B3 Notify acceptance"};
  if((await request(a,"/api/auth/login","POST",body)).status!==202)throw Error("Expected pending device");
  await pool.query("update user_devices set status='approved',approved_at=now() where user_id=$1 and status='pending'",[id]);
  if((await request(a,"/api/auth/login","POST",body)).status!==200)throw Error("Temporary login failed");
  a.browser=await browser(port);const {call,evaluate}=a.browser;
  await call("Browser.grantPermissions",{origin:base,permissions:["notifications"]});
  for(const[name,value]of Object.entries(a.cookies))await call("Network.setCookie",{name,value,url:base});
  await call("Page.navigate",{url:base+"/account"});await wait(4000);
  const subscription=await evaluate(`(async()=>{await navigator.serviceWorker.register('/service-worker.js');const r=await navigator.serviceWorker.ready;const k=${JSON.stringify(process.env.VAPID_PUBLIC_KEY)};const b=Uint8Array.from(atob(k.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const s=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b});return s.toJSON();})()`);
  if(!subscription?.endpoint)throw Error("Native push subscription unavailable");
  const subscribed=await request(a,"/api/push/subscribe","POST",{subscription,label:`PERM03B3 ${enabled?'ON':'OFF'}`,mode:"sync"});
  if(![200,201].includes(subscribed.status))throw Error(`Subscribe ${subscribed.status}`);
  a.subscriptionId=subscribed.data.id;
  save(`subscription-${enabled?'on':'off'}`,{userId:id,subscriptionId:a.subscriptionId,httpStatus:subscribed.status,providerHost:new URL(subscription.endpoint).hostname});
 }
 const rows=(await pool.query(`select u.id user_id,u.notifications_enabled,p.can_notify,s.id subscription_id from users u join user_permissions p on p.user_id=u.id and p.section_key='site_dprs' join push_subscriptions s on s.user_id=u.id order by u.id,s.id`)).rows;
 save("eligibility",rows);
 const unexpected=rows.filter(r=>r.notifications_enabled&&r.can_notify&&r.user_id!==2&&!accounts.some(a=>a.id===r.user_id));
 if(unexpected.length)throw Error("Unexpected real recipient; event blocked");
 for(const a of accounts){a.before=await a.browser.evaluate(`(async()=>{const r=await navigator.serviceWorker.ready;return (await r.getNotifications()).map(n=>({title:n.title,body:n.body,tag:n.tag}));})()`);}
 const site=(await pool.query("select s.name from sites s join user_site_access a on a.site_id=s.id where a.user_id=16 order by a.id limit 1")).rows[0].name;
 dprId=(await pool.query("insert into dprs(date,site,engineer,dpr_status,author_user_id,remarks) values('2026-10-07',$1,'PERM03B3 NOTIFICATION TEST','submitted',$2,'Temporary single-event Notify acceptance') returning id",[site,accounts[0].id])).rows[0].id;
 save("test-record",{table:"dprs",id:dprId});
 if(!fs.readFileSync("server/push.ts","utf8").includes("PERM-03B-3 temporary protection"))throw Error("Required cleanup protection absent");
 save("event",{state:"attempting",dprId,method:"POST",path:`/api/dprs/${dprId}/cancel`,attempts:1});
 const event=await request(accounts[0],`/api/dprs/${dprId}/cancel`,"POST",{reason:"PERM03B3 owner-authorized single Notify acceptance event"});
 save("event",{dprId,method:"POST",path:`/api/dprs/${dprId}/cancel`,status:event.status,isCancelled:event.data.isCancelled,attempts:1});
 if(event.status!==200)throw Error(`Cancellation failed ${event.status}`);
 // Observe both real browser notification stores for a full minute.
 await wait(60000);
 for(const a of accounts){
  const notifications=await a.browser.evaluate(`(async()=>{const r=await navigator.serviceWorker.ready;return (await r.getNotifications()).map(n=>({title:n.title,body:n.body,tag:n.tag}));})()`);
  const result={userId:a.id,notify:a.enabled,subscriptionId:a.subscriptionId,before:a.before,after:notifications,observationSeconds:60};
  save(`outcome-${a.enabled?'on':'off'}`,result);console.log(result);
  const screenshot=await a.browser.call("Page.captureScreenshot",{format:"jpeg",quality:75});
  fs.writeFileSync(`${out}/account-${a.enabled?'on':'off'}.jpg`,Buffer.from(screenshot.data,"base64"));
 }
}catch(error){save("error",{message:error.message});console.error(error.message);process.exitCode=1;}
finally{
 const cleanup={};
 for(const a of accounts){
  if(a.browser)try{await a.browser.evaluate(`(async()=>{const r=await navigator.serviceWorker.ready;for(const n of await r.getNotifications())n.close();const s=await r.pushManager.getSubscription();return s?await s.unsubscribe():true;})()`);}catch{}
  for(const table of ["user_permissions","user_devices","user_sessions","user_site_access","push_subscriptions","audit_logs"]){
   cleanup[`${a.id}:${table}`]=(await pool.query(`delete from ${table} where user_id=$1 returning id`,[a.id])).rows;
  }
 }
 if(dprId)cleanup.dprs=(await pool.query("delete from dprs where id=$1 returning id",[dprId])).rows;
 for(const a of accounts)cleanup[`${a.id}:users`]=(await pool.query("delete from users where id=$1 and email like 'perm03b3-notify-%@test.invalid' returning id",[a.id])).rows;
 const remaining={};
 for(const table of ["user_permissions","user_devices","user_sessions","user_site_access","push_subscriptions","audit_logs"]){
  remaining[table]=Number((await pool.query(`select count(*) n from ${table} where user_id=any($1::int[])`,[accounts.map(a=>a.id)])).rows[0].n);
 }
 remaining.users=Number((await pool.query("select count(*) n from users where id=any($1::int[])",[accounts.map(a=>a.id)])).rows[0].n);
 remaining.dprs=dprId?Number((await pool.query("select count(*) n from dprs where id=$1",[dprId])).rows[0].n):0;
 save("cleanup",{deleted:cleanup,remaining});save("after",await snapshot());
 for(const ws of sockets)ws.close();await pool.end();
}
