import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ row: undefined as Record<string, unknown> | undefined }));

vi.mock("../server/db", () => {
  const db = {
    insert: () => ({
      values: (data: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (state.row) return [];
            state.row = { id: 1, ...data };
            return [state.row];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.row ? [state.row] : [],
        }),
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (!state.row) return [];
            state.row = { ...state.row, ...data };
            return [state.row];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.row = undefined;
      },
    }),
  };
  return { db };
});

import { DatabaseStorage, PushSubscriptionOwnershipError } from "../server/storage";

const subscription = (userId: number) => ({
  endpoint: "https://push.example/device-1",
  p256dh: "p256dh",
  auth: "auth",
  label: "Device",
  role: "manager",
  userId,
});

describe("push subscription storage activation ownership", () => {
  beforeEach(() => {
    state.row = undefined;
  });

  it("atomically marks only one concurrent first registration as created", async () => {
    const storage = new DatabaseStorage();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => storage.createPushSubscription(subscription(7))),
    );

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.every((result) => result.subscription.userId === 7)).toBe(true);
  });

  it("does not let another account claim or delete an existing device", async () => {
    const storage = new DatabaseStorage();
    await storage.createPushSubscription(subscription(7));

    await expect(storage.createPushSubscription(subscription(8)))
      .rejects.toBeInstanceOf(PushSubscriptionOwnershipError);
    await expect(storage.deletePushSubscriptionForUser(subscription(7).endpoint, 8))
      .resolves.toBe("forbidden");
    await expect(storage.deletePushSubscriptionForUser(subscription(7).endpoint, 7))
      .resolves.toBe("deleted");
  });

  it("permits an intentional disable followed by a new activation", async () => {
    const storage = new DatabaseStorage();
    expect((await storage.createPushSubscription(subscription(7))).created).toBe(true);
    await storage.deletePushSubscriptionForUser(subscription(7).endpoint, 7);
    expect((await storage.createPushSubscription(subscription(7))).created).toBe(true);
  });
});