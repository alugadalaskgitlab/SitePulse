/**
 * Instruction 027 — Execution-state derivation + controlled edit classification.
 *
 * §29 A–H: mapping of raw arrangement statuses onto the 7 compact execution
 * states via the REAL deriveExecutionState() used by Gantt, Procurement and
 * the register. Plus classifyArrangementEdit() rules and the §27 guarantee
 * that a pending revision does NOT change engine demand.
 */
import { describe, it, expect } from "vitest";
import {
  deriveExecutionState,
  classifyArrangementEdit,
  type ExecutionStateArrangement,
} from "../shared/executionState";
import {
  calculateBomDemand,
  type ArrangementDemandInput,
  type BomInputItem,
  type BomInputBar,
} from "../shared/planningEngine";

const ALL_AGENCY: Record<string, string> = {
  material_source: "agency", source_identification: "agency", excavation: "agency",
  loading: "agency", transport: "agency", dumping: "agency", spreading: "agency",
  watering: "agency", compaction: "agency", equipment: "agency", tippers: "agency",
  operators_drivers: "agency", diesel_fuel: "agency",
  survey_setting_out: "hlc", quality_testing: "hlc",
};

function ea(overrides: Partial<ExecutionStateArrangement> = {}): ExecutionStateArrangement {
  return {
    id: 1, status: "approved", arrangementType: "fully_outsourced_composite",
    qtyForScope: 5000, agencyName: "Narsimulu", components: { ...ALL_AGENCY },
    pendingRevision: null,
    ...overrides,
  };
}

describe("§29 A–H: execution-state mapping", () => {
  it("A: no arrangements → Execution Arrangement Required", () => {
    expect(deriveExecutionState(5000, []).state).toBe("arrangement_required");
  });

  it("B: draft/submitted outsourcing proposal → Outsourcing Proposed", () => {
    expect(deriveExecutionState(5000, [ea({ status: "draft" })]).state).toBe("outsourcing_proposed");
    expect(deriveExecutionState(5000, [ea({ status: "submitted" })]).state).toBe("outsourcing_proposed");
    expect(deriveExecutionState(5000, [ea({ status: "returned" })]).state).toBe("outsourcing_proposed");
  });

  it("C: approved full-coverage all-agency arrangement → Outsourcing Approved with agency badge", () => {
    const r = deriveExecutionState(5000, [ea()]);
    expect(r.state).toBe("outsourcing_approved");
    expect(r.badge).toContain("Narsimulu");
    expect(r.agencyName).toBe("Narsimulu");
  });

  it("C2: mobilisation_pending / in_progress / completed also read as approved decision", () => {
    for (const status of ["mobilisation_pending", "in_progress", "completed"]) {
      expect(deriveExecutionState(5000, [ea({ status })]).state).toBe("outsourcing_approved");
    }
  });

  it("D: partial quantity approved → Partly Outsourced with X / Y badge", () => {
    const r = deriveExecutionState(5000, [ea({ qtyForScope: 3000 })], { uom: "CUM" });
    expect(r.state).toBe("partly_outsourced");
    expect(r.badge).toMatch(/3,000.*5,000/);
    expect(r.effectiveOutsourcedQty).toBe(3000);
  });

  it("D2: full quantity but split responsibility (HLC does execution parts) → Partly Outsourced", () => {
    const split = { ...ALL_AGENCY, compaction: "hlc", equipment: "hlc", transport: "hlc", excavation: "hlc", spreading: "hlc" };
    const r = deriveExecutionState(5000, [ea({ components: split })]);
    expect(r.state).toBe("partly_outsourced");
  });

  it("E: approved hlc_in_house / reused_excavated full coverage → HLC In-house", () => {
    expect(deriveExecutionState(5000, [ea({ arrangementType: "hlc_in_house", agencyName: null, components: null })]).state).toBe("hlc_inhouse");
    expect(deriveExecutionState(5000, [ea({ arrangementType: "reused_excavated", agencyName: null, components: null })]).state).toBe("hlc_inhouse");
  });

  it("E2: saved-but-unapproved in-house decision still reads HLC In-house (§2)", () => {
    expect(deriveExecutionState(5000, [ea({ status: "draft", arrangementType: "hlc_in_house", agencyName: null, components: null })]).state).toBe("hlc_inhouse");
  });

  it("F: client_supplied full coverage → Client Supplied", () => {
    expect(deriveExecutionState(5000, [ea({ arrangementType: "client_supplied", agencyName: null, components: null })]).state).toBe("client_supplied");
  });

  it("G: on_hold arrangement (no other effective work) → On Hold; barOnHold forces On Hold", () => {
    expect(deriveExecutionState(5000, [ea({ status: "on_hold" })]).state).toBe("on_hold");
    expect(deriveExecutionState(5000, [ea()], { barOnHold: true }).state).toBe("on_hold");
  });

  it("G2: on-hold quantity still counts toward coverage for the paused decision", () => {
    const r = deriveExecutionState(5000, [ea({ status: "on_hold" })]);
    expect(r.effectiveOutsourcedQty).toBe(5000);
  });

  it("H: cancelled/rejected arrangements are ignored entirely", () => {
    expect(deriveExecutionState(5000, [ea({ status: "cancelled" }), ea({ id: 2, status: "rejected" })]).state).toBe("arrangement_required");
  });

  it("pendingRevision flag surfaces without changing the state", () => {
    const r = deriveExecutionState(5000, [ea({ pendingRevision: { fields: { agreedRate: 95 } } })]);
    expect(r.state).toBe("outsourcing_approved");
    expect(r.pendingRevision).toBe(true);
  });
});

