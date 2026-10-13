import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({
  send: vi.fn(), configure: vi.fn(), subscriptions: vi.fn(), remove: vi.fn(),
}));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send, setVapidDetails: mocks.configure } }));
vi.mock("../server/storage", () => ({ storage: {
  getActivePushSubscriptions: mocks.subscriptions,
  deletePushSubscriptionByEndpoint: mocks.remove,
} }));
import { initPush, sendPushToAudience } from "../server/push";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "synthetic-test-public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "synthetic-test-private");
  initPush();
  mocks.subscriptions.mockResolvedValue([
    { endpoint: "https://push.invalid/manager", role: "manager", p256dh: "test", auth: "test" },
    { endpoint: "https://push.invalid/field", role: "field", p256dh: "test", auth: "test" },
  ]);
});
afterEach(() => vi.unstubAllEnvs());
describe("automatic reminder delivery without persisted cleanup", () => {
  it.each([404, 410, 500])("does not delete subscriptions after provider %s", async statusCode => {
    mocks.send.mockRejectedValue({ statusCode, message: "synthetic provider failure" });
    await sendPushToAudience("Reminder", "Draft waiting", "/stores/grns", "managers", { pruneExpiredSubscriptions: false });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("still delivers to the intended audience and URL", async () => {
    mocks.send.mockResolvedValue({});
    await sendPushToAudience("Reminder", "Draft waiting", "/stores/grns", "managers", { pruneExpiredSubscriptions: false });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.invalid/manager" }),
      expect.any(String),
    );
    expect(JSON.parse(mocks.send.mock.calls[0][1])).toMatchObject({ title: "Reminder", url: "/stores/grns" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([404, 410])("preserves existing cleanup for other callers after %s", async statusCode => {
    mocks.send.mockRejectedValue({ statusCode });
    await sendPushToAudience("Ordinary event", "Body", "/", "managers");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("https://push.invalid/manager");
  });
  it("wires the automatic timer to the read-only delivery option", () => {
    const source = readFileSync("server/index.ts", "utf8");
    expect(source).toMatch(/sendPushToAudience\([^;]+pruneExpiredSubscriptions: false/s);
    expect(source).toContain("startStaleGrnNotifications()");
  });
});
