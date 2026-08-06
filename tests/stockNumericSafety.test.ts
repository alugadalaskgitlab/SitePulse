/**
 * Shared numeric normalisation for stock/reconciliation values.
 *
 * pg returns NUMERIC/DECIMAL columns as strings; these helpers are the single
 * sanctioned consumption path for every stock screen (Physical Stock
 * Reconciliation, Stock Balances & Ledger, Stores Ledger, Stock Transfer,
 * Bitumen Stock) AND the server-side reconciliation arithmetic — one suite
 * covers all consumers.
 */
import { describe, it, expect } from "vitest";
import {
  toFiniteNumber,
  formatQty,
  resolveConversion,
  convertToBase,
  computeAdjustment,
} from "../shared/stockReconciliation";

describe("toFiniteNumber — calculation-safe normalisation", () => {
  it("passes numbers through", () => {
    expect(toFiniteNumber(12.5)).toBe(12.5);
    expect(toFiniteNumber(-3)).toBe(-3);
  });

  it("parses numeric strings from PostgreSQL", () => {
    expect(toFiniteNumber("12.500")).toBe(12.5);
    expect(toFiniteNumber("  -7.25 ")).toBe(-7.25);
    expect(toFiniteNumber("1e-6")).toBe(1e-6);
  });

  it("valid numeric zero is ZERO, not invalid", () => {
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber("0")).toBe(0);
    expect(toFiniteNumber("0.000")).toBe(0);
  });

  it("null / undefined / empty string / NaN / non-numeric text → null (never 0)", () => {
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber("")).toBeNull();
    expect(toFiniteNumber("   ")).toBeNull();
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber("abc")).toBeNull();
    expect(toFiniteNumber("12,5")).toBeNull(); // locale comma is NOT silently accepted
    expect(toFiniteNumber({} as unknown)).toBeNull();
  });

  it("caller can distinguish true zero from missing data", () => {
    const zero = toFiniteNumber("0.000");
    const missing = toFiniteNumber("");
    expect(zero === 0).toBe(true);
    expect(missing === null).toBe(true);
    expect(zero).not.toBe(missing);
  });

  it("negative quantities and very small decimals survive intact", () => {
    expect(toFiniteNumber("-0.001")).toBe(-0.001);
    expect(toFiniteNumber("0.000001")).toBe(0.000001);
  });
});

describe("formatQty — display-safe formatting", () => {
  it("formats numbers and numeric strings", () => {
    expect(formatQty(12.5)).toBe("12.5");
    expect(formatQty("12.500")).toBe("12.5");
    expect(formatQty("1250.125", 2)).toBe("1,250.13"); // en-IN locale + rounding
  });

  it("renders invalid/missing values as — instead of crashing or showing 0", () => {
    expect(formatQty(null)).toBe("—");
    expect(formatQty(undefined)).toBe("—");
    expect(formatQty("")).toBe("—");
    expect(formatQty("garbage")).toBe("—");
    expect(formatQty(NaN)).toBe("—");
  });

  it("valid zero renders as 0, not —", () => {
    expect(formatQty(0)).toBe("0");
    expect(formatQty("0.000")).toBe("0");
  });

  it("negative and tiny values", () => {
    expect(formatQty(-2.5)).toBe("-2.5");
    expect(formatQty("0.0004", 3)).toBe("0"); // rounds to 0.000 → "0"
  });
});

describe("calculation-safe use in the reconciliation domain", () => {
  it("a numeric-string conversion factor from the DB works", () => {
    const conv = resolveConversion(
      { conversionFactor: "1.6" as unknown as number, conversionFromUom: "CFT", conversionToUom: "Ton" },
      "CFT", "Ton",
    );
    expect(conv).toEqual({ kind: "multiply", factor: 1.6 });
    expect(convertToBase(10, conv!)).toBeCloseTo(16, 6);
  });

  it("a missing/invalid conversion factor blocks (null) — never acts as zero", () => {
    for (const bad of [null, "" as unknown as number, "abc" as unknown as number, NaN]) {
      expect(resolveConversion(
        { conversionFactor: bad as number | null, conversionFromUom: "CFT", conversionToUom: "Ton" },
        "CFT", "Ton",
      )).toBeNull();
    }
  });

  it("adjustment maths only ever runs on normalised numbers", () => {
    const book = toFiniteNumber("120.500");
    const phys = toFiniteNumber("118.000");
    expect(book).not.toBeNull();
    expect(phys).not.toBeNull();
    expect(computeAdjustment(book!, phys!)).toBeCloseTo(-2.5, 6);
    // and the invalid path is explicit:
    expect(toFiniteNumber("")).toBeNull(); // caller must block, not substitute 0
  });
});
