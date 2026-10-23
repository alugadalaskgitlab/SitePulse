import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));

let pg: PGlite;
let storage: any;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE boq_items (
      id integer PRIMARY KEY,
      recipe_manual_override boolean
    );
    CREATE TABLE boq_item_equipment (
      id serial PRIMARY KEY,
      boq_item_id integer NOT NULL,
      equipment_name text NOT NULL,
      equipment_master_id integer,
      planning_equipment_type_id integer,
      qty_per_boq_unit real NOT NULL DEFAULT 0,
      count real NOT NULL DEFAULT 1,
      sort_order integer NOT NULL DEFAULT 0,
      notes text,
      created_at timestamp DEFAULT now()
    );
    INSERT INTO boq_items (id, recipe_manual_override) VALUES (1, NULL);
  `);
  holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
}, 60000);

afterAll(async () => pg?.close());

describe("per-item manual recipe protection", () => {
  it("protects manually saved rows from automatic replacement until reset", async () => {
    await storage.upsertBoqItemEquipment(1, [{
      boqItemId: 1,
      equipmentName: "Paver",
      equipmentMasterId: null,
      planningEquipmentTypeId: null,
      qtyPerBoqUnit: 0.02,
      count: 1,
      sortOrder: 0,
      notes: null,
    }], true);

    expect((await pg.query("SELECT recipe_manual_override FROM boq_items WHERE id = 1")).rows[0])
      .toEqual({ recipe_manual_override: true });

    await expect(storage.upsertBoqItemEquipment(1, [{
      boqItemId: 1,
      equipmentName: "Motor Grader",
      equipmentMasterId: null,
      planningEquipmentTypeId: null,
      qtyPerBoqUnit: 0.0067,
      count: 1,
      sortOrder: 0,
      notes: null,
    }])).rejects.toMatchObject({ code: "RECIPE_MANUAL_OVERRIDE" });

    expect((await pg.query("SELECT equipment_name FROM boq_item_equipment WHERE boq_item_id = 1")).rows)
      .toEqual([{ equipment_name: "Paver" }]);

    expect(await storage.resetBoqItemRecipeManualOverride(1)).toBe(true);
    expect((await pg.query("SELECT recipe_manual_override FROM boq_items WHERE id = 1")).rows[0])
      .toEqual({ recipe_manual_override: null });

    await storage.upsertBoqItemEquipment(1, [{
      boqItemId: 1,
      equipmentName: "Motor Grader",
      equipmentMasterId: null,
      planningEquipmentTypeId: null,
      qtyPerBoqUnit: 0.0067,
      count: 1,
      sortOrder: 0,
      notes: null,
    }]);

    expect((await pg.query("SELECT equipment_name FROM boq_item_equipment WHERE boq_item_id = 1")).rows)
      .toEqual([{ equipment_name: "Motor Grader" }]);

    const [row] = (await pg.query("SELECT id FROM boq_item_equipment WHERE boq_item_id = 1")).rows;
    await storage.deleteBoqItemEquipmentRow(row.id);
    expect((await pg.query("SELECT recipe_manual_override FROM boq_items WHERE id = 1")).rows[0])
      .toEqual({ recipe_manual_override: true });
    await expect(storage.upsertBoqItemEquipment(1, [{
      boqItemId: 1,
      equipmentName: "Automatic Grader",
      qtyPerBoqUnit: 0.0067,
      count: 1,
      sortOrder: 0,
    }])).rejects.toMatchObject({ code: "RECIPE_MANUAL_OVERRIDE" });
  });
});
