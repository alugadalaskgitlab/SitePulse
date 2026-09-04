// ─── Instruction 032: Project Scope, Working Reaches, Exclusions, Constraints
// and Withdrawals ─────────────────────────────────────────────────────────────
// Single shared source of truth ("eligible-scope service", Part H) used by:
//  - the Scope & Working Reaches setup page (client)
//  - Auto Sequence quantity allocation (server route → programmeSequencer)
//  - BOM/resource demand (via bars generated only over eligible coverage)
//  - lightweight DPR scope validation (server + guided/detailed DPR clients)
//  - Scope Reconciliation summary (Part G)
//
// Never hardcode a specific project's chainages or material names here.
// All math is side-aware: LHS and RHS are distinct corridors; Both Sides /
// Full Width cover both; an unspecified side is treated as covering both
// sides but is surfaced as "side review required" where it materially
// affects a result (Part F).

import { areSidesDistinctCorridors } from "./barSide";

// ─── Types ───────────────────────────────────────────────────────────────────

export const SCOPE_SEGMENT_TYPES = [
  "working_reach",
  "no_scope",
  "temporary_block",
  "withdrawn",
] as const;
export type ScopeSegmentType = (typeof SCOPE_SEGMENT_TYPES)[number];

export const SCOPE_SEGMENT_TYPE_LABELS: Record<ScopeSegmentType, string> = {
  working_reach: "Working Reach",
  no_scope: "Existing / No-Scope Portion",
  temporary_block: "Temporary Block",
  withdrawn: "Withdrawn / Omitted",
};

export const SCOPE_APPLICABILITY_MODES = ["all_linear", "categories", "items"] as const;
export type ScopeApplicabilityMode = (typeof SCOPE_APPLICABILITY_MODES)[number];

export const SCOPE_STATUSES = ["draft", "confirmed", "superseded"] as const;
export type ScopeStatus = (typeof SCOPE_STATUSES)[number];

/** Minimal shape of a scope segment for the pure service (DB row adapts to this). */
export interface ScopeSegmentLike {
  id?: number;
  segmentType: ScopeSegmentType;
  chainageFrom: number;
  chainageTo: number;
  /** BarSide vocabulary or null (= unspecified → treated as covering both sides, flagged). */
  side?: string | null;
  status?: string | null;              // draft | confirmed | superseded
  /** Applicability (Part E). Working reaches normally apply to everything. */
  applicability?: ScopeApplicabilityMode | null;
  categoryIds?: number[] | null;
  itemIds?: number[] | null;
  /** ISO dates. Withdrawn: effectiveFrom = withdrawal date. Temporary block:
   *  active while effectiveFrom ≤ date ≤ effectiveTo (open-ended when null). */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  label?: string | null;
  reason?: string | null;
}

/** What the caller is asking eligibility for (one BOQ item or a generic linear item). */
export interface ScopeItemQuery {
  boqItemId?: number | null;
  categoryId?: number | null;
  /** Linear road item (pavement/earthwork/shoulder/spray…) vs discrete/structure.
   *  Discrete items NEVER inherit "all_linear" exclusions (Part E). */
  isLinear: boolean;
  /** Programme/DPR date (ISO). Withdrawals before/on this date apply; temporary
   *  blocks active on this date apply. Defaults to "today" semantics = all
   *  withdrawals apply and all un-released blocks apply. */
  onDate?: string | null;
}

/** Half-corridor identifiers used for side-aware length math. */
export type Corridor = "lhs" | "rhs" | "median" | "service_lhs" | "service_rhs";
const MAIN_CORRIDORS: Corridor[] = ["lhs", "rhs"];

/** One contiguous chainage range on one corridor. */
export interface CorridorRange { corridor: Corridor; from: number; to: number }

