import { describe, expect, it } from "vitest";
import {
  materialNeedsCftEquivalent,
  materialPlanQuantity,
  materialTonnesToCft,
  explicitlyLinkedStoreIssue,
  plantMixComponentQuantities,
  remainingMaterialToBuy,
  siteReceiptAttribution,
  soilCompactedToLooseCum,
  useSourceForLayer,
} from "../shared/bomPlanActual";

describe("BOM-PLAN-03 project material buy/use rules", () => {
  it("uses plant dispatch for bituminous mix and DPR recipes for other layers", () => {
    expect(useSourceForLayer("bituminous")).toBe("plant dispatch");
    expect(useSourceForLayer("earthwork")).toBe("DPR × recipe");
    expect(useSourceForLayer("granular")).toBe("DPR × recipe");
    expect(useSourceForLayer("granular", "plant")).toBe("plant dispatch");
    expect(useSourceForLayer("granular", "direct")).toBe("DPR × recipe");
    expect(useSourceForLayer("concrete")).toBe("DPR × recipe");
    expect(useSourceForLayer("none")).toBe("linked store issue");
  });

  it("splits plant dispatch by template shares and avoids a duplicate binder share", () => {
    const split = plantMixComponentQuantities(
      100,
      [
        { materialName: "10mm Aggregate", percent: 48 },
        { materialName: "20mm Aggregate", percent: 46.6 },
      ],
      5.4,
      "Bitumen VG-30",
    );
    expect(split).toEqual([
      { materialName: "10mm Aggregate", quantityMt: 48 },
      { materialName: "20mm Aggregate", quantityMt: 46.6 },
      { materialName: "Bitumen VG-30", quantityMt: 5.4 },
    ]);

    const explicitBinder = plantMixComponentQuantities(
      100,
      [
        { materialName: "Bitumen VG-30", percent: 5.4 },
        { materialName: "10mm Aggregate", percent: 94.6 },
      ],
      5.4,
      "Bitumen VG-30",
    );
    expect(explicitBinder).toHaveLength(2);
    expect(explicitBinder.reduce((sum, row) => sum + row.quantityMt, 0)).toBeCloseTo(100);
  });

  it("counts linked project receipts or unlinked same-site receipts, never another project", () => {
    expect(siteReceiptAttribution({ boqProjectId: 8, site: "Other" }, 8, "Road Site")).toBe("by project/item");
    expect(siteReceiptAttribution({ boqProjectId: null, site: " road site " }, 8, "Road Site")).toBe("by site");
    expect(siteReceiptAttribution({ boqProjectId: 9, site: "Road Site" }, 8, "Road Site")).toBeNull();
    expect(siteReceiptAttribution({ boqProjectId: null, site: "Other" }, 8, "Road Site")).toBeNull();
  });

  it("accepts store issues only with both the exact project and item link", () => {
    expect(explicitlyLinkedStoreIssue({ boqProjectId: 8, boqItemId: 21 }, 8, 21)).toBe(true);
    expect(explicitlyLinkedStoreIssue({ boqProjectId: 8, boqItemId: null }, 8, 21)).toBe(false);
    expect(explicitlyLinkedStoreIssue({ boqProjectId: null, boqItemId: 21 }, 8, 21)).toBe(false);
    expect(explicitlyLinkedStoreIssue({ boqProjectId: 9, boqItemId: 21 }, 8, 21)).toBe(false);
  });

  it("converts compacted soil to loose Cum and retains the legacy profile fallback", () => {
    const profile = { rolledDensity: 2, rollingPct: 98, looseFactor: 1.2, wastagePct: 0 };
    expect(soilCompactedToLooseCum(100, profile)).toBeCloseTo(120);
    expect(soilCompactedToLooseCum(100, null, [0.8])).toBeCloseTo(125);
    expect(soilCompactedToLooseCum(100, null, [0.8, 0.9])).toBeNull();
  });

  it("never converts CFT to MT without that material's own delivered weight", () => {
    expect(materialPlanQuantity(1, "CFT", "MT", null, "loose")).toBeNull();
    expect(materialPlanQuantity(1, "CFT", "MT", { bulkDensity: 1.5 }, "loose")).toBeCloseTo(1.5 / 35.3147);
    expect(materialNeedsCftEquivalent("Stone Dust")).toBe(true);
    expect(materialTonnesToCft(1, null)).toBeNull();
    expect(materialTonnesToCft(1, { bulkDensity: 1.5 })).toBeCloseTo(35.3147 / 1.5);
  });

  it("uses separate still-to-buy formulas for plant mix and site-delivered materials", () => {
    expect(remainingMaterialToBuy(100, 30, 40, true)).toEqual({ remaining: 30, excess: null });
    expect(remainingMaterialToBuy(100, 60, 90, false)).toEqual({ remaining: 40, excess: null });
    expect(remainingMaterialToBuy(100, 120, 0, true)).toEqual({ remaining: 0, excess: 20 });
    expect(remainingMaterialToBuy(100, null, 0, true)).toEqual({ remaining: null, excess: null });
  });
});
