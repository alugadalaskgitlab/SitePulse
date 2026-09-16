import { beforeEach, describe, expect, it, vi } from "vitest";
import { appSettings, auditLogs, siteMaterialTrips } from "../shared/schema";

type Trip = Record<string, any>;
type FixtureState = {
  trips: Trip[];
  associations: Record<string, { supplier: string; version: string }>;
  rawSetting: string | null;
  auditLogs: any[];
  nextId: number;
  failAssociationWrites: boolean;
  failAuditWrites: boolean;
  failAssociationReads: boolean;
};

const state: FixtureState = {
  trips: [],
  associations: {},
  rawSetting: null,
  auditLogs: [],
  nextId: 1,
  failAssociationWrites: false,
  failAuditWrites: false,
  failAssociationReads: false,
};

let transactionQueue = Promise.resolve();

function cloneState(source: FixtureState): FixtureState {
  return {
    trips: source.trips.map((row) => ({ ...row })),
    associations: JSON.parse(JSON.stringify(source.associations)),
    rawSetting: source.rawSetting,
    auditLogs: source.auditLogs.map((row) => ({ ...row })),
    nextId: source.nextId,
    failAssociationWrites: source.failAssociationWrites,
    failAuditWrites: source.failAuditWrites,
    failAssociationReads: source.failAssociationReads,
  };
}

function settingValue(context: FixtureState): string | null {
  return context.rawSetting ?? (Object.keys(context.associations).length > 0
    ? JSON.stringify(context.associations)
    : null);
}

function makeQuery(context: FixtureState, kind: "select" | "insert" | "update", fields?: any): any {
  let table: any;
  let values: any;
  let updates: any;
  let mutationApplied = false;
  const applyMutation = (): any[] => {
    if (mutationApplied) return [];
    mutationApplied = true;
    if (kind === "insert" && table === siteMaterialTrips) {
      const row = {
        ...values,
        id: context.nextId++,
        createdAt: new Date(),
        isCancelled: false,
        isDeleted: false,
      };
      context.trips.push(row);
      return [row];
    }
    if (kind === "insert" && table === appSettings) {
      if (context.failAssociationWrites) throw new Error("association setting unavailable");
      context.rawSetting = String(values.value);
      context.associations = JSON.parse(context.rawSetting);
      return [{ id: 1, ...values }];
    }
    if (kind === "insert" && table === auditLogs) {
      if (context.failAuditWrites) throw new Error("audit log unavailable");
      context.auditLogs.push({ id: context.auditLogs.length + 1, ...values });
      return [{ id: context.auditLogs.length, ...values }];
    }
    if (kind === "update" && table === siteMaterialTrips) {
      if (!context.trips[0]) return [];
      Object.assign(context.trips[0], updates);
      return [{ ...context.trips[0] }];
    }
    if (kind === "update" && table === appSettings) {
      if (context.failAssociationWrites) throw new Error("association setting unavailable");
      context.rawSetting = String(updates.value);
      context.associations = JSON.parse(context.rawSetting);
      return [{ id: 1, key: "site_material_vehicle_supplier_associations.v1", value: updates.value }];
    }
    return [];
  };
  const query: any = {
    from(nextTable: any) { table = nextTable; return query; },
    where() { return query; },
    orderBy() { return query; },
    limit() { return query; },
    for() { return query; },
    values(next: any) { values = next; return query; },
    set(next: any) { updates = next; return query; },
    innerJoin() { return query; },
    leftJoin() { return query; },
    returning: async () => {
      return applyMutation();
    },
    then(resolve: (value: any) => any, reject?: (error: unknown) => any) {
      try {
        let result: any[] = [];
        if (kind === "select" && table === appSettings) {
          if (context.failAssociationReads) throw new Error("association setting unavailable");
          const value = settingValue(context);
          result = value == null ? [] : [{ value }];
        } else if (kind === "select" && table === siteMaterialTrips) {
          if (fields && "vehicleNumber" in fields && "supplier" in fields) {
            result = context.trips.map((row) => ({
              vehicleNumber: row.vehicleNumber ?? null,
              supplier: row.supplier ?? null,
            }));
          } else if (fields && "id" in fields && Object.keys(fields).length === 1) {
            result = context.trips.map((row) => ({ id: row.id }));
          } else {
            result = context.trips.map((row) => ({ ...row }));
          }
        } else if (kind !== "select") {
          result = applyMutation();
        }
        return Promise.resolve(resolve(result));
      } catch (error) {
        return reject ? Promise.resolve(reject(error)) : Promise.reject(error);
      }
    },
  };
  return query;
}

