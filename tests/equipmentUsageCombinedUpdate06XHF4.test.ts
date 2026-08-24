import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  equipmentMaster,
  equipmentUsage,
  parties,
  plantMaterials,
  stockBalances,
  stockLedger,
} from "../shared/schema";

const fx = vi.hoisted(() => {
  const state = {
    existing: {} as Record<string, any>,
    equipment: {} as Record<string, any>,
    dieselMaterial: {} as Record<string, any>,
    hlcParty: {} as Record<string, any>,
    stockBalance: 0,
    ledger: [] as Array<Record<string, any>>,
    tableKinds: new Map<any, string>(),
    adjustmentDeltas: [] as number[],
    timestampWriteValues: [] as unknown[],
    encodedTimestampValues: [] as string[],
    encodeOpenedAt: null as null | ((value: unknown) => string),
    successorExists: false,
  };

  const rowsFor = (table: any) => {
    switch (state.tableKinds.get(table)) {
      case "equipmentUsage":
        return [state.existing];
      case "equipmentMaster":
        return [state.equipment];
      case "plantMaterials":
        return [state.dieselMaterial];
      case "parties":
        return [state.hlcParty];
      case "stockBalances":
        return [{ id: 1, balance: state.stockBalance, uom: "Liters" }];
      default:
        return [];
    }
  };

  const tx = {
    select: vi.fn((projection?: Record<string, unknown>) => ({
      from: (table: any) => ({
        where: () => ({
          limit: async () => (
            state.tableKinds.get(table) === "equipmentUsage" && projection?.id
              ? (state.successorExists ? [{ id: 999 }] : [])
              : rowsFor(table)
          ),
        }),
      }),
    })),
    update: vi.fn((table: any) => ({
      set: (values: Record<string, any>) => ({
        where: () => ({
          returning: async () => {
            if (state.tableKinds.get(table) !== "equipmentUsage") return [];
            if (Object.prototype.hasOwnProperty.call(values, "openedAt") && values.openedAt != null) {
              state.timestampWriteValues.push(values.openedAt);
              state.encodedTimestampValues.push(state.encodeOpenedAt!(values.openedAt));
            }
            state.existing = { ...state.existing, ...values, id: state.existing.id };
            return [state.existing];
          },
        }),
      }),
    })),
    delete: vi.fn((table: any) => ({
      where: async () => {
        if (state.tableKinds.get(table) === "stockLedger") state.ledger = [];
      },
    })),
    insert: vi.fn((table: any) => ({
      values: (values: Record<string, any>) => {
        if (state.tableKinds.get(table) === "equipmentUsage") {
          if (Object.prototype.hasOwnProperty.call(values, "openedAt") && values.openedAt != null) {
            state.timestampWriteValues.push(values.openedAt);
            state.encodedTimestampValues.push(state.encodeOpenedAt!(values.openedAt));
          }
          state.existing = { id: 302, ...values };
          return { returning: async () => [state.existing] };
        }
        if (state.tableKinds.get(table) === "stockLedger") {
          state.ledger.push({ id: 8000 + state.ledger.length, ...values });
        }
        return Promise.resolve([]);
      },
    })),
  };

  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<any>) => {
      const snapshot = {
        existing: { ...state.existing },
        stockBalance: state.stockBalance,
        ledger: state.ledger.map((row) => ({ ...row })),
        adjustmentDeltas: [...state.adjustmentDeltas],
        timestampWriteValues: [...state.timestampWriteValues],
        encodedTimestampValues: [...state.encodedTimestampValues],
      };
      try {
        return await callback(tx);
      } catch (error) {
        state.existing = snapshot.existing;
        state.stockBalance = snapshot.stockBalance;
        state.ledger = snapshot.ledger;
        state.adjustmentDeltas = snapshot.adjustmentDeltas;
        state.timestampWriteValues = snapshot.timestampWriteValues;
        state.encodedTimestampValues = snapshot.encodedTimestampValues;
        throw error;
      }
    }),
  };

  return { state, tx, db };
});

vi.mock("../server/db", () => ({ db: fx.db }));

let DatabaseStorage: any;
let InsufficientPlantStockError: any;
let planEquipmentUsageDieselTransition: any;
let storage: any;

