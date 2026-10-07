// Ordinary development login only. Passwords and session tokens never enter reports.
import fs from "node:fs";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import WebSocket from "ws";

if (!process.env.DEV_VERIFICATION_PASSWORD) throw new Error("DEV_VERIFICATION_PASSWORD missing; stopping");
if (!process.env.DEV_DATABASE_URL) throw new Error("Development connection missing; stopping");
const pool = new pg.Pool({ connectionString: process.env.DEV_DATABASE_URL });
const out = "reports/perm-03b1";
fs.mkdirSync(out, { recursive: true });
let ws;
try {
  const database = (await pool.query("select current_database() name")).rows[0].name;
  if (database !== "sitelog_dev") throw new Error("Refusing non-development database");
  const email = "agent.verification@test.invalid";
  const user = (await pool.query("select id,full_name,is_admin,is_owner,is_field_engineer,can_manage_permissions from users where email=$1", [email])).rows[0];
  if (!user) throw new Error("Expected existing verification account; no duplicate created");
  if (user.is_admin || user.is_owner || user.is_field_engineer || user.can_manage_permissions)
    throw new Error("Verification account is privileged; refusing to change flags");
  const permissions = async () => crypto.createHash("sha256").update(JSON.stringify((await pool.query("select * from user_permissions order by id")).rows)).digest("hex");
  const beforePermissions = await permissions();
  await pool.query("update users set password_hash=$1 where id=$2", [await bcrypt.hash(process.env.DEV_VERIFICATION_PASSWORD, 12), user.id]);
  let base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  if (!process.env.REPLIT_DEV_DOMAIN || (await fetch(`${base}/api/auth/me`)).status === 404) base = "http://127.0.0.1:5000";
  const cookies = {};
  async function login() {
    const response = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ") },
      body: JSON.stringify({ identifier: email, password: process.env.DEV_VERIFICATION_PASSWORD, deviceLabel: "PERM-03B-1 verification device" }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const part = cookie.split(";")[0], i = part.indexOf("=");
      cookies[part.slice(0,i)] = part.slice(i+1);
    }
    return response.status;
  }
  const firstLogin = await login();
  let approvedDeviceId = null;
  if (firstLogin === 202) {
    const tokens = Object.values(cookies).map(v=>decodeURIComponent(v).split(".")[0]);
    const devices = (await pool.query("select id from user_devices where user_id=$1 and status='pending' and device_token=ANY($2::text[])", [user.id,tokens])).rows;
    if (devices.length !== 1) throw new Error("Cannot identify own pending device");
    approvedDeviceId = devices[0].id;
    await pool.query("update user_devices set status='approved',approved_at=now(),approved_by_user_id=null where id=$1 and user_id=$2 and status='pending'", [approvedDeviceId,user.id]);
  } else if (firstLogin !== 200) throw new Error(`Login failed: ${firstLogin}`);
  const loginStatus = await login();
  const headers = { cookie: Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ") };
  const api = await fetch(`${base}/api/auth/me`, { headers });
  const page = await fetch(`${base}/account`, { headers });
  if (loginStatus !== 200 || api.status !== 200 || page.status !== 200) throw new Error("Ordinary sign-in verification failed");
  const target = (await (await fetch("http://127.0.0.1:9232/json")).json()).find(t=>t.type==="page");
  if (!target) throw new Error("No verification browser page on CDP 9232");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.once("open",resolve);ws.once("error",reject);});
  let seq=0; const pending=new Map();
  ws.on("message", raw=>{
    const m=JSON.parse(raw), p=pending.get(m.id);
    if(p){pending.delete(m.id); m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}
  });
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
  });
  await call("Network.enable");
  await call("Network.setBypassServiceWorker",{bypass:true});
  await call("Network.setCacheDisabled",{cacheDisabled:true});
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const [name,value] of Object.entries(cookies)) await call("Network.setCookie",{name,value,url:base});
  await call("Page.navigate",{url:`${base}/account`});
  let rendered=false;
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,500));
    const result=await call("Runtime.evaluate",{expression:`location.pathname==="/account" && document.querySelector('[data-testid="account-name"]')?.textContent.includes("Agent Verification") && !!document.querySelector('[data-testid="account-session-policy"]')`,returnByValue:true});
    if(result.result?.value){rendered=true;break;}
  }
  if(!rendered) throw new Error("Signed-in account page did not render");
  const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:85});
  fs.writeFileSync(`${out}/signed-in-account.jpg`,Buffer.from(shot.data,"base64"));
  const afterPermissions = await permissions();
  if (beforePermissions !== afterPermissions) throw new Error("Permission checksum changed");
  const proof={database,user,credentialSecret:"DEV_VERIFICATION_PASSWORD",firstLogin,approvedDeviceId,login:loginStatus,protectedEndpoint:{path:"/api/auth/me",status:api.status},protectedPage:{path:"/account",status:page.status,rendered,screenshot:"signed-in-account.jpg"},permissionRowsUnchanged:true};
  fs.writeFileSync(`${out}/signin-proof.json`,JSON.stringify(proof,null,2));
  console.log(proof);
} finally { ws?.close(); await pool.end(); }
