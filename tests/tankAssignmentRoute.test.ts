import express from "express";
import { createServer } from "node:http";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({ owner: true, assign: vi.fn() }));
vi.mock("../server/auth", async original => {
  const actual = await original<typeof import("../server/auth")>();
  const auth = (req: any, _res: any, next: any) => {
    req.authUser = { id: 9, fullName: "Fixture Owner", isOwner: fx.owner, isAdmin: true, isActive: true };
    req.authPermissions = {};
    next();
  };
  return { ...actual, optionalAuth: auth, requireAuth: auth };
});
vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn(), sendPushToSection: vi.fn(), sendPushToRaiser: vi.fn(), sendPushToAudience: vi.fn(), initPush: vi.fn(),
}));
vi.mock("../server/storage", async original => ({
  ...await original<typeof import("../server/storage")>(),
  storage: new Proxy({}, { get: (_target, key) => key === "assignUnassignedStockToTank" ? fx.assign : vi.fn().mockResolvedValue([]) }),
}));
let app: express.Express;
const body = { date: "2026-11-27", materialId: 41, partyId: 7, tankNumber: 1, amount: 6988.401, uom: "Liters" };
beforeAll(async () => {
  const { registerRoutes } = await import("../server/routes");
  app = express(); app.use(express.json());
  await registerRoutes(createServer(app), app);
});
beforeEach(() => { fx.owner = true; fx.assign.mockReset().mockResolvedValue({ before: {}, after: {} }); });
describe("FIX-BIT-01 tank assignment route", () => {
  const correction = { date: "2026-11-27", materialId: 41, partyId: 7, uom: "MT", actualTank1: 0, actualTank2: 8.615,
    preview: { tank1: 16.59, tank2: -9.41, packed: 0, packedCount: 0, unassigned: 1.435, total: 8.615 } };
  it("accepts a complete correction preview and rejects a non-Owner", async () => {
    expect((await request(app).post("/api/plant-module/tank-assignments").send(correction)).status).toBe(200);
    expect(fx.assign).toHaveBeenCalledWith(correction, { userId: 9, name: "Fixture Owner" });
    fx.owner = false;
    expect((await request(app).post("/api/plant-module/tank-assignments").send(correction)).status).toBe(403);
  });
  it("queues no work for a non-Owner, including an Administrator", async () => {
    fx.owner = false;
    expect((await request(app).post("/api/plant-module/tank-assignments").send(body)).status).toBe(403);
    expect(fx.assign).not.toHaveBeenCalled();
  });
  it("passes an Owner's exact amount and authenticated actor to the transaction", async () => {
    expect((await request(app).post("/api/plant-module/tank-assignments").send(body)).status).toBe(200);
    expect(fx.assign).toHaveBeenCalledWith(body, { userId: 9, name: "Fixture Owner" });
  });
  it("returns a clear stale-preview conflict", async () => {
    fx.assign.mockRejectedValue(Object.assign(new Error("Unassigned stock changed since preview — open the review again."), { code: "STALE_TANK_ASSIGNMENT" }));
    const response = await request(app).post("/api/plant-module/tank-assignments").send(body);
    expect(response.status).toBe(409);
    expect(response.body.message).toContain("open the review again");
  });
  it.each([{ tankNumber: 3 }, { amount: 0 }, { date: "2026-02-30" }, { extra: "not allowed" }])("rejects invalid input: %s", async extra => {
    expect((await request(app).post("/api/plant-module/tank-assignments").send({ ...body, ...extra })).status).toBe(400);
    expect(fx.assign).not.toHaveBeenCalled();
  });
});
