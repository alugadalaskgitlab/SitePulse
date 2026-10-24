import { describe, expect, it } from "vitest";
import { normalizedEquipmentTypeName, plannedHoursInDateRange } from "../server/dprActualTheoretical";

describe("DPR actual-vs-theoretical report helpers", () => {
  it("keeps the full planned amount when the selected range covers a programme month", () => {
    expect(
      plannedHoursInDateRange({ 1: 100 }, "2026-01-15", "2026-02-14", "2026-01-15"),
    ).toBeCloseTo(100, 6);
  });

  it("prorates a partial range within a programme month without inventing daily demand", () => {
    expect(
      plannedHoursInDateRange({ 1: 100 }, "2026-01-15", "2026-01-30", "2026-01-15"),
    ).toBeCloseTo(100 * 16 / 31, 6);
  });

  it("refuses to report phased demand when the project has no start date", () => {
    expect(plannedHoursInDateRange({ 1: 100 }, "2026-01-01", "2026-01-31", null)).toBeNull();
  });

  it("normalizes punctuation and parenthetical machine specifications without alias guessing", () => {
    expect(normalizedEquipmentTypeName(" Road Roller (10T) ")).toBe("road roller");
    expect(normalizedEquipmentTypeName("ROAD   ROLLER")).toBe("road roller");
    expect(normalizedEquipmentTypeName("JCB")).not.toBe(normalizedEquipmentTypeName("Excavator"));
  });
});
