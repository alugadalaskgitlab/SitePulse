/**
 * Batch 06 — RA-style Progress Report tests.
 * Pure-logic tests over shared/progressReport.ts (the single source used by
 * both the report endpoint and the Excel export).
 */
import { describe, it, expect } from "vitest";
import {
  type ReportEntry, type ReportBoqItem,
  entryBoqCredit, entryConversionFactor, chronologicalCompare,
  computeItemEntries, computeItemAbstract, sortForDisplay,
  detectOverlaps, buildCoverageStrips, entryIntersectsRange,
  entryReviewFlag, sidesMayOverlap, normaliseReportSide,
  buildOverlapPairs,
} from "../shared/progressReport";

const wmm: ReportBoqItem = {
  id: 1, description: "WMM", unit: "Cum", boqQty: 5000,
  dprConversionFactor: null, dprMeasurementMethod: "CUM_LWT",
};
const clearing: ReportBoqItem = {
  id: 2, description: "Clearing & Grubbing", unit: "Ha", boqQty: 12,
  dprConversionFactor: 0.0001, dprMeasurementMethod: "SQM_LW",
};

let nextId = 1;
function entry(over: Partial<ReportEntry>): ReportEntry {
  return {
    kind: "progress", entryId: nextId++, dprId: over.dprId ?? nextId, dprDate: "2026-08-01",
    boqItemId: 1, quantity: 100, uom: "Cum",
    chainageFromKm: null, chainageToKm: null, side: null,
    ...over,
  } as ReportEntry;
}

describe("BOQ credit & conversion factor (Batch 04 reuse — tests D, J, K, L, 19)", () => {
  it("applies the item factor exactly once (225 SQM → 0.0225 Ha)", () => {
    const e = entry({ quantity: 225, uom: "SQM", boqItemId: 2 });
    expect(entryBoqCredit(e, clearing)).toBeCloseTo(0.0225, 6);
  });
  it("factor defaults to 1 for same-unit items (WMM 126 Cum stays 126)", () => {
    const e = entry({ quantity: 126 });
    expect(entryConversionFactor(e, wmm)).toBe(1);
    expect(entryBoqCredit(e, wmm)).toBe(126);
  });
  it("converted flag only when factor ≠ 1 (drives single vs dual Qty column)", () => {
    const rows = computeItemEntries([entry({ quantity: 126 })], wmm);
    expect(rows[0].converted).toBe(false);
    const rows2 = computeItemEntries([entry({ quantity: 225, boqItemId: 2 })], clearing);
    expect(rows2[0].converted).toBe(true);
  });
  it("structure row-level factor override wins over item factor", () => {
    const e = entry({ kind: "structure", quantity: 10, rowConversionFactor: 0.5 });
    expect(entryBoqCredit(e, wmm)).toBe(5);
  });
});

describe("Abstract math (tests D–I, §12)", () => {
  const entries = [
    entry({ dprDate: "2026-07-01", quantity: 1486, dprId: 1 }),
    entry({ dprDate: "2026-08-02", quantity: 200, dprId: 2 }),
    entry({ dprDate: "2026-08-05", quantity: 164, dprId: 3 }),
  ];
  const computed = computeItemEntries(entries, wmm);
  const abs = computeItemAbstract(computed, wmm, "2026-08-01", "2026-08-10");

  it("Contract BOQ Qty is the denominator", () => expect(abs.contractQty).toBe(5000));
  it("Previous = credit before From Date", () => expect(abs.previousQty).toBe(1486));
  it("This Period = credit within range", () => expect(abs.thisPeriodQty).toBe(364));
  it("Cumulative = Previous + This Period", () => expect(abs.cumulativeQty).toBe(1850));
  it("Balance = Contract − Cumulative", () => expect(abs.balanceQty).toBe(3150));
  it("% Complete correct", () => expect(abs.pctComplete).toBeCloseTo(37, 1));
  it("DPR count only counts in-period DPRs", () => expect(abs.dprCount).toBe(2));
  it("zero/null contract qty handled safely (no divide-by-zero)", () => {
    const item0: ReportBoqItem = { ...wmm, boqQty: 0 };
    const a = computeItemAbstract(computed, item0, "2026-08-01", "2026-08-10");
    expect(a.pctComplete).toBeNull();
    expect(a.balanceQty).toBeNull();
  });
  it("From = project start → Previous is 0", () => {
    const a = computeItemAbstract(computed, wmm, "2026-01-01", "2026-08-10");
    expect(a.previousQty).toBe(0);
    expect(a.cumulativeQty).toBe(1850);
  });
});

