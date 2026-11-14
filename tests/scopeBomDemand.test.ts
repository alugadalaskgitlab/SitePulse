import { describe, expect, it } from "vitest";
import { calculateBomDemand, type BomInputBar, type BomInputItem } from "../shared/planningEngine";
import { buildScopeBasedBomSchedule, buildScopeProgrammeAlignment } from "../shared/scopeBomDemand";
import type { ScopeSegmentLike } from "../shared/projectScope";

function item(overrides: Partial<BomInputItem> = {}): BomInputItem {
  return {
    id: 1,
    itemCode: "1",
    itemName: "Test road work",
    description: "Test road work — long description",
    unit: "Cum",
    currentQty: 100,
    materials: [],
    equipment: [{ equipmentName: "Motor grader", qtyPerBoqUnit: 1 }],
    labour: [],
    layerConfig: { layerType: "earthwork" } as any,
    ...overrides,
  };
}

function reach(id: number, from: number, to: number): ScopeSegmentLike {
  return {
    id,
    segmentType: "working_reach",
    chainageFrom: from,
    chainageTo: to,
    status: "confirmed",
    applicability: "all_linear",
  };
}

function bar(overrides: Partial<BomInputBar> & Record<string, unknown>): BomInputBar {
  return {
    id: 1,
    boqItemId: 1,
    chainageFrom: 0,
    chainageTo: 1,
    startMonth: 1,
    endMonth: 2,
    plannedQty: 100,
    isQtyOverride: false,
    ...overrides,
  } as BomInputBar;
}

