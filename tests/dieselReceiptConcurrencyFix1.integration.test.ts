/**
 * FIX 1 PostgreSQL integration coverage.
 *
 * This suite is deliberately opt-in and only accepts DEV_DATABASE_URL (or the
 * explicitly named FIX1_DEV_DATABASE_URL). It creates all tables in a unique
 * temporary schema and drops that schema afterwards; operational/public data
 * is never written.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema";

const { Pool } = pg;
const connectionString = process.env.FIX1_DEV_DATABASE_URL ?? process.env.DEV_DATABASE_URL;
const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock("../server/db", () => ({ db: dbHolder.db }));

const describePostgres = describe.skipIf(!connectionString);
let adminPool: pg.Pool | undefined;
let testPool: pg.Pool | undefined;
let schemaName = "";
let DatabaseStorage: any;
let DieselReceiptExceedsRemainingError: any;

async function query(text: string, values?: unknown[]) {
  if (!adminPool) throw new Error("FIX 1 PostgreSQL test pool is not initialized");
  return adminPool.query(text, values);
}

describePostgres("FIX 1 linked diesel receipt concurrency", () => {
  beforeAll(async () => {
    schemaName = `diesel_receipt_fix1_${process.pid}_${Date.now().toString(36)}`;
    adminPool = new Pool({ connectionString });
    await query(`CREATE SCHEMA "${schemaName}"`);
    await query(`
      CREATE TABLE "${schemaName}".diesel_requirements (
        id serial PRIMARY KEY,
        status text NOT NULL,
        qty_purchased real
      );
      CREATE TABLE "${schemaName}".plant_materials (
        id serial PRIMARY KEY,
        name text NOT NULL,
        category text,
        allowed_uoms text,
        default_uom text,
        conversion_factor real,
        conversion_from_uom text,
        conversion_to_uom text,
        bulk_density real,
        is_active integer DEFAULT 1,
        created_at timestamp DEFAULT now(),
        procurement_route text,
        aliases text
      );
      CREATE TABLE "${schemaName}".material_receipts (
        id serial PRIMARY KEY,
        date date NOT NULL,
        time text,
        party_id integer,
        is_plant_common integer DEFAULT 0,
        material_id integer NOT NULL,
        quantity real NOT NULL,
        uom text NOT NULL,
        supplier text,
        transporter text,
        vehicle_number text,
        challan_number text,
        receipt_no text,
        invoice_no text,
        invoice_date date,
        indent_ref text,
        tank_number integer,
        notes text,
        linked_diesel_requirement_id integer,
        diesel_exception_reason text,
        plant_name text NOT NULL DEFAULT 'Main Plant',
        is_deleted boolean NOT NULL DEFAULT false,
        deleted_at timestamp,
        deleted_by integer,
        is_cancelled boolean NOT NULL DEFAULT false,
        cancelled_at timestamp,
        cancelled_by integer,
        cancellation_reason text,
        document_status text NOT NULL DEFAULT 'submitted',
        final_submitted_at timestamp,
        final_submitted_by integer,
        created_at timestamp DEFAULT now()
      );
      CREATE TABLE "${schemaName}".stock_balances (
        id serial PRIMARY KEY,
        party_id integer,
        material_id integer NOT NULL,
        balance numeric(20,6) NOT NULL DEFAULT 0,
        uom text,
        last_updated timestamp DEFAULT now()
      );
      CREATE TABLE "${schemaName}".stock_ledger (
        id serial PRIMARY KEY,
        date date NOT NULL,
        party_id integer,
        material_id integer NOT NULL,
        transaction_type text NOT NULL,
        reference_id integer,
        quantity_in numeric(20,6) DEFAULT 0,
        quantity_out numeric(20,6) DEFAULT 0,
        balance_after numeric(20,6),
        uom text,
        notes text,
        tank_number integer,
        created_at timestamp DEFAULT now()
      );
    `);
    testPool = new Pool({
      connectionString,
      options: `-c search_path=${schemaName},public`,
      max: 4,
    });
    dbHolder.db = drizzle(testPool, { schema });
    ({ DatabaseStorage, DieselReceiptExceedsRemainingError } = await import("../server/storage"));
  });

  beforeEach(async () => {
    await query(`
      TRUNCATE "${schemaName}".stock_ledger, "${schemaName}".stock_balances,
        "${schemaName}".material_receipts, "${schemaName}".diesel_requirements,
        "${schemaName}".plant_materials RESTART IDENTITY
    `);
    await query(`
      INSERT INTO "${schemaName}".diesel_requirements (status, qty_purchased)
      VALUES ('purchased', 100)
    `);
    await query(`
      INSERT INTO "${schemaName}".plant_materials (name, category, default_uom)
      VALUES ('DIESEL', 'Utility', 'Liters')
    `);
  });

  afterAll(async () => {
    if (adminPool) {
      await query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await adminPool.end();
    }
    await testPool?.end();
  });

  function receipt(quantity: number, receiptNo: string) {
    return {
      date: "2026-09-10",
      materialId: 1,
      quantity,
      uom: "Liters",
      isPlantCommon: 1,
      plantName: "Main Plant",
      linkedDieselRequirementId: 1,
      receiptNo,
    };
  }

  it("commits only one of two simultaneous full-remaining creates", async () => {
    const storage = new DatabaseStorage();
    const [first, second] = await Promise.allSettled([
      storage.createMaterialReceipt(receipt(100, "FIX1-A") as any),
      storage.createMaterialReceipt(receipt(100, "FIX1-B") as any),
    ]);

    expect([first, second].filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = [first, second].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DieselReceiptExceedsRemainingError);
    expect(rejected.reason.payload).toMatchObject({
      requestedQty: 100,
      remainingQty: 0,
      linkedDieselRequirementId: 1,
    });
    expect((await query(`SELECT COUNT(*)::int AS count FROM "${schemaName}".material_receipts`)).rows[0].count).toBe(1);
    expect((await query(`SELECT COUNT(*)::int AS count FROM "${schemaName}".stock_ledger`)).rows[0].count).toBe(1);
  });

  it("accepts an ordinary valid partial linked receipt", async () => {
    const storage = new DatabaseStorage();
    await expect(storage.createMaterialReceipt(receipt(40, "FIX1-PARTIAL") as any)).resolves.toBeTruthy();
    const row = (await query(`SELECT quantity, linked_diesel_requirement_id FROM "${schemaName}".material_receipts`)).rows[0];
    expect(Number(row.quantity)).toBe(40);
    expect(row.linked_diesel_requirement_id).toBe(1);
  });

  it("rejects an authoritative status change with a typed invalid-link error", async () => {
    await query(`UPDATE "${schemaName}".diesel_requirements SET status = 'pending' WHERE id = 1`);
    const storage = new DatabaseStorage();
    await expect(storage.createMaterialReceipt(receipt(25, "FIX1-STALE-STATUS") as any)).rejects.toMatchObject({
      code: "LINKED_DIESEL_REQUIREMENT_INVALID",
      requirementId: 1,
      message: "Linked diesel requirement not found or not a completed purchase",
    });
    expect((await query(`SELECT COUNT(*)::int AS count FROM "${schemaName}".material_receipts`)).rows[0].count).toBe(0);
  });

  it("serializes a linked quantity edit against a competing create", async () => {
    const storage = new DatabaseStorage();
    const initial = await storage.createMaterialReceipt(receipt(40, "FIX1-EDIT-INITIAL") as any);
    const [edited, created] = await Promise.allSettled([
      storage.updateMaterialReceipt(initial.id, { quantity: 100 } as any),
      storage.createMaterialReceipt(receipt(60, "FIX1-EDIT-CREATE") as any),
    ]);

    expect([edited, created].filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = [edited, created].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "DIESEL_RECEIPT_EXCEEDS_REMAINING" });
    const rows = (await query(`
      SELECT quantity FROM "${schemaName}".material_receipts
      WHERE is_cancelled = false AND is_deleted = false
      ORDER BY id
    `)).rows;
    expect(rows.reduce((sum: number, row: any) => sum + Number(row.quantity), 0)).toBe(100);
  });

  it("serializes a linked cancel against a competing create", async () => {
    const storage = new DatabaseStorage();
    const initial = await storage.createMaterialReceipt(receipt(60, "FIX1-CANCEL-INITIAL") as any);
    const [cancelled, created] = await Promise.allSettled([
      storage.cancelMaterialReceipt(initial.id, 99, "concurrency test"),
      storage.createMaterialReceipt(receipt(40, "FIX1-CANCEL-CREATE") as any),
    ]);

    expect(cancelled.status).toBe("fulfilled");
    if (created.status === "rejected") {
      expect(created.reason).toMatchObject({ code: "DIESEL_RECEIPT_EXCEEDS_REMAINING" });
    }
    const active = (await query(`
      SELECT COALESCE(SUM(quantity), 0) AS quantity
      FROM "${schemaName}".material_receipts
      WHERE is_cancelled = false AND is_deleted = false
    `)).rows[0];
    expect(Number(active.quantity)).toBe(created.status === "fulfilled" ? 40 : 0);
  });

  it("rolls back the receipt and stock ledger when the ledger write fails", async () => {
    await query(`
      ALTER TABLE "${schemaName}".stock_ledger
      ADD CONSTRAINT fix1_force_ledger_failure CHECK (transaction_type <> 'receipt')
    `);
    const storage = new DatabaseStorage();
    await expect(storage.createMaterialReceipt(receipt(25, "FIX1-ROLLBACK") as any)).rejects.toThrow();
    expect((await query(`SELECT COUNT(*)::int AS count FROM "${schemaName}".material_receipts`)).rows[0].count).toBe(0);
    expect((await query(`SELECT COUNT(*)::int AS count FROM "${schemaName}".stock_ledger`)).rows[0].count).toBe(0);
    expect((await query(`SELECT COUNT(*)::int AS count FROM "${schemaName}".stock_balances`)).rows[0].count).toBe(0);
    await query(`ALTER TABLE "${schemaName}".stock_ledger DROP CONSTRAINT fix1_force_ledger_failure`);
  });
});