import { describe, expect, it } from "vitest";
import {
  boqIdentitySignature,
  canPropagateDuplicateMapping,
  classifyBoqItem,
  classifyBoqItemForSnl,
  isPrimaryRuleCandidate,
  ruleMatchSnl,
} from "../server/snlAutoMapper";

type Candidate = { id: number; description: string; shortLabel: string | null; unit: string };

const row = (id: number, description: string, unit = "CUM"): Candidate => ({
  id,
  description,
  shortLabel: description,
  unit,
});

describe("identity-first deterministic SNL rule matching", () => {
  it("never coalesces identity-bearing variants for duplicate propagation", () => {
    const source = {
      description: "Laying NP4 RCC Hume pipe 1000mm in single row",
      unit: "RM",
      mappedBy: "rule",
      isAutoMapped: true,
      confidenceScore: 0.82,
    };
    const variants = [
      "Laying NP3 RCC Hume pipe 1000mm in single row",
      "Laying NP4 RCC Hume pipe 1200mm in single row",
      "Laying NP4 RCC Hume pipe 1000mm in double row",
      "PCC M15 nominal mix 1:2:4",
      "PCC M10 nominal mix 1:3:6",
      "Dense Bituminous Macadam Grading I",
      "Dense Bituminous Macadam Grading II",
      "Mandatory sign board",
      "Cautionary sign board",
      "W-beam crash barrier",
      "Thrie-beam crash barrier",
    ];
    for (const description of variants) {
      expect(boqIdentitySignature(source.description, source.unit))
        .not.toBe(boqIdentitySignature(description, description.includes("barrier") ? "LM" : "RM"));
      expect(canPropagateDuplicateMapping(source, {
        description,
        unit: description.includes("barrier") ? "LM" : "RM",
      })).toBe(false);
    }
  });

  it("only propagates an exact signature from a deterministic automatic source", () => {
    const description = "Providing and laying Wet Mix Macadam (WMM), 250 mm thick.";
    const source = { description, unit: "CUM", mappedBy: "rule", isAutoMapped: true, confidenceScore: 0.82 };
    expect(canPropagateDuplicateMapping(source, {
      description: "Providing and laying wet mix macadam wmm 250 mm thick",
      unit: "Cum",
    })).toBe(true);
    expect(canPropagateDuplicateMapping({ ...source, mappedBy: "auto", confidenceScore: 0.82 }, {
      description,
      unit: "CUM",
    })).toBe(false);
    expect(canPropagateDuplicateMapping({ ...source, isAutoMapped: false }, {
      description,
      unit: "CUM",
    })).toBe(false);
  });

  it("uses auditable source precedence for duplicate standard road identities", () => {
    const duplicates = [
      { ...row(1, "Tack Coat", "SQM"), itemCode: "5.2", sourceCode: "SDB_ROAD" },
      { ...row(2, "Tack Coat", "SQM"), itemCode: "5.2", sourceCode: "MORTH_SDB_2019" },
    ];
    expect(ruleMatchSnl("TACK_COAT", duplicates, "Providing and applying tack coat")).toEqual({
      snlItemId: 2,
      confidence: 0.82,
    });
  });

  it("admits curated unsectored MoRTH recipe masters only by compatible category", () => {
    expect(isPrimaryRuleCandidate("road_pavement", {
      sector: null,
      sourceCode: "MORTH_SDB_2019",
      workCategory: "SUBBASE_BASE",
    })).toBe(true);
    expect(isPrimaryRuleCandidate("road_furniture", {
      sector: null,
      sourceCode: "MORTH_SDB_2019",
      workCategory: "SUBBASE_BASE",
    })).toBe(false);
  });

  it("prefers curated WMM/DBM recipe codes over duplicate standard-book identities", () => {
    expect(ruleMatchSnl("WMM", [
      { ...row(1, "Wet Mix Macadam", "CUM"), itemCode: "4.12", sourceCode: "MORTH_SDB_2019" },
      { ...row(2, "Wet Mix Macadam WMM Plant Mix", "CUM"), itemCode: "4.14", sourceCode: "MORTH_SDB_2019" },
    ], "Wet Mix Macadam WMM")).toEqual({ snlItemId: 2, confidence: 0.82 });
    expect(ruleMatchSnl("DBM", [
      { ...row(3, "Dense Graded Bituminous Macadam Grading-II", "CUM"), itemCode: "5.6-ii", sourceCode: "MORTH_SDB_2019" },
      { ...row(4, "Dense Graded Bituminous Macadam DBM Grading-II", "CUM"), itemCode: "5.04B", sourceCode: "MORTH_SDB_2019" },
    ], "Dense Graded Bituminous Macadam Grading-II")).toEqual({ snlItemId: 4, confidence: 0.82 });
  });

  it("classifies actual ALLADURG primary work ahead of incidental substrate/foundations", () => {
    expect(classifyBoqItemForSnl(
      "Providing and applying primer coat with SS-1 on prepared WMM surface",
    )).toBe("PRIME_COAT");
    expect(classifyBoqItemForSnl(
      "Providing tack coat RS-1 on granular surfaces treated with primer",
    )).toBe("TACK_COAT");
    expect(classifyBoqItemForSnl(
      "Informatory sign board fixed in M15 cement concrete foundation blocks",
    )).toBe("SIGNAGE");
    expect(classifyBoqItemForSnl(
      "RCC M15 grade kilometre stone fixed in concrete foundation",
    )).toBe("ROAD_STONES");
  });

  it.each([
    ["Wet Mix Macadam", "WMM"],
    ["Dense bituminous macadam Grading II", "DBM"],
    ["Bituminous concrete wearing course", "BC"],
    ["Applying tack coat", "TACK_COAT"],
    ["Applying prime coat", "PRIME_COAT"],
    ["Construction of embankment from borrow material", "EMBANKMENT"],
    ["Preparation of sub-grade", "SUBGRADE"],
    ["RCC Hume pipe NP4 1000 mm dia, HP Culvert 1V", "PIPE_CULVERT"],
    ["Providing rumble strips", "RUMBLE_STRIPS"],
    ["Providing reflective road studs", "REFLECTIVE_STUDS"],
  ])("classifies %s as the canonical rule family", (description, expected) => {
    expect(classifyBoqItemForSnl(description)).toBe(expected);
  });

  it("resolves obvious unique road recipe masters at unchanged confidence", () => {
    const candidates = [
      row(1, "Wet Mix Macadam (Plant Mix Method) WMM"),
      row(2, "Dense Bituminous Macadam Grading-II DBM"),
      row(3, "Bituminous Concrete BC"),
    ];
    expect(ruleMatchSnl("WMM", candidates, "Providing and laying WMM")).toEqual({
      snlItemId: 1,
      confidence: 0.82,
    });
    expect(ruleMatchSnl("DBM", candidates, "Dense Bituminous Macadam Grading II")).toEqual({
      snlItemId: 2,
      confidence: 0.82,
    });
    expect(ruleMatchSnl("BC", candidates, "Bituminous concrete wearing course")).toEqual({
      snlItemId: 3,
      confidence: 0.82,
    });
  });

  it("leaves equal compatible canonical identities unresolved", () => {
    expect(ruleMatchSnl("WMM", [
      row(1, "Wet Mix Macadam WMM, laying by grader"),
      row(2, "Wet Mix Macadam WMM, laying by paver"),
    ], "Providing and laying WMM")).toBeNull();
  });

  it("uses PCC grade as a veto and never substitutes another grade", () => {
    const candidates = [
      row(10, "Plain Cement Concrete PCC M10 nominal mix 1:3:6"),
      row(15, "Plain Cement Concrete PCC M15 nominal mix 1:2:4"),
    ];
    expect(ruleMatchSnl("PCC_M15", candidates, "PCC M15 in foundation")).toEqual({
      snlItemId: 15,
      confidence: 0.82,
    });
    expect(ruleMatchSnl("PCC_M20", candidates, "PCC M20 in foundation")).toBeNull();
    expect(ruleMatchSnl("PCC", candidates, "Plain cement concrete in foundation")).toBeNull();
  });

  it("uses exact nominal mix identity when a grade is not stated", () => {
    expect(ruleMatchSnl("PCC", [
      row(10, "PCC M10 nominal mix 1:3:6"),
      row(15, "PCC M15 nominal mix 1:2:4"),
    ], "Providing PCC nominal mix 1:3:6")).toEqual({ snlItemId: 10, confidence: 0.82 });
  });

  it.each([
    ["ROAD_STONES", "Providing kilometre stone", [
      row(1, "RCC kilometre stone", "NOS"),
      row(2, "RCC hectometre stone", "NOS"),
    ], 1],
    ["SIGNAGE", "Providing mandatory traffic sign board", [
      row(3, "Mandatory regulatory traffic sign board", "NOS"),
      row(4, "Cautionary warning traffic sign board", "NOS"),
    ], 3],
    ["CRASH_BARRIER", "Providing W-beam crash barrier", [
      row(5, "W-beam metal beam crash barrier", "LM"),
      row(6, "Thrie-beam crash barrier", "LM"),
    ], 5],
  ] as const)("resolves the exact %s subtype", (tag, description, candidates, expectedId) => {
    expect(ruleMatchSnl(tag, [...candidates], description)).toEqual({
      snlItemId: expectedId,
      confidence: 0.82,
    });
  });

  it("recognises the ALLADURG H.M. stone abbreviation as hectometre identity", () => {
    expect(ruleMatchSnl("ROAD_STONES", [
      row(1, "RCC kilometre stone", "NOS"),
      row(2, "RCC hectometre stone", "NOS"),
    ], "RCC M15 grade H.M. Stone (200M) Stone")).toEqual({
      snlItemId: 2,
      confidence: 0.82,
    });
  });

  it("classifies added safety families as road furniture", () => {
    expect(classifyBoqItem("Providing rumble strips across carriageway")).toBe("road_furniture");
    expect(classifyBoqItem("Fixing reflective studs along centre line")).toBe("road_furniture");
  });

  it("dry-runs the in-memory Pampad-style fixture without writes", () => {
    const unambiguous = [
      ["WMM", "Providing Wet Mix Macadam", [row(1, "Wet Mix Macadam WMM")]],
      ["DBM", "Dense Bituminous Macadam", [row(2, "Dense Bituminous Macadam DBM")]],
      ["BC", "Bituminous Concrete", [row(3, "Bituminous Concrete BC")]],
      ["TACK_COAT", "Applying tack coat", [row(4, "Tack Coat")]],
      ["PRIME_COAT", "Applying prime coat", [row(5, "Prime Coat")]],
      ["EMBANKMENT", "Construction of embankment", [row(6, "Embankment Construction")]],
      ["SUBGRADE", "Preparation of subgrade", [row(7, "Subgrade Preparation")]],
      ["PCC_M15", "PCC M15", [row(8, "PCC M15")]],
      ["PIPE_CULVERT", "1000mm NP4 Hume pipe single row", [row(9, "Hume pipe 1000mm NP4 single row", "RM")]],
      ["ROAD_STONES", "Kilometre stone", [row(10, "Kilometre stone", "NOS")]],
      ["SIGNAGE", "Mandatory sign board", [row(11, "Mandatory traffic sign board", "NOS")]],
      ["THERMOPLASTIC_MARKING", "Thermoplastic road marking", [row(12, "Thermoplastic road marking", "SQM")]],
      ["CRASH_BARRIER", "W-beam crash barrier", [row(13, "W-beam metal beam crash barrier", "LM")]],
      ["RUMBLE_STRIPS", "Rumble strips", [row(14, "Rumble strips", "SQM")]],
      ["REFLECTIVE_STUDS", "Reflective road studs", [row(15, "Reflective road studs", "NOS")]],
    ] as const;
    const ambiguous = [
      ["WMM", "WMM", [row(20, "WMM wet mix macadam by grader"), row(21, "WMM wet mix macadam by paver")]],
      ["PCC", "PCC", [row(22, "PCC M10"), row(23, "PCC M15")]],
      ["PIPE_CULVERT", "1000mm NP4 Hume pipe", [
        row(24, "1000mm NP4 Hume pipe single row", "RM"),
        row(25, "1000mm NP4 Hume pipe double row", "RM"),
      ]],
      ["SIGNAGE", "Traffic sign board", [
        row(26, "Mandatory traffic sign board", "NOS"),
        row(27, "Cautionary traffic sign board", "NOS"),
      ]],
    ] as const;

    const mapped = unambiguous.filter(([tag, description, rows]) =>
      ruleMatchSnl(tag, [...rows], description) !== null).length;
    const needsReview = ambiguous.filter(([tag, description, rows]) =>
      ruleMatchSnl(tag, [...rows], description) === null).length;

    expect({ mapped, needsReview, total: mapped + needsReview }).toEqual({
      mapped: 15,
      needsReview: 4,
      total: 19,
    });
  });
});