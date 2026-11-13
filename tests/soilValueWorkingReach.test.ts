import { describe, expect, it } from "vitest";
import { allocateBoqQuantityToWorkingReaches, defaultsToFixedQuantity, quantityForWorkingReach, workingValueCategory } from "../shared/workingReachValue";
import type { ScopeSegmentLike } from "../shared/projectScope";

const reaches: ScopeSegmentLike[] = [
  { id: 1, segmentType: "working_reach", chainageFrom: 0, chainageTo: 1.6, side: null, status: "confirmed", applicability: "all_linear", label: "Reach 1" },
  { id: 2, segmentType: "no_scope", chainageFrom: 1.6, chainageTo: 1.9, side: null, status: "confirmed", applicability: "all_linear", label: "Reach 2" },
  { id: 3, segmentType: "working_reach", chainageFrom: 1.9, chainageTo: 2.9, side: null, status: "confirmed", applicability: "all_linear", label: "Reach 3" },
];

describe("SOIL-VALUE working-reach shares", () => {
  it("keeps counted and structure quantities whole by default, with Owner override and reach assignment", () => {
    expect(defaultsToFixedQuantity({ unit: "Nos", workCategory: null, planningWorkType: "road", layerConfig: null })).toBe(true);
    expect(defaultsToFixedQuantity({ unit: "Cum", workCategory: "ROAD_FURNITURE", planningWorkType: "road", layerConfig: null })).toBe(true);
    expect(allocateBoqQuantityToWorkingReaches({
      boqItemId: 10, categoryId: null, isLinear: true, currentQty: 5, unit: "Nos",
    }, reaches).shares).toMatchObject([{ label: "Whole project", quantity: 5 }]);
    const selected = allocateBoqQuantityToWorkingReaches({
      boqItemId: 10, categoryId: null, isLinear: true, currentQty: 5, unit: "Cum",
      fixedQuantity: true, fixedQuantityReachId: 3,
    }, reaches);
    expect(selected.shares).toMatchObject([{ reachId: 3, quantity: 5 }]);
    expect(selected.notNeededQuantity).toBe(0);
    expect(allocateBoqQuantityToWorkingReaches({
      boqItemId: 10, categoryId: null, isLinear: true, currentQty: 5, unit: "Nos", fixedQuantity: false,
    }, reaches).shares.map(row => row.quantity)).toEqual([5 * 1.6 / 2.9, 5 / 2.9]);
  });
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

  it("does not allocate an item-specific BOQ item to reaches that exclude it", () => {
    const allocation = allocateBoqQuantityToWorkingReaches({
      boqItemId: 88, categoryId: null, isLinear: true, currentQty: 500,
    }, [{
      id: 4, segmentType: "working_reach", chainageFrom: 0, chainageTo: 2.9, side: null,
      status: "confirmed", applicability: "items", itemIds: [77], label: "Selected items only",
    }]);
    expect(allocation.scoped).toBe(true);
    expect(allocation.workingQuantity).toBe(0);
    expect(allocation.notNeededQuantity).toBe(500);
  });
  it("keeps the full corridor denominator while sharing only across reaches that apply", () => {
    const scoped = allocateBoqQuantityToWorkingReaches({
      boqItemId: 88, categoryId: null, isLinear: true, currentQty: 500,
    }, [
      { ...reaches[0], applicability: "items", itemIds: [77] },
      reaches[1],
      reaches[2],
    ]);
    expect(scoped.denominatorKm).toBeCloseTo(2.9);
    expect(scoped.workingQuantity).toBeCloseTo(500 / 2.9);
    expect(scoped.notNeededQuantity).toBeCloseTo(500 - 500 / 2.9);
    expect(scoped.shares).toMatchObject([{ reachId: 3, quantity: 500 / 2.9 }]);
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

  it("keeps incidental and rework quantities visible without counting them as value-earning work", () => {
    const valid = { quantity: 120, dprConversionFactor: 1, side: "LHS", chainageFrom: "0+000", chainageTo: "0+120" };
    const share = { chainageFrom: 0, chainageTo: 1.6, side: null };
    expect(quantityForWorkingReach({ ...valid, isIncidental: true }, share, 1)).toBeCloseTo(120);
    expect(quantityForWorkingReach({ ...valid, isIncidental: true, reworkNoNewMaterial: true }, share, 1)).toBeCloseTo(120);
    expect(workingValueCategory({ isIncidental: true })).toBe("incidental");
    expect(workingValueCategory({ isIncidental: true, reworkNoNewMaterial: true })).toBe("rework");
    expect(workingValueCategory({ isIncidental: false, reworkNoNewMaterial: false })).toBe("billable");
    // The report preserves the two classifications separately; only billable
    // quantity contributes to done/value.
    const billable = quantityForWorkingReach(valid, share, 1);
    expect(billable).toBeCloseTo(120);
  });
});
