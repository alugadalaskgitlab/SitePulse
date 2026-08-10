/**
 * shared/chainageOverlap.ts — Batch 06B: the ONE neutral road-chainage
 * overlap definition, shared by:
 *  - Progress Report (shared/progressReport.ts re-imports side/interval rules)
 *  - Guided DPR entry (client warning)
 *  - Detailed DPR / SiteEntry + SiteEdit (client warning)
 *  - server Final Submit recheck (POST /api/dprs non-draft, POST /api/dprs/:id/submit)
 *
 * SEMANTICS (extracted verbatim from Batch 06 progressReport — behavior
 * unchanged):
 *  - Sides: LHS/RHS/Median/Centre are distinct corridors; Both Sides /
 *    Full Width may overlap anything; unknown/unspecified side is
 *    conservative (may overlap anything).
 *  - Ranges: reversed endpoints canonicalised min/max; adjacent/touching
 *    ranges are NOT overlap; intersections ≤ KM_EPS are suppressed.
 *  - Overlap is ADVISORY ("possible overlap"), never "duplicate", and never
 *    changes any quantity/cumulative.
 *
 * Batch 06B adds DPR-entry helpers on top: per-row overlap hits (exact vs
 * partial, same-DPR vs prior-DPR) and the Final-Submit readiness rule
 * "real overlap requires a chainageOverrideReason". Draft saves never call
 * the readiness rule.
 */

export const KM_EPS = 1e-6;

export type SideNorm = string; // normalised side token or raw lowercase

export function normaliseReportSide(raw: string | null | undefined): SideNorm | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (s === "lhs" || s === "left" || s === "l") return "lhs";
  if (s === "rhs" || s === "right" || s === "r") return "rhs";
  if (s.includes("both")) return "both_sides";
  if (s.includes("full")) return "full_width";
  if (s.includes("median")) return "median";
  return s.replace(/\s+/g, "_");
}

/** Sides can spatially overlap unless they are distinct specific corridors. */
export function sidesMayOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliseReportSide(a);
  const nb = normaliseReportSide(b);
  // Unknown side = conservative: could be anywhere on the corridor.
  if (na == null || nb == null) return true;
  if (na === nb) return true;
  if (na === "both_sides" || na === "full_width" || nb === "both_sides" || nb === "full_width") return true;
  return false; // distinct specific corridors (lhs vs rhs, median vs lhs, …)
}

/** Canonicalise a km pair. Null when either endpoint is missing/non-finite. */
export function normaliseKmRange(from: number | null | undefined, to: number | null | undefined): { from: number; to: number } | null {
  if (from == null || to == null) return null;
  const f = Number(from), t = Number(to);
  if (!Number.isFinite(f) || !Number.isFinite(t)) return null;
  return { from: Math.min(f, t), to: Math.max(f, t) };
}

/**
 * Strict interval intersection. Adjacent/touching ranges return null.
 * Inputs may be reversed; zero/near-zero-length ranges never intersect.
 */
export function overlapSegment(
  aFrom: number, aTo: number, bFrom: number, bTo: number,
): { from: number; to: number } | null {
  const a = normaliseKmRange(aFrom, aTo);
  const b = normaliseKmRange(bFrom, bTo);
  if (!a || !b) return null;
  if (a.to - a.from <= KM_EPS || b.to - b.from <= KM_EPS) return null;
  const from = Math.max(a.from, b.from);
  const to = Math.min(a.to, b.to);
  if (to - from <= KM_EPS) return null; // adjacent, not overlapping
  return { from, to };
}

// ── Batch 06B: DPR-entry overlap checking ────────────────────────────────────

/** A chainage-based progress row being entered/submitted right now. */
export type CandidateChainageRow = {
  /** stable key within the form/payload (e.g. array index) */
  rowKey: string | number;
  boqItemId: number | null | undefined;
  side: string | null | undefined;
  fromKm: number | null | undefined;
  toKm: number | null | undefined;
  chainageOverrideReason?: string | null;
  /** display label for readiness messages */
  label?: string | null;
  noSiteWork?: boolean | null;
};

/** Prior recorded progress (a submitted DPR row, canonical valid filter). */
export type PriorChainageEntry = {
  entryId: number;
  dprId: number;
  /** YYYY-MM-DD */
  dprDate: string | null;
  boqItemId: number;
  side: string | null;
  fromKm: number | null;
  toKm: number | null;
  quantity: number | null;
  uom: string | null;
};

export type ChainageOverlapHit = {
  /** exact = same item + same normalised side + same From/To (within EPS) */
  kind: "exact" | "partial";
  source: "same_dpr" | "prior_dpr";
  segmentFromKm: number;
  segmentToKm: number;
  /** prior-DPR reference (null for same-DPR hits) */
  withDprId: number | null;
  withDprDate: string | null;
  withEntryId: number | null;
  /** the other row's key for same-DPR hits */
  withRowKey: string | number | null;
  withSide: string | null;
  withFromKm: number | null;
  withToKm: number | null;
  withQuantity: number | null;
  withUom: string | null;
};

