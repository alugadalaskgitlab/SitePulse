import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const fx = vi.hoisted(() => ({
  queue: [] as any[][],
  writes: [] as any[],
  selectCalls: 0,
}));

function query(rows: any[] = []) {
  const q: any = {
    from: () => q, where: () => q, limit: () => q, orderBy: () => q,
    innerJoin: () => q, leftJoin: () => q,
    returning: () => Promise.resolve(rows),
    then: (resolve: any) => resolve(rows),
    values: (value: any) => { fx.writes.push(value); return query([{ id: 91, ...value }]); },
    set: (value: any) => { fx.writes.push(value); return query([{ id: 7, ...value }]); },
  };
  return q;
}

const tx: any = {
  select: vi.fn(() => { fx.selectCalls++; return query(fx.queue.shift() ?? []); }),
  insert: vi.fn(() => query()),
  update: vi.fn(() => query()),
  delete: vi.fn(() => query()),
  execute: vi.fn(async () => ({ rows: [] })),
};
const fakeDb: any = {
  transaction: vi.fn(async (fn: any) => {
    const writeBoundary = fx.writes.length;
    try {
      return await fn(tx);
    } catch (error) {
      // Mirror the database transaction boundary closely enough for the
      // focused storage runtime tests to observe all-or-nothing writes.
      fx.writes.splice(writeBoundary);
      throw error;
    }
  }),
  select: tx.select,
};
vi.mock("../server/db", () => ({ db: fakeDb }));

let DatabaseStorage: any;
let InsufficientPlantStockError: any;
beforeAll(async () => {
  ({ DatabaseStorage, InsufficientPlantStockError } = await import("../server/storage"));
});
beforeEach(() => {
  fx.queue = [];
  fx.writes = [];
  fx.selectCalls = 0;
  vi.clearAllMocks();
});

describe("equipment consistency storage runtime", () => {
  it("standalone create uses invalid-meter time fallback and persists its physical tank", async () => {
    fx.queue.push([{ id: 2, meterType: "hour_meter", consumptionNorm: 4 }]);
    const storage = new DatabaseStorage();
    const saved = await storage.createEquipmentUsage({
      equipmentId: 2, date: "2026-09-01", openingReading: 10, closingReading: 8,
      startTime: "08:00", endTime: "09:30", dieselIssued: 0,
      openingDiesel: 20, dieselBalanceInTank: 17, dieselBalanceConfirmed: true,
    } as any);
    expect(saved).toMatchObject({
      hoursOrKmRun: 1.5, expectedDiesel: 6, totalKm: null,
      openingDiesel: 20, closingDiesel: 17,
      dieselBalanceInTank: 17, dieselBalanceConfirmed: true,
    });
  });

  it("standalone PATCH recomputes odometer km through the shared seam", async () => {
    fx.queue.push(
      [{ id: 7, equipmentId: 3, entryType: "time_meter", openingReading: 100, closingReading: 110, dieselIssued: 0 }],
      [],
      [{ id: 3, meterType: "odometer", consumptionNorm: 0.25 }],
      [],
      [],
    );
    const storage = new DatabaseStorage();
    const saved = await storage.updateEquipmentUsage(7, { closingReading: 140 } as any);
    expect(saved).toMatchObject({ hoursOrKmRun: 40, totalKm: 40, expectedDiesel: 10 });
  });

  it("DPR normalizer persists hours/norm/tanks and ignores stale derived input", async () => {
    fx.queue.push([{ id: 4, meterType: "hour_meter", consumptionNorm: 3 }]);
    const storage = new DatabaseStorage();
    const [row] = await (storage as any).normaliseDprEquipmentRowsTx(tx, [{
      equipmentId: 4, openingReading: 10, closingReading: 11.5,
      hoursWorked: 999, expectedDiesel: 999, dieselNorm: 999,
      openingDiesel: 30, dieselBalanceInTank: 25, dieselBalanceConfirmed: true,
    }]);
    expect(row).toMatchObject({
      hoursWorked: 1.5, totalKm: null, expectedDiesel: 4.5, dieselNorm: 3,
      openingDiesel: 30, dieselBalanceInTank: 25, dieselBalanceConfirmed: true,
    });
  });

  it("confirmed tank resolver enforces scope, strict/inclusive selection, and canonical precedence", async () => {
    const storage = new DatabaseStorage();
    await expect(storage.resolveLatestConfirmedDieselTank(
      4, "2026-09-02", { siteName: "SITE B", permittedSiteNames: ["SITE A"] },
    )).resolves.toBeNull();
    expect(fx.selectCalls).toBe(0);

    fx.queue.push(
      [{ recordId: 8, sourceDate: "2026-09-01", dieselBalanceInTank: 22 }],
      [{ recordId: 7, sourceDate: "2026-08-31", dieselBalanceInTank: 21 }],
    );
    await expect(storage.resolveLatestConfirmedDieselTank(
      4, "2026-09-02", { siteName: "site a", permittedSiteNames: ["SITE A"] },
      { inclusive: false },
    )).resolves.toEqual({ recordId: 8, sourceDate: "2026-09-01", dieselBalanceInTank: 22 });
  });

  it("clone finalization keeps a linked usage and materializes one legacy unlinked row without stock work", async () => {
    fx.queue.push([{ id: 44, status: "closed", dprId: 3 }]);
    const storage = new DatabaseStorage();
    (storage as any)._updateEquipmentUsageTxn = vi.fn();
    (storage as any).processDprEquipmentDieselLedger = vi.fn();
    await (storage as any).finalizeDprEquipmentUsageTx(
      tx,
      { id: 10, date: "2026-09-01", site: "SITE A", engineer: "M", dprStatus: "submitted" },
      [
        { id: 101, equipmentId: 4, plantUsageId: 44, diesel: 12, dieselSource: "plant_stock" },
        { id: 102, equipmentId: 5, plantUsageId: null, diesel: 8, dieselSource: "plant_stock", hoursWorked: 1 },
      ],
      { preserveLinkedClone: true, allowMovedSourceReuse: true, cloneSourceLogIds: { 102: 55 } },
    );
    expect((storage as any)._updateEquipmentUsageTxn).not.toHaveBeenCalled();
    expect((storage as any).processDprEquipmentDieselLedger).not.toHaveBeenCalled();
    expect(fx.writes.filter((value) => value?.equipmentId === 5)).toHaveLength(1);
    expect(fx.writes.filter((value) => value?.plantUsageId === 91)).toHaveLength(2);
  });
});

