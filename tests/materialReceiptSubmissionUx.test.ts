import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const receiptPage = readFileSync("client/src/pages/PlantMaterialReceipts.tsx", "utf8");

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
});