/** True when the row participates in the overlap guard at all (§3 scope). */
export function isChainageGuardRow(row: CandidateChainageRow): boolean {
  if (row.noSiteWork) return false;
  if (row.boqItemId == null) return false;
  return normaliseKmRange(row.fromKm, row.toKm) != null;
}

function exactSameRange(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return Math.abs(a.from - b.from) <= KM_EPS && Math.abs(a.to - b.to) <= KM_EPS;
}

function hitKind(
  a: { from: number; to: number }, aSide: string | null | undefined,
  b: { from: number; to: number }, bSide: string | null | undefined,
): "exact" | "partial" {
  return exactSameRange(a, b) && normaliseReportSide(aSide) === normaliseReportSide(bSide) ? "exact" : "partial";
}

/**
 * Compute overlap hits for every candidate row:
 *  - against the OTHER rows of the same payload (same-DPR / same session);
 *  - against prior submitted entries (caller supplies the canonical
 *    submitted/not-superseded/not-cancelled/not-deleted/not-review_required set,
 *    already excluding the DPR being edited).
 * Pure, order-independent, never mutates inputs.
 */
export function findChainageOverlaps(
  rows: CandidateChainageRow[],
  priors: PriorChainageEntry[],
): Map<string | number, ChainageOverlapHit[]> {
  const out = new Map<string | number, ChainageOverlapHit[]>();
  const add = (key: string | number, hit: ChainageOverlapHit) => {
    const list = out.get(key);
    if (list) list.push(hit); else out.set(key, [hit]);
  };
  const guarded = rows.filter(isChainageGuardRow).map((row) => ({ row, r: normaliseKmRange(row.fromKm, row.toKm)! }));

  // A — same DPR / same editing session (symmetric).
  for (let i = 0; i < guarded.length; i++) {
    for (let j = i + 1; j < guarded.length; j++) {
      const A = guarded[i], B = guarded[j];
      if (Number(A.row.boqItemId) !== Number(B.row.boqItemId)) continue;
      if (!sidesMayOverlap(A.row.side, B.row.side)) continue;
      const seg = overlapSegment(A.r.from, A.r.to, B.r.from, B.r.to);
      if (!seg) continue;
      const kind = hitKind(A.r, A.row.side, B.r, B.row.side);
      const base = { kind, source: "same_dpr" as const, segmentFromKm: seg.from, segmentToKm: seg.to, withDprId: null, withDprDate: null, withEntryId: null, withQuantity: null, withUom: null };
      add(A.row.rowKey, { ...base, withRowKey: B.row.rowKey, withSide: B.row.side ?? null, withFromKm: B.r.from, withToKm: B.r.to });
      add(B.row.rowKey, { ...base, withRowKey: A.row.rowKey, withSide: A.row.side ?? null, withFromKm: A.r.from, withToKm: A.r.to });
    }
  }

  // B — prior submitted DPR progress.
  for (const { row, r } of guarded) {
    for (const p of priors) {
      if (Number(p.boqItemId) !== Number(row.boqItemId)) continue;
      const pr = normaliseKmRange(p.fromKm, p.toKm);
      if (!pr) continue;
      if (!sidesMayOverlap(row.side, p.side)) continue;
      const seg = overlapSegment(r.from, r.to, pr.from, pr.to);
      if (!seg) continue;
      add(row.rowKey, {
        kind: hitKind(r, row.side, pr, p.side),
        source: "prior_dpr",
        segmentFromKm: seg.from,
        segmentToKm: seg.to,
        withDprId: p.dprId,
        withDprDate: p.dprDate ?? null,
        withEntryId: p.entryId,
        withRowKey: null,
        withSide: p.side ?? null,
        withFromKm: pr.from,
        withToKm: pr.to,
        withQuantity: p.quantity ?? null,
        withUom: p.uom ?? null,
      });
    }
  }
  return out;
}

export type ChainageOverlapIssue = {
  section: "activities";
  label: string;
  message: string;
  rowKey: string | number;
};

const hasReason = (v: unknown): boolean => typeof v === "string" && v.trim() !== "";

/**
 * Final-Submit rule (§9): any real overlap (same-DPR or prior-DPR) on a row
 * without a chainageOverrideReason is a MANDATORY readiness issue. Overlap
 * with a reason is allowed. Drafts must never call this.
 */
export function chainageOverlapReadinessIssues(
  rows: CandidateChainageRow[],
  priors: PriorChainageEntry[],
): ChainageOverlapIssue[] {
  const hits = findChainageOverlaps(rows, priors);
  const issues: ChainageOverlapIssue[] = [];
  for (const row of rows) {
    const rowHits = hits.get(row.rowKey);
    if (!rowHits || rowHits.length === 0) continue;
    if (hasReason(row.chainageOverrideReason)) continue;
    const label = (row.label ?? `BOQ item ${row.boqItemId}`).toString().trim() || `BOQ item ${row.boqItemId}`;
    issues.push({
      section: "activities",
      label,
      message: "Possible chainage overlap requires a reason before submission.",
      rowKey: row.rowKey,
    });
  }
  return issues;
}