describe("DPR draft operational side-effect boundary", () => {
  const payload = (status: "draft" | "submitted" = "draft") => ({
    date: "2026-09-01",
    site: "SITE A",
    engineer: "ENGINEER",
    dprStatus: status,
    progress: [],
    labour: [],
    materials: [],
    sitePurchases: [],
    structureItems: [],
    equipment: [{
      machine: "ROLLER",
      equipmentId: 4,
      openingReading: 10,
      closingReading: 12,
      diesel: 50,
      dieselSource: "plant_stock",
      breakdowns: [{
        clientKey: "breakdown-1",
        description: "Hydraulic leak",
        fromTime: "09:00",
        toTime: "10:00",
      }],
    }],
  });

  function operationalSpies(storage: any) {
    storage.processDprEquipmentDieselLedger = vi.fn();
    storage.reconcileDprBreakdownsTx = vi.fn();
    storage.finalizeDprEquipmentUsageTx = vi.fn();
    storage.cleanupDprEquipmentDieselLedger = vi.fn();
    return {
      diesel: storage.processDprEquipmentDieselLedger,
      maintenance: storage.reconcileDprBreakdownsTx,
      canonicalUsage: storage.finalizeDprEquipmentUsageTx,
      cleanup: storage.cleanupDprEquipmentDieselLedger,
    };
  }

  it("creates an insufficient-stock draft without posting stock, usage, breakdown, movement or billing facts", async () => {
    fx.queue.push([{ id: 4, meterType: "hour_meter", consumptionNorm: 4 }]);
    const storage = new DatabaseStorage();
    const effects = operationalSpies(storage);
    effects.diesel.mockRejectedValue(new Error("insufficient stock must not be consulted for a draft"));

    await expect(storage.createDpr(payload() as any)).resolves.toMatchObject({ id: 91 });
    expect(effects.diesel).not.toHaveBeenCalled();
    expect(effects.maintenance).not.toHaveBeenCalled();
    expect(effects.canonicalUsage).not.toHaveBeenCalled();
    expect(effects.cleanup).not.toHaveBeenCalled();
    // Movement and hire billing consume canonical equipment_usage. With no
    // canonical materialization, the draft creates no source fact for either.
  });

  it("serializes Field Home starts and reuses the existing site/date draft", async () => {
    fx.queue.push([{ id: 7, date: "2026-09-01", site: "SITE A", dprStatus: "draft" }]);
    const storage = new DatabaseStorage();
    const effects = operationalSpies(storage);

    await expect(storage.createDpr(
      payload() as any,
      undefined,
      undefined,
      { reuseExistingDraft: true },
    )).resolves.toMatchObject({ id: 7 });

    expect(tx.execute).toHaveBeenCalled();
    expect(fx.writes).toHaveLength(0);
    expect(effects.diesel).not.toHaveBeenCalled();
    expect(effects.maintenance).not.toHaveBeenCalled();
    expect(effects.canonicalUsage).not.toHaveBeenCalled();
  });

  it("repeatedly replaces the same canonical draft id with zero operational effects", async () => {
    const storage = new DatabaseStorage();
    storage.getDpr = vi.fn().mockResolvedValue({ id: 7, dprStatus: "draft" });
    const effects = operationalSpies(storage);
    for (let save = 0; save < 2; save++) {
      fx.queue.push(
        [], // old equipment rows
        [], // old progress rows
        [{ id: 4, meterType: "hour_meter", consumptionNorm: 4 }],
      );
      await expect(storage.updateDraftDpr(7, payload() as any)).resolves.toMatchObject({ id: 7 });
    }
    expect(storage.getDpr).toHaveBeenCalledTimes(2);
    expect(effects.diesel).not.toHaveBeenCalled();
    expect(effects.maintenance).not.toHaveBeenCalled();
    expect(effects.canonicalUsage).not.toHaveBeenCalled();
    expect(effects.cleanup).not.toHaveBeenCalled();
  });

  it("rolls an insufficient submit back exactly, then posts operational effects once on retry", async () => {
    const storage = new DatabaseStorage();
    storage.getDpr = vi.fn().mockResolvedValue({ id: 7, dprStatus: "draft" });
    const effects = operationalSpies(storage);
    const insufficient = new InsufficientPlantStockError({
      material: "Diesel",
      materialId: 1,
      requestedQty: 50,
      availableQty: 20,
      shortageQty: 30,
      source: "plant_stock",
    });
    effects.diesel.mockRejectedValueOnce(insufficient).mockResolvedValueOnce(undefined);

    const queueSubmitReads = () => fx.queue.push(
      [], // cleanup is mocked; old equipment rows
      [], // old progress rows
      [{ id: 4, meterType: "hour_meter", consumptionNorm: 4 }],
    );
    queueSubmitReads();
    const before = [...fx.writes];
    await expect(storage.submitDraftDpr(7, payload("submitted") as any)).rejects.toBe(insufficient);
    expect(fx.writes).toEqual(before);
    expect(effects.maintenance).not.toHaveBeenCalled();
    expect(effects.canonicalUsage).not.toHaveBeenCalled();

    queueSubmitReads();
    await expect(storage.submitDraftDpr(7, payload("submitted") as any)).resolves.toMatchObject({
      id: 7,
      dprStatus: "submitted",
    });
    expect(effects.diesel).toHaveBeenCalledTimes(2);
    expect(effects.maintenance).toHaveBeenCalledTimes(1);
    expect(effects.canonicalUsage).toHaveBeenCalledTimes(1);
    expect(effects.cleanup).toHaveBeenCalledTimes(2);
  });
});

