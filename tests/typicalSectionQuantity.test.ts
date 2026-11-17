import { describe, expect, it } from "vitest";
import { buildScopeBasedBomSchedule, buildScopeProgrammeAlignment } from "../shared/scopeBomDemand";
import { calculateBomDemand } from "../shared/planningEngine";
import type { ScopeSegmentLike } from "../shared/projectScope";
import {
  allocateBoqQuantityToWorkingReaches,
  typicalSectionQuantityPerMetre,
  typicalSectionsValidationError,
  type BoqTypicalSection,
} from "../shared/workingReachValue";
import { applyRoleTemplate, canEditBoqItemSections, emptyMatrix, fullMatrix, ROLE_TEMPLATES } from "../shared/permissions";

const workingReach = (id: number, from: number, to: number, extra: Partial<ScopeSegmentLike> = {}): ScopeSegmentLike => ({
  id,
  segmentType: "working_reach",
  chainageFrom: from,
  chainageTo: to,
  status: "confirmed",
  applicability: "all_linear",
  ...extra,
});

const baseItem = (overrides: Record<string, unknown> = {}) => ({
  boqItemId: 7,
  categoryId: null,
  isLinear: true,
  currentQty: 1000,
  unit: "CUM",
  ...overrides,
});

const section = (overrides: Partial<BoqTypicalSection> = {}): BoqTypicalSection => ({
  chainageFrom: 0,
  chainageTo: 1,
  topWidthM: 1,
  thicknessMm: 1000,
  sideSlope: 0,
  ...overrides,
});

