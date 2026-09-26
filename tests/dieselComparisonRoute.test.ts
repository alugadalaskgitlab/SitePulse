import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx = { user: null as null | { id: number; isAdmin: boolean }, permissions: {} as Record<string, Record<string, boolean>> };
vi.mock("../server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fx.user; req.authPermissions = fx.permissions; next();
  };
  return { ...original, requireAuth: inject, optionalAuth: inject };
});
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn(), sendPushToRaiser: vi.fn(), sendTestPush: vi.fn(),
}));
vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {};
  const storage = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
      return target[key];
    },
  });
  methods.getDieselComparisonReport = vi.fn(async () => [
    { date: "2026-09-15", totalPlanned: 100, totalPurchased: 100, totalActualIssued: 20 },
    { date: "2026-09-16", totalPlanned: 60, totalPurchased: 60, totalActualIssued: 40 },
  ]);
  methods.getDieselComparisonEquipmentSources = vi.fn(async () => ({
    masters: [{ id: 1, name: "Roller", registrationNumber: null }],
    requirements: [{ id: 10, date: "2026-09-15", totalPlanned: 100, qtyPurchased: 100 }, { id: 11, date: "2026-09-16", totalPlanned: 60, qtyPurchased: 60 }],
    items: [{ requirementId: 10, equipmentId: 1, equipmentName: "Roller", plannedQty: 100 }, { requirementId: 11, equipmentId: 1, equipmentName: "Roller", plannedQty: 60 }],
    usage: [{ date: "2026-09-15", equipmentId: 1, dieselIssued: 20 }, { date: "2026-09-16", equipmentId: 1, dieselIssued: 40 }],
    logs: [],
  }));
  return { storage };
});
let app: express.Express;
let storage: any;
beforeAll(async () => {
  ({ storage } = await import("../server/storage"));
  const { registerRoutes } = await import("../server/routes");
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
}, 30000);
beforeEach(() => {
  fx.user = { id: 7, isAdmin: false };
  fx.permissions = { site_diesel: { view: true } };
  storage.getDieselComparisonReport.mockClear();
  storage.getDieselComparisonEquipmentSources.mockClear();
});
const path = "/api/diesel-requirements/comparison?dateFrom=2026-09-15&dateTo=2026-09-16";
describe("DIESEL-04 C real comparison route", () => {
  it("keeps existing date totals and reconciles range and single date", async () => {
    const range = await request(app).get(path);
    expect(range.status).toBe(200);
    expect(range.body.totals).toEqual({ totalPlanned: 160, totalPurchased: 160, totalActual: 60 });
    expect(range.body.equipmentWise).toMatchObject([{ equipmentId: 1, planned: 160, purchased: 160, actual: 60, gapFlag: true }]);
    const single = await request(app).get(`${path}&scopeDate=2026-09-15`);
    expect(single.status).toBe(200);
    expect(single.body.totals).toEqual(range.body.totals);
    expect(single.body.equipmentWise).toMatchObject([{ equipmentId: 1, planned: 100, purchased: 100, actual: 20, gapFlag: true }]);
    expect(storage.getDieselComparisonEquipmentSources).toHaveBeenCalledWith("2026-09-15", "2026-09-16");
  });
  it("rejects invalid dates and out-of-range scope before storage access", async () => {
    for (const url of [
      "/api/diesel-requirements/comparison?dateFrom=2026-09-31&dateTo=2026-10-01",
      "/api/diesel-requirements/comparison?dateFrom=2026-09-16&dateTo=2026-09-15",
      `${path}&scopeDate=2026-09-17`,
    ]) expect((await request(app).get(url)).status).toBe(400);
    expect(storage.getDieselComparisonReport).not.toHaveBeenCalled();
  });
  it("requires authentication and view permission before any aggregation", async () => {
    fx.user = null;
    expect((await request(app).get(path)).status).toBe(401);
    fx.user = { id: 7, isAdmin: false };
    fx.permissions = {};
    expect((await request(app).get(path)).status).toBe(403);
    expect(storage.getDieselComparisonReport).not.toHaveBeenCalled();
  });
});