describe("all DPR write paths and route authorization remain wired", () => {
  const source = fs.readFileSync("server/storage.ts", "utf8");
  it.each(["createDpr", "_replaceDprChildRecords", "updateDpr", "cloneDpr", "createVersionDpr"])(
    "%s calls the one DPR normalizer",
    (name) => {
      const start = source.indexOf(`async ${name}(`);
      expect(start).toBeGreaterThan(-1);
      expect(source.slice(start, source.indexOf("\n  async ", start + 10)))
        .toContain("normaliseDprEquipmentRowsTx");
    },
  );

  it("materialization carries tank facts and canonical quantity without direct stock posting", () => {
    const start = source.indexOf("private async finalizeDprEquipmentUsageTx");
    const body = source.slice(start, source.indexOf("\n  async ", start + 10));
    expect(body).toContain("dieselBalanceConfirmed");
    expect(body).toContain("log.hoursWorked ?? log.totalKm");
    expect(body).not.toContain("processDprEquipmentDieselLedger");
  });

  it("clone finalizes linkage but never posts a second diesel ledger", () => {
    const start = source.indexOf("async cloneDpr(");
    const body = source.slice(start, source.indexOf("\n  async ", start + 10));
    expect(body).toContain("finalizeDprEquipmentUsageTx");
    expect(body).toContain("preserveLinkedClone: true");
    expect(body).toContain("cloneSourceLogIds");
    expect(body).not.toContain("processDprEquipmentDieselLedger");
  });

  it("route requires DPR view, current site, and passes resolved site scope to storage", () => {
    const routes = fs.readFileSync("server/routes.ts", "utf8");
    const start = routes.indexOf('app.get("/api/equipment/:equipmentId/latest-confirmed-diesel-tank"');
    const body = routes.slice(start, routes.indexOf("\n  });", start) + 6);
    expect(body).toContain('assertView(req, res, "site_dprs")');
    expect(body).toContain("req.query.site");
    expect(body).toContain("assertTripSiteAccess");
    expect(body).toContain("{ siteName, permittedSiteNames }");
  });

  it("keeps start identity and draft state transitions inside transaction guards", () => {
    expect(source).toContain("pg_advisory_xact_lock(1437");
    expect(source).toContain('and(eq(dprs.id, id), eq(dprs.dprStatus, "draft"))');
  });
});