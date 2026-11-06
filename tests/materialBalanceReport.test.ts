import { describe, expect, it } from "vitest";
import { buildMaterialBalanceRows } from "../shared/materialBalanceReport";

const profile = {
  rolledDensity: 2,
  rollingPct: 98,
  looseFactor: 1.2,
  wastagePct: 5,
};

describe("material balance report calculations", () => {
  it("shows compacted, loose and wastage quantities separately", () => {
    const [row] = buildMaterialBalanceRows([
      { materialName: "GSB", quantity: 100, uom: "Cum", profile },
    ], []);

    expect(row.compactedCum).toBe(100);
    expect(row.requiredMt).toBeCloseTo(205.8);
    expect(row.requiredLooseCum).toBeCloseTo(120);
    expect(row.requiredLooseCft).toBeCloseTo(120 * 35.3147);
    expect(row.wastageMt).toBeCloseTo(9.8);
    expect(row.wastageCum).toBeCloseTo(6);
    expect(row.valuesConfigured).toBe(true);
  });

  it("converts loose CFT receipts and calculates received minus used", () => {
    const [row] = buildMaterialBalanceRows([
      { materialName: "WMM", quantity: 10, uom: "Cum", profile },
    ], [
      { materialName: "WMM", quantity: 35.3147, uom: "CFT", basis: "loose", kind: "received", source: "Trip", attribution: "by site" },
      { materialName: "WMM", quantity: 10, uom: "MT", basis: "compacted", kind: "used", source: "DPR", attribution: "by project/item" },
    ]);

    expect(row.receivedMt).toBeCloseTo(2 * 0.98 / 1.2);
    expect(row.usedMt).toBe(10);
    expect(row.differenceMt).toBeCloseTo(2 * 0.98 / 1.2 - 10);
    expect(row.attributions).toEqual(["by site", "by project/item"]);
  });

  it("does not invent converted figures when compacted/loose values are unset", () => {
    const [row] = buildMaterialBalanceRows([
      {
        materialName: "Aggregate",
        quantity: 20,
        uom: "Cum",
        profile: { rolledDensity: null, rollingPct: null, looseFactor: null, wastagePct: null },
      },
    ], []);

    expect(row.rolledQuantity).toBeNull();
    expect(row.valuesConfigured).toBe(false);
    expect(row.compactedCum).toBeNull();
    expect(row.requiredMt).toBeNull();
    expect(row.requiredLooseCum).toBeNull();
    expect(row.receivedMt).toBeNull();
    expect(row.usedMt).toBeNull();
    expect(row.differenceMt).toBeNull();
  });

  it("keeps earthwork BOQ Cum visible and does not convert loose trips without Soil values", () => {
    const [row] = buildMaterialBalanceRows([
      { materialName: "Soil", quantity: 100, uom: "Cum", profile: null, earthwork: true },
    ], [
      { materialName: "Soil", quantity: 35.3147, uom: "CFT", basis: "loose", kind: "received", source: "Trip", attribution: "by site" },
    ]);

    expect(row.earthwork).toBe(true);
    expect(row.valuesConfigured).toBe(false);
    expect(row.rolledQuantity).toBe(100);
    expect(row.compactedCum).toBe(100);
    expect(row.requiredMt).toBeNull();
    expect(row.receivedCum).toBeNull();
  });

  it("compares earthwork receipts and DPR use in compacted Cum", () => {
    const [row] = buildMaterialBalanceRows([
      { materialName: "Soil", quantity: 10, uom: "Cum", profile, earthwork: true },
    ], [
      { materialName: "Soil", quantity: 12 * 35.3147, uom: "CFT", basis: "loose", kind: "received", source: "Trip", attribution: "by site" },
      { materialName: "Soil", quantity: 10, uom: "Cum", basis: "compacted", kind: "used", source: "DPR", attribution: "by project/item" },
    ]);

    expect(row.valuesConfigured).toBe(true);
    expect(row.requiredLooseCum).toBeCloseTo(12);
    expect(row.receivedCum).toBeCloseTo(10);
    expect(row.usedCum).toBeCloseTo(10);
    expect(row.differenceCum).toBeCloseTo(0);
  });

  it("keeps concrete water demand and actuals in native KL", () => {
    const [row] = buildMaterialBalanceRows([
      { materialName: "Water", quantity: 0.162, uom: "KL", profile: null },
    ], [
      { materialName: "Water", quantity: 0.1, uom: "KL", basis: "loose", kind: "received", source: "Receipt", attribution: "by site" },
      { materialName: "Water", quantity: 0.15, uom: "KL", basis: "compacted", kind: "used", source: "DPR", attribution: "by project/item" },
    ]);

    expect(row.valuesConfigured).toBe(true);
    expect(row.nativeQuantity).toBeCloseTo(0.162);
    expect(row.nativeUom).toBe("KL");
    expect(row.receivedNative).toBeCloseTo(0.1);
    expect(row.usedNative).toBeCloseTo(0.15);
    expect(row.differenceNative).toBeCloseTo(-0.05);
    expect(row.requiredMt).toBeNull();
  });

  it("uses a saved legacy conversion for receipt comparison only when new values are absent", () => {
    const [row] = buildMaterialBalanceRows([
      {
        materialName: "Soil",
        quantity: 10,
        uom: "Cum",
        profile: null,
        earthwork: true,
        legacyLooseToCompactedProfiles: [{ fromUom: "Cum", toUom: "Cum", conversionFactor: 0.8 }],
      },
    ], [
      { materialName: "Soil", quantity: 12.5 * 35.3147, uom: "CFT", basis: "loose", kind: "received", source: "Trip", attribution: "by site" },
      { materialName: "Soil", quantity: 10, uom: "Cum", basis: "compacted", kind: "used", source: "DPR", attribution: "by project/item" },
    ]);

    expect(row.valuesConfigured).toBe(false);
    expect(row.compactedCum).toBe(10);
    expect(row.receivedCum).toBeCloseTo(10);
    expect(row.usedCum).toBeCloseTo(10);
    expect(row.differenceCum).toBeCloseTo(0);
  });
});
