import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { formatPackedUnitLabel, packedReceiptStockQuantity, tankPositionBalance } from "../shared/packedStock";
import { isMeaningfulStockDifference, isMeaningfullyNegativeStock, stockDifferenceTolerance } from "../shared/stockUnits";
import { dispatchRefetchInterval } from "../shared/dispatchPolling";
import * as schema from "../shared/schema";

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock("../server/db", () => ({ get db() { return holder.db; }, pool: {} }));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn() }));

let pg: PGlite;
let storage: any;

beforeAll(async () => {
  pg = new PGlite();
  for (const table of Object.values(schema).filter(value => is(value, PgTable)) as PgTable[]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${config.name}" (${config.columns.map(column =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`
    ).join(",")})`);
  }
  holder.db = drizzle(pg, { schema });
  storage = new (await import("../server/storage")).DatabaseStorage();
}, 60_000);

afterAll(async () => pg?.close());

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE stock_ledger, stock_balances, plant_stock_decants, truck_dispatches,
      plant_materials, parties, audit_logs, ldo_flow_readings, ldo_dip_readings,
      material_receipts, pending_plant_receipts;
  `);
});

describe("STOCK-02 packed stock conversions", () => {
  it("converts 12 barrels at 156 kg each to 1.872 MT", () => {
    expect(packedReceiptStockQuantity({
      count: 12,
      unitNetWeightKg: 156,
      stockUom: "MT",
    })).toBeCloseTo(1.872, 6);
  });

  it("uses actual net weight instead of the standard pack profile", () => {
    expect(packedReceiptStockQuantity({
      count: 12,
      actualNetWeightKg: 1800,
      unitNetWeightKg: 156,
      stockUom: "MT",
    })).toBe(1.8);
  });

  it("requires a material pack profile when no actual weight is supplied", () => {
    expect(() => packedReceiptStockQuantity({
      count: 1,
      stockUom: "MT",
    })).toThrow("Set the packed-unit net weight or volume in Material Master");
  });

  it("shows plural packed units in supply availability labels", () => {
    expect(formatPackedUnitLabel("Barrel", 10)).toBe("barrels");
    expect(formatPackedUnitLabel("Barrels", 1)).toBe("barrel");
  });

  it("counts only the selected tank for dispatch, never packed barrels", () => {
    expect(tankPositionBalance({
      tankNumber: 1,
      stockUom: "Liters",
      entries: [
        { quantityIn: 1200, quantityOut: 0, uom: "Liters", stockPosition: "tank_1", tankNumber: 1 },
        { quantityIn: 0, quantityOut: 100, uom: "Liters", stockPosition: null, tankNumber: 1 },
        { quantityIn: 5000, quantityOut: 0, uom: "Liters", stockPosition: "packed", tankNumber: null },
      ],
    })).toBe(1100);
    expect(tankPositionBalance({
      tankNumber: 2,
      stockUom: "Liters",
      entries: [
        { quantityIn: 1200, quantityOut: 0, uom: "Liters", stockPosition: "tank_1", tankNumber: 1 },
        { quantityIn: 5000, quantityOut: 0, uom: "Liters", stockPosition: "packed", tankNumber: null },
      ],
    })).toBe(0);
  });

  it("uses material-specific stock tolerances", () => {
    expect(stockDifferenceTolerance("MT")).toBe(0.01);
    expect(stockDifferenceTolerance("L")).toBe(1);
    expect(isMeaningfullyNegativeStock(-0.002, "MT")).toBe(false);
    expect(isMeaningfullyNegativeStock(-0.02, "MT")).toBe(true);
    expect(isMeaningfulStockDifference(0.009, "MT")).toBe(false);
    expect(isMeaningfulStockDifference(1, "Liters")).toBe(true);
  });
});

