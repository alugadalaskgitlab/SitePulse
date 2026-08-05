/**
 * Quantity Source instruction — calculated vs manual quantities.
 *
 * shared/dprGeometry.ts is the single contract for BOTH DPR screens
 * (Detailed/SiteEntry + SiteEdit and Guided/GuidedDpr) AND the server's
 * validateProgressQuantitySources, which recomputes geometry rather than
 * trusting a client "calculated" claim.
 */
import { describe, it, expect } from "vitest";
import {
  geometryQtyForRow,
  quantitiesMatch,
  resolveQuantitySource,
  checkQuantitySourceRow,
  MANUAL_QUANTITY_SOURCES,
} from "../shared/dprGeometry";

const cumItem = { unit: "CUM", dprMeasurementMethod: null };
const mtItem = { unit: "MT", dprMeasurementMethod: null };

describe("geometryQtyForRow", () => {
  it("uses explicit length when present", () => {
    expect(geometryQtyForRow({ length: 100, width: 5, thickness: 0.2 }, cumItem)).toBeCloseTo(100 * 5 * 0.2);
  });
  it("falls back to chainage span when length is null (Guided rows)", () => {
    // 1+200 → 1+500 = 300 m
    expect(geometryQtyForRow({ length: null, chainageFrom: "1+200", chainageTo: "1+500", width: 5, thickness: 0.2 }, cumItem)).toBeCloseTo(300 * 5 * 0.2);
  });
  it("manual-only items (MT) never produce a geometry quantity", () => {
    expect(geometryQtyForRow({ length: 100, width: 5, thickness: 0.2 }, mtItem)).toBeNull();
  });
  it("incomplete dimensions → null", () => {
    expect(geometryQtyForRow({ length: 100, width: null, thickness: null }, cumItem)).toBeNull();
  });
});

describe("resolveQuantitySource", () => {
  it("quantity matching recomputed geometry → calculated", () => {
    expect(resolveQuantitySource({ length: 100, width: 5, thickness: 0.2, quantity: 100 }, cumItem)).toBe("calculated");
  });
  it("small rounding differences still count as calculated", () => {
    expect(resolveQuantitySource({ length: 100, width: 5, thickness: 0.2, quantity: 100.004 }, cumItem)).toBe("calculated");
    expect(quantitiesMatch(100.004, 100)).toBe(true);
  });
  it("overridden quantity → null (manual source needed)", () => {
    expect(resolveQuantitySource({ length: 100, width: 5, thickness: 0.2, quantity: 95 }, cumItem)).toBeNull();
  });
  it("no geometry applies → null", () => {
    expect(resolveQuantitySource({ quantity: 50 }, mtItem)).toBeNull();
  });
});

describe("checkQuantitySourceRow — both screens + server contract", () => {
  it("untouched geometry-calculated quantity passes with NO source prompt (strict)", () => {
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 100, quantitySource: null }, cumItem)).toBeNull();
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 100, quantitySource: "calculated" }, cumItem)).toBeNull();
  });
  it("manually changed quantity is blocked until a real source is selected (strict)", () => {
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 95, quantitySource: null }, cumItem)).toMatch(/entered manually/);
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 95, quantitySource: "measured" }, cumItem)).toBeNull();
  });
  it("draft-lenient: missing source never blocks a draft", () => {
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 95, quantitySource: null }, cumItem, { draft: true })).toBeNull();
    expect(checkQuantitySourceRow({ quantity: 50, quantitySource: null }, mtItem, { draft: true })).toBeNull();
  });
  it("server rejects a 'calculated' claim whose quantity doesn't match the recompute — even on drafts", () => {
    const err = checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 95, quantitySource: "calculated" }, cumItem);
    expect(err).toMatch(/recomputes to 100\.000/);
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 95, quantitySource: "calculated" }, cumItem, { draft: true })).toMatch(/recomputes/);
  });
  it("'calculated' claim where no geometry applies at all is rejected", () => {
    expect(checkQuantitySourceRow({ quantity: 50, quantitySource: "calculated" }, mtItem)).toMatch(/no geometry calculation applies/);
  });
  it("restoring the calculated value clears the need for a manual source", () => {
    // engineer overrode 100 → 95 (needed source), then restored 100
    expect(checkQuantitySourceRow({ length: 100, width: 5, thickness: 0.2, quantity: 100, quantitySource: null }, cumItem)).toBeNull();
    expect(resolveQuantitySource({ length: 100, width: 5, thickness: 0.2, quantity: 100 }, cumItem)).toBe("calculated");
  });
  it("source 'Other' requires a note (strict), lenient on drafts", () => {
    expect(checkQuantitySourceRow({ quantity: 50, quantitySource: "other", quantitySourceNote: "" }, mtItem)).toMatch(/needs a short note/);
    expect(checkQuantitySourceRow({ quantity: 50, quantitySource: "other", quantitySourceNote: "counted trips" }, mtItem)).toBeNull();
    expect(checkQuantitySourceRow({ quantity: 50, quantitySource: "other", quantitySourceNote: "" }, mtItem, { draft: true })).toBeNull();
  });
  it("no quantity → nothing to validate", () => {
    expect(checkQuantitySourceRow({ quantity: null, quantitySource: null }, cumItem)).toBeNull();
  });
  it("manual source options never include 'calculated' (only the system sets it)", () => {
    expect(MANUAL_QUANTITY_SOURCES).not.toContain("calculated");
  });
});