function makeTx(context: FixtureState): any {
  return {
    select: vi.fn((fields?: any) => makeQuery(context, "select", fields)),
    insert: vi.fn((table: any) => {
      const query = makeQuery(context, "insert");
      query.from(table);
      return query;
    }),
    update: vi.fn((table: any) => {
      const query = makeQuery(context, "update");
      query.from(table);
      return query;
    }),
    execute: vi.fn(async () => ({ rows: [] })),
  };
}

const fakeDb: any = {
  select: vi.fn((fields?: any) => makeQuery(state, "select", fields)),
  insert: vi.fn((table: any) => {
    const query = makeQuery(state, "insert");
    query.from(table);
    return query;
  }),
  update: vi.fn((table: any) => {
    const query = makeQuery(state, "update");
    query.from(table);
    return query;
  }),
  transaction: vi.fn((callback: (tx: any) => Promise<unknown>) => {
    // A transaction queue models the database advisory lock and makes the
    // two concurrent first-save calls execute against committed state in a
    // deterministic order.  Failed transactions never publish their draft.
    const run = transactionQueue.then(async () => {
      const draft = cloneState(state);
      const result = await callback(makeTx(draft));
      Object.assign(state, draft);
      return result;
    });
    transactionQueue = run.then(() => undefined, () => undefined);
    return run;
  }),
};

vi.mock("../server/db", () => ({ db: fakeDb }));

let DatabaseStorage: any;
let normalizeVehicleSupplierKey: (value: string) => string;

beforeEach(async () => {
  ({ DatabaseStorage } = await import("../server/storage"));
  ({ normalizeVehicleSupplierKey } = await import("../shared/vehicleSupplierAssociation"));
  state.trips = [];
  state.associations = {};
  state.rawSetting = null;
  state.auditLogs = [];
  state.nextId = 1;
  state.failAssociationWrites = false;
  state.failAuditWrites = false;
  state.failAssociationReads = false;
  transactionQueue = Promise.resolve();
  vi.clearAllMocks();
});

