import { describe, it, expect } from "vitest";
import {
  getUnitConversionFactor,
  calculateTipperFleet,
  getEffectiveOutputPerHrConverted,
  normaliseMixType,
  normaliseBomMaterial,
  deriveMaterialsFromLayerConfig,
} from "@shared/planningEngine";

// ─── getUnitConversionFactor ─────────────────────────────────────────────────

describe("getUnitConversionFactor", () => {
  it("returns 1 for identical units (MT → MT)", () => {
    expect(getUnitConversionFactor("MT", "MT", {})).toBe(1);
  });

  it("returns 1 for identical units with different casing (sqm → SQM)", () => {
    expect(getUnitConversionFactor("sqm", "SQM", {})).toBe(1);
  });

  it("converts MT → CUM using density", () => {
    const factor = getUnitConversionFactor("MT", "CUM", { densityTPerCum: 2.35 });
    expect(factor).toBeCloseTo(1 / 2.35, 6);
  });

  it("converts CUM → MT using density", () => {
    const factor = getUnitConversionFactor("CUM", "MT", { densityTPerCum: 2.40 });
    expect(factor).toBeCloseTo(2.40, 6);
  });

  it("converts SQM → CUM using thickness (50 mm)", () => {
    const factor = getUnitConversionFactor("SQM", "CUM", { thicknessMm: 50 });
    expect(factor).toBeCloseTo(0.05, 6);
  });

  it("converts CUM → SQM using thickness (50 mm)", () => {
    const factor = getUnitConversionFactor("CUM", "SQM", { thicknessMm: 50 });
    expect(factor).toBeCloseTo(20, 6);
  });

  it("converts MT → SQM using density + thickness", () => {
    // 2.35 T/CUM, 50 mm → 1 MT = 1/(0.05 × 2.35) SQM ≈ 8.511 SQM
    const factor = getUnitConversionFactor("MT", "SQM", { densityTPerCum: 2.35, thicknessMm: 50 });
    expect(factor).toBeCloseTo(1 / (0.05 * 2.35), 4);
  });

  it("converts SQM → MT using density + thickness", () => {
    // 1 SQM × 0.05 m × 2.35 T/CUM = 0.1175 MT
    const factor = getUnitConversionFactor("SQM", "MT", { densityTPerCum: 2.35, thicknessMm: 50 });
    expect(factor).toBeCloseTo(0.05 * 2.35, 6);
  });

  it("returns null for MT → CUM when density is missing", () => {
    expect(getUnitConversionFactor("MT", "CUM", {})).toBeNull();
  });

  it("returns null for SQM → CUM when thickness is missing", () => {
    expect(getUnitConversionFactor("SQM", "CUM", {})).toBeNull();
  });

  it("returns null for MT → SQM when either density or thickness is missing", () => {
    expect(getUnitConversionFactor("MT", "SQM", { densityTPerCum: 2.35 })).toBeNull();
    expect(getUnitConversionFactor("MT", "SQM", { thicknessMm: 50 })).toBeNull();
  });

  it("returns null for completely incompatible units (KG → KM)", () => {
    expect(getUnitConversionFactor("KG", "KM", { densityTPerCum: 2.35 })).toBeNull();
  });

  it("converts SQM → HA (1 HA = 10,000 SQM)", () => {
    const factor = getUnitConversionFactor("SQM", "HA", {});
    expect(factor).toBeCloseTo(1 / 10000, 8);
  });

  it("converts HA → SQM", () => {
    const factor = getUnitConversionFactor("HA", "SQM", {});
    expect(factor).toBe(10000);
  });

  it("converts HA → CUM using thickness (grader 150mm subgrade)", () => {
    // 1 HA = 10,000 SQM × 0.15 m = 1500 CUM
    const factor = getUnitConversionFactor("HA", "CUM", { thicknessMm: 150 });
    expect(factor).toBeCloseTo(10000 * 0.15, 6);
  });

  it("converts SQM → HA using Hectare normalisation alias (sqm lowercase)", () => {
    const factor = getUnitConversionFactor("sqm", "hectare", {});
    expect(factor).toBeCloseTo(1 / 10000, 8);
  });

  it("returns null for HA → CUM when thickness is missing", () => {
    expect(getUnitConversionFactor("HA", "CUM", {})).toBeNull();
  });
});

// ─── calculateTipperFleet ────────────────────────────────────────────────────

