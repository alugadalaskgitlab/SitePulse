// Development-only verification. Never logs passwords, hashes, cookies or tokens.
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";

const out = "reports/perm-03b";
fs.mkdirSync(out, { recursive: true });
const pool = new pg.Pool({ connectionString: process.env.DEV_DATABASE_URL });
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const db = (await pool.query("select current_database() name")).rows[0].name;
if (db !== "sitelog_dev") throw new Error("Refusing non-verification database");
const mode = process.argv[2];
async function snapshot() {
  const users = (await pool.query("select * from users order by id")).rows;
  const permissions = (await pool.query("select * from user_permissions order by id")).rows;
  return {
    database: db,
    users: users.map(({password_hash, ...u}) => ({...u, credentialChecksum: hash(password_hash)})),
    permissions,
    counts: {users: users.length, permissions: permissions.length},
    checksums: {users: hash(users), permissions: hash(permissions)},
  };
}
try {
  if (mode === "baseline") {
    const file = `${out}/before.json`;
    if (fs.existsSync(file)) throw new Error("Baseline already exists; do not overwrite");
    const data = await snapshot();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log({database: db, counts: data.counts, checksums: data.checksums});
  } else if (mode === "account") {
    if (!fs.existsSync(`${out}/before.json`)) throw new Error("Capture baseline first");
    if (!process.env.DEV_VERIFICATION_PASSWORD) throw new Error("Verification secret unavailable");
    const user = (await pool.query("select id,is_admin,is_owner,can_manage_permissions from users where email=$1", ["agent.verification@test.invalid"])).rows[0];
    if (!user || user.is_admin || user.is_owner || user.can_manage_permissions) throw new Error("Expected existing ordinary verification account");
    await pool.query("update users set password_hash=$1 where id=$2", [await bcrypt.hash(process.env.DEV_VERIFICATION_PASSWORD, 12), user.id]);
    fs.writeFileSync(`${out}/account-write.json`, JSON.stringify({table:"users", id:user.id, fields:["password_hash"], credentialSource:"DEV_VERIFICATION_PASSWORD", flagsChanged:false}, null, 2));
    console.log({verificationUser: user.id, passwordUpdated:true, flagsChanged:false});
  } else if (mode === "login") {
    const origin = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000";
    let base = origin;
    if ((await fetch(`${base}/api/auth/me`)).status === 404) base = "http://127.0.0.1:5000";
    let cookies = {};
    const login = async () => {
      const r = await fetch(`${base}/api/auth/login`, {method:"POST",headers:{"Content-Type":"application/json",cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ")},body:JSON.stringify({identifier:"agent.verification@test.invalid",password:process.env.DEV_VERIFICATION_PASSWORD,deviceLabel:"PERM-03B verification"})});
      for (const c of r.headers.getSetCookie()) { const first=c.split(";")[0]; const index=first.indexOf("="); cookies[first.slice(0,index)]=first.slice(index+1); }
      return r;
    };
    const first = await login();
    const user = (await pool.query("select id from users where email=$1",["agent.verification@test.invalid"])).rows[0];
    let deviceId = null;
    if (first.status === 202) {
      const issuedTokens=Object.values(cookies).map(value=>decodeURIComponent(value).split(".")[0]);
      const rows = (await pool.query("select id from user_devices where user_id=$1 and status='pending' and device_token=ANY($2::text[])",[user.id,issuedTokens])).rows;
      if(rows.length!==1)throw new Error("Could not identify this login's own pending device");
      if (!rows[0]) throw new Error("No pending verification device");
      deviceId = rows[0].id;
      await pool.query("update user_devices set status='approved',approved_at=now(),approved_by_user_id=null where id=$1 and user_id=$2 and status='pending'",[deviceId,user.id]);
    } else if (first.status !== 200) throw new Error(`Login failed: ${first.status}`);
    const second = await login();
    const cookie=Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join("; ");
    const endpoint=await fetch(`${base}/api/auth/me`,{headers:{cookie}});
    const page=await fetch(`${base}/plant/vendor-bills`,{headers:{cookie}});
    const proof={firstLogin:first.status,approvedDeviceId:deviceId,login:second.status,protectedEndpoint:endpoint.status,protectedPage:page.status,pageStatusIsNotRenderedUIProof:true};
    fs.writeFileSync(`${out}/login-proof.json`,JSON.stringify(proof,null,2));
    fs.mkdirSync("/tmp/perm03b-private",{recursive:true,mode:0o700});
    fs.writeFileSync("/tmp/perm03b-private/session.json",JSON.stringify({base,cookies}),{mode:0o600});
    console.log(proof);
    if(second.status!==200 || endpoint.status!==200) throw new Error("Authenticated verification failed");
  } else if (mode === "after") {
    const logFile=`${out}/temporary-writes.json`;
    if(fs.existsSync(logFile)){
      const log=JSON.parse(fs.readFileSync(logFile,"utf8"));
      const userIds=[...new Set(log.filter(r=>r.table==="users"&&r.inserted).map(r=>r.inserted.id))];
      const projectIds=[...new Set(log.filter(r=>r.table==="boq_projects"&&r.inserted).map(r=>r.inserted.id))];
      const remaining={};
      for(const table of ["user_permissions","user_devices","user_sessions","user_site_access"]){
        remaining[table]=Number((await pool.query(`select count(*) n from ${table} where user_id=ANY($1::int[])`,[userIds])).rows[0].n);
      }
      remaining.users=Number((await pool.query("select count(*) n from users where id=ANY($1::int[])",[userIds])).rows[0].n);
      remaining.projects=Number((await pool.query("select count(*) n from boq_projects where id=ANY($1::int[])",[projectIds])).rows[0].n);
      for(const table of ["boq_items","boq_categories","boq_mix_template_links","project_scope_segments"])
        remaining[table]=Number((await pool.query(`select count(*) n from ${table} where boq_project_id=ANY($1::int[])`,[projectIds])).rows[0].n);
      fs.writeFileSync(`${out}/cleanup.json`,JSON.stringify({userIds,projectIds,remainingRows:remaining},null,2));
      if(Object.values(remaining).some(Boolean))throw new Error("Temporary rows remain");
    }
    const data=await snapshot();
    fs.writeFileSync(`${out}/after.json`,JSON.stringify(data,null,2));
    console.log({counts:data.counts,checksums:data.checksums});
  } else throw new Error("Expected baseline, account, login or after");
} finally { await pool.end(); }
