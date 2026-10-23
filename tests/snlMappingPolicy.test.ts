import { describe, expect, it } from "vitest";
import { resolveWorkType, WORK_TYPE_RECIPES } from "../shared/workTypeRecipes";
import { isConfirmedSnlMapping } from "../shared/snlMappingPolicy";

function templateEquipment(
  description: string,
  unit: string,
  workCategory: string,
): string[] {
  const workType = resolveWorkType(description, unit, { workCategory }).workType;
  if (!workType) throw new Error(`No work type resolved for: ${description}`);
  return WORK_TYPE_RECIPES[workType].equipment.map((row) => row.name);
}

describe("SNL recipe application policy", () => {
  it("requires an item ID and a confirmed or manually selected mapping", () => {
    expect(isConfirmedSnlMapping({
      snlItemId: 12,
      snlMappingStatus: "mapped",
      snlMappingIsAuto: true,
    })).toBe(true);
    expect(isConfirmedSnlMapping({
      snlItemId: 12,
      snlMappingStatus: "needs_review",
      snlMappingIsAuto: false,
    })).toBe(true);
    expect(isConfirmedSnlMapping({
      snlItemId: 12,
      snlMappingStatus: "needs_review",
      snlMappingIsAuto: true,
    })).toBe(false);
    expect(isConfirmedSnlMapping({
      snlItemId: 12,
      snlMappingStatus: "unmapped",
      snlMappingIsAuto: null,
    })).toBe(false);
    expect(isConfirmedSnlMapping({
      snlItemId: null,
      snlMappingStatus: "mapped",
      snlMappingIsAuto: false,
    })).toBe(false);
  });
});

describe("work-type fallback equipment", () => {
  it("keeps bituminous, spray-coat, granular, and earthwork templates distinct", () => {
    const bc = templateEquipment("Bituminous Concrete (BC) wearing course", "CUM", "BITUMINOUS");
    expect(bc.some((name) => /Hot Mix Plant/i.test(name))).toBe(true);
    expect(bc.some((name) => /Paver Finisher/i.test(name))).toBe(true);
    expect(bc.some((name) => /Roller/i.test(name))).toBe(true);
    expect(bc.some((name) => /Hydraulic Excavator|Motor Grader/i.test(name))).toBe(false);

    const dbm = templateEquipment("Dense Bituminous Macadam (DBM)", "CUM", "BITUMINOUS");
    expect(dbm.some((name) => /Hot Mix Plant/i.test(name))).toBe(true);
    expect(dbm.some((name) => /Paver Finisher/i.test(name))).toBe(true);
    expect(dbm.some((name) => /Roller/i.test(name))).toBe(true);

    for (const description of ["Applying primer coat on prepared surface", "Applying tack coat"]) {
      const spray = templateEquipment(description, "SQM", "BITUMINOUS");
      expect(spray).toContain("Bitumen Pressure Distributor");
      expect(spray.some((name) => /Tipper|Loader/i.test(name))).toBe(false);
    }

    const wmm = templateEquipment("Wet Mix Macadam (WMM)", "CUM", "SUBBASE_BASE");
    expect(wmm.some((name) => /WMM Plant/i.test(name))).toBe(true);
    expect(wmm.some((name) => /Motor Grader/i.test(name))).toBe(true);
    expect(wmm.some((name) => /Vibratory Roller/i.test(name))).toBe(true);

    const earthwork = templateEquipment("Construction of embankment with approved material", "CUM", "EARTHWORK");
    expect(earthwork.some((name) => /Hydraulic Excavator/i.test(name))).toBe(true);
    expect(earthwork.some((name) => /Motor Grader/i.test(name))).toBe(true);
  });
});
