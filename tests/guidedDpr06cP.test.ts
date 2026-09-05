/**
 * Batch 06C-P — Guided DPR polish: derived Length display and the
 * 7-step wizard split (Labour / Equipment as separate pages).
 */
import { describe, it, expect } from "vitest";
import { calculateLengthFromChainage, getEffectiveLength } from "../shared/dprGeometry";
import { GUIDED_STEPS, guidedStepBlocker } from "../client/src/lib/guidedWizard";

describe("derived Length (06C-P §13)", () => {
  it("2+570 → 2+660 gives 90 m", () => {
    expect(calculateLengthFromChainage("2+570", "2+660")).toBe(90);
  });

  it("updates when chainage changes", () => {
    expect(calculateLengthFromChainage("2+570", "2+700")).toBe(130);
    expect(calculateLengthFromChainage("0+000", "1+000")).toBe(1000);
  });

  it("is null when either chainage is missing/invalid", () => {
    expect(calculateLengthFromChainage("", "2+660")).toBeNull();
    expect(calculateLengthFromChainage("2+570", "")).toBeNull();
    expect(calculateLengthFromChainage("abc", "2+660")).toBeNull();
  });

  it("complete chainage is authoritative over a stale stored length", () => {
    expect(getEffectiveLength(75, "2+570", "2+660")).toBe(90);
    expect(getEffectiveLength(null, "2+570", "2+660")).toBe(90);
    expect(getEffectiveLength(0, "2+570", "2+660")).toBe(90);
  });
});

describe("7-step wizard structure (06C-P §5)", () => {
  it("Labour and Equipment are separate, dedicated steps", () => {
    const keys = GUIDED_STEPS.map((s) => s.key);
    expect(keys.indexOf("labour")).toBeGreaterThan(-1);
    expect(keys.indexOf("equipment")).toBeGreaterThan(-1);
    expect(keys.indexOf("labour")).not.toBe(keys.indexOf("equipment"));
    // order: details before labour, labour before equipment, equipment before photos, review last
    expect(keys).toEqual(["report", "activities", "details", "labour", "equipment", "photos", "review"]);
  });

  it("the new steps stay draft-lenient (Back/Save Draft/Next always possible)", () => {
    const s = { siteName: "NH-44", engineer: "A - PM", entryCount: 1 };
    for (const step of [3, 4, 5, 6] as const) {
      expect(guidedStepBlocker(step, s)).toBeNull();
    }
  });
});
