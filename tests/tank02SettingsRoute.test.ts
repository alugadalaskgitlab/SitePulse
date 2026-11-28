import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_DIP_WATCH } from "../shared/tankBookStock";
const fx = vi.hoisted(() => ({ owner: true, current: null as any, save: vi.fn(), decant: vi.fn(), after: vi.fn() }));
vi.mock("../server/tankDipNotifications", () => ({ notifyPlantLogStart: vi.fn().mockResolvedValue(undefined), notifyTankAfterReceipt: fx.after }));
vi.mock("../server/auth", async original => {
  const actual = await original<typeof import("../server/auth")>();
  const auth = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, fullName: "Fixture Owner", isOwner: fx.owner, isAdmin: true, isActive: true };
    req.authPermissions = {}; next();
  };
  return { ...actual, optionalAuth: auth, requireAuth: auth };
});
vi.mock("../server/storage", async original => ({
  ...await original<typeof import("../server/storage")>(),
  storage: new Proxy({}, { get: (_target, key) => key === "getPlantSettings" ? vi.fn(async () => fx.current) :
    key === "upsertPlantSettings" ? fx.save : key === "decantPackedStock" ? fx.decant : vi.fn().mockResolvedValue([]) }),
}));
vi.mock("../server/push", () => ({ sendPushToAll: vi.fn(), sendPushToSection: vi.fn(), sendPushToRaiser: vi.fn(), sendPushToAudience: vi.fn(), sendPushToUser: vi.fn(), initPush: vi.fn() }));
let app: express.Express;
beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express(); app.use(express.json()); await registerRoutes(createServer(app), app);
});
beforeEach(() => {
  fx.owner = true; fx.current = null; fx.save.mockReset().mockImplementation(async row => row);
  fx.decant.mockReset(); fx.after.mockReset().mockResolvedValue(undefined);
});
it("requests an after-dip only after the real decant route has saved successfully", async () => {
  const body = { date: "2026-11-28", time: "09:00", materialId: 41, partyId: null, packedCount: 6, quantity: 1200, tankNumber: 1 };
  fx.decant.mockResolvedValue({ movedQuantity: 1200, uom: "L" });
  const response = await request(app).post("/api/plant-module/packed-stock-decants").send(body);
  expect(response.status).toBe(201);
  expect(response.body).toEqual({ movedQuantity: 1200, uom: "L" });
  expect(fx.after).toHaveBeenCalledWith({ materialId: 41, tankNumber: 1, date: "2026-11-28", actorUserId: 9 });
});
it("does not request an after-dip when decant saving fails", async () => {
  fx.decant.mockRejectedValue(new Error("Not enough packed stock"));
  const response = await request(app).post("/api/plant-module/packed-stock-decants").send({
    date: "2026-11-28", time: "09:00", materialId: 41, partyId: null, packedCount: 6, quantity: 1200, tankNumber: 1,
  });
  expect(response.status).toBe(400); expect(fx.after).not.toHaveBeenCalled();
});
it("refuses non-Owners even if they are Administrators", async () => {
  fx.owner = false;
  expect((await request(app).patch("/api/plant-module/plant-settings/Plant%20A/dip-watch").send(DEFAULT_DIP_WATCH)).status).toBe(403);
  expect(fx.save).not.toHaveBeenCalled();
});
it("uses existing settings JSON and preserves all calibration/operational settings", async () => {
  const geometry = { shape: "horizontal_cylinder", diameterCm: 200, lengthCm: 1000 };
  fx.current = { plantName: "Plant A", siteId: 7, primaryPartyId: 8, bitumenDensityKgPerL: 1.03, dgProductionEquipmentIds: "[5]", boilerFuelMeterMode: "not_working", tankConfig: JSON.stringify({ bitumen1: geometry }) };
  const response = await request(app).patch("/api/plant-module/plant-settings/Plant%20A/dip-watch").send(DEFAULT_DIP_WATCH);
  expect(response.status).toBe(200);
  const saved = fx.save.mock.calls[0][0];
  expect({ ...saved, tankConfig: fx.current.tankConfig }).toEqual(fx.current);
  expect(JSON.parse(saved.tankConfig)).toEqual({ bitumen1: geometry, dipWatch: DEFAULT_DIP_WATCH });
});
it.each([{ ldoAllowedDifferenceL: -1 }, { repeatHours: 0 }, { firstReminder: "20:00" }, { lastReminder: "25:00" }, { unknown: true }])("rejects invalid settings without saving: %s", async extra => {
  expect((await request(app).patch("/api/plant-module/plant-settings/Plant%20A/dip-watch").send({ ...DEFAULT_DIP_WATCH, ...extra })).status).toBe(400);
  expect(fx.save).not.toHaveBeenCalled();
});
