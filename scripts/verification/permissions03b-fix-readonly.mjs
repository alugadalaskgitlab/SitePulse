// Investigation only. Never imports the app, storage, migrations or repair runner.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { developmentDb } from "./permissions03b-runtime.mjs";

const phase = process.argv[2];
assert.ok(["before", "after"].includes(phase));
const dir = "reports/user-perm-redesign03b-fix";
await fs.mkdir(dir, { recursive: true });
const protectedFiles = [
  "server/routes.ts", "client/src/components/HubShell.tsx",
  "client/src/pages/DieselRequirements.tsx", "client/src/pages/PlantMaintenance.tsx",
  "client/src/pages/Plant.tsx", "client/src/pages/EquipmentHub.tsx",
  "tests/dieselReceiptPending06mC.test.ts",
];
for (const path of protectedFiles) {
  assert.equal(await fs.readFile(path, "utf8"),
    execFileSync("git", ["show", `595c515d:${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
    `03B implementation changed: ${path}`);
}
const db = await developmentDb();
const evidence = { protectedFilesUnchanged: protectedFiles };
try {
  await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  evidence.database = (await db.query("select current_database() as name, current_setting('transaction_read_only') as read_only")).rows[0];
  evidence.attachmentTable = (await db.query("select to_regclass('public.attachment_links')::text as name")).rows[0];
  evidence.attachmentColumns = (await db.query("select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('attachments','attachment_links') order by table_name,ordinal_position")).rows;
  evidence.ldoMarkers = (await db.query(
    "select key,value from app_settings where key = any($1::text[]) order by key",
    [["migrateLdoToDispatchModelOnly_v3", "rebuildLdoDispatchLedger_v1", "fixAllLdoStockBalances_v1", "backfillLdoDispatchConsumption_v1"]]
  )).rows;
  evidence.tables = {};
  const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    evidence.tables[tablename] = (await db.query(
      `select count(*)::int as count, md5(coalesce(string_agg(h, '' order by h), '')) as digest
       from (select md5(row_to_json(t)::text) as h from public.${quoted} t) s`
    )).rows[0];
  }
  await db.query("COMMIT");
  // Resolve the actual query dependency without reading files or business rows.
  await db.query("BEGIN READ ONLY");
  try {
    await db.query("select a.id from attachment_links l join attachments a on a.id=l.attachment_id limit 0");
    evidence.attachmentDependency = { succeeds: true };
  } catch (error) {
    evidence.attachmentDependency = { succeeds: false, code: error.code, message: error.message };
  } finally {
    await db.query("ROLLBACK");
  }
} finally {
  await db.end();
}
await fs.writeFile(`${dir}/${phase}.json`, JSON.stringify(evidence, null, 2));
if (phase === "after") {
  const before = JSON.parse(await fs.readFile(`${dir}/before.json`, "utf8"));
  const changed = [...new Set([...Object.keys(before.tables), ...Object.keys(evidence.tables)])]
    .filter(key => JSON.stringify(before.tables[key]) !== JSON.stringify(evidence.tables[key]));
  const result = { comparedTables: Object.keys(evidence.tables).length, changedTables: changed,
    permissionFilesUnchanged: protectedFiles.length, restartPerformed: false };
  await fs.writeFile(`${dir}/preservation.json`, JSON.stringify(result, null, 2));
  console.log(result);
  // A running app can update session/device activity independently. Never hide
  // those differences, but fail this verification if any other table changed.
  if (changed.some(table => !["user_sessions", "user_devices"].includes(table))) {
    process.exitCode = 1;
  }
}
console.log({ phase, database: evidence.database, attachmentDependency: evidence.attachmentDependency });
