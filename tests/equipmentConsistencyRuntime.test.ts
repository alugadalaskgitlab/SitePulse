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
  transaction: vi.fn(async (fn: any) => fn(tx)),
  select: tx.select,
};
vi.mock("../server/db", () => ({ db: fakeDb }));

let DatabaseStorage: any;
beforeAll(async () => {
  ({ DatabaseStorage } = await import("../server/storage"));
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
});