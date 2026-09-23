import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../shared/schema";

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ db: dbHolder.db }));

let pg: PGlite;
let DatabaseStorage: typeof import("../server/storage").DatabaseStorage;

describe("MAT-01 Materials Received database queries", () => {
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      CREATE TABLE site_material_trips (
        id serial PRIMARY KEY, date date NOT NULL, time text, site text NOT NULL,
        material text NOT NULL, supplier text, material_source_supplier text,
        vehicle_number text, transport_type text, internal_equipment_id integer,
        quantity real NOT NULL, uom text NOT NULL, location text, receipt_number text,
        entered_by text, notes text, work_type text, indent_id integer,
        indent_item_id integer, pi_transaction_id integer, pending_receipt_id integer,
        boq_project_id integer, boq_item_id integer, programme_bar_id integer,
        earthwork_arrangement_id integer, unloaded_at text, yard_label text,
        created_at timestamp DEFAULT now(), is_deleted boolean DEFAULT false,
        deleted_at timestamp, deleted_by integer, is_cancelled boolean DEFAULT false,
        cancelled_at timestamp, cancelled_by integer, cancellation_reason text
      );
      CREATE TABLE dprs (
        id serial PRIMARY KEY, date date NOT NULL, site text NOT NULL,
        engineer text NOT NULL, is_superseded boolean DEFAULT false, work_type text
      );
      CREATE TABLE material_logs (
        id serial PRIMARY KEY, dpr_id integer NOT NULL, type text NOT NULL,
        material text NOT NULL, supplier text, quantity real, uom text,
        vehicle_number text, location text, receipt_number text
      );
      CREATE TABLE equipment_logs (
        id serial PRIMARY KEY, dpr_id integer NOT NULL, machine text NOT NULL,
        operator text, vehicle_no text, task text, number_of_trips integer,
        water_quantity real, start_time text, end_time text
      );

      INSERT INTO site_material_trips
        (date, site, material, supplier, material_source_supplier, vehicle_number, quantity, uom)
      VALUES
        ('2026-09-16', 'TEST ROAD', 'Soil', 'ROAD TRANSPORT', 'BORROW OWNER', 'TS01AA0001', 600, 'CFT'),
        ('2026-09-17', 'TEST ROAD', 'Soil', 'BORROW OWNER', 'QUARRY TWO', 'TS01AA0002', 600, 'CFT'),
        ('2026-09-18', 'TEST ROAD', 'Soil', 'OTHER HAULER', NULL, NULL, 600, 'CFT');

      INSERT INTO dprs (date, site, engineer, is_superseded, work_type)
      VALUES ('2026-09-19', 'TEST ROAD', 'ENGINEER', false, 'road');
      INSERT INTO material_logs
        (dpr_id, type, material, supplier, quantity, uom, vehicle_number)
      VALUES (1, 'Received', 'Soil', 'DPR SUPPLIER', 10, 'MT', 'TS01DPR');
    `);
    dbHolder.db = drizzle(pg, { schema });
    ({ DatabaseStorage } = await import("../server/storage"));
  });

  afterAll(async () => {
    await pg?.close();
  });

  it("executes the received query with source-or-transporter matching and returns the source field", async () => {
    const storage = new DatabaseStorage();

    const bySourceOnlyParty = await storage.getAllMaterialsReceived({
      site: "TEST ROAD",
      material: "Soil",
      supplier: "QUARRY TWO",
    });
    expect(bySourceOnlyParty).toHaveLength(1);
    expect(bySourceOnlyParty[0]).toMatchObject({
      supplier: "BORROW OWNER",
      materialSourceSupplier: "QUARRY TWO",
    });

    const byTransporter = await storage.getAllMaterialsReceived({
      site: "TEST ROAD",
      material: "Soil",
      supplier: "ROAD TRANSPORT",
    });
    expect(byTransporter).toHaveLength(1);
    expect(byTransporter[0]).toMatchObject({
      supplier: "ROAD TRANSPORT",
      materialSourceSupplier: "BORROW OWNER",
    });
  });

  it("executes the scoped supplier union query without changing default shared consumers", async () => {
    const storage = new DatabaseStorage();
    const sharedNames = await storage.getMaterialSuppliers();
    const reportNames = await storage.getMaterialSuppliers(true);

    expect(sharedNames).toEqual([
      "BORROW OWNER",
      "DPR SUPPLIER",
      "OTHER HAULER",
      "ROAD TRANSPORT",
    ]);
    expect(reportNames).toEqual([
      "BORROW OWNER",
      "DPR SUPPLIER",
      "OTHER HAULER",
      "QUARRY TWO",
      "ROAD TRANSPORT",
    ]);
    expect(reportNames.filter(name => name === "BORROW OWNER")).toHaveLength(1);
  });
});