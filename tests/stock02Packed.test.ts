import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { formatPackedUnitLabel, packedReceiptStockQuantity, tankPositionBalance } from "../shared/packedStock";
import { isMeaningfulStockDifference, isMeaningfullyNegativeStock, stockDifferenceTolerance } from "../shared/stockUnits";
import { dispatchRefetchInterval } from "../shared/dispatchPolling";
import * as schema from "../shared/schema";
import { buildPlantNormActualReport } from "../server/plantNormActual";

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

describe("TANK-01 confirmed attachment deletion", () => {
  const actor = { userId: 9, userName: "Fixture Owner", userRole: "owner" };
  async function file(shared = false, legacy = false) {
    await pg.exec("TRUNCATE attachments, attachment_links");
    await pg.exec(`INSERT INTO attachments(id,module_type,linked_record_id,file_name,object_path)
      VALUES (99,'diesel_purchase',501,'wrong-file.pdf','/objects/fixture.pdf')`);
    if (shared) await pg.exec("INSERT INTO attachment_links(id,attachment_id,target_module_type,target_linked_record_id) VALUES (1,99,'material_receipt',202)");
    if (shared || legacy) await pg.exec(`INSERT INTO material_receipts(id,linked_diesel_requirement_id,receipt_no)
      VALUES (202,501,'RECV/DSL/26-27/0066')`);
  }
  it("deletes an unshared file and audits actor, timestamp, name and source", async () => {
    await file(); expect(await storage.deleteAttachment(99, { actor })).toBe(true);
    expect((await pg.query("SELECT * FROM attachments")).rows).toHaveLength(0);
    const audit = (await pg.query("SELECT * FROM audit_logs WHERE module='attachments'")).rows[0] as any;
    expect(audit.user_id).toBe(9); expect(audit.created_at).toBeTruthy();
    expect(audit.old_values).toMatchObject({ fileName: "wrong-file.pdf", moduleType: "diesel_purchase", linkedRecordId: 501, otherPlaces: [] });
  });
  it("returns the numbered shared receipt, then removes the file and every link atomically", async () => {
    await file(true);
    await expect(storage.deleteAttachment(99, { actor })).rejects.toMatchObject({
      places: [{ moduleType: "material_receipt", linkedRecordId: 202, label: "Receipt RECV/DSL/26-27/0066" }],
    });
    expect((await pg.query("SELECT * FROM attachments")).rows).toHaveLength(1);
    expect((await pg.query("SELECT * FROM audit_logs")).rows).toHaveLength(0);
    await storage.deleteAttachment(99, { actor, confirmShared: true });
    expect((await pg.query("SELECT * FROM attachments")).rows).toHaveLength(0);
    expect((await pg.query("SELECT * FROM attachment_links")).rows).toHaveLength(0);
    expect((await pg.query("SELECT * FROM material_receipts")).rows).toHaveLength(1);
    const audit = (await pg.query("SELECT old_values FROM audit_logs")).rows[0] as any;
    expect(audit.old_values.otherPlaces).toHaveLength(1);
  });
  it("also confirms legacy diesel receipt references with no junction row", async () => {
    await file(false, true);
    await expect(storage.deleteAttachment(99, { actor })).rejects.toMatchObject({ places: [expect.objectContaining({ linkedRecordId: 202 })] });
    expect(await storage.deleteAttachment(99, { actor, confirmShared: true })).toBe(true);
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

describe("FIX-BIT-01 Owner tank assignments", () => {
  async function seed(name = "LDO", amount = 6988.401, uom = "Liters", partyId: number | null = 7) {
    await pg.query("INSERT INTO plant_materials (id,name,category,default_uom) VALUES (41,$1,$1,$2)", [name, uom]);
    await pg.exec("INSERT INTO parties (id,name) VALUES (7,'Fixture party')");
    await pg.query("INSERT INTO stock_balances (material_id,party_id,balance,uom) VALUES (41,$1,0,$2)", [partyId, uom]);
    await pg.query(`INSERT INTO stock_ledger (date,party_id,material_id,transaction_type,quantity_in,quantity_out,uom,tank_number,stock_position)
      VALUES ('2026-11-01',$1,41,'opening',$2,0,$3,NULL,NULL),
             ('2026-11-27',$1,41,'issue',0,$2,$3,1,'tank_1')`, [partyId, amount, uom]);
  }
  const input = (extra = {}) => ({ date: "2026-11-27", partyId: 7, materialId: 41, amount: 6988.401, uom: "Liters", tankNumber: 1, ...extra });
  const actor = { userId: 9, name: "Fixture Owner" };
  async function fixedTables() {
    const names = ["stock_balances", "material_receipts", "truck_dispatches", "bitumen_dip_readings", "ldo_dip_readings", "ldo_flow_readings"];
    return Promise.all(names.map(async table => ({ table, rows: (await pg.query(`SELECT * FROM ${table} ORDER BY id`)).rows })));
  }
  it("moves 6,988.401 L to Tank 1 atomically without changing totals or physical records", async () => {
    await seed();
    await pg.exec(`INSERT INTO ldo_flow_readings (date,time,tank_number,meter_reading,reading_type,quantity_liters,plant_name)
      VALUES ('2026-11-27','07:00',1,0,'stock',5000,'Main Plant'),
             ('2026-11-27','08:00',1,100,'opening',NULL,'Main Plant'),
             ('2026-11-27','12:00',1,0,'receipt',700,'Main Plant'),
             ('2026-11-27','17:00',1,200,'closing',NULL,'Main Plant')`);
    const tables = await fixedTables();
    const statement = await storage.getPartyStatement(7, 41);
    const summary = await storage.getLdoDailySummary("2026-11-27", "Main Plant");
    const reconciliation = await storage.computeLdoReconciliation({ dateFrom: "2026-11-27", dateTo: "2026-11-27", plant: "Main Plant" });
    const normReport = await buildPlantNormActualReport(storage, { from: "2026-11-27", to: "2026-11-27", plantName: "Main Plant" });
    const asOf = await storage.getStockBalanceAsOf("2026-11-28", { materialId: 41 });
    const result = await storage.assignUnassignedStockToTank(input(), actor);
    expect(result.before).toEqual({ tank1: -6988.401, tank2: 0, unassigned: 6988.401, total: 0 });
    expect(result.after).toEqual({ tank1: 0, tank2: 0, unassigned: 0, total: 0 });
    expect((await storage.getPackedStockPositionSummary())[0]).toMatchObject(result.after);
    expect(await fixedTables()).toEqual(tables);
    expect(await storage.getPartyStatement(7, 41)).toEqual(statement);
    expect(await storage.getLdoDailySummary("2026-11-27", "Main Plant")).toEqual(summary);
    expect(await storage.computeLdoReconciliation({ dateFrom: "2026-11-27", dateTo: "2026-11-27", plant: "Main Plant" })).toEqual(reconciliation);
    expect((await buildPlantNormActualReport(storage, { from: "2026-11-27", to: "2026-11-27", plantName: "Main Plant" })).totals).toEqual(normReport.totals);
    const afterAsOf = (await storage.getStockBalanceAsOf("2026-11-28", { materialId: 41 }))[0];
    expect(Number(afterAsOf.totalIn)).toBe(Number(asOf[0].totalIn));
    expect(Number(afterAsOf.totalOut)).toBe(Number(asOf[0].totalOut));
    const entries = (await pg.query("SELECT * FROM stock_ledger WHERE transaction_type='tank_assignment' ORDER BY id")).rows as any[];
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ tank_number: null, stock_position: null, notes: "Old unassigned stock moved to Tank 1" });
    expect(Number(entries[0].quantity_out)).toBe(6988.401);
    expect(entries[1]).toMatchObject({ tank_number: 1, stock_position: "tank_1", notes: "Old unassigned stock moved to Tank 1" });
    expect(Number(entries[1].quantity_in)).toBe(6988.401);
    const audit = (await pg.query("SELECT * FROM audit_logs WHERE action='tank_assignment'")).rows[0] as any;
    expect(audit).toMatchObject({ user_id: 9, user_name: "Fixture Owner", user_role: "owner" });
    expect(audit.old_values).toMatchObject(result.before);
    expect(audit.new_values).toMatchObject(result.after);
  });
  it("supports Tank 2 and a plant-common party", async () => {
    await seed("LDO", 6988.401, "Liters", null);
    const result = await storage.assignUnassignedStockToTank(input({ tankNumber: 2, partyId: null }), actor);
    expect(result.after).toEqual({ tank1: -6988.401, tank2: 6988.401, unassigned: 0, total: 0 });
  });
  it("works for bitumen in MT", async () => {
    await seed("BITUMEN VG-30", 6.988401, "MT");
    const result = await storage.assignUnassignedStockToTank(input({ amount: 6.988401, uom: "MT" }), actor);
    expect(result.after).toEqual({ tank1: 0, tank2: 0, unassigned: 0, total: 0 });
    expect((await storage.getPackedStockPositionSummary())[0]).toMatchObject({ tank1Mt: 0, totalMt: 0, unassigned: 0 });
  });
  it("refuses stale amounts and repeated confirmation without adding entries or audit rows", async () => {
    await seed();
    await expect(storage.assignUnassignedStockToTank(input({ amount: 6000 }), actor)).rejects.toThrow("Unassigned stock changed since preview");
    expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(2);
    await storage.assignUnassignedStockToTank(input(), actor);
    await expect(storage.assignUnassignedStockToTank(input(), actor)).rejects.toThrow("Unassigned stock changed since preview");
    expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(4);
    expect((await pg.query("SELECT * FROM audit_logs")).rows).toHaveLength(1);
  });
  it.each([{ tankNumber: 3 }, { amount: 0 }, { amount: Infinity }, { uom: "MT" }, { partyId: 99 }])("refuses invalid input without a move: %s", async extra => {
    await seed();
    await expect(storage.assignUnassignedStockToTank(input(extra), actor)).rejects.toThrow();
    expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(2);
  });
  it("does not allow emulsion", async () => {
    await seed("BITUMEN EMULSION");
    await expect(storage.assignUnassignedStockToTank(input(), actor)).rejects.toThrow("Only LDO or bitumen");
  });
  it("rolls back both ledger rows if the audit cannot be written", async () => {
    await seed();
    await pg.exec("ALTER TABLE audit_logs ADD CONSTRAINT fixture_reject_assignment CHECK (action <> 'tank_assignment')");
    try {
      await expect(storage.assignUnassignedStockToTank(input(), actor)).rejects.toThrow();
      expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(2);
      expect((await storage.getPackedStockPositionSummary())[0]).toMatchObject({ tank1: -6988.401, unassigned: 6988.401, total: 0 });
    } finally {
      await pg.exec("ALTER TABLE audit_logs DROP CONSTRAINT fixture_reject_assignment");
    }
  });
});

it("TANK-02 persists four normal opening dip readings without posting stock", async () => {
  const physicalBefore = (await pg.query("SELECT * FROM stock_balances ORDER BY id")).rows;
  for (const tankNumber of [1, 2]) {
    const common = { date: "2026-11-28", time: "08:00", tankNumber, depthCm: 100, volumeLiters: 1000, readingType: "opening", plantName: "Fixture plant", notes: "Opening dip confirmed at plant log start" };
    await storage.createBitumenDipReading({ ...common, weightKg: 1030 });
    await storage.createLdoDipReading({ ...common, weightKg: 840 });
  }
  expect((await storage.getBitumenDipReadings({ plantName: "Fixture plant", dateFrom: "2026-11-28", dateTo: "2026-11-28" })).map((row: any) => row.readingType)).toEqual(["opening", "opening"]);
  expect((await storage.getLdoDipReadings({ plant: "Fixture plant", dateFrom: "2026-11-28", dateTo: "2026-11-28" })).map((row: any) => row.readingType)).toEqual(["opening", "opening"]);
  expect((await pg.query("SELECT * FROM stock_balances ORDER BY id")).rows).toEqual(physicalBefore);
  expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(0);
});

describe("DIESEL-02 store receipts (real PGlite transactions)", () => {
  it.each(["DIESEL", "HSD"])("receives %s in Liters without a tank or packed stock", async name => {
    await pg.exec(`INSERT INTO plant_materials (id, name, category, default_uom) VALUES (41, '${name}', 'Diesel', 'Liters')`);
    const receipt = await storage.createMaterialReceipt({
      date: "2026-11-27", materialId: 41, quantity: 100, uom: "Liters",
      receiptNo: "DSL-STORE-FIXTURE", partyId: 7, isPlantCommon: 0,
    });
    expect(receipt.tankNumber).toBeNull();
    const [ledger] = (await pg.query("SELECT quantity_in, tank_number, stock_position FROM stock_ledger WHERE reference_id=$1", [receipt.id])).rows as any[];
    expect(Number(ledger.quantity_in)).toBe(100);
    expect(ledger.tank_number).toBeNull();
    expect(ledger.stock_position).toBeNull();
    expect((await pg.query("SELECT * FROM ldo_flow_readings")).rows).toHaveLength(0);
    const corrected = await storage.updateMaterialReceipt(receipt.id, { supplier: "Fixture correction" });
    expect(corrected.tankNumber).toBeNull();
  });

  it("saves a linked diesel purchase receipt without a tank and preserves its purchase link", async () => {
    await pg.exec(`
      INSERT INTO plant_materials (id, name, category, default_uom) VALUES (41, 'DIESEL', 'Diesel', 'Liters');
      INSERT INTO diesel_requirements (id, date, raised_by, total_planned, status, qty_purchased, filled_directly)
        VALUES (9095, '2026-11-27', 'Fixture', 200, 'purchased', 200, false);
    `);
    try {
      const receipt = await storage.createMaterialReceipt({
        date: "2026-11-27", materialId: 41, quantity: 100, uom: "Liters",
        receiptNo: "DSL-LINKED-FIXTURE", partyId: 7, isPlantCommon: 0, linkedDieselRequirementId: 9095,
      });
      expect(receipt.tankNumber).toBeNull();
      expect(receipt.linkedDieselRequirementId).toBe(9095);
      const [balance] = (await pg.query("SELECT balance FROM stock_balances WHERE material_id=41 AND party_id=7")).rows as any[];
      expect(Number(balance.balance)).toBe(100);
    } finally {
      await pg.exec("DELETE FROM diesel_requirements WHERE id=9095");
    }
  });

  it("ignores a tank supplied on a new diesel receipt", async () => {
    await pg.exec(`INSERT INTO plant_materials (id, name, category, default_uom) VALUES (41, 'DIESEL', 'Diesel', 'Liters')`);
    const receipt = await storage.createMaterialReceipt({
      date: "2026-11-27", materialId: 41, quantity: 100, uom: "Liters", tankNumber: 1,
      receiptNo: "DSL-NO-TANK-FIXTURE", partyId: 7, isPlantCommon: 0,
    });
    expect(receipt.tankNumber).toBeNull();
    expect((await pg.query("SELECT * FROM ldo_flow_readings")).rows).toHaveLength(0);
  });

  it("does not convert a diesel receipt into packed stock", async () => {
    await pg.exec(`INSERT INTO plant_materials (id, name, category, default_uom, packed_unit_name, packed_unit_volume_liters) VALUES (41, 'DIESEL', 'Diesel', 'Liters', 'Barrel', 200)`);
    await expect(storage.createMaterialReceipt({
      date: "2026-11-27", materialId: 41, quantity: 2, uom: "Barrel",
      packedCount: 2, packedUnitName: "Barrel", receiptNo: "DSL-PACKED-FIXTURE", partyId: 7, isPlantCommon: 0,
    })).rejects.toThrow("Diesel/HSD receipts must be received in Liters into store stock.");
  });

  it.each(["BITUMEN", "EMULSION", "LDO"])("still requires a tank for bulk %s", async name => {
    await pg.exec(`INSERT INTO plant_materials (id, name, category, default_uom) VALUES (41, '${name}', '${name}', 'Liters')`);
    await expect(storage.createMaterialReceipt({
      date: "2026-11-27", materialId: 41, quantity: 100, uom: "Liters",
      receiptNo: "BULK-FIXTURE", partyId: 7, isPlantCommon: 0,
    })).rejects.toThrow("Bulk fuel receipts must be assigned to Tank 1 or Tank 2.");
  });
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

describe("TANK-01 reviewed tank corrections", () => {
  const actor = { userId: 9, name: "Fixture Owner" };
  async function seed(name: string, values: number[], packed = 0, count = 0) {
    const uom = name === "LDO" ? "Liters" : "MT";
    await pg.query("INSERT INTO plant_materials(id,name,category,default_uom) VALUES (41,$1,$1,$2)", [name, uom]);
    await pg.exec("INSERT INTO parties(id,name) VALUES (7,'Fixture party')");
    const amounts = [...values, packed];
    await pg.query("INSERT INTO stock_balances(material_id,party_id,balance,uom) VALUES (41,7,$1,$2)", [amounts.reduce((a,b) => a+b,0), uom]);
    for (let index = 0; index < 4; index++) {
      await pg.query(`INSERT INTO stock_ledger(date,material_id,party_id,transaction_type,quantity_in,quantity_out,uom,tank_number,stock_position,packed_count_in)
        VALUES ('2026-11-27',41,7,'opening',$1,$2,$3,$4,$5,$6)`,
        [Math.max(amounts[index],0),Math.max(-amounts[index],0),uom,index < 2 ? index+1 : null,index < 2 ? `tank_${index+1}` : index === 3 ? "packed" : null,index === 3 ? count : 0]);
    }
    return (await storage.getPackedStockPositionSummary())[0];
  }
  function input(row: any, tank1: number, tank2: number) {
    return { date: "2026-11-27", materialId: 41, partyId: 7, uom: row.stockUom, actualTank1: tank1, actualTank2: tank2,
      preview: Object.fromEntries(["tank1","tank2","packed","packedCount","unassigned","total"].map(key => [key,row[key]])) };
  }
  it.each([
    ["BITUMEN VG-30",16.590,-9.410,1.435,0,8.615],
    ["BITUMEN VG-30",-11.245,12.680,-1.435,0,0],
    ["LDO",-6988.401,0,6988.401,0,0],
  ])("corrects %s (%s, %s, %s) while preserving totals and reports", async (name,t1,t2,unassigned,actual1,actual2) => {
    const before = await seed(String(name), [Number(t1),Number(t2),Number(unassigned)]);
    if (name === "LDO") await pg.exec(`INSERT INTO ldo_flow_readings(date,time,tank_number,meter_reading,reading_type,quantity_liters,plant_name)
      VALUES ('2026-11-27','07:00',1,0,'stock',5000,'Main Plant'),('2026-11-27','08:00',1,100,'opening',NULL,'Main Plant'),
      ('2026-11-27','12:00',1,0,'receipt',700,'Main Plant'),('2026-11-27','17:00',1,200,'closing',NULL,'Main Plant')`);
    const balances = (await pg.query("SELECT * FROM stock_balances")).rows;
    const statement = await storage.getPartyStatement(7,41);
    const norm = await buildPlantNormActualReport(storage,{ from:"2026-11-27",to:"2026-11-27",plantName:"Main Plant" });
    const asOf = await storage.getStockBalanceAsOf("2026-11-28",{ materialId:41 });
    const daily = await storage.getLdoDailySummary("2026-11-27","Main Plant");
    const reconciliation = await storage.computeLdoReconciliation({ dateFrom:"2026-11-27",dateTo:"2026-11-27",plant:"Main Plant" });
    await storage.assignUnassignedStockToTank(input(before,Number(actual1),Number(actual2)),actor);
    const after = (await storage.getPackedStockPositionSummary())[0];
    expect(after).toMatchObject({ tank1:actual1,tank2:actual2,unassigned:0,total:before.total,packed:0 });
    expect((await pg.query("SELECT * FROM stock_balances")).rows).toEqual(balances);
    expect(await storage.getPartyStatement(7,41)).toEqual(statement);
    expect(await buildPlantNormActualReport(storage,{ from:"2026-11-27",to:"2026-11-27",plantName:"Main Plant" })).toEqual(norm);
    const nextAsOf = await storage.getStockBalanceAsOf("2026-11-28",{ materialId:41 });
    const totals = (rows: any[]) => rows.map(({ materialId,partyId,totalIn,totalOut }) => ({ materialId,partyId,totalIn,totalOut }));
    expect(totals(nextAsOf)).toEqual(totals(asOf));
    expect(Number(nextAsOf[0].t1TotalIn)-Number(nextAsOf[0].t1TotalOut)).toBeCloseTo(Number(actual1),6);
    expect(Number(nextAsOf[0].t2TotalIn)-Number(nextAsOf[0].t2TotalOut)).toBeCloseTo(Number(actual2),6);
    expect(await storage.getLdoDailySummary("2026-11-27","Main Plant")).toEqual(daily);
    expect(await storage.computeLdoReconciliation({ dateFrom:"2026-11-27",dateTo:"2026-11-27",plant:"Main Plant" })).toEqual(reconciliation);
    expect((await pg.query("SELECT * FROM audit_logs WHERE action='tank_assignment'")).rows).toHaveLength(1);
  });
  it("keeps barrels unchanged and blocks a mismatched total", async () => {
    const before = await seed("BITUMEN VG-30",[1,-0.5,0.5],0.2,2);
    await expect(storage.assignUnassignedStockToTank(input(before,0,0.525),actor)).rejects.toThrow("must equal total");
    expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(4);
    await storage.assignUnassignedStockToTank(input(before,0,1),actor);
    expect((await storage.getPackedStockPositionSummary())[0]).toMatchObject({ tank1:0,tank2:1,packed:0.2,packedCount:2,total:1.2,unassigned:0 });
  });
  it.each(["tank1","tank2","packed","packedCount","unassigned","total"])("refuses the whole correction when preview %s is stale", async key => {
    const row = await seed("LDO",[-100,0,100]); const body = input(row,0,0); body.preview[key] += 1;
    await expect(storage.assignUnassignedStockToTank(body,actor)).rejects.toMatchObject({ code:"STALE_TANK_ASSIGNMENT" });
    expect((await pg.query("SELECT * FROM stock_ledger")).rows).toHaveLength(4);
    expect((await pg.query("SELECT * FROM audit_logs")).rows).toHaveLength(0);
  });
});
