// Disposable development fixture only. Never approves devices or fabricates sessions.
import fs from "node:fs/promises";
import pg from "pg";
import bcrypt from "bcryptjs";

const dir = process.argv.includes("--recovery") ? "reports/user-perm-redesign03b-recovery" : "reports/user-perm-redesign03b";
const privateDir = process.argv.includes("--recovery") ? "/tmp/permissions03b-recovery-private" : "/tmp/permissions03b-private";
const email = "permissions03b.admin@test.invalid";
const config = await fs.readFile(".replit", "utf8");
const connectionString = process.env.DEV_DATABASE_URL ??
  config.match(/^DEV_DATABASE_URL\s*=\s*"([^"]+)"/m)?.[1];
if (!connectionString || !process.env.DEV_VERIFICATION_PASSWORD)
  throw new Error("Development verification configuration unavailable");
const db = new pg.Client({ connectionString });
await db.connect();
try {
  if ((await db.query("select current_database() as name")).rows[0].name !== "sitelog_dev")
    throw new Error("Refusing non-development database");
  if ((await db.query("select id from users where email=$1", [email])).rowCount)
    throw new Error("Fixture exists; do not overwrite");
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const baseline = {};
  for (const { tablename } of (await db.query(
    "select tablename from pg_tables where schemaname='public' order by tablename"
  )).rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    baseline[tablename] = (await db.query(
      `select count(*)::int as count, md5(coalesce(string_agg(h, '' order by h), '')) as digest
       from (select md5(row_to_json(t)::text) as h from public.${quoted} t) s`
    )).rows[0];
  }
  const flags = (await db.query(
    "select id,is_active,is_admin,is_owner,is_field_engineer,can_manage_permissions from users where id=3"
  )).rows;
  await db.query("COMMIT");
  await fs.writeFile(`${dir}/preservation-before.json`, JSON.stringify(baseline, null, 2));
  await fs.writeFile(`${dir}/development-user3-flags.json`, JSON.stringify(flags, null, 2));
  const hash = await bcrypt.hash(process.env.DEV_VERIFICATION_PASSWORD, 12);
  const user = (await db.query(
    `insert into users(email,password_hash,full_name,is_active,is_admin,is_owner,notifications_enabled)
     values($1,$2,$3,true,true,false,false) returning id,email,full_name`,
    [email, hash, "PERM 03B Disposable Administrator"]
  )).rows[0];
  await fs.writeFile(`${dir}/disposable-manifest.json`,
    JSON.stringify({ administrator: user, createdAt: new Date().toISOString(), cleanup: "pending acceptance" }, null, 2));
  const response = await fetch("http://127.0.0.1:5000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" },
    body: JSON.stringify({ identifier: email, password: process.env.DEV_VERIFICATION_PASSWORD }),
  });
  await fs.writeFile(`${privateDir}/cookies.json`,
    JSON.stringify(response.headers.getSetCookie()), { mode: 0o600 });
  const devices = (await db.query(
    "select id,status,device_label from user_devices where user_id=$1 order by id", [user.id]
  )).rows;
  await fs.writeFile(`${dir}/initial-login.json`,
    JSON.stringify({ status: response.status, devices, normalApprovalRequired: response.status === 202 }, null, 2));
  console.log(JSON.stringify({ user, loginStatus: response.status, devices, developmentUser3: flags }));
} finally {
  await db.end();
}
