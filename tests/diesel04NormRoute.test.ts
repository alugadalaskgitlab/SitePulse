import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx = { user: null as null | { id: number; isAdmin: boolean; isOwner: boolean },
  permissions: {} as Record<string, Record<string, boolean>>, norm: null as number | null,
  plantName: null as string | null, permitted: null as number[] | null,
  plantSiteId: 81 as number | null, plantExists: true };
vi.mock("../server/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = fx.user;
    req.authPermissions = fx.permissions;
    next();
  };
  return { ...original, requireAuth: inject, optionalAuth: inject };
});
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(), sendPushToAudience: vi.fn(), sendPushToSection: vi.fn(),
  sendPushToRaiser: vi.fn(), sendTestPush: vi.fn(),
}));
vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {};
  const storage = new Proxy(methods, {
    get(target, key: string) {
      if (!(key in target)) target[key] = vi.fn().mockResolvedValue([]);
      return target[key];
    },
  });
  methods.updateEquipment = vi.fn(async (id: number, changes: { consumptionNorm: number }) => {
    if (id !== 17) return undefined;
    fx.norm = changes.consumptionNorm;
    return { id, consumptionNorm: fx.norm };
  });
  methods.getEquipmentMaster = vi.fn(async () => [{ id: 17, consumptionNorm: fx.norm, plantName: fx.plantName }]);
  methods.getUserPermittedSiteIds = vi.fn(async () => fx.permitted);
  methods.getPlantSettings = vi.fn(async () => fx.plantExists ? { siteId: fx.plantSiteId } : null);
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
  fx.user = { id: 51, isAdmin: false, isOwner: false };
  fx.permissions = {};
  fx.norm = null;
  fx.plantName = null;
  fx.permitted = null;
  fx.plantSiteId = 81;
  fx.plantExists = true;
  storage.updateEquipment.mockClear();
});

const url = "/api/diesel-requirements/equipment/17/consumption-norm";
describe("DIESEL-04 narrow norm write", () => {
  it("denies anonymous, viewing-only, and unrelated master permissions", async () => {
    fx.user = null;
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(401);
    fx.user = { id: 51, isAdmin: false, isOwner: false };
    for (const permissions of [{ site_diesel: { view: true } }, { master_equipment: { edit: true } }]) {
      fx.permissions = permissions;
      expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(403);
    }
    expect(storage.updateEquipment).not.toHaveBeenCalled();
  });
  it("allows diesel create or edit grants; only updates the norm; re-fetches the master", async () => {
    for (const permissions of [
      { site_diesel: { create: true } },
      { diesel_req_raise: { create: true } },
      { site_diesel: { edit: true } },
      { diesel_req_raise: { edit: true } },
    ]) {
      fx.permissions = permissions;
      const response = await request(app).patch(url).send({ consumptionNorm: 3.25 });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toEqual({ id: 17, consumptionNorm: 3.25 });
      expect(storage.updateEquipment).toHaveBeenLastCalledWith(17, { consumptionNorm: 3.25 });
      expect((await storage.getEquipmentMaster())[0].consumptionNorm).toBe(3.25);
    }
  });
  it("rejects invalid bodies and unknown equipment without altering the master", async () => {
    fx.permissions = { diesel_req_raise: { create: true } };
    for (const body of [{ consumptionNorm: 0 }, { consumptionNorm: -2 }, { consumptionNorm: "3" },
      { consumptionNorm: null }, { consumptionNorm: 3, name: "tamper" }, {}, { consumptionNorm: 1e309 }]) {
      expect((await request(app).patch(url).send(body)).status).toBe(400);
    }
    expect(storage.updateEquipment).not.toHaveBeenCalled();
    expect((await request(app).patch("/api/diesel-requirements/equipment/999/consumption-norm").send({ consumptionNorm: 3 })).status).toBe(404);
  });
  it("surfaces storage failure and leaves the master unchanged", async () => {
    fx.permissions = { site_diesel: { create: true } };
    storage.updateEquipment.mockRejectedValueOnce(new Error("write failed"));
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(500);
    expect((await storage.getEquipmentMaster())[0].consumptionNorm).toBeNull();
  });
  it("honours restricted site scope for plant-assigned equipment", async () => {
    fx.permissions = { site_diesel: { create: true } };
    fx.plantName = "Plant A";
    fx.permitted = [82];
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(403);
    expect(storage.updateEquipment).not.toHaveBeenCalled();
    fx.permitted = [81];
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(200);
    expect(storage.getPlantSettings).toHaveBeenCalledWith("Plant A");
  });
  it("denies zero permitted sites even for shared equipment and plant-assigned equipment", async () => {
    fx.permissions = { site_diesel: { create: true } };
    fx.permitted = [];
    for (const plantName of [null, "Plant A"]) {
      fx.plantName = plantName;
      expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(403);
    }
    expect(storage.updateEquipment).not.toHaveBeenCalled();
  });
  it("denies restricted writes when plant mapping is missing, site-null, or equipment is unassigned", async () => {
    fx.permissions = { diesel_req_raise: { edit: true } };
    fx.permitted = [81];
    fx.plantName = "Plant A";
    fx.plantExists = false;
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(403);
    fx.plantExists = true;
    fx.plantSiteId = null;
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(403);
    fx.plantName = null;
    expect((await request(app).patch(url).send({ consumptionNorm: 3 })).status).toBe(403);
    expect(storage.updateEquipment).not.toHaveBeenCalled();
  });
});