export interface EligibleScopeResult {
  /** Executable ranges per corridor (working reaches − exclusions − withdrawals − blocks). */
  executable: CorridorRange[];
  /** Still contractual but currently blocked (unprogrammed). */
  blocked: CorridorRange[];
  /** Permanently excluded (no-scope) ranges applicable to the item. */
  excluded: CorridorRange[];
  /** Withdrawn ranges effective on the query date. */
  withdrawn: CorridorRange[];
  /** Side-length in km-equivalents: 1 km full-width = 1.0 (0.5 per side). */
  eligibleSideLenKm: number;
  blockedSideLenKm: number;
  excludedSideLenKm: number;
  withdrawnSideLenKm: number;
  /** Contractual = eligible + blocked (denominator for quantity distribution). */
  contractualSideLenKm: number;
  /** Segments with unspecified side that materially affected the result. */
  sideReviewSegmentIds: number[];
  /** True when the project has at least one confirmed working reach (scope in use). */
  hasWorkingReaches: boolean;
}

// ─── Interval algebra (pure, corridor-by-corridor) ───────────────────────────

export const SCOPE_CH_EPS = 0.0005; // 0.5 m — matches programmeSequencer

type Ival = [number, number];

function normIvals(ivals: Ival[]): Ival[] {
  const s = ivals
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b - a > SCOPE_CH_EPS)
    .sort((x, y) => x[0] - y[0]);
  const out: Ival[] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + SCOPE_CH_EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtractIvals(base: Ival[], cut: Ival[]): Ival[] {
  let cur = normIvals(base);
  for (const [ca, cb] of normIvals(cut)) {
    const next: Ival[] = [];
    for (const [a, b] of cur) {
      if (cb <= a + SCOPE_CH_EPS || ca >= b - SCOPE_CH_EPS) { next.push([a, b]); continue; }
      if (ca > a + SCOPE_CH_EPS) next.push([a, Math.min(ca, b)]);
      if (cb < b - SCOPE_CH_EPS) next.push([Math.max(cb, a), b]);
    }
    cur = next;
  }
  return normIvals(cur);
}

function intersectIvals(a: Ival[], b: Ival[]): Ival[] {
  const out: Ival[] = [];
  for (const [a1, a2] of normIvals(a)) {
    for (const [b1, b2] of normIvals(b)) {
      const f = Math.max(a1, b1), t = Math.min(a2, b2);
      if (t - f > SCOPE_CH_EPS) out.push([f, t]);
    }
  }
  return normIvals(out);
}

function ivalLen(ivals: Ival[]): number {
  return normIvals(ivals).reduce((s, [a, b]) => s + (b - a), 0);
}

/** Corridors a segment side covers. Unspecified side → both main corridors
 *  (flagged for review by callers where it matters). */
export function corridorsForSide(side: string | null | undefined): Corridor[] {
  switch (side) {
    case "lhs": case "shoulder_lhs": return ["lhs"];
    case "rhs": case "shoulder_rhs": return ["rhs"];
    case "median": return ["median"];
    case "service_road_lhs": return ["service_lhs"];
    case "service_road_rhs": return ["service_rhs"];
    case "full_width": case "both_sides": return ["lhs", "rhs"];
    default: return ["lhs", "rhs"]; // null / "other" / unknown → both, review required
  }
}

/** Weight of one corridor toward km-equivalent side length (full width = 1.0). */
function corridorWeight(c: Corridor): number {
  return c === "lhs" || c === "rhs" ? 0.5 : 0.5; // service/median tracked at half weight too
}

// ─── Applicability (Part E) ──────────────────────────────────────────────────

export function segmentAppliesToItem(seg: ScopeSegmentLike, q: ScopeItemQuery): boolean {
  const mode: ScopeApplicabilityMode = (seg.applicability as ScopeApplicabilityMode) || "all_linear";
  // Preserve the pre-WP-04 Working Reach default: an unscoped/all_linear reach
  // remains universal. Only explicit item/category selections narrow a reach.
  if (seg.segmentType === "working_reach" && mode === "all_linear") return true;
  if (mode === "all_linear") return q.isLinear === true; // discrete items never inherit (Part E)
  if (mode === "categories")
    return q.categoryId != null && (seg.categoryIds ?? []).includes(q.categoryId);
  if (mode === "items")
    return q.boqItemId != null && (seg.itemIds ?? []).includes(q.boqItemId);
  return false;
}

