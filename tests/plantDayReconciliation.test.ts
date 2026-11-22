import { describe, expect, it } from "vitest";
import {
  calculateFuelMetrics,
  calculateGeneratorLitresPerHour,
  calculatePhysicalBitumenReconciliation,
  weightQuantityToMT,
} from "../shared/plantDayReconciliation";

describe("PLANT-01 daily reconciliation math", () => {
  it("converts receipts and reports physical bitumen difference in MT", () => {
    const result = calculatePhysicalBitumenReconciliation({
      openingTankKg: [10_000, 8_000],
      receiptLines: [
        { quantity: 1.5, uom: "MT" },
        { quantity: 500, uom: "kg" },
      ],
      closingTankKg: [9_000, 7_000],
      theoreticalMT: 3.2,
    });

    expect(result).toEqual({
      openingMT: 18,
      receivedMT: 2,
      closingMT: 16,
      actualUsedMT: 4,
      theoreticalMT: 3.2,
      differenceMT: 0.8,
      missing: [],
    });
  });

  it("does not guess receipt units and lists incomplete readings", () => {
    const result = calculatePhysicalBitumenReconciliation({
      openingTankKg: [10_000, null],
      receiptLines: [{ quantity: 2, uom: "drum" }],
      closingTankKg: [9_000, null],
      theoreticalMT: 1,
    });

    expect(result.actualUsedMT).toBeNull();
    expect(result.differenceMT).toBeNull();
    expect(result.missing).toEqual([
      "Bitumen tank 2 opening dip",
      "Bitumen tank 2 closing dip",
      "Bitumen receipt unit drum needs a weight conversion",
    ]);
  });

  it("converts kilogram quantities at 1,000 kg per MT and rejects unknown units", () => {
    expect(weightQuantityToMT(2500, "Kg")).toBe(2.5);
    expect(weightQuantityToMT(3, "tonnes")).toBe(3);
    expect(weightQuantityToMT(4, "drum")).toBeNull();
  });

  it("reports LDO litres per MT and DG litres per hour from measured values", () => {
    expect(calculateFuelMetrics(1250, 1100, 100)).toEqual({
      differenceLitres: 150,
      litresPerMT: 12.5,
    });
    expect(calculateGeneratorLitresPerHour(45, 3)).toBe(15);
    expect(calculateGeneratorLitresPerHour(45, 0)).toBeNull();
    expect(calculateFuelMetrics(null, 1100, 100)).toEqual({
      differenceLitres: null,
      litresPerMT: null,
    });
  });
});
