/**
 * Guided DPR usability & calculation correction.
 *
 * Covers:
 *  1. Role-independent programme suggestions (suggestGuidedBars has no
 *     role/user input; identical output for Admin/PM/Engineer by construction)
 *     + date-window behaviour + honest empty-state reason.
 *  2. Auto-linking one compatible bar from item + side + chainage
 *     (autoMatchBar), for suggested and manually-added entries alike.
 *  3/4/5. UOM-aware geometry fields + automatic quantity calculation
 *     (200 × 4.2 × 0.30 = 252 CUM), source auto-"calculated", no guessing
 *     when dimensions are missing.
 *  6. Manual override: requires a source, is never silently recalculated,
 *     and returns to automatic when restored.
 *  7. Selected-reach balance comparison stays scoped to the bar.
 */
import { describe, it, expect } from "vitest";
import {
  suggestGuidedBars,
  emptySuggestionsReason,
  autoMatchBar,
  barBalanceFigures,
} from "../shared/dprProgrammeLink";
import {
  requiredDims,
  geometryApplies,
  computedQty,
  applyGeometryChange,
  applyQuantityEdit,
  overrideMismatch,
  deriveOverridden,
} from "../client/src/lib/guidedEntryGeometry";
import { resolveQuantitySource, checkQuantitySourceRow } from "../shared/dprGeometry";

// ── 1. Suggestions: role-independent, date-window driven ────────────────────

const bar = (id: number, startDate: string | null, endDate: string | null, structureId: string | null = null) =>
  ({ id, startDate, endDate, structureId });

describe("suggestGuidedBars — role-independent programme suggestions", () => {
  const bars = [
    bar(1, "2026-08-01", "2026-08-10"),      // covers the date
    bar(2, "2026-08-07", "2026-08-20"),      // starts after the date
    bar(3, null, null),                       // no dates → never suggested
    bar(4, "2026-08-01", "2026-08-10", "S1"), // structure bar → excluded
  ];
  const none = new Set<number>();

  it("suggests only road bars whose date window covers the report date", () => {
    expect(suggestGuidedBars(bars, "2026-08-06", none, none).map((b) => b.id)).toEqual([1]);
  });

  it("date bounds are inclusive on both ends", () => {
    expect(suggestGuidedBars(bars, "2026-08-01", none, none).map((b) => b.id)).toEqual([1]);
    expect(suggestGuidedBars(bars, "2026-08-10", none, none).map((b) => b.id)).toEqual([1, 2]); // both windows cover the 10th (bar 1's end inclusive)
    expect(suggestGuidedBars(bars, "2026-08-11", none, none).map((b) => b.id)).toEqual([2]);   // bar 1 excluded the day after its end
    expect(suggestGuidedBars(bars, "2026-07-31", none, none)).toEqual([]);                     // day before bar 1 starts
  });

  it("identical inputs give identical suggestions regardless of who asks (no role parameter exists)", () => {
    // Admin / PM / Site Engineer all call the same pure function with the same
    // site data — assert determinism and that the signature admits no user.
    const a = suggestGuidedBars(bars, "2026-08-06", none, none);
    const b = suggestGuidedBars(bars, "2026-08-06", none, none);
    expect(a).toEqual(b);
    expect(suggestGuidedBars.length).toBe(4); // bars, date, reported, formLinked — nothing else
  });

  it("bars already reported today or already in the open form are removed", () => {
    expect(suggestGuidedBars(bars, "2026-08-06", new Set([1]), none)).toEqual([]);
    expect(suggestGuidedBars(bars, "2026-08-06", none, new Set([1]))).toEqual([]);
  });

  it("empty-state reason distinguishes missing programme / no date coverage / all reported", () => {
    expect(emptySuggestionsReason([], "2026-08-06")).toBe("no_programme");
    expect(emptySuggestionsReason([bar(9, "2026-08-01", "2026-08-10", "S1")], "2026-08-06")).toBe("no_programme");
    expect(emptySuggestionsReason([bar(1, "2026-09-01", "2026-09-10")], "2026-08-06")).toBe("no_date_coverage");
    expect(emptySuggestionsReason([bar(1, null, null)], "2026-08-06")).toBe("no_date_coverage");
    expect(emptySuggestionsReason([bar(1, "2026-08-01", "2026-08-10")], "2026-08-06")).toBe("all_reported");
  });
});