/** Date gates (Part C/D). Withdrawn applies from its effective date. Temporary
 *  block applies while active (open-ended when no release date). */
function segmentActiveOnDate(seg: ScopeSegmentLike, onDate?: string | null): boolean {
  const d = onDate ? Date.parse(onDate) : NaN;
  if (seg.segmentType === "withdrawn") {
    if (!seg.effectiveFrom) return true;                    // undated withdrawal = applies now
    if (!Number.isFinite(d)) return true;                   // no query date → applies
    return Date.parse(seg.effectiveFrom) <= d;
  }
  if (seg.segmentType === "temporary_block") {
    if (!Number.isFinite(d)) {
      // No query date: active unless already released (effectiveTo in the past is unknowable) → active when no effectiveTo… keep conservative: active unless effectiveTo set AND caller gave no date.
      return true;
    }
    if (seg.effectiveFrom && Date.parse(seg.effectiveFrom) > d) return false;
    if (seg.effectiveTo && Date.parse(seg.effectiveTo) < d) return false;
    return true;
  }
  return true; // working_reach / no_scope are not date-gated in this batch
}

function confirmedOnly(segments: ScopeSegmentLike[], includeDraft: boolean): ScopeSegmentLike[] {
  return segments.filter(s =>
    (s.status ?? "confirmed") !== "superseded" &&
    (includeDraft || (s.status ?? "confirmed") === "confirmed"));
}

// ─── The eligible-scope service (Part H) ─────────────────────────────────────

export function resolveEligibleScope(
  segments: ScopeSegmentLike[],
  q: ScopeItemQuery,
  opts?: { includeDraft?: boolean },
): EligibleScopeResult {
  const segs = confirmedOnly(segments, opts?.includeDraft ?? false);
  const reaches = segs.filter(s => s.segmentType === "working_reach");
  const hasWorkingReaches = reaches.length > 0;

  const corridorSet = new Set<Corridor>();
  for (const s of segs) corridorsForSide(s.side).forEach(c => corridorSet.add(c));
  MAIN_CORRIDORS.forEach(c => corridorSet.add(c));

  const sideReviewSegmentIds: number[] = [];
  const perCorridor = (type: (s: ScopeSegmentLike) => boolean, applies = true): Map<Corridor, Ival[]> => {
    const m = new Map<Corridor, Ival[]>();
    for (const s of segs) {
      if (!type(s)) continue;
      if (applies && !segmentAppliesToItem(s, q)) continue;
      if (s.segmentType !== "working_reach" && !segmentActiveOnDate(s, q.onDate)) continue;
      if (s.side == null && s.id != null) sideReviewSegmentIds.push(s.id);
      for (const c of corridorsForSide(s.side)) {
        m.set(c, [...(m.get(c) ?? []), [s.chainageFrom, s.chainageTo] as Ival]);
      }
    }
    return m;
  };

  const reachM = perCorridor(s => s.segmentType === "working_reach");
  const noScopeM = perCorridor(s => s.segmentType === "no_scope");
  const withdrawnM = perCorridor(s => s.segmentType === "withdrawn");
  const blockM = perCorridor(s => s.segmentType === "temporary_block");

  const executable: CorridorRange[] = [];
  const blocked: CorridorRange[] = [];
  const excluded: CorridorRange[] = [];
  const withdrawn: CorridorRange[] = [];
  let eligibleSideLenKm = 0, blockedSideLenKm = 0, excludedSideLenKm = 0, withdrawnSideLenKm = 0;

  for (const c of Array.from(corridorSet)) {
    const base = normIvals(reachM.get(c) ?? []);
    if (!base.length) continue;
    const w = corridorWeight(c);
    const ns = intersectIvals(base, noScopeM.get(c) ?? []);
    const wd = intersectIvals(subtractIvals(base, ns), withdrawnM.get(c) ?? []);
    const contractual = subtractIvals(base, [...ns, ...wd]);
    const bl = intersectIvals(contractual, blockM.get(c) ?? []);
    const ex = subtractIvals(contractual, bl);
    ex.forEach(([f, t]) => executable.push({ corridor: c, from: +f.toFixed(6), to: +t.toFixed(6) }));
    bl.forEach(([f, t]) => blocked.push({ corridor: c, from: +f.toFixed(6), to: +t.toFixed(6) }));
    ns.forEach(([f, t]) => excluded.push({ corridor: c, from: +f.toFixed(6), to: +t.toFixed(6) }));
    wd.forEach(([f, t]) => withdrawn.push({ corridor: c, from: +f.toFixed(6), to: +t.toFixed(6) }));
    eligibleSideLenKm += ivalLen(ex) * w;
    blockedSideLenKm += ivalLen(bl) * w;
    excludedSideLenKm += ivalLen(ns) * w;
    withdrawnSideLenKm += ivalLen(wd) * w;
  }

  const r6 = (n: number) => +n.toFixed(6);
  return {
    executable, blocked, excluded, withdrawn,
    eligibleSideLenKm: r6(eligibleSideLenKm),
    blockedSideLenKm: r6(blockedSideLenKm),
    excludedSideLenKm: r6(excludedSideLenKm),
    withdrawnSideLenKm: r6(withdrawnSideLenKm),
    contractualSideLenKm: r6(eligibleSideLenKm + blockedSideLenKm),
    sideReviewSegmentIds: Array.from(new Set(sideReviewSegmentIds)),
    hasWorkingReaches,
  };
}

