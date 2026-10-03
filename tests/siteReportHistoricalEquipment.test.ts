import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SiteReport historical equipment audit rendering", () => {
  const source = readFileSync("client/src/pages/SiteReport.tsx", "utf8");
  const renderer = readFileSync("client/src/components/DprEquipmentReadOnlyRow.tsx", "utf8");

  it("uses persisted operating and fuel facts, not live usage calculation", () => {
    expect(source).not.toContain("computeEquipmentUsage");
    expect(source).not.toContain("calculateTimeHours");
    expect(source).not.toContain("calculateMeterHours");
    expect(renderer).toContain("row.hoursWorked != null");
    expect(renderer).toContain("row.totalKm != null");
    expect(renderer).toContain("finite(row.expectedDiesel)");
    expect(renderer).toContain("displayNorm(row.dieselNorm, normUnit)");
    expect(renderer).toContain("historicalUsage.runtime");
    expect(renderer).not.toContain("calculateTimeHours");
    expect(renderer).not.toContain("calculateMeterHours");
  });

  it("drives the count, diesel card and consolidated audit table from one child-aware collection", () => {
    expect(source).toContain("const visibleEquipment = dpr.equipment");
    expect(source).toContain(".filter(isVisibleEquipmentRow)");
    expect(source).toContain("breakdowns: item.breakdowns ?? breakdownsBySourceId.get(Number(item.id)) ?? []");
    expect(source).toContain("visibleEquipment.length");
    expect(source).toContain("visibleEquipment.reduce");
    expect((source.match(/visibleEquipment\.map/g) ?? []).length).toBe(1);
    expect(source).not.toContain("<DprEquipmentCompact");
  });
});