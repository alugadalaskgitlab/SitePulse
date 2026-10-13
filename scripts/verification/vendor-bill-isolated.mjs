// Schema-only disposable DEVELOPMENT database; never repoints the running app.
// All fixtures are synthetic. Credentials/cookies stay in memory, never evidence.
import assert from "node:assert/strict";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import WebSocket from "ws";
import net from "node:net";

const exec = promisify(execFile);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const url = new URL(process.env.DEV_DATABASE_URL || "");
const source = new pg.Pool({ connectionString: url.toString() });
const name = `bill_verify_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
const base = "http://127.0.0.1:5099";
const output = "/tmp/vendor-bill-isolated";
const proof = { syntheticOnly: true, schemaOnlyCopy: true, ordinaryAccount: false };
const cookies = {};
let target, server, browser, profile, ws, captureFailure, created = false;
const pgEnv = () => ({
  ...process.env, PGDATABASE: url.pathname.slice(1), PGHOST: url.hostname,
  PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
});
const stop = async child => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(4000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise(resolve => child.once("exit", resolve));
  }
};

try {
  console.log("Isolated verification: checking development source");
  assert.equal((await source.query("SELECT current_database() n")).rows[0].n, "sitelog_dev",
    "Refusing non-development schema source");
  // Refuse occupied ports before creating any database.
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(5099, "127.0.0.1", () => probe.close(resolve));
  });
  const schema = await exec("pg_dump", ["--schema-only", "--no-owner", "--no-acl"], {
    env: pgEnv(), maxBuffer: 32 * 1024 * 1024,
  });
  console.log("Isolated verification: schema-only dump complete");
  await source.query(`CREATE DATABASE "${name}"`);
  created = true;
  console.log("Isolated verification: disposable database created");
  url.pathname = `/${name}`;
  target = new pg.Pool({ connectionString: url.toString() });
  assert.equal((await target.query("SELECT current_database() n")).rows[0].n, name);
  await new Promise((resolve, reject) => {
    const child = spawn("psql", ["-X", "-v", "ON_ERROR_STOP=1"], {
      env: pgEnv(), stdio: ["pipe", "ignore", "pipe"],
    });
    child.stderr.resume();
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(Error("Isolated schema restore failed")));
    child.stdin.end(schema.stdout);
  });
  const password = crypto.randomBytes(24).toString("hex");
  // Unused synthetic administrator satisfies read-only startup prerequisites.
  // Only the separate, non-admin account below is ever authenticated.
  await target.query(`INSERT INTO users(email,full_name,password_hash,is_admin)
    VALUES('bootstrap@isolated.invalid','SYNTHETIC STARTUP',$1,true)`,
    [await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10)]);
  const user = (await target.query(`INSERT INTO users(email,full_name,password_hash,is_admin,is_owner)
    VALUES('bill-test@isolated.invalid','SYNTHETIC BILL TEST',$1,false,false) RETURNING id`,
    [await bcrypt.hash(password, 10)])).rows[0];
  await target.query(`INSERT INTO app_settings(key,value)
    VALUES('permission-access-preservation:PERM-PROD-01','completed')`);
  const site = (await target.query(`INSERT INTO sites(name)
    VALUES('SYNTHETIC ISOLATED SITE') RETURNING id`)).rows[0];
  await target.query("INSERT INTO user_site_access(user_id,site_id) VALUES($1,$2)", [user.id, site.id]);
  await target.query(`INSERT INTO user_permissions(user_id,section_key,can_view,can_create,can_edit)
    VALUES($1,'vendor_bills',true,true,true),($1,'vendor_bills_raise',true,true,true),
    ($1,'vendor_bills_view',true,false,false)`, [user.id]);
  const date = (await target.query("SELECT CURRENT_DATE::text date")).rows[0].date;
  await target.query(`INSERT INTO site_material_trips
    (date,site,material,quantity,uom,supplier,material_source_type,material_source_supplier,transport_type,receipt_number)
    VALUES($1,'SYNTHETIC ISOLATED SITE','SYNTHETIC AGGREGATE',2.5,'MT',
    'SYNTHETIC TRANSPORTER','vendor','SYNTHETIC SELLER','agency_vendor','ISOLATED-RECEIPT')`, [date]);
  server = spawn("node", ["dist/index.cjs"], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: url.toString(), DEV_DATABASE_URL: "",
      PORT: "5099", SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
      VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: "", BOOTSTRAP_ADMIN_EMAIL: "", BOOTSTRAP_ADMIN_PASSWORD: "" },
    stdio: "ignore",
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    assert.equal(server.exitCode, null, "Isolated application exited");
    try { ready = (await fetch(base + "/api/auth/me")).status === 401; } catch {}
    if (ready) break;
    await delay(500);
  }
  assert(ready, "Isolated application readiness timeout");
  const api = async (path, body) => {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json",
        cookie: Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of response.headers.getSetCookie()) {
      const pair = c.split(";")[0], split = pair.indexOf("=");
      cookies[pair.slice(0, split)] = pair.slice(split + 1);
    }
    return response;
  };
  const login = () => api("/api/auth/login", { identifier: "bill-test@isolated.invalid", password });
  let response = await login();
  if (response.status === 202) {
    const tokens = Object.values(cookies).map(value => decodeURIComponent(value).split(".")[0]);
    const matches = (await target.query(`SELECT id FROM user_devices
      WHERE user_id=$1 AND status='pending' AND device_token=ANY($2::text[])`, [user.id, tokens])).rows;
    assert.equal(matches.length, 1, "Device must match this synthetic login");
    await target.query(`UPDATE user_devices SET status='approved',approved_at=now()
      WHERE id=$1 AND user_id=$2 AND status='pending'`, [matches[0].id, user.id]);
    response = await login();
  }
  assert.equal(response.status, 200, "Normal synthetic login failed");
  const flags = (await target.query(`SELECT is_admin,is_owner,can_manage_permissions,all_sites_access
    FROM users WHERE id=$1`, [user.id])).rows[0];
  assert(Object.values(flags).every(value => value === false));
  proof.ordinaryAccount = true;
  proof.normalLogin = 200;

  profile = await fs.mkdtemp(`${os.tmpdir()}/bill-isolated-chrome-`);
  browser = spawn("chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  let debugPort;
  for (let i = 0; i < 60; i++) {
    try { debugPort = (await fs.readFile(`${profile}/DevToolsActivePort`, "utf8")).split("\n")[0]; } catch {}
    if (debugPort) break;
    await delay(250);
  }
  assert(debugPort, "Disposable browser did not start");
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
  ws = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve,reject) => { ws.once("open",resolve); ws.once("error",reject); });
  let seq = 0;
  const pending = new Map();
  proof.responses = [];
  ws.on("message", raw => {
    const msg = JSON.parse(raw);
    if (msg.method === "Network.responseReceived") {
      const r = msg.params.response;
      if (r.url.startsWith(base + "/api/vendor-bills"))
        proof.responses.push({ path: new URL(r.url).pathname, status: r.status });
    }
    const request = pending.get(msg.id);
    if (request) {
      pending.delete(msg.id);
      msg.error ? request.reject(Error(msg.error.message)) : request.resolve(msg.result);
    }
  });
  const call = (method,params={}) => new Promise((resolve,reject) => {
    const id = ++seq; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression => {
    const r = await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    assert(!r.exceptionDetails, `Browser evaluation failed at ${proof.stage || "setup"}: ${r.exceptionDetails?.exception?.description?.split("\n")[0] || ""}`);
    return r.result?.value;
  };
  const wait = async (expression, label) => {
    for (let i=0;i<80;i++) { if(await evaluate(expression)) return; await delay(250); }
    throw Error(`Timed out: ${label}`);
  };
  const selector = id => `[data-testid="${id}"]`;
  const click = async id => {
    proof.stage = `click ${id}`;
    await evaluate(`document.querySelector(${JSON.stringify(selector(id))}).click()`);
  };
  const fill = async (id,value) => {
    proof.stage = `fill ${id}`;
    await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector(id))});
      e.focus(); const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});
      e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); e.blur(); })()`);
    await delay(150);
  };
  const select = async (id,text) => {
    proof.stage = `select ${id}`;
    await evaluate(`document.querySelector(${JSON.stringify(selector(id))}).focus()`);
    await call("Input.dispatchKeyEvent",{type:"keyDown",key:"ArrowDown",code:"ArrowDown"});
    await call("Input.dispatchKeyEvent",{type:"keyUp",key:"ArrowDown",code:"ArrowDown"});
    await wait(`Array.from(document.querySelectorAll('[role="option"]')).some(e=>e.textContent.trim()===${JSON.stringify(text)})`, `select option ${id}`);
    await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)}).focus()`);
    await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Enter",code:"Enter"});
    await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Enter",code:"Enter"});
    await delay(150);
  };
  await call("Network.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for (const [name,value] of Object.entries(cookies)) await call("Network.setCookie",{name,value,url:base});
  await fs.mkdir(output,{recursive:true});
  const capture = async name => {
    const shot = await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    await fs.writeFile(`${output}/${name}.jpg`,Buffer.from(shot.data,"base64"));
  };
  captureFailure = () => capture("failure");
  await call("Page.navigate",{url:base+"/plant/vendor-bills"});
  await wait(`!!document.querySelector('${selector("button-new-bill")}')`, "bill list");
  // The first-tab splash overlays an already-mounted Router. Wait for its
  // completion/re-render before beginning any unsaved local form state.
  await delay(3500);
  await click("button-new-bill");
  await wait(`!!document.querySelector('${selector("input-bill-no")}')`, "bill form");
  await select("select-bill-type","MATERIAL SUPPLY");
  await select("select-bill-site","SYNTHETIC ISOLATED SITE");
  await fill("input-bill-date",date);
  await fill("input-bill-no","ISOLATED-UI-SAVE");
  await fill("input-period-from",date);
  await fill("input-period-to",date);
  await fill("input-vendor-name","SYNTHETIC SELLER");
  await wait(`!!document.querySelector('${selector("button-auto-populate")}') &&
    !document.querySelector('${selector("button-auto-populate")}').disabled`, "billable synthetic receipt");
  await click("button-auto-populate");
  await wait(`!!document.querySelector('${selector("text-item-desc-0")}')`, "pulled source item");
  await fill("input-item-rate-0","100");
  await fill("input-notes","ISOLATED INITIAL SAVE");
  await click("button-save-bill");
  await wait(`!!document.querySelector('[data-testid^="card-bill-"]')`, "saved bill list");
  // Storage assigns its own bill number. Identify by the synthetic scope,
  // not the suggested number entered in the form.
  const bill = (await target.query(`SELECT id,status,total_amount,site_id,notes
    FROM vendor_bills WHERE vendor_name='SYNTHETIC SELLER' AND site_id=$1`,[site.id])).rows;
  assert.equal(bill.length,1,"Exactly one synthetic bill must be persisted");
  assert.equal(bill[0].status,"draft");
  assert.equal(bill[0].site_id,site.id);
  assert.equal(bill[0].total_amount,250);
  assert.equal(bill[0].notes,"ISOLATED INITIAL SAVE");
  proof.createPersisted = true;
  await click(`card-bill-${bill[0].id}`);
  await wait(`!!document.querySelector('${selector("button-edit-bill")}')`, "bill detail edit");
  await click("button-edit-bill");
  await wait(`document.querySelector('${selector("text-form-title")}')?.textContent.includes('EDIT VENDOR BILL')`, "edit form");
  await fill("input-item-rate-0","120");
  await fill("input-notes","ISOLATED EDIT VERIFIED");
  await click("button-save-bill");
  await wait(`!!document.querySelector('[data-testid^="card-bill-"]')`, "updated bill list");
  const updated = (await target.query(`SELECT id,status,total_amount,site_id,notes
    FROM vendor_bills WHERE id=$1`,[bill[0].id])).rows[0];
  assert.equal(updated.notes,"ISOLATED EDIT VERIFIED");
  assert.equal(updated.total_amount,300);
  assert.equal(updated.status,"draft");
  assert.equal(updated.site_id,site.id);
  const items = (await target.query("SELECT qty,rate,amount,source FROM vendor_bill_items WHERE bill_id=$1",[bill[0].id])).rows;
  assert.equal(items.length,1);
  assert.equal(items[0].qty,2.5);
  assert.equal(items[0].rate,120);
  assert.equal(items[0].amount,300);
  assert(items[0].source.startsWith("auto"));
  assert.equal((await target.query("SELECT count(*)::int n FROM vendor_bills")).rows[0].n,1);
  proof.editPersisted = true;
  proof.singleBillSingleItem = true;
  proof.initialAmount = 250;
  proof.editedAmount = 300;
  await click(`card-bill-${bill[0].id}`);
  await wait(`!!document.querySelector('${selector("button-edit-bill")}')`, "updated detail");
  await capture("edited-detail");
  proof.detailRenderedAfterEdit = true;
  assert(proof.responses.some(r=>r.path==="/api/vendor-bills"&&r.status===201));
  assert(proof.responses.some(r=>r.path===`/api/vendor-bills/${bill[0].id}`&&r.status===200));
  assert.equal((await api("/api/auth/logout",{})).status,200);
} catch(error) {
  try { await captureFailure?.(); } catch {}
  proof.failure = /:\/\/|password|cookie|credential/i.test(error.message)
    ? "Verification failed (sensitive diagnostics withheld)" : error.message;
  process.exitCode = 1;
  console.log("Isolated verification failure:", proof.failure);
} finally {
  console.log("Isolated verification: cleaning up");
  ws?.close();
  await stop(browser);
  await stop(server);
  await target?.end();
  try {
    if(created) {
      await source.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      proof.databaseDropped = !(await source.query("SELECT 1 FROM pg_database WHERE datname=$1",[name])).rows.length;
      assert(proof.databaseDropped);
    }
  } finally {
    await source.end();
    if(profile) await fs.rm(profile,{recursive:true,force:true});
    await fs.mkdir(output,{recursive:true});
    await fs.writeFile(`${output}/result.json`,JSON.stringify(proof,null,2));
    console.log(JSON.stringify(proof,null,2));
  }
}