describe("Chronological running cumulative (§9 — tests P, Q, R, S)", () => {
  const entries = [
    entry({ dprDate: "2026-08-03", quantity: 30, dprId: 3, chainageFromKm: 1.0, chainageToKm: 1.1 }),
    entry({ dprDate: "2026-08-01", quantity: 10, dprId: 1, chainageFromKm: 3.0, chainageToKm: 3.1 }),
    entry({ dprDate: "2026-08-02", quantity: 20, dprId: 2, chainageFromKm: 2.0, chainageToKm: 2.1 }),
  ];
  const computed = computeItemEntries(entries, wmm);

  it("cumulative follows DPR date order regardless of input order", () => {
    expect(computed.map((e) => e.runningCumulative)).toEqual([10, 30, 60]);
    expect(computed.map((e) => e.dprDate)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });
  it("chainage→date display sort reorders rows but never changes cumulatives", () => {
    const sorted = sortForDisplay(computed, "chainage_date");
    // chainage order: 1.0 (date 03), 2.0 (date 02), 3.0 (date 01)
    expect(sorted.map((e) => e.dprId)).toEqual([3, 2, 1]);
    expect(sorted.find((e) => e.dprId === 3)!.runningCumulative).toBe(60);
    expect(sorted.find((e) => e.dprId === 1)!.runningCumulative).toBe(10);
  });
  it("date→chainage sort works and keeps cumulatives intact", () => {
    const sorted = sortForDisplay(computed, "date_chainage");
    expect(sorted.map((e) => e.dprId)).toEqual([1, 2, 3]);
    expect(sorted.map((e) => e.runningCumulative)).toEqual([10, 30, 60]);
  });
  it("same-date rows use DPR id then row id as stable tiebreak", () => {
    const a = entry({ dprDate: "2026-08-01", dprId: 5 });
    const b = entry({ dprDate: "2026-08-01", dprId: 4 });
    expect(chronologicalCompare(a, b)).toBeGreaterThan(0);
  });
  it("computeItemEntries does not mutate its input array order", () => {
    const input = [...entries];
    computeItemEntries(input, wmm);
    expect(input.map((e) => e.dprId)).toEqual([3, 1, 2]);
  });
});

describe("Possible overlap (§14 — tests T, U, V, W, X)", () => {
  it("same item, same side, intersecting ranges → advisory overlap", () => {
    const a = entry({ side: "RHS", chainageFromKm: 2.15, chainageToKm: 2.2, dprId: 7 });
    const b = entry({ side: "RHS", chainageFromKm: 2.18, chainageToKm: 2.25, dprId: 8 });
    const m = detectOverlaps([a, b]);
    expect(m.get(`progress:${a.entryId}`)?.length).toBe(1);
    expect(m.get(`progress:${b.entryId}`)![0].withDprId).toBe(7);
  });
  it("opposite sides do not falsely overlap", () => {
    const a = entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 2.5 });
    const b = entry({ side: "RHS", chainageFromKm: 2.0, chainageToKm: 2.5 });
    expect(detectOverlaps([a, b]).size).toBe(0);
  });
  it("LHS vs Full Width can overlap", () => {
    const a = entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 2.5 });
    const b = entry({ side: "Full Width", chainageFromKm: 2.2, chainageToKm: 2.4 });
    expect(detectOverlaps([a, b]).size).toBe(2);
  });
  it("adjacent (touching) ranges do not warn", () => {
    const a = entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 2.5 });
    const b = entry({ side: "LHS", chainageFromKm: 2.5, chainageToKm: 3.0 });
    expect(detectOverlaps([a, b]).size).toBe(0);
  });
  it("overlap never changes quantity or cumulative (advisory only)", () => {
    const a = entry({ dprDate: "2026-08-01", side: "LHS", chainageFromKm: 2.0, chainageToKm: 2.5, quantity: 100 });
    const b = entry({ dprDate: "2026-08-02", side: "LHS", chainageFromKm: 2.2, chainageToKm: 2.6, quantity: 50 });
    const computed = computeItemEntries([a, b], wmm);
    expect(computed[0].overlaps.length).toBe(1);
    expect(computed[1].runningCumulative).toBe(150); // full total, nothing deducted
    expect(computed.map((e) => e.boqCreditQty)).toEqual([100, 50]);
  });
  it("side normalisation handles stored text values", () => {
    expect(normaliseReportSide("Both Sides")).toBe("both_sides");
    expect(normaliseReportSide("Full Width")).toBe("full_width");
    expect(sidesMayOverlap("LHS", "lhs")).toBe(true);
    expect(sidesMayOverlap(null, "RHS")).toBe(true); // unknown side is conservative
  });
});

