import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const fx = vi.hoisted(() => ({
  existing: {
    id: 33,
    equipmentId: 5,
    equipmentName: "600 KVA DG",
    date: "2026-11-22",
    plantName: "HMP Plant",
    entryType: "time_meter",
    dieselSource: null as string | null,
    dieselIssued: 0,
    openingReading: 100,
    closingReading: 105,
    openingDiesel: 80,
    dieselBalanceInTank: 65,
    dieselBalanceConfirmed: true,
  },
  updates: [] as Array<{ id: number; input: Record<string, unknown> }>,
  creates: [] as Array<Record<string, unknown>>,
}));

vi.mock("../server/push", () => ({
  sendPushToAll: vi.fn().mockResolvedValue(undefined),
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  sendPushToSection: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: vi.fn(() => true),
  assertEdit: vi.fn(() => true),
  assertCreate: vi.fn(() => true),
  assertView: vi.fn(() => true),
  assertAuthed: vi.fn(() => ({ id: 1, name: "Owner test" })),
  currentUserName: vi.fn(() => "Owner test"),
  claimUnlockOrLockedRow: vi.fn().mockResolvedValue({ locked: false }),
  lockNewRow: vi.fn().mockResolvedValue(undefined),
  relockResource: vi.fn().mockResolvedValue(undefined),
  assertWritable: vi.fn().mockResolvedValue(true),
  LOCKABLE_TABLE_NAMES: {},
}));

vi.mock("../server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/auth")>();
  const inject = (req: any, _res: any, next: any) => {
    req.authUser = {
      id: 1,
      username: "owner-test",
      isAdmin: true,
      isOwner: true,
      isActive: true,
    };
    req.authPermissions = {};
    req.authFeatureAccess = { rolesConfigured: false };
    next();
  };
  return { ...actual, requireAuth: inject, optionalAuth: inject };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, any> = {};
  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue([]);
      return target[prop];
    },
  });
  methods.getDprs = vi.fn(async () => [{ id: 1 }]);
  methods.createNotification = vi.fn(async () => ({}));
  methods.getDefaultPlantName = vi.fn(async () => "HMP Plant");
  methods.getPlantSettings = vi.fn(async () => ({ dgProductionEquipmentIds: "[5]" }));
  methods.getEquipmentMaster = vi.fn(async () => [{
    id: 5,
    name: "600 KVA DG",
    equipmentType: "Generator",
    isActive: 1,
    plantName: "HMP Plant",
  }]);
  methods.getEquipmentUsage = vi.fn(async () => [fx.existing]);
  methods.updateEquipmentUsage = vi.fn(async (id: number, input: Record<string, unknown>) => {
    fx.updates.push({ id, input });
    fx.existing = { ...fx.existing, ...input, id } as typeof fx.existing;
    return fx.existing;
  });
  methods.createEquipmentUsage = vi.fn(async (input: Record<string, unknown>) => {
    fx.creates.push(input);
    return { id: 99, ...input };
  });
  return {
    StockShortageError: class StockShortageError extends Error {},
    storage: storageProxy,
  };
});

import { registerRoutes } from "../server/routes";

let agent: request.SuperTest<request.Test>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
  agent = request(app) as any;
});

beforeEach(() => {
  fx.existing = {
    id: 33,
    equipmentId: 5,
    equipmentName: "600 KVA DG",
    date: "2026-11-22",
    plantName: "HMP Plant",
    entryType: "time_meter",
    dieselSource: null,
    dieselIssued: 0,
    openingReading: 100,
    closingReading: 105,
    openingDiesel: 80,
    dieselBalanceInTank: 65,
    dieselBalanceConfirmed: true,
  };
  fx.updates = [];
  fx.creates = [];
});

describe("PLANT-05 DG diesel-filled save", () => {
  it("updates the existing Equipment Usage row and uses the plant-stock issue path", async () => {
    const response = await agent
      .post("/api/plant-module/shift-logs/2026-11-22/dg-readings")
      .send({
        plantName: "HMP Plant",
        readings: [{
          equipmentId: 5,
          openingReading: 100,
          closingReading: 105,
          openingDiesel: 80,
          dieselFilled: 12,
          closingDiesel: 65,
        }],
      });

    expect(response.status).toBe(200);
    expect(fx.updates).toHaveLength(1);
    expect(fx.updates[0].id).toBe(33);
    expect(fx.updates[0].input).toMatchObject({ dieselIssued: 12, dieselSource: "plant_stock" });
    expect(fx.creates).toHaveLength(0);
  });
});
