import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { ACCESS_MIGRATION_KEY } from "./permissionAccessMigration";

/** Startup validates prerequisites; it must never repair customer data.
 * Provisioning and historical repairs require a separately reviewed migration.
 */
export async function verifyStartupReadiness(pool: {
  connect(): Promise<{ query: (text: string, values?: any[]) => Promise<{ rows: any[] }>; release(): void }>;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const columns = (await client.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'",
    )).rows;
    const present = new Set(columns.map(r => `${r.table_name}.${r.column_name}`));
    const missing: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      for (const column of table.columns) {
        if (!present.has(`${table.name}.${column.name}`)) missing.push(`${table.name}.${column.name}`);
      }
    }
    if (missing.length) throw new Error(`STARTUP_SCHEMA_NOT_READY: ${missing.join(", ")}. Apply an explicitly reviewed migration; startup will not modify schema.`);
    const indexes = (await client.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND indexname IN ('hire_statements_equipment_period_uq','equipment_usage_source_usage_successor_uq','stock_ledger_dispatch_dedup_idx')",
    )).rows;
    for (const name of ["hire_statements_equipment_period_uq", "equipment_usage_source_usage_successor_uq", "stock_ledger_dispatch_dedup_idx"]) {
      if (!indexes.some(r => r.indexname === name)) throw new Error(`STARTUP_INDEX_REQUIRED: ${name}`);
    }
    const hireIndex = indexes.find(r => r.indexname === "hire_statements_equipment_period_uq")!;
    if (!/UNIQUE INDEX.*USING btree \(equipment_id, period_from, period_to\)$/i.test(hireIndex.indexdef)) {
      throw new Error("STARTUP_INDEX_INCOMPATIBLE: hire statement period index must be unconditional");
    }
    const marker = (await client.query(
      "SELECT key FROM app_settings WHERE key=$1", [ACCESS_MIGRATION_KEY],
    )).rows;
    if (!marker.length) throw new Error("STARTUP_ACCESS_MIGRATION_REQUIRED: existing permission preservation must be reviewed/applied explicitly before serving.");
    const admins = (await client.query("SELECT id FROM users WHERE is_admin=true LIMIT 1")).rows;
    if (!admins.length) throw new Error("STARTUP_ADMIN_REQUIRED: provision an administrator explicitly; startup will not promote or create users.");
    await client.query("COMMIT");
    return { ready: true, checkedColumns: present.size };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
