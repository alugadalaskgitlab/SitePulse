import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import request from "supertest";

const actor = { permissions: {} as Record<string, Record<string, boolean>>, id: 51, admin: false, owner: false };
vi.mock("../server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = { id: actor.id, username: "synthetic-user", fullName: "Synthetic User", isAdmin: actor.admin, isOwner: actor.owner };
    req.authPermissions = actor.permissions;
    next();
  };
  return { ...original, requireAuth: inject, optionalAuth: inject };
});
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  sendPushToRaiser: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const storage = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
      return target[key];
    },
  });
  methods.createSite = vi.fn(async input => ({ id: 7, ...input }));
  methods.updateSite = vi.fn(async (id, input) => ({ id, ...input }));
  methods.seedSitesFromDprs = vi.fn(async () => 0);
  methods.createPlantReport = vi.fn(async input => ({ id: 7, ...input }));
  methods.updatePlantReport = vi.fn(async (id, input) => ({ id, ...input }));
  methods.createNotification = vi.fn(async input => ({ id: 7, ...input }));
  methods.addVendorAlias = vi.fn(async (canonicalName, alias) => ({ id: 7, canonicalName, alias }));
  methods.upsertVendorRateCard = vi.fn(async input => ({ id: 7, ...input }));
  methods.createConcreteEstimate = vi.fn(async input => ({ id: 7, ...input }));
  methods.getConcreteEstimate = vi.fn(async () => ({ id: 7, createdBy: 51 }));
  methods.updateConcreteEstimate = vi.fn(async (id, input) => ({ id, ...input }));
  methods.createConcreteEstimateV2 = vi.fn(async input => ({ id: 7, ...input }));
  methods.getConcreteEstimateV2 = vi.fn(async () => ({ id: 7, createdBy: 51 }));
  methods.updateConcreteEstimateV2 = vi.fn(async (id, input) => ({ id, ...input }));
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
}, 30_000);
beforeEach(() => {
  actor.permissions = {};
  actor.id = 51;
  actor.admin = false;
  actor.owner = false;
  vi.clearAllMocks();
});

const routes = [
  { method: "post", path: "/api/sites", action: "create", key: "sites_plants_manage", storage: "createSite", body: { name: "Synthetic site" } },
  { method: "patch", path: "/api/sites/7", action: "edit", key: "sites_plants_manage", storage: "updateSite", body: { name: "Synthetic edited site" } },
  { method: "post", path: "/api/sites/seed", action: "create", key: "sites_plants_manage", storage: "seedSitesFromDprs", body: {} },
  { method: "post", path: "/api/plant", action: "create", key: "sites_plants_manage", storage: "createPlantReport", body: { date: "2026-08-15", siteName: "Synthetic site", production: [] } },
  { method: "patch", path: "/api/plant/7", action: "edit", key: "sites_plants_manage", storage: "updatePlantReport", body: { date: "2026-08-15", siteName: "Synthetic site", production: [] } },
  { method: "post", path: "/api/vendor-aliases", action: "create", key: "vendor_masters_manage", storage: "addVendorAlias", body: { canonicalName: "Synthetic supplier", alias: "Synthetic alternate" } },
  { method: "post", path: "/api/vendor-rate-cards", action: "create", key: "vendor_masters_manage", storage: "upsertVendorRateCard", body: { vendorName: "Synthetic supplier", rate: 10 } },
  { method: "post", path: "/api/vendor-rate-cards/bulk-upsert", action: "create", key: "vendor_masters_manage", storage: "upsertVendorRateCard", body: { items: [{ vendorName: "Synthetic supplier", rate: 10 }] } },
  { method: "post", path: "/api/concrete-estimates", action: "create", key: "concrete_estimates_manage", storage: "createConcreteEstimate", body: { name: "Synthetic estimate", state: {} } },
  { method: "patch", path: "/api/concrete-estimates/7", action: "edit", key: "concrete_estimates_manage", storage: "updateConcreteEstimate", body: { name: "Synthetic revision" } },
  { method: "post", path: "/api/concrete/v2/estimates", action: "create", key: "concrete_estimates_manage", storage: "createConcreteEstimateV2", body: { name: "Synthetic estimate v2", state: {} } },
  { method: "patch", path: "/api/concrete/v2/estimates/7", action: "edit", key: "concrete_estimates_manage", storage: "updateConcreteEstimateV2", body: { name: "Synthetic revision v2" } },
  { method: "post", path: "/api/notifications", action: "create", key: "admin_notifications_manage", storage: "createNotification", body: { type: "info", title: "Synthetic notice", message: "Synthetic message" } },
] as const;

async function call(route: typeof routes[number]) {
  return request(app)[route.method](route.path).send(route.body);
}

describe("PERM-01 B: actual handlers with mocked storage (no business DB writes)", () => {
  it.each(routes)("$method $path honors the precise action, legacy action, and rejects unrelated grants", async route => {
    actor.permissions = { [route.key]: { [route.action]: true } };
    expect((await call(route)).status).toBeLessThan(300);
    expect(storage[route.storage]).toHaveBeenCalled();
    vi.clearAllMocks();

    actor.permissions = { admin_settings: { [route.action]: true } };
    expect((await call(route)).status).toBeLessThan(300);
    expect(storage[route.storage]).toHaveBeenCalled();
    vi.clearAllMocks();

    actor.permissions = { [route.key]: { [route.action === "create" ? "edit" : "create"]: true } };
    expect((await call(route)).status).toBe(403);
    expect(storage[route.storage]).not.toHaveBeenCalled();
    actor.permissions = { sites_plants_manage: { create: true, edit: true } };
    if (route.key !== "sites_plants_manage") {
      expect((await call(route)).status).toBe(403);
      expect(storage[route.storage]).not.toHaveBeenCalled();
    }
  });

  it("sites/plants-only grants all five site and plant actions but none of other three capabilities", async () => {
    actor.permissions = { sites_plants_manage: { create: true, edit: true } };
    for (const route of routes) {
      expect((await call(route)).status).toBe(route.key === "sites_plants_manage"
        ? route.path === "/api/sites/seed" ? 200 : route.action === "create" ? 201 : 200
        : 403);
    }
  });

  it("retains estimate ownership and admin-only deletions independently of granular access", async () => {
    actor.permissions = { concrete_estimates_manage: { create: true, edit: true }, sites_plants_manage: { create: true, edit: true } };
    actor.id = 52;
    for (const path of ["/api/concrete-estimates/7", "/api/concrete/v2/estimates/7"]) {
      expect((await request(app).patch(path).send({ name: "Synthetic revision" })).status).toBe(403);
    }
    expect(storage.updateConcreteEstimate).not.toHaveBeenCalled();
    expect(storage.updateConcreteEstimateV2).not.toHaveBeenCalled();
    expect((await request(app).delete("/api/sites/7")).status).toBe(403);
    expect((await request(app).delete("/api/concrete-estimates/7")).status).toBe(403);
  });
});