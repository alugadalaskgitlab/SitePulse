import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { developmentDb } from "./permissions03b-runtime.mjs";
const dir = "reports/user-perm-redesign03b-recovery";
await fs.mkdir(dir, { recursive: true });
const sql = (await fs.readFile("reports/user-perm-redesign03b-fix/REPORT.md", "utf8")).match(/```sql\n([\s\S]*?)```/)[1];
const db = await developmentDb();
const snapshot = async () => {
  const result = {};
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  for (const { tablename } of tables) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    result[tablename] = (await db.query(`select count(*)::int count, md5(coalesce(string_agg(h,'' order by h),'')) digest from (select md5(row_to_json(t)::text) h from public.${name} t) s`)).rows[0];
  }
  return result;
};
try {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const before = await snapshot();
  await db.query("COMMIT");
  await fs.writeFile(`${dir}/schema-before.json`, JSON.stringify(before, null, 2));
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout = '5s'");
  assert.equal((await db.query("select current_database() name")).rows[0].name, "sitelog_dev");
  assert.equal((await db.query("select to_regclass('public.attachment_links') name")).rows[0].name, null);
  for (const table of ["attachments", "users"]) {
    const columns = (await db.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows;
    assert.ok(columns.some(c => c.column_name === "id" && c.data_type === "integer"), `${table}.id missing/wrong type`);
    assert.ok((await db.query("select 1 from pg_constraint where conrelid=$1::regclass and contype='p'", [`public.${table}`])).rowCount === 1);
  }
  // Exact approved DDL, inside the already-open transaction.
  await db.query(sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""));
  await db.query("select a.id from public.attachment_links l join public.attachments a on a.id=l.attachment_id limit 0");
  const columns = (await db.query("select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='attachment_links' order by ordinal_position")).rows;
  const indexes = (await db.query("select indexname,indexdef from pg_indexes where schemaname='public' and tablename='attachment_links' order by indexname")).rows;
  const constraints = (await db.query("select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.attachment_links'::regclass order by conname")).rows;
  assert.equal(columns.length, 6);
  assert.equal(indexes.length, 3); // PK plus two approved indexes.
  await db.query("COMMIT");
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const after = await snapshot();
  await db.query("COMMIT");
  const differences = Object.keys(before).filter(t => JSON.stringify(before[t]) !== JSON.stringify(after[t]));
  await fs.writeFile(`${dir}/schema-after.json`, JSON.stringify(after, null, 2));
  await fs.writeFile(`${dir}/schema-operation.json`, JSON.stringify({ database: "sitelog_dev", sql, columns, indexes, constraints, dependencyPassed: true, changedExistingTables: differences }, null, 2));
  console.log({ dependencyPassed: true, changedExistingTables: differences });
  assert.ok(differences.every(t => ["user_sessions", "user_devices"].includes(t)), "Unexpected existing business-table change: STOP");
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
