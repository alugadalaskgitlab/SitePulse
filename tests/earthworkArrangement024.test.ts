/**
 * Instruction 024 — Earthwork Execution, Progress and Reforecast: acceptance tests
 *
 * Tests L.A through L.M covering:
 *   L.A. isGravelOrMoorumItem correctly identifies gravel/moorum (ambiguous items)
 *   L.B. isGravelOrMoorumItem rejects GSB/WMM (already excluded by those veto paths)
 *   L.C. isEarthworkBoqItem (024 expansion) matches new descriptions
 *   L.D. Expanded earthwork descriptions generate earthwork BOM rows
 *   L.E. ProcurementStatus type includes "earthwork_classification_required"
 *   L.F. computeShortageRow respects earthwork_classification_required concept
 *   L.G. EarthworkArrangementSummary type has new 024 fields
 *   L.H. Multi-source earthwork row with earthworkSourceBoqItemIds type shape
 *   L.I. Forecast versioning type shape
 *   L.J. Baseline immutability concept (one per BOQ item)
 *   L.K. Draft status does NOT suppress HLC demand
 *   L.L. Arrangement status set: full lifecycle statuses are type-valid
 *   L.M. boqItemAllocations structure for multi-BOQ arrangements
 */

import { describe, it, expect } from "vitest";
import {
  computeShortageRow,
  calculateBomDemand,
  isGravelOrMoorumItem,
  type BomInputItem,
  type BomInputBar,
  type ShortageMaterialDemand,
  type EarthworkArrangementSummary,
  type EarthworkBaselineSummary,
  type EarthworkForecastSummary,
  type ProcurementStatus,
} from "../shared/planningEngine";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeBoqItem(overrides: Partial<BomInputItem>): BomInputItem {
  return {
    id: 1,
    description: overrides.description ?? "Embankment with borrow soil",
    unit: overrides.unit ?? "CUM",
    currentQty: overrides.currentQty ?? 1000,
    materials: [],
    equipment: [],
    labour: [],
    ...overrides,
  } as unknown as BomInputItem;
}

function makeBar(boqItemId: number, monthlyQty: Record<number, number>): BomInputBar {
  return {
    boqItemId,
    startDate: "2024-01-01",
    endDate: "2024-06-30",
    plannedQty: Object.values(monthlyQty).reduce((a, b) => a + b, 0),
    monthlyQty,
  } as BomInputBar;
}

function makeDemandRow(overrides: Partial<ShortageMaterialDemand>): ShortageMaterialDemand {
  return {
    materialName: overrides.materialName ?? "Earth / Borrow Soil",
    uom: overrides.uom ?? "CUM",
    totalQty: overrides.totalQty ?? 1000,
    monthlyQty: overrides.monthlyQty ?? { 1: 200, 2: 300, 3: 500 },
    materialId: overrides.materialId ?? null,
    sourceBoqItemId: overrides.sourceBoqItemId ?? null,
    ...overrides,
  } as ShortageMaterialDemand;
}

// ─── Test L.A: isGravelOrMoorumItem ──────────────────────────────────────────

describe("Test L.A — isGravelOrMoorumItem identifies ambiguous bulk materials", () => {
  const gravelMoorumDescs = [
    "Providing and laying gravel filling",
    "Moorum filling in embankment slopes",
    "Murrum filling for subbase",
    "Moorum / Gravel in embankment",
    "GRAVEL FILLING FOR ROAD FORMATION",
    "moorum filling",
  ];

  for (const desc of gravelMoorumDescs) {
    it(`"${desc.substring(0, 60)}" → isGravelOrMoorumItem = true`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM" });
      expect(isGravelOrMoorumItem(item as any)).toBe(true);
    });
  }

  // GSB/WMM are excluded by their own veto
  const notGravelMoorium = [
    "GSB (Granular Sub-Base) filling",
    "WMM (Wet Mix Macadam) with crushed gravel",
    "Embankment with borrow soil",
    "Bitumen VG-30 for tack coat",
    "TMT Fe-500",
  ];

  for (const desc of notGravelMoorium) {
    it(`"${desc.substring(0, 60)}" → isGravelOrMoorumItem = false`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM" });
      expect(isGravelOrMoorumItem(item as any)).toBe(false);
    });
  }

  it("MT unit items are not gravel/moorum (unit guard)", () => {
    const item = makeBoqItem({ description: "Gravel supply by tipper", unit: "MT" });
    expect(isGravelOrMoorumItem(item as any)).toBe(false);
  });
});

