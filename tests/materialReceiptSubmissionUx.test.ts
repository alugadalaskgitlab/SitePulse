import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const receiptPage = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");
const siteTripPage = readFileSync("client/src/pages/SiteMaterialTrips.tsx", "utf8");

describe("material receipt submission UX", () => {
  it("guards same-tick double clicks before React can render pending state", () => {
    const guard = receiptPage.indexOf("if (submitLockRef.current) return;");
    const lock = receiptPage.indexOf("submitLockRef.current = true;", guard);
    const create = receiptPage.indexOf("createMutation.mutate(data);", lock);

    expect(receiptPage).toContain("const submitLockRef = useRef(false);");
    expect(guard).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(guard);
    expect(create).toBeGreaterThan(lock);
    expect(receiptPage).toContain("disabled={submissionLocked || createMutation.isPending || updateMutation.isPending");
  });

  it("releases the lock only when create/update mutations settle", () => {
    expect(receiptPage).toMatch(/createMutation[\s\S]*?onSettled:[\s\S]*?submitLockRef\.current = false/);
    expect(receiptPage).toMatch(/updateMutation[\s\S]*?onSettled:[\s\S]*?submitLockRef\.current = false/);
  });

  it("keeps failed values available and provides persistent inline outcomes", () => {
    expect(receiptPage).toContain("Your entered values are still here; correct the problem and try again.");
    expect(receiptPage).toContain('data-testid="receipt-submission-error"');
    expect(receiptPage).toContain('data-testid={`receipt-submission-${submissionFeedback.kind}`}');
    expect(receiptPage).toContain("Next: choose New Receipt");
    expect(receiptPage).toContain("if (open) setSubmissionFeedback(null)");
  });

  it("keeps the plant popup open in its saved view and removes banner actions", () => {
    const createSuccess = receiptPage.slice(
      receiptPage.indexOf("const createMutation"),
      receiptPage.indexOf("const updateMutation"),
    );
    const banner = receiptPage.slice(
      receiptPage.indexOf("{submissionFeedback &&"),
      receiptPage.indexOf("{/* Export/Print Actions */}"),
    );
    const newReceiptButton = receiptPage.indexOf('data-testid="button-new-receipt-from-saved"');
    const doneButton = receiptPage.indexOf('data-testid="button-done-receipt-saved"');
    const savedFooter = receiptPage.slice(newReceiptButton - 1000, doneButton + 300);

    expect(createSuccess).not.toContain("setDialogOpen(false)");
    expect(createSuccess).toContain('setSavedReceiptAction("created")');
    expect(receiptPage).toContain('data-testid="plant-receipt-saved-view"');
    expect(receiptPage).toContain('data-testid="plant-receipt-saved-summary"');
    expect(receiptPage).toContain('data-testid="button-new-receipt-from-saved"');
    expect(receiptPage).toContain('data-testid="button-done-receipt-saved"');
    expect(savedFooter).toContain("setSavedReceiptAction(null)");
    expect(savedFooter).toContain("setSavedReceiptForSlip(null)");
    expect(savedFooter).toContain("resetForm();");
    expect(savedFooter).toContain("onClick={() => setDialogOpen(false)}");
    expect(receiptPage).toContain('savedReceiptAction === "created" || savedReceiptForSlip.slipSendWindowOpen');
    expect(receiptPage).toContain('sendLabel={savedReceiptAction === "updated" ? "Send revised on WhatsApp" : "Send on WhatsApp"}');
    expect(banner).not.toContain("MaterialReceiptSlipActions");
  });

  it("puts the site-trip saved view in the submit area and scrolls it into view", () => {
    expect(siteTripPage).toContain('data-testid={`trip-saved-view-${savedTripForSlip.id}`}');
    expect(siteTripPage).toContain('data-testid="button-log-next-trip"');
    expect(siteTripPage).toContain("savedTripPanelRef.current?.scrollIntoView");
    expect(siteTripPage).not.toContain("trip-saved-panel-");
  });
});