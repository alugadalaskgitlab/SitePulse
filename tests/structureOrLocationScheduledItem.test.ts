import { describe, it, expect } from "vitest";
import {
  classifyPlanningItem,
  classifyWorkType,
  isBridgeStructureDescription,
  isStructureOrLocationScheduledItem,
} from "../shared/workTypeRecipes";
import {
  PIPE_CULVERT_NP4_1000MM_ITEM,
  PIPE_CULVERT_NP4_1000MM_MATERIALS,
  PIPE_CULVERT_NP4_1200MM_ITEM,
  PIPE_CULVERT_NP4_1200MM_MATERIALS,
  PIPE_CULVERT_NP4_300MM_ITEM,
  PIPE_CULVERT_NP4_300MM_MATERIALS,
} from "../shared/snlSeedData";

// ─── Shared helper used by Auto-generate, Auto-sequence, Clean Structure Bars, ──
// and the Work Programme coverage/status display. Must classify by BOQ
// category/description context, not just a (possibly stale) planningWorkType.

describe("isStructureOrLocationScheduledItem", () => {
  it("returns true when the item already carries a structure_import bar, regardless of other fields", () => {
    expect(
      isStructureOrLocationScheduledItem(
        { planningWorkType: null, categoryName: "Roadworks", description: "Some road item" },
        { hasStructureImportBar: true },
      ),
    ).toBe(true);
  });

  it("returns true when planningWorkType is already 'structure'", () => {
    expect(
      isStructureOrLocationScheduledItem({ planningWorkType: "structure", categoryName: null, description: null }),
    ).toBe(true);
  });

  it("returns true from category match even when planningWorkType is stale/null", () => {
    expect(
      isStructureOrLocationScheduledItem({
        planningWorkType: null,
        categoryName: "Minor Bridges",
        description: "Some generic item",
      }),
    ).toBe(true);
  });

  it("classifies foundation excavation for bridges as structure-scheduled by description, even without a structure category", () => {
    expect(
      isStructureOrLocationScheduledItem({
        planningWorkType: null,
        categoryName: "Earthwork",
        description: "Excavation for foundation of bridge substructure",
      }),
    ).toBe(true);
  });

  it("classifies strip seal expansion joints as structure-scheduled", () => {
    expect(
      isStructureOrLocationScheduledItem({
        planningWorkType: undefined,
        categoryName: "Civil Works",
        description: "Providing and fixing strip seal expansion joint",
      }),
    ).toBe(true);
  });

  it("classifies bridge numbering / enamel painting as structure-scheduled", () => {
    expect(
      isStructureOrLocationScheduledItem({
        categoryName: "Civil Works",
        description: "Bridge numbering and enamel painting of railing",
      }),
    ).toBe(true);
  });

  it("classifies MS railing / bridge railing as structure-scheduled", () => {
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Providing MS railing on bridge deck" }),
    ).toBe(true);
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Bridge railing painting" }),
    ).toBe(true);
  });

  it("classifies bearings (POT/PTFE) and tar paper as structure-scheduled", () => {
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Supplying POT-PTFE bearings" }),
    ).toBe(true);
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Providing tar paper under bearing" }),
    ).toBe(true);
  });

  it("classifies drainage spouts and weepholes as structure-scheduled", () => {
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Providing drainage spout in deck slab" }),
    ).toBe(true);
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Providing weepholes in abutment" }),
    ).toBe(true);
  });

  it("classifies approach slab and filter media behind abutment as structure-scheduled", () => {
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: "Construction of RCC approach slab" }),
    ).toBe(true);
    expect(
      isStructureOrLocationScheduledItem({
        categoryName: "Civil Works",
        description: "Filter media behind abutment as per drawing",
      }),
    ).toBe(true);
  });

  it("classifies crash barrier only when tied to bridge/deck context, not plain road crash barrier", () => {
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Roadworks", description: "Metal beam crash barrier on bridge deck" }),
    ).toBe(true);
    expect(
      isStructureOrLocationScheduledItem({ categoryName: "Roadworks", description: "Metal beam crash barrier along embankment" }),
    ).toBe(false);
  });

  it("returns false for a plain road/linear item with no structure signal", () => {
    expect(
      isStructureOrLocationScheduledItem({
        planningWorkType: "road",
        categoryName: "Flexible Pavement",
        description: "Providing and laying dense bituminous macadam",
      }),
    ).toBe(false);
  });

  it("agrees with classifyWorkType for bridge-context descriptions (belt-and-suspenders)", () => {
    const desc = "Providing MS railing on bridge with enamel painting";
    const wt = classifyWorkType(desc, "RM");
    expect(wt).toBe("bridge_finishing");
    expect(isStructureOrLocationScheduledItem({ categoryName: "Civil Works", description: desc })).toBe(true);
  });

  it("does not turn a ROAD_FURNITURE RCC foundation specification into a structure bar", () => {
    const item = {
      workCategory: "ROAD_FURNITURE",
      categoryName: "Road Furniture",
      description: "Providing RCC M20 foundation for kilometre stone",
      unit: "CUM",
    };
    expect(classifyPlanningItem(item)).toMatchObject({
      context: "discrete_road_asset",
      planningWorkType: "road",
    });
    expect(isStructureOrLocationScheduledItem(item)).toBe(false);
  });

  it("classifies culvert foundation excavation as structure even when stump removal is incidental", () => {
    const item = {
      workCategory: "CROSS_DRAINAGE",
      categoryName: "HP Culvert 1V",
      description: "Earthwork excavation in soils for foundations of structures including removal of stumps and dressing sides",
      unit: "CUM",
    };
    expect(classifyPlanningItem(item)).toMatchObject({
      context: "structure_location",
      planningWorkType: "structure",
      workType: "excavation_structure",
    });
  });

  it("uses the exported bridge predicate consistently with structure planning", () => {
    const description = "Providing elastomeric bearing on bridge deck";
    expect(isBridgeStructureDescription(description)).toBe(true);
    expect(classifyPlanningItem({ description, unit: "NOS" }).context).toBe("structure_location");
  });
});

describe("MoRTH 9.2 NP4 single-row pipe seeds", () => {
  it("retains the exact evidence-backed diameter/class/material identities", () => {
    expect(PIPE_CULVERT_NP4_1000MM_ITEM.shortLabel).toContain("NP4 1000mm");
    expect(PIPE_CULVERT_NP4_1000MM_MATERIALS.some(material => material.materialName.includes("M-149"))).toBe(true);
    expect(PIPE_CULVERT_NP4_1200MM_ITEM.shortLabel).toContain("NP4 1200mm");
    expect(PIPE_CULVERT_NP4_1200MM_MATERIALS.some(material => material.materialName.includes("M-150"))).toBe(true);
    expect(PIPE_CULVERT_NP4_300MM_ITEM.shortLabel).toContain("NP4 300mm");
    expect(PIPE_CULVERT_NP4_300MM_MATERIALS[0].materialName).toContain("M-151");
  });
});
