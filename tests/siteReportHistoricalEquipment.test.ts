import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SiteReport historical equipment audit rendering", () => {
  const source = readFileSync("client/src/pages/SiteReport.tsx", "utf8");

  it("uses persisted operating and fuel facts, not live usage calculation", () => {
    expect(source).not.toContain("computeEquipmentUsage");
    expect(source).not.toContain("calculateTimeHours");
    expect(source).not.toContain("calculateMeterHours");
    expect(source).toContain("item.hoursWorked != null");
    expect(source).toContain("item.totalKm != null");
    expect(source).toContain("item.expectedDiesel != null");
    expect(source).toContain("item.dieselNorm != null");
  });
});