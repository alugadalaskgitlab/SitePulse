// ─────────────────────────────────────────────────────────────────────────────
// Auto Sequence ↔ Project Scope bridge (Scope edit-fix batch, Part B)
//
// Pure helpers that turn CONFIRMED Project Scope records into Auto-Sequence
// stretch rows, list the non-executable constraints, and fingerprint the
// confirmed scope so the UI can warn when the scope changed after the
// stretches were loaded.
//
// Rules:
// - Only CONFIRMED working_reach records become stretch rows. Drafts and
//   superseded revisions never load.
// - No-scope / temporary-block / withdrawn records are CONSTRAINTS — they are
//   never split into rows here; the eligibility engine (shared/projectScope.ts
//   via the sequencer's scopeCoverage hook) clips quantities automatically.
// - These helpers never write anything back to Project Scope.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScopeSegmentRecordLike {
  id: number;
  segmentType: string;               // working_reach | no_scope | temporary_block | withdrawn
  status?: string | null;            // draft | confirmed | superseded
  label?: string | null;
  chainageFrom: number | string;
  chainageTo: number | string;
  side?: string | null;
  reason?: string | null;
  effectiveFrom?: string | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

/** Stretch row produced from a confirmed working reach (UI-agnostic shape). */
export interface ScopeStretchRow {
  label: string;
  chainageFrom: number;
  chainageTo: number;
  side: string | null;   // passed through when the reach is one-sided
  priority: number;      // stage = row order (1-based, sorted by chainage)
}

const isConfirmed = (s: ScopeSegmentRecordLike) => (s.status ?? "confirmed") === "confirmed";
const num = (v: number | string) => Number(v);

/** Confirmed working reaches, sorted by chainage. */
export function confirmedWorkingReaches(segments: ScopeSegmentRecordLike[]): ScopeSegmentRecordLike[] {
  return segments
    .filter(s => s.segmentType === "working_reach" && isConfirmed(s))
    .sort((a, b) => num(a.chainageFrom) - num(b.chainageFrom) || num(a.chainageTo) - num(b.chainageTo));
}

/**
 * Map confirmed working reaches → editable stretch rows.
 * One reach = ONE row (never auto-split at no-scope boundaries — exclusions
 * are applied by the eligibility engine during allocation, not by splitting
 * the planner's rows). Stage = row order; front/qty%/width left blank.
 */
export function scopeReachesToStretchRows(segments: ScopeSegmentRecordLike[]): ScopeStretchRow[] {
  return confirmedWorkingReaches(segments).map((s, i) => ({
    label: (s.label && s.label.trim()) ? s.label.trim() : `Reach ${i + 1}`,
    chainageFrom: num(s.chainageFrom),
    chainageTo: num(s.chainageTo),
    side: s.side ?? null,
    priority: i + 1,
  }));
}

export interface ScopeConstraint {
  id: number;
  segmentType: string;               // no_scope | temporary_block | withdrawn
  chainageFrom: number;
  chainageTo: number;
  side: string | null;
  reason: string | null;
  effectiveFrom: string | null;
  /** Temporary blocks are withheld, not permanently removed. */
  temporary: boolean;
}

/** Confirmed non-executable scope records, for read-only display. */
export function scopeConstraints(segments: ScopeSegmentRecordLike[]): ScopeConstraint[] {
  return segments
    .filter(s => s.segmentType !== "working_reach" && isConfirmed(s))
    .sort((a, b) => num(a.chainageFrom) - num(b.chainageFrom))
    .map(s => ({
      id: s.id,
      segmentType: s.segmentType,
      chainageFrom: num(s.chainageFrom),
      chainageTo: num(s.chainageTo),
      side: s.side ?? null,
      reason: s.reason ?? null,
      effectiveFrom: s.effectiveFrom ?? null,
      temporary: s.segmentType === "temporary_block",
    }));
}

/**
 * Stable fingerprint of the CONFIRMED scope (all types — a new no-scope
 * record changes eligibility even though no reach changed). Any difference
 * between the stored and current fingerprint means the confirmed Project
 * Scope changed since the stretches were loaded.
 */
export function scopeFingerprint(segments: ScopeSegmentRecordLike[]): string {
  const parts = segments
    .filter(isConfirmed)
    .map(s => `${s.id}:${s.segmentType}:${num(s.chainageFrom)}-${num(s.chainageTo)}:${s.side ?? ""}:${s.effectiveFrom ?? ""}`)
    .sort();
  return parts.join("|");
}
