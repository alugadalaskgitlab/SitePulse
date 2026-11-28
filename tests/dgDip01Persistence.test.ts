import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/pglite";
import { applyEquipmentDip } from "@shared/equipmentTankDip";
import { lastEquipmentDieselDip, useEquipmentFillingRate } from "../server/equipmentTankDip";

const pg = new PGlite();
const db = drizzle(pg);
beforeAll(async () => {
  await pg.exec(`
    CREATE TABLE equipment_master (id serial PRIMARY KEY, name text);
    CREATE TABLE equipment_usage (id serial PRIMARY KEY, equipment_id integer, opening_diesel real, closing_diesel real,
      diesel_balance_in_tank real, diesel_issued real, date date, created_at timestamp DEFAULT now(),
      destination_site text, site_name text, plant_name text, source_heating_session_id integer);
    CREATE TABLE generator_logs (id serial PRIMARY KEY, generator_name text, opening_diesel real, closing_diesel real,
      date date, created_at timestamp DEFAULT now(), plant_name text, source_heating_session_id integer);
    CREATE TABLE equipment_logs (id serial PRIMARY KEY, equipment_id integer, dpr_id integer, opening_diesel real, diesel_balance_in_tank real);
    CREATE TABLE dprs (id serial PRIMARY KEY, date date, site text, created_at timestamp DEFAULT now(),
      dpr_status text, is_deleted boolean DEFAULT false, is_superseded boolean DEFAULT false);
    CREATE TABLE bitumen_heating_sessions (id serial PRIMARY KEY, dg_mode text, dg_generator_name text, dg_opening_diesel real,
      dg_closing_diesel real, date date, created_at timestamp DEFAULT now(), plant_name text);
    CREATE TABLE audit_logs (id serial PRIMARY KEY, module text NOT NULL, transaction_id integer NOT NULL,
      action text NOT NULL, user_id integer, user_name text NOT NULL, user_role text, reason text,
      old_values jsonb, new_values jsonb, stock_impact text, created_at timestamp DEFAULT now());
    INSERT INTO equipment_usage (opening_diesel, closing_diesel, diesel_issued) VALUES (100, 75, 10);
  `);
  await pg.exec(readFileSync("migrations/0081_equipment_tank_dip.sql", "utf8"));
}, 30000);
afterAll(async () => { await pg.close(); });

it("adds only nullable columns and leaves old entries unchanged", async () => {
  expect((await pg.query("SELECT opening_diesel, closing_diesel, diesel_issued, opening_dip_cm, closing_dip_cm FROM equipment_usage WHERE id=1")).rows)
    .toEqual([{ opening_diesel: 100, closing_diesel: 75, diesel_issued: 10, opening_dip_cm: null, closing_dip_cm: null }]);
  const migration = readFileSync("migrations/0081_equipment_tank_dip.sql", "utf8").trim().split("\n");
  expect(migration).toHaveLength(11);
  for (const line of migration) expect(line).toMatch(/^ALTER TABLE \w+ ADD COLUMN \w+ real;$/);
});

it("stores calibrated litres and cm in all four real table schemas", async () => {
  const settings = { dipLitersPerCm: 12.5, deadStockDepthCm: 4 };
  const usage = applyEquipmentDip({ openingDipCm: 42, closingDipCm: 40, openingDiesel: 999 }, settings);
  expect(usage).toMatchObject({ openingDiesel: 525, dieselBalanceInTank: 500 });
  for (const [table, opening, closing, openCm, closeCm] of [
    ["equipment_usage", "opening_diesel", "diesel_balance_in_tank", "opening_dip_cm", "closing_dip_cm"],
    ["generator_logs", "opening_diesel", "closing_diesel", "opening_dip_cm", "closing_dip_cm"],
    ["equipment_logs", "opening_diesel", "diesel_balance_in_tank", "opening_dip_cm", "closing_dip_cm"],
    ["bitumen_heating_sessions", "dg_opening_diesel", "dg_closing_diesel", "dg_opening_dip_cm", "dg_closing_dip_cm"],
  ]) {
    const result = await pg.query(`INSERT INTO ${table} (${opening}, ${closing}, ${openCm}, ${closeCm})
      VALUES ($1,$2,$3,$4) RETURNING ${opening} AS opening, ${closing} AS closing, ${openCm} AS cm`, [525, 500, 42, 40]);
    expect(result.rows).toEqual([{ opening: 525, closing: 500, cm: 42 }]);
  }
  expect(applyEquipmentDip({ openingDiesel: 123, dieselBalanceInTank: 98 }, null))
    .toEqual({ openingDiesel: 123, dieselBalanceInTank: 98 });
});

