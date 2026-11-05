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

    expect(row.rolledQuantity).toBe(20);
    expect(row.valuesConfigured).toBe(false);
    expect(row.compactedCum).toBeNull();
    expect(row.requiredMt).toBeNull();
    expect(row.requiredLooseCum).toBeNull();
  });
});
