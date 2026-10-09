import fs from "node:fs/promises";
import assert from "node:assert/strict";
import pg from "pg";
import { manifest, saveManifest, dir, privateDir } from "./permissions02c-browser.mjs";
const config = await fs.readFile(".replit", "utf8");
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL ?? config.match(/^DEV_DATABASE_URL\s*=\s*"([^"]+)"/m)?.[1] });
await db.connect();
const ids = ["administrator", "subject", "manager", "limitedTarget"].map(k => manifest[k].id);
try {
  assert.equal((await db.query("select current_database() as name")).rows[0].name, "sitelog_dev");
  await db.query("BEGIN");
  const users = (await db.query("select id,email from users where id=any($1::int[]) for update", [ids])).rows;
  assert.equal(users.length, 4);
  assert.ok(users.every(u => /^permissions02c\.(admin|subject|manager|limited)@test\.invalid$/.test(u.email)));
  const removed = {};
  for (const table of ["user_sessions", "user_devices", "user_permissions", "user_site_access", "audit_logs"]) {
    removed[table] = (await db.query(`delete from ${table} where user_id=any($1::int[])`, [ids])).rowCount;
  }
  removed.users = (await db.query("delete from users where id=any($1::int[])", [ids])).rowCount;
  await db.query("COMMIT");
  const baseline = JSON.parse(await fs.readFile(`${dir}/preservation-before.json`, "utf8"));
  const after = {};
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  for (const table of Object.keys(baseline)) {
    const quoted = '"' + table.replaceAll('"', '""') + '"';
    after[table] = (await db.query(
      `select count(*)::int as count, md5(coalesce(string_agg(h, '' order by h), '')) as digest
       from (select md5(row_to_json(t)::text) as h from public.${quoted} t) s`
    )).rows[0];
  }
  const remaining = {};
  for (const table of ["user_sessions", "user_devices", "user_permissions", "user_site_access", "audit_logs"]) {
    remaining[table] = (await db.query(`select count(*)::int as n from ${table} where user_id=any($1::int[])`, [ids])).rows[0].n;
  }
  remaining.users = (await db.query("select count(*)::int as n from users where id=any($1::int[])", [ids])).rows[0].n;
  await db.query("COMMIT");
  const differences = Object.keys(baseline).filter(t => JSON.stringify(baseline[t]) !== JSON.stringify(after[t]));
  await fs.writeFile(`${dir}/preservation-after.json`, JSON.stringify(after, null, 2));
  await fs.writeFile(`${dir}/cleanup.json`, JSON.stringify({ removed, remaining, comparedTables: Object.keys(baseline).length, differingTables: differences }, null, 2));
  manifest.cleanup = "completed"; await saveManifest();
  // Browser profile is removed after Chromium is stopped by the main agent.
  for (const name of ["cookies.json", "admin-session.json", "subject-session.json", "manager-session.json"])
    await fs.rm(`${privateDir}/${name}`, { force: true });
  console.log(JSON.stringify({ removed, remaining, differingTables: differences }));
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally { await db.end(); }