// ── 2. Auto-link from item + side + chainage ────────────────────────────────

describe("autoMatchBar — item + side + chainage identify one bar", () => {
  const lhs = { id: 11, side: "lhs", chainageFrom: 2.4, chainageTo: 3.25, startDate: "2026-08-01", endDate: "2026-08-10" };
  const rhs = { id: 12, side: "rhs", chainageFrom: 2.4, chainageTo: 3.25, startDate: "2026-08-01", endDate: "2026-08-10" };
  const far = { id: 13, side: "lhs", chainageFrom: 5.0, chainageTo: 6.0, startDate: "2026-08-01", endDate: "2026-08-10" };

  it("side narrows two same-reach bars to exactly one → auto-link", () => {
    const r = autoMatchBar([lhs, rhs] as any, { dprDate: "2026-08-06", sideKey: "lhs" });
    expect(r.kind).toBe("auto");
    expect((r as any).bar.id).toBe(11);
  });

  it("chainage containment excludes non-covering reaches", () => {
    const r = autoMatchBar([lhs, far] as any, { dprDate: "2026-08-06", sideKey: "lhs", fromKm: 2.5, toKm: 2.6 });
    expect(r.kind).toBe("auto");
    expect((r as any).bar.id).toBe(11);
  });

  it("multiple compatible bars → user must choose (no guessing)", () => {
    const r = autoMatchBar([lhs, rhs] as any, { dprDate: "2026-08-06" });
    expect(r.kind).toBe("choose");
  });

  it("incompatible opposite-side bars are not in the primary candidates", () => {
    const r = autoMatchBar([rhs] as any, { dprDate: "2026-08-06", sideKey: "lhs" });
    expect(r.kind).toBe("none");
  });
});

// ── 3/4. UOM-aware fields ────────────────────────────────────────────────────

describe("requiredDims — item/UOM decides which geometry fields exist", () => {
  it("CUM item needs width + thickness; SQM only width; RMT neither", () => {
    expect(requiredDims({ unit: "CUM" })).toEqual(["L", "W", "T"]);
    expect(requiredDims({ unit: "SQM" })).toEqual(["L", "W"]);
    expect(requiredDims({ unit: "RMT" })).toEqual(["L"]);
  });

  it("MT / Nos / LS items are direct-entry (no geometry fields)", () => {
    expect(geometryApplies({ unit: "MT" })).toBe(false);
    expect(geometryApplies({ unit: "Nos" })).toBe(false);
    expect(geometryApplies({ unit: "LS" })).toBe(false);
  });

  it("explicit measurement method wins over the unit string", () => {
    expect(requiredDims({ unit: "MT", dprMeasurementMethod: "CUM_LWT" })).toEqual(["L", "W", "T"]);
    expect(geometryApplies({ unit: "CUM", dprMeasurementMethod: "MT_manual" })).toBe(false);
  });
});

// ── 5. Automatic quantity calculation ────────────────────────────────────────

const cum = { unit: "CUM" };
const entry = (over: Partial<Parameters<typeof computedQty>[0]> = {}) => ({
  chainageFrom: "2+400", chainageTo: "2+600", width: 4.2, thickness: 0.3,
  quantity: null as number | null, qtyOverridden: false, ...over,
});