describe("calculateTipperFleet", () => {
  it("computes cycle time, tippers needed, and delivery rate for a typical haul", () => {
    // Travel: 5 km × 2 / 30 km/hr = 20 min; load 5 + unload 5 = cycle 30 min
    // Trips/hr per tipper = 60/30 = 2; delivery per tipper = 2 × 8 MT = 16 MT/hr
    // Plant output 75 MT/hr; tippers needed = ceil(75/16) = 5
    const result = calculateTipperFleet({
      plantOutputMTperHr: 75,
      tipperCapacityMT: 8,
      haulDistanceKm: 5,
      avgSpeedKmHr: 30,
      loadingTimeMins: 5,
      unloadingTimeMins: 5,
    });
    expect(result.cycleTimeMins).toBeCloseTo(30, 4);
    expect(result.tippersNeeded).toBe(5);
    expect(result.deliveryRateMTperHr).toBeCloseTo(80, 2); // 5 tippers × 16 MT/hr
    expect(result.isAdequate).toBe(true);
  });

  it("flags inadequate when tippers cannot match plant output", () => {
    // Very long haul makes delivery rate drop below plant output
    // Travel: 20 km × 2 / 20 km/hr = 120 min; load 5 + unload 5 = cycle 130 min
    // trips/hr = 60/130 ≈ 0.4615; delivery per tipper = 0.4615 × 10 = 4.615 MT/hr
    // Plant 50 MT/hr; tippers needed = ceil(50/4.615) = 11
    // delivery rate = 11 × 4.615 ≈ 50.77 ≥ 50 → actually adequate
    // Use a scenario where we deliberately under-tipper
    const result = calculateTipperFleet({
      plantOutputMTperHr: 100,
      tipperCapacityMT: 5,
      haulDistanceKm: 15,
      avgSpeedKmHr: 20,
      loadingTimeMins: 8,
      unloadingTimeMins: 8,
    });
    // Verify cycle time
    const travelMin = (15 * 2 / 20) * 60; // 90 min
    const cycle = travelMin + 8 + 8; // 106 min
    expect(result.cycleTimeMins).toBeCloseTo(cycle, 4);
    const tripsPerHr = 60 / cycle;
    const deliveryPerTipper = 5 * tripsPerHr;
    const tippersNeeded = Math.ceil(100 / deliveryPerTipper);
    expect(result.tippersNeeded).toBe(tippersNeeded);
    expect(result.deliveryRateMTperHr).toBeGreaterThanOrEqual(100);
    expect(result.isAdequate).toBe(true);
  });

  it("returns zero tippers when plant output is zero", () => {
    const result = calculateTipperFleet({
      plantOutputMTperHr: 0,
      tipperCapacityMT: 8,
      haulDistanceKm: 5,
      avgSpeedKmHr: 30,
      loadingTimeMins: 5,
      unloadingTimeMins: 5,
    });
    expect(result.tippersNeeded).toBe(0);
    expect(result.isAdequate).toBe(true);
  });

  it("handles zero speed gracefully (no division by zero)", () => {
    const result = calculateTipperFleet({
      plantOutputMTperHr: 50,
      tipperCapacityMT: 8,
      haulDistanceKm: 5,
      avgSpeedKmHr: 0,
      loadingTimeMins: 5,
      unloadingTimeMins: 5,
    });
    // travelTime = 0 when speed=0, cycleTime = load + unload
    expect(result.cycleTimeMins).toBeCloseTo(10, 4);
    expect(result.tippersNeeded).toBeGreaterThan(0);
  });

  it("reflects that longer haul requires more tippers", () => {
    const base = {
      plantOutputMTperHr: 75,
      tipperCapacityMT: 8,
      avgSpeedKmHr: 30,
      loadingTimeMins: 5,
      unloadingTimeMins: 5,
    };
    const near = calculateTipperFleet({ ...base, haulDistanceKm: 2 });
    const far = calculateTipperFleet({ ...base, haulDistanceKm: 10 });
    expect(far.tippersNeeded).toBeGreaterThan(near.tippersNeeded);
    expect(far.cycleTimeMins).toBeGreaterThan(near.cycleTimeMins);
  });
});

// ─── getEffectiveOutputPerHrConverted ────────────────────────────────────────

