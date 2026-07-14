import { describe, it, expect } from "vitest";
import { canonicalizeUnit, normaliseBoqUnit } from "../shared/boqNormalise";

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