describe("Coverage strips (§13 — tests Y, Z)", () => {
  it("shows recorded vs unrecorded chainage per side", () => {
    const strips = buildCoverageStrips([
      entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 1.5 }),
      entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 2.5 }),
      entry({ side: "RHS", chainageFromKm: 1.0, chainageToKm: 3.0 }),
    ]);
    const lhs = strips.find((s) => s.label === "LHS")!;
    expect(lhs.segments).toEqual([
      { fromKm: 1.0, toKm: 1.5, state: "recorded" },
      { fromKm: 2.0, toKm: 2.5, state: "recorded" },
    ]);
    expect(lhs.extentFromKm).toBe(1.0);
    expect(lhs.extentToKm).toBe(3.0);
  });
  it("double-recorded stretch becomes an overlap segment, never 'completed'", () => {
    const strips = buildCoverageStrips([
      entry({ side: "RHS", chainageFromKm: 1.0, chainageToKm: 2.0 }),
      entry({ side: "RHS", chainageFromKm: 1.5, chainageToKm: 2.5 }),
    ]);
    const rhs = strips.find((s) => s.label === "RHS")!;
    expect(rhs.segments.map((s) => s.state)).toEqual(["recorded", "overlap", "recorded"]);
    // No segment state is ever "complete"
    expect(rhs.segments.every((s) => s.state === "recorded" || s.state === "overlap")).toBe(true);
  });
  it("Full Width entries contribute to both LHS and RHS strips", () => {
    const strips = buildCoverageStrips([entry({ side: "Full Width", chainageFromKm: 0, chainageToKm: 1 })]);
    expect(strips.map((s) => s.label).sort()).toEqual(["LHS", "RHS"]);
  });
  it("no strip when no meaningful chainage data (structure/manual items)", () => {
    expect(buildCoverageStrips([entry({ kind: "structure", chainageFromKm: null, chainageToKm: null })])).toEqual([]);
  });
});

describe("Historical honesty (§5 — tests AF, O)", () => {
  it("geometry mismatch without manual source → Review flag, quantity untouched", () => {
    const e = entry({ length: 100, width: 5, quantity: 999, quantitySource: null });
    const rows = computeItemEntries([e], { ...wmm, dprMeasurementMethod: "SQM_LW", unit: "Sqm" });
    expect(rows[0].reviewFlag).toMatch(/Review quantity/);
    expect(rows[0].quantity).toBe(999); // never rewritten
    expect(rows[0].runningCumulative).toBe(999); // still credited as stored
  });
  it("matching geometry → no flag", () => {
    const e = entry({ length: 100, width: 5, quantity: 500 });
    expect(entryReviewFlag(e, { ...wmm, dprMeasurementMethod: "SQM_LW", unit: "Sqm" })).toBeNull();
  });
  it("manual source explains a differing quantity → no flag", () => {
    const e = entry({ length: 100, width: 5, quantity: 999, quantitySource: "measured" });
    expect(entryReviewFlag(e, { ...wmm, dprMeasurementMethod: "SQM_LW", unit: "Sqm" })).toBeNull();
  });
  it("manual-method items are never flagged for missing dimensions", () => {
    const e = entry({ quantity: 12, length: null, width: null });
    expect(entryReviewFlag(e, { ...wmm, dprMeasurementMethod: "MT_manual", unit: "MT" })).toBeNull();
  });
  it("missing quantity → review flag", () => {
    expect(entryReviewFlag(entry({ quantity: null }), wmm)).toMatch(/no quantity/);
  });
});