describe("automatic geometry quantity", () => {
  it("From 2+400 To 2+600 × 4.2 m × 0.30 m = 252.00 CUM, source Calculated", () => {
    const e = entry();
    const q = computedQty(e, cum);
    expect(q).toBeCloseTo(252, 6);
    const applied = applyGeometryChange(e, cum);
    expect(applied.quantity).toBeCloseTo(252, 6);
    expect(resolveQuantitySource(
      { chainageFrom: e.chainageFrom, chainageTo: e.chainageTo, width: e.width, thickness: e.thickness, quantity: applied.quantity },
      cum,
    )).toBe("calculated");
  });

  it("recalculates immediately when a dimension changes", () => {
    const e = { ...entry(), quantity: 252 };
    const after = applyGeometryChange({ ...e, width: 5 }, cum);
    expect(after.quantity).toBeCloseTo(300, 6);
  });

  it("guardrail — missing dimension leaves quantity blank, never guessed", () => {
    expect(applyGeometryChange(entry({ thickness: null }), cum).quantity).toBeNull();
    expect(applyGeometryChange(entry({ chainageTo: "" }), cum).quantity).toBeNull();
    // and a previously calculated value is cleared, not left stale:
    const stale = { ...entry(), quantity: 252, thickness: null };
    expect(applyGeometryChange(stale, cum).quantity).toBeNull();
  });

  it("non-geometry item (MT) is never auto-populated", () => {
    const e = { ...entry(), quantity: 87.5 };
    const after = applyGeometryChange(e, { unit: "MT" });
    expect(after.quantity).toBe(87.5);
  });
});

// ── 6. Manual override ───────────────────────────────────────────────────────

describe("manual override behaviour", () => {
  it("manual edit differing from geometry marks the entry overridden and requires a real source", () => {
    const e = { ...entry(), quantity: 240 };
    const res = applyQuantityEdit(e, cum);
    expect(res.qtyOverridden).toBe(true);
    const err = checkQuantitySourceRow(
      { chainageFrom: e.chainageFrom, chainageTo: e.chainageTo, width: e.width, thickness: e.thickness, quantity: 240, quantitySource: null },
      cum,
    );
    expect(err).toMatch(/entered manually/);
  });

  it("restoring the calculated value returns to automatic source", () => {
    const res = applyQuantityEdit({ ...entry(), quantity: 252, qtyOverridden: true }, cum);
    expect(res.qtyOverridden).toBe(false);
  });

  it("geometry edits never silently replace an overridden quantity — mismatch is flagged", () => {
    const overridden = { ...entry(), quantity: 240, qtyOverridden: true };
    const after = applyGeometryChange({ ...overridden, width: 5 }, cum);
    expect(after.quantity).toBe(240); // kept
    const calc = overrideMismatch({ ...overridden, width: 5 }, cum);
    expect(calc).toBeCloseTo(300, 6); // flagged with the recomputed value
  });

  it("restored manual quantity with INCOMPLETE geometry is treated as overridden — later dimension edits keep it", () => {
    // Legacy autosave blob / server draft: qty entered manually, no thickness.
    const restored = { ...entry(), thickness: null, quantity: 180 };
    // Derivation (runs whenever a restore generation lands and items are loaded):
    const overridden = deriveOverridden(restored, cum);
    expect(overridden).toBe(true); // calc is null → manual value is protected
    // Engineer then fills the missing thickness — the manual qty must survive:
    const after = applyGeometryChange({ ...restored, qtyOverridden: overridden, thickness: 0.3 }, cum);
    expect(after.quantity).toBe(180);
    expect(after.qtyOverridden).toBe(true);
  });

  it("hydrating a saved draft derives the override flag from geometry, not guesswork", () => {
    expect(deriveOverridden({ ...entry(), quantity: 252 }, cum)).toBe(false);
    expect(deriveOverridden({ ...entry(), quantity: 240 }, cum)).toBe(true);
    expect(deriveOverridden({ ...entry(), quantity: 87.5 }, { unit: "MT" })).toBe(false);
  });
});

// ── 7. Selected-reach balance ────────────────────────────────────────────────

describe("selected-reach balance warning inputs", () => {
  it("balance figures stay scoped to the one bar (BOQ totals are separate)", () => {
    const f = barBalanceFigures({ id: 1, side: "lhs", chainageFrom: 0, chainageTo: 1, plannedQty: 500, reportedQty: 380, remainingQty: 120, unit: "CUM" } as any);
    expect(f).toEqual({ currentQty: 500, totalActual: 380, balance: 120, unit: "CUM" });
    // reporting 150 against balance 120 must trip the review warning:
    expect(150 > f!.balance).toBe(true);
    expect(100 > f!.balance).toBe(false);
  });
});
