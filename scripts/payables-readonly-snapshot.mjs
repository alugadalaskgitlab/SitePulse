import pg from "pg";
import fs from "node:fs/promises";

// Never infer production from a workspace connection: this evidence script
// intentionally uses the application's explicit development database only.
if (!process.env.DEV_DATABASE_URL) throw new Error("Explicit development database required");
const output = process.argv[2];
if (!output?.startsWith(".agents/outputs/vb-payables-preview/")) {
  throw new Error("Use an evidence path under .agents/outputs/vb-payables-preview/");
}
const tables = [
  "vendor_bills", "hire_statements", "equipment_usage",
  "site_material_trips", "store_issues", "vendor_bill_items",
  "vendor_rate_cards", "hire_statement_exceptions",
];
const client = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const database = (await client.query("SELECT current_database() AS name")).rows[0].name;
  if (database !== "sitelog_dev") throw new Error("Unexpected development database");
  const snapshot = { environment: "development", capturedAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const exists = (await client.query("SELECT to_regclass($1) AS name", [`public.${table}`])).rows[0].name;
    if (!exists) throw new Error(`Expected evidence table missing: ${table}`);
    snapshot.tables[table] = (await client.query(
      `SELECT count(*)::int AS count,
       md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY id), '')) AS fingerprint
       FROM public."${table}" t`,
    )).rows[0];
  }
  await client.query("COMMIT");
  await fs.mkdir(".agents/outputs/vb-payables-preview", { recursive: true });
  await fs.writeFile(output, JSON.stringify(snapshot, null, 2));
  console.log(JSON.stringify(snapshot, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}