describe("STOCK-02 dispatch refresh cadence", () => {
  it("polls every 10 seconds while a visible dispatch is waiting", () => {
    expect(dispatchRefetchInterval({
      hasVisibleWaitingDispatch: true,
      lastActionAt: 0,
      now: 100_000,
    })).toBe(10_000);
  });

  it("polls every 10 seconds only for the minute after an edit or retry", () => {
    expect(dispatchRefetchInterval({
      hasVisibleWaitingDispatch: false,
      lastActionAt: 50_000,
      now: 109_999,
    })).toBe(10_000);
    expect(dispatchRefetchInterval({
      hasVisibleWaitingDispatch: false,
      lastActionAt: 50_000,
      now: 110_000,
    })).toBe(false);
  });

  it("does not poll in the idle state", () => {
    expect(dispatchRefetchInterval({
      hasVisibleWaitingDispatch: false,
      lastActionAt: 0,
      now: 100_000,
    })).toBe(false);
  });
});

it("decants packed stock into the selected party tank without changing total stock", async () => {
  await pg.exec(`
    INSERT INTO parties (id, name) VALUES (7, 'Synthetic party');
    INSERT INTO plant_materials (id, name, category, default_uom, packed_unit_name, packed_unit_net_weight_kg)
      VALUES (10, 'Synthetic bitumen', 'Bitumen', 'MT', 'Barrel', 156);
    INSERT INTO stock_balances (id, party_id, material_id, balance, uom)
      VALUES (1, 7, 10, 1.872, 'MT');
    INSERT INTO stock_ledger
      (id, date, party_id, material_id, transaction_type, quantity_in, quantity_out, balance_after, uom, stock_position, packed_count_in)
      VALUES (100, '2026-11-24', 7, 10, 'receipt', 1.872, 0, 1.872, 'MT', 'packed', 12);
  `);

  const result = await storage.decantPackedStock({
    date: "2026-11-24",
    time: "10:30",
    materialId: 10,
    partyId: 7,
    packedCount: 8,
    quantity: 1.248,
    tankNumber: 2,
  }, { userId: 99, name: "Synthetic Owner" });

  expect(result).toEqual({ movedQuantity: 1.248, uom: "MT" });
  const [balance] = (await pg.query("SELECT balance, uom FROM stock_balances WHERE material_id=10 AND party_id=7")).rows as any[];
  expect(Number(balance.balance)).toBeCloseTo(1.872, 6);
  expect(balance.uom).toBe("MT");
  const positions = await storage.getPackedStockPositionSummary();
  expect(positions[0]).toMatchObject({
    partyId: 7,
    tank2Mt: 1.248,
    packedCount: 4,
    packedMt: 0.624,
    totalMt: 1.872,
  });
  expect((await pg.query("SELECT party_id, tank_number, packed_count, stock_quantity FROM plant_stock_decants")).rows)
    .toEqual([{ party_id: 7, tank_number: 2, packed_count: 8, stock_quantity: 1.248 }]);
});

it("decants LDO barrels into a dated tank receipt counted by PLANT-04", async () => {
  await pg.exec(`
    INSERT INTO parties (id, name) VALUES (7, 'Synthetic party');
    INSERT INTO plant_materials (id, name, category, default_uom, bulk_density, packed_unit_name, packed_unit_volume_liters)
      VALUES (12, 'LDO', 'LDO', 'Liters', 0.84, 'Barrel', 200);
    INSERT INTO stock_balances (id, party_id, material_id, balance, uom)
      VALUES (2, 7, 12, 2000, 'Liters');
    INSERT INTO stock_ledger
      (id, date, party_id, material_id, transaction_type, quantity_in, quantity_out, balance_after, uom, stock_position, packed_count_in)
      VALUES (101, '2026-11-24', 7, 12, 'receipt', 2000, 0, 2000, 'Liters', 'packed', 10);
  `);
  const result = await storage.decantPackedStock({
    date: "2026-11-24",
    time: "09:15",
    materialId: 12,
    partyId: 7,
    packedCount: 6,
    quantity: 1200,
    tankNumber: 1,
  }, { userId: 99, name: "Synthetic Owner" });
  expect(result).toEqual({ movedQuantity: 1200, uom: "Liters" });
  const [flow] = (await pg.query(`
    SELECT date, time, tank_number, reading_type, quantity_liters, notes
    FROM ldo_flow_readings WHERE reading_type='receipt'
  `)).rows as any[];
  expect(flow).toMatchObject({
    date: new Date("2026-11-24T00:00:00.000Z"),
    time: "09:15",
    tank_number: 1,
    reading_type: "receipt",
    quantity_liters: 1200,
  });
  expect(flow.notes).toContain("PACKED-STOCK DECANT");
  const daily = await storage.getLdoDailySummary("2026-11-24", "Main Plant");
  expect(daily.ldoReceivedL).toBe(1200);
  const reconciliation = await storage.computeLdoReconciliation({
    dateFrom: "2026-11-24", dateTo: "2026-11-24", plant: "Main Plant",
  });
  expect(reconciliation[0]?.receiptsL).toBe(1200);
  const [balance] = (await pg.query("SELECT balance FROM stock_balances WHERE material_id=12 AND party_id=7")).rows as any[];
  expect(Number(balance.balance)).toBe(2000);
  const [decant] = (await pg.query("SELECT packed_count, stock_quantity, stock_uom, tank_number, time FROM plant_stock_decants WHERE material_id=12")).rows as any[];
  expect(decant).toMatchObject({ packed_count: 6, stock_quantity: 1200, stock_uom: "Liters", tank_number: 1, time: "09:15" });
  const positions = await storage.getPackedStockPositionSummary();
  expect(positions[0]).toMatchObject({ tank1: 1200, packed: 800, packedCount: 4, total: 2000, totalL: 2000 });
});

