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
  /**
   * 06P: optional physical layer/lift number. When BOTH rows of a candidate
   * pair have a non-null layerNo and the values DIFFER, the pair is not an
   * overlap. null is never treated as equal to or different from any layer —
   * it simply falls back to the pre-06P rule.
   */
  layerNo?: number | null;
  /**
   * 06V: incidental rows are excluded from the chainage overlap guard entirely.
   * They may physically span the same chainage as normal work — that is
   * intentional. isChainageGuardRow returns false when this is true.
   */
  isIncidental?: boolean | null;
};

export type ChainageComparableRow = Pick<
  CandidateChainageRow,
  "boqItemId" | "side" | "fromKm" | "toKm" | "noSiteWork" | "layerNo" | "isIncidental"
>;

export type ChainagePairOverlap = {
  kind: "exact" | "partial";
  segmentFromKm: number;
  segmentToKm: number;
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
  /** 06P: optional layer/lift number of the prior entry (null = legacy/unset). */
  layerNo?: number | null;
  /** 06V: incidental prior entries are excluded from the overlap guard. */
  isIncidental?: boolean | null;
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
export function isChainageGuardRow(row: ChainageComparableRow): boolean {
  if (row.noSiteWork) return false;
  if (row.isIncidental) return false; // 06V: incidental rows are out of scope
  if (row.boqItemId == null) return false;
  return normaliseKmRange(row.fromKm, row.toKm) != null;
}

/**
 * 06P layer pre-check: a candidate pair is exempt from overlap comparison
 * ONLY when both layer numbers are non-null integers AND differ. Any null
 * (legacy rows, blank field) falls back to today's rule — null is never
 * coerced to 1 and never compared against a specific layer.
 */
export function layersDistinct(a: number | null | undefined, b: number | null | undefined): boolean {
  return a != null && b != null && Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) !== Number(b);
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
 * The canonical pair comparator used by DPR entry, server submit/version
 * validation, Progress Report badges/review, and coverage strips.
 */
export function compareChainageRows(
  a: ChainageComparableRow,
  b: ChainageComparableRow,
): ChainagePairOverlap | null {
  if (!isChainageGuardRow(a) || !isChainageGuardRow(b)) return null;
  if (Number(a.boqItemId) !== Number(b.boqItemId)) return null;
  if (layersDistinct(a.layerNo, b.layerNo)) return null;
  if (!sidesMayOverlap(a.side, b.side)) return null;
  const ar = normaliseKmRange(a.fromKm, a.toKm);
  const br = normaliseKmRange(b.fromKm, b.toKm);
  if (!ar || !br) return null;
  const segment = overlapSegment(ar.from, ar.to, br.from, br.to);
  if (!segment) return null;
  return {
    kind: hitKind(ar, a.side, br, b.side),
    segmentFromKm: segment.from,
    segmentToKm: segment.to,
  };
}

const sameNullableNumber = (
  a: number | null | undefined,
  b: number | null | undefined,
): boolean => {
  if (a == null || b == null) return a == null && b == null;
  return Number.isFinite(Number(a)) &&
    Number.isFinite(Number(b)) &&
    Math.abs(Number(a) - Number(b)) <= KM_EPS;
};

/**
 * Compare only facts that can change whether a progress row participates in
 * the chainage-overlap guard. Quantity, remarks, equipment and other DPR facts
 * deliberately do not affect this identity.
 */
export function chainageClaimUnchanged(
  current: ChainageComparableRow,
  persisted: ChainageComparableRow,
): boolean {
  const currentRange = normaliseKmRange(current.fromKm, current.toKm);
  const persistedRange = normaliseKmRange(persisted.fromKm, persisted.toKm);
  const rangesEqual =
    currentRange == null || persistedRange == null
      ? currentRange == null && persistedRange == null
      : sameNullableNumber(currentRange.from, persistedRange.from) &&
        sameNullableNumber(currentRange.to, persistedRange.to);
  const currentLayer = current.layerNo == null ? null : Number(current.layerNo);
  const persistedLayer = persisted.layerNo == null ? null : Number(persisted.layerNo);
  return Number(current.boqItemId) === Number(persisted.boqItemId) &&
    normaliseReportSide(current.side) === normaliseReportSide(persisted.side) &&
    rangesEqual &&
    sameNullableNumber(currentLayer, persistedLayer) &&
    !!current.noSiteWork === !!persisted.noSiteWork &&
    !!current.isIncidental === !!persisted.isIncidental;
}

/**
 * Multiset match for submitted-version edits. It handles legacy rows without a
 * stable entry key while ensuring an added duplicate claim is still treated as
 * new once the persisted matching count is exhausted.
 */
export function unchangedChainageRowKeys(
  current: CandidateChainageRow[],
  persisted: ChainageComparableRow[],
): Set<string | number> {
  const used = new Set<number>();
  const unchanged = new Set<string | number>();
  for (const row of current) {
    const matchIndex = persisted.findIndex(
      (prior, index) => !used.has(index) && chainageClaimUnchanged(row, prior),
    );
    if (matchIndex < 0) continue;
    used.add(matchIndex);
    unchanged.add(row.rowKey);
  }
  return unchanged;
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
      const pair = compareChainageRows(A.row, B.row);
      if (!pair) continue;
      const base = { kind: pair.kind, source: "same_dpr" as const, segmentFromKm: pair.segmentFromKm, segmentToKm: pair.segmentToKm, withDprId: null, withDprDate: null, withEntryId: null, withQuantity: null, withUom: null };
      add(A.row.rowKey, { ...base, withRowKey: B.row.rowKey, withSide: B.row.side ?? null, withFromKm: B.r.from, withToKm: B.r.to });
      add(B.row.rowKey, { ...base, withRowKey: A.row.rowKey, withSide: A.row.side ?? null, withFromKm: A.r.from, withToKm: A.r.to });
    }
  }

  // B — prior submitted DPR progress.
  for (const { row, r } of guarded) {
    for (const p of priors) {
      const pr = normaliseKmRange(p.fromKm, p.toKm);
      if (!pr) continue;
      const pair = compareChainageRows(row, p);
      if (!pair) continue;
      add(row.rowKey, {
        kind: pair.kind,
        source: "prior_dpr",
        segmentFromKm: pair.segmentFromKm,
        segmentToKm: pair.segmentToKm,
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
  options?: { exemptRowKeys?: ReadonlySet<string | number> },
): ChainageOverlapIssue[] {
  const hits = findChainageOverlaps(rows, priors);
  const issues: ChainageOverlapIssue[] = [];
  for (const row of rows) {
    if (options?.exemptRowKeys?.has(row.rowKey)) continue;
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
