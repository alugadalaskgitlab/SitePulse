import { describe, expect, it } from "vitest";
import { canReviewCorrection, correctionCanSubmit, correctionErrorMessage, correctionValue, snapshotCorrectionForm, type DprCorrectionForm, type DprCorrectionRequest, type DprCorrectionReview } from "./dprCorrections";
import { computeEquipmentFuelSummary } from "@/lib/equipmentUsage";

const review: DprCorrectionReview = {
  baseHash: "saved-facts-7", revision: 7, blocked: [], requiresApproval: false, impact: [],
  changes: [{ section: "progress", rowId: 28, field: "chainageTo", oldValue: "2+275", newValue: "2+248", requiresApproval: false }],
};
describe("historical DPR correction UI contracts", () => {
  it("retains every raw row, null, genuine zero and dangling canonical reference without filtering", () => {
    const form: DprCorrectionForm = {
      header: { remarks: "", boqProjectId: null }, workType: "road", structureItems: [{ itemOfWork: "unused form default" }],
      progress: [{ persistedId: 28, quantity: null, chainageTo: "2+248" }],
      equipment: [{ persistedId: 741, plantUsageId: 188, openingDiesel: null, dieselBalanceInTank: 0, startTime: "07:35" }, { machine: "" }],
      labour: [{ count: null }], materials: [{ quantity: 0 }], sitePurchases: [{ amount: 87.5 }],
    };
    const snapshot = snapshotCorrectionForm(form);
    expect(snapshot).toEqual({ ...form, structureItems: [] });
    (form.equipment[0] as Record<string, unknown>).startTime = "08:15";
    expect(snapshot.equipment[0]).toMatchObject({ startTime: "07:35", openingDiesel: null, dieselBalanceInTank: 0, plantUsageId: 188 });
    expect(snapshot.equipment).toHaveLength(2);
    expect(snapshotCorrectionForm({ ...form, workType: "structure" }).structureItems).toEqual(form.structureItems);
  });
  it("requires a real change, reason, confirmation and zero blocks", () => {
    expect(correctionCanSubmit(review, "Register verified", true)).toBe(true);
    expect(correctionCanSubmit(review, "   ", true)).toBe(false);
    expect(correctionCanSubmit(review, "Register verified", false)).toBe(false);
    expect(correctionCanSubmit({ ...review, changes: [] }, "Register verified", true)).toBe(false);
    expect(correctionCanSubmit({ ...review, blocked: [{ section: "equipment", rowId: 741, field: "row", message: "Paid hire reference; cannot remove this row." }] }, "Register verified", true)).toBe(false);
  });
  it("distinguishes missing observations from known zero and does not infer consumption", () => {
    expect(correctionValue(null)).toBe("Not recorded");
    expect(correctionValue(0)).toBe("0");
    const usage = { runtime: 6.5, expectedDiesel: 24.8, efficiencyUnit: "L/hr" as const };
    expect(computeEquipmentFuelSummary(usage, { openingTank: null, closingTank: 0, dieselIssued: 12 }).actualConsumed).toBeNull();
    expect(computeEquipmentFuelSummary(usage, { openingTank: 0, closingTank: null, dieselIssued: 12 }).actualRate).toBeNull();
    expect(computeEquipmentFuelSummary(usage, { openingTank: 0, closingTank: 0, dieselIssued: 0 }).actualConsumed).toBe(0);
  });
  it("allows only a different authenticated administrator to review a pending request", () => {
    const request = { requestedBy: 17, status: "pending" } as DprCorrectionRequest;
    expect(canReviewCorrection(true, 17, request)).toBe(false);
    expect(canReviewCorrection(false, 29, request)).toBe(false);
    expect(canReviewCorrection(true, undefined, request)).toBe(false);
    expect(canReviewCorrection(true, 29, request)).toBe(true);
    expect(canReviewCorrection(true, 29, { ...request, status: "approved" })).toBe(false);
  });
  it("presents stale and unauthorized errors as readable messages", () => {
    expect(correctionErrorMessage(new Error('409: {"message":"DPR changed since review. Review again."}'))).toContain("DPR changed since review");
    expect(correctionErrorMessage(new Error('403: {"message":"Correction authority required."}'))).toContain("Correction authority required");
  });
});
