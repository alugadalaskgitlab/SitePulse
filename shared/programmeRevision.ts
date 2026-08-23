/**
 * Instruction 06W — Schedule Revision Planner (pure shared rules).
 *
 * Exports:
 *  - BarExecutionState type and classifyBarExecutionState()
 *  - planScheduleRevision() — revision + optional cascade
 *  - deriveItemStatus() — five-state item status from bars + evidence
 *  - Revision history TypeScript types (ScheduleRevisionRecord, CascadeShiftRecord)
 *
 * Pure: no IO, no mutation of inputs.
 */

import { chainageRangesOverlap } from "./arrangementAutoAllocation";
import { monthIndexToDateCal, displayFinishDateCal, toYmd, ymdIsValid, daysBetween } from "./calendarAxis";

// ─── Legacy calendar-date normalisation ──────────────────────────────────────

export type BarCalendarNormalisation =
  | { action: "skip"; reason: string }
  | { action: "fill"; startDate: string; endDate: string };

const toIsoDate = (d: Date): string => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, "0"),
  String(d.getDate()).padStart(2, "0"),
].join("-");

/** Strict Gregorian check: "2026-02-31" must fail, not silently roll over. */
const isRealYmd = (x: { y: number; m: number; d: number }): boolean => {
  if (!ymdIsValid(x)) return false;
  const dt = new Date(Date.UTC(x.y, x.m - 1, x.d));
  return dt.getUTCFullYear() === x.y && dt.getUTCMonth() === x.m - 1 && dt.getUTCDate() === x.d;
};

/**
 * Derive the missing persisted calendar dates for a legacy programme bar from
 * its month indexes, using the SAME canonical calendar-axis conversion the
 * Gantt already displays (monthIndexToDateCal / displayFinishDateCal). Pure
 * normalisation of the schedule the user already sees — never a reschedule.
 *
 * Safety contract:
 *  - never overwrites a non-null startDate/endDate (partial fills keep the
 *    existing value and only derive the missing one);
 *  - refuses (skip + reason) when the project start date is missing/invalid,
 *    the month indexes are non-finite/invalid, or the derived range would be
 *    inverted — an unresolvable bar is reported, never guessed.
 */
export function deriveMissingBarCalendarDates(
  bar: {
    startMonth: number | null | undefined;
    endMonth: number | null | undefined;
    startDate: string | null | undefined;
    endDate: string | null | undefined;
  },
  projectStartDate: string | null | undefined,
): BarCalendarNormalisation {
  const hasStart = Boolean(bar.startDate);
  const hasEnd = Boolean(bar.endDate);
  if (hasStart && hasEnd) {
    return { action: "skip", reason: "already has committed calendar dates" };
  }
  if (!projectStartDate || !isRealYmd(toYmd(projectStartDate))) {
    return { action: "skip", reason: "project has no valid start date" };
  }
  const startMonth = Number(bar.startMonth);
  const endMonth = Number(bar.endMonth);
  if (!Number.isFinite(startMonth) || startMonth <= 0) {
    return { action: "skip", reason: `invalid start month index (${bar.startMonth})` };
  }
  if (!Number.isFinite(endMonth) || endMonth < startMonth) {
    return { action: "skip", reason: `invalid end month index (${bar.endMonth})` };
  }
  const startDate = bar.startDate
    ?? toIsoDate(monthIndexToDateCal(startMonth, projectStartDate));
  const endDate = bar.endDate
    ?? toIsoDate(displayFinishDateCal(endMonth, projectStartDate, startMonth));
  const s = toYmd(startDate);
  const e = toYmd(endDate);
  if (!isRealYmd(s) || !isRealYmd(e)) {
    return { action: "skip", reason: "derived date is invalid" };
  }
  // A partially-persisted bar can disagree with its month indexes; an
  // inverted range must be resolved by a human, not guessed.
  if (daysBetween(s, e) < 0) {
    return { action: "skip", reason: `derived range is inverted (${startDate} → ${endDate})` };
  }
  return { action: "fill", startDate, endDate };
}