function trip(vehicleNumber: string, supplier: string | null, id?: number): Trip {
  return {
    ...(id == null ? {} : { id }),
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

describe("executed storage association transactions", () => {
  it("serializes concurrent first saves and lets the first supplier win", async () => {
    const storage = new DatabaseStorage();
    const first = storage.createSiteMaterialTrip(trip("KA 01 AB-1234", "First Haulage") as any);
    const second = storage.createSiteMaterialTrip(trip("KA01AB1234", "Second Haulage") as any);
    await Promise.all([first, second]);

    const key = normalizeVehicleSupplierKey("KA01AB1234");
    expect(state.associations[key].supplier).toBe("FIRST HAULAGE");
    expect(state.trips).toHaveLength(2);
  });

  it("rolls back the trip when atomic association persistence fails", async () => {
    state.failAssociationWrites = true;
    const storage = new DatabaseStorage();

    await expect(storage.createSiteMaterialTrip(trip("TS 09 XX 1", "Acme") as any))
      .rejects.toThrow("association setting unavailable");
    expect(state.trips).toHaveLength(0);
    expect(state.associations).toEqual({});
  });

  it("rejects malformed association blobs without erasing the existing setting", async () => {
    state.rawSetting = "{not-json";
    const storage = new DatabaseStorage();

    await expect(storage.createSiteMaterialTrip(trip("TS 09 XX 1", "Acme") as any))
      .rejects.toThrow("malformed JSON");
    expect(state.trips).toHaveLength(0);
    expect(state.rawSetting).toBe("{not-json");

    state.rawSetting = JSON.stringify({
      TS09XX1: { supplier: "", version: "v1" },
    });
    await expect(storage.createSiteMaterialTrip(trip("TS 09 XX 1", "Acme") as any))
      .rejects.toThrow("invalid entry");
    expect(state.rawSetting).toContain('"supplier":""');
  });

  it("persists the old unambiguous pair before an ordinary supplier edit", async () => {
    state.trips = [trip("KA01AB1234", "Original Haulage", 7)];
    state.nextId = 8;
    const storage = new DatabaseStorage();

    await storage.updateSiteMaterialTrip(7, { supplier: "Edited Historical Fact" } as any);

    const key = normalizeVehicleSupplierKey("KA 01 AB-1234");
    expect(state.associations[key].supplier).toBe("ORIGINAL HAULAGE");
    expect(state.trips[0].supplier).toBe("Edited Historical Fact");
  });

  it("aggregates beyond the recent suggestion window and keeps unknown conflict unresolved", async () => {
    state.trips = Array.from({ length: 1001 }, (_, index) =>
      trip(`KA01AB1234`, "Supplier A", index + 1),
    );
    state.trips.push(trip("KA 01 AB - 1234", "Supplier B", 1002));
    state.nextId = 1003;
    const storage = new DatabaseStorage();

    const suggestions = await storage.getSiteMaterialTripSuggestions("Site A");

    const key = normalizeVehicleSupplierKey("KA01AB1234");
    expect(suggestions.vehicleSuppliers[key]).toEqual({
      status: "conflict",
      supplier: null,
      version: null,
    });
  });

  it("keeps base suggestions available when optional association enrichment fails", async () => {
    state.trips = [trip("KA01AB1234", "Supplier A", 1)];
    state.nextId = 2;
    state.failAssociationReads = true;
    const storage = new DatabaseStorage();

    await expect(storage.getSiteMaterialTripSuggestions("Site A")).resolves.toMatchObject({
      vehicles: ["KA01AB1234"],
      suppliers: ["SUPPLIER A"],
      vehicleSuppliers: {},
    });
  });

  it("commits correction and audit together, rolling both back on audit failure", async () => {
    state.trips = [trip("KA01AB1234", "Historical Haulage", 7)];
    state.nextId = 8;
    const storage = new DatabaseStorage();
    const actor = { userId: 44, userName: "Correction Owner", userRole: "owner" };

    await expect(storage.correctVehicleSupplierAssociation({
      site: "Site A",
      vehicleNumber: "KA 01 AB-1234",
      supplier: "Confirmed Haulage",
      expectedVersion: null,
      expectedSupplier: "HISTORICAL HAULAGE",
      actor,
    })).resolves.toMatchObject({
      association: { status: "linked", supplier: "CONFIRMED HAULAGE" },
    });
    const key = normalizeVehicleSupplierKey("KA01AB1234");
    expect(state.associations[key].supplier).toBe("CONFIRMED HAULAGE");
    expect(state.auditLogs).toHaveLength(1);
    expect(state.auditLogs[0]).toMatchObject({
      userId: 44,
      userName: "Correction Owner",
      oldValues: expect.any(Object),
      newValues: expect.any(Object),
    });

    state.associations = {};
    state.rawSetting = null;
    state.auditLogs = [];
    state.failAuditWrites = true;
    await expect(storage.correctVehicleSupplierAssociation({
      site: "Site A",
      vehicleNumber: "KA 01 AB-1234",
      supplier: "Another Haulage",
      expectedVersion: null,
      expectedSupplier: "HISTORICAL HAULAGE",
      actor,
    })).rejects.toThrow("audit log unavailable");
    expect(state.associations).toEqual({});
    expect(state.auditLogs).toEqual([]);
  });
});
