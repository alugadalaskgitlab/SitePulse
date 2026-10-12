// Disposable DEVELOPMENT database only. No real business rows are copied.
// Credentials remain in process memory; output contains counts/hashes only.
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
const exec = promisify(execFile);
const url = new URL(process.env.DEV_DATABASE_URL || "");
const source = new pg.Pool({ connectionString: url.toString() });
const name = `startup_verify_${Date.now()}`;
const pgEnv = () => ({
  ...process.env, PGDATABASE: url.pathname.slice(1), PGHOST: url.hostname,
  PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGSSLMODE: url.searchParams.get("sslmode") || "prefer",
});
let target, server, created = false;
const proof = {};
try {
  if ((await source.query("select current_database() n")).rows[0].n !== "sitelog_dev") throw Error("Refusing non-development source");
  const schema = await exec("pg_dump", ["--schema-only", "--no-owner", "--no-acl"], {
    env: pgEnv(), maxBuffer: 32 * 1024 * 1024,
  });
  await source.query(`CREATE DATABASE "${name}"`);
  created = true;
  url.pathname = `/${name}`;
  target = new pg.Pool({ connectionString: url.toString() });
  // Schema only: pg_dump's psql directives are handled by psql, never application startup.
  await new Promise((resolve, reject) => {
    const p = spawn("psql", ["-X", "-v", "ON_ERROR_STOP=1"], { env: pgEnv(), stdio: ["pipe","ignore","pipe"] });
    p.stderr.resume();
    p.on("error", reject);
    p.on("exit", code => code===0 ? resolve() : reject(Error("Isolated schema setup failed")));
    p.stdin.end(schema.stdout);
  });
  const password = crypto.randomBytes(24).toString("hex");
  const u = (await target.query("INSERT INTO users(email,full_name,password_hash,is_admin,is_active) VALUES('startup@test.invalid','STARTUP TEST',$1,true,true) RETURNING id", [await bcrypt.hash(password,10)])).rows[0];
  await target.query("INSERT INTO app_settings(key,value) VALUES('permission-access-preservation:PERM-PROD-01','completed')");
  await target.query("INSERT INTO vendor_bills(bill_no,bill_date,vendor_name,bill_type,total_amount,status) VALUES('ISOLATED-STARTUP','2026-10-01','SYNTHETIC TEST','equipment',1234,'draft')");
  await target.query("INSERT INTO dprs(date,site,engineer) VALUES('2026-10-01','SYNTHETIC STARTUP','SYNTHETIC ENGINEER')");
  const excluded = new Set(["user_devices","user_sessions","audit_logs","transaction_audit_logs"]);
  const fingerprint = async (authRead = false) => {
    const tables = (await target.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const result = {};
    for (const {tablename} of tables) {
      if (excluded.has(tablename)) continue;
      if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) throw Error("Unexpected table identifier");
      const row = authRead && tablename === "users" ? "(to_jsonb(t)-'last_login_at')::text" : "row_to_json(t)::text";
      result[tablename] = (await target.query(`SELECT count(*)::text n,md5(coalesce(string_agg(${row},'' ORDER BY ${row}),'')) hash FROM "${tablename}" t`)).rows[0];
    }
    return result;
  };
  const before = await fingerprint();
  server = spawn("node", ["dist/index.cjs"], {
    env: { ...process.env, NODE_ENV:"production", DATABASE_URL:url.toString(), DEV_DATABASE_URL:"", PORT:"5099",
      VAPID_PRIVATE_KEY:"", VAPID_PUBLIC_KEY:"", BOOTSTRAP_ADMIN_EMAIL:"", BOOTSTRAP_ADMIN_PASSWORD:"" },
    stdio: "ignore",
  });
  const base = "http://127.0.0.1:5099";
  for(let i=0;i<80;i++) {
    if(server.exitCode!==null) throw Error("Isolated server exited");
    try { if((await fetch(base+"/api/auth/me")).status===401) { proof.started=true; break; } } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!proof.started) throw Error("Isolated server readiness timeout");
  await new Promise(r=>setTimeout(r,32000)); // Include first operational timer tick.
  proof.startupFingerprintsUnchanged = JSON.stringify(before)===JSON.stringify(await fingerprint());
  if(!proof.startupFingerprintsUnchanged) throw Error("Startup changed protected records");
  const beforeAuth = await fingerprint(true);
  const cookies={};
  const header=()=>Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ");
  const login=async()=>{
    const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",cookie:header()},body:JSON.stringify({identifier:"startup@test.invalid",password})});
    for(const c of r.headers.getSetCookie()){const s=c.split(";")[0],i=s.indexOf("=");cookies[s.slice(0,i)]=s.slice(i+1);}
    return r.status;
  };
  let status=await login();
  if(status===202){
    await target.query("UPDATE user_devices SET status='approved',approved_at=now() WHERE user_id=$1 AND status='pending'",[u.id]);
    status=await login();
  }
  proof.normalLogin=status;
  const billsResponse=await fetch(base+"/api/vendor-bills",{headers:{cookie:header()}});
  proof.vendorBillsStatus=billsResponse.status;
  const bills=await billsResponse.json();
  proof.savedBillUnchanged=Array.isArray(bills)&&bills.length===1&&Number(bills[0].totalAmount)===1234&&bills[0].status==="draft";
  const afterAuth = await fingerprint(true);
  proof.afterReadsFingerprintsUnchanged=JSON.stringify(beforeAuth)===JSON.stringify(afterAuth);
  proof.changedProtectedTables=Object.keys(beforeAuth).filter(t=>JSON.stringify(beforeAuth[t])!==JSON.stringify(afterAuth[t]));
  proof.protectedTableCount=Object.keys(before).length;
  if(status!==200||!proof.savedBillUnchanged||!proof.afterReadsFingerprintsUnchanged) throw Error("Login/read verification failed");
} catch(error) {
  proof.failure=error.message.includes("://") ? "Verification failed (connection details withheld)" : error.message;
  proof.errorCode = error.code;
  let diagnostic = String(error.stderr || "");
  for (const value of [process.env.DEV_DATABASE_URL,url.toString(),url.password,decodeURIComponent(url.password),url.username,url.hostname]) {
    if (value) diagnostic=diagnostic.split(value).join("[redacted]");
  }
  proof.safeDiagnostic = diagnostic.replace(/(?:postgres(?:ql)?|https?):\/\/\S+/g,"[redacted]").slice(0,800);
  process.exitCode=1;
} finally {
  if(server && server.exitCode===null) { server.kill("SIGTERM"); await new Promise(r=>server.once("exit",r)); }
  await target?.end();
  if(created) await source.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await source.end();
  fs.writeFileSync("/tmp/startup-isolated-proof.json",JSON.stringify(proof,null,2));
  console.log(proof);
}