describe("§17–18: classifyArrangementEdit", () => {
  const current = {
    agencyName: "Narsimulu", allocatedQty: 5000, agreedRate: 85,
    notes: "old", targetCompletionDate: "2026-09-30", plannedDailyOutput: 400,
    reachLabel: "Reach 1",
  };

  it("operational-only edit (notes, reachLabel) → operational, no reason needed", () => {
    const c = classifyArrangementEdit(current, { notes: "new", reachLabel: "Reach 1A" });
    expect(c.operational.sort()).toEqual(["notes", "reachLabel"]);
    expect(c.material).toEqual([]);
    expect(c.reasonRequired).toBe(false);
  });

  it("date/output change → operational but reason required", () => {
    const c = classifyArrangementEdit(current, { targetCompletionDate: "2026-10-15" });
    expect(c.operational).toEqual(["targetCompletionDate"]);
    expect(c.reasonRequired).toBe(true);
  });

  it("rate / qty / agency change → material", () => {
    const c = classifyArrangementEdit(current, { agreedRate: 95, allocatedQty: 6000, agencyName: "Other" });
    expect(c.material.sort()).toEqual(["agencyName", "agreedRate", "allocatedQty"]);
    expect(c.operational).toEqual([]);
  });

  it("mixed edit reports both buckets", () => {
    const c = classifyArrangementEdit(current, { notes: "x", agreedRate: 95 });
    expect(c.operational).toEqual(["notes"]);
    expect(c.material).toEqual(["agreedRate"]);
  });

  it("unchanged values (same JSON) are not flagged", () => {
    const c = classifyArrangementEdit(current, { agreedRate: 85, notes: "old" });
    expect(c.operational).toEqual([]);
    expect(c.material).toEqual([]);
  });
});

// ─── §27: pending revision must NOT affect demand ─────────────────────────────

function earthworkItem(): BomInputItem {
  return {
    id: 1, itemCode: "3.2", itemName: null,
    description: "Construction of embankment with approved material",
    unit: "Cum", currentQty: 10000, materials: [],
    derivedKeyMaterials: [{ materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1, isAuto: true, isEarthworkBulkRequirement: true }],
    equipment: [{ equipmentName: "Excavator", qtyPerBoqUnit: 0.02, count: 1, consumptionNorm: 12, fuelType: "Diesel" }],
    labour: [{ designation: "Mazdoor", qtyPerBoqUnit: 0.03 }],
  } as BomInputItem;
}
const BAR: BomInputBar = { id: 11, boqItemId: 1, chainageFrom: 0, chainageTo: 5, startMonth: 1, endMonth: 3, plannedQty: 10000, isQtyOverride: false };

describe("§27: pending revision does not change engine demand", () => {
  const arrBase: ArrangementDemandInput = {
    id: 100, status: "approved", allocatedQty: 5000, boqItemId: 1,
    components: { ...ALL_AGENCY }, dieselResponsibility: "agency", agencyName: "Narsimulu",
  };
  const without = calculateBomDemand([earthworkItem()], [BAR], 12, { arrangements: [arrBase] });
  const withPending = calculateBomDemand([earthworkItem()], [BAR], 12, {
    arrangements: [{ ...arrBase, pendingRevision: { fields: { allocatedQty: 9000, agreedRate: 95 }, reason: "renegotiated" } } as any],
  });

  it("equipment demand identical while revision is pending", () => {
    expect(withPending.equipment.find(e => /excavator/i.test(e.equipmentName))!.totalHours)
      .toBeCloseTo(without.equipment.find(e => /excavator/i.test(e.equipmentName))!.totalHours, 6);
  });
  it("labour demand identical while revision is pending", () => {
    expect(withPending.labour.find(l => /mazdoor/i.test(l.designation))!.totalDays)
      .toBeCloseTo(without.labour.find(l => /mazdoor/i.test(l.designation))!.totalDays, 6);
  });
});
