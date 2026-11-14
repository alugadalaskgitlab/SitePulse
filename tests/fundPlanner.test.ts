import { describe, expect, it } from "vitest";
import { previewFundPlanMaterials, quantityForFundPlanLength } from "@shared/fundPlanner";
import { fundPlannerWorkGroup } from "@shared/fundPlannerGroups";

function sprayItem(waterAddedPerPart: number | null) {
  return {
    id: 41,
    itemCode: "5.1",
    description: "Prime coat",
    unit: "SQM",
    canonicalUnit: "SQM",
    currentQty: 1000,
    layerConfig: { layerType: "spray_coat", coverageRateKgPerSqm: 0.2 },
    materials: [],
    derivedKeyMaterials: [{
      materialName: "RS-1 Emulsion",
      uom: "MT",
      qtyPerBoqUnit: 0.0002,
      wastagePct: 0,
      isClientSupplied: false,
      isAuto: true,
      supplyType: "direct" as const,
      waterAddedPerPart,
    }],
    equipment: [],
    labour: [],
  } as any;
}

describe("Fund Planner", () => {
  it("uses the same spray-material total when water is zero and halves neat emulsion at a 1:1 ratio", () => {
    const baseline = previewFundPlanMaterials([sprayItem(0)], [{ itemId: 41, quantity: 1000 }], {});
    const explicitZero = previewFundPlanMaterials([sprayItem(0)], [{ itemId: 41, quantity: 1000 }], {
      "41": { waterAddedPerPart: 0 },
    });
    const onePartWater = previewFundPlanMaterials([sprayItem(0)], [{ itemId: 41, quantity: 1000 }], {
      "41": { waterAddedPerPart: 1 },
    });

    expect(baseline.materials[0].totalQty).toBeCloseTo(0.2, 10);
    expect(explicitZero.materials[0].totalQty).toBe(baseline.materials[0].totalQty);
    expect(onePartWater.materials[0].totalQty).toBeCloseTo(0.1, 10);
  });

  it("calculates planned quantity from a selected stretch length and reach share", () => {
    expect(quantityForFundPlanLength(1500, 2000, 22.5)).toBeCloseTo(16.875, 10);
    expect(quantityForFundPlanLength(1500, 0, 22.5)).toBe(0);
  });

  it("groups work from its BOQ category and recipe layer without item IDs", () => {
    expect(fundPlannerWorkGroup({ description: "Clearing and grubbing road", categoryName: "Road Works" })).toBe("earthwork");
    expect(fundPlannerWorkGroup({ description: "Providing wet mix macadam", layerType: "granular" })).toBe("base");
    expect(fundPlannerWorkGroup({ description: "Applying prime coat", layerType: "spray_coat" })).toBe("bituminous");
    expect(fundPlannerWorkGroup({ description: "Excavation for culvert", categoryName: "CD Works — Culvert" })).toBe("structures");
    expect(fundPlannerWorkGroup({ description: "Providing sign board", categoryName: "Road Furniture" })).toBe("furniture");
    expect(fundPlannerWorkGroup({ description: "Unclassified item", categoryName: "Road Works" })).toBeNull();
  });
});
