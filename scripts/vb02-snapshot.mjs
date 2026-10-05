import fs from "node:fs/promises";
import pg from "pg";
const tables = ["vendor_bills", "hire_statements", "equipment_usage", "site_material_trips", "store_issues"];
const name = process.argv[2];
if (!/^[a-z-]+$/.test(name || "")) throw new Error("Evidence name required");
if (!process.env.DEV_DATABASE_URL) throw new Error("Development database required");
const client = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  if ((await client.query("SELECT current_database() AS db")).rows[0].db !== "sitelog_dev") throw new Error("Wrong database");
  const result = { at: new Date().toISOString(), tables: {} };
  for (const table of tables) result.tables[table] = (await client.query(
    `SELECT count(*)::int AS count, md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY id),'')) AS checksum FROM ${table} t`
  )).rows[0];
  await client.query("COMMIT");
  await fs.writeFile(`.agents/outputs/vb-export-02-a/${name}.json`, JSON.stringify(result, null, 2));
  console.log(result);
} finally { await client.end(); }