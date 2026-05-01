import { vi, describe, it, expect, beforeAll } from "vitest";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import { createServer } from "http";
import request from "supertest";

const { sendPushToAllSpy, createBitumenSpy, createLdoSpy, updateBitumenSpy, updateLdoSpy } = vi.hoisted(() => {
  return {
    sendPushToAllSpy: vi.fn().mockResolvedValue(undefined),
    createBitumenSpy: vi.fn().mockResolvedValue({
      id: 1,
      date: "2024-01-15",
      time: null,
      tankNumber: 1,
      depthCm: 82.5,
      volumeLiters: 1000,
      weightKg: 1030,
      readingType: "manual",
      notes: null,
      plantName: "Main Plant",
      sourceShiftLogId: null,
      createdAt: new Date(),
    }),
    createLdoSpy: vi.fn().mockResolvedValue({
      id: 2,
      date: "2024-01-15",
      time: null,
      tankNumber: 1,
      depthCm: 82.5,
      volumeLiters: 900,
      weightKg: 720,
      readingType: "manual",
      notes: null,
      plantName: "Main Plant",
      sourceShiftLogId: null,
      createdAt: new Date(),
    }),
    updateBitumenSpy: vi.fn().mockResolvedValue({
      id: 1,
      date: "2024-01-15",
      time: null,
      tankNumber: 2,
      depthCm: 75.0,
      volumeLiters: 950,
      weightKg: 978.5,
      readingType: "manual",
      notes: null,
      plantName: "Main Plant",
      sourceShiftLogId: null,
      createdAt: new Date(),
    }),
    updateLdoSpy: vi.fn().mockResolvedValue({
      id: 2,
      date: "2024-01-15",
      time: null,
      tankNumber: 2,
      depthCm: 60.0,
      volumeLiters: 800,
      weightKg: 640,
      readingType: "manual",
      notes: null,
      plantName: "Main Plant",
      sourceShiftLogId: null,
      createdAt: new Date(),
    }),
  };
});

vi.mock("../server/storage", () => {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {
    createBitumenDipReading: createBitumenSpy,
    createLdoDipReading: createLdoSpy,
    updateBitumenDipReading: updateBitumenSpy,
    updateLdoDipReading: updateLdoSpy,
  };

  const storageProxy = new Proxy(methods, {
    get(target, prop: string) {
      if (!(prop in target)) {
        target[prop] = vi.fn().mockResolvedValue([]);
      }
      return target[prop];
    },
  });

  return {
    StockShortageError: class StockShortageError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "StockShortageError";
      }
    },
    storage: storageProxy,
  };
});

vi.mock("../server/push", () => ({
  sendPushToAll: sendPushToAllSpy,
  sendTestPush: vi.fn().mockResolvedValue(undefined),
  sendPushToAudience: vi.fn().mockResolvedValue(undefined),
  initPush: vi.fn(),
}));

vi.mock("../server/auth", () => ({
  requireAuth: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  isPublicApiPath: vi.fn().mockReturnValue(false),
  parseCookie: vi.fn(),
  signToken: vi.fn(),
  verifySignedToken: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  setDeviceCookie: vi.fn(),
  clearDeviceCookie: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
  setUserPermissions: vi.fn(),
  userHasPermission: vi.fn(),
  toSafeUser: vi.fn(),
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserByPhone: vi.fn(),
  ensureBootstrapAdmin: vi.fn(),
  backfillSplitPermissions: vi.fn(),
  migrateEmailPhoneSchema: vi.fn(),
  backfillPlantSubPermissions: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: vi.fn().mockReturnValue(true),
  assertEdit: vi.fn().mockReturnValue(true),
  assertView: vi.fn().mockReturnValue(true),
  assertAuthed: vi.fn().mockReturnValue({ id: 1, name: "test-user", role: "admin" }),
  assertCreate: vi.fn().mockReturnValue(true),
  currentUserName: vi.fn().mockReturnValue("test-user"),
  claimUnlockOrLockedRow: vi.fn().mockResolvedValue({ locked: false }),
  lockNewRow: vi.fn().mockResolvedValue(undefined),
  relockResource: vi.fn().mockResolvedValue(undefined),
  assertWritable: vi.fn().mockResolvedValue(true),
  LOCKABLE_TABLE_NAMES: {},
}));

import { registerRoutes } from "../server/routes";

let app: express.Express;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

const VALID_BITUMEN_BODY = {
  date: "2024-01-15",
  tankNumber: 1,
  depthCm: 82.5,
  volumeLiters: 1000,
  weightKg: 1030,
  readingType: "manual",
  plantName: "Main Plant",
};

const VALID_LDO_BODY = {
  date: "2024-01-15",
  tankNumber: 1,
  depthCm: 82.5,
  volumeLiters: 900,
  weightKg: 720,
  readingType: "manual",
  plantName: "Main Plant",
};

describe("Dip reading push notification body", () => {
  it("bitumen POST sends notification body with actual depthCm, not 'undefined'", async () => {
    sendPushToAllSpy.mockClear();

    const res = await request(app)
      .post("/api/plant-module/bitumen-dip-readings")
      .send(VALID_BITUMEN_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);

    const calls = sendPushToAllSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [title, body] = calls[0];
    expect(title).toBe("Bitumen Dip Reading");
    expect(body).not.toContain("undefined");
    expect(body).toBe(`Tank ${VALID_BITUMEN_BODY.tankNumber} - ${VALID_BITUMEN_BODY.depthCm}cm`);
  });

  it("LDO POST sends notification body with actual depthCm, not 'undefined'", async () => {
    sendPushToAllSpy.mockClear();

    const res = await request(app)
      .post("/api/plant-module/ldo-dip-readings")
      .send(VALID_LDO_BODY)
      .set("Content-Type", "application/json");

    expect(res.status).toBe(201);

    const calls = sendPushToAllSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [title, body] = calls[0];
    expect(title).toBe("LDO Dip Reading");
    expect(body).not.toContain("undefined");
    expect(body).toBe(`Tank ${VALID_LDO_BODY.tankNumber} - ${VALID_LDO_BODY.depthCm}cm`);
  });

  it("bitumen PATCH sends notification body without 'undefined' and includes tank info", async () => {
    sendPushToAllSpy.mockClear();

    const res = await request(app)
      .patch("/api/plant-module/bitumen-dip-readings/1")
      .send({ tankNumber: 2, depthCm: 75.0 })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);

    const calls = sendPushToAllSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [title, body] = calls[0];
    expect(title).toBe("Bitumen Dip Updated");
    expect(body).not.toContain("undefined");
    expect(body).toBe("Tank 2 reading updated");
  });

  it("LDO PATCH sends notification body without 'undefined' and includes reading info", async () => {
    sendPushToAllSpy.mockClear();

    const res = await request(app)
      .patch("/api/plant-module/ldo-dip-readings/2")
      .send({ tankNumber: 2, depthCm: 60.0 })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);

    const calls = sendPushToAllSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);

    const [title, body] = calls[0];
    expect(title).toBe("LDO Dip Updated");
    expect(body).not.toContain("undefined");
    expect(body).toBe("LDO dip reading #2 updated");
  });
});