beforeAll(async () => {
  const mod = await import("../server/storage");
  DatabaseStorage = mod.DatabaseStorage;
  InsufficientPlantStockError = mod.InsufficientPlantStockError;
  planEquipmentUsageDieselTransition = mod.planEquipmentUsageDieselTransition;
  storage = new DatabaseStorage();

  fx.state.tableKinds.set(equipmentUsage, "equipmentUsage");
  fx.state.tableKinds.set(equipmentMaster, "equipmentMaster");
  fx.state.tableKinds.set(plantMaterials, "plantMaterials");
  fx.state.tableKinds.set(parties, "parties");
  fx.state.tableKinds.set(stockBalances, "stockBalances");
  fx.state.tableKinds.set(stockLedger, "stockLedger");
  fx.state.encodeOpenedAt = (value: unknown) =>
    equipmentUsage.openedAt.mapToDriverValue(value as Date);
});

beforeEach(() => {
  fx.state.existing = {
    id: 301,
    date: "2026-08-23",
    equipmentId: 42,
    entryType: "time_meter",
    openingReading: 1200,
    closingReading: null,
    dieselIssued: 20,
    dieselIncluded: false,
    dieselSource: "direct_purchase",
    destinationSite: "THAKKADPALLY",
    status: "open",
  };
  fx.state.equipment = {
    id: 42,
    name: "JCB-3DX",
    meterType: "hour_meter",
    consumptionNorm: 4,
  };
  fx.state.dieselMaterial = { id: 12, name: "Diesel", defaultUom: "Liters" };
  fx.state.hlcParty = { id: 3, name: "HLC" };
  fx.state.stockBalance = 100;
  fx.state.ledger = [
    {
      id: 7001,
      transactionType: "direct_purchase",
      referenceId: 301,
      quantityIn: 20,
      quantityOut: 20,
      balanceAfter: null,
    },
  ];
  fx.state.adjustmentDeltas = [];
  fx.state.timestampWriteValues = [];
  fx.state.encodedTimestampValues = [];
  fx.state.successorExists = false;

  storage._adjustStockBalance = vi.fn(
    async (
      _tx: unknown,
      _materialId: number,
      _partyId: number | null,
      delta: number,
      _uom: string,
      guard?: unknown,
    ) => {
      fx.state.adjustmentDeltas.push(delta);
      const next = fx.state.stockBalance + delta;
      if (guard && next < 0) {
        throw new InsufficientPlantStockError({
          material: "Diesel",
          source: "plant_stock",
          materialId: 12,
          requestedQty: Math.abs(delta),
          availableQty: fx.state.stockBalance,
          shortageQty: Math.abs(next),
        });
      }
      fx.state.stockBalance = next;
      return { newBalance: next };
    },
  );
});