describe("scope-driven BOM quantities and timing", () => {
  it("uses the same working-reach quantity shares instead of stored bar quantities", () => {
    const result = buildScopeBasedBomSchedule({
      items: [item()],
      bars: [
        bar({ id: 11, chainageFrom: 0, chainageTo: 1, plannedQty: 900 }),
        bar({ id: 13, chainageFrom: 2, chainageTo: 4, plannedQty: 50 }),
      ],
      segments: [
        reach(11, 0, 1),
        { ...reach(12, 1, 2), segmentType: "no_scope" },
        reach(13, 2, 4),
      ],
      totalMonths: 12,
      projectStartDate: "2026-01-01",
    });

    expect(result.items[0].currentQty).toBe(75);
    expect(result.bars.reduce((sum, row) => sum + row.plannedQty, 0)).toBeCloseTo(75, 6);
    expect(result.bars.find(row => row.id === 11)?.plannedQty).toBeCloseTo(25, 6);
    expect(result.bars.find(row => row.id === 13)?.plannedQty).toBeCloseTo(50, 6);
    const demand = calculateBomDemand(result.items, result.bars, 12);
    expect(demand.equipment[0].totalHours).toBeCloseTo(75, 6);
  });

  it("distributes scheduled quantities by actual days in project months", () => {
    const result = buildScopeBasedBomSchedule({
      items: [item({
        currentQty: 30,
        fixedQuantity: true,
        equipment: [{ equipmentName: "Motor grader", qtyPerBoqUnit: 1 }],
      })],
      bars: [bar({
        id: 21,
        chainageFrom: 0,
        chainageTo: 1,
        startDate: "2026-01-31",
        endDate: "2026-03-01",
        startMonth: 1,
        endMonth: 2,
        plannedQty: 30,
      })],
      segments: [reach(11, 0, 1)],
      totalMonths: 3,
      projectStartDate: "2026-01-31",
    });

    const scheduled = result.bars.find(row => row.id === 21)!;
    expect(scheduled.monthlyDayShares?.[1]).toBeCloseTo(28 / 30, 8);
    expect(scheduled.monthlyDayShares?.[2]).toBeCloseTo(2 / 30, 8);
    const demand = calculateBomDemand(result.items, result.bars, 3);
    expect(demand.equipment[0].monthlyHours[1]).toBeCloseTo(28, 6);
    expect(demand.equipment[0].monthlyHours[2]).toBeCloseTo(2, 6);
    expect(demand.equipment[0].totalHours).toBeCloseTo(30, 6);
  });

  it("previews clipped chainages and scope-derived quantities, while only suggesting no-scope bars for removal", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item()],
      bars: [
        bar({ id: 31, chainageFrom: 0, chainageTo: 1.2, plannedQty: 5 }),
        bar({ id: 32, chainageFrom: 2, chainageTo: 2.5, plannedQty: 95 }),
      ],
      segments: [reach(11, 0, 1)],
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows.find(row => row.barId === 31)).toMatchObject({
      action: "update",
      proposedChainageFrom: 0,
      proposedChainageTo: 1,
      proposedQuantity: 100,
    });
    expect(result.rows.find(row => row.barId === 32)).toMatchObject({
      action: "suggest_remove",
      proposedQuantity: null,
    });
    expect(result.blockedCount).toBe(0);
  });

  it("gives a fixed item its full allocated quantity on its only remaining trimmed bar", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item({
        currentQty: 500,
        itemName: "Forming Embankment with material",
        fixedQuantity: true,
      })],
      bars: [bar({
        id: 932,
        chainageFrom: 1.9,
        chainageTo: 3.2,
        plannedQty: 384.6,
      })],
      segments: [reach(11, 1.9, 2.9)],
    });

    expect(result.rows).toMatchObject([{
      barId: 932,
      proposedChainageFrom: 1.9,
      proposedChainageTo: 2.9,
      proposedQuantity: 500,
      action: "update",
    }]);
  });

  it("splits a fixed quantity across remaining bars by their trimmed lengths", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item({ currentQty: 100, fixedQuantity: true })],
      bars: [
        bar({ id: 51, chainageFrom: 0, chainageTo: 1, plannedQty: 40 }),
        bar({ id: 52, chainageFrom: 1.1, chainageTo: 2, plannedQty: 60 }),
      ],
      segments: [
        reach(11, 0, 0.9),
        { ...reach(12, 0.9, 1.1), segmentType: "no_scope" },
        reach(13, 1.1, 2),
      ],
    });

    expect(result.rows.find(row => row.barId === 51)).toMatchObject({
      proposedChainageTo: 0.9,
      proposedQuantity: 50,
    });
    expect(result.rows.find(row => row.barId === 52)).toMatchObject({
      proposedQuantity: 50,
    });
    expect(result.rows.filter(row => row.barId != null).reduce((sum, row) =>
      sum + (row.proposedQuantity ?? 0), 0)).toBe(100);
  });

  it("keeps a whole-road fixed count in whole numbers that sum to the BOQ quantity", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item({
        currentQty: 17,
        unit: "Nos",
        canonicalUnit: "Nos",
        fixedQuantity: true,
      })],
      bars: [
        bar({ id: 61, chainageFrom: 0, chainageTo: 0.5, plannedQty: 4 }),
        bar({ id: 62, chainageFrom: 2, chainageTo: 3, plannedQty: 13 }),
      ],
      segments: [reach(11, 0, 1), reach(12, 2, 3)],
    });

    const proposed = result.rows.filter(row => row.barId != null);
    expect(proposed.map(row => row.proposedQuantity)).toEqual([6, 11]);
    expect(proposed.every(row => Number.isInteger(row.proposedQuantity))).toBe(true);
    expect(proposed.reduce((sum, row) => sum + (row.proposedQuantity ?? 0), 0)).toBe(17);
  });

  it("shows an add-a-bar message when a fixed item has no bar in its reach", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item({ currentQty: 100, fixedQuantity: true })],
      bars: [bar({ id: 71, chainageFrom: 2, chainageTo: 3 })],
      segments: [reach(11, 0, 1)],
    });

    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        barId: null,
        action: "add_bar_needed",
        reason: "Test road work has no programme bar in its reach — add a bar",
      }),
    ]));
  });

  it("recognizes default-fixed Road Safety items without changing linear-item quantities", () => {
    const fixedResult = buildScopeProgrammeAlignment({
      items: [item({
        currentQty: 9,
        unit: "Sqm",
        canonicalUnit: "Sqm",
        workCategory: "Road Safety Interventions",
        fixedQuantity: null,
      })],
      bars: [bar({ id: 81, chainageFrom: 0, chainageTo: 1.2, plannedQty: 6 })],
      segments: [reach(11, 0, 1)],
    });
    expect(fixedResult.rows.find(row => row.barId === 81)?.proposedQuantity).toBe(9);

    const linearResult = buildScopeProgrammeAlignment({
      items: [item({
        currentQty: 100,
        itemName: "Dense Bituminous Macadam",
        unit: "Cum",
        workCategory: "Road Works",
        fixedQuantity: false,
      })],
      bars: [bar({ id: 82, chainageFrom: 0, chainageTo: 1.2, plannedQty: 5 })],
      segments: [reach(11, 0, 1)],
    });
    expect(linearResult.rows.find(row => row.barId === 82)).toMatchObject({
      proposedChainageTo: 1,
      proposedQuantity: 100,
    });
  });

  it("keeps the linear DGBM bar 937 preview quantity at 187.5", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item({
        id: 20,
        currentQty: 543.75,
        itemName: "Providing and laying 50",
        workCategory: "BITUMINOUS",
        fixedQuantity: null,
        layerConfig: { layerType: "bituminous" } as any,
      })],
      bars: [bar({
        id: 937,
        boqItemId: 20,
        chainageFrom: 1.9,
        chainageTo: 3.2,
        plannedQty: 243.75,
      })],
      segments: [
        {
          id: 5,
          segmentType: "working_reach",
          chainageFrom: 0,
          chainageTo: 1.6,
          status: "confirmed",
          applicability: "items",
          itemIds: [20],
        },
        {
          id: 8,
          segmentType: "no_scope",
          chainageFrom: 1.6,
          chainageTo: 1.9,
          status: "confirmed",
          applicability: "all_linear",
        },
        reach(11, 1.9, 2.9),
      ],
    });

    expect(result.rows.find(row => row.barId === 937)).toMatchObject({
      proposedChainageTo: 2.9,
      proposedQuantity: 187.5,
      action: "update",
    });
  });

  it("blocks a single bar whose scope overlap would require splitting it", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item()],
      bars: [bar({ id: 41, chainageFrom: 0, chainageTo: 3, plannedQty: 100 })],
      segments: [reach(11, 0, 1), reach(13, 2, 3)],
    });

    expect(result.rows[0]).toMatchObject({ action: "blocked" });
    expect(result.blockedCount).toBe(1);
  });

  it("blocks a bar with no chainage or structure location instead of silently omitting it", () => {
    const result = buildScopeProgrammeAlignment({
      items: [item()],
      bars: [bar({ id: 42, chainageFrom: null, chainageTo: null, structureChainageKm: null })],
      segments: [reach(11, 0, 1)],
    });

    expect(result.rows).toMatchObject([{
      barId: 42,
      action: "blocked",
      reason: expect.stringContaining("no chainage or structure location"),
    }]);
    expect(result.blockedCount).toBe(1);
  });
});