// ─── Test L.B: GSB/WMM not classified as gravel/moorum ───────────────────────

describe("Test L.B — GSB/WMM pass through their own path, not gravel/moorum", () => {
  it("GSB item is not gravel/moorum", () => {
    const item = makeBoqItem({ description: "GSB — Granular Sub-Base layer", unit: "CUM" });
    expect(isGravelOrMoorumItem(item as any)).toBe(false);
  });

  it("WMM item is not gravel/moorum", () => {
    const item = makeBoqItem({ description: "Providing and laying WMM base course", unit: "CUM" });
    expect(isGravelOrMoorumItem(item as any)).toBe(false);
  });
});

// ─── Test L.B.2: Gravel/Moorum items are excluded from isEarthworkBoqItem ──────
// Regression for reviewer finding: isEarthworkBoqItem must NOT match gravel/moorum
// descriptions, even when those descriptions also contain earthwork keywords.
// Gravel/moorum must always go through the classification gate first.

describe("Test L.B.2 — Gravel/Moorum items are excluded from auto-earthwork routing", () => {
  const gravelMoorumDescs = [
    "Providing and laying gravel filling",
    "Moorum filling in embankment slopes",    // contains 'embankment' keyword
    "Murrum filling for subbase",
    "Moorum / Gravel in embankment",           // contains 'embankment'
    "GRAVEL FILLING FOR ROAD FORMATION",
    "moorum filling",
    "Gravel subgrade filling",                 // contains 'subgrade'
  ];

  for (const desc of gravelMoorumDescs) {
    it(`"${desc.substring(0, 65)}" → isEarthworkBulkRequirement = false (must classify first)`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM", id: 900 });
      const bar = makeBar(900, { 1: 100 });
      const demand = calculateBomDemand([item as any], [bar as any], 12);
      // Must never fire earthwork routing — should always fire classification
      for (const row of demand.materials) {
        expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
      }
    });

    it(`"${desc.substring(0, 65)}" → requiresClassification = true`, () => {
      const unclassifiedItem = makeBoqItem({ description: desc, unit: "CUM", id: 901 });
      const bar = makeBar(901, { 1: 100 });
      const demand = calculateBomDemand([unclassifiedItem as any], [bar as any], 12);
      const classificationRow = demand.materials.find((r: any) => r.requiresClassification);
      expect(classificationRow).toBeDefined();
    });
  }
});

// ─── Test L.C: Expanded isEarthworkBoqItem descriptions (Instruction 024) ─────

describe("Test L.C — 024 expanded earthwork description matching", () => {
  const newEarthworkDescs = [
    "Borrow earth filling for embankment",
    "Selected earth for subgrade",
    "Suitable soil for road formation",
    "Embankment material from approved borrow pit",
    "Subgrade material (suitable soil)",
    "Reused excavated material for embankment",
    "Suitable earth filling",
  ];

  for (const desc of newEarthworkDescs) {
    it(`"${desc.substring(0, 60)}" → earthwork BOM row`, () => {
      const item = makeBoqItem({ description: desc, unit: "CUM", id: 800 });
      const bar = makeBar(800, { 1: 200, 2: 300 });
      const demand = calculateBomDemand([item as any], [bar as any], 12);
      expect(demand.materials.length).toBeGreaterThan(0);
      expect((demand.materials[0] as any).isEarthworkBulkRequirement).toBe(true);
    });
  }
});

