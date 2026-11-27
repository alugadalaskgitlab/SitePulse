import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { is, SQL, eq } from "drizzle-orm";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
let pg: PGlite;
let storage: any;
const actor = { id: 99, name: "Fixture purchaser" };
const purchase = {
  qtyPurchased: 100, supplier: "Fixture pump", billNo: "F-1",
  purchasedAt: "2026-11-27", filledDirectly: true, filledOn: "2026-11-27",
  directFills: [{ itemId: 11, quantity: 60 }, { itemId: 12, quantity: 40 }],
};

beforeAll(async () => {
  pg = new PGlite();
  const dialect = new PgDialect();
  for (const table of [schema.dieselRequirements, schema.dieselRequirementItems, schema.equipmentMaster,
    schema.equipmentUsage, schema.materialReceipts, schema.stockLedger, schema.stockBalances,
    schema.auditLogs, schema.plantMaterials, schema.dprs, schema.equipmentLogs]) {
    const config = getTableConfig(table);
    const columns = config.columns.filter(column => !["filled_directly", "filled_on", "direct_fill_qty", "direct_fill_choices"].includes(column.name)).map(column => {
      let sql = `"${column.name}" ${column.getSQLType()}`;
      if (column.primary) sql += " PRIMARY KEY";
      if (column.notNull) sql += " NOT NULL";
      if (column.default !== undefined) {
        const value = column.default;
        sql += " DEFAULT " + (is(value, SQL) ? dialect.sqlToQuery(value).sql
          : typeof value === "object" ? `'${JSON.stringify(value)}'`
          : typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : String(value));
      }
      return sql;
    });
    await pg.exec(`CREATE TABLE "${config.name}" (${columns.join(", ")})`);
  }
  await pg.exec(readFileSync("migrations/0078_diesel_direct_fill.sql", "utf8"));
  await pg.exec(readFileSync("migrations/0079_diesel_direct_fill_choices.sql", "utf8"));
  holder.db = drizzle(pg, { schema });
  const { DatabaseStorage } = await import("../server/storage");
  storage = new DatabaseStorage();
  vi.spyOn(storage, "resolveCanonicalDieselMaterial").mockResolvedValue({ id: 7, name: "DIESEL", defaultUom: "Liters" });
  vi.spyOn(storage, "getOwnCompanyPartyId").mockResolvedValue(5);
}, 60000);
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  await pg.exec("TRUNCATE diesel_requirements, diesel_requirement_items, equipment_master, equipment_usage, material_receipts, stock_ledger, stock_balances, audit_logs, plant_materials RESTART IDENTITY");
  await holder.db.insert(schema.plantMaterials).values({ id: 7, name: "DIESEL", category: "Fuel", defaultUom: "Liters" });
  await holder.db.insert(schema.dieselRequirements).values({ id: 1, date: "2026-11-27", raisedBy: "Fixture", totalPlanned: 100, status: "approved" });
  await holder.db.insert(schema.dieselRequirementItems).values([
    { id: 11, requirementId: 1, equipmentId: 21, equipmentName: "Vehicle A", plannedQty: 60, approvedQty: 60 },
    { id: 12, requirementId: 1, equipmentId: 22, equipmentName: "Vehicle B", plannedQty: 40, approvedQty: 40 },
  ]);
  await holder.db.insert(schema.equipmentMaster).values([
    { id: 21, name: "Vehicle A", ownership: "owned", equipmentType: "tipper", meterType: "odometer" },
    { id: 22, name: "Vehicle B", ownership: "owned", equipmentType: "tipper", meterType: "odometer" },
  ]);
  await holder.db.insert(schema.stockBalances).values({ materialId: 7, partyId: 5, balance: 500, uom: "Liters" });
});
const ledger = () => holder.db.select().from(schema.stockLedger);
const balance = async () => Number((await holder.db.select().from(schema.stockBalances))[0].balance);

