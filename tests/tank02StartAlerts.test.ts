import { describe, expect, it, vi } from "vitest";
vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/push", () => ({ sendPushToUser: vi.fn() }));
vi.mock("../server/auth", () => ({ getUserById: vi.fn(), loadUserPermissionsMatrix: vi.fn() }));
import { createTankDipNotifications, tankDipRecipients, type TankDipDependencies } from "../server/tankDipNotifications";
import { tankDipAlertHref, tankDipAlertType, type TankDipRow } from "../shared/tankBookStock";
const geometry = { shape: "vertical_cylinder", diameterCm: 200, heightCm: 200 };
const settings = { siteId: 7, bitumenDensityKgPerL: 1, tankConfig: JSON.stringify({ bitumen1: geometry, bitumen2: geometry, ldo1: geometry, ldo2: geometry }) };
const date = "2026-11-28";
const start = { id: 11, date, plantName: "Plant A" };
function fixture(bitumen: TankDipRow[] = [], ldo: TankDipRow[] = []) {
  const deliver = vi.fn();
  const deps: TankDipDependencies = {
    settings: async () => settings,
    positions: async () => [
      { materialName: "BITUMEN", partyId: 7, partyName: "Fixture", tank1Mt: 2, tank2Mt: 2 },
      { materialName: "LDO", partyId: 7, partyName: "Fixture", tank1L: 1000, tank2L: 1000 },
    ],
    readings: async kind => kind === "bitumen" ? bitumen : ldo,
    recipients: vi.fn(async () => [1, 3]),
    deliver,
    plants: async () => [{ ...settings, plantName: "Plant A" }],
    idleWithoutProduction: async () => false,
    supervisors: async () => [3],
  };
  return { service: createTankDipNotifications(deps), deps, deliver };
}
const reading = (tankNumber: number, kind = "bitumen", extra = {}): TankDipRow => ({
  id: tankNumber, tankNumber, plantName: "Plant A", date, time: "08:00", depthCm: 60, readingType: "opening",
  volumeLiters: kind === "ldo" ? 1000 : 2000, weightKg: kind === "ldo" ? 840 : 2000, ...extra,
});
describe("TANK-02 start alerts", () => {
  it("names both missing tanks per material and uses only the above-operator recipients", async () => {
    const { service, deps, deliver } = fixture();
    await service.notifyStart(start);
    expect(deps.recipients).toHaveBeenCalledWith("Plant A", false);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver.mock.calls[0][0]).toMatchObject({ recipientIds: [1, 3], message: `Plant started on ${date} without bitumen dip readings for Tank 1, Tank 2.` });
    expect(deliver.mock.calls[1][0].message).toContain("without LDO dip readings for Tank 1, Tank 2");
    expect(tankDipAlertHref(deliver.mock.calls[0][0].alertType)).toContain("dipEntry=1");
  });
  it("does not accept a closing reading as an opening", async () => {
    const { service, deliver } = fixture([reading(1), reading(2, "bitumen", { readingType: "closing" })], [reading(1, "ldo"), reading(2, "ldo")]);
    await service.notifyStart(start);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].message).toContain("without bitumen dip readings for Tank 2.");
  });
  it("sends a quantity alert for an over-limit reading and none for in-limit readings", async () => {
    const { service, deliver } = fixture([reading(1, "bitumen", { weightKg: 2500 }), reading(2)], [reading(1, "ldo"), reading(2, "ldo")]);
    await service.notifyStart(start);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].message).toBe("Bitumen tank 1 dip differs from book by 0.500 MT");
    expect(tankDipAlertHref(deliver.mock.calls[0][0].alertType)).not.toContain("dipEntry");
  });
  it("sends nothing when all required opening dips match book", async () => {
    const { service, deliver } = fixture([reading(1), reading(2)], [reading(1, "ldo"), reading(2, "ldo")]);
    await service.notifyStart(start); expect(deliver).not.toHaveBeenCalled();
  });
  it("selects active Owners and plant-scoped verifiers; reminders additionally include dip-entry users", () => {
    const users = [
      { id: 1, active: true, owner: true, verify: false, enter: false, sites: [] },
      { id: 2, active: true, owner: false, verify: false, enter: true, sites: [7] },
      { id: 3, active: true, owner: false, verify: true, enter: false, sites: [7] },
      { id: 4, active: true, owner: false, verify: false, enter: false, sites: [7] },
      { id: 5, active: true, owner: false, verify: true, enter: true, sites: [8] },
      { id: 6, active: false, owner: true, verify: true, enter: true, sites: null },
    ];
    expect(tankDipRecipients(users, 7, false)).toEqual([1, 3]);
    expect(tankDipRecipients(users, 7, true)).toEqual([1, 2, 3]);
    expect(tankDipRecipients(users, null, true)).toEqual([1]);
  });
  it("builds safe plant-specific entry links without changing order links", () => {
    const link = tankDipAlertHref(tankDipAlertType("ldo", 2, "opening", "Plant A / B", date))!;
    expect(link).toContain("/plant/ldo-flow-meter?");
    expect(new URL(link, "https://example.test").searchParams.get("plant")).toBe("Plant A / B");
    expect(link).toContain("tank=2"); expect(link).toContain(`dipDate=${date}`);
    expect(tankDipAlertHref("tank_dip:bad:2:opening:evil:2026-11-28")).toBeNull();
  });
});
