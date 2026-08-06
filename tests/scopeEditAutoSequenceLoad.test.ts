/**
 * Scope edit-fix batch — Part A (scope-record form hydration) and
 * Part B (Auto Sequence loads confirmed Project Scope reaches).
 *
 * Part A: pencil-edit must load EVERY saved field (never a blank "new reach"
 * form); quick-add after cancel must be truly blank (no state leaks).
 *
 * Part B: only CONFIRMED working reaches become stretch rows; No-Scope /
 * temporary-block / withdrawn records are constraints (never rows, never
 * auto-split boundaries); the eligibility engine clips quantities; scope
 * fingerprint detects a changed confirmed scope (stale warning, no silent
 * regeneration).
 */
import { describe, it, expect } from "vitest";
import { emptyScopeForm, scopeFormFromSegment, safeParseIds } from "../client/src/lib/scopeForm";
import {
  confirmedWorkingReaches,
  scopeReachesToStretchRows,
  scopeConstraints,
  scopeFingerprint,
} from "../shared/autoSequenceScope";
import { resolveEligibleScope, coverageForStretch, type ScopeSegmentLike } from "../shared/projectScope";
import { generateSequencedProgramme } from "../shared/programmeSequencer";

// ── fixtures ────────────────────────────────────────────────────────────────
const fullSegment = {
  id: 42,
  segmentType: "temporary_block",
  status: "confirmed",
  label: "Village stretch",
  chainageFrom: "1.2500",           // pg numeric arrives as string
  chainageTo: 2.5,
  side: "lhs",
  reason: "Utility shifting pending",
  applicability: "categories",
  categoryIds: "[3,7]",
  itemIds: null,
  effectiveFrom: "2026-08-01T00:00:00.000Z", // ISO timestamp → date input value
  deptReference: "NH/2026/117",
  withdrawalOrderRef: "WO-9",
  notes: "check with PIU",
};

const rec = (t: string, from: number, to: number, extra: any = {}) => ({
  id: extra.id ?? Math.floor(Math.random() * 1e6),
  segmentType: t, chainageFrom: from, chainageTo: to, status: "confirmed", ...extra,
});

// Takkadpally live-proof pattern: reaches 0–1.25 / 1.25–2.5 / 2.5–3.8, no-scope 2.1–2.4
const takkadpally = [
  rec("working_reach", 0, 1.25, { id: 1, label: "Reach 1" }),
  rec("working_reach", 1.25, 2.5, { id: 2, label: "Reach 2" }),
  rec("working_reach", 2.5, 3.8, { id: 3, label: "Reach 3" }),
  rec("no_scope", 2.1, 2.4, { id: 4, reason: "land not handed over" }),
];

// ── Part A: form hydration ──────────────────────────────────────────────────
describe("Part A — scope form hydration (pencil edit)", () => {
  it("hydrates every saved field — never a blank form", () => {
    const f = scopeFormFromSegment(fullSegment);
    expect(f.segmentType).toBe("temporary_block");
    expect(f.label).toBe("Village stretch");
    expect(f.chainageFrom).toBe("1.2500");
    expect(f.chainageTo).toBe("2.5");
    expect(f.side).toBe("lhs");
    expect(f.reason).toBe("Utility shifting pending");
    expect(f.applicability).toBe("categories");
    expect(f.categoryIds).toEqual([3, 7]);
    expect(f.itemIds).toEqual([]);
    expect(f.effectiveFrom).toBe("2026-08-01"); // date-input compatible
    expect(f.deptReference).toBe("NH/2026/117");
    expect(f.withdrawalOrderRef).toBe("WO-9");
    expect(f.notes).toBe("check with PIU");
  });

  it("chainage 0 hydrates as '0', not blank", () => {
    const f = scopeFormFromSegment({ ...fullSegment, chainageFrom: 0 });
    expect(f.chainageFrom).toBe("0");
  });

  it("plain yyyy-mm-dd effectiveFrom passes through unchanged", () => {
    expect(scopeFormFromSegment({ ...fullSegment, effectiveFrom: "2026-07-15" }).effectiveFrom).toBe("2026-07-15");
  });

  it("malformed id lists degrade to [] (no crash)", () => {
    expect(safeParseIds("not-json")).toEqual([]);
    expect(safeParseIds('{"a":1}')).toEqual([]);
    expect(safeParseIds(null)).toEqual([]);
    expect(safeParseIds("[1,\"2\",null]")).toEqual([1, 2]);
  });

  it("quick-add after an edit yields a truly blank form (no state leak)", () => {
    // Simulate: edit hydrates → cancel → quick-add. The quick-add form must
    // equal a pristine empty form, not carry any hydrated values.
    const edited = scopeFormFromSegment(fullSegment);
    expect(edited.label).not.toBe(""); // sanity: edit really had values
    const blank = emptyScopeForm("working_reach");
    expect(blank).toEqual({
      segmentType: "working_reach", label: "", chainageFrom: "", chainageTo: "",
      side: "", reason: "", applicability: "all_linear", categoryIds: [], itemIds: [],
      effectiveFrom: "", deptReference: "", withdrawalOrderRef: "", notes: "",
    });
    // emptyScopeForm returns fresh arrays each call — mutating one never leaks
    blank.categoryIds.push(99);
    expect(emptyScopeForm("working_reach").categoryIds).toEqual([]);
  });
});