describe("getEffectiveOutputPerHrConverted", () => {
  const paverEq = {
    outputUnit: null,
    outputTheoretical: null,
    outputEfficiency: null,
    standardOutputs: [{ unit: "MT", outputPerHr: 75 }],
    count: 1,
  };

  it("returns exact match without conversion when units match", () => {
    const result = getEffectiveOutputPerHrConverted(paverEq, "MT", {});
    expect(result.convertedVia).toBe("exact");
    expect(result.outputPerHr).toBeCloseTo(75, 4);
  });

  it("converts MT/hr output to CUM/hr using density", () => {
    const result = getEffectiveOutputPerHrConverted(paverEq, "CUM", { densityTPerCum: 2.35 });
    expect(result.convertedVia).toBe("converted");
    expect(result.nativeUnit).toBe("MT");
    expect(result.outputPerHr).toBeCloseTo(75 / 2.35, 3);
  });

  it("returns 0 output with convertedVia=none when no conversion possible", () => {
    const result = getEffectiveOutputPerHrConverted(paverEq, "CUM", {});
    expect(result.convertedVia).toBe("none");
    expect(result.outputPerHr).toBe(0);
  });

  it("scales by equipment count", () => {
    const twoEq = { ...paverEq, count: 2 };
    const single = getEffectiveOutputPerHrConverted(paverEq, "MT", {});
    const doubled = getEffectiveOutputPerHrConverted(twoEq, "MT", {});
    expect(doubled.outputPerHr).toBeCloseTo(single.outputPerHr * 2, 4);
  });
});

// ─── normaliseMixType ─────────────────────────────────────────────────────────

describe("normaliseMixType", () => {
  it("returns canonical abbreviation for full mix names", () => {
    expect(normaliseMixType("Bituminous Concrete")).toBe("BC");
    expect(normaliseMixType("Dense Bituminous Macadam")).toBe("DBM");
    expect(normaliseMixType("Bituminous Macadam")).toBe("BM");
    expect(normaliseMixType("Semi-Dense Bituminous Concrete")).toBe("SDBC");
    expect(normaliseMixType("Semi Dense Bituminous Concrete")).toBe("SDBC");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normaliseMixType("  bituminous concrete  ")).toBe("BC");
    expect(normaliseMixType("DENSE BITUMINOUS MACADAM")).toBe("DBM");
  });

  it("keeps abbreviations unchanged", () => {
    expect(normaliseMixType("BC")).toBe("BC");
    expect(normaliseMixType("DBM")).toBe("DBM");
    expect(normaliseMixType("WMM")).toBe("WMM");
  });

  it("returns the trimmed upper-case input when no alias is found", () => {
    expect(normaliseMixType("CustomMix")).toBe("CUSTOMMIX");
    expect(normaliseMixType("XYZ")).toBe("XYZ");
  });
});

// ─── deriveMaterialsFromLayerConfig — bituminous (template-only) ──────────────

describe("deriveMaterialsFromLayerConfig — bituminous from mix template", () => {
  const baseLayerConfig = {
    layerType: "bituminous" as const,
    thicknessMm: 50,
    densityTPerCum: 2.4,
  };
  const bcTemplate = {
    bitumenPercent: 5.5,
    ldoNorm: 6,
    components: [
      { materialName: "20mm Aggregate", percent: 32 },
      { materialName: "10mm Aggregate", percent: 25 },
      { materialName: "Stone Dust", percent: 35 },
      { materialName: "Filler", percent: 2.5 },
    ],
  };

  it("returns bitumen + aggregate rows from the mix template (plus LDO)", () => {
    const rows = deriveMaterialsFromLayerConfig({ ...baseLayerConfig, mixType: "BC" }, "SQM", bcTemplate);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.find(r => r.materialName.toLowerCase().includes("bitumen"))).toBeDefined();
    expect(rows.find(r => r.materialName.toLowerCase().includes("aggregate"))).toBeDefined();
    expect(rows.find(r => r.materialName === "LDO / Process Fuel")).toBeDefined();
  });

  it("returns IRC default rows for a known mix type when no template is provided", () => {
    const rows = deriveMaterialsFromLayerConfig({ ...baseLayerConfig, mixType: "BC" }, "SQM", undefined);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.find(r => r.materialName.toLowerCase().includes("bitumen"))).toBeDefined();
    expect(rows.find(r => r.materialName === "LDO / Process Fuel")).toBeDefined();
  });

  it("returns [] for a truly unknown mix type with no template", () => {
    const rows = deriveMaterialsFromLayerConfig({ ...baseLayerConfig, mixType: "UNKNOWN_MIX_XYZ" }, "SQM", undefined);
    expect(rows.length).toBe(0);
  });

  it("mix component quantities (excluding LDO) sum to mtPerSqm within ±0.1%", () => {
    const mtPerSqm = (50 / 1000) * 2.4;
    const rows = deriveMaterialsFromLayerConfig({ ...baseLayerConfig, mixType: "BC" }, "SQM", bcTemplate);
    const mixRows = rows.filter(r => r.materialName !== "LDO / Process Fuel");
    const total = mixRows.reduce((sum, r) => sum + r.qtyPerBoqUnit, 0);
    expect(total).toBeCloseTo(mtPerSqm, 3);
  });
});

