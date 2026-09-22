import { beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => {
  const state = {
    selectRows: [] as any[][],
    updates: [] as any[],
    inserts: [] as any[],
    executed: [] as any[],
    failInsert: false,
    insertRows: [] as any[][],
    updateRows: [] as any[][],
  };
  const makeQuery = (rows: any[], onSet?: (value: any) => void, onValues?: (value: any) => void): any => {
    const q: any = {
      from: () => q, where: () => q, innerJoin: () => q, leftJoin: () => q,
      orderBy: () => q, limit: () => q, for: () => q, returning: () => q,
      set: (value: any) => { onSet?.(value); return q; },
      values: (value: any) => { onValues?.(value); return q; },
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
    };
    return q;
  };
  const fakeDb: any = {
    select: vi.fn(() => makeQuery(state.selectRows.shift() || [])),
    transaction: vi.fn(async (callback: any) => {
      const updateLength = state.updates.length;
      const insertLength = state.inserts.length;
      try {
        return await callback({
          select: vi.fn(() => makeQuery(state.selectRows.shift() || [])),
          update: vi.fn(() => makeQuery(state.updateRows.shift() || [], value => state.updates.push(value))),
          insert: vi.fn(() => {
            if (state.failInsert) throw new Error("audit unavailable");
            return makeQuery(state.insertRows.shift() || [], undefined, value => state.inserts.push(value));
          }),
          execute: vi.fn(async (statement: any) => {
            state.executed.push(statement);
            return { rows: [] };
          }),
        });
      } catch (error) {
        state.updates.length = updateLength;
        state.inserts.length = insertLength;
        throw error;
      }
    }),
  };
  return Object.assign(state, { fakeDb });
});