// ── Part B: loading confirmed scope into Auto Sequence ─────────────────────
describe("Part B — confirmed scope → stretch rows", () => {
  it("only CONFIRMED working reaches load; drafts and superseded are skipped", () => {
    const segs = [
      ...takkadpally,
      rec("working_reach", 3.8, 4.2, { id: 5, status: "draft" }),
      rec("working_reach", 4.2, 4.6, { id: 6, status: "superseded" }),
    ];
    const rows = scopeReachesToStretchRows(segs);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => [r.chainageFrom, r.chainageTo])).toEqual([[0, 1.25], [1.25, 2.5], [2.5, 3.8]]);
  });

  it("one reach = ONE row, even when a no-scope record sits inside it (no auto-split)", () => {
    const rows = scopeReachesToStretchRows(takkadpally);
    const reach2 = rows[1];
    expect(reach2.chainageFrom).toBe(1.25);
    expect(reach2.chainageTo).toBe(2.5); // NOT split at 2.1/2.4
    expect(rows.filter(r => r.chainageFrom >= 1.25 && r.chainageTo <= 2.5)).toHaveLength(1);
  });

  it("maps label, side pass-through, stage = row order, sorted by chainage", () => {
    const segs = [
      rec("working_reach", 2, 3, { id: 11, label: "B", side: "rhs" }),
      rec("working_reach", 0, 1, { id: 12, label: null }),
    ];
    const rows = scopeReachesToStretchRows(segs);
    expect(rows[0]).toEqual({ label: "Reach 1", chainageFrom: 0, chainageTo: 1, side: null, priority: 1 });
    expect(rows[1]).toEqual({ label: "B", chainageFrom: 2, chainageTo: 3, side: "rhs", priority: 2 });
  });

  it("non-reach confirmed records become constraints, not rows", () => {
    const cons = scopeConstraints([
      ...takkadpally,
      rec("temporary_block", 0.5, 0.8, { id: 7, reason: "monsoon" }),
      rec("withdrawn", 3.0, 3.2, { id: 8, status: "draft" }), // draft → ignored
    ]);
    expect(cons.map(c => c.segmentType)).toEqual(["temporary_block", "no_scope"]);
    expect(cons.find(c => c.segmentType === "temporary_block")!.temporary).toBe(true);
    expect(cons.find(c => c.segmentType === "no_scope")!.temporary).toBe(false);
  });
});

describe("Part B — scope fingerprint (stale detection)", () => {
  it("stable across ordering; changes when confirmed scope changes", () => {
    const a = scopeFingerprint(takkadpally as any);
    const b = scopeFingerprint([...takkadpally].reverse() as any);
    expect(a).toBe(b);
    const changed = scopeFingerprint([...takkadpally, rec("no_scope", 0.2, 0.4, { id: 99 })] as any);
    expect(changed).not.toBe(a);
  });

  it("draft/superseded records do not affect the fingerprint", () => {
    const a = scopeFingerprint(takkadpally as any);
    const withDraft = scopeFingerprint([...takkadpally, rec("working_reach", 5, 6, { id: 50, status: "draft" })] as any);
    expect(withDraft).toBe(a);
  });

  it("a new confirmed no-scope record (no reach change) still changes the fingerprint", () => {
    const reachesOnly = takkadpally.filter(s => s.segmentType === "working_reach");
    expect(scopeFingerprint(takkadpally as any)).not.toBe(scopeFingerprint(reachesOnly as any));
  });
});

