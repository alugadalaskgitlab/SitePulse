import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  send: vi.fn(), configure: vi.fn(), subscriptions: vi.fn(), remove: vi.fn(),
  getUser: vi.fn(), permissions: vi.fn(), accessState: vi.fn(),
}));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send, setVapidDetails: mocks.configure } }));
vi.mock("../server/storage", () => ({ storage: {
  getActivePushSubscriptions: mocks.subscriptions,
  deletePushSubscriptionByEndpoint: mocks.remove,
} }));
vi.mock("../server/auth", () => ({
  getUserById: mocks.getUser,
  loadUserPermissionsMatrix: mocks.permissions,
}));
vi.mock("../server/featureAccess", () => ({
  loadFeatureAccessState: mocks.accessState,
}));
import { initPush, sendPushToAudience } from "../server/push";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "synthetic-test-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "synthetic-test-private");
  initPush();
  mocks.subscriptions.mockResolvedValue([
    { userId: 1, endpoint: "https://push.invalid/grn-viewer", p256dh: "test", auth: "test" },
    { userId: 2, endpoint: "https://push.invalid/no-grn-view", p256dh: "test", auth: "test" },
  ]);
  mocks.getUser.mockImplementation(async (id: number) => ({ id, isActive: true, isAdmin: false, isOwner: false }));
  mocks.permissions.mockResolvedValue({});
  mocks.accessState.mockImplementation(async (id: number) => ({
    rolesConfigured: true,
    userRoles: [id],
    roleTicks: { [id]: { grn: { view: id === 1 } } },
    legacyPermissions: {},
  }));
});
afterEach(() => vi.unstubAllEnvs());
describe("automatic reminder delivery without persisted cleanup", () => {
  it.each([404, 410, 500])("does not delete subscriptions after provider %s", async statusCode => {
    mocks.send.mockRejectedValue({ statusCode, message: "synthetic provider failure" });
    await sendPushToAudience("Reminder", "Draft waiting", "/stores/grns", "feature:grn:view", { pruneExpiredSubscriptions: false });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("still delivers to the intended audience and URL", async () => {
    mocks.send.mockResolvedValue({});
    await sendPushToAudience("Reminder", "Draft waiting", "/stores/grns", "feature:grn:view", { pruneExpiredSubscriptions: false });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.invalid/grn-viewer" }),
      expect.any(String),
    );
    expect(JSON.parse(mocks.send.mock.calls[0][1])).toMatchObject({ title: "Reminder", url: "/stores/grns" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([404, 410])("preserves existing cleanup for other callers after %s", async statusCode => {
    mocks.send.mockRejectedValue({ statusCode });
    await sendPushToAudience("Ordinary event", "Body", "/", "all");
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove).toHaveBeenCalledWith("https://push.invalid/grn-viewer");
    expect(mocks.remove).toHaveBeenCalledWith("https://push.invalid/no-grn-view");
  });
  it("wires the automatic timer to the read-only delivery option", () => {
    const source = readFileSync("server/index.ts", "utf8");
    expect(source).toMatch(/sendPushToAudience\([^;]+pruneExpiredSubscriptions: false/s);
    expect(source).toContain("startStaleGrnNotifications()");
  });
});
