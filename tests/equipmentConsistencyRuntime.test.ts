import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { meaningfulEquipmentRows, visibleEquipmentRows } from "../shared/equipmentUsage";

const fx = vi.hoisted(() => ({
  queue: [] as any[][],
  writes: [] as any[],
  selectCalls: 0,
  dprListRows: [] as any[],
}));

function query(rows: any[] = []) {
  const q: any = {
    from: () => q, where: () => q, limit: () => q, orderBy: () => q,
    innerJoin: () => q, leftJoin: () => q,
    for: () => q,
    returning: () => Promise.resolve(rows),
    then: (resolve: any) => resolve(rows),
    values: (value: any) => {
      fx.writes.push(value);
      return query(Array.isArray(value)
        ? value.map((row, index) => ({ id: 91 + index, ...row }))
        : [{ id: 91, ...value }]);
    },
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
  query: {
    dprs: {
      findMany: vi.fn(async () => fx.dprListRows),
    },
  },
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
  fx.dprListRows = [];
  vi.clearAllMocks();
});

describe("equipment consistency storage runtime", () => {
  it("create drops only untouched defaults but retains a legacy start-only timestamp", async () => {
    const storage = new DatabaseStorage();
    await storage.createDpr({
      date: "2026-08-21", site: "NoSiteWork", engineer: "Engineer", dprStatus: "draft",
      equipment: [{ machine: "", operator: "Operator name", entryType: "time_meter", diesel: 0 }],
    } as any);
    expect(fx.writes.some((write) => Array.isArray(write))).toBe(false);

    fx.writes = [];
    await storage.createDpr({
      date: "2026-08-21", site: "NoSiteWork", engineer: "Engineer", dprStatus: "draft",
      equipment: [{ machine: "", operator: "Operator name", entryType: "time_meter", startTime: "08:00", diesel: 0 }],
    } as any);
    const equipmentInsert = fx.writes.find((write) => Array.isArray(write));
    expect(equipmentInsert).toEqual([expect.objectContaining({ startTime: "08:00", machine: "" })]);
  });

  it("replacement keeps a persisted blank row when omitted active child evidence is discovered", async () => {
    fx.queue.push(
      [], // equipment_activity_segments
      [], // equipment_activity_allocations
      [{ sourceRecordId: 17 }], // active linked DPR breakdowns
    );
    const storage = new DatabaseStorage();
    const preserved = await (storage as any).preserveOmittedEquipmentAllocationsTx(
      tx,
      [{ id: 17 }],
      [{ persistedId: 17, machine: "", operator: "Operator name", entryType: "time_meter", diesel: 0 }],
    );
    expect(preserved[0]).toMatchObject({ _preserveLinkedChildren: true });
    expect(meaningfulEquipmentRows(preserved)).toHaveLength(1);
  });

  it("list hydration attaches active breakdown evidence before read visibility", async () => {
    fx.dprListRows = [{
      id: 55, date: "2026-08-21", site: "NoSiteWork", engineer: "Engineer",
      equipment: [{
        id: 17, machine: "Operating", vehicleNo: "", operator: "Operator name",
        entryType: "time_meter", startTime: "08:00", endTime: "", hoursWorked: 0, diesel: 0,
        activityAllocations: [], activitySegments: [],
      }],
      progress: [], labour: [], materials: [], sitePurchases: [], structureItems: [],
    }];
    fx.queue.push([{
      id: 71, sourceRecordId: 17, fromTime: "08:15", toTime: "09:00",
      description: "Hydraulic leak", responsibility: "vendor", repairScope: "hose",
      debitableToVendor: true, remarks: "Recorded",
    }]);
    const storage = new DatabaseStorage();
    const [listed] = await storage.getDprsWithDetails();
    expect(listed.equipment[0]).toMatchObject({
      breakdowns: [expect.objectContaining({ maintenanceLogId: 71, description: "Hydraulic leak" })],
    });
    expect(visibleEquipmentRows(listed.equipment)).toHaveLength(1);
  });

  it("clone retains source pairing across leading/interspersed placeholders and child-only evidence", async () => {
    fx.queue.push(
      [{ boqProjectId: 3 }], // source DPR project
      [{ id: 3 }], // locked project
      [{ id: 55, dprStatus: "submitted", boqProjectId: 3 }], // locked DPR
    );
    const storage = new DatabaseStorage();
    vi.spyOn(storage, "getDpr").mockResolvedValue({
      id: 55, date: "2026-08-21", site: "NoSiteWork", engineer: "Engineer",
      dprStatus: "submitted", boqProjectId: 3, progress: [], labour: [], materials: [], sitePurchases: [],
      equipment: [
        { id: 1, machine: "", operator: "Operator name", entryType: "time_meter", diesel: 0 },
        { id: 2, machine: "", operator: "Operator name", entryType: "time_meter", diesel: 0, activityAllocations: [{ boqItemId: 9 }] },
        { id: 3, machine: "", operator: "Operator name", entryType: "time_meter", diesel: 0 },
        { id: 4, machine: "", operator: "Operator name", entryType: "time_meter", diesel: 0, breakdowns: [{ description: "Leak" }] },
      ],
    } as any);
    const normalise = vi.spyOn(storage as any, "normaliseDprEquipmentRowsTx").mockImplementation(async (_tx, rows) => rows);
    vi.spyOn(storage as any, "persistEquipmentActivityAllocationsTx").mockResolvedValue(undefined);
    const reconcile = vi.spyOn(storage as any, "reconcileDprBreakdownsTx").mockResolvedValue(undefined);
    const finalize = vi.spyOn(storage as any, "finalizeDprEquipmentUsageTx").mockResolvedValue(undefined);

    await storage.cloneDpr(55, "manager");

    expect(normalise).toHaveBeenCalledWith(expect.anything(), [
      expect.objectContaining({ id: 2, activityAllocations: [{ boqItemId: 9 }] }),
      expect.objectContaining({ id: 4, breakdowns: [{ description: "Leak" }] }),
    ], 3);
    expect(reconcile).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 4 })],
      [expect.objectContaining({ id: 91 }), expect.objectContaining({ id: 92 })],
      [expect.objectContaining({ id: 2 }), expect.objectContaining({ id: 4 })],
      "2026-08-21",
    );
    expect(finalize).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cloneSourceLogIds: { 91: 2, 92: 4 } }),
    );
  });

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