it("requires a tank for bulk LDO receipts", async () => {
  await pg.exec(`INSERT INTO plant_materials (id, name, category, default_uom) VALUES (13, 'LDO', 'LDO', 'Liters')`);
  await expect(storage.createMaterialReceipt({
    date: "2026-11-24",
    materialId: 13,
    quantity: 2000,
    uom: "Liters",
    partyId: 7,
    isPlantCommon: 0,
  } as any)).rejects.toThrow("Bulk fuel receipts must be assigned to Tank 1 or Tank 2.");
});

it("keeps packed LDO separate when the physical tank correction is posted", async () => {
  await pg.exec(`
    INSERT INTO parties (id, name) VALUES (7, 'Synthetic party');
    INSERT INTO plant_materials (id, name, category, default_uom, bulk_density, packed_unit_name)
      VALUES (14, 'LDO', 'LDO', 'Liters', 0.84, 'Barrel');
    INSERT INTO stock_balances (id, party_id, material_id, balance, uom)
      VALUES (3, 7, 14, 2000, 'Liters');
    INSERT INTO stock_ledger
      (id, date, party_id, material_id, transaction_type, quantity_in, quantity_out, balance_after, uom, stock_position, tank_number, packed_count_in)
      VALUES
        (201, '2026-11-24', 7, 14, 'receipt', 500, 0, 500, 'Liters', 'tank_1', 1, 0),
        (202, '2026-11-24', 7, 14, 'receipt', 700, 0, 1200, 'Liters', 'tank_2', 2, 0),
        (203, '2026-11-24', 7, 14, 'receipt', 800, 0, 2000, 'Liters', 'packed', NULL, 4);
  `);
  const result = await storage.postStockCorrection({
    materialId: 14,
    partyId: 7,
    physicalQty: 2.3,
    tank1L: 600,
    tank2L: 900,
    uom: "Liters",
    date: "2026-11-24",
    notes: "Synthetic correction",
    correctedBy: "Synthetic Owner",
  });
  expect(result).toMatchObject({ previousBalance: 2000, newBalance: 2300, adjustment: 300, uom: "Liters" });
  const [balance] = (await pg.query("SELECT balance FROM stock_balances WHERE material_id=14 AND party_id=7")).rows as any[];
  expect(Number(balance.balance)).toBe(2300);
  const position = (await storage.getPackedStockPositionSummary())[0];
  expect(position).toMatchObject({ tank1: 600, tank2: 900, packed: 800, packedCount: 4, total: 2300 });
});