describe("optional BOQ typical-section quantities", () => {
  it("keeps the no-section allocation output unchanged", () => {
    const item = baseItem({ currentQty: 100, unit: "CUM" });
    const segments = [
      workingReach(11, 0, 1),
      { ...workingReach(12, 1, 2), segmentType: "no_scope" as const },
    ];
    const expected = {
      denominatorKm: 2,
      workingLengthKm: 1,
      workingQuantity: 50,
      notNeededQuantity: 50,
      scoped: true,
      shares: [{
        reachId: 11,
        label: "Reach 1",
        chainageFrom: 0,
        chainageTo: 1,
        effectiveLengthKm: 1,
        quantity: 50,
      }],
    };
    expect(allocateBoqQuantityToWorkingReaches(item as any, segments)).toEqual(expected);
    expect(allocateBoqQuantityToWorkingReaches(item as any, segments, [])).toEqual(expected);
  });

  it("calculates 7,187.5 cum for the supplied 10.5 m by 500 mm section", () => {
    const typical = section({
      chainageFrom: 0,
      chainageTo: 1.25,
      topWidthM: 10.5,
      thicknessMm: 500,
      sideSlope: 2,
    });
    expect(typicalSectionQuantityPerMetre("CUM", typical)).toBeCloseTo(5.75, 8);
    const result = allocateBoqQuantityToWorkingReaches(
      baseItem({ currentQty: 10_000 }) as any,
      [workingReach(11, 0, 1.25)],
      [typical],
    );
    expect(result.sectionResults?.[0]).toMatchObject({
      quantityPerMetre: 5.75,
      effectiveLengthM: 1250,
      stretchQuantity: 7187.5,
    });
    expect(result.workingQuantity).toBeCloseTo(7187.5, 8);
    expect(result.notNeededQuantity).toBeCloseTo(2812.5, 8);
    expect(result.overBoqQuantity).toBe(0);
  });

  it("uses section quantity for covered length and the old length-share for uncovered length", () => {
    const result = allocateBoqQuantityToWorkingReaches(
      baseItem({ currentQty: 1000 }) as any,
      [workingReach(11, 0, 1)],
      [section({ chainageFrom: 0, chainageTo: 0.5, topWidthM: 1, thicknessMm: 500 })],
    );
    expect(result.sectionResults?.[0].stretchQuantity).toBe(250);
    expect(result.shares[0].quantity).toBe(750);
  });

  it("excludes no-scope and temporary-block chainage from section length", () => {
    const result = allocateBoqQuantityToWorkingReaches(
      baseItem({ currentQty: 1000 }) as any,
      [
        workingReach(11, 0, 1),
        { ...workingReach(12, 0.4, 0.5), segmentType: "no_scope" as const },
        { ...workingReach(13, 0.7, 0.8), segmentType: "temporary_block" as const },
      ],
      [section({ chainageFrom: 0, chainageTo: 1 })],
    );
    expect(result.sectionResults?.[0].effectiveLengthM).toBeCloseTo(800, 6);
    expect(result.sectionResults?.[0].stretchQuantity).toBeCloseTo(800, 6);
    expect(result.workingQuantity).toBeCloseTo(900, 6);
  });

  it("uses width for SQM and rejects unsupported units", () => {
    const areaSection = section({ thicknessMm: null, topWidthM: 10, chainageTo: 0.2 });
    expect(typicalSectionQuantityPerMetre("SQM", areaSection)).toBe(10);
    const area = allocateBoqQuantityToWorkingReaches(
      baseItem({ unit: "SQM", currentQty: 5000 }) as any,
      [workingReach(11, 0, 0.2)],
      [areaSection],
    );
    expect(area.sectionResults?.[0].stretchQuantity).toBe(2000);
    expect(typicalSectionsValidationError("NOS", [section()])).toContain("only for CUM and SQM");
  });

  it("rejects overlapping sections", () => {
    const error = typicalSectionsValidationError("CUM", [
      section({ chainageFrom: 0, chainageTo: 1 }),
      section({ chainageFrom: 0.9, chainageTo: 1.5 }),
    ]);
    expect(error).toContain("overlap");
  });

  it("reports quantities above the current BOQ quantity without changing it", () => {
    const item = baseItem({ currentQty: 100 });
    const result = allocateBoqQuantityToWorkingReaches(
      item as any,
      [workingReach(11, 0, 0.2)],
      [section({ chainageFrom: 0, chainageTo: 0.2, topWidthM: 1, thicknessMm: 1000 })],
    );
    expect(result.workingQuantity).toBe(200);
    expect(result.overBoqQuantity).toBe(100);
    expect(item.currentQty).toBe(100);
  });

  it("ignores sections for fixed-quantity items", () => {
    const item = baseItem({ currentQty: 100, fixedQuantity: true });
    const existing = allocateBoqQuantityToWorkingReaches(item as any, [workingReach(11, 0, 1)]);
    const withSection = allocateBoqQuantityToWorkingReaches(item as any, [workingReach(11, 0, 1)], [section()]);
    expect(withSection).toEqual(existing);
  });

  it("uses the same section quantity in the work-value and scoped BOM fixture", () => {
    const fixtureItem = {
      id: 71,
      description: "Embankment earthwork synthetic fixture",
      itemName: "Synthetic earthwork",
      unit: "CUM",
      currentQty: 10_000,
      clientRate: 100,
      fixedQuantity: false,
      materials: [],
      equipment: [],
      labour: [],
      layerConfig: { layerType: "earthwork" } as any,
      sections: [section({
        chainageFrom: 0,
        chainageTo: 1.25,
        topWidthM: 10.5,
        thicknessMm: 500,
        sideSlope: 2,
      })],
    };
    const segments = [workingReach(11, 0, 1.25)];
    const before = buildScopeBasedBomSchedule({
      items: [{ ...fixtureItem, sections: [] }],
      bars: [{ id: 701, boqItemId: 71, chainageFrom: 0, chainageTo: 1.25, startMonth: 1, endMonth: 2, plannedQty: 10_000 } as any],
      segments,
      totalMonths: 2,
    });
    const after = buildScopeBasedBomSchedule({
      items: [fixtureItem],
      bars: [{ id: 701, boqItemId: 71, chainageFrom: 0, chainageTo: 1.25, startMonth: 1, endMonth: 2, plannedQty: 10_000 } as any],
      segments,
      totalMonths: 2,
    });
    const beforeDemand = calculateBomDemand(before.items as any[], before.bars as any[], 2);
    const afterDemand = calculateBomDemand(after.items as any[], after.bars as any[], 2);
    expect(before.items[0].currentQty).toBeCloseTo(10_000, 6);
    expect(after.items[0].currentQty).toBeCloseTo(7187.5, 6);
    expect(after.items[0].currentQty * fixtureItem.clientRate).toBeCloseTo(718_750, 6);
    expect(after.bars.reduce((sum, row) => sum + Number(row.plannedQty), 0)).toBeCloseTo(7187.5, 6);
    expect(beforeDemand.materials.find(row => row.materialName === "Earth / Borrow Soil")?.totalQty).toBeCloseTo(10_000, 6);
    expect(afterDemand.materials.find(row => row.materialName === "Earth / Borrow Soil")?.totalQty).toBeCloseTo(7187.5, 6);
  });

  it("shows section quantities in bar review without changing the saved bar", () => {
    const item = {
      id: 71,
      itemCode: "SYN-1",
      itemName: "Synthetic earthwork",
      description: "Synthetic earthwork fixture",
      unit: "CUM",
      currentQty: 10_000,
      materials: [],
      equipment: [],
      labour: [],
      layerConfig: { layerType: "earthwork" } as any,
      sections: [section({
        chainageFrom: 0,
        chainageTo: 1.25,
        topWidthM: 10.5,
        thicknessMm: 500,
        sideSlope: 2,
      })],
    };
    const savedBar = {
      id: 702,
      boqItemId: 71,
      chainageFrom: 0,
      chainageTo: 1.25,
      startMonth: 1,
      endMonth: 2,
      plannedQty: 10_000,
      isQtyOverride: false,
    };
    const preview = buildScopeProgrammeAlignment({
      items: [item],
      bars: [savedBar],
      segments: [workingReach(11, 0, 1.25)],
    });
    expect(preview.rows.find(row => row.barId === savedBar.id)).toMatchObject({
      action: "update",
      proposedQuantity: 7187.5,
    });
    expect(savedBar.plannedQty).toBe(10_000);
  });

  it("keeps the new edit permission off in default role matrices", () => {
    expect(emptyMatrix().boq_item_sections.edit).toBe(false);
    expect(fullMatrix().boq_item_sections.edit).toBe(false);
    for (const role of ROLE_TEMPLATES) {
      expect(applyRoleTemplate(role.id).boq_item_sections.edit).toBe(false);
    }
    expect(canEditBoqItemSections(false, fullMatrix())).toBe(false);
    expect(canEditBoqItemSections(true, emptyMatrix())).toBe(true);
    expect(canEditBoqItemSections(false, {
      ...emptyMatrix(),
      boq_item_sections: { ...emptyMatrix().boq_item_sections, edit: true },
    })).toBe(true);
  });
});
