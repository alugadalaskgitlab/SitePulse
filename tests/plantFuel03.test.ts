import { describe, expect, it } from "vitest";
import { getLdoVolumeAtDepth } from "@shared/ldo-dip-chart";
import { calculateDipsOnlyFuel } from "@shared/plantFuel";

describe("PLANT-03 dips-only fuel calculations", () => {
  it("adds a 4,000 L Tank 1 receipt and transfer before splitting dryer, preheat and boiler use", () => {
    const opening = 100;
    const closing = 50;
    const tank1Used = getLdoVolumeAtDepth(1, opening) - getLdoVolumeAtDepth(1, closing) + 4000 + 250;
    const result = calculateDipsOnlyFuel({
      openingDipCm: opening,
      closingDipCm: closing,
      receiptLitres: 4000,
      transferLitres: 250,
      dryerLitres: 1100,
      preheatLitres: 300,
      dispatchedMt: 100,
    });

    expect(result.tank1UsedLitres).toBeCloseTo(tank1Used, 6);
    expect(result.boilerLitres).toBeCloseTo(Math.max(0, tank1Used - 1100 - 300), 6);
    expect(result.boilerLitresPerMt).toBeCloseTo(result.boilerLitres! / 100, 6);
    expect(result.dryerLitresPerMt).toBeCloseTo(11, 6);
    expect(result.checkDipsOrDryerMeter).toBe(false);
  });

  it("floors negative boiler production at zero and requests one check", () => {
    const result = calculateDipsOnlyFuel({
      openingDipCm: 10,
      closingDipCm: 80,
      receiptLitres: 0,
      transferLitres: 0,
      dryerLitres: 5000,
      preheatLitres: 100,
      dispatchedMt: 20,
    });
    expect(result.boilerBeforeFloor).toBeLessThan(0);
    expect(result.boilerLitres).toBe(0);
    expect(result.checkDipsOrDryerMeter).toBe(true);
  });
});
