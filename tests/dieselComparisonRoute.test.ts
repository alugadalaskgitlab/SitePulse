import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx = { user: null as null | { id: number; isAdmin: boolean; isOwner?: boolean }, permissions: {} as Record<string, Record<string, boolean>> };
vi.mock("../server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fx.user; req.authPermissions = fx.permissions; next();
  };
  return { ...original, requireAuth: inject, optionalAuth: inject };
});
describe("DIESEL-05 real daily route", () => {
  const daily = "/api/diesel-requirements/daily-report?from=2026-09-10&to=2026-09-16";
  it("returns seven groups, filtered totals, and unchanged comparison values", async () => {
    const result = await request(app).get(daily);
    expect(result.status).toBe(200);
    expect(result.body.groups).toHaveLength(7);
    expect(result.body.totals).toEqual({ planned: 160, purchased: 160, issued: 60, issueCount: 2 });
    expect(result.body.groups[0]).toEqual({ date: "2026-09-10", rows: [], issueCount: 0 });
    expect((await request(app).get(`${daily}&equipmentId=1`)).body).toEqual(result.body);
    const empty = await request(app).get(`${daily}&equipmentId=999`);
    expect(empty.body.groups).toHaveLength(7);
    expect(empty.body.totals).toEqual({ planned: 0, purchased: 0, issued: 0, issueCount: 0 });
    const comparison = await request(app).get(path);
    expect(comparison.body.equipmentWise[0].actual).toBe(result.body.totals.issued);
  });
  it("validates dates/IDs and explicitly rejects unsupported location filtering before storage", async () => {
    for (const url of [
      "/api/diesel-requirements/daily-report?from=2026-09-31&to=2026-10-01",
      "/api/diesel-requirements/daily-report?from=2026-09-16&to=2026-09-15",
      "/api/diesel-requirements/daily-report",
      `${daily}&equipmentId=0`, `${daily}&equipmentId=-1`, `${daily}&equipmentId=1x`,
      `${daily}&equipmentId=1.5`, `${daily}&equipmentId=1&equipmentId=2`,
      `${daily}&equipmentId=9007199254740992`, `${daily}&locationId=1`,
      `${daily}&locationId=bad`, `${daily}&locationId=`,
    ]) expect((await request(app).get(url)).status).toBe(400);
    expect(storage.getDieselComparisonReport).not.toHaveBeenCalled();
    expect(storage.getDieselComparisonEquipmentSources).not.toHaveBeenCalled();
  });
  it("matches comparison authentication and denied-view errors without aggregation", async () => {
    for (const user of [null, { id: 7, isAdmin: false }]) {
      fx.user = user;
      fx.permissions = {};
      const dailyResult = await request(app).get(daily);
      const existing = await request(app).get(path);
      expect(dailyResult.status).toBe(user ? 403 : 401);
      expect(dailyResult.body).toEqual(existing.body);
    }
    expect(storage.getDieselComparisonReport).not.toHaveBeenCalled();
    expect(storage.getDieselComparisonEquipmentSources).not.toHaveBeenCalled();
  });
  it.each([
    ["site_diesel", "view"], ["stores_inventory", "view"],
    ["site_diesel", "create"], ["site_diesel", "edit"],
    ["diesel_req_raise", "view"], ["diesel_req_raise", "create"], ["diesel_req_raise", "edit"],
  ])("allows existing permission %s.%s without setup", async (section, action) => {
    fx.permissions = { [section]: { [action]: true } };
    expect((await request(app).get(daily)).status).toBe(200);
    expect((await request(app).get(path)).status).toBe(200);
  });
  it("allows administrators without a new permission", async () => {
    fx.user = { id: 7, isAdmin: true }; fx.permissions = {};
    expect((await request(app).get(daily)).status).toBe(200);
  });
  it("allows owners but does not substitute view_reports for the existing view gate", async () => {
    fx.user = { id: 7, isAdmin: false, isOwner: true }; fx.permissions = {};
    expect((await request(app).get(daily)).status).toBe(200);
    fx.user = { id: 7, isAdmin: false };
    fx.permissions = { site_diesel: { view_reports: true } };
    const result = await request(app).get(daily);
    expect(result.status).toBe(403);
    expect(result.body).toEqual((await request(app).get(path)).body);
  });
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