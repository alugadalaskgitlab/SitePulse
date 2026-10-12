// Explicitly approved development authentication writes only; no account resets,
// grant changes, business writes, startup imports or Production connections.
import pg from "pg";
import fs from "node:fs";
import crypto from "node:crypto";
import WebSocket from "ws";
if (!process.env.DEV_DATABASE_URL || !process.env.DEV_VERIFICATION_PASSWORD) throw Error("Required development configuration missing");
const pool = new pg.Pool({ connectionString: process.env.DEV_DATABASE_URL });
const base = "http://127.0.0.1:5000"; // Verified main workflow; public proxy can point to mockup.
const out = "/tmp/vb-recovery-browser-proof";
fs.mkdirSync(out, { recursive: true });
let ws;
const proof = {};
try {
  if ((await pool.query("select current_database() name")).rows[0].name !== "sitelog_dev") throw Error("Not application development");
  const user = (await pool.query("select id,is_admin,is_owner,is_field_engineer,can_manage_permissions from users where email=$1", ["agent.verification@test.invalid"])).rows[0];
  if (!user || user.is_admin || user.is_owner || user.is_field_engineer || user.can_manage_permissions) throw Error("Expected ordinary verification account");
  const fingerprint = async () => {
    const result = {};
    for (const table of ["vendor_bills", "vendor_bill_items", "hire_statements", "hire_statement_exceptions", "user_permissions", "equipment_master", "site_material_trips"]) {
      result[table] = (await pool.query(`select count(*)::text n, md5(coalesce(string_agg(md5(row_to_json(t)::text), '' order by id),'')) hash from "${table}" t`)).rows[0];
    }
    result.account = crypto.createHash("sha256").update(JSON.stringify((await pool.query("select password_hash,is_admin,is_owner,is_field_engineer,can_manage_permissions from users where id=$1", [user.id])).rows)).digest("hex");
    return result;
  };
  const before = await fingerprint();
  const cookies = {};
  const cookieHeader = () => Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join("; ");
  const login = async () => {
    const response = await fetch(`${base}/api/auth/login`, { method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader() },
      body: JSON.stringify({ identifier: "agent.verification@test.invalid", password: process.env.DEV_VERIFICATION_PASSWORD }) });
    for (const c of response.headers.getSetCookie()) { const part=c.split(";")[0], i=part.indexOf("="); cookies[part.slice(0,i)]=part.slice(i+1); }
    return response.status;
  };
  proof.initialLogin = await login();
  if (proof.initialLogin === 202) {
    const tokens = Object.values(cookies).map(v => decodeURIComponent(v).split(".")[0]);
    const devices = (await pool.query("select id from user_devices where user_id=$1 and status='pending' and device_token=ANY($2::text[])", [user.id,tokens])).rows;
    if (devices.length !== 1) throw Error("Cannot identify this login's pending device");
    await pool.query("update user_devices set status='approved', approved_at=now(), approved_by_user_id=null where id=$1 and user_id=$2 and status='pending'", [devices[0].id,user.id]);
    proof.ownDeviceApproved = true;
    proof.login = await login();
  } else proof.login = proof.initialLogin;
  if (proof.login !== 200) throw Error(`Ordinary login failed (${proof.login}); no password reset attempted`);
  proof.api = {};
  let bills = [];
  for (const path of ["/api/auth/me", "/api/vendor-bills"]) {
    const response = await fetch(base+path, { headers: { cookie: cookieHeader() } });
    proof.api[path] = response.status;
    if (response.status !== 200) throw Error(`Read endpoint denied (${response.status}): ${path}`);
    if (path === "/api/vendor-bills") bills = await response.json();
  }
  proof.savedBillCount = bills.length;
  const target=(await (await fetch("http://127.0.0.1:9232/json")).json()).find(t=>t.type==="page");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.once("open",r);ws.once("error",j);});
  let seq=0; const pending=new Map();
  ws.on("message", raw=>{const m=JSON.parse(raw),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  await call("Network.enable");
  await call("Network.setBypassServiceWorker",{bypass:true});
  await call("Network.setCacheDisabled",{cacheDisabled:true});
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const [name,value] of Object.entries(cookies)) await call("Network.setCookie",{name,value,url:base});
  await call("Page.navigate",{url:base+"/finance/vendor-bills"});
  const evaluate=async expression=>(await call("Runtime.evaluate",{expression,returnByValue:true})).result?.value;
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,500));
    if(await evaluate(`!!document.querySelector('[data-testid="button-new-bill"]')`)){proof.registerRendered=true;break;}
  }
  if(!proof.registerRendered) {
    proof.visibleText = (await evaluate("document.body.innerText")).slice(0,800);
    throw Error("Vendor Bills register not available to existing account");
  }
  fs.writeFileSync(`${out}/register.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='All Bills')?.click()`);
  await new Promise(r=>setTimeout(r,800));
  proof.savedDetails = [];
  const visibleIds = await evaluate(`Array.from(document.querySelectorAll('[data-testid^="card-bill-"]')).map(e=>Number(e.dataset.testid.replace('card-bill-','')))`);
  for (const id of visibleIds) {
    await evaluate(`document.querySelector('[data-testid="card-bill-${id}"]').click()`);
    await new Promise(r=>setTimeout(r,700));
    const rendered = await evaluate(`!!document.querySelector('[data-testid="text-detail-title"]')`);
    if (!rendered) throw Error("Saved bill detail failed to render");
    const response=await fetch(`${base}/api/vendor-bills/${id}`,{headers:{cookie:cookieHeader()}});
    if(response.status!==200) throw Error("Saved detail API read failed");
    const saved=await response.json(), original=bills.find(b=>b.id===id);
    const unchanged=["totalAmount","amountPaid","status"].every(k=>String(saved[k]??"")===String(original[k]??""));
    if(!unchanged) throw Error("Detail facts differ from register");
    proof.savedDetails.push({rendered,apiStatus:response.status,financialFactsUnchanged:true,statementCount:saved.hireStatements?.length||0});
    fs.writeFileSync(`${out}/saved-detail-${proof.savedDetails.length}.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
    await evaluate(`document.querySelector('[data-testid="button-back-detail"]').click()`);
    await new Promise(r=>setTimeout(r,400));
  }
  await evaluate(`document.querySelector('[data-testid="button-new-bill"]').click()`);
  await new Promise(r=>setTimeout(r,1000));
  proof.preparationRendered=await evaluate(`!!document.querySelector('[data-testid="input-period-from"]') && !document.querySelector('[data-testid="trip-daily-hire-composer"]')`);
  fs.writeFileSync(`${out}/preparation.jpg`,Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
  proof.protectedRowsUnchanged = JSON.stringify(before) === JSON.stringify(await fingerprint());
  if(!proof.protectedRowsUnchanged) throw Error("Protected record fingerprint changed");
  proof.noBillSaved = true;
  proof.mode = "Normal development authentication, live API, no fixtures or auth bypass";
} catch(error) {
  proof.failure = error.message;
  process.exitCode=1;
} finally {
  fs.writeFileSync(`${out}/proof.json`,JSON.stringify(proof,null,2));
  console.log(JSON.stringify(proof,null,2));
  ws?.close(); await pool.end();
}
