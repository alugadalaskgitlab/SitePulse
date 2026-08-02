import { describe, it, expect } from "vitest";
import { canonicalizeUnit, normaliseBoqUnit, checkMappingUomCompatibility, type UomConversionProfile } from "../shared/boqNormalise";

describe("canonicalizeUnit — cubic metre variants", () => {
  it.each([
    ["CUM",          "Cum"],
    ["cum",          "Cum"],
    ["Cum",          "Cum"],
    ["1 Cum",        "Cum"],
    ["1.00 Cum",     "Cum"],
    ["1CUM",         "Cum"],
    ["1 CUM",        "Cum"],
    ["m3",           "Cum"],
    ["M3",           "Cum"],
    ["Cu.m",         "Cum"],
    ["cu.m",         "Cum"],
    ["Cu M",         "Cum"],
    ["Cubic Metre",  "Cum"],
    ["Cubic Meter",  "Cum"],
    ["cubic meter",  "Cum"],
    ["CUBICMETER",   "Cum"],
    ["cubm",         "Cum"],
    ["CBM",          "Cum"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — square metre variants", () => {
  it.each([
    ["SQM",          "Sqm"],
    ["sqm",          "Sqm"],
    ["1 Sqm",        "Sqm"],
    ["1.00 SQM",     "Sqm"],
    ["m2",           "Sqm"],
    ["M2",           "Sqm"],
    ["Sq.m",         "Sqm"],
    ["sq.m",         "Sqm"],
    ["SQMTR",        "Sqm"],
    ["sqmtr",        "Sqm"],
    ["SQMT",         "Sqm"],
    ["Square Metre", "Sqm"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — hectare variants", () => {
  it.each([
    ["Ha",       "Ha"],
    ["HA",       "Ha"],
    ["ha",       "Ha"],
    ["1 Ha",     "Ha"],
    ["1 Hect",   "Ha"],
    ["1.00 Ha",  "Ha"],
    ["Hect",     "Ha"],
    ["HECT",     "Ha"],
    ["Hectare",  "Ha"],
    ["hectare",  "Ha"],
    ["HECTARE",  "Ha"],
    ["hectares", "Ha"],
    ["Hec",      "Ha"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — running/linear metre variants", () => {
  it.each([
    ["Rmt",            "Rmt"],
    ["RMT",            "Rmt"],
    ["rmt",            "Rmt"],
    ["1 Rmt",          "Rmt"],
    ["RM",             "Rmt"],
    ["LM",             "Rmt"],
    ["LMT",            "Rmt"],
    ["MTR",            "Rmt"],
    ["mtr",            "Rmt"],
    ["Running Meter",  "Rmt"],
    ["Running Metre",  "Rmt"],
    ["Linear Meter",   "Rmt"],
    ["RUNNIGMETER",    "Rmt"],  // typo variant
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — metric tonne variants", () => {
  it.each([
    ["MT",            "MT"],
    ["mt",            "MT"],
    ["1 MT",          "MT"],
    ["Tonne",         "MT"],
    ["TONNE",         "MT"],
    ["Tonnes",        "MT"],
    ["ton",           "MT"],
    ["Tons",          "MT"],
    ["Metric Tonne",  "MT"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — kilogram variants", () => {
  it.each([
    ["Kg",   "Kg"],
    ["KG",   "Kg"],
    ["KGs",  "Kg"],
    ["1 KG", "Kg"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — each/number variants", () => {
  it.each([
    ["Nos",    "Nos"],
    ["NOS",    "Nos"],
    ["nos",    "Nos"],
    ["No",     "Nos"],
    ["EA",     "Nos"],
    ["Each",   "Nos"],
    ["Number", "Nos"],
    ["Pieces", "Nos"],
    ["PCS",    "Nos"],
    ["1 NOS",  "Nos"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — lump sum / job variants", () => {
  it.each([
    ["LS",       "LS"],
    ["ls",       "LS"],
    ["Lumpsum",  "LS"],
    ["LUMPSUM",  "LS"],
    ["LOT",      "LS"],
    ["Lot",      "LS"],
    ["Job",      "Job"],
    ["JOB",      "Job"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — kilolitre variants", () => {
  it.each([
    ["KL",       "KL"],
    ["kl",       "KL"],
    ["Kilolitre","KL"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });
});

describe("canonicalizeUnit — prefix stripping", () => {
  it("strips integer prefix: '1 Cum' → 'Cum'",  () => expect(canonicalizeUnit("1 Cum")).toBe("Cum"));
  it("strips decimal prefix: '1.00 Sqm' → 'Sqm'", () => expect(canonicalizeUnit("1.00 Sqm")).toBe("Sqm"));
  it("strips prefix without space: '1CUM' → 'Cum'", () => expect(canonicalizeUnit("1CUM")).toBe("Cum"));
  it("prefix only with no unit falls through",  () => {
    const result = canonicalizeUnit("1");
    expect(result).toBeDefined();
  });
});

describe("canonicalizeUnit — unknown units pass through gracefully", () => {
  it("UNIT passes through as-is (unrecognised)", () => {
    const result = canonicalizeUnit("UNIT");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
  it("empty string passes through", () => expect(canonicalizeUnit("")).toBe(""));
  it("arbitrary text preserved",    () => expect(canonicalizeUnit("BOGUS")).toBe("BOGUS"));
});

describe("normaliseBoqUnit — uppercase alias", () => {
  it("returns uppercase canonical: 'Cum' → 'CUM'", () => expect(normaliseBoqUnit("1 Cum")).toBe("CUM"));
  it("returns uppercase: 'Sqm' → 'SQM'",            () => expect(normaliseBoqUnit("1 Sqm")).toBe("SQM"));
  it("returns uppercase: 'Ha' → 'HA'",              () => expect(normaliseBoqUnit("Ha")).toBe("HA"));
  it("returns uppercase: 'Rmt' → 'RMT'",            () => expect(normaliseBoqUnit("RMT")).toBe("RMT"));
  it("returns uppercase: 'MT' → 'MT'",              () => expect(normaliseBoqUnit("MT")).toBe("MT"));
  it("classifyWorkType compat: 'm3' → 'CUM'",       () => expect(normaliseBoqUnit("m3")).toBe("CUM"));
  it("classifyWorkType compat: 'Cu.m' → 'CUM'",     () => expect(normaliseBoqUnit("Cu.m")).toBe("CUM"));
  it("classifyWorkType compat: '1 Hect' → 'HA'",    () => expect(normaliseBoqUnit("1 Hect")).toBe("HA"));
  it("planningEngine compat: 'MTR' → 'RMT'",        () => expect(normaliseBoqUnit("MTR")).toBe("RMT"));
});

// ─── Instruction 021A: checkMappingUomCompatibility safety tests ──────────────
describe("checkMappingUomCompatibility — 021A: allowedUoms must not grant factor-1 for dimensionally different UOMs", () => {
  // Test A: Material defaultUom=MT, allowedUoms=[MT,CUM], no profile/density, BOQ UOM=CUM
  // MUST be blocked — allowedUoms alone cannot bridge MT↔CUM at factor 1.
  it("A: CUM blocked when defaultUom=MT, allowedUoms=[MT,CUM], no profile/density", () => {
    const result = checkMappingUomCompatibility("CUM", {
      defaultUom: "MT",
      allowedUoms: JSON.stringify(["MT", "CUM"]),
      bulkDensity: null,
      conversionFactor: null,
      conversionFromUom: null,
      conversionToUom: null,
    });
    expect(result.compatible).toBe(false);
    expect(result.conversionFactor).not.toBe(1);
  });

  it("A: MT in allowedUoms does not grant CUM→MT at factor 1 without density or profile", () => {
    const result = checkMappingUomCompatibility("CUM", {
      defaultUom: "MT",
      allowedUoms: JSON.stringify(["MT"]),
      bulkDensity: null,
    });
    expect(result.compatible).toBe(false);
    expect(result.mode).toBe("incompatible");
  });

  it("A: CFT blocked when defaultUom=MT, allowedUoms=[MT,CFT], no profile/density", () => {
    const result = checkMappingUomCompatibility("CFT", {
      defaultUom: "MT",
      allowedUoms: JSON.stringify(["MT", "CFT"]),
      bulkDensity: null,
    });
    expect(result.compatible).toBe(false);
  });
});

describe("checkMappingUomCompatibility — 021A: standard-equivalent pairs succeed at factor 1", () => {
  // Test B: MT/Ton/Tonne, Cum/m3, L/Litre all canonicalize to the same form or are areSameUomGroup
  it("B: Ton → MT at factor 1", () => {
    const result = checkMappingUomCompatibility("Ton", { defaultUom: "MT" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
    expect(result.mode).toBe("direct");
  });

  it("B: Tonne → MT at factor 1", () => {
    const result = checkMappingUomCompatibility("Tonne", { defaultUom: "MT" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
    expect(result.mode).toBe("direct");
  });

  it("B: m3 → CUM at factor 1", () => {
    const result = checkMappingUomCompatibility("m3", { defaultUom: "CUM" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
    expect(result.mode).toBe("direct");
  });

  it("B: Cum → m3 at factor 1", () => {
    const result = checkMappingUomCompatibility("Cum", { defaultUom: "m3" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
    expect(result.mode).toBe("direct");
  });

  it("B: L → Litre at factor 1 (bare L is a litre alias)", () => {
    const result = checkMappingUomCompatibility("L", { defaultUom: "Litre" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
    expect(result.mode).toBe("direct");
  });

  it("B: Litre → L at factor 1 (reverse)", () => {
    const result = checkMappingUomCompatibility("Litre", { defaultUom: "L" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
    expect(result.mode).toBe("direct");
  });
});

describe("checkMappingUomCompatibility — 021A: correct target profile selected", () => {
  const profiles = (): UomConversionProfile[] => [
    { id: 1, fromUom: "CUM", toUom: "MT",  conversionFactor: 2.2,     conversionType: "fixed_factor", isActive: 1 },
    { id: 2, fromUom: "CUM", toUom: "CFT", conversionFactor: 35.3147, conversionType: "fixed_factor", isActive: 1 },
  ];

  // Test C: material defaultUom=MT → only profile id=1 (CUM→MT) is applicable
  it("C: selects CUM→MT (id=1) when defaultUom=MT, ignores CUM→CFT (id=2)", () => {
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, profiles());
    expect(result.compatible).toBe(true);
    expect(result.mode).toBe("conversion_profile");
    expect(result.conversionProfileId).toBe(1);
    expect(result.conversionFactor).toBe(2.2);
  });

  // Test D: material defaultUom=MT, only profile CUM→CFT exists → no match → blocked
  it("D: blocked when only CUM→CFT profile exists and defaultUom=MT", () => {
    const p: UomConversionProfile[] = [
      { id: 3, fromUom: "CUM", toUom: "CFT", conversionFactor: 35.3147, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.compatible).toBe(false);
  });

  // Test E: two active CUM→MT profiles → AMBIGUOUS
  it("E: MATERIAL_CONVERSION_AMBIGUOUS when two active CUM→MT profiles exist", () => {
    const p: UomConversionProfile[] = [
      { id: 4, fromUom: "CUM", toUom: "MT", conversionFactor: 2.2, conversionType: "fixed_factor", isActive: 1 },
      { id: 5, fromUom: "CUM", toUom: "MT", conversionFactor: 2.0, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.compatible).toBe(false);
    expect(result.errorCode).toBe("MATERIAL_CONVERSION_AMBIGUOUS");
  });

  it("E: CUM→CFT alongside CUM→MT are NOT ambiguous — they have different target UOMs", () => {
    // CUM→MT and CUM→CFT are separate applicable domains; only the one matching
    // defaultCanonical is selected.  Having two profiles for different targets is fine.
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, profiles());
    expect(result.errorCode).not.toBe("MATERIAL_CONVERSION_AMBIGUOUS");
    expect(result.compatible).toBe(true);
  });

  it("inactive profiles are ignored (not selected, not ambiguous)", () => {
    const p: UomConversionProfile[] = [
      { id: 6, fromUom: "CUM", toUom: "MT", conversionFactor: 2.2, conversionType: "fixed_factor", isActive: 0 },
      { id: 7, fromUom: "CUM", toUom: "MT", conversionFactor: 2.0, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.compatible).toBe(true);
    expect(result.conversionProfileId).toBe(7);
  });
});

describe("checkMappingUomCompatibility — 021A: Test F arithmetic (UOM conversion arithmetic)", () => {
  // Test F verifies the conversion direction convention:
  //   stock (MT) ÷ factor (2.2) = coverage in planning UOM (CUM)
  //   100 CUM demand × 2.2 = 220 MT procurement equivalent
  // The unit test here verifies the factor returned so the route layer can do the arithmetic.
  it("F: CUM→MT profile factor=2.2 is returned so routes can compute MT procurement equivalent", () => {
    const p: UomConversionProfile[] = [
      { id: 10, fromUom: "CUM", toUom: "MT", conversionFactor: 2.2, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.conversionFactor).toBe(2.2);
    // 100 CUM demand → procurement equivalent = 100 × 2.2 = 220 MT
    expect(100 * result.conversionFactor!).toBeCloseTo(220, 3);
    // 110 MT stock → coverage in CUM = 110 ÷ 2.2 = 50 CUM
    expect(110 / result.conversionFactor!).toBeCloseTo(50, 3);
  });

  it("F: without profile, CUM and MT are incompatible (never compared directly)", () => {
    const result = checkMappingUomCompatibility("CUM", {
      defaultUom: "MT",
      allowedUoms: null,
      bulkDensity: null,
    });
    expect(result.compatible).toBe(false);
    expect(result.conversionFactor).toBeNull();
  });
});

// ─── Instruction 021B: Kilogram spelling equivalents ─────────────────────────
describe("canonicalizeUnit — 021B: kilogram spelling equivalents", () => {
  it.each([
    ["Kg",        "Kg"],
    ["KG",        "Kg"],
    ["KGS",       "Kg"],
    ["KGM",       "Kg"],
    ["kilogram",  "Kg"],
    ["kilogram",  "Kg"],
    ["kilograms", "Kg"],
    ["KILOGRAM",  "Kg"],
    ["KILOGRAMS", "Kg"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });

  it("kilogram direct factor-1 when target defaultUom=Kg", () => {
    const result = checkMappingUomCompatibility("kilogram", { defaultUom: "Kg" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
  });

  it("kilograms direct factor-1 when target defaultUom=KGS", () => {
    const result = checkMappingUomCompatibility("kilograms", { defaultUom: "KGS" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
  });
});

// ─── Instruction 021B: Cubic feet spelling equivalents ───────────────────────
describe("canonicalizeUnit — 021B: cubic-feet spelling equivalents", () => {
  it.each([
    ["CFT",         "CFT"],
    ["cft",         "CFT"],
    ["CUFT",        "CFT"],
    ["cu.ft",       "CFT"],
    ["cubic foot",  "CFT"],
    ["cubic feet",  "CFT"],
    ["CUBICFOOT",   "CFT"],
    ["CUBICFEET",   "CFT"],
  ])("canonicalizeUnit(%s) === %s", (raw, expected) => {
    expect(canonicalizeUnit(raw)).toBe(expected);
  });

  it("cubic feet direct factor-1 when target defaultUom=CFT", () => {
    const result = checkMappingUomCompatibility("cubic feet", { defaultUom: "CFT" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
  });

  it("cu.ft direct factor-1 when target defaultUom=CUFT", () => {
    const result = checkMappingUomCompatibility("cu.ft", { defaultUom: "CUFT" });
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(1);
  });
});

// ─── Instruction 021B: No unsafe dimensional equivalence ─────────────────────
describe("checkMappingUomCompatibility — 021B: unsafe cross-dimension pairs remain blocked", () => {
  it("C: CFT and CUM are not factor-1 (volume-to-volume but different magnitude)", () => {
    const result = checkMappingUomCompatibility("CFT", { defaultUom: "CUM" });
    expect(result.compatible).toBe(false);
  });

  it("C: CUM and CFT are not factor-1", () => {
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "CFT" });
    expect(result.compatible).toBe(false);
  });

  it("C: Kg and MT are not factor-1", () => {
    const result = checkMappingUomCompatibility("Kg", { defaultUom: "MT" });
    expect(result.compatible).toBe(false);
  });

  it("C: kilogram and MT are not factor-1", () => {
    const result = checkMappingUomCompatibility("kilogram", { defaultUom: "MT" });
    expect(result.compatible).toBe(false);
  });

  it("C: MT and CUM remain blocked without an approved conversion", () => {
    const result = checkMappingUomCompatibility("MT", { defaultUom: "CUM" });
    expect(result.compatible).toBe(false);
  });
});

// ─── Instruction 021B: Profile ambiguity detection via server checkMappingUomCompatibility ─
describe("checkMappingUomCompatibility — 021B: profile ambiguity", () => {
  it("D: exactly one CUM→MT profile — compatible, factor returned", () => {
    const p: UomConversionProfile[] = [
      { id: 1, fromUom: "CUM", toUom: "MT", conversionFactor: 2.0, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.compatible).toBe(true);
    expect(result.conversionFactor).toBe(2.0);
  });

  it("E: CUM→MT and CUM→CFT profiles — only CUM→MT applies for defaultUom=MT, no ambiguity", () => {
    const p: UomConversionProfile[] = [
      { id: 1, fromUom: "CUM", toUom: "MT",  conversionFactor: 2.0,    conversionType: "fixed_factor", isActive: 1 },
      { id: 2, fromUom: "CUM", toUom: "CFT", conversionFactor: 35.3147, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.compatible).toBe(true);
    expect(result.mode).toBe("conversion_profile");
    expect(result.conversionFactor).toBe(2.0);
  });

  it("F: two active CUM→MT profiles — server returns MATERIAL_CONVERSION_AMBIGUOUS", () => {
    const p: UomConversionProfile[] = [
      { id: 1, fromUom: "CUM", toUom: "MT", conversionFactor: 2.0, conversionType: "fixed_factor", isActive: 1 },
      { id: 2, fromUom: "CUM", toUom: "MT", conversionFactor: 1.8, conversionType: "fixed_factor", isActive: 1 },
    ];
    const result = checkMappingUomCompatibility("CUM", { defaultUom: "MT" }, p);
    expect(result.compatible).toBe(false);
    expect(result.errorCode).toBe("MATERIAL_CONVERSION_AMBIGUOUS");
  });
});
