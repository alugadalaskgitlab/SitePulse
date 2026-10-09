// Development-only disposable fixtures. Never repairs an existing record.
import fs from "node:fs/promises";
import pg from "pg";
import assert from "node:assert/strict";
const dir = "reports/dpr-eqlink01";
const config = await fs.readFile(".replit", "utf8");
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL ??
  config.match(/^DEV_DATABASE_URL\s*=\s*"([^"]+)"/m)?.[1] });
await db.connect();
const cookies = {};
const base = "http://127.0.0.1:5000";
const evidence = { scenarios: [], fixtures: [] };
async function api(path, method = "GET", body) {
  const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json",
    Cookie: Object.entries(cookies).map(([k,v]) => `${k}=${v}`).join("; ") },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const c of r.headers.getSetCookie()) {
    const pair = c.split(";")[0], i = pair.indexOf("=");
    cookies[pair.slice(0,i)] = pair.slice(i+1);
  }
  return { status: r.status, body: await r.json() };
}
async function snapshot() {
  const result = {};
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  for (const {tablename} of (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows) {
    const q = '"' + tablename.replaceAll('"','""') + '"';
    result[tablename] = (await db.query(`select count(*)::int count, md5(coalesce(string_agg(h,'' order by h),'')) digest from (select md5(row_to_json(t)::text) h from public.${q} t) s`)).rows[0];
  }
  await db.query("COMMIT");
  return result;
}
let before;
try {
  assert.equal((await db.query("select current_database() n")).rows[0].n, "sitelog_dev");
  before = await snapshot();
  await fs.writeFile(`${dir}/before.json`, JSON.stringify(before,null,2));
  const audit = (await db.query(`select l.id,l.dpr_id,d.date,d.site,d.dpr_status,l.machine,l.plant_usage_id
    from equipment_logs l left join equipment_usage u on u.id=l.plant_usage_id left join dprs d on d.id=l.dpr_id
    where l.plant_usage_id is not null and u.id is null order by l.id`)).rows;
  await fs.writeFile(`${dir}/dangling-audit.json`, JSON.stringify({database:"sitelog_dev",count:audit.length,rows:audit},null,2));
  assert.ok(process.env.DEV_VERIFICATION_PASSWORD, "Verification password secret missing");
  const login = () => api("/api/auth/login","POST",{identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD});
  let signed = await login();
  if (signed.status === 202) {
    // Existing DEV-ACCT-02 procedure, scoped only to this login's device.
    const tokens = Object.values(cookies).map(v => decodeURIComponent(v).split(".")[0]);
    const devices = (await db.query("select id from user_devices where user_id=16 and status='pending' and device_token=any($1::text[])",[tokens])).rows;
    assert.equal(devices.length,1);
    await db.query("update user_devices set status='approved',approved_at=now(),approved_by_user_id=null where id=$1 and user_id=16 and status='pending'",[devices[0].id]);
    signed = await login();
  }
  evidence.loginStatus = signed.status;
  assert.equal(signed.status,200,"Ordinary verification login failed; no password or grant reset performed");
  const me = await api("/api/auth/me");
  assert.equal(me.body.user.id,16);
  const fixtureSite = (await db.query("insert into sites(name,is_active) values('TAKKADPALLY-SIRUR [EQLINK01 FIXTURE]',1) returning id,name")).rows[0];
  evidence.site = fixtureSite;
  const site = fixtureSite.name;
  for (const kind of ["missing"]) {
    const dpr = (await db.query(`insert into dprs(date,site,engineer,work_type,dpr_status,lock_status,author_user_id)
      values('2026-10-09',$1,'EQLINK01 FIXTURE','road','submitted','unlocked',16) returning id`,[site])).rows[0];
    evidence.fixtures.push({kind,dprId:dpr.id});
    const usageId = 2147483001;
    assert.equal((await db.query("select id from equipment_usage where id=$1",[usageId])).rowCount,0);
    // Missing-reference fixture only; no existing usage is deleted or altered.
    const log = (await db.query(`insert into equipment_logs(dpr_id,machine,plant_usage_id,entry_type,hours_worked,diesel,task)
      values($1,'EQLINK01 FIXTURE MACHINE',$2,'hourly',2,0,'INCIDENTAL') returning id`,[dpr.id,usageId])).rows[0];
    evidence.fixtures.at(-1).logId = log.id;
    const original = await api(`/api/dprs/${dpr.id}`);
    evidence.fixtureRead = { status: original.status, path: `/api/dprs/${dpr.id}`, ...(original.status !== 200 ? {body:original.body} : {}) };
    assert.equal(original.status,200,"Fixture read denied; do not change account permissions");
    const data = original.body;
    data.progress = [{activity:"INCIDENTAL",isIncidental:true,incidentalDescription:"EQLINK01 chainage correction fixture",chainageFrom:"0+100",chainageTo:"0+110",quantity:10,uom:"M",overlapReason:"Corrected fixture overlap"}];
    const r = await api(`/api/dprs/${dpr.id}/version`,"POST",{data,reason:"EQLINK01 chainage-only correction; equipment unchanged"});
    evidence.scenarios.push({kind,...r});
    assert.equal(r.status,409);
    assert.equal(r.body.code,"EQUIPMENT_INCOMING_CONFLICT");
    assert.equal(r.body.details.plantUsageId,usageId);
    console.log(JSON.stringify(evidence.scenarios));
  }
} catch(e) {
  evidence.blocked = e.message;
  console.log(e.message);
  process.exitCode = 1;
} finally {
  for (const f of evidence.fixtures) {
    await db.query("delete from equipment_logs where dpr_id=$1",[f.dprId]);
    await db.query("delete from dprs where id=$1 and engineer='EQLINK01 FIXTURE'",[f.dprId]);
  }
  if (evidence.site) await db.query("delete from sites where id=$1 and name='TAKKADPALLY-SIRUR [EQLINK01 FIXTURE]'",[evidence.site.id]);
  evidence.cleanup = "all listed fixture logs and DPRs removed";
  if (before) {
    const after = await snapshot();
    await fs.writeFile(`${dir}/after.json`,JSON.stringify(after,null,2));
    evidence.changedTables = Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
  }
  await fs.writeFile(`${dir}/authenticated.json`,JSON.stringify(evidence,null,2));
  await db.end();
}