describe("Chainage-wise range query (§16 — tests AA, AB)", () => {
  const a = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0 });
  const b = entry({ side: "RHS", chainageFromKm: 5.0, chainageToKm: 6.0 });
  it("returns intersecting rows only", () => {
    expect(entryIntersectsRange(a, 1.5, 3.0, null)).toBe(true);
    expect(entryIntersectsRange(b, 1.5, 3.0, null)).toBe(false);
  });
  it("touching boundary does not intersect", () => {
    expect(entryIntersectsRange(a, 2.0, 3.0, null)).toBe(false);
  });
  it("side filter respects corridor compatibility", () => {
    expect(entryIntersectsRange(a, 1.0, 2.0, "RHS")).toBe(false);
    expect(entryIntersectsRange(a, 1.0, 2.0, "LHS")).toBe(true);
    expect(entryIntersectsRange(entry({ side: "Full Width", chainageFromKm: 1, chainageToKm: 2 }), 1, 2, "RHS")).toBe(true);
  });
});

// ── Batch 06V: Incidental progress tracking ───────────────────────────────────

describe("Incidental entries — no BOQ credit (06V)", () => {
  it("isIncidental=true → entryBoqCredit returns 0 (not null)", () => {
    const e = entry({ isIncidental: true, quantity: 150 });
    expect(entryBoqCredit(e, wmm)).toBe(0);
  });

  it("isIncidental=false → normal BOQ credit", () => {
    const e = entry({ isIncidental: false, quantity: 150 });
    expect(entryBoqCredit(e, wmm)).toBe(150);
  });

  it("isIncidental entry with quantity null → explicit zero BOQ credit", () => {
    const e = entry({ isIncidental: true, quantity: null });
    expect(entryBoqCredit(e, wmm)).toBe(0);
  });

  it("incidental entries do NOT accumulate into running cumulative", () => {
    const normal = entry({ dprDate: "2026-08-01", quantity: 100, dprId: 1, chainageFromKm: 1.0, chainageToKm: 1.5, side: "LHS" });
    const incidental = entry({ dprDate: "2026-08-02", quantity: 50, dprId: 2, chainageFromKm: 1.0, chainageToKm: 1.5, side: "LHS", isIncidental: true });
    const computed = computeItemEntries([normal, incidental], wmm);
    const inc = computed.find((e) => e.isIncidental)!;
    const norm = computed.find((e) => !e.isIncidental)!;
    expect(norm.runningCumulative).toBe(100);
    expect(inc.runningCumulative).toBe(100); // incidental adds 0
    expect(inc.boqCreditQty).toBe(0);
    expect(norm.boqCreditQty).toBe(100);
  });

  it("incidental entries are excluded from overlap detection", () => {
    const normal = entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 3.0, dprId: 10, isIncidental: false });
    const incidental = entry({ side: "LHS", chainageFromKm: 2.5, chainageToKm: 3.5, dprId: 11, isIncidental: true });
    const overlaps = detectOverlaps([normal, incidental]);
    expect(overlaps.size).toBe(0); // incidental excluded → no overlap detected
  });

  it("two normal entries with same chainage → overlap detected (control test)", () => {
    const a = entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 3.0, dprId: 10 });
    const b = entry({ side: "LHS", chainageFromKm: 2.5, chainageToKm: 3.5, dprId: 11 });
    expect(detectOverlaps([a, b]).size).toBe(2);
  });
});