describe("direct purchase vehicle fills, real transactional schema", () => {
  it("migrates without rewriting existing purchases", async () => {
    const row = await storage.getDieselRequirement(1);
    expect(row.filledDirectly).toBe(false);
    expect(row.items.every((item: any) => item.directFillQty === null)).toBe(true);
  });
  it("records 60 + 40 L received and issued, with no stock change and actor audit", async () => {
    const row = await storage.updateDieselPurchase(1, purchase, actor);
    expect(row.filledDirectly).toBe(true);
    expect((await ledger()).map((row: any) => [Number(row.quantityIn), Number(row.quantityOut)])).toEqual([[60, 60], [40, 40]]);
    expect(await balance()).toBe(500);
    const audits = await holder.db.select().from(schema.auditLogs);
    expect(audits[0]).toMatchObject({ userId: 99, userName: actor.name, action: "direct_fill" });
  });
  it("rejects mismatching totals atomically", async () => {
    await expect(storage.updateDieselPurchase(1, { ...purchase, qtyPurchased: 99 }, actor)).rejects.toThrow("add up exactly");
    expect(await ledger()).toEqual([]);
    expect((await storage.getDieselRequirement(1)).status).toBe("approved");
  });
  it("rejects duplicate, unknown and hired vehicles", async () => {
    await expect(storage.updateDieselPurchase(1, { ...purchase, directFills: [{ itemId: 11, quantity: 50 }, { itemId: 11, quantity: 50 }] }, actor)).rejects.toThrow("once");
    await expect(storage.updateDieselPurchase(1, { ...purchase, directFills: [{ itemId: 99, quantity: 100 }] }, actor)).rejects.toThrow("once");
    await holder.db.update(schema.equipmentMaster).set({ ownership: "hired" }).where(eq(schema.equipmentMaster.id, 21));
    await expect(storage.updateDieselPurchase(1, purchase, actor)).rejects.toThrow("own equipment");
  });
  it("adjusts litres and then unticks without touching store stock", async () => {
    await storage.updateDieselPurchase(1, purchase, actor);
    await storage.updateDieselPurchase(1, { ...purchase, directFills: [{ itemId: 11, quantity: 70 }, { itemId: 12, quantity: 30 }] }, actor);
    expect((await ledger()).map((row: any) => Number(row.quantityOut))).toEqual([70, 30]);
    await storage.updateDieselPurchase(1, { filledDirectly: false }, actor);
    expect(await ledger()).toEqual([]);
    expect(await balance()).toBe(500);
  });
  it("cancels only its automatic entries on deleting the purchase", async () => {
    await storage.updateDieselPurchase(1, purchase, actor);
    await storage.deleteDieselRequirement(1);
    expect(await ledger()).toEqual([]);
    expect(await balance()).toBe(500);
  });
  it("keeps ordinary purchases out of stock and out of the automatic ledger", async () => {
    await storage.updateDieselPurchase(1, { qtyPurchased: 100, supplier: "Fixture" }, actor);
    expect(await ledger()).toEqual([]);
    expect(await balance()).toBe(500);
  });
  it("shows direct litres read-only once per vehicle/date without a second issue", async () => {
    await storage.updateDieselPurchase(1, purchase, actor);
    await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 0, openingDiesel: 10, openingReading: 0, closingReading: 5 });
    await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 0, openingDiesel: 0 });
    const rows = await storage.getEquipmentUsage({ equipmentId: 21 });
    expect(rows.reduce((sum: number, row: any) => sum + row.dieselIssued, 0)).toBe(60);
    const first = rows.find((row: any) => row.directFillLitres > 0);
    expect(first).toMatchObject({ usageDieselIssued: 0, dieselIssued: 60, closingDiesel: 70 });
    expect(await ledger()).toHaveLength(2);
    expect(await balance()).toBe(500);
  });
  it.each(["plant_stock", "direct_purchase"])("suggests without modifying an existing %s usage fill", async source => {
    const usage = await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 60, dieselSource: source });
    const oldLedger = await ledger();
    const oldBalance = await balance();
    const row = await storage.updateDieselPurchase(1, purchase, actor);
    const fill = row.directFills.find((fill: any) => fill.itemId === 11);
    expect(fill.conflicts[0]).toMatchObject({ usageId: usage.id, quantity: 60, source });
    expect(fill.conflicts[0].choice).toBeUndefined();
    expect(fill.appliedQuantity).toBe(0);
    expect(await balance()).toBe(oldBalance);
    expect((await ledger()).filter((row: any) => row.referenceId === usage.id)).toEqual(oldLedger);
    expect((await storage.getEquipmentUsageById(usage.id)).usageDieselIssued).toBe(60);
  });
  it.each(["plant_stock", "direct_purchase"])("keep purchase reverses only the actual %s usage ledger", async source => {
    const usage = await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 60, dieselSource: source });
    await storage.updateDieselPurchase(1, purchase, actor);
    const fill = (await storage.getDieselDirectFills(21, "2026-11-27"))[0];
    await storage.resolveDieselDirectFill(1, 11, usage.id, fill.conflicts[0].signature, "keep_purchase", actor);
    const row = await storage.getEquipmentUsageById(usage.id);
    expect(row).toMatchObject({ dieselIssued: 60, usageDieselIssued: 0, directFillLitres: 60 });
    expect((await ledger()).every((row: any) => row.transactionType === "diesel_direct_fill")).toBe(true);
    expect(await balance()).toBe(500);
  });
  it.each(["keep_usage", "different"] as const)("%s keeps usage and gives the intended ledger and stock", async choice => {
    const usage = await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 60, dieselSource: "plant_stock" });
    await storage.updateDieselPurchase(1, purchase, actor);
    const fill = (await storage.getDieselDirectFills(21, "2026-11-27"))[0];
    await storage.resolveDieselDirectFill(1, 11, usage.id, fill.conflicts[0].signature, choice, actor);
    const row = await storage.getEquipmentUsageById(usage.id);
    expect(row.usageDieselIssued).toBe(60);
    expect(row.dieselIssued).toBe(choice === "different" ? 120 : 60);
    expect(await balance()).toBe(440);
    const updated = (await storage.getDieselDirectFills(21, "2026-11-27"))[0];
    expect(updated.conflicts[0].choice).toBe(choice);
    expect(updated.appliedQuantity).toBe(choice === "different" ? 60 : 0);
  });
  it("refuses a stale choice without changing usage or stock", async () => {
    const usage = await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 60, dieselSource: "plant_stock" });
    await storage.updateDieselPurchase(1, purchase, actor);
    const fill = (await storage.getDieselDirectFills(21, "2026-11-27"))[0];
    await storage.updateEquipmentUsage(usage.id, { dieselIssued: 55 });
    await expect(storage.resolveDieselDirectFill(1, 11, usage.id, fill.conflicts[0].signature, "keep_purchase", actor)).rejects.toThrow("changed");
    expect(await balance()).toBe(445);
    expect((await storage.getEquipmentUsageById(usage.id)).usageDieselIssued).toBe(55);
  });
  it("rolls back a usage reversal if its replacement direct-fill ledger fails", async () => {
    const usage = await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 60, dieselSource: "plant_stock" });
    await storage.updateDieselPurchase(1, purchase, actor);
    const fill = (await storage.getDieselDirectFills(21, "2026-11-27"))[0];
    const before = await ledger();
    (storage.resolveCanonicalDieselMaterial as any).mockResolvedValueOnce(undefined);
    await expect(storage.resolveDieselDirectFill(1, 11, usage.id, fill.conflicts[0].signature, "keep_purchase", actor)).rejects.toThrow("Configure");
    expect(await ledger()).toEqual(before);
    expect(await balance()).toBe(440);
    expect((await storage.getEquipmentUsageById(usage.id)).usageDieselIssued).toBe(60);
  });
  it("does not suggest or alter contractor-provided diesel", async () => {
    await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 60, dieselSource: "contractor", dieselIncluded: true });
    const row = await storage.updateDieselPurchase(1, purchase, actor);
    expect(row.directFills.find((fill: any) => fill.itemId === 11).conflicts).toEqual([]);
    expect(await balance()).toBe(500);
  });
  it("includes direct issues in daily and per-vehicle diesel reports exactly once", async () => {
    await storage.updateDieselPurchase(1, purchase, actor);
    await storage.createEquipmentUsage({ date: "2026-11-27", equipmentId: 21, dieselIssued: 0 });
    const daily = await storage.getDieselComparisonReport("2026-11-27", "2026-11-27");
    expect(daily[0].totalActualIssued).toBe(100);
    const sources = await storage.getDieselComparisonEquipmentSources("2026-11-27", "2026-11-27");
    expect(sources.usage.reduce((sum: number, row: any) => sum + Number(row.dieselIssued || 0), 0)).toBe(100);
  });
});
