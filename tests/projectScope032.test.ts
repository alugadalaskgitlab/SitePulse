/**
 * Instruction 032 — Project Scope, Working Reaches, Exclusions, Constraints
 * & Withdrawals (Part R test coverage).
 *
 * Pure-logic tests of the shared eligible-scope service
 * (shared/projectScope.ts) plus sequencer integration through the
 * SeqOptions.scopeCoverage callback (shared/programmeSequencer.ts).
 */
import { describe, it, expect } from "vitest";
import {
  resolveEligibleScope,
  coverageForStretch,
  computeScopeReconciliation,
  evaluateDprScope,
  segmentAppliesToItem,
  type ScopeSegmentLike,
} from "../shared/projectScope";
import { generateSequencedProgramme, type SeqItem } from "../shared/programmeSequencer";

const reach = (from: number, to: number, extra: Partial<ScopeSegmentLike> = {}): ScopeSegmentLike =>
  ({ id: extra.id ?? Math.floor(Math.random() * 1e6), segmentType: "working_reach", chainageFrom: from, chainageTo: to, status: "confirmed", ...extra });
const seg = (t: ScopeSegmentLike["segmentType"], from: number, to: number, extra: Partial<ScopeSegmentLike> = {}): ScopeSegmentLike =>
  ({ id: extra.id ?? Math.floor(Math.random() * 1e6), segmentType: t, chainageFrom: from, chainageTo: to, status: "confirmed", ...extra });

const LINEAR = { isLinear: true } as const;

describe("032 resolveEligibleScope — corridor vs executable scope", () => {
  it("no confirmed working reaches → hasWorkingReaches false (scope not in use)", () => {
    const r = resolveEligibleScope([seg("no_scope", 1, 2)], LINEAR);
    expect(r.hasWorkingReaches).toBe(false);
    expect(r.eligibleSideLenKm).toBe(0);
  });

  it("draft reaches are ignored unless includeDraft", () => {
    const segs = [reach(0, 2, { status: "draft" })];
    expect(resolveEligibleScope(segs, LINEAR).hasWorkingReaches).toBe(false);
    expect(resolveEligibleScope(segs, LINEAR, { includeDraft: true }).hasWorkingReaches).toBe(true);
  });

  it("Takkadpally pattern: corridor 0–3.7, reaches 0–2.1 + 2.4–3.7, no-scope 2.1–2.4", () => {
    const segs = [reach(0, 2.1), reach(2.4, 3.7), seg("no_scope", 2.1, 2.4)];
    const r = resolveEligibleScope(segs, LINEAR);
    // full width both sides: (2.1 + 1.3) km × 1.0
    expect(r.eligibleSideLenKm).toBeCloseTo(3.4, 5);
    expect(r.excludedSideLenKm).toBeCloseTo(0, 5); // no-scope outside the reaches
    expect(r.contractualSideLenKm).toBeCloseTo(3.4, 5);
  });

  it("no-scope INSIDE a reach reduces eligible and counts as excluded", () => {
    const segs = [reach(0, 10), seg("no_scope", 4, 5)];
    const r = resolveEligibleScope(segs, LINEAR);
    expect(r.eligibleSideLenKm).toBeCloseTo(9, 5);
    expect(r.excludedSideLenKm).toBeCloseTo(1, 5);
  });

  it("temporary block stays contractual but not eligible", () => {
    const segs = [reach(0, 10), seg("temporary_block", 2, 3)];
    const r = resolveEligibleScope(segs, LINEAR);
    expect(r.eligibleSideLenKm).toBeCloseTo(9, 5);
    expect(r.blockedSideLenKm).toBeCloseTo(1, 5);
    expect(r.contractualSideLenKm).toBeCloseTo(10, 5);
  });

  it("side-specific RHS withdrawal removes only the RHS half", () => {
    const segs = [reach(0, 10), seg("withdrawn", 6, 8, { side: "rhs" })];
    const r = resolveEligibleScope(segs, LINEAR);
    expect(r.withdrawnSideLenKm).toBeCloseTo(1, 5);       // 2 km × 0.5
    expect(r.eligibleSideLenKm).toBeCloseTo(9, 5);        // 10 − 1
  });

  it("withdrawal date gate: not applied before its effective date", () => {
    const segs = [reach(0, 10), seg("withdrawn", 0, 5, { effectiveFrom: "2026-09-01" })];
    const before = resolveEligibleScope(segs, { isLinear: true, onDate: "2026-08-01" });
    const after = resolveEligibleScope(segs, { isLinear: true, onDate: "2026-10-01" });
    expect(before.withdrawnSideLenKm).toBeCloseTo(0, 5);
    expect(after.withdrawnSideLenKm).toBeCloseTo(5, 5);
  });

  it("released temporary block no longer blocks on a later date", () => {
    const segs = [reach(0, 10), seg("temporary_block", 2, 3, { effectiveTo: "2026-06-30" })];
    const r = resolveEligibleScope(segs, { isLinear: true, onDate: "2026-08-06" });
    expect(r.blockedSideLenKm).toBeCloseTo(0, 5);
    expect(r.eligibleSideLenKm).toBeCloseTo(10, 5);
  });
});

