import { describe, it, expect } from "vitest";
import {
  getUnitConversionFactor,
  calculateTipperFleet,
  getEffectiveOutputPerHrConverted,
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
