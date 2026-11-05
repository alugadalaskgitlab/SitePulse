import { describe, expect, it } from "vitest";
import {
  boqQuantityToCompactedCum,
  calculateCompactedLooseQuantity,
  compactedLooseProfileFromInputs,
  looseWeightPerCumFromProfile,
  resolveCompactedLooseProfile,
  withEffectiveMaterialDensity,
  type CompactedLooseProfile,
} from "../shared/compactedLoose";

const profile: CompactedLooseProfile = {
  rolledDensity: 2.25,
  rollingPct: 98,
  looseFactor: 1.2,
  wastagePct: 2,
};

describe("compacted and loose quantities", () => {
  it("matches the WMM 100 cum acceptance calculation", () => {
    const result = calculateCompactedLooseQuantity(100, profile)!;
    expect(result.compactedMt).toBeCloseTo(220.5);
    expect(result.looseCum).toBeCloseTo(120);
    expect(result.looseCft).toBeCloseTo(4237.764);
    expect(result.wastageMt).toBeCloseTo(4.41);
    expect(result.wastageLooseCum).toBeCloseTo(2.4);
    expect(result.requiredMt).toBeCloseTo(224.91);
    expect(result.looseWeightPerCum).toBeCloseTo(1.8375);
  });

  it("converts valid BOQ volume and mass units, and rejects unsupported units", () => {
    expect(boqQuantityToCompactedCum(100, "Cum", null, profile)).toBe(100);
    expect(boqQuantityToCompactedCum(100, "SQM", 50, profile)).toBe(5);
    expect(boqQuantityToCompactedCum(220.5, "MT", null, profile)).toBeCloseTo(100);
    expect(boqQuantityToCompactedCum(220.5, "MT", null, null)).toBeNull();
    expect(boqQuantityToCompactedCum(10, "Each", null, profile)).toBeNull();
  });

  it("uses a complete mix profile when the material master has no values", () => {
    expect(resolveCompactedLooseProfile({
      rolledDensity: null,
      rollingPct: null,
      looseFactor: null,
      wastagePct: null,
    }, profile)).toBe(profile);
  });

  it("keeps a complete material profile ahead of the mix fallback", () => {
    const materialProfile = { ...profile, rolledDensity: 2.4 };
    expect(resolveCompactedLooseProfile(materialProfile, profile)).toBe(materialProfile);
  });

  it("treats zero wastage and zero extra-loose input as valid values", () => {
    const gsb = compactedLooseProfileFromInputs({
      rolledDensity: "2.2",
      rollingPct: "98",
      extraLoosePct: "20",
      wastagePct: "0",
    });
    expect(gsb).toEqual({ rolledDensity: 2.2, rollingPct: 98, looseFactor: 1.2, wastagePct: 0 });
    const gsbResult = calculateCompactedLooseQuantity(100, gsb)!;
    expect(gsbResult.compactedMt).toBeCloseTo(215.6);
    expect(gsbResult.looseCum).toBeCloseTo(120);
    expect(gsbResult.wastageMt).toBe(0);
    expect(gsbResult.requiredMt).toBeCloseTo(215.6);

    const noExtraLoose = compactedLooseProfileFromInputs({
      rolledDensity: "2.2",
      rollingPct: "98",
      extraLoosePct: "0",
      wastagePct: "0",
    });
    expect(noExtraLoose.looseFactor).toBe(1);
    expect(calculateCompactedLooseQuantity(100, noExtraLoose)).not.toBeNull();
  });

  it("uses calculated loose density for conversions without persisting it over saved bulk density", () => {
    const density = looseWeightPerCumFromProfile({
      rolledDensity: 2.2,
      rollingPct: 98,
      looseFactor: 1.2,
      wastagePct: null,
    });
    expect(density).toBeCloseTo(1.7966666667);
    const view = withEffectiveMaterialDensity({
      name: "GSB",
      bulkDensity: 1.75,
      conversionFromUom: "CFT",
      conversionFactor: 1.75 / 35.3147,
      rolledDensity: 2.2,
      rollingPct: 98,
      looseFactor: 1.2,
      wastagePct: 0,
    });
    expect(view.bulkDensity).toBeCloseTo(1.7966666667);
    expect(view.savedBulkDensity).toBe(1.75);
    expect(view.conversionFactor).toBeCloseTo(1.7966666667 / 35.3147);
  });
});
