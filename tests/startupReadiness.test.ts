import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../shared/schema";
import { verifyStartupReadiness } from "../server/startupReadiness";
import { ACCESS_MIGRATION_KEY } from "../server/permissionAccessMigration";
import { readFileSync } from "node:fs";

describe("read-only startup", () => {
  it("verifies an isolated database without changing any row or count; rejects missing prerequisites", async () => {
    const pg = new PGlite();
    try {
      for (const value of Object.values(schema)) {
        if (!is(value, PgTable)) continue;
        const table = getTableConfig(value);
        await pg.exec(`CREATE TABLE "${table.name}" (${table.columns.map(c => `"${c.name}" ${c.getSQLType()}`).join(",")})`);
      }
      await pg.exec(`CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON hire_statements(equipment_id,period_from,period_to);
        CREATE UNIQUE INDEX equipment_usage_source_usage_successor_uq ON equipment_usage(source_usage_id) WHERE source_usage_id IS NOT NULL;
        CREATE UNIQUE INDEX stock_ledger_dispatch_dedup_idx ON stock_ledger(material_id,party_id,reference_id);
        INSERT INTO users(id,is_admin) VALUES(1,true);
        INSERT INTO plant_shift_logs(id,lock_status) VALUES(1,'locked');
        INSERT INTO dprs(id,site,is_superseded) VALUES(1,'STARTUP TEST',false);
        INSERT INTO vendor_bills(id,total_amount) VALUES(1,1234);`);
      await pg.query("INSERT INTO app_settings(key,value) VALUES($1,'completed')", [ACCESS_MIGRATION_KEY]);
      const pool = { connect: async () => ({ query: (q: string, p?: any[]) => pg.query(q,p), release() {} }) };
      const fingerprint = async () => {
        const tables = (await pg.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows;
        return Promise.all(tables.map(async t => (await pg.query(`SELECT count(*)::text n,md5(coalesce(string_agg(row_to_json(t)::text,'' ORDER BY row_to_json(t)::text),'')) hash FROM "${t.table_name}" t`)).rows));
      };
      const before = await fingerprint();
      await expect(verifyStartupReadiness(pool as any)).resolves.toMatchObject({ ready: true });
      expect(await fingerprint()).toEqual(before);
      await pg.exec("ALTER TABLE vendor_bills DROP COLUMN total_amount");
      await expect(verifyStartupReadiness(pool as any)).rejects.toThrow("STARTUP_SCHEMA_NOT_READY");
      await pg.exec("ALTER TABLE vendor_bills ADD COLUMN total_amount real");
      await pg.exec("DELETE FROM app_settings");
      await expect(verifyStartupReadiness(pool as any)).rejects.toThrow("STARTUP_ACCESS_MIGRATION_REQUIRED");
      await pg.query("INSERT INTO app_settings(key,value) VALUES($1,'completed')", [ACCESS_MIGRATION_KEY]);
      await pg.exec("DELETE FROM users");
      await expect(verifyStartupReadiness(pool as any)).rejects.toThrow("STARTUP_ADMIN_REQUIRED");
      await pg.exec("INSERT INTO users(id,is_admin) VALUES(1,true); DROP INDEX hire_statements_equipment_period_uq");
      await expect(verifyStartupReadiness(pool as any)).rejects.toThrow("STARTUP_INDEX_REQUIRED");
      await pg.exec("CREATE UNIQUE INDEX hire_statements_equipment_period_uq ON hire_statements(equipment_id,period_from,period_to) WHERE billing_basis<>'daily'");
      await expect(verifyStartupReadiness(pool as any)).rejects.toThrow("STARTUP_INDEX_INCOMPATIBLE");
    } finally { await pg.close(); }
  }, 60000);
  it("does not schedule migration/seed runners during startup or route registration", () => {
    const index = readFileSync("server/index.ts","utf8");
    expect(index).toContain("await verifyStartupReadiness(pool)");
    expect(index).not.toMatch(/storage\.(ensure|backfill|migrate|seed|repair|deduplicate)\w*\(/);
    expect(index).not.toContain("runBackgroundMigrations");
    const routes = readFileSync("server/routes.ts","utf8");
    const startup = routes.slice(routes.indexOf("// ─── END SNL"), routes.indexOf("async function seedPlantMasterData"));
    expect(startup).not.toMatch(/\b(seedDatabase|seedSnlItems|ensureDprBoqProjectColumn|backfillBoqWorkType)\(/);
    expect(index).toContain("startStaleGrnNotifications()");
  });
});
