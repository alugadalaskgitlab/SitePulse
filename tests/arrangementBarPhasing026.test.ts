/**
 * Instruction 026 — Bar-level phasing of arrangement demand exclusion (Tests H–N).
 *
 * All demand tests invoke the REAL production engine (calculateBomDemand /
 * buildArrangementEffects / arrangementExclusionEffect). Test N invokes the
 * real validation helper used by the API route (validateBarAllocation).
 */
import { describe, it, expect } from "vitest";
import {
  calculateBomDemand,
  validateBarAllocation,
  type ArrangementDemandInput,
  type BomInputItem,
  type BomInputBar,
} from "../shared/planningEngine";

// ─── Fixtures (same recipe as Instruction 025 tests) ─────────────────────────

function earthworkItem(overrides: Partial<BomInputItem> = {}): BomInputItem {
  return {
    id: 1,
    itemCode: "3.2",
    itemName: null,
    description: "Construction of embankment with approved material",
    unit: "Cum",
    currentQty: 10000,
    materials: [],
    derivedKeyMaterials: [
      { materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true, isEarthworkBulkRequirement: true },
    ],
    equipment: [
      { equipmentName: "Excavator", qtyPerBoqUnit: 0.02, count: 1, consumptionNorm: 12, fuelType: "Diesel" },
      { equipmentName: "Tipper 10 Cum", qtyPerBoqUnit: 0.05, count: 1, consumptionNorm: 8, fuelType: "Diesel" },
      { equipmentName: "Motor Grader", qtyPerBoqUnit: 0.01, count: 1, consumptionNorm: 10, fuelType: "Diesel" },
    ],
    labour: [
      { designation: "Mazdoor", qtyPerBoqUnit: 0.03 },
      { designation: "Surveyor", qtyPerBoqUnit: 0.002 },
    ],
    ...overrides,
  } as BomInputItem;
}

const ALL_AGENCY: Record<string, string> = {
  material_source: "agency", source_identification: "agency", excavation: "agency",
  loading: "agency", transport: "agency", dumping: "agency", spreading: "agency",
  watering: "agency", compaction: "agency", equipment: "agency", tippers: "agency",
  operators_drivers: "agency", diesel_fuel: "agency",
  survey_setting_out: "hlc", quality_testing: "hlc",
};

function arr(overrides: Partial<ArrangementDemandInput> = {}): ArrangementDemandInput {
  return {
    id: 100, status: "approved", allocatedQty: 3000, boqItemId: 1,
    components: { ...ALL_AGENCY }, dieselResponsibility: "agency", agencyName: "Narsimulu",
    ...overrides,
  };
}

// Two bars: "August" = month 1 (4,000 CUM), "September" = month 2 (6,000 CUM)
const AUG_BAR: BomInputBar = { id: 11, boqItemId: 1, chainageFrom: 0, chainageTo: 2, startMonth: 1, endMonth: 2, plannedQty: 4000, isQtyOverride: false };
const SEP_BAR: BomInputBar = { id: 12, boqItemId: 1, chainageFrom: 2, chainageTo: 5, startMonth: 2, endMonth: 3, plannedQty: 6000, isQtyOverride: false };

const demandOf = (arrangements?: ArrangementDemandInput[], bars: BomInputBar[] = [AUG_BAR, SEP_BAR]) =>
  calculateBomDemand([earthworkItem()], bars, 12, { arrangements });

const eq = (d: ReturnType<typeof demandOf>, name: RegExp) =>
  d.equipment.find(e => name.test(e.equipmentName))!;
const diesel = (d: ReturnType<typeof demandOf>) =>
  d.materials.find(m => /diesel/i.test(m.materialName))!;
const lab = (d: ReturnType<typeof demandOf>, name: RegExp) =>
  d.labour.find(l => name.test(l.designation))!;

const base = demandOf();

// ─── H. One linked bar ────────────────────────────────────────────────────────

