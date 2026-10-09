import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { developmentDb } from "./permissions03b-runtime.mjs";
const phase = process.argv[2];
assert.ok(["restart-before", "restart-after"].includes(phase));
const dir = "reports/user-perm-redesign03b-recovery";
const db = await developmentDb();
const tables = {}, sequences = {};
try {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  for (const { tablename } of (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows) {
    const q = '"' + tablename.replaceAll('"', '""') + '"';
    tables[tablename] = (await db.query(`select count(*)::int count,md5(coalesce(string_agg(h,'' order by h),'')) digest from (select md5(row_to_json(t)::text) h from public.${q} t) s`)).rows[0];
  }
  for (const row of (await db.query("select sequencename,last_value::text from pg_sequences where schemaname='public' order by sequencename")).rows) sequences[row.sequencename] = row.last_value;
  await db.query("COMMIT");
} finally { await db.end(); }
await fs.writeFile(`${dir}/${phase}.json`, JSON.stringify({ tables, sequences }, null, 2));
if (phase === "restart-after") {
  const before = JSON.parse(await fs.readFile(`${dir}/restart-before.json`, "utf8"));
  const changedTables = [...new Set([...Object.keys(tables), ...Object.keys(before.tables)])].filter(k => JSON.stringify(tables[k]) !== JSON.stringify(before.tables[k]));
  const changedSequences = [...new Set([...Object.keys(sequences), ...Object.keys(before.sequences)])].filter(k => sequences[k] !== before.sequences[k]);
  const unexpected = changedTables.filter(k => !["user_devices", "user_sessions"].includes(k));
  const result = { comparedTables: Object.keys(tables).length, changedTables, changedSequences, unexpected, mustStop: unexpected.length > 0 };
  await fs.writeFile(`${dir}/restart-preservation.json`, JSON.stringify(result, null, 2));
  console.log(result);
  if (result.mustStop) process.exitCode = 1;
} else console.log("Pre-restart snapshot recorded");
