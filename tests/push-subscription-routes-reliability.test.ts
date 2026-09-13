import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "http";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";

const mocks = vi.hoisted(() => {
  const rows = new Map<string, any>();
  class PushSubscriptionOwnershipError extends Error {}
  return {
    rows,
    sendTestPush: vi.fn().mockResolvedValue(undefined),
    PushSubscriptionOwnershipError,
  };
});

vi.mock("../server/storage", () => {
  const storage = new Proxy({}, {
    get(_target, property: string) {
      if (property === "createPushSubscription") {
        return vi.fn(async (data: any) => {
          const existing = mocks.rows.get(data.endpoint);
          if (existing && existing.userId !== data.userId) {
            throw new mocks.PushSubscriptionOwnershipError();
          }
          if (existing) return { subscription: { ...existing, ...data }, created: false };
          const subscription = { id: mocks.rows.size + 1, ...data };
          mocks.rows.set(data.endpoint, subscription);
          return { subscription, created: true };
        });
      }
      if (property === "deletePushSubscriptionForUser") {
        return vi.fn(async (endpoint: string, userId: number) => {
          const existing = mocks.rows.get(endpoint);
          if (!existing) return "missing";
          if (existing.userId !== userId) return "forbidden";
          mocks.rows.delete(endpoint);
          return "deleted";
        });
      }
      return vi.fn().mockResolvedValue([]);
    },
  });
  return {
    storage,
    PushSubscriptionOwnershipError: mocks.PushSubscriptionOwnershipError,
    StockShortageError: class StockShortageError extends Error {},
    EquipmentIncomingConflictError: class EquipmentIncomingConflictError extends Error {},
    InsufficientPlantStockError: class InsufficientPlantStockError extends Error {},
    InvalidDieselPhysicalStockError: class InvalidDieselPhysicalStockError extends Error {},
    InvalidStockTransferQuantityError: class InvalidStockTransferQuantityError extends Error {},
    InvalidDieselSourceError: class InvalidDieselSourceError extends Error {},
    DieselReceiptExceedsRemainingError: class DieselReceiptExceedsRemainingError extends Error {},
    CutFillInsufficientAvailabilityError: class CutFillInsufficientAvailabilityError extends Error {},
    CutFillValidationError: class CutFillValidationError extends Error {},
    AttachmentReferenceError: class AttachmentReferenceError extends Error {},
    InitialScopeCorrectionBlockedError: class InitialScopeCorrectionBlockedError extends Error {},
    ScopeChangedDuringPlanningError: class ScopeChangedDuringPlanningError extends Error {},
    DprProjectMismatchError: class DprProjectMismatchError extends Error {},
    assertValidDieselPhysicalStock: vi.fn(),
  };
});

vi.mock("../server/push", () => ({
  sendTestPush: mocks.sendTestPush,
  sendPushToAll: vi.fn(),
  sendPushToAudience: vi.fn(),
  sendPushToSection: vi.fn(),
  sendPushToRaiser: vi.fn(),
}));

vi.mock("../server/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const userId = Number(req.header("x-test-user") || 7);
    req.authUser = { id: userId, isAdmin: false, notificationsEnabled: req.header("x-notifications-enabled") !== "false" } as any;
    next();
  },
  isPublicApiPath: vi.fn(),
  isOptionalAuthPath: vi.fn(),
  optionalAuth: vi.fn(),
  lookupSessionFromCookie: vi.fn(),
  loadUserPermissionsMatrix: vi.fn(),
}));

vi.mock("../server/auth-routes", () => ({
  registerAuthRoutes: vi.fn(),
  assertAdmin: vi.fn(() => true),
  assertEdit: vi.fn(() => true),
  assertView: vi.fn(() => true),
  assertViewEither: vi.fn(() => true),
  assertAuthed: vi.fn(() => true),
  assertCreate: vi.fn(() => true),
  assertCreateOrEdit: vi.fn(() => true),
  assertCreateEither: vi.fn(() => true),
  assertApprove: vi.fn(() => true),
  assertDeleteOrCancel: vi.fn(() => true),
  currentUserName: vi.fn(() => "test-user"),
}));

import { registerRoutes } from "../server/routes";

const payload = {
  subscription: {
    endpoint: "https://push.example/device-1",
    keys: { p256dh: "p256dh", auth: "auth" },
  },
  label: "Device",
};

describe("push subscription route activation", () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  beforeEach(() => {
    mocks.rows.clear();
    mocks.sendTestPush.mockClear();
  });

  it("silently synchronizes an existing browser subscription", async () => {
    const response = await request(app).post("/api/push/subscribe").send({ ...payload, mode: "sync" });

    expect(response.status).toBe(201);
    expect(mocks.sendTestPush).not.toHaveBeenCalled();
  });

  it("sends one confirmation for concurrent explicit first activation retries", async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => request(app).post("/api/push/subscribe").send({ ...payload, mode: "activate" })),
    );

    expect(responses.map((response) => response.status)).toContain(201);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(5);
    expect(mocks.sendTestPush).toHaveBeenCalledTimes(1);
  });

  it("never sends a duplicate confirmation when silent sync races activation", async () => {
    const responses = await Promise.all([
      request(app).post("/api/push/subscribe").send({ ...payload, mode: "sync" }),
      request(app).post("/api/push/subscribe").send({ ...payload, mode: "activate" }),
    ]);

    expect(responses.every((response) => response.status === 200 || response.status === 201)).toBe(true);
    // If sync wins the first insert, activation intentionally sends none; if
    // activation wins, it sends the single enabled confirmation.
    expect(mocks.sendTestPush.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("rejects disabled accounts and protects another user's subscription", async () => {
    const disabled = await request(app)
      .post("/api/push/subscribe")
      .set("x-notifications-enabled", "false")
      .send({ ...payload, mode: "activate" });
    expect(disabled.status).toBe(403);
    expect(disabled.body.message).toBe("notifications_disabled");

    await request(app).post("/api/push/subscribe").send({ ...payload, mode: "activate" });
    const otherUser = await request(app)
      .post("/api/push/subscribe")
      .set("x-test-user", "8")
      .send({ ...payload, mode: "sync" });
    expect(otherUser.status).toBe(403);
    expect(otherUser.body.message).toBe("subscription_not_owned");

    const otherUserDelete = await request(app)
      .delete("/api/push/unsubscribe")
      .set("x-test-user", "8")
      .send({ endpoint: payload.subscription.endpoint });
    expect(otherUserDelete.status).toBe(403);
    expect(otherUserDelete.body.message).toBe("subscription_not_owned");
  });

  it("allows the owner to disable and explicitly re-enable the device", async () => {
    await request(app).post("/api/push/subscribe").send({ ...payload, mode: "activate" });
    const disabled = await request(app).delete("/api/push/unsubscribe").send({ endpoint: payload.subscription.endpoint });
    const enabledAgain = await request(app).post("/api/push/subscribe").send({ ...payload, mode: "activate" });

    expect(disabled.status).toBe(200);
    expect(enabledAgain.status).toBe(201);
    expect(mocks.sendTestPush).toHaveBeenCalledTimes(2);
  });
});