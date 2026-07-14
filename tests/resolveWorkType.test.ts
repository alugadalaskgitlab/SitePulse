import { describe, it, expect } from "vitest";
import {
  resolveWorkType,
  classifyWorkType,
  WORK_CAT_FALLBACK_WORK_TYPE,
  WORK_CAT_PLAN_CATEGORY,
} from "../shared/workTypeRecipes";

// ──────────────────────────────────────────────────────────────────────────────
// classifyWorkType — regression guard (the existing classifier must still fire)
// ──────────────────────────────────────────────────────────────────────────────
describe("classifyWorkType — regression guard", () => {
  it("roadway_excavation from clear description + Cum unit", () => {
    expect(classifyWorkType("Roadway excavation in ordinary soil", "Cum")).toBe("roadway_excavation");
  });
  it("earthwork from embankment description", () => {
    expect(classifyWorkType("Construction of embankment with approved materials", "Cum")).toBe("earthwork");
  });
  it("gsb from description", () => {
    expect(classifyWorkType("Providing and laying Granular Sub-Base (GSB) material", "Cum")).toBe("gsb");
  });
  it("wmm from description", () => {
    expect(classifyWorkType("Wet Mix Macadam (WMM) base course", "Cum")).toBe("wmm");
  });
  it("bituminous_base from DBM description", () => {
    expect(classifyWorkType("Dense Bituminous Macadam (DBM) binder course", "Sqm")).toBe("bituminous_base");
  });
  it("bituminous_wearing from BC description", () => {
    expect(classifyWorkType("Bituminous Concrete wearing course", "Sqm")).toBe("bituminous_wearing");
  });
  it("clearing_grubbing from description", () => {
    expect(classifyWorkType("Clearing and grubbing of site", "Ha")).toBe("clearing_grubbing");
  });
  it("pcc from concrete description", () => {
    expect(classifyWorkType("Plain Cement Concrete M15 grade", "Cum")).toBe("pcc");
  });
  it("rcc from reinforced concrete", () => {
    expect(classifyWorkType("Reinforced Cement Concrete M30 for deck slab", "Cum")).toBe("rcc");
  });
  it("excavation_structure for foundation pit (CUM unit)", () => {
    expect(classifyWorkType("Excavation for foundation and footing", "Cum")).toBe("excavation_structure");
  });
  it("null for road stud supply (Nos unit — no recipe)", () => {
    expect(classifyWorkType("Supply and install road stud reflectors", "Nos")).toBeNull();
  });
  it("pipe_culvert from hume pipe description", () => {
    expect(classifyWorkType("Providing and fixing hume pipe NP3", "Rmt")).toBe("pipe_culvert");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveWorkType — Path 1: classifier fires (high confidence)
// ──────────────────────────────────────────────────────────────────────────────
describe("resolveWorkType — Path 1: classifier fires", () => {
  it("returns high confidence when regex matches", () => {
    const r = resolveWorkType("Roadway excavation in hard rock", "Cum");
    expect(r.workType).toBe("roadway_excavation");
    expect(r.resolvedBy).toBe("classifier");
    expect(r.confidence).toBe("high");
  });

  it("uses canonicalUnit over raw unit for regex checks", () => {
    const r = resolveWorkType("Embankment with approved materials", "1 Cum", {
      canonicalUnit: "Cum",
    });
    expect(r.workType).toBe("earthwork");
    expect(r.resolvedBy).toBe("classifier");
  });

  it("prime coat without context", () => {
    const r = resolveWorkType("Applying prime coat on prepared surface", "Sqm");
    expect(r.workType).toBe("prime_coat");
    expect(r.confidence).toBe("high");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveWorkType — Path 2: workCategory context fallback
//
// ALL descriptions here are deliberately crafted to NOT trigger classifyWorkType
// (the classifier is tested separately above). The purpose of this section is to
// verify the workCategory sub-classification logic inside resolveWorkType itself.
// ──────────────────────────────────────────────────────────────────────────────
describe("resolveWorkType — Path 2: workCategory fallback", () => {
  // ── EARTHWORK ──────────────────────────────────────────────────────────────

  it("EARTHWORK + no excavat keyword → earthwork default", () => {
    // "site compaction work" doesn't match embankment/earthwork/subgrade/borrow
    // and has no excavat → classifier null → default earthwork
    const r = resolveWorkType("Site compaction and preparation as directed", "Cum", {
      workCategory: "EARTHWORK",
    });
    expect(r.workType).toBe("earthwork");
    expect(r.resolvedBy).toBe("workCategory");
    expect(r.confidence).toBe("medium");
  });

  it("EARTHWORK + 'excavat' but no specific roadway/structure pattern → roadway_excavation", () => {
    // "General excavation as per instructions" — has 'excavat' but does NOT match:
    //   roadway_excavation patterns (roadway excavat | excavat in cutting|rock|etc.)
    //   structure patterns (no foundation/footing/abutment/pier/culvert/trench)
    //   earthwork patterns (no embankment/earthwork/subgrade/borrow)
    // → classifier null → workCategory EARTHWORK + 'excavat' in desc → roadway_excavation
    const r = resolveWorkType("General excavation as per instructions", "Cum", {
      workCategory: "EARTHWORK",
    });
    expect(r.workType).toBe("roadway_excavation");
    expect(r.resolvedBy).toBe("workCategory");
  });

  it("EARTHWORK + 'excavat' + structure keyword but LS unit → excavation_structure", () => {
    // The classifier's excavation_structure check REQUIRES CUM unit — LS bypasses it.
    // workCategory fallback: 'excavat' + 'footing' keyword → excavation_structure.
    const r = resolveWorkType("Excavation for footing and base slabs", "LS", {
      workCategory: "EARTHWORK",
    });
    expect(r.workType).toBe("excavation_structure");
    expect(r.resolvedBy).toBe("workCategory");
  });

  it("EARTHWORK + 'excavat' + 'abutment' but LS unit → excavation_structure", () => {
    const r = resolveWorkType("Excavation near abutment faces", "LS", {
      workCategory: "EARTHWORK",
    });
    expect(r.workType).toBe("excavation_structure");
    expect(r.resolvedBy).toBe("workCategory");
  });

  // ── SITE_CLEARANCE ─────────────────────────────────────────────────────────

  it("SITE_CLEARANCE + non-matching description → clearing_grubbing", () => {
    // "Site establishment" doesn't match clearing/grubbing/tree/stump patterns
    const r = resolveWorkType("Site establishment and mobilisation charges", "LS", {
      workCategory: "SITE_CLEARANCE",
    });
    expect(r.workType).toBe("clearing_grubbing");
    expect(r.resolvedBy).toBe("workCategory");
  });

  // ── SUBBASE_BASE ───────────────────────────────────────────────────────────

  it("SUBBASE_BASE + 'wmm' keyword → wmm (workType check)", () => {
    // Classifier may fire (wmm → wmm) — we just verify workType output is correct
    const r = resolveWorkType("WMM laying 250mm thick", "Cum", {
      workCategory: "SUBBASE_BASE",
    });
    expect(r.workType).toBe("wmm");
  });

  it("SUBBASE_BASE + no wmm keyword → gsb", () => {
    // "Granular compaction at formation" — no GSB/WMM keyword → classifier null
    const r = resolveWorkType("Granular layer compaction at formation level", "Cum", {
      workCategory: "SUBBASE_BASE",
    });
    expect(r.workType).toBe("gsb");
    expect(r.resolvedBy).toBe("workCategory");
  });

  // ── BITUMINOUS ─────────────────────────────────────────────────────────────

  it("BITUMINOUS + 'tack coat' → tack_coat (workType check)", () => {
    const r = resolveWorkType("Tack coat application as per specification", "Sqm", {
      workCategory: "BITUMINOUS",
    });
    expect(r.workType).toBe("tack_coat");
  });

  it("BITUMINOUS + 'prime coat' → prime_coat (workType check)", () => {
    const r = resolveWorkType("Prime coat on prepared surface", "Sqm", {
      workCategory: "BITUMINOUS",
    });
    expect(r.workType).toBe("prime_coat");
  });

  it("BITUMINOUS + 'BC' → bituminous_wearing (workType check)", () => {
    const r = resolveWorkType("BC layer 40mm thick", "Sqm", {
      workCategory: "BITUMINOUS",
    });
    expect(r.workType).toBe("bituminous_wearing");
  });

  it("BITUMINOUS + 'wearing' → bituminous_wearing (workType check)", () => {
    const r = resolveWorkType("Wearing course installation", "Sqm", {
      workCategory: "BITUMINOUS",
    });
    // "wearing course" alone (without "coat" or "bitumin") → classifier null
    // workCategory BITUMINOUS + 'wearing' in desc → bituminous_wearing
    expect(r.workType).toBe("bituminous_wearing");
  });

  it("BITUMINOUS + no specific sub-keyword → bituminous_base default", () => {
    // "Laying bituminous layer" — no sdbc/BC/tack/prime/dbm/wearing-coat pattern
    const r = resolveWorkType("Laying and compaction of bituminous mix layer", "Sqm", {
      workCategory: "BITUMINOUS",
    });
    expect(r.workType).toBe("bituminous_base");
    expect(r.resolvedBy).toBe("workCategory");
  });

  // ── CONCRETE ───────────────────────────────────────────────────────────────

  it("CONCRETE + 'RCC' → rcc (workType check)", () => {
    const r = resolveWorkType("RCC deck slab M30 grade", "Cum", {
      workCategory: "CONCRETE",
    });
    expect(r.workType).toBe("rcc");
  });

  it("CONCRETE + 'pqc' → pqc (workType check)", () => {
    const r = resolveWorkType("PQC slab 300mm thick", "Sqm", {
      workCategory: "CONCRETE",
    });
    expect(r.workType).toBe("pqc");
  });

  it("CONCRETE + no specific keyword → pcc default", () => {
    // "Concrete work at site" — 'concrete' alone doesn't match 'pcc|plain cement concrete|cement concrete'
    // nor 'concrete of grade|grade m-?NN'
    const r = resolveWorkType("Concrete work at site as per specifications", "Cum", {
      workCategory: "CONCRETE",
    });
    expect(r.workType).toBe("pcc");
    expect(r.resolvedBy).toBe("workCategory");
  });

  it("CONCRETE + 'DLC' → dlc (workType check)", () => {
    const r = resolveWorkType("DLC sub-base layer 150mm", "Cum", {
      workCategory: "CONCRETE",
    });
    expect(r.workType).toBe("dlc");
  });

  // ── CROSS_DRAINAGE / DRAINAGE ──────────────────────────────────────────────

  it("CROSS_DRAINAGE + no pipe keyword → drain_masonry via workCategory", () => {
    // "Culvert structure walls" — 'culvert' alone (no excavat) with Nos unit → classifier
    // excavation_structure requires CUM; line 401 (hume pipe/RCC pipe/etc.) not matched
    const r = resolveWorkType("Culvert structure including inlet and outlet walls", "Nos", {
      workCategory: "CROSS_DRAINAGE",
    });
    expect(r.workType).toBe("drain_masonry");
    expect(r.resolvedBy).toBe("workCategory");
  });

  it("DRAINAGE → drain_masonry via workCategory fallback", () => {
    // "Side drain channel" — 'drain' may not trigger masonry classifier
    // (needs masonry/brick/stone/drain wall/head wall/wing wall)
    const r = resolveWorkType("Side drain channel formation and lining", "Rmt", {
      workCategory: "DRAINAGE",
    });
    // Classifier may return drain_masonry if 'drain...wall' matches, or null → workCategory
    // Either way the workType should be drain_masonry
    expect(r.workType).toBe("drain_masonry");
  });

  // ── SHOULDERS_MEDIANS ──────────────────────────────────────────────────────

  it("SHOULDERS_MEDIANS + no earthen-shoulder keyword → earthwork default", () => {
    // "Shoulder formation" — NOT "earthen shoulder" so classifier earthwork doesn't fire
    const r = resolveWorkType("Shoulder formation and compaction", "Cum", {
      workCategory: "SHOULDERS_MEDIANS",
    });
    expect(r.workType).toBe("earthwork");
    expect(r.resolvedBy).toBe("workCategory");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// resolveWorkType — Path 3: unresolvable
// ──────────────────────────────────────────────────────────────────────────────
describe("resolveWorkType — Path 3: unresolvable", () => {
  it("no workCategory → none", () => {
    const r = resolveWorkType("Supply and install high mast lighting pole", "Nos");
    expect(r.workType).toBeNull();
    expect(r.resolvedBy).toBe("none");
    expect(r.confidence).toBe("none");
    expect(r.reason).toMatch(/no work category/i);
  });

  it("ROAD_FURNITURE (no recipe template) → null with reason", () => {
    const r = resolveWorkType("Supply and install delineator posts", "Nos", {
      workCategory: "ROAD_FURNITURE",
    });
    expect(r.workType).toBeNull();
    expect(r.resolvedBy).toBe("none");
    expect(r.reason).toMatch(/no automated recipe/i);
  });

  it("ELECTRICAL (no recipe template) → null with reason", () => {
    const r = resolveWorkType("Supply and installation of street lights", "Nos", {
      workCategory: "ELECTRICAL",
    });
    expect(r.workType).toBeNull();
    expect(r.resolvedBy).toBe("none");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// WORK_CAT_PLAN_CATEGORY — maps every category to a planning track
// ──────────────────────────────────────────────────────────────────────────────
describe("WORK_CAT_PLAN_CATEGORY", () => {
  const roadCats = [
    "EARTHWORK", "SITE_CLEARANCE", "SUBBASE_BASE", "BITUMINOUS",
    "SHOULDERS_MEDIANS", "ROAD_FURNITURE", "PRELIM", "ELECTRICAL",
    "BUILDINGS", "ENVIRONMENTAL",
  ];
  const structureCats = ["DRAINAGE", "CROSS_DRAINAGE", "MAJOR_BRIDGES", "CONCRETE"];

  for (const cat of roadCats) {
    it(`${cat} → "road"`, () => {
      expect(WORK_CAT_PLAN_CATEGORY[cat]).toBe("road");
    });
  }
  for (const cat of structureCats) {
    it(`${cat} → "structure"`, () => {
      expect(WORK_CAT_PLAN_CATEGORY[cat]).toBe("structure");
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// WORK_CAT_FALLBACK_WORK_TYPE — sanity check on default mappings
// ──────────────────────────────────────────────────────────────────────────────
describe("WORK_CAT_FALLBACK_WORK_TYPE", () => {
  it("EARTHWORK → earthwork", () => expect(WORK_CAT_FALLBACK_WORK_TYPE.EARTHWORK).toBe("earthwork"));
  it("SITE_CLEARANCE → clearing_grubbing", () => expect(WORK_CAT_FALLBACK_WORK_TYPE.SITE_CLEARANCE).toBe("clearing_grubbing"));
  it("SUBBASE_BASE → gsb", () => expect(WORK_CAT_FALLBACK_WORK_TYPE.SUBBASE_BASE).toBe("gsb"));
  it("BITUMINOUS → bituminous_base", () => expect(WORK_CAT_FALLBACK_WORK_TYPE.BITUMINOUS).toBe("bituminous_base"));
  it("CONCRETE → pcc", () => expect(WORK_CAT_FALLBACK_WORK_TYPE.CONCRETE).toBe("pcc"));
  it("DRAINAGE → drain_masonry", () => expect(WORK_CAT_FALLBACK_WORK_TYPE.DRAINAGE).toBe("drain_masonry"));
});

// ──────────────────────────────────────────────────────────────────────────────
// Edge cases: unit canonicalization, typos, ambiguous descriptions
// ──────────────────────────────────────────────────────────────────────────────
describe("resolveWorkType — edge cases", () => {
  it("canonicalUnit used over raw unit for earthwork rule", () => {
    // raw unit "1 Cum" → normaliseBoqUnit → "CUM"; classifier should still fire
    const r = resolveWorkType("Embankment construction with approved materials", "1 Cum", {
      canonicalUnit: "Cum",
    });
    expect(r.workType).toBe("earthwork");
  });

  it("empty description with EARTHWORK category → earthwork fallback", () => {
    const r = resolveWorkType("", "Cum", { workCategory: "EARTHWORK" });
    expect(r.workType).toBe("earthwork");
    expect(r.resolvedBy).toBe("workCategory");
  });

  it("'SDBC' resolves to bituminous_wearing via classifier", () => {
    const r = resolveWorkType("Semi dense bituminous concrete SDBC 25mm thick", "Sqm");
    expect(r.workType).toBe("bituminous_wearing");
    expect(r.resolvedBy).toBe("classifier");
  });

  it("'GSB' abbreviation resolves via classifier", () => {
    const r = resolveWorkType("GSB 200mm thick compacted layer", "Cum");
    expect(r.workType).toBe("gsb");
    expect(r.resolvedBy).toBe("classifier");
  });

  it("hill cutting resolves via classifier", () => {
    const r = resolveWorkType("Hill cutting in ordinary rock strata", "Cum");
    expect(r.workType).toBe("roadway_excavation");
    expect(r.resolvedBy).toBe("classifier");
  });

  it("formation excavation resolves via classifier", () => {
    const r = resolveWorkType("Formation excavation in hard soil", "Cum");
    expect(r.workType).toBe("roadway_excavation");
    expect(r.resolvedBy).toBe("classifier");
  });

  it("no workCategory + odd unit → null", () => {
    const r = resolveWorkType("Miscellaneous item as per site", "Nos");
    expect(r.workType).toBeNull();
    expect(r.resolvedBy).toBe("none");
  });

  it("SITE_CLEARANCE with canonicalUnit → clearing_grubbing", () => {
    // canonicalUnit provided but description doesn't trigger classifier
    const r = resolveWorkType("Land clearing operations", "LS", {
      workCategory: "SITE_CLEARANCE",
      canonicalUnit: "LS",
    });
    expect(r.workType).toBe("clearing_grubbing");
  });
});
