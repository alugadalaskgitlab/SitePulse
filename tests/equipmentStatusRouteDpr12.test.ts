import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx: { admin: boolean; permissions: Record<string, any> } = {
  admin: false,
  permissions: { equipment_hub: { view: true } },
};

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = {
      id: 12,
      username: "fleet-user",
      fullName: "Fleet User",
      isAdmin: fx.admin,
      isOwner: false,
      isActive: true,
    };
    req.authPermissions = fx.permissions;
    req.session = { role: "user", username: "fleet-user", userId: 12 };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storage = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getUserPermittedSiteIds = vi.fn().mockResolvedValue([]);
  methods.getSites = vi.fn().mockResolvedValue([{ id: 1, name: "SITE A" }]);
  methods.getFleetEquipmentStatus = vi.fn(async (dateFrom, dateTo) => ({
    dateFrom, dateTo, equipment: [],
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
});

beforeEach(() => {
  fx.admin = false;
  fx.permissions = { equipment_hub: { view: true } };
  storage.getUserPermittedSiteIds.mockResolvedValue([]);
  storage.getFleetEquipmentStatus.mockClear();
});

describe("DPR-12 equipment status report route", () => {
  it("accepts any existing fleet visibility section", async () => {
    for (const section of ["equipment_hub", "plant_equipment", "equipment_performance_report"]) {
      fx.permissions = { [section]: { view: true } };
      const response = await request(app)
        .get("/api/reports/equipment-status?dateFrom=2026-09-01&dateTo=2026-09-03");
      expect(response.status).toBe(200);
    }
  });

  it("rejects callers outside all three existing visibility sections", async () => {
    fx.permissions = {};
    const response = await request(app)
      .get("/api/reports/equipment-status?dateFrom=2026-09-01&dateTo=2026-09-03");
    expect(response.status).toBe(403);
  });

  it("passes deny-all site scope as an empty list, never unrestricted null", async () => {
    const response = await request(app)
      .get("/api/reports/equipment-status?dateFrom=2026-09-01&dateTo=2026-09-03");
    expect(response.status).toBe(200);
    expect(storage.getFleetEquipmentStatus).toHaveBeenLastCalledWith(
      "2026-09-01",
      "2026-09-03",
      { permittedSiteNames: [] },
    );
  });

  it("validates both range dates and ordering", async () => {
    expect((await request(app)
      .get("/api/reports/equipment-status?dateFrom=01-09-2026&dateTo=2026-09-03")).status).toBe(400);
    expect((await request(app)
      .get("/api/reports/equipment-status?dateFrom=2026-09-04&dateTo=2026-09-03")).status).toBe(400);
  });
});