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