describe("H: 3,000 of the 4,000 CUM August bar outsourced via bar link", () => {
  const d = demandOf([arr({ programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 3000 }] })]);

  it("August excavator hours reduced to the 1,000 CUM HLC remainder", () => {
    // Base month 1 = 4,000 CUM of work → excluded 3,000 → retained 1,000 (25%)
    expect(eq(d, /excavator/i).monthlyHours[1]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[1] * 0.25, 3);
  });

  it("no other bar changes — September untouched", () => {
    expect(eq(d, /excavator/i).monthlyHours[2]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[2], 3);
    expect(diesel(d).monthlyQty[2]).toBeCloseTo(diesel(base).monthlyQty[2], 3);
    expect(lab(d, /mazdoor/i).monthlyDays[2]).toBeCloseTo(lab(base, /mazdoor/i).monthlyDays[2], 3);
  });

  it("totals reflect the overall 7,000/10,000 retained fraction", () => {
    expect(eq(d, /excavator/i).totalHours).toBeCloseTo(eq(base, /excavator/i).totalHours * 0.7, 2);
    expect(diesel(d).totalQty).toBeCloseTo(diesel(base).totalQty * 0.7, 1);
  });
});

// ─── I. Month-specific phasing ────────────────────────────────────────────────

describe("I: August bar outsourced, September bar HLC", () => {
  const d = demandOf([arr({ allocatedQty: 4000, programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 4000 }] })]);

  it("August fully removed for excluded equipment", () => {
    expect(eq(d, /excavator/i).monthlyHours[1] ?? 0).toBeCloseTo(0, 3);
    expect(eq(d, /tipper/i).monthlyHours[1] ?? 0).toBeCloseTo(0, 3);
  });

  it("September unchanged", () => {
    expect(eq(d, /excavator/i).monthlyHours[2]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[2], 3);
    expect(diesel(d).monthlyQty[2]).toBeCloseTo(diesel(base).monthlyQty[2], 3);
  });
});

// ─── J. One arrangement across two bars ───────────────────────────────────────

describe("J: one 7,000 CUM arrangement split 3,000 (Aug) + 4,000 (Sep)", () => {
  const d = demandOf([arr({
    allocatedQty: 7000,
    programmeAllocations: [
      { programmeBarId: 11, boqItemId: 1, qty: 3000 },
      { programmeBarId: 12, boqItemId: 1, qty: 4000 },
    ],
  })]);

  it("each bar phased independently", () => {
    // Aug: 4,000 − 3,000 → 25% retained; Sep: 6,000 − 4,000 → 33.33% retained
    expect(eq(d, /excavator/i).monthlyHours[1]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[1] * 0.25, 3);
    expect(eq(d, /excavator/i).monthlyHours[2]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[2] * (2000 / 6000), 3);
  });

  it("total exclusion equals 7,000 CUM (30% retained)", () => {
    expect(eq(d, /excavator/i).totalHours).toBeCloseTo(eq(base, /excavator/i).totalHours * 0.3, 2);
  });
});

// ─── K. Legacy arrangement (no bar links) + no double exclusion ───────────────

describe("K: legacy BOQ-level arrangement (no bar links)", () => {
  it("current uniform demand effect remains", () => {
    const d = demandOf([arr({ allocatedQty: 3000 })]);
    // Uniform 70% retained in EVERY month (legacy behaviour)
    expect(eq(d, /excavator/i).monthlyHours[1]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[1] * 0.7, 3);
    expect(eq(d, /excavator/i).monthlyHours[2]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[2] * 0.7, 3);
    expect(eq(d, /excavator/i).totalHours).toBeCloseTo(eq(base, /excavator/i).totalHours * 0.7, 2);
  });

  it("after fully linking, no duplicate exclusion — total identical, timing shifts", () => {
    const legacy = demandOf([arr({ allocatedQty: 3000 })]);
    const linked = demandOf([arr({ allocatedQty: 3000, programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 3000 }] })]);
    // Same total exclusion (no double counting)
    expect(eq(linked, /excavator/i).totalHours).toBeCloseTo(eq(legacy, /excavator/i).totalHours, 2);
    // But timing differs: linked concentrates the exclusion into August
    expect(eq(linked, /excavator/i).monthlyHours[1]).toBeLessThan(eq(legacy, /excavator/i).monthlyHours[1] - 0.001);
    expect(eq(linked, /excavator/i).monthlyHours[2]).toBeGreaterThan(eq(legacy, /excavator/i).monthlyHours[2] + 0.001);
  });

  it("partially linked: linked qty phased to bar, remainder legacy — total still single exclusion", () => {
    const d = demandOf([arr({ allocatedQty: 3000, programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 2000 }] })]);
    expect(eq(d, /excavator/i).totalHours).toBeCloseTo(eq(base, /excavator/i).totalHours * 0.7, 2);
  });
});