// ─── Bar Execution State ──────────────────────────────────────────────────────

export type BarExecutionState = "not_started" | "started" | "completed";

export interface BarEvidence {
  reportedQty: number;
  earliestProgressDate: string | null; // YYYY-MM-DD or null
}

/** Preserve an already-captured baseline; otherwise capture the first date. */
export function captureInitialBaseline(
  existingBaseline: string | null | undefined,
  firstCommittedDate: string | null | undefined,
): string | null {
  return existingBaseline ?? firstCommittedDate ?? null;
}

/** Append without mutating or replacing an existing audit trail. */
export function appendRevisionHistory<T>(
  history: unknown,
  entry: T,
): Array<unknown | T> {
  return [...(Array.isArray(history) ? history : []), entry];
}

/**
 * Auto-sequence ownership rule. A deliberate schedule revision makes manual
 * authoritative even when the bar still carries a legacy auto-style label.
 */
export function isAutoSequenceManagedBar(input: {
  source: string | null | undefined;
  revisionHistory: unknown;
  legacyAutoLabel: boolean;
}): boolean {
  if (input.source === "auto-sequence" || !input.source) return true;
  if (input.source !== "manual" || !input.legacyAutoLabel) return false;
  return !(Array.isArray(input.revisionHistory)
    && input.revisionHistory.some((entry: any) => entry?.type === "schedule_revision"));
}

/**
 * Classify a single programme bar given its plannedQty and current evidence.
 * Rules:
 *  - Any positive reportedQty OR an earliestProgressDate → at least "started"
 *  - reportedQty >= plannedQty (for positive plannedQty) → "completed"
 *  - Otherwise "not_started"
 */
export function classifyBarExecutionState(
  plannedQty: number,
  evidence: BarEvidence | null | undefined,
): BarExecutionState {
  if (!evidence) return "not_started";
  const { reportedQty, earliestProgressDate } = evidence;
  const hasEvidence = (typeof reportedQty === "number" && reportedQty > 0) || !!earliestProgressDate;
  if (!hasEvidence) return "not_started";
  // Completed: reported has reached or exceeded the planned qty (only for positive plannedQty)
  if (plannedQty > 0 && reportedQty >= plannedQty) return "completed";
  return "started";
}

// ─── Revision Planner ────────────────────────────────────────────────────────

export interface RevisionBar {
  id: number;
  boqProjectId: number;
  boqItemId: number;
  chainageFrom: number | null;
  chainageTo: number | null;
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  plannedQty: number;
}

export interface RevisionResult {
  /** The revised source bar (new dates applied). */
  revisedSource: RevisionBar;
  /** Calendar-day delta applied to not_started successors (new finish − old finish). */
  delta: number;
  /** Successor bars that were shifted (not_started only, cascade on). */
  shifted: RevisionBar[];
  /** Successor bars that could not be shifted (started/completed, or cascade off). */
  notShifted: Array<{ bar: RevisionBar; reason: string }>;
}

/** Add `days` calendar days to a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD to a UTC epoch (ms) for comparison. */
function parseDate(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getTime();
}

export interface PlanScheduleRevisionOptions {
  /** The bar being revised. */
  sourceBar: RevisionBar;
  /** All bars in the same project (including the source bar itself — it is excluded internally). */
  allProjectBars: RevisionBar[];
  /** Evidence keyed by bar id. */
  evidenceMap: Map<number, BarEvidence>;
  /** Requested new start date (YYYY-MM-DD). For started bars, this will be overridden by evidence. */
  requestedStart: string;
  /** Requested new end date (YYYY-MM-DD). */
  requestedEnd: string;
  /** When false, only the source bar is changed; successors are listed in notShifted. */
  cascade: boolean;
}