describe("032 applicability (Part E) — item and category exceptions", () => {
  const q = (over: any = {}) => ({ isLinear: true, boqItemId: 7, categoryId: 3, ...over });

  it("all_linear exclusions never apply to discrete items", () => {
    const s = seg("no_scope", 0, 1, { applicability: "all_linear" });
    expect(segmentAppliesToItem(s, q())).toBe(true);
    expect(segmentAppliesToItem(s, q({ isLinear: false }))).toBe(false);
  });

  it("category-scoped exclusion applies only to listed categories", () => {
    const s = seg("no_scope", 0, 1, { applicability: "categories", categoryIds: [3] });
    expect(segmentAppliesToItem(s, q())).toBe(true);
    expect(segmentAppliesToItem(s, q({ categoryId: 9 }))).toBe(false);
  });

  it("item-scoped exclusion applies only to listed items", () => {
    const s = seg("no_scope", 0, 1, { applicability: "items", itemIds: [7] });
    expect(segmentAppliesToItem(s, q())).toBe(true);
    expect(segmentAppliesToItem(s, q({ boqItemId: 8 }))).toBe(false);
  });

  it("working reaches obey the same item/category applicability modes", () => {
    const itemReach = reach(0, 1, { applicability: "items", itemIds: [7] });
    const categoryReach = reach(1, 2, { applicability: "categories", categoryIds: [3] });
    expect(segmentAppliesToItem(itemReach, q())).toBe(true);
    expect(segmentAppliesToItem(itemReach, q({ boqItemId: 8 }))).toBe(false);
    expect(segmentAppliesToItem(categoryReach, q())).toBe(true);
    expect(segmentAppliesToItem(categoryReach, q({ categoryId: 4 }))).toBe(false);
  });

  it("preserves the legacy universal all_linear Working Reach default", () => {
    const legacyReach = reach(0, 10, { applicability: "all_linear" });
    expect(segmentAppliesToItem(legacyReach, q({ isLinear: false }))).toBe(true);
    const resolved = resolveEligibleScope([legacyReach], { isLinear: false, boqItemId: 7 });
    expect(resolved.hasWorkingReaches).toBe(true);
    expect(resolved.eligibleSideLenKm).toBeCloseTo(10, 5);
  });

  it("exception example: signage still eligible where earthwork is excluded", () => {
    const segs = [reach(0, 10), seg("no_scope", 2, 4, { applicability: "categories", categoryIds: [1] })];
    const earthwork = resolveEligibleScope(segs, { isLinear: true, categoryId: 1 });
    const signage = resolveEligibleScope(segs, { isLinear: true, categoryId: 2 });
    expect(earthwork.eligibleSideLenKm).toBeCloseTo(8, 5);
    expect(signage.eligibleSideLenKm).toBeCloseTo(10, 5);
  });
});

