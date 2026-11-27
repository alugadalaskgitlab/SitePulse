import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SESSION_COOKIE_NAME, SESSION_POLICIES, SESSION_POLICY_LABELS } from "../shared/permissions";

const fixture = vi.hoisted(() => ({ rows: [] as any[][] }));
vi.mock("../server/db", () => ({ db: { select: () => ({ from: () => ({
  where: async () => fixture.rows.shift() ?? [],
}) }) } }));
vi.mock("../server/featureAccess", () => ({ loadFeatureAccessState: vi.fn() }));
import { lookupSessionFromCookie, signToken } from "../server/auth";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-27T10:00:00Z")); vi.stubEnv("SESSION_SECRET", "day02-test-only-signing-secret"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

function cookie(policy: string, idleMinutes: number, ageDays = 1, status = "approved") {
  fixture.rows = [
    [{ id: 1, userId: 1, deviceId: 2, loggedOutAt: null, lastActivityAt: new Date(Date.now() - idleMinutes * 60_000), loginAt: new Date(Date.now() - ageDays * 86400_000) }],
    [{ id: 1, isActive: true, sessionPolicy: policy }],
    [{ id: 2, status }],
  ];
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(signToken("day02-fixture"))}`;
}
it.each([
  ["strict_30", 20, 1, "ok"], ["strict_30", 31, 1, "expired"],
  ["strict_60", 50, 1, "ok"], ["strict_60", 61, 1, "expired"],
  ["strict", 4, 1, "ok"], ["strict", 6, 1, "expired"],
  ["sticky", 5000, 29, "ok"], ["sticky", 1, 31, "expired"],
] as const)("%s after %i idle minutes and %i days is %s", async (policy, minutes, age, expected) => {
  expect((await lookupSessionFromCookie(cookie(policy, minutes, age))).kind).toBe(expected);
});
it.each(["strict_30", "strict_60"])("still requires device approval for %s", async policy => {
  expect((await lookupSessionFromCookie(cookie(policy, 1, 1, "pending"))).kind).toBe("device_revoked");
});
it("offers the four plain labels in order, retaining the original stored keys", () => {
  expect(SESSION_POLICIES.map(policy => SESSION_POLICY_LABELS[policy])).toEqual([
    "Log out after 5 minutes idle", "Log out after 30 minutes idle",
    "Log out after 1 hour idle", "Stay logged in for 30 days",
  ]);
});