/**
 * Plan a schedule revision for a source bar with optional cascade to overlapping successors.
 *
 * Source rules:
 *  - completed → rejects (throws)
 *  - started → effective start is locked to the earliest evidence date; only finish is moveable
 *  - not_started → both start and finish can be changed
 *
 * Successor rules (cascade on):
 *  - Candidates: chainage-overlapping bars whose current startDate >= source bar's PRE-REVISION endDate
 *  - not_started successors: shift startDate and endDate by delta (calendar days)
 *  - started/completed successors: stay fixed, added to notShifted with reason
 *
 * No mutation of inputs.
 */
export function planScheduleRevision(opts: PlanScheduleRevisionOptions): RevisionResult {
  const { sourceBar, allProjectBars, evidenceMap, requestedStart, requestedEnd, cascade } = opts;

  // Classify source bar
  const sourceEvidence = evidenceMap.get(sourceBar.id) ?? null;
  const sourceState = classifyBarExecutionState(sourceBar.plannedQty, sourceEvidence);

  if (sourceState === "completed") {
    throw new Error("Cannot revise a completed bar.");
  }

  // Determine effective start
  let effectiveStart: string;
  if (sourceState === "started") {
    // Lock effective start to earliest valid progress date
    const earliest = sourceEvidence?.earliestProgressDate ?? null;
    effectiveStart = earliest ?? sourceBar.startDate;
  } else {
    effectiveStart = requestedStart;
  }

  // Validate date order
  if (parseDate(effectiveStart) > parseDate(requestedEnd)) {
    throw new Error("Revised start date must not be after revised end date.");
  }

  // Compute delta: new finish − old finish (calendar days)
  const oldFinishMs = parseDate(sourceBar.endDate);
  const newFinishMs = parseDate(requestedEnd);
  const delta = Math.round((newFinishMs - oldFinishMs) / (1000 * 60 * 60 * 24));

  const revisedSource: RevisionBar = {
    ...sourceBar,
    startDate: effectiveStart,
    endDate: requestedEnd,
  };

  // Cascade: find candidate successors
  const preRevisionEndDate = sourceBar.endDate;

  const shifted: RevisionBar[] = [];
  const notShifted: Array<{ bar: RevisionBar; reason: string }> = [];

  if (cascade) {
    // One-pass across all candidates
    for (const bar of allProjectBars) {
      if (bar.id === sourceBar.id) continue;

      // Must chainage-overlap with the source bar
      if (!chainageRangesOverlap(
        sourceBar.chainageFrom, sourceBar.chainageTo,
        bar.chainageFrom, bar.chainageTo,
      )) continue;

      // Must start on or after the source bar's PRE-REVISION end date
      if (parseDate(bar.startDate) < parseDate(preRevisionEndDate)) continue;

      const barEvidence = evidenceMap.get(bar.id) ?? null;
      const barState = classifyBarExecutionState(bar.plannedQty, barEvidence);

      if (barState === "not_started") {
        shifted.push({
          ...bar,
          startDate: addDays(bar.startDate, delta),
          endDate: addDays(bar.endDate, delta),
        });
      } else {
        const reason =
          barState === "completed"
            ? "Bar is completed; schedule cannot be shifted automatically."
            : "Bar has started; schedule cannot be shifted automatically.";
        notShifted.push({ bar, reason });
      }
    }
  } else {
    // Cascade off: all overlapping successors go to notShifted
    for (const bar of allProjectBars) {
      if (bar.id === sourceBar.id) continue;

      if (!chainageRangesOverlap(
        sourceBar.chainageFrom, sourceBar.chainageTo,
        bar.chainageFrom, bar.chainageTo,
      )) continue;

      if (parseDate(bar.startDate) < parseDate(preRevisionEndDate)) continue;

      notShifted.push({ bar, reason: "Cascade is disabled; successor not shifted." });
    }
  }

  return { revisedSource, delta, shifted, notShifted };
}