describe("032 coverageForStretch (Part I) — Auto Sequence clipping", () => {
  it("splits a stretch across a full-width no-scope hole", () => {
    const scope = resolveEligibleScope([reach(0, 2.1), reach(2.4, 3.7), seg("no_scope", 2.1, 2.4)], LINEAR);
    const cov = coverageForStretch(scope, { chainageFrom: 0, chainageTo: 3.7 });
    expect(cov.subRanges.length).toBe(2);
    expect(cov.subRanges[0]).toMatchObject({ from: 0, to: 2.1 });
    expect(cov.subRanges[1]).toMatchObject({ from: 2.4, to: 3.7 });
    expect(cov.eligibleSideLenKm).toBeCloseTo(3.4, 5);
  });

  it("one-side withdrawal keeps the range continuous with reduced side length", () => {
    const scope = resolveEligibleScope([reach(0, 10), seg("withdrawn", 6, 8, { side: "rhs" })], LINEAR);
    const cov = coverageForStretch(scope, { chainageFrom: 0, chainageTo: 10 });
    expect(cov.subRanges.length).toBe(1);           // LHS remains continuous
    expect(cov.eligibleSideLenKm).toBeCloseTo(9, 5);
    expect(cov.withdrawnSideLenKm).toBeCloseTo(1, 5);
  });

  it("an LHS stretch measures only the LHS corridor", () => {
    const scope = resolveEligibleScope([reach(0, 10), seg("withdrawn", 6, 8, { side: "rhs" })], LINEAR);
    const cov = coverageForStretch(scope, { chainageFrom: 0, chainageTo: 10, side: "lhs" });
    expect(cov.eligibleSideLenKm).toBeCloseTo(5, 5);    // 10 km × 0.5
    expect(cov.withdrawnSideLenKm).toBeCloseTo(0, 5);   // RHS withdrawal irrelevant
  });

  it("stretch entirely inside a temporary block: no sub-ranges, blocked length kept", () => {
    const scope = resolveEligibleScope([reach(0, 10), seg("temporary_block", 2, 3)], LINEAR);
    const cov = coverageForStretch(scope, { chainageFrom: 2, chainageTo: 3 });
    expect(cov.subRanges.length).toBe(0);
    expect(cov.blockedSideLenKm).toBeCloseTo(1, 5);
    expect(cov.contractualSideLenKm).toBeCloseTo(1, 5);
  });
});

describe("032 computeScopeReconciliation (Part G)", () => {
  it("gap of 0.10 km inside the corridor is flagged", () => {
    const rec = computeScopeReconciliation(
      { chainageFrom: 0, chainageTo: 3.7 },
      [reach(0, 2.1), reach(2.2, 3.7)], // 2.1–2.2 unexplained
    );
    expect(rec.gapLenKm).toBeCloseTo(0.1, 5);
    expect(rec.reconciles).toBe(false);
    expect(rec.issues.some(m => m.includes("gap"))).toBe(true);
  });

  it("Takkadpally: corridor fully explained by reaches + no-scope reconciles", () => {
    const rec = computeScopeReconciliation(
      { chainageFrom: 0, chainageTo: 3.7 },
      [reach(0, 2.1), reach(2.4, 3.7), seg("no_scope", 2.1, 2.4)],
    );
    expect(rec.gapLenKm).toBeCloseTo(0, 5);
    expect(rec.reconciles).toBe(true);
  });

  it("maintenance pattern: corridor 0–24 with reaches 2–4 / 6–7.4 / 8.1–10.8 leaves the rest as gap (not silently ok)", () => {
    const rec = computeScopeReconciliation(
      { chainageFrom: 0, chainageTo: 24 },
      [reach(2, 4), reach(6, 7.4), reach(8.1, 10.8)],
    );
    expect(rec.grossReachLenKm).toBeCloseTo(6.1, 5);
    expect(rec.gapLenKm).toBeCloseTo(24 - 6.1, 5);
    expect(rec.reconciles).toBe(false);
  });

  it("same-side reach overlap is a conflict; opposite sides are not", () => {
    const overlap = computeScopeReconciliation(null, [reach(0, 5), reach(4, 8)]);
    expect(overlap.conflicts.some(c => c.kind === "reach_overlap")).toBe(true);
    const sides = computeScopeReconciliation(null, [reach(0, 5, { side: "lhs" }), reach(4, 8, { side: "rhs" })]);
    expect(sides.conflicts.some(c => c.kind === "reach_overlap")).toBe(false);
  });

  it("no_scope vs withdrawn covering the same range is a conflict", () => {
    const rec = computeScopeReconciliation(null, [reach(0, 10), seg("no_scope", 2, 4), seg("withdrawn", 3, 5)]);
    expect(rec.conflicts.some(c => c.kind === "exclusion_conflict")).toBe(true);
  });

  it("reach beyond the corridor end is reported as overhang", () => {
    const rec = computeScopeReconciliation({ chainageFrom: 0, chainageTo: 3 }, [reach(0, 3.7)]);
    expect(rec.overhangLenKm).toBeCloseTo(0.7, 5);
    expect(rec.reconciles).toBe(false);
  });
});