describe("06X-HF4 equipment-usage combined update transaction", () => {
  it("saves destination + source on the same id, deducts stock once, and leaves one replacement ledger row", async () => {
    const updated = await storage.updateEquipmentUsage(301, {
      destinationSite: "Site B",
      dieselSource: "plant_stock",
      dieselIncluded: false,
      dieselIssued: 20,
    });

    expect(updated).toMatchObject({
      id: 301,
      destinationSite: "Site B",
      dieselSource: "plant_stock",
      dieselIssued: 20,
    });
    expect(fx.state.existing).toMatchObject({
      id: 301,
      destinationSite: "Site B",
      dieselSource: "plant_stock",
    });
    expect(fx.state.adjustmentDeltas).toEqual([-20]);
    expect(storage._adjustStockBalance).toHaveBeenCalledTimes(1);
    expect(fx.state.stockBalance).toBe(80);
    expect(fx.state.ledger).toEqual([
      expect.objectContaining({
        transactionType: "equipment_usage",
        referenceId: 301,
        quantityOut: 20,
        balanceAfter: 80,
      }),
    ]);
  });

  it("reverse source change restores stock once and replaces the ledger once", async () => {
    fx.state.existing.dieselSource = "plant_stock";
    fx.state.ledger = [
      {
        id: 7002,
        transactionType: "equipment_usage",
        referenceId: 301,
        quantityOut: 20,
        balanceAfter: 80,
      },
    ];

    const updated = await storage.updateEquipmentUsage(301, {
      destinationSite: "Site B",
      dieselSource: "direct_purchase",
      dieselIncluded: false,
      dieselIssued: 20,
      fuelStation: "BPCL",
    });

    expect(updated).toMatchObject({
      id: 301,
      destinationSite: "Site B",
      dieselSource: "direct_purchase",
    });
    expect(fx.state.adjustmentDeltas).toEqual([20]);
    expect(storage._adjustStockBalance).toHaveBeenCalledTimes(1);
    expect(fx.state.stockBalance).toBe(120);
    expect(fx.state.ledger).toEqual([
      expect.objectContaining({
        transactionType: "direct_purchase",
        referenceId: 301,
        quantityIn: 20,
        quantityOut: 20,
        balanceAfter: null,
      }),
    ]);
  });

  it("insufficient stock rolls back both field changes and ledger replacement", async () => {
    fx.state.stockBalance = 10;
    const before = {
      existing: { ...fx.state.existing },
      ledger: fx.state.ledger.map((row) => ({ ...row })),
    };

    await expect(
      storage.updateEquipmentUsage(301, {
        destinationSite: "Site B",
        dieselSource: "plant_stock",
        dieselIncluded: false,
        dieselIssued: 20,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PLANT_STOCK" });

    expect(fx.state.existing).toEqual(before.existing);
    expect(fx.state.stockBalance).toBe(10);
    expect(fx.state.ledger).toEqual(before.ledger);
    expect(fx.state.adjustmentDeltas).toEqual([]);
  });
});

describe("06X-HF4 diesel transition plan", () => {
  it("plant-stock quantity edits apply only the net difference", () => {
    expect(
      planEquipmentUsageDieselTransition({
        oldDieselIssued: 20,
        newDieselIssued: 35,
        oldDieselIncluded: false,
        newDieselIncluded: false,
        oldDieselSource: "plant_stock",
        newDieselSource: "plant_stock",
      }),
    ).toEqual({
      stockBalanceDelta: -15,
      ledgerType: "equipment_usage",
    });
  });
});

describe("06X-HF5 equipment-usage timestamp normalization", () => {
  it("A: reopens the same completed row as an open dispatch and passes a Date through the real Drizzle encoder", async () => {
    fx.state.existing = {
      ...fx.state.existing,
      id: 301,
      date: "2026-08-08",
      equipmentId: 42,
      openingReading: 2515.4,
      closingReading: 2518.2,
      endTime: "17:30",
      destinationSite: null,
      status: "closed",
    };
    const openedAt = "2026-08-24T10:41:10.670Z";

    const updated = await storage.updateEquipmentUsage(301, {
      destinationSite: "Takkadpally-sirur",
      status: "open",
      openedAt,
      closingReading: null,
      endTime: null,
      dieselSource: "direct_purchase",
      dieselIncluded: false,
      siteName: "THAKKADPALLY",
      fuelStation: "BPCL",
      billNumber: "HO431",
      amountPaid: 2092.2,
      openingDiesel: 0,
      dieselIssued: 20,
    } as any);

    expect(fx.state.timestampWriteValues).toHaveLength(1);
    expect(fx.state.timestampWriteValues[0]).toBeInstanceOf(Date);
    expect(fx.state.encodedTimestampValues).toEqual([openedAt]);
    expect(updated).toMatchObject({
      id: 301,
      closingReading: null,
      endTime: null,
      status: "open",
      destinationSite: "Takkadpally-sirur",
    });
    expect(fx.state.existing).toMatchObject({
      id: 301,
      closingReading: null,
      endTime: null,
      status: "open",
      destinationSite: "Takkadpally-sirur",
    });
  });

  it("B: creates a fresh Send-to-Site row with openedAt persisted as a valid timestamp", async () => {
    const openedAt = "2026-08-24T11:00:00.000Z";

    const created = await storage.createEquipmentUsage({
      date: "2026-08-24",
      equipmentId: 42,
      entryType: "time_meter",
      openingReading: 2600,
      closingReading: null,
      endTime: null,
      dieselIssued: 0,
      status: "open",
      destinationSite: "Takkadpally-sirur",
      openedAt,
    } as any);

    expect(created.id).toBe(302);
    expect(created.openedAt).toBeInstanceOf(Date);
    expect(fx.state.timestampWriteValues).toHaveLength(1);
    expect(fx.state.timestampWriteValues[0]).toBeInstanceOf(Date);
    expect(fx.state.encodedTimestampValues).toEqual([openedAt]);
  });

  it("C: leaves openedAt absent on a normal edit that does not touch Send to Site", async () => {
    const updated = await storage.updateEquipmentUsage(301, {
      operator: "RAMESH",
      remarks: "normal edit",
    });

    expect(updated).toMatchObject({
      id: 301,
      operator: "RAMESH",
      remarks: "NORMAL EDIT",
    });
    expect(fx.state.timestampWriteValues).toEqual([]);
    expect(fx.state.encodedTimestampValues).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(fx.state.existing, "openedAt")).toBe(false);
  });
});