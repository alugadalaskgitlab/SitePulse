import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../server/auth", () => ({ getUserById: vi.fn(), loadUserPermissionsMatrix: vi.fn() }));
import { createTankDipNotifications, scheduleTankDipReminders, type TankDipDependencies } from "../server/tankDipNotifications";
const geometry = { shape: "vertical_cylinder", diameterCm: 200, heightCm: 200 };
const settings = { plantName: "Plant A", tankConfig: JSON.stringify({ bitumen1: geometry, bitumen2: geometry, ldo1: geometry, ldo2: geometry }) };
function fixture() {
  let confirmed = false, idle = false;
  const deliver = vi.fn();
  const deps: TankDipDependencies = {
    plants: async () => [settings], settings: async () => settings, positions: async () => [],
    readings: async () => confirmed ? [1, 2].map(tankNumber => ({ tankNumber, date: "2026-11-28", depthCm: 100, volumeLiters: 3000, readingType: "opening" })) : [],
    recipients: vi.fn(async () => [1, 2, 3]), supervisors: async () => [3],
    idleWithoutProduction: async () => idle, deliver,
  };
  return { service: createTankDipNotifications(deps), deps, deliver, confirm: () => { confirmed = true; }, markIdle: () => { idle = true; } };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe("TANK-02 scheduled reminders", () => {
  it("writes nothing at startup, sends at 08:00 and 10:00 IST, and stops when all opening dips exist", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-28T02:29:59Z"));
    const fx = fixture();
    scheduleTankDipReminders(now => fx.service.runReminders(now));
    expect(fx.deliver).not.toHaveBeenCalled(); expect(fx.deps.recipients).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fx.deliver).toHaveBeenCalledTimes(1);
    expect(fx.deliver.mock.calls[0][0]).toMatchObject({ recipientIds: [1, 2, 3], message: "Enter today's dip readings: Bitumen tank 1, Bitumen tank 2, LDO tank 1, LDO tank 2" });
    expect(fx.deps.recipients).toHaveBeenCalledWith("Plant A", true);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(fx.deliver).toHaveBeenCalledTimes(2);
    expect(fx.deliver.mock.calls[1][0].dedupeKey).toContain("T10:00");
    fx.confirm(); await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(fx.deliver).toHaveBeenCalledTimes(2);
  });
  it("does not remind on an explicitly idle day with no production", async () => {
    const fx = fixture(); fx.markIdle();
    await fx.service.runReminders(new Date("2026-11-28T02:30:00Z"));
    expect(fx.deliver).not.toHaveBeenCalled();
  });
  it("includes the 18:00 slot but nothing before 08:00 or after 18:00", async () => {
    const fx = fixture();
    await fx.service.runReminders(new Date("2026-11-28T02:29:00Z"));
    await fx.service.runReminders(new Date("2026-11-28T12:30:00Z"));
    await fx.service.runReminders(new Date("2026-11-28T12:31:00Z"));
    expect(fx.deliver).toHaveBeenCalledTimes(1);
    expect(fx.deliver.mock.calls[0][0].dedupeKey).toContain("T18:00");
  });
  it("uses Owner-edited reminder times and interval", async () => {
    const fx = fixture();
    fx.deps.plants = async () => [{ ...settings, tankConfig: JSON.stringify({ dipWatch: { firstReminder: "09:15", repeatHours: 3, lastReminder: "18:00" } }) }];
    for (const utc of ["02:30", "03:45", "06:45", "12:45"]) {
      await fx.service.runReminders(new Date(`2026-11-28T${utc}:00Z`));
    }
    expect(fx.deliver).toHaveBeenCalledTimes(2);
    expect(fx.deliver.mock.calls.map(row => row[0].dedupeKey.slice(-5))).toEqual(["09:15", "12:15"]);
  });
  it("after a tank receipt targets the saver and linked supervisor, not all operators", async () => {
    const fx = fixture();
    await fx.service.afterTankReceipt({ kind: "ldo", tank: 2, plantName: "Plant A", date: "2026-11-28", actorUserId: 2, eventId: "receipt:17" });
    expect(fx.deliver.mock.calls[0][0]).toMatchObject({ recipientIds: [2, 3], message: "Take the after-dip for LDO tank 2" });
    expect(fx.deps.recipients).not.toHaveBeenCalled();
  });
});