function query(rows: any[], onSet?: (value: any) => void, onValues?: (value: any) => void): any {
  const q: any = {
    from: () => q,
    where: () => q,
    innerJoin: () => q,
    leftJoin: () => q,
    orderBy: () => q,
    limit: () => q,
    for: () => q,
    set: (value: any) => {
      onSet?.(value);
      return q;
    },
    values: (value: any) => {
      onValues?.(value);
      return q;
    },
    returning: () => q,
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return q;
}

vi.mock("../server/db", () => ({ db: fx.fakeDb }));

import { DatabaseStorage } from "../server/storage";

beforeEach(() => {
  fx.selectRows.length = 0;
  fx.updates.length = 0;
  fx.inserts.length = 0;
  fx.executed.length = 0;
  fx.failInsert = false;
  fx.insertRows.length = 0;
  fx.updateRows.length = 0;
  vi.clearAllMocks();
});

describe("VB22 backend storage", () => {
  it("persists and edits the independent source vendor without changing transport fields", async () => {
    fx.insertRows.push([{
      id: 1,
      site: "SITE A",
      material: "SOIL",
      supplier: "TRANSPORTER",
      materialSourceSupplier: "BORROW OWNER",
    }]);
    const storage = new DatabaseStorage();
    const created = await storage.createSiteMaterialTrip({
      date: "2026-01-01",
      site: "SITE A",
      material: "SOIL",
      supplier: "TRANSPORTER",
      materialSourceSupplier: " borrow   owner ",
      quantity: 600,
      uom: "CFT",
    });
    expect(created.materialSourceSupplier).toBe("BORROW OWNER");
    expect(fx.inserts[0]).toMatchObject({
      supplier: "TRANSPORTER",
      materialSourceSupplier: "BORROW OWNER",
      quantity: 600,
    });

    fx.selectRows.push(
      [{ id: 1, site: "SITE A", material: "SOIL", supplier: "TRANSPORTER", vehicleNumber: null, materialSourceSupplier: "BORROW OWNER" }],
      [],
    );
    fx.updateRows.push([{
      id: 1,
      supplier: "TRANSPORTER",
      materialSourceSupplier: "QUARRY B",
      quantity: 600,
    }]);
    const edited = await storage.updateSiteMaterialTrip(1, { materialSourceSupplier: " quarry b " });
    expect(edited).toMatchObject({
      supplier: "TRANSPORTER",
      materialSourceSupplier: "QUARRY B",
      quantity: 600,
    });
    expect(fx.updates.at(-1)).toEqual({ materialSourceSupplier: "QUARRY B" });
  });

  it("bulk assigns only the selected locked rows and writes its audit atomically", async () => {
    fx.selectRows.push([
      { id: 11, previous: null },
      { id: 12, previous: "" },
    ]);
    const storage = new DatabaseStorage();
    const result = await storage.bulkAssignSiteMaterialTripMaterialSource({
      material: "soil",
      onlyUnassigned: true,
      materialSourceSupplier: " borrow   owner ",
      permittedSiteNames: ["SITE A"],
      actor: { userId: 7, userName: "TESTER", userRole: "manager" },
    });

    expect(result).toEqual({ updatedCount: 2 });
    expect(fx.updates).toEqual([{ materialSourceSupplier: "BORROW OWNER" }]);
    expect(fx.inserts).toHaveLength(1);
    expect(fx.inserts[0]).toEqual([
      expect.objectContaining({
        module: "site_material_trips", transactionId: 11, action: "edit",
        oldValues: { materialSourceSupplier: null },
        newValues: { materialSourceSupplier: "BORROW OWNER" },
      }),
      expect.objectContaining({
        transactionId: 12, oldValues: { materialSourceSupplier: "" },
        newValues: { materialSourceSupplier: "BORROW OWNER" },
      }),
    ]);
  });

  it("rolls the bulk assignment back when its audit write fails", async () => {
    fx.selectRows.push([{ id: 11, previous: null }]);
    fx.failInsert = true;
    await expect(new DatabaseStorage().bulkAssignSiteMaterialTripMaterialSource({
      onlyUnassigned: true,
      materialSourceSupplier: "Borrow Owner",
      actor: { userId: 7, userName: "TESTER" },
    })).rejects.toThrow("audit unavailable");
    expect(fx.updates).toEqual([]);
    expect(fx.inserts).toEqual([]);
  });

  it("keeps transport and material roles independent but blocks the same aliased-vendor role", async () => {
    const storage = new DatabaseStorage();
    const aliases = [{ canonicalName: "BORROW OWNER", alias: "OWNER ALIAS" }];

    // Existing material-role source under the canonical vendor blocks an alias.
    fx.selectRows.push(aliases, [{ billNo: "VB-9", source: "auto:site_material_trip_material:42" }]);
    await expect((storage as any).assertSiteMaterialTripItemsAvailable(
      {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: vi.fn(() => query(fx.selectRows.shift() || [])),
      },
      "Owner Alias",
      [{ source: "auto:site_material_trip_material:42" }],
    )).rejects.toMatchObject({ code: "CONFLICT" });

    // The same physical trip's transport role is a different persisted source.
    fx.selectRows.push(aliases, []);
    await expect((storage as any).assertSiteMaterialTripItemsAvailable(
      {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: vi.fn(() => query(fx.selectRows.shift() || [])),
      },
      "Owner Alias",
      [{ source: "auto:site_material_trip:42" }],
    )).resolves.toBeUndefined();

    fx.selectRows.push(aliases, [{ billNo: "VB-T", source: "auto:site_material_trip:42" }]);
    await expect((storage as any).assertSiteMaterialTripItemsAvailable(
      {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        select: vi.fn(() => query(fx.selectRows.shift() || [])),
      },
      "Owner Alias",
      [{ source: "auto:site_material_trip:42" }],
    )).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("historical duplicate checks preserve bill status, including cancelled", async () => {
    fx.selectRows.push(
      [{ canonicalName: "BORROW OWNER", alias: "OWNER ALIAS" }],
      [{ id: 3, vendorName: "BORROW OWNER", billNo: "VB-C", status: "cancelled" }],
      [{ billId: 3, date: "2026-01-01", source: "auto:site_material_trip_material:42", description: "SOIL" }],
    );
    const result = await new DatabaseStorage().checkDuplicateBilledItems("Owner Alias", [{
      date: "2026-01-01",
      source: "auto:site_material_trip_material:42",
      description: "SOIL (SITE TRIP MATERIAL)",
      category: "material",
    }]);
    expect(result).toEqual([{ index: 0, billNo: "VB-C", billStatus: "cancelled" }]);
  });
});