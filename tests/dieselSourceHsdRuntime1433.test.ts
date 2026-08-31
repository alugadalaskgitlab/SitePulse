import { beforeEach, describe, expect, it, vi } from "vitest";

const state: any = { selects: [], inserts: [], updates: [], deletes: [], transactions: 0 };

function chain(result: any = []) {
  const q: any = {
    from: () => q, where: () => q, limit: () => q, orderBy: () => q,
    innerJoin: () => q, leftJoin: () => q, for: () => q,
    values: (value: any) => { state.inserts.push(value); return q; },
    set: (value: any) => { state.updates.push(value); return q; },
    returning: () => Promise.resolve(result),
    then: (resolve: any) => resolve(result),
  };
  return q;
}

const tx: any = {
  select: vi.fn(() => chain(state.selects.shift() ?? [])),
  insert: vi.fn(() => chain([{ id: 501 }])),
  update: vi.fn(() => chain([{ id: 501 }])),
  delete: vi.fn(() => {
    state.deletes.push(true);
    return chain([]);
  }),
  execute: vi.fn(async () => ({ rows: [] })),
};
const fakeDb: any = {
  transaction: vi.fn(async (fn: any) => {
    state.transactions++;
    return fn(tx);
  }),
};

vi.mock("../server/db", () => ({ db: fakeDb }));

let DatabaseStorage: any;
let InvalidDieselSourceError: any;

beforeEach(async () => {
  ({ DatabaseStorage, InvalidDieselSourceError } = await import("../server/storage"));
  state.selects = [];
  state.inserts = [];
  state.updates = [];
  state.deletes = [];
  state.transactions = 0;
  vi.clearAllMocks();
});

