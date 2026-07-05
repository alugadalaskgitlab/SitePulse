import { describe, it, expect } from "vitest";
import { classifyWorkType, isStructureOrLocationScheduledItem } from "../shared/workTypeRecipes";

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
});
