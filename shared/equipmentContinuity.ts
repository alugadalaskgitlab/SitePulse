// INSTRUCTION 06Q — Equipment opening-reading continuity.
//
// One canonical cross-source resolver decides "the latest prior valid
// closing reading" for a piece of equipment (Equipment Master id is the
// identity). Two sources can hold closings:
//
//   - plant_usage : equipment_usage rows (Plant module)
//   - dpr_log     : equipment_logs rows joined to their DPR (Site module)
//
// The SQL side (server/storage.ts resolveLatestPriorClosing) picks the best
// candidate per source with a deterministic ORDER BY:
//
//   equipment_usage : date DESC, created_at DESC NULLS LAST, id DESC
//   equipment_logs  : dprs.date DESC, equipment_logs.id DESC
//                     (equipment_logs has no timestamp column; serial id is
//                      the deterministic insert-order fallback — no schema
//                      change allowed for 06Q)
//
// This module holds the PURE cross-source comparison so it is unit-testable:
// given the best candidate from each source, pick the single winner.
//
// Rules (06Q):
//   - null closings are filtered out upstream (never candidates);
//   - zero is a VALID closing reading;
//   - later business date wins;
//   - same date, same physical event (the DPR log closed that exact plant
//     usage row via plantUsageId) → one event, not two; the plant_usage row
//     is returned (values are identical by construction);
//   - same date, distinct events → there is no shared clock across the two
//     sources, but meter readings are monotonic, so the HIGHER closing is
//     by definition the later one; exact tie → plant_usage (it carries a
//     created_at audit timestamp and is the operationally authoritative
//     source).

export interface ClosingCandidate {
  source: "plant_usage" | "dpr_log";
  /** Business date (YYYY-MM-DD): equipment_usage.date or dprs.date */
  date: string;
  /** Non-null closing reading. Zero is valid. */
  closingReading: number;
  /** Primary key of the source row. */
  recordId: number;
  /** For dpr_log candidates: the equipment_usage row this log closed, if linked. */
  plantUsageId?: number | null;
}

export interface ResolvedClosing {
  closingReading: number;
  sourceDate: string;
  source: "plant_usage" | "dpr_log";
  recordId: number;
}

export function pickLatestClosing(
  plantCandidate: ClosingCandidate | null | undefined,
  dprCandidate: ClosingCandidate | null | undefined,
): ResolvedClosing | null {
  const toResolved = (c: ClosingCandidate): ResolvedClosing => ({
    closingReading: c.closingReading,
    sourceDate: c.date,
    source: c.source,
    recordId: c.recordId,
  });
  if (!plantCandidate && !dprCandidate) return null;
  if (!plantCandidate) return toResolved(dprCandidate!);
  if (!dprCandidate) return toResolved(plantCandidate);

  // Later business date wins.
  if (plantCandidate.date > dprCandidate.date) return toResolved(plantCandidate);
  if (dprCandidate.date > plantCandidate.date) return toResolved(dprCandidate);

  // Same date. Same physical event? (DPR log closed this exact usage row —
  // the mirrored pair must never be treated as two separate historical events.)
  if (
    dprCandidate.plantUsageId != null &&
    dprCandidate.plantUsageId === plantCandidate.recordId
  ) {
    return toResolved(plantCandidate);
  }

  // Same date, distinct events: meter monotonicity — the higher closing is
  // the later one. Exact tie → plant_usage.
  return dprCandidate.closingReading > plantCandidate.closingReading
    ? toResolved(dprCandidate)
    : toResolved(plantCandidate);
}
