import { describe, it, expect } from "vitest";
import { convertSolidQty, normalizeUom, toMT, CFT_PER_CUM } from "../shared/uomConvert";

describe("normalizeUom", () => {
  it("maps common spellings", () => {
    expect(normalizeUom("cft")).toBe("CFT");
    expect(normalizeUom("Cum")).toBe("CUM");
    expect(normalizeUom("m³")).toBe("CUM");
    expect(normalizeUom("Ton")).toBe("MT");
    expect(normalizeUom("Litres")).toBe("LITERS");
    expect(normalizeUom("Nos.")).toBe("NOS");
    expect(normalizeUom("widget")).toBe("OTHER");
  });
});

describe("convertSolidQty", () => {
  const d = 1.75; // GSB bulk density MT/m³

  it("returns same qty for identical units", () => {
    expect(convertSolidQty(50, "CUM", "CUM", d)).toBe(50);
  });

  it("CFT <-> CUM needs no density", () => {
    expect(convertSolidQty(CFT_PER_CUM, "CFT", "CUM")).toBeCloseTo(1, 6);
    expect(convertSolidQty(1, "CUM", "CFT")).toBeCloseTo(CFT_PER_CUM, 6);
  });

  it("CUM <-> MT uses density", () => {
    expect(convertSolidQty(100, "CUM", "MT", d)).toBeCloseTo(175, 6);
    expect(convertSolidQty(175, "MT", "CUM", d)).toBeCloseTo(100, 6);
  });

  it("CFT -> MT chains through CUM", () => {
    // 100 CFT -> 2.83168 m³ -> 4.9554 MT
    expect(convertSolidQty(100, "CFT", "MT", d)).toBeCloseTo((100 / CFT_PER_CUM) * d, 6);
  });

  it("mass<->volume without density returns null", () => {
    expect(convertSolidQty(100, "CUM", "MT", null)).toBeNull();
    expect(convertSolidQty(100, "MT", "CFT", 0)).toBeNull();
  });

  it("unknown / non-solid units return null", () => {
    expect(convertSolidQty(100, "Liters", "MT", d)).toBeNull();
    expect(convertSolidQty(100, "Nos", "CUM", d)).toBeNull();
  });

  it("toMT helper", () => {
    expect(toMT(100, "CUM", d)).toBeCloseTo(175, 6);
  });
});