describe("Incidental coverage strips (06V)", () => {
  it("incidental entry produces 'incidental' state in coverage strip", () => {
    const strips = buildCoverageStrips([
      entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0, isIncidental: true }),
    ]);
    const lhs = strips.find((s) => s.label === "LHS");
    expect(lhs).toBeDefined();
    expect(lhs!.segments[0].state).toBe("incidental");
  });

  it("normal entry wins over incidental in the same range (recorded, not incidental)", () => {
    const normal = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0, isIncidental: false });
    const incidental = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0, isIncidental: true });
    const strips = buildCoverageStrips([normal, incidental]);
    const lhs = strips.find((s) => s.label === "LHS")!;
    // The entire range should be "recorded" (normal wins) — no "incidental" segment
    expect(lhs.segments.every((s) => s.state !== "incidental")).toBe(true);
    expect(lhs.segments.some((s) => s.state === "recorded")).toBe(true);
  });

  it("incidental in a separate sub-range → shows incidental segment outside normal", () => {
    const normal = entry({ side: "RHS", chainageFromKm: 1.0, chainageToKm: 2.0, isIncidental: false });
    const incidental = entry({ side: "RHS", chainageFromKm: 2.5, chainageToKm: 3.0, isIncidental: true });
    const strips = buildCoverageStrips([normal, incidental]);
    const rhs = strips.find((s) => s.label === "RHS")!;
    const states = rhs.segments.map((s) => s.state);
    expect(states).toContain("recorded");
    expect(states).toContain("incidental");
    expect(states).not.toContain("overlap");
  });

  it("incidental never produces 'overlap' state (does not contribute to depth)", () => {
    const a = entry({ side: "RHS", chainageFromKm: 1.0, chainageToKm: 2.0, isIncidental: true });
    const b = entry({ side: "RHS", chainageFromKm: 1.5, chainageToKm: 2.5, isIncidental: true });
    const strips = buildCoverageStrips([a, b]);
    const rhs = strips.find((s) => s.label === "RHS")!;
    expect(rhs.segments.every((s) => s.state !== "overlap")).toBe(true);
  });
});

describe("buildOverlapPairs (06V)", () => {
  it("returns one pair for two overlapping entries", () => {
    const a = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0, dprId: 10 });
    const b = entry({ side: "LHS", chainageFromKm: 1.5, chainageToKm: 2.5, dprId: 11 });
    const computed = computeItemEntries([a, b], wmm);
    const pairs = buildOverlapPairs(computed);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].segFromKm).toBeCloseTo(1.5, 5);
    expect(pairs[0].segToKm).toBeCloseTo(2.0, 5);
  });

  it("de-duplicates — each physical pair appears exactly once", () => {
    const a = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 3.0, dprId: 10 });
    const b = entry({ side: "LHS", chainageFromKm: 2.0, chainageToKm: 4.0, dprId: 11 });
    const c = entry({ side: "LHS", chainageFromKm: 2.5, chainageToKm: 3.5, dprId: 12 });
    const computed = computeItemEntries([a, b, c], wmm);
    const pairs = buildOverlapPairs(computed);
    // a-b, a-c, b-c = 3 pairs
    expect(pairs).toHaveLength(3);
    // No duplicates: each pair key appears once
    const keys = pairs.map((p) => `${p.a.entryId}:${p.b.entryId}`);
    expect(new Set(keys).size).toBe(3);
  });

  it("returns [] when no overlaps", () => {
    const a = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0 });
    const b = entry({ side: "LHS", chainageFromKm: 2.5, chainageToKm: 3.0 });
    const computed = computeItemEntries([a, b], wmm);
    expect(buildOverlapPairs(computed)).toHaveLength(0);
  });

  it("incidental entry does not appear as a pair member (excluded from detection)", () => {
    const normal = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0, dprId: 10 });
    const incidental = entry({ side: "LHS", chainageFromKm: 1.0, chainageToKm: 2.0, dprId: 11, isIncidental: true });
    const computed = computeItemEntries([normal, incidental], wmm);
    expect(buildOverlapPairs(computed)).toHaveLength(0);
  });
});