describe("032 evaluateDprScope (Part N)", () => {
  const segs = [
    reach(0, 2.1, { id: 1 }), reach(2.4, 3.7, { id: 2 }),
    seg("no_scope", 2.1, 2.4, { id: 3 }),
    seg("temporary_block", 1.0, 1.5, { id: 4 }),
    seg("withdrawn", 3.0, 3.7, { id: 5, effectiveFrom: "2026-07-01" }),
  ];
  const row = (over: any = {}) => ({ isLinear: true, chainageFromKm: 0.2, chainageToKm: 0.6, dprDate: "2026-08-06", ...over });

  it("no confirmed working reaches → always ok (existing projects unaffected)", () => {
    expect(evaluateDprScope([seg("no_scope", 0, 5)], row()).status).toBe("ok");
  });

  it("executable chainage → ok", () => {
    expect(evaluateDprScope(segs, row()).status).toBe("ok");
  });

  it("no-scope chainage → no_scope", () => {
    expect(evaluateDprScope(segs, row({ chainageFromKm: 2.15, chainageToKm: 2.35 })).status).toBe("no_scope");
  });

  it("temporary block → temporary_block (warn, not silent)", () => {
    const r = evaluateDprScope(segs, row({ chainageFromKm: 1.1, chainageToKm: 1.4 }));
    expect(r.status).toBe("temporary_block");
    expect(r.segmentId).toBe(4);
  });

  it("withdrawn on/after effective date → withdrawn; before it → ok (history preserved)", () => {
    expect(evaluateDprScope(segs, row({ chainageFromKm: 3.1, chainageToKm: 3.3 })).status).toBe("withdrawn");
    expect(evaluateDprScope(segs, row({ chainageFromKm: 3.1, chainageToKm: 3.3, dprDate: "2026-06-15" })).status).toBe("ok");
  });

  it("side-aware: LHS row unaffected by an RHS-only no-scope", () => {
    const s2 = [reach(0, 10, { id: 1 }), seg("no_scope", 2, 4, { id: 9, side: "rhs" })];
    expect(evaluateDprScope(s2, row({ chainageFromKm: 2.5, chainageToKm: 3, side: "lhs" })).status).toBe("ok");
    expect(evaluateDprScope(s2, row({ chainageFromKm: 2.5, chainageToKm: 3, side: "rhs" })).status).toBe("no_scope");
  });

  it("gap between discontinuous reaches (no explicit exclusion) → no_scope", () => {
    // Maintenance pattern: reaches 2–4 / 6–7.4; work at 4.5–5 sits in the gap.
    const s2 = [reach(2, 4, { id: 1 }), reach(6, 7.4, { id: 2 })];
    const r = evaluateDprScope(s2, row({ chainageFromKm: 4.5, chainageToKm: 5 }));
    expect(r.status).toBe("no_scope");
    expect(r.message).toMatch(/outside every confirmed working reach/);
  });

  it("gap check is side-aware: LHS-only reach covers LHS rows but not RHS", () => {
    const s2 = [reach(0, 10, { id: 1, side: "lhs" })];
    expect(evaluateDprScope(s2, row({ chainageFromKm: 1, chainageToKm: 2, side: "lhs" })).status).toBe("ok");
    expect(evaluateDprScope(s2, row({ chainageFromKm: 1, chainageToKm: 2, side: "rhs" })).status).toBe("no_scope");
  });

  it("discrete (structure) item ignores all_linear no-scope", () => {
    const s2 = [reach(0, 10, { id: 1 }), seg("no_scope", 2, 4, { id: 9, applicability: "all_linear" })];
    expect(evaluateDprScope(s2, row({ isLinear: false, chainageFromKm: 2.5, chainageToKm: 3 })).status).toBe("ok");
  });
});

