import { describe, expect, it } from "vitest";
import { emptyMatrix, fullMatrix } from "@shared/permissions";
import { canLegacySection } from "@shared/featureAccess";
import {
  calculateHlcBitumenCorrectionTarget,
  enforceBitumenCorrectionParty,
  groupPartyOrderNorms,
  normVariance,
  summarizePlantNormActual,
  type PlantNormActualDay,
} from "@shared/plantNormVsActual";
import { buildPlantNormActualReport, validPlantNormActualRange } from "../server/plantNormActual";

const day = (date: string): PlantNormActualDay => ({
  date,
  bitumenNormMt: 0.5,
  bitumenActualMt: 0.45,
  ldoNormL: 60,
  ldoActualL: 55,
});

describe("PLANT-06 norm-vs-actual calculations and access", () => {
  it("calculates a one-day book/dip comparison with the expected sign", () => {
    expect(normVariance(0.5, 0.45)).toEqual({ saved: 0.05, label: "saved" });
    expect(normVariance(0.5, 0.6)).toEqual({ saved: -0.1, label: "excess" });
  });

  it("sums three measured days and preserves a partial-reading warning", () => {
    const total = summarizePlantNormActual([
      day("2026-01-01"), day("2026-01-02"), day("2026-01-03"),
    ]);
    expect(total).toMatchObject({
      bitumenNormMt: 1.5,
      bitumenActualMt: 1.35,
      bitumenVariance: { saved: 0.15, label: "saved" },
      ldoNormL: 180,
      ldoActualL: 165,
      ldoVariance: { saved: 15, label: "saved" },
      normDays: 3,
    });
    const partial = summarizePlantNormActual([day("2026-01-01"), {
      ...day("2026-01-02"), bitumenActualMt: null, ldoActualL: null,
    }]);
    expect(partial.bitumenActualMt).toBe(0.45);
    expect(partial.bitumenVariance.saved).toBeNull();
    expect(partial.ldoVariance.saved).toBeNull();
  });

  it("groups party/order norms without assigning shared tank actuals", () => {
    expect(groupPartyOrderNorms([
      { partyName: "Roads Co", orderNo: "SO-1", mixName: "BC", bitumenNormMt: 0.5, ldoNormL: 60 },
      { partyName: "Roads Co", orderNo: "SO-1", mixName: "BC", bitumenNormMt: 1, ldoNormL: 120 },
    ])).toEqual([{ partyName: "Roads Co", orderNo: "SO-1", mixName: "BC", bitumenNormMt: 1.5, ldoNormL: 180 }]);
  });

  it("builds one-day norms from dispatches and uses the plant's shared physical actual", async () => {
    const mockStorage = {
      getTruckDispatches: async () => [{
        date: "2026-01-01", plantName: "Test plant", partyId: 7, mixTemplateId: 9,
        loadWeight: 10, theoreticalBitumenQty: 0.5, theoreticalLdoQty: 60,
        supplyOrderNo: "SO-1", supplyOrderMixName: "BC v2",
      }],
      getParties: async () => [{ id: 7, name: "Roads Co" }],
      getMixTemplates: async () => [{ id: 9, name: "BC", bitumenPercent: 5 }],
      getBitumenDipReadings: async () => [{ date: "2026-01-01" }],
      getLdoDipReadings: async () => [{ date: "2026-01-01" }],
      getDailyPlantSummary: async () => ({
        reconciliation: { bitumen: { actualUsedMT: 0.45 } },
        ldo: { consumedTotalL: 55 },
      }),
    };
    const report = await buildPlantNormActualReport(mockStorage, {
      from: "2026-01-01", to: "2026-01-01", plantName: "Test plant",
    });
    expect(report.groups[0]).toMatchObject({ partyName: "Roads Co", orderNo: "SO-1", mixName: "BC v2", bitumenNormMt: 0.5, ldoNormL: 60 });
    expect(report.daily[0]).toMatchObject({ bitumenActualMt: 0.45, ldoActualL: 55 });
    expect(report.totals.bitumenVariance.saved).toBe(0.05);
    expect(report.totals.ldoVariance.saved).toBe(5);
    expect(report.actualAttribution).toContain("not apportioned");
  });

  it("allows Owners and explicit users only, and does not inherit administrator defaults", () => {
    const user = { isOwner: false, isAdmin: true, isActive: true };
    const state = { rolesConfigured: true, legacyPermissions: emptyMatrix() };
    expect(fullMatrix().plant_norm_vs_actual.view).toBe(false);
    expect(canLegacySection(user, emptyMatrix(), "plant_norm_vs_actual", "view", state)).toBe(false);
    expect(canLegacySection({ ...user, isOwner: true }, emptyMatrix(), "plant_norm_vs_actual", "view", state)).toBe(true);
    const explicit = emptyMatrix();
    explicit.plant_norm_vs_actual.view = true;
    expect(canLegacySection({ ...user, isAdmin: false }, explicit, "plant_norm_vs_actual", "view", {
      rolesConfigured: true, legacyPermissions: explicit,
    })).toBe(true);
  });

  it("requires the configured HLC party for bitumen corrections only", () => {
    expect(enforceBitumenCorrectionParty("Bitumen", 22, 22)).toBe(22);
    expect(() => enforceBitumenCorrectionParty("Bitumen", 8, 22)).toThrow("must be posted to the HLC company party");
    expect(() => enforceBitumenCorrectionParty("Bitumen", 8, null)).toThrow("Select the company party");
    expect(enforceBitumenCorrectionParty("LDO", 8, 22)).toBe(8);
  });

  it("posts the shared dip/book difference to HLC without rewriting other party books", () => {
    expect(calculateHlcBitumenCorrectionTarget({
      physicalTotalMt: 10,
      allPartyBookMt: 12,
      hlcBookMt: 5,
    })).toEqual({ adjustmentMt: -2, targetHlcMt: 3 });
  });

  it("rejects invalid or excessively long date ranges", () => {
    expect(validPlantNormActualRange("2026-01-01", "2026-12-31")).toBe(true);
    expect(validPlantNormActualRange("2026-01-02", "2026-01-01")).toBe(false);
    expect(validPlantNormActualRange("2025-01-01", "2026-01-03")).toBe(false);
  });
});