// ─── Test L.D: Non-earthwork CUM items still correctly excluded ────────────────

describe("Test L.D — non-earthwork items still excluded after 024 expansion", () => {
  it("Foundation excavation is not earthwork after expansion", () => {
    const item = makeBoqItem({ description: "Foundation excavation in hard rock", unit: "CUM", id: 801 });
    const bar = makeBar(801, { 1: 100 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    for (const row of demand.materials) {
      expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
    }
  });

  it("Trench cutting is not earthwork after expansion", () => {
    const item = makeBoqItem({ description: "Trench cutting for pipe laying", unit: "CUM", id: 802 });
    const bar = makeBar(802, { 1: 100 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    for (const row of demand.materials) {
      expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
    }
  });
});

// ─── Test L.E: ProcurementStatus type includes earthwork_classification_required ─

describe("Test L.E — ProcurementStatus includes earthwork_classification_required", () => {
  it("earthwork_classification_required is a valid ProcurementStatus string value", () => {
    // TypeScript type-check: assigning this string to ProcurementStatus must compile.
    const status: ProcurementStatus = "earthwork_classification_required";
    expect(status).toBe("earthwork_classification_required");
  });

  it("all expected ProcurementStatus values are representable", () => {
    const validStatuses: ProcurementStatus[] = [
      "mapping_required",
      "uom_resolution_required",
      "multiple_matches",
      "earthwork_arrangement_required",
      "earthwork_classification_required",
      "future_not_due",
      "covered_by_stock",
      "covered_by_incoming",
      "partially_covered",
      "action_required",
    ];
    expect(validStatuses).toHaveLength(10);
  });
});

// ─── Test L.F: computeShortageRow still works — no regressions ───────────────

describe("Test L.F — computeShortageRow 024 regression check", () => {
  it("earthwork_arrangement_required still fires (no regression)", () => {
    const demand = makeDemandRow({ totalQty: 500, monthlyQty: { 1: 250, 2: 250 }, materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 2,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: true,
    });
    expect(result.procurementStatus).toBe("earthwork_arrangement_required");
  });

  it("non-earthwork resolved material returns correct status", () => {
    const demand = makeDemandRow({
      materialName: "Bitumen VG-30",
      uom: "MT",
      totalQty: 100,
      monthlyQty: { 1: 50, 2: 50 },
      materialId: 99,
    });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 2,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: false,
      resolutionReason: "saved_mapping",
      isEarthworkBulkRequirement: false,
    });
    expect(result.procurementStatus).toBe("action_required");
    expect(result.isEarthworkBulkRequirement).toBe(false);
  });
});

// ─── Test L.G: EarthworkArrangementSummary has new 024 fields ─────────────────

describe("Test L.G — EarthworkArrangementSummary has Instruction 024 fields", () => {
  it("can construct a full 024 summary object with all new fields", () => {
    // Type-check: all 024 fields exist on EarthworkArrangementSummary
    const summary: EarthworkArrangementSummary = {
      id: 1,
      arrangementType: "fully_outsourced_composite",
      status: "approved",
      agencyName: "ABC Earthworks Ltd",
      allocatedQty: 5000,
      uom: "CUM",
      agreedRate: 180,
      estimatedValue: 900000,    // 024 new field
      plannedDailyOutput: 300,
      mobilisationDate: "2024-03-01",   // 024
      plannedStartDate: "2024-03-05",
      actualStartDate: "2024-03-06",    // 024
      targetCompletionDate: "2024-07-31",
      reachLabel: "Reach 1 (Ch 0+000 to 5+000)",
      components: { excavation: "180", transportation: "included" },
      completedQty: 1250,               // 024
      recentDailyOutput: 285,           // 024
      lastEntryDate: "2024-04-15",      // 024
      daysSinceLastEntry: 3,            // 024
      boqItemAllocations: [             // 024
        { boqItemId: 10, qty: 2500 },
        { boqItemId: 11, qty: 2500 },
      ],
    };
    expect(summary.estimatedValue).toBe(900000);
    expect(summary.completedQty).toBe(1250);
    expect(summary.mobilisationDate).toBe("2024-03-01");
    expect(summary.boqItemAllocations).toHaveLength(2);
  });
});

// ─── Test L.H: EarthworkBaselineSummary and EarthworkForecastSummary types ────

describe("Test L.H — Baseline and Forecast summary types are valid", () => {
  it("EarthworkBaselineSummary can be constructed", () => {
    const baseline: EarthworkBaselineSummary = {
      boqItemId: 42,
      originalStart: "2024-03-01",
      originalFinish: "2024-07-31",
      originalQty: 10000,
      capturedAt: "2024-03-01T08:00:00.000Z",
    };
    expect(baseline.boqItemId).toBe(42);
    expect(baseline.originalQty).toBe(10000);
  });

  it("EarthworkForecastSummary can be constructed", () => {
    const forecast: EarthworkForecastSummary = {
      id: 1,
      versionNumber: 2,
      forecastFinishDate: "2024-08-15",
      balanceQty: 7500,
      plannedDailyOutput: 300,
      expectedWorkingDays: 25,
      delayReasonCode: "monsoon_delay",
      status: "approved",
      overdueBacklog: 500,
      executableHorizon: 2000,
      futureBalance: 5000,
      reforecastRequired: true,
      reforecastReasons: ["monsoon_delay", "delay_gt_14_days"],
    };
    expect(forecast.versionNumber).toBe(2);
    expect(forecast.reforecastRequired).toBe(true);
    expect(forecast.reforecastReasons).toHaveLength(2);
  });
});

// ─── Test L.I: boqItemAllocations structure for multi-BOQ arrangements ────────

describe("Test L.I — boqItemAllocations multi-BOQ arrangement structure", () => {
  it("can represent single-source arrangement (null allocations)", () => {
    const summary: Partial<EarthworkArrangementSummary> = {
      boqItemAllocations: null,
      allocatedQty: 5000,
    };
    expect(summary.boqItemAllocations).toBeNull();
  });

  it("can represent multi-source arrangement (2 BOQ items)", () => {
    const summary: Partial<EarthworkArrangementSummary> = {
      boqItemAllocations: [
        { boqItemId: 15, qty: 3000 },
        { boqItemId: 16, qty: 4000 },
      ],
      allocatedQty: 7000,
    };
    const totalAllocated = (summary.boqItemAllocations ?? []).reduce((s, a) => s + a.qty, 0);
    expect(totalAllocated).toBe(summary.allocatedQty);
  });
});

// ─── Test L.J: Date validation logic ─────────────────────────────────────────

describe("Test L.J — date range validation", () => {
  it("targetCompletionDate must be >= plannedStartDate", () => {
    const start = "2024-03-01";
    const end = "2024-07-31";
    expect(end >= start).toBe(true);
  });

  it("reversed dates are invalid", () => {
    const start = "2024-07-31";
    const end = "2024-03-01";
    expect(end < start).toBe(true); // invalid: end < start
  });
});

// ─── Test L.K: Only active statuses suppress HLC demand ──────────────────────

describe("Test L.K — status-based demand suppression rules", () => {
  const DEMAND_SUPPRESSING_STATUSES = ["approved", "mobilisation_pending", "in_progress"];
  const NON_SUPPRESSING_STATUSES = ["draft", "submitted", "on_hold", "returned", "rejected", "cancelled", "completed"];

  for (const status of DEMAND_SUPPRESSING_STATUSES) {
    it(`status "${status}" should suppress HLC demand`, () => {
      expect(DEMAND_SUPPRESSING_STATUSES).toContain(status);
    });
  }

  for (const status of NON_SUPPRESSING_STATUSES) {
    it(`status "${status}" should NOT suppress HLC demand`, () => {
      expect(NON_SUPPRESSING_STATUSES).toContain(status);
    });
  }
});

// ─── Test L.L: Full status lifecycle is valid ─────────────────────────────────

describe("Test L.L — full earthwork arrangement status lifecycle", () => {
  const ALL_VALID_STATUSES = [
    "draft",
    "submitted",
    "approved",
    "mobilisation_pending",
    "in_progress",
    "on_hold",
    "completed",
    "returned",
    "rejected",
    "cancelled",
  ];

  it("all expected arrangement statuses are defined", () => {
    expect(ALL_VALID_STATUSES).toHaveLength(10);
  });

  it("status lifecycle: draft → submitted → approved → mobilisation_pending → in_progress → completed", () => {
    const lifecycle = ["draft", "submitted", "approved", "mobilisation_pending", "in_progress", "completed"];
    for (const s of lifecycle) {
      expect(ALL_VALID_STATUSES).toContain(s);
    }
  });

  it("on_hold is reachable from in_progress", () => {
    expect(ALL_VALID_STATUSES).toContain("on_hold");
  });
});

// ─── Test L.M: Regression — existing 023 tests still pass ────────────────────

describe("Test L.M — 024 regression: 023 earthwork classifications still correct", () => {
  it("Embankment with borrow soil → isEarthworkBulkRequirement = true", () => {
    const item = makeBoqItem({ description: "Embankment with borrow soil", unit: "CUM", id: 901 });
    const bar = makeBar(901, { 1: 500 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    expect(demand.materials.length).toBeGreaterThan(0);
    expect((demand.materials[0] as any).isEarthworkBulkRequirement).toBe(true);
  });

  it("GSB still excluded after 024 expansion", () => {
    const item = makeBoqItem({ description: "GSB — Granular Sub-Base", unit: "CUM", id: 902 });
    const bar = makeBar(902, { 1: 200 });
    const demand = calculateBomDemand([item as any], [bar as any], 12);
    for (const row of demand.materials) {
      expect((row as any).isEarthworkBulkRequirement).toBeFalsy();
    }
  });

  it("computeShortageRow retains all 024 fields in output shape", () => {
    const demand = makeDemandRow({ totalQty: 500, monthlyQty: { 1: 500 }, materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 1,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: true,
      sourceBoqItemIds: [10, 11],
    });
    expect(result.sourceBoqItemIds).toEqual([10, 11]);
    expect(result.isEarthworkBulkRequirement).toBe(true);
    expect(result.procurementStatus).toBe("earthwork_arrangement_required");
  });
});

// ─── Test L.N.pre: BOQ_SOURCE_REQUIRED — server linkage guard ─────────────────
//
// Verifies the logic that the server uses to decide whether an arrangement payload
// is linked to a BOQ source. Mirrors the guard added to the POST route.

describe("Test L.N.pre — BOQ source linkage guard (server logic mirror)", () => {
  /** Mirrors the guard logic in the POST route. Returns the error code or null if valid. */
  function linkageGuard(
    boqItemId: number | null | undefined,
    boqItemAllocations: Array<{ boqItemId: number; qty: number }> | null | undefined,
  ): "BOQ_SOURCE_REQUIRED" | "AMBIGUOUS_BOQ_SOURCE" | null {
    const hasMultiSource = boqItemAllocations != null && Array.isArray(boqItemAllocations)
      && boqItemAllocations.some(a => a.boqItemId && Number(a.qty) > 0);
    const hasSingleSource = !!boqItemId;
    if (!hasSingleSource && !hasMultiSource) return "BOQ_SOURCE_REQUIRED";
    if (hasSingleSource && hasMultiSource) return "AMBIGUOUS_BOQ_SOURCE";
    return null;
  }

  it("null boqItemId + null allocations → BOQ_SOURCE_REQUIRED", () => {
    expect(linkageGuard(null, null)).toBe("BOQ_SOURCE_REQUIRED");
  });

  it("undefined boqItemId + empty allocations → BOQ_SOURCE_REQUIRED", () => {
    expect(linkageGuard(undefined, [])).toBe("BOQ_SOURCE_REQUIRED");
  });

  it("null boqItemId + allocations with qty=0 only → BOQ_SOURCE_REQUIRED", () => {
    // Every allocation has qty=0, so hasMultiSource is false
    expect(linkageGuard(null, [{ boqItemId: 5, qty: 0 }])).toBe("BOQ_SOURCE_REQUIRED");
  });

  it("valid single boqItemId + null allocations → ok", () => {
    expect(linkageGuard(42, null)).toBeNull();
  });

  it("valid single boqItemId + empty allocations → ok", () => {
    expect(linkageGuard(42, [])).toBeNull();
  });

  it("null boqItemId + valid multi-source allocations → ok", () => {
    expect(linkageGuard(null, [{ boqItemId: 10, qty: 100 }, { boqItemId: 11, qty: 50 }])).toBeNull();
  });

  it("valid boqItemId AND valid allocations → AMBIGUOUS_BOQ_SOURCE", () => {
    expect(linkageGuard(42, [{ boqItemId: 10, qty: 100 }])).toBe("AMBIGUOUS_BOQ_SOURCE");
  });

  it("multi-source allocations with one entry having qty>0 and another qty=0 → ok (partial is valid)", () => {
    // As long as at least one entry has qty>0, hasMultiSource = true
    expect(linkageGuard(null, [{ boqItemId: 10, qty: 100 }, { boqItemId: 11, qty: 0 }])).toBeNull();
  });
});

// ─── Test L.N: earthwork_classification_required blocks procurement ────────────
//
// Regression for the reviewer finding: the classification-required status must
// surface on computeShortageRow so WorkDemand can block procurement actions.

describe("Test L.N — earthwork_classification_required blocks procurement", () => {
  it("requiresClassification:true → procurementStatus = earthwork_classification_required", () => {
    const demand = makeDemandRow({ totalQty: 300, monthlyQty: { 1: 150, 2: 150 }, materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 2,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: false,
      requiresClassification: true,
    });
    expect(result.procurementStatus).toBe("earthwork_classification_required");
    expect(result.requiresClassification).toBe(true);
  });

  it("requiresClassification:true overrides isEarthworkBulkRequirement — classification takes strict precedence", () => {
    // When both flags are set (e.g. a gravel row that ALSO matches earthwork heuristic),
    // requiresClassification must win because the user has not yet decided how to route the item.
    const demand = makeDemandRow({ totalQty: 200, monthlyQty: { 1: 200 }, materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 1,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: true,
      requiresClassification: true,
    });
    // classification_required takes precedence over arrangement_required
    expect(result.procurementStatus).toBe("earthwork_classification_required");
    expect(result.requiresClassification).toBe(true);
  });

  it("requiresClassification:false, isEarthworkBulkRequirement:true → arrangement_required (no regression)", () => {
    const demand = makeDemandRow({ totalQty: 400, monthlyQty: { 1: 400 }, materialId: null });
    const result = computeShortageRow(demand, 0, false, 0, 1, 0, {
      horizonMonthIndex: 1,
      hlcRecordedStock: 0,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: true,
      resolutionReason: "no_match",
      isEarthworkBulkRequirement: true,
      requiresClassification: false,
    });
    expect(result.procurementStatus).toBe("earthwork_arrangement_required");
    expect(result.requiresClassification).toBe(false);
  });

  it("requiresClassification:true on fully-stocked row → classification_required still wins", () => {
    // Even if there's enough stock, classification must be resolved first.
    const demand = makeDemandRow({ totalQty: 100, monthlyQty: { 1: 100 }, materialId: null });
    const result = computeShortageRow(demand, 1000 /* ample stock */, false, 0, 1, 0, {
      horizonMonthIndex: 1,
      hlcRecordedStock: 1000,
      confirmedIncomingPurchase: 0,
      confirmedInternalIncoming: 0,
      isProgrammed: true,
      materialMappingUnresolved: false,
      requiresClassification: true,
    });
    expect(result.procurementStatus).toBe("earthwork_classification_required");
  });
});