describe("Task #1433 runtime diesel source boundary", () => {
  it.each([undefined, null, "", "unknown"])("rejects create source %j before transaction", async (dieselSource) => {
    const storage = new DatabaseStorage();
    await expect((storage as any)._createEquipmentUsageTxn({
      equipmentId: 1, date: "2026-08-31", dieselIssued: 5, dieselSource,
    })).rejects.toBeInstanceOf(InvalidDieselSourceError);
    expect(state.transactions).toBe(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects an effective missing update source before record or ledger mutation", async () => {
    const storage = new DatabaseStorage();
    state.selects.push(
      [{ id: 7, equipmentId: 1, entryType: "time_meter", dieselIssued: 5, dieselSource: null }],
      [],
      [{ id: 1, meterType: "hour_meter", consumptionNorm: 1 }],
    );
    await expect((storage as any)._updateEquipmentUsageTxn(7, { dieselIssued: 6 }))
      .rejects.toBeInstanceOf(InvalidDieselSourceError);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("creates an HSD-only plant-stock usage deduction and equipment_usage ledger row", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
      return { id: 1, oldBalance: 30, newBalance: 30 + delta };
    });
    state.selects.push(
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [{ id: 88, name: "HSD", defaultUom: "Liters", isActive: 1 }],
      [{ id: 1, name: "HLC" }],
    );
    await (storage as any)._createEquipmentUsageTxn({
      equipmentId: 1, date: "2026-08-31", dieselIssued: 5,
      dieselSource: "plant_stock", openingReading: 0, closingReading: 1,
    });
    expect(adjustments).toContainEqual({ materialId: 88, partyId: 1, delta: -5 });
    expect(state.inserts.some((row: any) =>
      row.materialId === 88 && row.transactionType === "equipment_usage" && row.quantityOut === 5
    )).toBe(true);
  });

  it("delete restores a matched HSD deduction to its non-HLC party", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
    });
    state.selects.push(
      [{ id: 7, dieselIssued: 5, dieselIncluded: false, dieselSource: "plant_stock" }],
      [],
      [{ id: 99, materialId: 88, partyId: 77, quantityOut: 5 }],
      [{ id: 88, name: "HSD", defaultUom: "Liters" }],
    );
    await expect(storage.deleteEquipmentUsage(7)).resolves.toBe(true);
    expect(adjustments).toEqual([{ materialId: 88, partyId: 77, delta: 5 }]);
  });

  it("delete preserves a matched deduction's null party bucket", async () => {
    const storage = new DatabaseStorage();
    (storage as any)._adjustStockBalance = vi.fn();
    state.selects.push(
      [{ id: 8, dieselIssued: 4, dieselSource: "plant_stock" }],
      [],
      [{ id: 100, materialId: 88, partyId: null, quantityOut: 4, uom: "L" }],
      [{ id: 88, name: "HSD", defaultUom: null }],
    );
    await expect(storage.deleteEquipmentUsage(8)).resolves.toBe(true);
    expect((storage as any)._adjustStockBalance).toHaveBeenCalledWith(tx, 88, null, 4, "L");
  });

  it("delete restores a real deduction even when the positive legacy row has no source", async () => {
    const storage = new DatabaseStorage();
    (storage as any)._adjustStockBalance = vi.fn();
    state.selects.push(
      [{ id: 9, dieselIssued: 6, dieselSource: null }],
      [],
      [{ id: 101, materialId: 88, partyId: 25, quantityOut: 6 }],
      [{ id: 88, name: "HSD", defaultUom: "Liters" }],
    );
    await expect(storage.deleteEquipmentUsage(9)).resolves.toBe(true);
    expect((storage as any)._adjustStockBalance).toHaveBeenCalledWith(tx, 88, 25, 6, "Liters");
  });

  it("delete makes no phantom restoration for a positive missing-source row without a deduction", async () => {
    const storage = new DatabaseStorage();
    (storage as any)._adjustStockBalance = vi.fn();
    state.selects.push(
      [{ id: 10, dieselIssued: 6, dieselSource: null }],
      [],
      [],
    );
    await expect(storage.deleteEquipmentUsage(10)).resolves.toBe(true);
    expect((storage as any)._adjustStockBalance).not.toHaveBeenCalled();
  });

  it("updates HSD plant-stock quantity by only the net delta and rewrites its ledger", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
      return { id: 1, oldBalance: 40, newBalance: 40 + delta };
    });
    state.selects.push(
      [{ id: 7, equipmentId: 1, date: "2026-08-31", entryType: "time_meter", dieselIssued: 5, dieselIncluded: false, dieselSource: "plant_stock" }],
      [],
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [{ id: 90, transactionType: "equipment_usage", materialId: 88, partyId: 1, quantityOut: 5, uom: "Liters" }],
      [{ id: 88, name: "HSD", defaultUom: "Liters", isActive: 1 }],
      [{ id: 1, name: "HLC" }],
    );
    await (storage as any)._updateEquipmentUsageTxn(7, { dieselIssued: 8 });
    expect(adjustments).toContainEqual({ materialId: 88, partyId: 1, delta: -3 });
    expect(adjustments.some((entry) => entry.materialId === 12)).toBe(false);
    expect(state.inserts.some((row: any) =>
      row.materialId === 88 && row.transactionType === "equipment_usage" && row.quantityOut === 8
    )).toBe(true);
  });

  it("updates HSD from plant stock to direct purchase by restoring the old stock deduction", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
      return { id: 1, oldBalance: 35, newBalance: 35 + delta };
    });
    state.selects.push(
      [{ id: 7, equipmentId: 1, date: "2026-08-31", entryType: "time_meter", dieselIssued: 5, dieselIncluded: false, dieselSource: "plant_stock" }],
      [],
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [{ id: 90, transactionType: "equipment_usage", materialId: 88, partyId: 1, quantityOut: 5, uom: "Liters" }],
      [{ id: 88, name: "HSD", defaultUom: "Liters", isActive: 1 }],
      [{ id: 12, name: "DIESEL", defaultUom: "Liters", isActive: 1 }],
      [{ id: 1, name: "HLC" }],
    );
    await (storage as any)._updateEquipmentUsageTxn(7, { dieselSource: "direct_purchase" });
    expect(adjustments).toContainEqual({ materialId: 88, partyId: 1, delta: 5 });
    expect(adjustments.some((entry) => entry.materialId === 12)).toBe(false);
    expect(state.inserts.some((row: any) =>
      row.materialId === 12 && row.transactionType === "direct_purchase" &&
      row.quantityIn === 5 && row.quantityOut === 5
    )).toBe(true);
  });

  it("creates a full canonical deduction when legacy plant source has no matched ledger", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
      return { id: 1, oldBalance: 40, newBalance: 40 + delta };
    });
    state.selects.push(
      [{ id: 7, equipmentId: 1, date: "2026-08-31", entryType: "time_meter", dieselIssued: 5, dieselIncluded: false, dieselSource: "plant_stock" }],
      [],
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [],
      [{ id: 12, name: "DIESEL", defaultUom: "Liters", isActive: 1 }],
      [{ id: 1, name: "HLC" }],
    );
    await (storage as any)._updateEquipmentUsageTxn(7, { dieselIssued: 8 });
    expect(adjustments).toEqual([{ materialId: 12, partyId: 1, delta: -8 }]);
    expect(state.inserts.some((row: any) =>
      row.materialId === 12 && row.transactionType === "equipment_usage" && row.quantityOut === 8
    )).toBe(true);
  });

  it("keeps a historical HSD plant deduction and replacement ledger in its non-HLC party bucket", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
      return { id: 1, oldBalance: 30, newBalance: 30 + delta };
    });
    state.selects.push(
      [{ id: 7, equipmentId: 1, date: "2026-08-31", entryType: "time_meter", dieselIssued: 5, dieselIncluded: false, dieselSource: "plant_stock" }],
      [],
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [{ id: 90, transactionType: "equipment_usage", materialId: 88, partyId: 77, quantityOut: 5, uom: "Liters" }],
      [{ id: 88, name: "HSD", defaultUom: "Liters", isActive: 1 }],
      [{ id: 1, name: "HLC" }],
      [{ id: 3, balance: 27, uom: "Liters" }],
    );
    await (storage as any)._updateEquipmentUsageTxn(7, { dieselIssued: 8 });
    expect(adjustments).toEqual([{ materialId: 88, partyId: 77, delta: -3 }]);
    const replacement = state.inserts.find((row: any) => row.transactionType === "equipment_usage");
    expect(replacement).toMatchObject({ materialId: 88, partyId: 77, quantityOut: 8, balanceAfter: 27 });
    expect(adjustments.some((entry) => entry.partyId === 1)).toBe(false);
  });

  it("forces shifting update fuel state to zero without stock or ledger work", async () => {
    const storage = new DatabaseStorage();
    (storage as any)._adjustStockBalance = vi.fn();
    state.selects.push(
      [{ id: 7, equipmentId: 1, date: "2026-08-31", entryType: "time_meter", dieselIssued: 0, dieselSource: null }],
      [],
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [],
      [{ id: 1, name: "HLC" }],
    );
    await (storage as any)._updateEquipmentUsageTxn(7, {
      entryType: "shifting",
      dieselIssued: 50,
      dieselSource: null,
    });
    expect(state.updates.at(-1)).toMatchObject({ dieselIssued: 0, openingDiesel: 0, closingDiesel: 0 });
    expect((storage as any)._adjustStockBalance).not.toHaveBeenCalled();
    expect(state.inserts.some((row: any) => row.transactionType === "equipment_usage" || row.transactionType === "direct_purchase")).toBe(false);
  });

  it("does not require canonical fuel for contractor-only positive usage update", async () => {
    const storage = new DatabaseStorage();
    (storage as any).resolveCanonicalDieselMaterial = vi.fn(async () => {
      throw new Error("resolver must not run");
    });
    state.selects.push(
      [{ id: 7, equipmentId: 1, date: "2026-08-31", entryType: "time_meter", dieselIssued: 5, dieselIncluded: true, dieselSource: "contractor" }],
      [],
      [{ id: 1, name: "ROLLER", meterType: "hour_meter", consumptionNorm: 1 }],
      [],
      [{ id: 1, name: "HLC" }],
    );
    await expect((storage as any)._updateEquipmentUsageTxn(7, { dieselIssued: 6 })).resolves.toBeTruthy();
    expect((storage as any).resolveCanonicalDieselMaterial).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "", "mystery"])("rejects raw DPR source %j before equipment insert seam", (dieselSource) => {
    const storage = new DatabaseStorage();
    expect(() => (storage as any).assertValidDprEquipmentDieselSources([
      { diesel: 5, dieselSource },
    ])).toThrowError(expect.objectContaining({ code: "INVALID_DIESEL_SOURCE" }));
    expect(state.inserts).toHaveLength(0);
  });

  it("uses HSD for DPR plant-stock deduction and cleanup restores its actual ledger bucket", async () => {
    const storage = new DatabaseStorage();
    const adjustments: any[] = [];
    (storage as any).resolveCanonicalDieselMaterial = vi.fn(async () => ({
      id: 88, name: "HSD", defaultUom: "Liters", isActive: 1,
    }));
    (storage as any)._adjustStockBalance = vi.fn(async (_tx: any, materialId: number, partyId: number, delta: number) => {
      adjustments.push({ materialId, partyId, delta });
      return { id: 1, oldBalance: 100, newBalance: 100 + delta };
    });

    state.selects.push([{ id: 1, name: "HLC" }]);
    await (storage as any).processDprEquipmentDieselLedger(tx, [
      { id: 9, diesel: 10, dieselSource: "plant_stock", machine: "ROLLER" },
    ], "2026-08-31", "SITE");
    expect(adjustments[0]).toMatchObject({ materialId: 88, delta: -10 });
    expect(state.inserts.at(-1)).toMatchObject({
      materialId: 88, transactionType: "dpr_equipment_usage", referenceId: -9,
    });

    state.selects.push(
      [{ id: 9, diesel: 10, dieselSource: "plant_stock" }],
      [{ id: 70, materialId: 88, quantityOut: 10 }],
      [{ id: 88, name: "HSD", defaultUom: "Liters" }],
      [{ id: 1, name: "HLC" }],
    );
    await (storage as any).cleanupDprEquipmentDieselLedger(tx, 4);
    expect(adjustments.at(-1)).toMatchObject({ materialId: 88, delta: 10 });
    expect(state.deletes.length).toBeGreaterThan(0);
  });

  it("accepts contractor DPR fuel without stock or ledger effects", async () => {
    const storage = new DatabaseStorage();
    (storage as any)._adjustStockBalance = vi.fn();
    await (storage as any).processDprEquipmentDieselLedger(tx, [
      { id: 10, diesel: 12, dieselSource: "contractor" },
    ], "2026-08-31", "SITE");
    expect((storage as any)._adjustStockBalance).not.toHaveBeenCalled();
    expect(state.inserts).toHaveLength(0);
  });
});