describe("Part B — eligibility: Reach 2 with internal no-scope", () => {
  const scope = resolveEligibleScope(takkadpally as ScopeSegmentLike[], { isLinear: true, onDate: null });

  it("dry-run view: gross 1.250–2.500 → eligible 1.250–2.100 + 2.400–2.500, one row", () => {
    const cov = coverageForStretch(scope, { chainageFrom: 1.25, chainageTo: 2.5 });
    expect(cov.subRanges.map(r => [r.from, r.to])).toEqual([[1.25, 2.1], [2.4, 2.5]]);
    expect(cov.excludedSideLenKm).toBeCloseTo(0.3, 6); // 0.3 km both sides × 0.5 × 2
    expect(cov.eligibleSideLenKm).toBeCloseTo(0.95, 6);
  });

  it("temporary block stays in the contractual basis (withheld, not removed)", () => {
    const segs = [...takkadpally.filter(s => s.segmentType === "working_reach"),
      rec("temporary_block", 2.1, 2.4, { id: 40 })] as ScopeSegmentLike[];
    const cov = coverageForStretch(resolveEligibleScope(segs, { isLinear: true, onDate: null }), { chainageFrom: 1.25, chainageTo: 2.5 });
    expect(cov.blockedSideLenKm).toBeCloseTo(0.3, 6);
    expect(cov.contractualSideLenKm).toBeCloseTo(1.25, 6); // eligible + blocked
  });

  it("generation allocates quantity to eligible scope only (no-scope portion gets nothing)", () => {
    const rows = scopeReachesToStretchRows(takkadpally);
    const res = generateSequencedProgramme(
      [{ boqItemId: 1, description: "Granular Sub Base", unit: "cum", totalQty: 3800, fullDurationMonths: 3, layerType: "gsb" } as any],
      {
        roadLengthKm: 3.8, chainageStartKm: 0,
        stretches: rows.map(r => ({
          label: r.label, chainageFrom: r.chainageFrom, chainageTo: r.chainageTo,
          priority: r.priority, manualQtyFraction: null, side: r.side as any,
          front: null, executionOrder: null, plannedWidthM: null,
        })),
        scopeCoverage: (_id: number, st: any) => coverageForStretch(scope, st),
      } as any,
    );
    const roadBars = res.bars.filter((b: any) => b.boqItemId === 1);
    // Reach 2 splits at the full-width no-scope hole → 0–1.25, 1.25–2.1, 2.4–2.5, 2.5–3.8
    expect(roadBars.length).toBe(4);
    // No bar covers any part of the excluded 2.1–2.4 range
    for (const b of roadBars) {
      const overlaps = (b.chainageFrom ?? 0) < 2.4 && (b.chainageTo ?? 0) > 2.1;
      expect(overlaps).toBe(false);
    }
    // Eligible == contractual (no blocks) → full BOQ qty spread over eligible length only
    const total = roadBars.reduce((s: number, b: any) => s + (b.plannedQty ?? 0), 0);
    expect(total).toBeCloseTo(3800, 2);
    const bar = (f: number) => roadBars.find((b: any) => Math.abs((b.chainageFrom ?? -1) - f) < 1e-6)!;
    expect(bar(1.25).plannedQty).toBeCloseTo(3800 * 0.85 / 3.5, 1); // 1.25–2.1
    expect(bar(2.4).plannedQty).toBeCloseTo(3800 * 0.1 / 3.5, 1);   // 2.4–2.5
  });

  it("temporary block instead of no-scope → blocked share WITHHELD (total < BOQ), reach still one row", () => {
    const segs = [...takkadpally.filter(s => s.segmentType === "working_reach"),
      rec("temporary_block", 2.1, 2.4, { id: 41 })] as ScopeSegmentLike[];
    const blockScope = resolveEligibleScope(segs, { isLinear: true, onDate: null });
    const rows = scopeReachesToStretchRows(segs as any);
    expect(rows).toHaveLength(3); // block is a constraint, not a row
    const res = generateSequencedProgramme(
      [{ boqItemId: 1, description: "Granular Sub Base", unit: "cum", totalQty: 3800, fullDurationMonths: 3, layerType: "gsb" } as any],
      {
        roadLengthKm: 3.8, chainageStartKm: 0,
        stretches: rows.map(r => ({ label: r.label, chainageFrom: r.chainageFrom, chainageTo: r.chainageTo, priority: r.priority })),
        scopeCoverage: (_id: number, st: any) => coverageForStretch(blockScope, st),
      } as any,
    );
    const total = res.bars.filter((b: any) => b.boqItemId === 1).reduce((s: number, b: any) => s + (b.plannedQty ?? 0), 0);
    expect(total).toBeCloseTo(3800 * 3.5 / 3.8, 1); // blocked 0.3 km withheld, not reallocated
    expect(res.scopeSummary?.[1]?.blockedQty).toBeCloseTo(3800 * 0.3 / 3.8, 0);
  });
});
