import { describe, it, expect } from "vitest";
import { classifyWorkType, WORK_TYPE_PLAN_CATEGORY } from "../shared/workTypeRecipes";

// ─── Protective / miscellaneous items must classify as "structure" category ───
// so they are excluded from road-reach Auto-generate / Auto-sequence and can
// only be planned via the frozen Structure Schedule Import (V1 planning boundary).

describe("classifyWorkType — protective/misc structure-adjacent items", () => {
  it("classifies chute drain items as chute_drain (structure category)", () => {
    const wt = classifyWorkType("Providing and laying chute drain", "RM");
    expect(wt).toBe("chute_drain");
    expect(WORK_TYPE_PLAN_CATEGORY[wt!]).toBe("structure");
  });

  it("classifies dissipation chamber items as dissipation_chamber (structure category)", () => {
    const wt = classifyWorkType("Construction of dissipation chamber", "Nos");
    expect(wt).toBe("dissipation_chamber");
    expect(WORK_TYPE_PLAN_CATEGORY[wt!]).toBe("structure");
  });

  it("classifies dissipation pad/basin variants as dissipation_chamber", () => {
    expect(classifyWorkType("Energy dissipation pad at outfall", "Nos")).toBe("dissipation_chamber");
    expect(classifyWorkType("Dissipation basin construction", "Nos")).toBe("dissipation_chamber");
  });

  it("classifies turfing items as turfing (structure category)", () => {
    const wt = classifyWorkType("Turfing on slopes", "SQM");
    expect(wt).toBe("turfing");
    expect(WORK_TYPE_PLAN_CATEGORY[wt!]).toBe("structure");
  });

  it("classifies weep hole items as weep_holes (structure category)", () => {
    const wt = classifyWorkType("Providing weep holes in breast wall", "Nos");
    expect(wt).toBe("weep_holes");
    expect(WORK_TYPE_PLAN_CATEGORY[wt!]).toBe("structure");
  });

  it("classifies retaining wall items as retaining_wall_structure (structure category)", () => {
    const wt = classifyWorkType("Construction of RCC retaining wall", "CUM");
    expect(wt).toBe("retaining_wall_structure");
    expect(WORK_TYPE_PLAN_CATEGORY[wt!]).toBe("structure");
  });

  it("does not misclassify these as generic drain_masonry", () => {
    expect(classifyWorkType("Chute drain in stone masonry", "RM")).toBe("chute_drain");
    expect(classifyWorkType("Retaining wall in stone masonry", "CUM")).toBe("retaining_wall_structure");
  });
});

// ─── Bridge-context items (issue #2/#3) must classify by CONTEXT, not just a
// loose keyword — these must never be split into road Reach 1-4 bars. ───────

describe("classifyWorkType — bridge/structure context items (never road-split)", () => {
  it("classifies POT/PTFE bearings as bridge_bearing (structure category)", () => {
    expect(classifyWorkType("Supply of POT PTFE bearings", "Nos")).toBe("bridge_bearing");
    expect(classifyWorkType("Elastomeric bearing pad", "Nos")).toBe("bridge_bearing");
    expect(WORK_TYPE_PLAN_CATEGORY["bridge_bearing"]).toBe("structure");
  });

  it("classifies tar paper under bearings as bridge_bearing", () => {
    expect(classifyWorkType("Tar paper below bearing seat", "SQM")).toBe("bridge_bearing");
  });

  it("does not misclassify generic 'bearing capacity of soil' as bridge_bearing", () => {
    expect(classifyWorkType("Determination of bearing capacity of soil", "Nos")).not.toBe("bridge_bearing");
  });

  it("classifies bridge numbering and bridge painting as bridge_finishing", () => {
    expect(classifyWorkType("Bridge numbering as per IRC", "Nos")).toBe("bridge_finishing");
    expect(classifyWorkType("Painting of bridge railing", "SQM")).toBe("bridge_finishing");
    expect(WORK_TYPE_PLAN_CATEGORY["bridge_finishing"]).toBe("structure");
  });

  it("classifies drainage spouts as drainage_spout (structure category)", () => {
    expect(classifyWorkType("Providing drainage spout in deck slab", "Nos")).toBe("drainage_spout");
    expect(WORK_TYPE_PLAN_CATEGORY["drainage_spout"]).toBe("structure");
  });

  it("classifies expansion joints as expansion_joint (structure category)", () => {
    expect(classifyWorkType("Supply and fixing of expansion joint", "RM")).toBe("expansion_joint");
    expect(WORK_TYPE_PLAN_CATEGORY["expansion_joint"]).toBe("structure");
  });

  it("classifies approach slabs as approach_slab (structure category), never road", () => {
    expect(classifyWorkType("RCC approach slab at bridge end", "CUM")).toBe("approach_slab");
    expect(WORK_TYPE_PLAN_CATEGORY["approach_slab"]).toBe("structure");
  });

  it("classifies crash barrier on bridge/deck as bridge_crash_barrier", () => {
    expect(classifyWorkType("Crash barrier on bridge deck", "RM")).toBe("bridge_crash_barrier");
    expect(WORK_TYPE_PLAN_CATEGORY["bridge_crash_barrier"]).toBe("structure");
  });

  it("does not force plain road crash barrier (no bridge context) into bridge_crash_barrier", () => {
    expect(classifyWorkType("Metal beam crash barrier along embankment", "RM")).not.toBe("bridge_crash_barrier");
  });

  it("classifies filter media behind abutment/retaining wall as filter_media (structure category)", () => {
    expect(classifyWorkType("Filter media behind abutment", "CUM")).toBe("filter_media");
    expect(WORK_TYPE_PLAN_CATEGORY["filter_media"]).toBe("structure");
  });

  it("classifies foundation excavation for bridges/culverts/retaining walls/drains as excavation_structure", () => {
    expect(classifyWorkType("Excavation for foundation of bridge pier", "CUM")).toBe("excavation_structure");
    expect(classifyWorkType("Excavation for foundation of retaining wall", "CUM")).toBe("retaining_wall_structure");
    expect(classifyWorkType("Excavation for foundation of drain", "CUM")).toBe("excavation_structure");
    expect(WORK_TYPE_PLAN_CATEGORY["excavation_structure"]).toBe("structure");
  });
});
