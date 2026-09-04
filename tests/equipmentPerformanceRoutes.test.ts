import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const spies = vi.hoisted(() => ({
  report: vi.fn(),
  context: vi.fn(),
  confirm: vi.fn(),
  admin: vi.fn(),
  createUsage: vi.fn(),
  permitted: vi.fn(),
  sites: vi.fn(),
}));

vi.mock("../server/storage", () => {
  const ErrorClass = class extends Error {};
  const base: Record<string, any> = {
    getEquipmentPerformanceReport: spies.report,
    getEquipmentPerformanceLogContext: spies.context,
    confirmEquipmentPerformanceLog: spies.confirm,
    createEquipmentUsage: spies.createUsage,
    getUserPermittedSiteIds: spies.permitted,
    getSites: spies.sites,
  };
  return {
    storage: new Proxy(base, {
      get(target, key: string) {
        return key in target ? target[key] : (target[key] = vi.fn().mockResolvedValue([]));
      },
    }),
    StockShortageError: ErrorClass,
    EquipmentIncomingConflictError: ErrorClass,
    InsufficientPlantStockError: ErrorClass,
    InvalidStockTransferQuantityError: ErrorClass,
    InvalidDieselSourceError: ErrorClass,
    DieselReceiptExceedsRemainingError: ErrorClass,
    CutFillInsufficientAvailabilityError: ErrorClass,
    CutFillValidationError: ErrorClass,
    AttachmentReferenceError: ErrorClass,
    InvalidDieselPhysicalStockError: ErrorClass,
    assertValidDieselPhysicalStock: vi.fn(),
  };
});
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn(),
  sendPushToRaiser: vi.fn(), sendTestPush: vi.fn(),
}));
vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).authUser = { id: 7, isAdmin: false, role: "engineer" };
    next();
  },
  isPublicApiPath: () => false, isOptionalAuthPath: () => false,
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  lookupSessionFromCookie: vi.fn(), loadUserPermissionsMatrix: vi.fn(),
}));
vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(), assertCreate: () => true, assertEdit: () => true,
    assertAdmin: (_req: Request, res: Response) => {
      const allowed = spies.admin();
      if (!allowed) res.status(403).json({ error: "admin_required" });
      return allowed;
    },
    assertView: () => true, assertAuthed: () => true,
  assertCreateOrEdit: () => true, assertCreateEither: () => true, assertApprove: () => true,
  assertDeleteOrCancel: () => true, currentUserName: () => "Route Tester",
}));

import { registerRoutes } from "../server/routes";

let app: express.Express;
beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
});
beforeEach(() => {
  vi.clearAllMocks();
  spies.report.mockResolvedValue({ events: [], fleet: [], projects: [] });
  spies.context.mockResolvedValue({ id: 91, site: "Site A", equipmentId: null });
  spies.confirm.mockResolvedValue({ id: 91, equipmentId: 4, plantUsageId: null });
  spies.admin.mockReturnValue(true);
  spies.permitted.mockResolvedValue([1]);
  spies.sites.mockResolvedValue([{ id: 1, name: "Site A" }]);
});

describe("EQUIP-01 routes", () => {
  it("passes report filters through the read-only report route", async () => {
    const response = await request(app).get("/api/reports/equipment-performance?projectId=10&scope=site&dateFrom=2026-01-01");
    expect(response.status).toBe(200);
    expect(spies.report).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 10, scope: "site", dateFrom: "2026-01-01",
    }), { permittedSiteNames: ["Site A"] });
    expect(spies.confirm).not.toHaveBeenCalled();
    expect(spies.createUsage).not.toHaveBeenCalled();
  });

  it("passes a restricted caller's permitted sites to the report loader", async () => {
    spies.permitted.mockResolvedValue([2]);
    spies.sites.mockResolvedValue([{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }]);
    const response = await request(app).get("/api/reports/equipment-performance");
    expect(response.status).toBe(200);
    expect(spies.report).toHaveBeenCalledWith(expect.any(Object), { permittedSiteNames: ["Site B"] });
  });

  it("confirms only the selected log identity and never creates usage", async () => {
    const response = await request(app)
      .post("/api/reports/equipment-performance/logs/91/confirm")
      .send({ equipmentId: 4 });
    expect(response.status).toBe(200);
    expect(spies.confirm).toHaveBeenCalledWith(91, 4, expect.objectContaining({
      userId: 7, userName: "Route Tester",
    }));
    expect(spies.createUsage).not.toHaveBeenCalled();
  });

  it("requires an owner or administrator for historical classification", async () => {
    spies.admin.mockReturnValue(false);
    const response = await request(app)
      .post("/api/reports/equipment-performance/logs/91/confirm")
      .send({ equipmentId: 4 });
    expect(response.status).toBe(403);
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("never allows a canonical-linked DPR log to be reclassified", async () => {
    spies.context.mockResolvedValue({ id: 91, site: "Site A", equipmentId: 4, plantUsageId: 700 });
    const response = await request(app)
      .post("/api/reports/equipment-performance/logs/91/confirm")
      .send({ equipmentId: 2 });
    expect(response.status).toBe(409);
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("rejects inactive/missing log context before writing", async () => {
    spies.context.mockResolvedValue(undefined);
    const response = await request(app)
      .post("/api/reports/equipment-performance/logs/91/confirm")
      .send({ equipmentId: 4 });
    expect(response.status).toBe(404);
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it("enforces the log's site scope before confirmation", async () => {
    spies.permitted.mockResolvedValue([2]);
    spies.sites.mockResolvedValue([{ id: 1, name: "Site A" }, { id: 2, name: "Site B" }]);
    const response = await request(app)
      .post("/api/reports/equipment-performance/logs/91/confirm")
      .send({ equipmentId: 4 });
    expect(response.status).toBe(403);
    expect(spies.confirm).not.toHaveBeenCalled();
  });
});