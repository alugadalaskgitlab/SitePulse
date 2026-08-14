/**
 * Batch 06J — Tomorrow Plan outcome + carry forward seam tests.
 * Covers spec tests A-H, K-N, T at seam level: validation, comparison,
 * carry-forward plan construction, duplicate guard, no audit copying.
 */
import { describe, it, expect } from "vitest";
import {
  validateOutcomeInput,
  resolveCarryTargetDate,
  alreadyCarriedForward,
  computeExecutionComparison,
  buildCarryForwardPlan,
  buildOutcomeRecord,
  DEFERRAL_REASONS,
  OUTCOME_LABELS,
} from "../shared/planOutcome";

const TODAY = "2026-08-14";

describe("validateOutcomeInput", () => {
  it("A/B: deferred with no DPR is valid but requires a reason", () => {
    expect(validateOutcomeInput({ outcome: "deferred" } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(validateOutcomeInput({ outcome: "deferred", reason: "Rain / weather" } as any, "2026-08-12", TODAY))
      .toEqual({ ok: true });
  });
  it("N: cancelled requires a reason too", () => {
    expect(validateOutcomeInput({ outcome: "cancelled" } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "REASON_REQUIRED" });
  });
  it("executed never carries forward", () => {
    expect(validateOutcomeInput({ outcome: "executed", carryForward: { mode: "tomorrow" } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "CARRY_ON_EXECUTED" });
  });
  it("D: move-to-date requires a valid date after the plan date", () => {
    expect(validateOutcomeInput({ outcome: "deferred", reason: "x", carryForward: { mode: "date" } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "TARGET_DATE_REQUIRED" });
    expect(validateOutcomeInput({ outcome: "deferred", reason: "x", carryForward: { mode: "date", targetDate: "2026-08-10" } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "TARGET_NOT_AFTER_PLAN" });
    expect(validateOutcomeInput({ outcome: "deferred", reason: "x", carryForward: { mode: "date", targetDate: "2026-08-16" } } as any, "2026-08-12", TODAY))
      .toEqual({ ok: true });
  });
  it("rejects impossible calendar dates and non-finite quantities", () => {
    expect(validateOutcomeInput({ outcome: "deferred", reason: "x", carryForward: { mode: "date", targetDate: "2026-02-31" } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "TARGET_DATE_REQUIRED" });
    expect(validateOutcomeInput({ outcome: "partly_executed", carryForward: { mode: "tomorrow", carryQty: Infinity } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "INVALID_CARRY_QTY" });
    expect(validateOutcomeInput({ outcome: "partly_executed", carryForward: { mode: "tomorrow", carryQty: "Infinity" as any } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "INVALID_CARRY_QTY" });
  });
  it("rejects zero/negative carry quantity", () => {
    expect(validateOutcomeInput({ outcome: "partly_executed", carryForward: { mode: "tomorrow", carryQty: 0 } } as any, "2026-08-12", TODAY))
      .toMatchObject({ ok: false, code: "INVALID_CARRY_QTY" });
  });
  it("C: carry-to-tomorrow resolves to today+1", () => {
    expect(resolveCarryTargetDate({ mode: "tomorrow" }, TODAY)).toBe("2026-08-15");
    expect(resolveCarryTargetDate({ mode: "date", targetDate: "2026-08-20" }, TODAY)).toBe("2026-08-20");
  });
  it("has the full spec reason list and labels", () => {
    expect(DEFERRAL_REASONS).toContain("Rain / weather");
    expect(DEFERRAL_REASONS).toContain("Other");
    expect(OUTCOME_LABELS.deferred).toBe("Not Started / Deferred");
  });
});

describe("alreadyCarriedForward (H: duplicate guard)", () => {
  it("detects an existing live link", () => {
    expect(alreadyCarriedForward({ executionOutcome: { carriedForwardTo: { requirementId: 145, date: "2026-08-14" } } }))
      .toEqual({ requirementId: 145, date: "2026-08-14" });
  });
  it("null when no link", () => {
    expect(alreadyCarriedForward({ executionOutcome: { carriedForwardTo: null } })).toBeNull();
    expect(alreadyCarriedForward(null)).toBeNull();
  });
});

describe("computeExecutionComparison (J/K/L/M)", () => {
  it("K: comparable same-UoM produces suggested balance", () => {
    const c = computeExecutionComparison({ plannedQty: 350, plannedUom: "Cum", executedByUom: [{ uom: "Cum", qty: 250, entryCount: 2 }], dprExists: true });
    expect(c.comparable).toBe(true);
    expect(c.executedQty).toBe(250);
    expect(c.suggestedBalance).toBe(100);
  });
  it("over-execution floors the balance at 0", () => {
    const c = computeExecutionComparison({ plannedQty: 100, plannedUom: "Cum", executedByUom: [{ uom: "cum", qty: 130, entryCount: 1 }], dprExists: true });
    expect(c.suggestedBalance).toBe(0);
  });
  it("L: mismatched UoM is not comparable — no false balance", () => {
    const c = computeExecutionComparison({ plannedQty: 350, plannedUom: "Cum", executedByUom: [{ uom: "MT", qty: 25, entryCount: 1 }], dprExists: true });
    expect(c.comparable).toBe(false);
    expect(c.suggestedBalance).toBeNull();
  });
  it("L: mixed UoMs are not comparable", () => {
    const c = computeExecutionComparison({ plannedQty: 350, plannedUom: "Cum", executedByUom: [{ uom: "Cum", qty: 10, entryCount: 1 }, { uom: "MT", qty: 5, entryCount: 1 }], dprExists: true });
    expect(c.comparable).toBe(false);
  });
  it("M: DPR exists with zero billable progress — nothing implies Executed", () => {
    const c = computeExecutionComparison({ plannedQty: 350, plannedUom: "Cum", executedByUom: [], dprExists: true });
    expect(c.billableEntryCount).toBe(0);
    expect(c.executedQty).toBe(0);
    expect(c.suggestedBalance).toBe(350); // full balance suggested, not auto-closed
  });
  it("no planned qty/uom → never comparable", () => {
    const c = computeExecutionComparison({ plannedQty: null, plannedUom: null, executedByUom: [{ uom: "Cum", qty: 10, entryCount: 1 }], dprExists: true });
    expect(c.comparable).toBe(false);
  });
});

describe("buildCarryForwardPlan (C/E/F/G + §6-7)", () => {
  const oldReq = {
    id: 123,
    date: "2026-08-12",
    siteId: 7,
    status: "arranged",
    reviewedAt: "2026-08-12T10:00:00Z",
    plannedWork: { boqItemId: 11, programmeBarId: 44, plannedQty: 350, plannedUom: "Cum", chainageFrom: "0+000", chainageTo: "0+500" },
    materials: [{ materialName: "GSB", qty: 350, uom: "Cum", lineKey: "rl_old1" }],
    equipment: [{ equipmentType: "Grader", numberRequired: 1, lineKey: "rl_old2" }],
    labour: null,
    immediateRequirements: [],
    allocationStatus: {
      materials: "arranged",
      materialItems: [{ lineKey: "rl_old1", index: 0, status: "issued", fulfilmentType: "arrangement", arrangementId: 4, agencyNameSnapshot: "MARSIMULU", updatedAt: "2026-08-11T18:00:00Z" }],
    },
  };

  it("C: new plan copies work + requirement lines for the target date", () => {
    const { create } = buildCarryForwardPlan(oldReq, { targetDate: "2026-08-14", createdByName: "PM" });
    expect(create.date).toBe("2026-08-14");
    expect(create.siteId).toBe(7);
    expect(create.plannedWork.boqItemId).toBe(11);
    expect(create.plannedWork.chainageFrom).toBe("0+000");
    expect(create.materials[0].materialName).toBe("GSB");
    expect(create.equipment[0].equipmentType).toBe("Grader");
  });
  it("fresh lineKeys — identities never collide with the old plan", () => {
    const { create } = buildCarryForwardPlan(oldReq, { targetDate: "2026-08-14", createdByName: "PM" });
    expect(create.materials[0].lineKey).not.toBe("rl_old1");
    expect(create.materials[0].lineKey).toMatch(/^rl_/);
    expect(create.equipment[0].lineKey).not.toBe("rl_old2");
  });
  it("E: no audit/status fields copied — plan starts fresh", () => {
    const { create } = buildCarryForwardPlan(oldReq, { targetDate: "2026-08-14", createdByName: "PM" });
    expect(create.status).toBeUndefined();
    expect(create.reviewedAt).toBeUndefined();
    expect(create.allocationStatus).toBeUndefined();
    expect(create.readinessConfirmation).toBeUndefined();
  });
  it("G: new plan links back to source; old allocation is reference-only", () => {
    const { allocationStatus } = buildCarryForwardPlan(oldReq, { targetDate: "2026-08-14", createdByName: "PM" });
    expect(allocationStatus.carriedForwardFrom).toEqual({ requirementId: 123, date: "2026-08-12" });
    expect(allocationStatus.previousAllocationReference).toEqual([
      { materialName: "GSB", fulfilmentType: "arrangement", arrangementId: 4, agencyNameSnapshot: "MARSIMULU" },
    ]);
    // reference carries NO status/updatedAt — cannot be mistaken for a confirmed allocation
    expect((allocationStatus.previousAllocationReference[0] as any).status).toBeUndefined();
    expect((allocationStatus.previousAllocationReference[0] as any).updatedAt).toBeUndefined();
  });
  it("carry quantity override adjusts plannedWork with a traceable note", () => {
    const { create } = buildCarryForwardPlan(oldReq, { targetDate: "2026-08-14", carryQty: 100, createdByName: "PM" });
    expect(create.plannedWork.plannedQty).toBe(100);
    expect(create.plannedWork.carryForwardNote).toContain("#123");
  });
  it("no reference block when old plan had no fulfilment decisions", () => {
    const bare = { ...oldReq, allocationStatus: null };
    const { allocationStatus } = buildCarryForwardPlan(bare, { targetDate: "2026-08-14", createdByName: "PM" });
    expect(allocationStatus.previousAllocationReference).toBeUndefined();
    expect(allocationStatus.carriedForwardFrom).toBeDefined();
  });
});

describe("buildOutcomeRecord (§5, §14)", () => {
  it("F: records outcome with link, by, at — nothing fabricated", () => {
    const rec = buildOutcomeRecord(
      { outcome: "deferred", reason: "Rain / weather", remarks: " wet site " } as any,
      "PM", "2026-08-14T05:00:00.000Z", { requirementId: 145, date: "2026-08-14" },
    );
    expect(rec).toEqual({
      outcome: "deferred", reason: "Rain / weather", remarks: "wet site",
      updatedByName: "PM", updatedAt: "2026-08-14T05:00:00.000Z",
      carriedForwardTo: { requirementId: 145, date: "2026-08-14" },
    });
  });
  it("I: no-DPR deferral closes with a null link when not carried", () => {
    const rec = buildOutcomeRecord({ outcome: "deferred", reason: "Vendor unavailable" } as any, "PM", "2026-08-14T05:00:00.000Z", null);
    expect(rec.carriedForwardTo).toBeNull();
  });
});