// ─── Stretch coverage for Auto Sequence (Part I) ─────────────────────────────

export interface StretchCoverage {
  /** Maximal chainage sub-ranges of the stretch with ANY executable corridor
   *  coverage; each carries its eligible side-length (km-equivalents). Bars are
   *  generated only for these (Part I #7). */
  subRanges: Array<{ from: number; to: number; eligibleSideLenKm: number }>;
  eligibleSideLenKm: number;
  blockedSideLenKm: number;
  excludedSideLenKm: number;
  withdrawnSideLenKm: number;
  contractualSideLenKm: number;
}

/**
 * Clip one Auto-Sequence stretch against an item's eligible-scope result.
 * The stretch's own side limits which corridors count (an LHS stretch only
 * measures the LHS corridor).
 */
export function coverageForStretch(
  scope: EligibleScopeResult,
  stretch: { chainageFrom: number; chainageTo: number; side?: string | null },
): StretchCoverage {
  const corridors = corridorsForSide(stretch.side);
  const stIval: Ival[] = [[stretch.chainageFrom, stretch.chainageTo]];
  const w = 0.5;
  const pick = (ranges: CorridorRange[]) => {
    let len = 0;
    const perC: Ival[] = [];
    for (const c of corridors) {
      const iv = intersectIvals(stIval, ranges.filter(r => r.corridor === c).map(r => [r.from, r.to] as Ival));
      len += ivalLen(iv) * w;
      perC.push(...iv);
    }
    return { len: +len.toFixed(6), union: normIvals(perC) };
  };
  const ex = pick(scope.executable);
  const bl = pick(scope.blocked);
  const ns = pick(scope.excluded);
  const wd = pick(scope.withdrawn);

  // Bars follow the chainage union of executable coverage across the stretch's
  // corridors — a range excluded on BOTH sides splits the bar; a one-side
  // withdrawal keeps the bar continuous with reduced quantity.
  const subRanges = ex.union.map(([f, t]) => {
    let len = 0;
    for (const c of corridors) {
      const iv = intersectIvals([[f, t]], scope.executable.filter(r => r.corridor === c).map(r => [r.from, r.to] as Ival));
      len += ivalLen(iv) * w;
    }
    return { from: +f.toFixed(3), to: +t.toFixed(3), eligibleSideLenKm: +len.toFixed(6) };
  });

  return {
    subRanges,
    eligibleSideLenKm: ex.len,
    blockedSideLenKm: bl.len,
    excludedSideLenKm: ns.len,
    withdrawnSideLenKm: wd.len,
    contractualSideLenKm: +(ex.len + bl.len).toFixed(6),
  };
}