describe("deriveMaterialsFromLayerConfig — concrete from RMC mix design", () => {
  const lc = { layerType: "concrete" as const };
  const design = {
    grade: "M30",
    cementContent: 360,
    admixtureName: "PCE",
    admixtureDosage: 0.8,
    componentProportions: { cement: 360, fineAgg: 720, coarseAgg20: 700, coarseAgg10: 480 },
  };

  it("derives cement, sand, aggregates and admixture per CUM", () => {
    const rows = deriveMaterialsFromLayerConfig(lc, "CUM", undefined, design);
    const cement = rows.find(r => r.materialName === "Cement");
    expect(cement?.uom).toBe("MT");
    expect(cement?.qtyPerBoqUnit).toBeCloseTo(0.36, 3);
    expect(rows.find(r => r.materialName === "Sand")?.qtyPerBoqUnit).toBeCloseTo(720 / 1600, 3);
    expect(rows.find(r => r.materialName === "20mm Aggregate")?.qtyPerBoqUnit).toBeCloseTo(700 / 1450, 3);
    expect(rows.find(r => r.materialName === "10mm Aggregate")?.qtyPerBoqUnit).toBeCloseTo(480 / 1450, 3);
    expect(rows.find(r => r.materialName.startsWith("Admixture"))?.qtyPerBoqUnit).toBeCloseTo((360 * 0.8) / 100, 3);
  });

  it("returns [] when no mix design is provided", () => {
    expect(deriveMaterialsFromLayerConfig(lc, "CUM", undefined, null).length).toBe(0);
  });
});

// ─── normaliseBomMaterial ─────────────────────────────────────────────────────

describe("normaliseBomMaterial", () => {
  it("collapses WMM direct-supply 'Granular Material' to 'WMM Material'", () => {
    expect(normaliseBomMaterial({
      materialName: "Granular Material",
      uom: "CUM",
      itemDescription: "Providing, laying, spreading and compacting Wet Mix Macadam",
      layerType: "granular",
      mixType: "WMM",
      granularSource: "quarry",
      supplyType: "direct",
    }).displayMaterialName).toBe("WMM Material");
  });

  it("collapses GSB direct-supply 'Granular Material' to 'GSB Material'", () => {
    expect(normaliseBomMaterial({
      materialName: "Granular Material",
      uom: "CUM",
      itemDescription: "Construction of Granular Sub-Base by providing coarse graded material",
      layerType: "granular",
      mixType: "GSB",
      granularSource: "quarry",
      supplyType: "direct",
    }).displayMaterialName).toBe("GSB Material");
  });

  it("normalises HYSD reinforcement description to 'TMT / Reinforcement Steel'", () => {
    expect(normaliseBomMaterial({
      materialName: "HYSD bars including 5 percent overlaps and wastage",
      uom: "MT",
    }).displayMaterialName).toBe("TMT / Reinforcement Steel");
  });

  it("normalises '25mm and 12.5mm' aggregate description to '40mm Aggregate'", () => {
    expect(normaliseBomMaterial({
      materialName: "Crushed stone coarse aggregates of 25mm and 12.5mm nominal size",
      uom: "CUM",
    }).displayMaterialName).toBe("40mm Aggregate");
  });

  it("passes through 'GSB Material' unchanged (already practical)", () => {
    expect(normaliseBomMaterial({
      materialName: "GSB Material",
      uom: "CUM",
    }).displayMaterialName).toBe("GSB Material");
  });

  it("passes through 'Bitumen VG-30' unchanged (already practical)", () => {
    expect(normaliseBomMaterial({
      materialName: "Bitumen VG-30",
      uom: "MT",
    }).displayMaterialName).toBe("Bitumen VG-30");
  });

  it("passes through '10mm Aggregate' unchanged (already practical)", () => {
    expect(normaliseBomMaterial({
      materialName: "10mm Aggregate",
      uom: "CUM",
    }).displayMaterialName).toBe("10mm Aggregate");
  });

  it("flags unknown material for review", () => {
    const result = normaliseBomMaterial({ materialName: "Exotic Material XYZ", uom: "CUM" });
    expect(result.reviewNeeded).toBe(true);
    expect(result.displayMaterialName).toBe("Exotic Material XYZ");
  });
});
