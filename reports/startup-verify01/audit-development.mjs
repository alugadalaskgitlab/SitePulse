// SELECT-only development audit. Does not import or start the application.
import pg from "pg";
import fs from "node:fs";
const client = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL || process.env.DATABASE_URL,
  options: "-c default_transaction_read_only=on" });
const quote = x => `"${x.replaceAll('"', '""')}"`;
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const identity = (await client.query("SELECT current_database(), current_setting('transaction_read_only') AS read_only")).rows[0];
  if (identity.current_database !== "sitelog_dev") throw Error("Unexpected development target; stopped");
  const catalog = (await client.query(`SELECT n.nspname AS schema_name,c.relname AS table_name,sn.nspname AS sequence_schema,s.relname AS sequence_name,q.seqincrement::text,q.seqcache::text,q.seqcycle
    FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S'
    JOIN pg_class c ON c.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid AND a.attname='id'
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_namespace sn ON sn.oid=s.relnamespace
    JOIN pg_sequence q ON q.seqrelid=s.oid WHERE d.deptype IN ('a','i') ORDER BY 1,2`)).rows;
  const rows = [];
  for (const r of catalog) {
    const table = `${quote(r.schema_name)}.${quote(r.table_name)}`;
    const seq = `${quote(r.sequence_schema)}.${quote(r.sequence_name)}`;
    const state = (await client.query(`SELECT last_value::text,is_called FROM ${seq}`)).rows[0];
    const max = (await client.query(`SELECT MAX(id)::text AS max_id FROM ${table}`)).rows[0].max_id;
    const next = BigInt(state.last_value) + (state.is_called ? BigInt(r.seqincrement) : 0n);
    const collision = (await client.query(`SELECT EXISTS(SELECT 1 FROM ${table} WHERE id=$1) AS collision`, [next.toString()])).rows[0].collision;
    rows.push({...r,...state,max_id:max,next_candidate:next.toString(),gap:max===null?null:(BigInt(state.last_value)-BigInt(max)).toString(),immediate_collision:collision});
  }
  const references = (await client.query(`SELECT
    (SELECT count(*) FROM equipment_logs e WHERE plant_usage_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM equipment_usage u WHERE u.id=e.plant_usage_id)) AS dangling_plant_usage,
    (SELECT count(*) FROM equipment_usage e WHERE source_usage_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM equipment_usage u WHERE u.id=e.source_usage_id)) AS dangling_source_usage`)).rows;
  const foreignKeys = (await client.query("SELECT conrelid::regclass::text AS table_name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND conrelid IN ('equipment_logs'::regclass,'equipment_usage'::regclass,'vendor_bill_items'::regclass)")).rows;
  fs.writeFileSync("reports/startup-verify01/development-sequences.json", JSON.stringify({identity,rows,references,foreignKeys},null,2));
} finally {
  await client.query("ROLLBACK");
  await client.end();
}