// ─── Scope Reconciliation (Part G) ───────────────────────────────────────────

export interface ScopeReconciliation {
  referenceLenKm: number | null;
  grossReachLenKm: number;          // merged working-reach chainage coverage (not side-weighted)
  executableSideLenKm: number;
  excludedSideLenKm: number;
  withdrawnSideLenKm: number;
  blockedSideLenKm: number;
  gapLenKm: number;                 // corridor chainage not covered by any working reach
  gaps: Array<{ from: number; to: number }>;
  /** Same-side overlaps between working reaches, and no_scope↔withdrawn conflicts. */
  conflicts: Array<{ kind: string; from: number; to: number; detail: string }>;
  overhangLenKm: number;            // reach coverage outside the reference corridor
  reconciles: boolean;
  issues: string[];
}

export function computeScopeReconciliation(
  corridor: { chainageFrom: number | null; chainageTo: number | null } | null,
  segments: ScopeSegmentLike[],
  opts?: { includeDraft?: boolean },
): ScopeReconciliation {
  const segs = confirmedOnly(segments, opts?.includeDraft ?? true); // setup page includes drafts by default
  const reaches = segs.filter(s => s.segmentType === "working_reach");
  const refFrom = corridor?.chainageFrom ?? null;
  const refTo = corridor?.chainageTo ?? null;
  const referenceLenKm = refFrom != null && refTo != null && refTo > refFrom ? +(refTo - refFrom).toFixed(6) : null;

  const reachUnion = normIvals(reaches.map(s => [s.chainageFrom, s.chainageTo] as Ival));
  const grossReachLenKm = +ivalLen(reachUnion).toFixed(6);

  // Generic (all-linear-item) scope figures for the headline summary.
  const scope = resolveEligibleScope(segments, { isLinear: true }, { includeDraft: opts?.includeDraft ?? true });

  const issues: string[] = [];
  const conflicts: ScopeReconciliation["conflicts"] = [];

  // Same-side working-reach overlaps = double-counted coverage (physical check,
  // not just numeric totals).
  for (let i = 0; i < reaches.length; i++) {
    for (let j = i + 1; j < reaches.length; j++) {
      const a = reaches[i], b = reaches[j];
      const f = Math.max(a.chainageFrom, b.chainageFrom);
      const t = Math.min(a.chainageTo, b.chainageTo);
      if (t - f > SCOPE_CH_EPS && !areSidesDistinctCorridors(a.side ?? null, b.side ?? null)) {
        conflicts.push({
          kind: "reach_overlap", from: +f.toFixed(3), to: +t.toFixed(3),
          detail: `Working reaches "${a.label || `#${i + 1}`}" and "${b.label || `#${j + 1}`}" overlap Km ${+f.toFixed(3)}–${+t.toFixed(3)} on the same side — the same coverage is counted twice.`,
        });
      }
    }
  }
  // Withdrawn vs permanent no-scope on the same coverage = conflicting record.
  const noScopes = segs.filter(s => s.segmentType === "no_scope");
  const withdrawns = segs.filter(s => s.segmentType === "withdrawn");
  for (const n of noScopes) {
    for (const wdr of withdrawns) {
      const f = Math.max(n.chainageFrom, wdr.chainageFrom);
      const t = Math.min(n.chainageTo, wdr.chainageTo);
      if (t - f > SCOPE_CH_EPS && !areSidesDistinctCorridors(n.side ?? null, wdr.side ?? null)) {
        conflicts.push({
          kind: "exclusion_conflict", from: +f.toFixed(3), to: +t.toFixed(3),
          detail: `A no-scope portion and a withdrawn portion both cover Km ${+f.toFixed(3)}–${+t.toFixed(3)} — decide which record governs this range.`,
        });
      }
    }
  }

  // Gaps and overhang against the reference corridor.
  const gaps: Array<{ from: number; to: number }> = [];
  let gapLenKm = 0, overhangLenKm = 0;
  if (referenceLenKm != null) {
    const corridorIval: Ival[] = [[refFrom!, refTo!]];
    // Explained coverage = working reaches. (Exclusions inside reaches are
    // explained by definition; a no-scope/withdrawn segment OUTSIDE any reach
    // also explains corridor coverage — e.g. corridor 0–3.7 with reach 0–2.1 +
    // 2.4–3.7 and a no-scope record 2.1–2.4.)
    const explained = normIvals([
      ...reachUnion,
      ...segs.filter(s => s.segmentType !== "working_reach").map(s => [s.chainageFrom, s.chainageTo] as Ival),
    ]);
    const unexplained = subtractIvals(corridorIval, explained);
    unexplained.forEach(([f, t]) => gaps.push({ from: +f.toFixed(3), to: +t.toFixed(3) }));
    gapLenKm = +ivalLen(unexplained).toFixed(6);
    overhangLenKm = +ivalLen(subtractIvals(reachUnion, corridorIval)).toFixed(6);
    if (gapLenKm > SCOPE_CH_EPS)
      issues.push(`Unexplained gap of ${gapLenKm.toFixed(3)} km inside the reference corridor (${gaps.map(g => `Km ${g.from}–${g.to}`).join(", ")}). Add a working reach or record why it is out of scope.`);
    if (overhangLenKm > SCOPE_CH_EPS)
      issues.push(`Working reaches extend ${overhangLenKm.toFixed(3)} km beyond the reference corridor — confirm the true corridor end chainage.`);
  }
  for (const c of conflicts) issues.push(c.detail);
  if (reaches.length === 0) issues.push("No working reaches defined yet — add at least one reach where the contractor must work.");

  return {
    referenceLenKm,
    grossReachLenKm,
    executableSideLenKm: scope.eligibleSideLenKm,
    excludedSideLenKm: scope.excludedSideLenKm,
    withdrawnSideLenKm: scope.withdrawnSideLenKm,
    blockedSideLenKm: scope.blockedSideLenKm,
    gapLenKm, gaps, conflicts, overhangLenKm,
    reconciles: issues.length === 0,
    issues,
  };
}