it("requires non-packed LDO stock for a store-to-tank issue", async () => {
  await pg.exec(`
    INSERT INTO parties (id, name) VALUES (8, 'Synthetic issue party');
    INSERT INTO plant_materials (id, name, category, default_uom, packed_unit_name, packed_unit_volume_liters)
      VALUES (15, 'LDO', 'LDO', 'Liters', 'Barrel', 200);
    INSERT INTO stock_balances (id, party_id, material_id, balance, uom)
      VALUES (4, 8, 15, 800, 'Liters');
    INSERT INTO stock_ledger
      (id, date, party_id, material_id, transaction_type, quantity_in, quantity_out, balance_after, uom, stock_position, packed_count_in)
      VALUES (301, '2026-11-24', 8, 15, 'receipt', 800, 0, 800, 'Liters', 'packed', 4);
  `);
  const issue = {
    date: "2026-11-24",
    partyId: 8,
    isPlantCommon: 0,
    materialId: 15,
    quantity: 1200,
    uom: "Liters",
    issuedTo: "Boiler",
    ldoTankNumber: 1,
  };
  await expect(storage.createMaterialIssue(issue as any)).rejects.toThrow(
    "Packed stock can enter a tank only through Decant.",
  );
  await pg.exec(`
    INSERT INTO stock_ledger
      (id, date, party_id, material_id, transaction_type, quantity_in, quantity_out, balance_after, uom)
      VALUES (302, '2026-11-24', 8, 15, 'receipt', 1200, 0, 2000, 'Liters');
    UPDATE stock_balances SET balance=2000 WHERE material_id=15 AND party_id=8;
  `);
  await storage.createMaterialIssue(issue as any);
  const positions = await storage.getPackedStockPositionSummary();
  expect(positions[0]).toMatchObject({ tank1: 1200, packed: 800, packedCount: 4, total: 2000 });
});

it("saves packed count and lets actual total net weight override the standard barrel weight", async () => {
  await pg.exec(`
    INSERT INTO parties (id, name) VALUES (7, 'Synthetic party');
    INSERT INTO plant_materials (id, name, category, default_uom, packed_unit_name, packed_unit_net_weight_kg)
      VALUES (10, 'Synthetic bitumen', 'Bitumen', 'MT', 'Barrel', 156);
  `);
  const receipt = await storage.createMaterialReceipt({
    date: "2026-11-24",
    partyId: 7,
    isPlantCommon: 0,
    materialId: 10,
    quantity: 12,
    uom: "Barrel",
    packedCount: 12,
    packedUnitName: "Barrel",
    actualNetWeightKg: 1800,
    receiptNo: "SYNTHETIC-RECEIPT-01",
    receivedByName: "Synthetic",
    plantName: "Main Plant",
  });
  expect(receipt).toMatchObject({
    quantity: 12,
    uom: "Barrel",
    packedCount: 12,
    packedUnitName: "Barrel",
    actualNetWeightKg: 1800,
    packedStockQuantity: 1.8,
  });
  const [balance] = (await pg.query("SELECT balance, uom FROM stock_balances WHERE material_id=10 AND party_id=7")).rows as any[];
  expect(Number(balance.balance)).toBeCloseTo(1.8, 6);
  expect(balance.uom).toBe("MT");
});

it("restores stored stock when a dispatch and its ledger rows are removed", async () => {
  await pg.exec(`
    INSERT INTO parties (id, name) VALUES (7, 'Synthetic party');
    INSERT INTO plant_materials (id, name, category, default_uom) VALUES (11, 'Synthetic dust', 'Aggregate', 'MT');
    INSERT INTO stock_balances (id, party_id, material_id, balance, uom)
      VALUES (1, 7, 11, -1.5, 'MT');
    INSERT INTO truck_dispatches (id, date, party_id, mix_template_id, truck_number, load_weight)
      VALUES (15, '2026-11-24', 7, 1, 'TEST-TRUCK', 1);
    INSERT INTO stock_ledger
      (id, date, party_id, material_id, transaction_type, reference_id, quantity_in, quantity_out, balance_after, uom)
      VALUES (1, '2026-11-24', 7, 11, 'dispatch', 15, 0, 1.5, -1.5, 'MT');
  `);

  expect(await storage.deleteTruckDispatch(15)).toBe(true);
  const [balance] = (await pg.query("SELECT balance FROM stock_balances WHERE material_id=11 AND party_id=7")).rows as any[];
  expect(Number(balance.balance)).toBe(0);
  expect((await pg.query("SELECT id FROM stock_ledger WHERE transaction_type='dispatch' AND reference_id=15")).rows).toEqual([]);
  expect((await pg.query("SELECT id FROM truck_dispatches WHERE id=15")).rows).toEqual([]);
  expect(await storage.getStockBalanceLedgerDiscrepancies()).toMatchObject({ rows: [], errors: [] });
});
