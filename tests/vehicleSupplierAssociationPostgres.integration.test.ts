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
import express from "express";
import { createServer } from "http";
import request from "supertest";
import { writeFileSync } from "node:fs";
import { VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY } from "../shared/vehicleSupplierAssociation";
const authState = vi.hoisted(() => ({ admin: true, edit: true }));

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined), initPush: vi.fn(),
}));
vi.mock("../server/auth-routes", async (original) => ({
  ...await original<any>(),
  registerAuthRoutes: vi.fn(),
  assertEdit: vi.fn((_req, res) => {
    if (authState.edit) return true;
    res.status(403).json({ message: "Edit permission denied" });
    return false;
  }),
  currentUserName: vi.fn(() => "TESTER"),
}));
vi.mock("../server/auth", async (original) => {
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: 7, username: "TESTER", isAdmin: authState.admin, isOwner: false, isActive: true };
    next();
  };
  return { ...await original<any>(), requireAuth: inject, optionalAuth: inject };
});

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
let app: express.Express;

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
        material_source_supplier text,
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
    const { storage } = await import("../server/storage");
    vi.spyOn(storage, "getDprs").mockResolvedValue([{ id: 1 }] as any);
    vi.spyOn(storage, "getPlantMaterials").mockResolvedValue([{ id: 1 }] as any);
    vi.spyOn(storage, "getPlanningEquipmentTypes").mockResolvedValue([{ id: 1 }] as any);
    // Route registration starts unrelated SNL seeding asynchronously. Stop at
    // its read boundary (the seeder catches this), before any imports or writes.
    vi.spyOn(storage, "getSetting").mockRejectedValue(new Error("SNL startup seeding disabled in isolated trip integration suite"));
    vi.spyOn(storage, "backfillBoqPlanningInclude").mockResolvedValue({} as any);
    vi.spyOn(storage, "backfillBoqWorkType").mockResolvedValue({} as any);
    vi.spyOn(storage, "getSites").mockResolvedValue([{ id: 1, name: "SITE A" }] as any);
    vi.spyOn(storage, "getUserPermittedSiteIds").mockResolvedValue([1]);
    app = express();
    app.use(express.json());
    const { registerRoutes } = await import("../server/routes");
    await registerRoutes(createServer(app), app);
  });

  beforeEach(async () => {
    authState.admin = true;
    authState.edit = true;
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

  it("VB24: commits all 114 Soil trips over 15–22 September (direct SQL evidence)", async () => {
    await testPool!.query(`
      INSERT INTO site_material_trips (date, site, material, vehicle_number, quantity, uom)
      SELECT date '2026-09-15' + ((n-1) % 8), 'ALLADURG PWD ROAD TO PAMPAD',
        'Soil', (ARRAY['TG15UF4984','TG15UF4983','15UE4308'])[1 + ((n-1) % 3)],
        CASE WHEN n = 114 THEN 500 ELSE 600 END, 'CFT'
      FROM generate_series(1,114) n
    `);
    const before = await testPool!.query(`SELECT count(*)::int AS count, sum(quantity) AS quantity,
      count(material_source_supplier)::int AS assigned FROM site_material_trips`);
    expect(before.rows[0]).toEqual({ count: 114, quantity: 68300, assigned: 0 });
    const storage = new DatabaseStorage();
    const response = await request(app).post("/api/site-material-trips/material-source/bulk").send({
      site: "ALLADURG PWD ROAD TO PAMPAD", material: "Soil",
      dateFrom: "2026-09-15", dateTo: "2026-09-22", onlyUnassigned: false,
      materialSourceSupplier: "RAMESH MOHABATHPUR",
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ updatedCount: 114 });
    const after = await testPool!.query(`SELECT count(*)::int AS count
      FROM site_material_trips WHERE material_source_supplier = 'RAMESH MOHABATHPUR'`);
    expect(after.rows[0].count).toBe(114);
    const audits = await testPool!.query(`SELECT count(*)::int AS count,
      count(DISTINCT transaction_id)::int AS trips FROM audit_logs
      WHERE old_values->>'materialSourceSupplier' IS NULL
        AND new_values->>'materialSourceSupplier' = 'RAMESH MOHABATHPUR'`);
    expect(audits.rows[0]).toEqual({ count: 114, trips: 114 });
    const listed = await request(app).get("/api/site-material-trips").query({
      site: "ALLADURG PWD ROAD TO PAMPAD", material: "Soil",
      dateFrom: "2026-09-15", dateTo: "2026-09-22",
    });
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(114);
    expect(listed.body.every((row: any) => row.materialSourceSupplier === "RAMESH MOHABATHPUR")).toBe(true);
    expect((await storage.getSiteMaterialTrips({
      site: "ALLADURG PWD ROAD TO PAMPAD", material: "Soil",
      dateFrom: "2026-09-15", dateTo: "2026-09-22",
    })).every((row: any) => row.materialSourceSupplier === "RAMESH MOHABATHPUR")).toBe(true);
    console.info("VB24 direct SQL: before=114/68300 CFT/0 assigned; API storage result=114; committed assigned=114");
    if (process.env.VB24_EVIDENCE_PATH) {
      writeFileSync(process.env.VB24_EVIDENCE_PATH, [
        "VB24 real PostgreSQL integration evidence",
        `Captured: ${new Date().toISOString()}`,
        "Environment: isolated local PostgreSQL test database, temporary per-run schema; synthetic fixtures, not production trips.",
        "Actual registered Express POST/GET handlers, DatabaseStorage and PostgreSQL transactions; authentication and ancillary seed/site metadata mocked.",
        "Reproduce: ASSOCIATION_PG_TEST_URL=postgresql://runner@127.0.0.1:55439/vb24_test VB24_EVIDENCE_PATH=screenshots/vb24/database-verification.txt npx vitest run tests/vehicleSupplierAssociationPostgres.integration.test.ts",
        "Fixture: ALLADURG PWD ROAD TO PAMPAD; Soil; 2026-09-15 through 2026-09-22; onlyUnassigned:false; supplier RAMESH MOHABATHPUR.",
        "BEFORE SQL: SELECT count(*)::int AS count, sum(quantity) AS quantity, count(material_source_supplier)::int AS assigned FROM site_material_trips",
        JSON.stringify(before.rows),
        `POST /api/site-material-trips/material-source/bulk: HTTP ${response.status} ${JSON.stringify(response.body)}`,
        "AFTER SQL (separate pool query, after HTTP response): SELECT count(*)::int AS count FROM site_material_trips WHERE material_source_supplier = 'RAMESH MOHABATHPUR'",
        JSON.stringify(after.rows),
        "AUDIT SQL: SELECT count(*)::int AS count, count(DISTINCT transaction_id)::int AS trips FROM audit_logs WHERE old_values->>'materialSourceSupplier' IS NULL AND new_values->>'materialSourceSupplier' = 'RAMESH MOHABATHPUR'",
        JSON.stringify(audits.rows),
        `Fresh filtered GET: HTTP ${listed.status}, ${listed.body.length} trips, all assigned=${listed.body.every((row: any) => row.materialSourceSupplier === "RAMESH MOHABATHPUR")}`,
        "CAVEAT: Reported live persistence failure remains unreproduced. Original pre-fix storage with transactionId:0 also committed 114/114 in the isolated baseline run. This file captures the current post-change run, not that earlier baseline.",
        "ID0 was a proven per-trip history visibility defect, not an established rollback cause. Zero-match HTTP200 was a proven false-success boundary; now HTTP409. Audit failures must return HTTP500 and roll back.",
        "Production verification is separate/read-only; this integration evidence does not demonstrate or claim any live data repair.",
        "",
      ].join("\n"));
    }
  });

  it("VB24: zero matches is not HTTP success; audit failure is HTTP 500 and rolls back", async () => {
    const body = { site: "SITE A", onlyUnassigned: false, materialSourceSupplier: "SOURCE" };
    expect((await request(app).post("/api/site-material-trips/material-source/bulk").send(body)).status).toBe(409);
    await testPool!.query(`INSERT INTO site_material_trips(date,site,material) VALUES ('2026-09-19','SITE A','Soil')`);
    await query(`ALTER TABLE "${schemaName}".audit_logs ADD CONSTRAINT fail_association_audit CHECK (false)`);
    expect((await request(app).post("/api/site-material-trips/material-source/bulk").send(body)).status).toBe(500);
    expect((await testPool!.query(`SELECT material_source_supplier FROM site_material_trips`)).rows[0].material_source_supplier).toBeNull();
    expect((await testPool!.query(`SELECT * FROM audit_logs`)).rowCount).toBe(0);
  });

  it("VB24: preserves edit/site restrictions and exposes case-mismatched permitted names as zero, not success", async () => {
    await testPool!.query(`INSERT INTO site_material_trips(date,site,material)
      VALUES ('2026-09-19','SITE A','Soil'), ('2026-09-19','Site A','Soil'), ('2026-09-19','SITE B','Soil')`);
    const body = { site: "SITE A", onlyUnassigned: false, materialSourceSupplier: "SOURCE" };
    authState.edit = false;
    expect((await request(app).post("/api/site-material-trips/material-source/bulk").send(body)).status).toBe(403);
    authState.edit = true;
    authState.admin = false;
    expect((await request(app).post("/api/site-material-trips/material-source/bulk").send({ ...body, site: "SITE B" })).status).toBe(403);
    expect((await request(app).patch("/api/site-material-trips/3").send({ materialSourceSupplier: "SOURCE" })).status).toBe(403);
    const result = await request(app).post("/api/site-material-trips/material-source/bulk").send(body);
    expect(result.body.updatedCount).toBe(1);
    const listed = await request(app).get("/api/site-material-trips").query({ material: "Soil" });
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(1);
    await testPool!.query(`DELETE FROM site_material_trips WHERE id=1`);
    expect((await request(app).post("/api/site-material-trips/material-source/bulk").send(body)).status).toBe(409);
    expect((await testPool!.query(`SELECT material_source_supplier FROM site_material_trips ORDER BY id`)).rows)
      .toEqual([{ material_source_supplier: null }, { material_source_supplier: null }]);
  });

  it("VB24: fill blanks, per-trip history, single edit and clear, and single audit rollback", async () => {
    await testPool!.query(`INSERT INTO site_material_trips(date,site,material,material_source_supplier)
      VALUES ('2026-09-19','SITE A','Soil',NULL), ('2026-09-19','SITE A','Soil','OLD')`);
    const bulk = await request(app).post("/api/site-material-trips/material-source/bulk").send({
      site: "SITE A", onlyUnassigned: true, materialSourceSupplier: "NEW",
    });
    expect(bulk.body.updatedCount).toBe(1);
    expect((await testPool!.query(`SELECT material_source_supplier FROM site_material_trips ORDER BY id`)).rows)
      .toEqual([{ material_source_supplier: "NEW" }, { material_source_supplier: "OLD" }]);
    for (const value of ["EDITED", ""]) {
      const edit = await request(app).patch("/api/site-material-trips/1").send({ materialSourceSupplier: value });
      expect(edit.status).toBe(200);
      expect(edit.body.materialSourceSupplier).toBe(value || null);
      expect((await testPool!.query(`SELECT material_source_supplier FROM site_material_trips WHERE id=1`)).rows[0].material_source_supplier).toBe(value || null);
    }
    const history = await new DatabaseStorage().getAuditLogs("site_material_trips", 1);
    expect(history).toHaveLength(3);
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ oldValues: { materialSourceSupplier: null }, newValues: { materialSourceSupplier: "NEW" }, reason: "Bulk assigned material source supplier" }),
      expect.objectContaining({ oldValues: { materialSourceSupplier: "NEW" }, newValues: { materialSourceSupplier: "EDITED" } }),
      expect.objectContaining({ oldValues: { materialSourceSupplier: "EDITED" }, newValues: { materialSourceSupplier: null } }),
    ]));
    await query(`ALTER TABLE "${schemaName}".audit_logs ADD CONSTRAINT fail_association_audit CHECK (false) NOT VALID`);
    expect((await request(app).patch("/api/site-material-trips/1").send({ materialSourceSupplier: "FAIL" })).status).toBe(500);
    expect((await testPool!.query(`SELECT material_source_supplier FROM site_material_trips WHERE id=1`)).rows[0].material_source_supplier).toBeNull();
  });

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
    const setting = await query(`SELECT value FROM "${schemaName}".app_settings WHERE key = $1`, [VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY]);
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
    const setting = await query(`SELECT value FROM "${schemaName}".app_settings WHERE key = $1`, [VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY]);
    expect(setting.rows).toHaveLength(0);
  });

  it("pins an old pair through an ordinary edit and keeps complete-history conflict", async () => {
    const storage = new DatabaseStorage();
    await storage.createSiteMaterialTrip(materialTrip("KA01AB1234", "Original Haulage") as any);
    await storage.updateSiteMaterialTrip(1, { supplier: "Edited Historical Fact" } as any);
    const stored = await query(`SELECT value FROM "${schemaName}".app_settings WHERE key = $1`, [VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY]);
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
    const setting = await query(`SELECT value FROM "${schemaName}".app_settings WHERE key = $1`, [VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY]);
    expect(JSON.parse(setting.rows[0].value).TS09XX1.supplier).toBe("CONFIRMED HAULAGE");
    const auditAfter = await query(`SELECT id FROM "${schemaName}".audit_logs`);
    expect(auditAfter.rows).toHaveLength(1);
  });
});