// ─── Lightweight DPR scope validation (Part N) ───────────────────────────────

export type DprScopeStatus = "ok" | "temporary_block" | "no_scope" | "withdrawn" | "unknown";

export interface DprScopeCheck {
  status: DprScopeStatus;
  message: string | null;
  /** Segment that triggered the strongest finding, when identifiable. */
  segmentId: number | null;
  /** Withdrawal effective date (for the message / before-date allowance). */
  effectiveFrom: string | null;
}

/**
 * Classify a DPR progress row's chainage range against confirmed scope.
 * Severity: withdrawn/no_scope (block pending review) > temporary_block
 * (warn, needs reason) > ok. Rows before a withdrawal's effective date pass.
 * When the project has no confirmed working reaches at all, scope setup is
 * not in use → always "ok" (no behaviour change for existing projects).
 */
export function evaluateDprScope(
  segments: ScopeSegmentLike[],
  row: {
    boqItemId?: number | null;
    categoryId?: number | null;
    isLinear: boolean;
    side?: string | null;
    chainageFromKm: number | null;
    chainageToKm: number | null;
    dprDate?: string | null;
  },
): DprScopeCheck {
  const segs = confirmedOnly(segments, false);
  if (!segs.some(s => s.segmentType === "working_reach"))
    return { status: "ok", message: null, segmentId: null, effectiveFrom: null };
  if (row.chainageFromKm == null || row.chainageToKm == null)
    return { status: "ok", message: null, segmentId: null, effectiveFrom: null };

  const q: ScopeItemQuery = {
    boqItemId: row.boqItemId, categoryId: row.categoryId,
    isLinear: row.isLinear, onDate: row.dprDate,
  };
  const rowIval: Ival[] = [[Math.min(row.chainageFromKm, row.chainageToKm), Math.max(row.chainageFromKm, row.chainageToKm)]];
  const rowCorridors = corridorsForSide(row.side);

  const overlapsRow = (s: ScopeSegmentLike): boolean => {
    if (intersectIvals(rowIval, [[s.chainageFrom, s.chainageTo]]).length === 0) return false;
    // side-aware: LHS row vs RHS-only segment is not a hit
    const segCorridors = corridorsForSide(s.side);
    return rowCorridors.some(c => segCorridors.includes(c));
  };

  // 1. Withdrawn — strongest. Respect effective date: work dated before the
  //    withdrawal remains valid history (Part N #4).
  for (const s of segs.filter(x => x.segmentType === "withdrawn")) {
    if (!segmentAppliesToItem(s, q) || !overlapsRow(s)) continue;
    const eff = s.effectiveFrom ?? null;
    if (eff && row.dprDate && Date.parse(row.dprDate) < Date.parse(eff)) continue;
    return {
      status: "withdrawn",
      message: `This chainage was withdrawn from scope effective ${eff ?? "(date not recorded)"}${s.reason ? ` — ${s.reason}` : ""}.`,
      segmentId: s.id ?? null, effectiveFrom: eff,
    };
  }
  // 2. Permanent no-scope.
  for (const s of segs.filter(x => x.segmentType === "no_scope")) {
    if (!segmentAppliesToItem(s, q) || !overlapsRow(s)) continue;
    return {
      status: "no_scope",
      message: `This chainage is outside the executable scope for this BOQ item${s.reason ? ` (${s.reason})` : ""}.`,
      segmentId: s.id ?? null, effectiveFrom: null,
    };
  }
  // 3. Temporary block — warn, allow with reason.
  for (const s of segs.filter(x => x.segmentType === "temporary_block")) {
    if (!segmentAppliesToItem(s, q) || !segmentActiveOnDate(s, row.dprDate) || !overlapsRow(s)) continue;
    return {
      status: "temporary_block",
      message: `This chainage is currently marked as temporarily blocked${s.reason ? ` (${s.reason})` : ""}.`,
      segmentId: s.id ?? null, effectiveFrom: s.effectiveFrom ?? null,
    };
  }
  // 4. Outside every confirmed working reach — working reaches define WHERE
  //    work is allowed; a gap in a discontinuous-reach project is NOT
  //    executable even without an explicit no-scope record (Part B).
  //    Side-aware: the row's corridors must each be fully covered by reaches
  //    that include that corridor.
  const reachSegs = segs.filter(x => x.segmentType === "working_reach");
  for (const c of rowCorridors) {
    const cover = reachSegs
      .filter(s => corridorsForSide(s.side).includes(c))
      .map(s => [s.chainageFrom, s.chainageTo] as Ival);
    const uncovered = subtractIvals(rowIval, cover);
    if (uncovered.length > 0) {
      return {
        status: "no_scope",
        message: `This chainage (Km ${uncovered[0][0].toFixed(3)}–${uncovered[0][1].toFixed(3)}${c === "lhs" || c === "rhs" ? ` ${c.toUpperCase()}` : ""}) is outside every confirmed working reach.`,
        segmentId: null, effectiveFrom: null,
      };
    }
  }
  return { status: "ok", message: null, segmentId: null, effectiveFrom: null };
}