describe("032 sequencer integration — scopeCoverage callback", () => {
  const item = (id: number, qty: number): SeqItem => ({
    boqItemId: id,
    description: `GSB item ${id}`,
    totalQty: qty,
    fullDurationMonths: 2,
    layerType: "gsb",
    workCategory: null,
    planningWorkType: null,
    unit: "cum",
  } as any);

  const baseOpts = (over: any = {}) => ({
    roadLengthKm: 3.7,
    stretches: [{ label: "Reach A", chainageFrom: 0, chainageTo: 3.7, priority: 1 }],
    ...over,
  });

  it("no scopeCoverage → legacy allocation untouched (single full-stretch bar)", () => {
    const res = generateSequencedProgramme([item(1, 1000)], baseOpts() as any);
    const roadBars = res.bars.filter(b => b.boqItemId === 1);
    expect(roadBars.length).toBe(1);
    expect(roadBars[0].plannedQty).toBeCloseTo(1000, 3);
    expect(res.scopeSummary).toBeUndefined();
  });

  it("full-width hole splits the bar and drops the excluded quantity", () => {
    const scope = resolveEligibleScope([reach(0, 2.1), reach(2.4, 3.7), seg("no_scope", 2.1, 2.4)], LINEAR);
    const res = generateSequencedProgramme([item(1, 1000)], baseOpts({
      scopeCoverage: (_id: number, st: any) => coverageForStretch(scope, st),
    }) as any);
    const roadBars = res.bars.filter(b => b.boqItemId === 1);
    expect(roadBars.length).toBe(2);
    const total = roadBars.reduce((s, b) => s + (b.plannedQty ?? 0), 0);
    expect(total).toBeCloseTo(1000, 2); // eligible == contractual here → all qty programmed
    // qty split ∝ eligible length: 2.1/3.4 and 1.3/3.4
    expect(roadBars[0].plannedQty).toBeCloseTo(1000 * 2.1 / 3.4, 2);
    expect(roadBars[1].plannedQty).toBeCloseTo(1000 * 1.3 / 3.4, 2);
    expect(roadBars[0].chainageFrom).toBeCloseTo(0, 3);
    expect(roadBars[0].chainageTo).toBeCloseTo(2.1, 3);
    expect(roadBars[1].chainageFrom).toBeCloseTo(2.4, 3);
    expect(res.scopeSummary?.[1]?.fullyExcluded).toBe(false);
  });

  it("temporary block share stays UNPROGRAMMED — never forced into the last reach", () => {
    const scope = resolveEligibleScope([reach(0, 10), seg("temporary_block", 2, 3)], LINEAR);
    const res = generateSequencedProgramme([item(1, 1000)], baseOpts({
      roadLengthKm: 10,
      stretches: [{ label: "S", chainageFrom: 0, chainageTo: 10, priority: 1 }],
      scopeCoverage: (_id: number, st: any) => coverageForStretch(scope, st),
    }) as any);
    const total = res.bars.filter(b => b.boqItemId === 1).reduce((s, b) => s + (b.plannedQty ?? 0), 0);
    expect(total).toBeCloseTo(1000 * 9 / 10, 2);          // blocked 10% not programmed
    expect(res.scopeSummary?.[1]?.blockedQty).toBeCloseTo(100, 1);
  });

  it("fully excluded item generates no bars and is reported in scopeSummary", () => {
    const scope = resolveEligibleScope([reach(5, 10)], LINEAR); // stretch 0–3.7 has no reach
    const res = generateSequencedProgramme([item(1, 500)], baseOpts({
      scopeCoverage: (_id: number, st: any) => coverageForStretch(scope, st),
    }) as any);
    expect(res.bars.filter(b => b.boqItemId === 1).length).toBe(0);
    expect(res.scopeSummary?.[1]?.fullyExcluded).toBe(true);
  });

  it("unchecked Reach 1 gets no bar and the full item quantity moves to enabled Reach 2", () => {
    const segments = [
      reach(0, 1, { id: 101, applicability: "items", itemIds: [999] }),
      reach(1, 2, { id: 102, applicability: "items", itemIds: [1] }),
    ];
    const scope = resolveEligibleScope(segments, { isLinear: true, boqItemId: 1 });
    expect(scope.hasWorkingReaches).toBe(true);
    expect(scope.eligibleSideLenKm).toBeCloseTo(1, 5);

    const res = generateSequencedProgramme([item(1, 1000)], baseOpts({
      roadLengthKm: 2,
      stretches: [
        { label: "Reach 1", chainageFrom: 0, chainageTo: 1, priority: 1 },
        { label: "Reach 2", chainageFrom: 1, chainageTo: 2, priority: 2 },
      ],
      scopeCoverage: (_id: number, st: any) => coverageForStretch(scope, st),
    }) as any);
    const roadBars = res.bars.filter(b => b.boqItemId === 1);
    expect(roadBars).toHaveLength(1);
    expect(roadBars[0].chainageFrom).toBeCloseTo(1, 5);
    expect(roadBars[0].chainageTo).toBeCloseTo(2, 5);
    expect(roadBars[0].plannedQty).toBeCloseTo(1000, 3);
  });
});