it("resolves actual closing dips across sources, with date, permission and edit exclusions", async () => {
  await pg.exec(`
    INSERT INTO equipment_usage (id,equipment_id,closing_dip_cm,diesel_balance_in_tank,date,site_name,plant_name)
      VALUES (100,991,40,500,'2026-11-25','Fixture site','Fixture plant');
    INSERT INTO generator_logs (id,generator_name,closing_dip_cm,closing_diesel,date,plant_name)
      VALUES (100,'Fixture DG',41,512.5,'2026-11-26','Fixture plant');
    INSERT INTO bitumen_heating_sessions (id,dg_mode,dg_generator_name,dg_closing_dip_cm,dg_closing_diesel,date,plant_name)
      VALUES (100,'inline','Fixture DG',42,525,'2026-11-27','Fixture plant');
    INSERT INTO dprs (id,date,site,dpr_status) VALUES (100,'2026-11-28','Fixture site','submitted'),(101,'2026-11-28','Fixture site','draft');
    INSERT INTO equipment_logs (id,equipment_id,dpr_id,closing_dip_cm,diesel_balance_in_tank)
      VALUES (100,991,100,43,537.5),(101,991,101,99,1237.5);
  `);
  const base = { equipmentId: 991, equipmentName: "Fixture DG", beforeDate: "2026-11-28", plant: "Fixture plant", permittedSites: null };
  expect(await lastEquipmentDieselDip(db, base)).toEqual({ cm: 42, litres: 525, date: "2026-11-27" });
  expect(await lastEquipmentDieselDip(db, { ...base, excludeSource: "heating", excludeId: 100 })).toEqual({ cm: 41, litres: 512.5, date: "2026-11-26" });
  expect(await lastEquipmentDieselDip(db, { ...base, plant: undefined, site: "Fixture site", permittedSites: ["Fixture site"] }))
    .toEqual({ cm: 43, litres: 537.5, date: "2026-11-28" });
  expect(await lastEquipmentDieselDip(db, { ...base, plant: undefined, site: "Fixture site", permittedSites: [] })).toBeNull();
});

it("Owner filling check updates only calibration and atomically records old/new values", async () => {
  await pg.exec("INSERT INTO equipment_master (id,name,dip_liters_per_cm,dead_stock_depth_cm,tank_capacity_liters) VALUES (991,'Fixture DG',10,4,600)");
  const reading = { issuedLitres: 100, openingDipCm: 20, closingDipCm: 28 };
  await expect(useEquipmentFillingRate(db, 991, reading, { id: 1, fullName: "Fixture", isOwner: false }))
    .rejects.toMatchObject({ status: 403 });
  expect((await pg.query("SELECT dip_liters_per_cm FROM equipment_master WHERE id=991")).rows).toEqual([{ dip_liters_per_cm: 10 }]);
  const beforeEntries = await pg.query("SELECT * FROM equipment_usage ORDER BY id");
  const result = await db.transaction(tx => useEquipmentFillingRate(tx, 991, reading, { id: 1, fullName: "Fixture Owner", isOwner: true }));
  expect(result).toEqual({ id: 991, dipLitersPerCm: 12.5 });
  expect((await pg.query("SELECT old_values,new_values,user_role FROM audit_logs")).rows)
    .toEqual([{ old_values: { dipLitersPerCm: 10 }, new_values: { dipLitersPerCm: 12.5, fillingCheck: reading }, user_role: "owner" }]);
  expect((await pg.query("SELECT dead_stock_depth_cm,tank_capacity_liters FROM equipment_master WHERE id=991")).rows)
    .toEqual([{ dead_stock_depth_cm: 4, tank_capacity_liters: 600 }]);
  expect(await pg.query("SELECT * FROM equipment_usage ORDER BY id")).toEqual(beforeEntries);
});
