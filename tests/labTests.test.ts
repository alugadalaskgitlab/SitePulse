import { describe, expect, it } from "vitest";
import { calculateSoilLabTest, soilQualityDefaultsForWork } from "@shared/labTests";
import { applyRoleTemplate, emptyMatrix, ROLE_TEMPLATES } from "@shared/permissions";
import { canLegacySection } from "@shared/featureAccess";

describe("soil laboratory calculations", () => {
  it("calculates the prototype sand-replacement FDD sample to 98.7%", () => {
    const result = calculateSoilLabTest("field_density_sand", {
      pits: [{
        chainage: "2+550",
        w1: 10500,
        w2: 6420,
        w3: 1520,
        wetSoilWeight: 3720,
        moistureMethod: "oven",
        w5: 25,
        w6: 137.36,
        w7: 125,
      }],
    }, {
      sandBulkDensityGcc: 1.45,
      sandInConeG: 1520,
      mddGcc: 1.9,
      omcPercent: 11.8,
      requiredPercent: 97,
    });

    const pit = (result.results.pits as any[])[0];
    expect(pit.sandWeightG).toBe(2560);
    expect(pit.pitVolumeCc).toBe(1765.5);
    expect(pit.bulkDensityGcc).toBe(2.107);
    expect(pit.moisturePercent).toBe(12.36);
    expect(pit.dryDensityGcc).toBe(1.875);
    expect(pit.compactionPercent).toBe(98.7);
    expect(pit.verdict).toBe("pass");
    expect(result.verdict).toBe("pass");
  });

  it("calculates core-cutter bulk and dry density", () => {
    const result = calculateSoilLabTest("field_density_core_cutter", {
      pits: [{
        soilAndCutterWeight: 1870,
        cutterWeight: 370,
        cutterVolume: 750,
        moistureMethod: "oven",
        w5: 20,
        w6: 120,
        w7: 110,
      }],
    }, { mddGcc: 1.8, requiredPercent: 90 });
    const pit = (result.results.pits as any[])[0];
    expect(pit.bulkDensityGcc).toBe(2);
    expect(pit.moisturePercent).toBe(11.11);
    expect(pit.dryDensityGcc).toBe(1.8);
    expect(pit.compactionPercent).toBe(100);
    expect(pit.verdict).toBe("pass");
  });

  it("calculates oven moisture and linearly corrected speedy moisture", () => {
    const oven = calculateSoilLabTest("moisture_content", {
      moistureMethod: "oven", w5: 25, w6: 137.36, w7: 125,
    }, { omcPercent: 11.8 });
    expect(oven.results.moisturePercent).toBe(12.36);
    expect(oven.verdict).toBe("pass");

    const speedy = calculateSoilLabTest("moisture_content", {
      moistureMethod: "speedy", speedyIndicated: 15,
    }, { omcPercent: 15, speedyCorrection: [{ indicated: 10, corrected: 11 }, { indicated: 20, corrected: 21 }] });
    expect(speedy.results.moisturePercent).toBe(16);
    expect(speedy.verdict).toBe("pass");
  });

  it("fits the prototype Modified Proctor peak around MDD 1.901 and OMC 12.3", () => {
    const w2 = [8624, 8854, 9038, 9072, 9027];
    const dryPan = [122.59, 120.91, 119.29, 117.72, 116.21];
    const result = calculateSoilLabTest("proctor_modified", {
      specificGravity: 2.65,
      trials: w2.map((wetMould, index) => ({
        w1: 4250,
        w2: wetMould,
        volumeCc: 2250,
        moistureMethod: "oven",
        w5: 30,
        w6: 130,
        w7: dryPan[index],
      })),
    });
    expect(result.errors).toEqual([]);
    expect(result.results.mddGcc).toBeCloseTo(1.901, 2);
    expect(result.results.omcPercent).toBeCloseTo(12.3, 0);
    expect((result.results.zeroAirVoids as any[]).length).toBeGreaterThan(0);
  });

  it("calculates CBR at 2.5 mm and 5 mm and reports the higher result", () => {
    const readings = {
      ringConstantKgPerDivision: 1.2,
      dialReadings: {
        "0": 0, "0.5": 22, "1": 45, "1.5": 70, "2": 95, "2.5": 118,
        "3": 138, "4": 170, "5": 195, "7.5": 240, "10": 270, "12.5": 290,
      },
      initialSwellGauge: 3.2,
      finalSwellGauge: 3.62,
      specimenHeightMm: 116.4,
      mouldDensityBeforeSoaking: 2.01,
      moistureBeforeSoaking: 10.4,
      mouldDensityAfterSoaking: 2.03,
      moistureAfterSoaking: 11.1,
    };
    const result = calculateSoilLabTest("cbr", readings, { minValue: 10 });
    expect(result.results.cbrAt25Percent).toBeCloseTo(10.3, 0);
    expect(result.results.cbrAt50Percent).toBeCloseTo(11.4, 0);
    expect(result.results.reportedCbrPercent).toBeCloseTo(11.4, 0);
    expect(result.results.swellPercent).toBeCloseTo(0.36, 2);
    expect(result.results.mouldDensityBeforeSoaking).toBe(2.01);
    expect(result.results.moistureAfterSoaking).toBe(11.1);
    expect(result.verdict).toBe("pass");
    expect(result.errors).toEqual([]);
  });

  it("blocks an incomplete CBR form even when its two reference loads exist", () => {
    const result = calculateSoilLabTest("cbr", {
      ringConstantKgPerDivision: 1,
      dialReadings: { "2.5": 100, "5": 160 },
      initialSwellGauge: 1,
      finalSwellGauge: 2,
      specimenHeightMm: 200,
    });
    expect(result.results.reportedCbrPercent).not.toBeNull();
    expect(result.errors).toContain("Enter the dial reading at 0 mm.");
    expect(result.errors).toContain("Enter the dial reading at 12.5 mm.");
  });

  it("calculates Atterberg flow-line LL, average PL and PI, and treats NP explicitly", () => {
    const readings = {
      liquidLimitTrials: [
        { blows: 15, moistureMethod: "speedy", speedyIndicated: 40 },
        { blows: 25, moistureMethod: "speedy", speedyIndicated: 35 },
        { blows: 35, moistureMethod: "speedy", speedyIndicated: 30 },
      ],
      plasticLimitTrials: [
        { moistureMethod: "speedy", speedyIndicated: 20 },
        { moistureMethod: "speedy", speedyIndicated: 22 },
      ],
    };
    const result = calculateSoilLabTest("atterberg", readings, { maxValue: 18 });
    expect(result.results.liquidLimitPercent).toBeCloseTo(34.32, 2);
    expect(result.results.plasticLimitPercent).toBe(21);
    expect(result.results.plasticityIndexPercent).toBeCloseTo(13.32, 2);
    expect(result.verdict).toBe("pass");
    expect(result.errors).toEqual([]);

    const np = calculateSoilLabTest("atterberg", { ...readings, nonPlastic: true });
    expect(np.results.plasticLimitPercent).toBe("NP");
    expect(np.results.plasticityIndexPercent).toBeNull();
  });

  it("requires enough readings before a submitted test can be accepted", () => {
    expect(calculateSoilLabTest("field_density_sand", { pits: [] }, { mddGcc: 1.9, requiredPercent: 97 }).errors.length).toBeGreaterThan(0);
    expect(calculateSoilLabTest("proctor_modified", { trials: [{}, {}, {}] }).errors).toContain("Enter at least three complete trials to calculate MDD and OMC.");
    expect(calculateSoilLabTest("cbr", { dialReadings: {} }).errors.length).toBeGreaterThan(0);
    expect(calculateSoilLabTest("atterberg", { liquidLimitTrials: [] }).errors.length).toBeGreaterThan(0);
  });

  it("provides soil quality defaults for the expected work types", () => {
    expect(soilQualityDefaultsForWork("Embankment").map(row => row.testType)).toContain("field_density_sand");
    expect(soilQualityDefaultsForWork("Subgrade").map(row => row.testType)).toContain("cbr");
    expect(soilQualityDefaultsForWork("GSB").map(row => row.minValue)).toEqual([98]);
    expect(soilQualityDefaultsForWork("WMM").map(row => row.frequencyQty)).toEqual([1000]);
  });

  it("keeps Tests off for every saved role template by default", () => {
    for (const role of ROLE_TEMPLATES) {
      expect(applyRoleTemplate(role.id).lab_tests).toMatchObject({ view: false, create: false, edit: false });
    }
  });

  it("uses the same explicit Tests permissions for ordinary users and preserves Owner access", () => {
    const matrix = emptyMatrix();
    const state = { rolesConfigured: true };
    const ordinary = { isActive: true, isOwner: false, isAdmin: false };
    expect(canLegacySection({ ...ordinary, isAdmin: true }, emptyMatrix(), "lab_tests", "view", { rolesConfigured: false })).toBe(false);
    expect(canLegacySection(ordinary, matrix, "lab_tests", "view", state)).toBe(false);
    expect(canLegacySection(ordinary, matrix, "lab_tests", "create", state)).toBe(false);
    matrix.lab_tests = { ...matrix.lab_tests, view: true, create: true, edit: false };
    expect(canLegacySection(ordinary, matrix, "lab_tests", "view", state)).toBe(true);
    expect(canLegacySection(ordinary, matrix, "lab_tests", "create", state)).toBe(true);
    expect(canLegacySection(ordinary, matrix, "lab_tests", "edit", state)).toBe(false);
    expect(canLegacySection({ ...ordinary, isOwner: true }, emptyMatrix(), "lab_tests", "edit", state)).toBe(true);
  });
});
