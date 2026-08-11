/**
 * Task #1409 — Guided DPR wizard restore: step gating, No Work row
 * completeness, and per-activity photo grouping.
 */
import { describe, it, expect } from "vitest";
import { GUIDED_STEPS, clampGuidedStep, guidedStepBlocker, canAdvanceGuidedStep, guidedEntryComplete } from "../client/src/lib/guidedWizard";
import { groupDprPhotos } from "../shared/dprPhotos";

describe("guided wizard steps (Task #1409)", () => {
  it("defines the 7 wizard steps in order (06C-P: Labour and Equipment are separate pages)", () => {
    expect(GUIDED_STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(GUIDED_STEPS.map((s) => s.key)).toEqual(["report", "activities", "details", "labour", "equipment", "photos", "review"]);
  });

  it("clamps restored step values to a valid step", () => {
    expect(clampGuidedStep(3)).toBe(3);
    expect(clampGuidedStep(7)).toBe(7);
    expect(clampGuidedStep(undefined)).toBe(1);
    expect(clampGuidedStep(0)).toBe(1);
    expect(clampGuidedStep(99)).toBe(1);
    expect(clampGuidedStep("2")).toBe(2);
    expect(clampGuidedStep(2.5)).toBe(1);
  });

  it("step 1 blocks until site and engineer are chosen", () => {
    expect(guidedStepBlocker(1, { siteName: "", engineer: "", entryCount: 0 })).toBeTruthy();
    expect(guidedStepBlocker(1, { siteName: "NH-44", engineer: "", entryCount: 0 })).toBeTruthy();
    expect(guidedStepBlocker(1, { siteName: "NH-44", engineer: "A - PM", entryCount: 0 })).toBeNull();
  });

  it("step 2 blocks until at least one activity is added", () => {
    expect(canAdvanceGuidedStep(2, { siteName: "s", engineer: "e", entryCount: 0 })).toBe(false);
    expect(canAdvanceGuidedStep(2, { siteName: "s", engineer: "e", entryCount: 1 })).toBe(true);
  });

  it("steps 3–6 never block (draft-lenient: details, labour, equipment, photos)", () => {
    const empty = { siteName: "", engineer: "", entryCount: 0 };
    expect(guidedStepBlocker(3, empty)).toBeNull();
    expect(guidedStepBlocker(4, empty)).toBeNull();
    expect(guidedStepBlocker(5, empty)).toBeNull();
    expect(guidedStepBlocker(6, empty)).toBeNull();
  });
});

describe("guidedEntryComplete (No Work semantics)", () => {
  it("normal rows need chainage from/to and positive quantity", () => {
    expect(guidedEntryComplete({ noSiteWork: false, activity: "GSB", chainageFrom: "10+000", chainageTo: "10+200", quantity: 50 })).toBe(true);
    expect(guidedEntryComplete({ noSiteWork: false, activity: "GSB", chainageFrom: "", chainageTo: "10+200", quantity: 50 })).toBe(false);
    expect(guidedEntryComplete({ noSiteWork: false, activity: "GSB", chainageFrom: "10+000", chainageTo: "10+200", quantity: 0 })).toBe(false);
    expect(guidedEntryComplete({ noSiteWork: false, activity: "GSB", chainageFrom: "10+000", chainageTo: "10+200", quantity: null })).toBe(false);
  });

  it("No Work rows are complete with just an activity name", () => {
    expect(guidedEntryComplete({ noSiteWork: true, activity: "RE-CLEARING VEGETATION" })).toBe(true);
    expect(guidedEntryComplete({ noSiteWork: true, activity: "  " })).toBe(false);
    expect(guidedEntryComplete({ noSiteWork: true, activity: "" })).toBe(false);
  });
});

describe("groupDprPhotos (per-activity photo grouping)", () => {
  it("splits general vs keyed photos", () => {
    const items = [
      { id: 1, progressEntryKey: null },
      { id: 2, progressEntryKey: "k1" },
      { id: 3, progressEntryKey: "k1" },
      { id: 4, progressEntryKey: "k2" },
      { id: 5 }, // legacy row without the column
      { id: 6, progressEntryKey: "" }, // empty string treated as general
    ];
    const { general, byEntryKey } = groupDprPhotos(items as any);
    expect(general.map((a: any) => a.id)).toEqual([1, 5, 6]);
    expect(byEntryKey.get("k1")!.map((a: any) => a.id)).toEqual([2, 3]);
    expect(byEntryKey.get("k2")!.map((a: any) => a.id)).toEqual([4]);
  });

  it("handles empty input", () => {
    const { general, byEntryKey } = groupDprPhotos([]);
    expect(general).toEqual([]);
    expect(byEntryKey.size).toBe(0);
  });
});