// ─── Item Status Derivation ───────────────────────────────────────────────────

export type ItemStatus = "not_programmed" | "planned" | "in_progress" | "delayed" | "completed";

/**
 * Derive the five-state item status from the active scheduled bars, evidence, and today's date.
 *
 * Rules:
 *  - not_programmed: no non-placeholder scheduled bars
 *  - completed: all active bars are completed
 *  - delayed: any bar is incomplete AND any bar's current endDate < today
 *  - in_progress: any bar is started OR today is inside any bar's schedule window [startDate, endDate]
 *  - planned: otherwise (bars exist but none is started, none delayed, none with today inside window)
 *
 * @param activeBars Active scheduled bars (scheduled=true, non-placeholder). Pass empty array for not_programmed.
 * @param evidenceMap Evidence keyed by bar id.
 * @param today YYYY-MM-DD string for "today".
 */
export function deriveItemStatus(
  activeBars: RevisionBar[],
  evidenceMap: Map<number, BarEvidence>,
  today: string,
): ItemStatus {
  // not_programmed: no non-placeholder scheduled bars
  if (activeBars.length === 0) return "not_programmed";

  const todayMs = parseDate(today);
  const states = activeBars.map(bar =>
    classifyBarExecutionState(bar.plannedQty, evidenceMap.get(bar.id) ?? null)
  );

  // completed: all bars are completed
  if (states.every(s => s === "completed")) return "completed";

  // delayed: any bar is incomplete AND any bar's endDate < today
  const anyIncomplete = states.some(s => s !== "completed");
  const anyEndedBeforeToday = activeBars.some(bar => parseDate(bar.endDate) < todayMs);
  if (anyIncomplete && anyEndedBeforeToday) return "delayed";

  // in_progress: any bar started OR today is inside any bar's schedule window
  const anyStarted = states.some(s => s === "started");
  const todayInsideWindow = activeBars.some(bar =>
    parseDate(bar.startDate) <= todayMs && todayMs <= parseDate(bar.endDate)
  );
  if (anyStarted || todayInsideWindow) return "in_progress";

  // planned
  return "planned";
}

// ─── Revision History Types ───────────────────────────────────────────────────

/** A single schedule revision event stored in the audit log. */
export interface ScheduleRevisionRecord {
  type: "schedule_revision";
  revisionId: string;
  barId: number;
  /** YYYY-MM-DD */
  originalStartDate: string;
  /** YYYY-MM-DD */
  originalEndDate: string;
  /** YYYY-MM-DD */
  revisedStartDate: string;
  /** YYYY-MM-DD */
  revisedEndDate: string;
  /** Calendar-day delta applied to successors (new finish − old finish). */
  delta: number;
  /** Human-readable reason for the revision. */
  reason: string;
  /** Whether cascade was applied for this revision. */
  cascadeApplied: boolean;
  /** Actor who performed the revision (userId). Runtime planner is actor-agnostic. */
  actorId: number | null;
  /** Actor display name. */
  actorName: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/** A single cascade-shift event linked to a parent revision. */
export interface CascadeShiftRecord {
  type: "cascade_shift";
  revisionId: string;
  /** The parent ScheduleRevisionRecord that triggered this cascade. */
  sourceRevisionId: string;
  /** The source bar whose revised finish produced this shift. */
  sourceBarId: number;
  /** The bar that was shifted. */
  barId: number;
  /** YYYY-MM-DD */
  originalStartDate: string;
  /** YYYY-MM-DD */
  originalEndDate: string;
  /** YYYY-MM-DD */
  shiftedStartDate: string;
  /** YYYY-MM-DD */
  shiftedEndDate: string;
  /** Calendar-day delta applied. */
  delta: number;
  /** Actor who performed the cascade (userId). */
  actorId: number | null;
  /** Actor display name. */
  actorName: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
}
