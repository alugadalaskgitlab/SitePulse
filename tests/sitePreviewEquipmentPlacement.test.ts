import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SitePreview equipment efficiency placement", () => {
  const source = readFileSync("client/src/pages/SitePreview.tsx", "utf8");

  it("renders compact efficiency inside the equipment-only conditional", () => {
    const activityStart = source.indexOf("{/* Activity Progress */}");
    const equipmentStart = source.indexOf("{/* Equipment Log */}");
    const compact = source.indexOf("<DprEquipmentCompact");
    const labourStart = source.indexOf("{/* Labour Strength */}");

    expect(activityStart).toBeGreaterThan(-1);
    expect(equipmentStart).toBeGreaterThan(activityStart);
    expect(compact).toBeGreaterThan(equipmentStart);
    expect(compact).toBeLessThan(labourStart);
    expect(source.slice(equipmentStart, compact)).toContain("data.equipment.some");
  });
});