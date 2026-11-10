import { describe, expect, it } from "vitest";
import { checkMappingUomCompatibility } from "../shared/boqNormalise";
import {
  materialPlanQuantity,
  reportedMaterialNeed,
  remainingBySupplySource,
  signedMaterialPlanQuantity,
  signedMaterialTonnesToCft,
  siteMaterialLyingBalance,
  soilCompactedToLooseCum,
} from "../shared/bomPlanActual";
import { aggregateSubmittedDprMaterialUse, isEligibleSubmittedDpr } from "../shared/dprEligibility";

const wmmProfile = {
  rolledDensity: 2.25,
  rollingPct: 98,
  looseFactor: 1.15,
  wastagePct: 0,
};

describe("STOCK-01 Part B development fixture", () => {
  it("prefers compacted material values over a stale conversion profile", () => {
    const check = checkMappingUomCompatibility("CUM", {
      defaultUom: "MT",
      rolledDensity: 2.25,
      rollingPct: 98,
      looseFactor: 1.15,
      bulkDensity: 1.6,
    }, [{
      id: 41,
      fromUom: "CUM",
      toUom: "MT",
      conversionFactor: 1.875,
      conversionType: "bulk_density",
      isActive: 1,
    }]);

    expect(check.compatible).toBe(true);
    expect(check.conversionFactor).toBeCloseTo(2.205, 4);
    expect(materialPlanQuantity(909.38, "CUM", "MT", wmmProfile, "compacted"))
      .toBeCloseTo(2005.1829, 3);
  });

  it("uses one site-supply row and does not subtract DPR use from bought-so-far", () => {
    const need = 1631.25 * 2.205;
    const balance = remainingBySupplySource({
      siteNeed: need,
      plantNeed: 0,
      bought: 1895,
      plantUsed: 0,
      atPlantNow: 0,
      hasSiteSupply: true,
      hasPlantMix: false,
    });
    expect(need).toBeCloseTo(3596.90625, 5);
    expect(balance.remaining).toBeCloseTo(1701.90625, 5);
    expect(balance.excess).toBeNull();
  });

  it("subtracts dispatch use and shared plant stock only for plant-mix demand", () => {
    expect(remainingBySupplySource({
      siteNeed: 500,
      plantNeed: 1000,
      bought: 300,
      plantUsed: 200,
      atPlantNow: 100,
      hasSiteSupply: true,
      hasPlantMix: true,
    })).toEqual({ remaining: 900, excess: null });
    expect(remainingBySupplySource({
      siteNeed: 0,
      plantNeed: 1000,
      bought: 0,
      plantUsed: 1200,
      atPlantNow: 0,
      hasSiteSupply: false,
      hasPlantMix: true,
    })).toEqual({ remaining: 0, excess: 200 });
  });

  it("counts only submitted, live DPRs and keeps incidental material use in a separate subtotal", () => {
    const valid = {
      dprStatus: "submitted",
      isDeleted: false,
      isCancelled: false,
      isSuperseded: false,
    };
    expect(isEligibleSubmittedDpr(valid)).toBe(true);
    expect(isEligibleSubmittedDpr({ ...valid, dprStatus: "draft" })).toBe(false);
    expect(isEligibleSubmittedDpr({ ...valid, isDeleted: true })).toBe(false);
    expect(isEligibleSubmittedDpr({ ...valid, isCancelled: true })).toBe(false);
    expect(isEligibleSubmittedDpr({ ...valid, isSuperseded: true })).toBe(false);
    expect(isEligibleSubmittedDpr({
      dprStatus: "submitted",
      isDeleted: null,
      isCancelled: null,
      isSuperseded: null,
    })).toBe(true);

    const totals = aggregateSubmittedDprMaterialUse([
      { ...valid, boqItemId: 17, quantity: 100, isIncidental: false },
      { ...valid, boqItemId: 17, quantity: 25, isIncidental: true },
      { ...valid, isDeleted: null, isCancelled: null, isSuperseded: null, boqItemId: 17, quantity: 10, isIncidental: false },
      { ...valid, dprStatus: "draft", boqItemId: 17, quantity: 50, isIncidental: false },
      { ...valid, isDeleted: true, boqItemId: 17, quantity: 10, isIncidental: true },
      { ...valid, isCancelled: true, boqItemId: 17, quantity: 10, isIncidental: false },
      { ...valid, isSuperseded: true, boqItemId: 17, quantity: 10, isIncidental: false },
    ]);
    expect(totals.get(17)).toEqual({ quantity: 135, incidentalQuantity: 25 });
  });

  it("keeps negative plant stock visible but counts it as zero for still-to-buy", () => {
    expect(remainingBySupplySource({
      siteNeed: 0,
      plantNeed: 1000,
      bought: 0,
      plantUsed: 300,
      atPlantNow: -200,
      hasSiteSupply: false,
      hasPlantMix: true,
    })).toEqual({ remaining: 700, excess: null });
    expect(signedMaterialPlanQuantity(-353.147, "CFT", "CUM", null, "loose")).toBeCloseTo(-10);
    expect(signedMaterialTonnesToCft(-10, { bulkDensity: 1.8 })).toBeCloseTo(-(10 / 1.8) * 35.3147, 3);
  });

  it("calculates soil need and use in loose cubic metres from the material master", () => {
    const soilProfile = {
      rolledDensity: 1.8,
      rollingPct: 95,
      looseFactor: 1.2,
      wastagePct: 0,
    };
    expect((1305 + 500) * soilProfile.looseFactor).toBe(2166);
    expect(soilCompactedToLooseCum(915, soilProfile, [1.1])).toBeCloseTo(1098);
    expect(materialPlanQuantity(68300, "CFT", "CUM", soilProfile, "loose"))
      .toBeCloseTo(68300 / 35.3147, 3);
  });

  it("keeps lying stock at zero and flags when estimated use exceeds receipts", () => {
    expect(siteMaterialLyingBalance(1895, 2005.1829)).toEqual({
      lying: 0,
      overConsumed: true,
    });
    expect(siteMaterialLyingBalance(68300 / 35.3147, 1098)).toEqual({
      lying: 68300 / 35.3147 - 1098,
      overConsumed: false,
    });
  });

  it("shows a partial soil total only when at least one item is calculable", () => {
    expect(reportedMaterialNeed(0, false, 1)).toBeNull();
    expect(reportedMaterialNeed(125, false, 1)).toBe(125);
    expect(reportedMaterialNeed(125, false, 0)).toBeNull();
  });

  it("converts HLC aggregate CFT stock with each material's own delivered weight", () => {
    const cases = [
      [3417.6, 1.55, 150],
      [3310.8, 1.6, 150],
      [580.8, 1.52, 25],
      [749.1, 1.65, 35],
    ] as const;
    for (const [cft, deliveredWeight, expectedMt] of cases) {
      expect(materialPlanQuantity(cft, "CFT", "MT", { bulkDensity: deliveredWeight }, "loose"))
        .toBeCloseTo(expectedMt, 1);
    }
  });
});
