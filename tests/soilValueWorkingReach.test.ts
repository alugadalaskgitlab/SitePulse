import { describe, expect, it } from "vitest";
import { allocateBoqQuantityToWorkingReaches, quantityForWorkingReach } from "../shared/workingReachValue";
import type { ScopeSegmentLike } from "../shared/projectScope";

const reaches: ScopeSegmentLike[] = [
  { id: 1, segmentType: "working_reach", chainageFrom: 0, chainageTo: 1.6, side: null, status: "confirmed", applicability: "all_linear", label: "Reach 1" },
  { id: 2, segmentType: "no_scope", chainageFrom: 1.6, chainageTo: 1.9, side: null, status: "confirmed", applicability: "all_linear", label: "Reach 2" },
  { id: 3, segmentType: "working_reach", chainageFrom: 1.9, chainageTo: 2.9, side: null, status: "confirmed", applicability: "all_linear", label: "Reach 3" },
];

describe("SOIL-VALUE working-reach shares", () => {
  it("allocates BOQ quantity over working reaches, retaining the no-scope portion", () => {
    const allocation = allocateBoqQuantityToWorkingReaches({
      boqItemId: 5, categoryId: null, isLinear: true, currentQty: 2900,
    }, reaches);
    expect(allocation.denominatorKm).toBeCloseTo(2.9);
    expect(allocation.workingLengthKm).toBeCloseTo(2.6);
    expect(allocation.workingQuantity).toBeCloseTo(2600);
    expect(allocation.notNeededQuantity).toBeCloseTo(300);
    expect(allocation.shares.map(row => row.quantity)).toEqual([1600, 1000]);
  });

  it("allocates submitted DPR quantity by chainage overlap and side, not programme bars", () => {
    const first = quantityForWorkingReach(
      { quantity: 800, dprConversionFactor: 1, side: "LHS", chainageFrom: "1+500", chainageTo: "2+300" },
      { chainageFrom: 0, chainageTo: 1.6, side: null },
      2,
    );
    const second = quantityForWorkingReach(
      { quantity: 800, dprConversionFactor: 1, side: "LHS", chainageFrom: "1+500", chainageTo: "2+300" },
      { chainageFrom: 1.9, chainageTo: 2.9, side: null },
      2,
    );
    expect(first).toBeCloseTo(100);
    expect(second).toBeCloseTo(400);
  });

  it("excludes incidental and rework from value while preserving their quantities for display", () => {
    const valid = { quantity: 120, dprConversionFactor: 1, side: "LHS", chainageFrom: "0+000", chainageTo: "0+120" };
    const share = { chainageFrom: 0, chainageTo: 1.6, side: null };
    expect(quantityForWorkingReach({ ...valid, isIncidental: true }, share, 1)).toBeCloseTo(120);
    expect(quantityForWorkingReach({ ...valid, reworkNoNewMaterial: true }, share, 1)).toBeCloseTo(120);
    // The report applies the classification after allocation: the two quantities
    // remain visible, but neither is added to the value-earning done total.
    const billable = quantityForWorkingReach(valid, share, 1);
    expect(billable).toBeCloseTo(120);
  });
});
