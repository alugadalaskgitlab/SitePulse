import { describe, expect, it } from "vitest";
import { allocateBoqQuantityToWorkingReaches } from "../shared/workingReachValue";
import type { ScopeSegmentLike } from "../shared/projectScope";

const reach = (
  id: number,
  from: number,
  to: number,
  itemIds: number[],
): ScopeSegmentLike => ({
  id,
  segmentType: "working_reach",
  chainageFrom: from,
  chainageTo: to,
  status: "confirmed",
  applicability: "items",
  itemIds,
});

const fixedItem = (overrides: Record<string, unknown> = {}) => ({
  boqItemId: 7,
  currentQty: 120,
  unit: "NOS",
  fixedQuantity: true,
  ...overrides,
});

describe("fixed quantity scope allocation", () => {
  it("assigns an unselected fixed quantity to the only applicable confirmed reach", () => {
    const result = allocateBoqQuantityToWorkingReaches(
      fixedItem() as any,
      [reach(11, 0, 1.6, [7]), reach(13, 1.9, 2.9, [8])],
    );

    expect(result.workingQuantity).toBe(120);
    expect(result.notNeededQuantity).toBe(0);
    expect(result.shares).toHaveLength(1);
    expect(result.shares[0]).toMatchObject({ reachId: 11, label: "Reach 1", quantity: 120 });
  });

  it("keeps a fixed quantity covering multiple reaches as one Whole road row", () => {
    const result = allocateBoqQuantityToWorkingReaches(
      fixedItem() as any,
      [reach(11, 0, 1.6, [7]), reach(13, 1.9, 2.9, [7])],
    );

    expect(result.workingQuantity).toBe(120);
    expect(result.shares).toEqual([
      expect.objectContaining({ reachId: null, label: "Whole road", quantity: 120 }),
    ]);
  });

  it("uses the explicit reach selection even when the item applies to more than one reach", () => {
    const result = allocateBoqQuantityToWorkingReaches(
      fixedItem({ fixedQuantityReachId: 13 }) as any,
      [reach(11, 0, 1.6, [7]), reach(13, 1.9, 2.9, [7])],
    );

    expect(result.shares).toEqual([
      expect.objectContaining({ reachId: 13, label: "Reach 2", quantity: 120 }),
    ]);
  });

  it("keeps the existing whole-road behavior when no confirmed working reach applies", () => {
    const result = allocateBoqQuantityToWorkingReaches(
      fixedItem() as any,
      [reach(11, 0, 1.6, [8])],
    );

    expect(result.workingQuantity).toBe(120);
    expect(result.shares[0]).toMatchObject({ reachId: null, label: "Whole road", quantity: 120 });
  });
});
