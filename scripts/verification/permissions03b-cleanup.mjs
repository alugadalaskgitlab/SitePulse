import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { developmentDb, manifest as m, saveManifest, dir, privateDir } from "./permissions03b-runtime.mjs";
const db = await developmentDb();
const ids = [m.administrator.id, m.subject.id];
const removed = {};
try {
  await db.query("BEGIN");
  const users = (await db.query("select id,email from users where id=any($1::int[]) for update", [ids])).rows;
  assert.equal(users.length, 2);
  assert.ok(users.every(u => /^permissions03b\.(admin|subject)@test\.invalid$/.test(u.email)));
  for (const [table, column, values] of [
    ["maintenance_parts_used", "maintenance_log_id", m.maintenance.map(r => r.id)],
    ["equipment_maintenance_logs", "id", m.maintenance.map(r => r.id)],
    ["equipment_usage", "id", m.usage.map(r => r.id)],
    ["diesel_requirement_items", "requirement_id", m.diesel.map(r => r.id)],
    ["diesel_requirements", "id", m.diesel.map(r => r.id)],
    ["equipment_master", "id", m.equipment.map(r => r.id)],
    ...["user_sessions", "user_devices", "user_permissions", "user_site_access", "audit_logs"].map(t => [t, "user_id", ids]),
    ["users", "id", ids],
    ["sites", "id", m.sites.map(r => r.id)],
  ]) {
    removed[table] = (await db.query(`delete from ${table} where ${column}=any($1::int[])`, [values])).rowCount;
  }
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
  for (const table of ["users", "user_permissions", "user_devices", "user_sessions", "user_site_access", "audit_logs"]) {
    remaining[table] = (await db.query(`select count(*)::int n from ${table} where ${table === "users" ? "id" : "user_id"}=any($1::int[])`, [ids])).rows[0].n;
  }
  const missingLinks = (await db.query("select to_regclass('public.attachment_links') as table_name")).rows[0];
  await db.query("COMMIT");
  const differences = Object.keys(baseline).filter(t => JSON.stringify(baseline[t]) !== JSON.stringify(after[t]));
  await fs.writeFile(`${dir}/preservation-after.json`, JSON.stringify(after, null, 2));
  await fs.writeFile(`${dir}/cleanup.json`, JSON.stringify({ removed, remaining, comparedTables: Object.keys(baseline).length,
    differingTables: differences, missingLinks }, null, 2));
  m.cleanup = "completed"; await saveManifest();
  await fs.rm(privateDir, { recursive: true, force: true });
  console.log(JSON.stringify({ removed, remaining, differingTables: differences, missingLinks }));
} catch (e) {
  await db.query("ROLLBACK"); throw e;
} finally { await db.end(); }