// ─── L. Draft bar allocation ──────────────────────────────────────────────────

describe("L: draft arrangement linked to a bar has no demand effect", () => {
  const d = demandOf([arr({ status: "draft", programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 3000 }] })]);

  it("demand identical to baseline", () => {
    expect(eq(d, /excavator/i).totalHours).toBeCloseTo(eq(base, /excavator/i).totalHours, 3);
    expect(eq(d, /excavator/i).monthlyHours[1]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[1], 3);
    expect(diesel(d).totalQty).toBeCloseTo(diesel(base).totalQty, 2);
  });
});

// ─── M. Cancelled bar allocation ──────────────────────────────────────────────

describe("M: cancelling an approved bar-linked arrangement restores demand", () => {
  it("demand returns immediately once status = cancelled", () => {
    const approved = demandOf([arr({ programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 3000 }] })]);
    const cancelled = demandOf([arr({ status: "cancelled", programmeAllocations: [{ programmeBarId: 11, boqItemId: 1, qty: 3000 }] })]);
    expect(eq(approved, /excavator/i).monthlyHours[1]).toBeLessThan(eq(base, /excavator/i).monthlyHours[1]);
    expect(eq(cancelled, /excavator/i).monthlyHours[1]).toBeCloseTo(eq(base, /excavator/i).monthlyHours[1], 3);
    expect(eq(cancelled, /excavator/i).totalHours).toBeCloseTo(eq(base, /excavator/i).totalHours, 2);
  });
});

// ─── N. Over-allocation (real route validation helper) ────────────────────────

describe("N: bar over-allocation blocked with remaining quantity shown", () => {
  const bar = { id: 11, boqProjectId: 2, boqItemId: 1, plannedQty: 4000 };
  const arrangement = { boqProjectId: 2, allocatedQty: 10000, boqItemId: 1 };

  it("4,000 bar with 3,500 active: new 1,000 blocked, remaining shown as 500", () => {
    const v = validateBarAllocation({
      allocatedQty: 1000, bar, arrangement,
      existingActiveOnBar: 3500, existingActiveForArrangement: 3500,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("BAR_ALLOCATION_EXCEEDS_PLANNED_QTY");
      expect(v.remainingQty).toBe(500);
    }
  });

  it("exactly 500 is allowed", () => {
    const v = validateBarAllocation({
      allocatedQty: 500, bar, arrangement,
      existingActiveOnBar: 3500, existingActiveForArrangement: 3500,
    });
    expect(v.ok).toBe(true);
  });

  it("project mismatch and item mismatch rejected", () => {
    expect(validateBarAllocation({
      allocatedQty: 100, bar, arrangement: { ...arrangement, boqProjectId: 3 },
      existingActiveOnBar: 0, existingActiveForArrangement: 0,
    })).toMatchObject({ ok: false, code: "ARRANGEMENT_PROJECT_MISMATCH" });
    expect(validateBarAllocation({
      allocatedQty: 100, bar: { ...bar, boqItemId: 99 }, arrangement,
      existingActiveOnBar: 0, existingActiveForArrangement: 0,
    })).toMatchObject({ ok: false, code: "ARRANGEMENT_BOQ_ITEM_MISMATCH" });
  });

  it("allocations cannot exceed the arrangement total", () => {
    const v = validateBarAllocation({
      allocatedQty: 3000, bar, arrangement: { ...arrangement, allocatedQty: 3500 },
      existingActiveOnBar: 0, existingActiveForArrangement: 1000,
    });
    expect(v).toMatchObject({ ok: false, code: "ARRANGEMENT_ALLOCATION_TOTAL_MISMATCH", remainingQty: 2500 });
  });
});
