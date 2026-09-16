/**
 * PostgreSQL-only integration coverage for the vehicle association invariant.
 *
 * The suite is opt-in when a PostgreSQL URL is available (DATABASE_URL or
 * ASSOCIATION_PG_TEST_URL).  Every object is created in a per-run temporary
 * schema and the schema is dropped in afterAll; no operational tables or rows
 * are touched.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

const { Pool } = pg;
const connectionString = process.env.ASSOCIATION_PG_TEST_URL ?? process.env.DATABASE_URL;
const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock("../server/db", () => ({ db: dbHolder.db }));

const describePostgres = describe.skipIf(!connectionString);
let adminPool: pg.Pool | undefined;
let testPool: pg.Pool | undefined;
let schemaName = "";
let DatabaseStorage: any;
let VehicleSupplierAssociationVersionConflictError: any;

async function query(text: string, values?: unknown[]) {
  if (!adminPool) throw new Error("PostgreSQL test pool is not initialized");
  return adminPool.query(text, values);
}

describePostgres("vehicle supplier association PostgreSQL transactions", () => {
  beforeAll(async () => {
    schemaName = `vehicle_assoc_test_${process.pid}_${Date.now().toString(36)}`;
    adminPool = new Pool({ connectionString });
    await query(`CREATE SCHEMA "${schemaName}"`);
    await query(`
      CREATE TABLE "${schemaName}".app_settings (
        id serial PRIMARY KEY,
        key text NOT NULL UNIQUE,
        value text NOT NULL,
        updated_at timestamp DEFAULT now()
      );
      CREATE TABLE "${schemaName}".site_material_trips (
        id serial PRIMARY KEY,
        date date NOT NULL,
        time text,
        site text NOT NULL,
        material text,
        supplier text,
        vehicle_number text,
        transport_type text,
        internal_equipment_id integer,
        quantity real,
        uom text,
        location text,
        receipt_number text,
        entered_by text,
        notes text,
        work_type text,
        indent_id integer,
        indent_item_id integer,
        pi_transaction_id integer,
        pending_receipt_id integer,
        boq_project_id integer,
        boq_item_id integer,
        programme_bar_id integer,
        earthwork_arrangement_id integer,
        unloaded_at text,
        yard_label text,
        created_at timestamp DEFAULT now(),
        is_deleted boolean NOT NULL DEFAULT false,
        deleted_at timestamp,
        deleted_by integer,
        is_cancelled boolean NOT NULL DEFAULT false,
        cancelled_at timestamp,
        cancelled_by integer,
        cancellation_reason text,
        CONSTRAINT no_failed_supplier CHECK (supplier <> 'FAIL')
      );
      CREATE TABLE "${schemaName}".audit_logs (
        id serial PRIMARY KEY,
        module text NOT NULL,
        transaction_id integer NOT NULL,
        action text NOT NULL,
        user_id integer,
        user_name text NOT NULL,
        user_role text,
        old_values jsonb,
        new_values jsonb,
        reason text,
        stock_impact text,
        created_at timestamp DEFAULT now()
      );
    `);
    testPool = new Pool({
      connectionString,
      options: `-c search_path=${schemaName},public`,
      max: 4,
    });
    dbHolder.db = drizzle(testPool, { schema });
    ({ DatabaseStorage, VehicleSupplierAssociationVersionConflictError } =
      await import("../server/storage"));
  });

  beforeEach(async () => {
    await query(`TRUNCATE "${schemaName}".audit_logs, "${schemaName}".app_settings, "${schemaName}".site_material_trips RESTART IDENTITY`);
    await query(`ALTER TABLE "${schemaName}".app_settings DROP CONSTRAINT IF EXISTS fail_association_write`);
    await query(`ALTER TABLE "${schemaName}".audit_logs DROP CONSTRAINT IF EXISTS fail_association_audit`);
  });

  afterAll(async () => {
    if (adminPool) {
      await query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
    await testPool?.end();
  });

  function materialTrip(vehicleNumber: string, supplier: string) {
    return {
      date: "2026-01-01",
      site: "Site A",
      material: "GSB",
      vehicleNumber,
      supplier,
      quantity: 1,
      uom: "MT",
      isCancelled: false,
      isDeleted: false,
    };
  }

  it("serializes two concurrent DatabaseStorage creates on real pooled connections", async () => {
    const storage = new DatabaseStorage();
    const key = "KA01AB1234";
    const first = storage.createSiteMaterialTrip(materialTrip("KA01AB1234", "First Haulage") as any);
    const second = storage.createSiteMaterialTrip(materialTrip("KA 01 AB-1234", "Second Haulage") as any);
    const [firstTrip, secondTrip] = await Promise.all([first, second]);
    expect([firstTrip.supplier, secondTrip.supplier].sort()).toEqual([
      "First Haulage",
      "Second Haulage",
    ]);

    const trips = await query(`SELECT vehicle_number, supplier FROM "${schemaName}".site_material_trips ORDER BY id`);
    expect(trips.rows).toHaveLength(2);
    expect(trips.rows.map((row) => row.supplier).sort()).toEqual([
      "First Haulage",
      "Second Haulage",
    ]);
    const setting = await query(`SELECT value FROM "${schemaName}".app_settings`);
    const associations = JSON.parse(setting.rows[0].value);
    expect(Object.keys(associations)).toEqual([key]);
    expect(["FIRST HAULAGE", "SECOND HAULAGE"]).toContain(associations[key].supplier);
  });

  it("rolls back the factual trip and old-pair pin when association persistence fails", async () => {
    if (!testPool) throw new Error("PostgreSQL test pool is not initialized");
    await query(`ALTER TABLE "${schemaName}".app_settings ADD CONSTRAINT fail_association_write CHECK (length(value) > 1000000)`);
    const storage = new DatabaseStorage();
    let createError: unknown;
    try {
      await storage.createSiteMaterialTrip(materialTrip("TS09XX1", "Acme") as any);
    } catch (error) {
      createError = error;
    }
    expect(createError).toBeInstanceOf(Error);
    const trips = await query(`SELECT id FROM "${schemaName}".site_material_trips`);
    expect(trips.rows).toHaveLength(0);

    await query(`ALTER TABLE "${schemaName}".app_settings DROP CONSTRAINT fail_association_write`);
    await query(`
      INSERT INTO "${schemaName}".site_material_trips
        (date, site, material, vehicle_number, supplier, quantity, uom)
      VALUES ('2026-01-01', 'Site A', 'GSB', 'KA01AB1234', 'ORIGINAL HAULAGE', 1, 'MT')
    `);
    const oldRow = (await query(`SELECT id FROM "${schemaName}".site_material_trips`)).rows[0];
    await expect(storage.updateSiteMaterialTrip(oldRow.id, { supplier: "FAIL" } as any)).rejects.toThrow();
    const setting = await query(`SELECT value FROM "${schemaName}".app_settings`);
    expect(setting.rows).toHaveLength(0);
  });

  it("pins an old pair through an ordinary edit and keeps complete-history conflict", async () => {
    const storage = new DatabaseStorage();
    await storage.createSiteMaterialTrip(materialTrip("KA01AB1234", "Original Haulage") as any);
    await storage.updateSiteMaterialTrip(1, { supplier: "Edited Historical Fact" } as any);
    const stored = await query(`SELECT value FROM "${schemaName}".app_settings`);
    const key = "KA01AB1234";
    expect(JSON.parse(stored.rows[0].value)[key].supplier).toBe("ORIGINAL HAULAGE");

    await query(`
      INSERT INTO "${schemaName}".site_material_trips
        (date, site, material, vehicle_number, supplier, quantity, uom)
      SELECT '2026-01-01', 'Site A', 'GSB', 'KA01AB1234', 'SUPPLIER A', 1, 'MT'
      FROM generate_series(1, 1001)
    `);
    await query(`
      INSERT INTO "${schemaName}".site_material_trips
        (date, site, material, vehicle_number, supplier, quantity, uom)
      VALUES ('2026-01-01', 'Site A', 'GSB', 'KA01AB1234', 'SUPPLIER B', 1, 'MT')
    `);
    const suggestions = await storage.getSiteMaterialTripSuggestions("Site A");
    // The persisted correction wins over conflict for future autofill.
    expect(suggestions.vehicleSuppliers[key].status).toBe("linked");
    expect(suggestions.vehicleSuppliers[key].supplier).toBe("ORIGINAL HAULAGE");
  });

  it("enforces CAS and audits correction atomically with authenticated actor data", async () => {
    const storage = new DatabaseStorage();
    await query(`
      INSERT INTO "${schemaName}".site_material_trips
        (date, site, material, vehicle_number, supplier, quantity, uom)
      VALUES ('2026-01-01', 'Site A', 'GSB', 'TS09XX1', 'HISTORICAL HAULAGE', 1, 'MT')
    `);
    const actor = { userId: 17, userName: "Owner Test", userRole: "owner" };
    await expect(storage.correctVehicleSupplierAssociation({
      site: "Site A",
      vehicleNumber: "TS09XX1",
      supplier: "Stale Before Save",
      expectedVersion: null,
      expectedSupplier: "STALE BEFORE SAVE",
      actor,
    })).rejects.toBeInstanceOf(VehicleSupplierAssociationVersionConflictError);
    const corrected = await storage.correctVehicleSupplierAssociation({
      site: "Site A",
      vehicleNumber: "TS09XX1",
      supplier: "Confirmed Haulage",
      expectedVersion: null,
      expectedSupplier: "HISTORICAL HAULAGE",
      actor,
    });
    expect(corrected.association.status).toBe("linked");
    const audit = await query(`SELECT user_id, user_name, old_values, new_values FROM "${schemaName}".audit_logs`);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ user_id: 17, user_name: "Owner Test" });

    await expect(storage.correctVehicleSupplierAssociation({
      site: "Site A",
      vehicleNumber: "TS09XX1",
      supplier: "Stale Haulage",
      expectedVersion: null,
      expectedSupplier: "CONFIRMED HAULAGE",
      actor,
    })).rejects.toBeInstanceOf(VehicleSupplierAssociationVersionConflictError);

    await query(`ALTER TABLE "${schemaName}".audit_logs ADD CONSTRAINT fail_association_audit CHECK (user_id <> 9999)`);
    await expect(storage.correctVehicleSupplierAssociation({
      site: "Site A",
      vehicleNumber: "TS09XX1",
      supplier: "Atomic Failure",
      expectedVersion: corrected.association.version,
      expectedSupplier: "CONFIRMED HAULAGE",
      actor: { ...actor, userId: 9999 },
    })).rejects.toThrow();
    const setting = await query(`SELECT value FROM "${schemaName}".app_settings`);
    expect(JSON.parse(setting.rows[0].value).TS09XX1.supplier).toBe("CONFIRMED HAULAGE");
    const auditAfter = await query(`SELECT id FROM "${schemaName}".audit_logs`);
    expect(auditAfter.rows).toHaveLength(1);
  });
});
