// ============================================================
// Batch 06F — Tomorrow's Requirement daily fulfilment seam
// ============================================================
// Single shared brain for:
//   1. stable per-line identity (lineKey) inside site_requirements JSONB;
//   2. matching allocation entries to requirement lines (lineKey first,
//      legacy zero-based index fallback — historical records untouched);
//   3. daily fulfilment model (hlc | arrangement | other_agency) recorded
//      on the EXISTING per-line allocationStatus entry — no new state
//      machine, no DB schema change;
//   4. applicable-arrangement resolution priority for the ALLOCATOR view;
//   5. next-day Material Receipt suggestion derived from the daily
//      allocation (suggestion only — never creates a receipt).
//
// HARD RULES (approved spec):
// - The Engineer's requirement entry never carries fulfilment decisions.
// - Daily fulfilment NEVER mutates earthwork_arrangements (agency, scope,
//   allocatedQty) or programme allocations. Nothing in this module writes.
// - No arrangement is NOT an error → HLC/Internal context by default.
// - Standing BOM responsibility semantics are untouched.

import {
  APPLICABLE_ARRANGEMENT_STATUSES,
  type ApplicableArrangementInput,
} from "./materialReceiptSummary";

// ---------- 1. Stable line identity ----------

/**
 * Client-generated stable key for a requirement line. Generated ONCE when
 * the Engineer creates the row; survives reorder/insert/delete/save/reopen.
 * Never derived from index, order, or label.
 */
export function newLineKey(rand: () => number = Math.random): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "rl_";
  for (let i = 0; i < 10; i++) key += alphabet[Math.floor(rand() * alphabet.length)];
  return key;
}

export interface RequirementLineLike {
  lineKey?: string | null;
  [k: string]: unknown;
}

export interface AllocationEntryLike {
  /** Stable key match (new records). */
  lineKey?: string | null;
  /** Legacy zero-based array position (historical records + compat metadata). */
  index?: number | null;
  status?: string | null;
  expectedBy?: string | null;
  remarks?: string | null;
  // 06F daily fulfilment (all optional):
  fulfilmentType?: FulfilmentType | null;
  arrangementId?: number | null;
  agencyNameSnapshot?: string | null;
  exceptionReason?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

/**
 * Find the allocation entry for a requirement line.
 * Priority: lineKey match (both sides keyed) → index fallback (legacy).
 * A lineKey-keyed entry NEVER matches by index — position changes must not
 * move an allocation onto a different line.
 */
export function findAllocationEntry<E extends AllocationEntryLike>(
  entries: E[] | null | undefined,
  line: RequirementLineLike | null | undefined,
  index: number,
): E | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const key = line?.lineKey ?? null;
  if (key) {
    const byKey = entries.find((e) => e.lineKey === key);
    if (byKey) return byKey;
    // A keyed line only falls back to index for entries that themselves have
    // no lineKey (written before the line was keyed / legacy writer).
    const legacy = entries.find((e) => (e.lineKey == null || e.lineKey === "") && e.index === index);
    return legacy ?? null;
  }
  // Unkeyed (historical) line: index is the only identity available.
  const byIndex = entries.find((e) => (e.lineKey == null || e.lineKey === "") && e.index === index);
  return byIndex ?? null;
}

// ---------- 2. Daily fulfilment model ----------

export type FulfilmentType = "hlc" | "arrangement" | "other_agency";
export const FULFILMENT_TYPES: readonly FulfilmentType[] = ["hlc", "arrangement", "other_agency"];

export interface FulfilmentInput {
  fulfilmentType?: string | null;
  arrangementId?: number | null;
  agencyNameSnapshot?: string | null;
  exceptionReason?: string | null;
}

export type FulfilmentValidation =
  | { ok: true; value: { fulfilmentType: FulfilmentType | null; arrangementId: number | null; agencyNameSnapshot: string | null; exceptionReason: string | null } }
  | { ok: false; code: string; message: string };

/**
 * Validate a daily fulfilment payload. Fulfilment is entirely optional —
 * absent/null means "no fulfilment context recorded" and is always valid.
 */
export function validateFulfilment(input: FulfilmentInput | null | undefined): FulfilmentValidation {
  const ft = (input?.fulfilmentType ?? null) as FulfilmentType | null;
  const arrangementId = input?.arrangementId ?? null;
  const agency = (input?.agencyNameSnapshot ?? "").trim() || null;
  const reason = (input?.exceptionReason ?? "").trim() || null;

  if (ft == null) {
    if (arrangementId != null) {
      return { ok: false, code: "ARRANGEMENT_WITHOUT_TYPE", message: "arrangementId given without fulfilmentType" };
    }
    return { ok: true, value: { fulfilmentType: null, arrangementId: null, agencyNameSnapshot: agency, exceptionReason: reason } };
  }
  if (!FULFILMENT_TYPES.includes(ft)) {
    return { ok: false, code: "INVALID_FULFILMENT_TYPE", message: `Invalid fulfilmentType: ${ft}` };
  }
  if (ft === "arrangement") {
    if (arrangementId == null) {
      return { ok: false, code: "ARRANGEMENT_ID_REQUIRED", message: "fulfilmentType 'arrangement' requires arrangementId" };
    }
    return { ok: true, value: { fulfilmentType: ft, arrangementId, agencyNameSnapshot: agency, exceptionReason: reason } };
  }
  if (ft === "other_agency") {
    if (!agency) {
      return { ok: false, code: "AGENCY_NAME_REQUIRED", message: "Other Agency fulfilment requires an agency name" };
    }
    // Daily exception is NOT an arrangement — never carry an arrangementId.
    return { ok: true, value: { fulfilmentType: ft, arrangementId: null, agencyNameSnapshot: agency, exceptionReason: reason } };
  }
  // hlc — internal; no arrangement id.
  return { ok: true, value: { fulfilmentType: "hlc", arrangementId: null, agencyNameSnapshot: null, exceptionReason: reason } };
}

/** Readable fulfilment label for lists / readiness / history. */
export function fulfilmentLabel(entry: AllocationEntryLike | null | undefined): string | null {
  if (!entry?.fulfilmentType) return null;
  switch (entry.fulfilmentType) {
    case "hlc":
      return "HLC / Internally Arranged";
    case "arrangement":
      return entry.agencyNameSnapshot ? `${entry.agencyNameSnapshot} (Arrangement)` : "Execution Arrangement";
    case "other_agency":
      return entry.agencyNameSnapshot ? `${entry.agencyNameSnapshot} — daily exception` : "Other agency — daily exception";
    default:
      return null;
  }
}

// ---------- 3. Applicable-arrangement resolution (allocator view) ----------

/** on_hold keeps standing responsibility context but is flagged, never a silent default suggestion. */
export const HOLD_STATUS = "on_hold";

export type ArrangementMatchLevel = "exact_bar" | "reach" | "item";

export interface RequirementArrangementInput extends ApplicableArrangementInput {
  chainageFrom?: number | null;
  chainageTo?: number | null;
  agencyName?: string | null;
}

export interface RequirementBarAllocationInput {
  arrangementId: number;
  programmeBarId?: number | null;
}

export interface RequirementFulfilmentContext {
  boqItemId: number | null;
  /** ONLY when genuinely persisted on the requirement — never inferred. */
  programmeBarId?: number | null;
  chainageFrom?: number | null;
  chainageTo?: number | null;
}

export interface ArrangementCandidate<T extends RequirementArrangementInput> {
  arrangement: T;
  matchLevel: ArrangementMatchLevel;
  onHold: boolean;
}

export interface RequirementArrangementResolution<T extends RequirementArrangementInput> {
  candidates: Array<ArrangementCandidate<T>>;
  /** Strongest single non-on-hold candidate, shown as SUGGESTED (never locked). */
  suggested: ArrangementCandidate<T> | null;
  /** No arrangement → normal HLC/Internal context. Never an error. */
  hlcDefault: boolean;
}

function coversItem(a: RequirementArrangementInput, boqItemId: number): boolean {
  if (a.boqItemId != null) return a.boqItemId === boqItemId;
  const allocs = a.boqItemAllocations;
  if (Array.isArray(allocs)) return allocs.some((x) => x?.boqItemId === boqItemId);
  return false;
}

function chainageOverlaps(a: RequirementArrangementInput, from: number, to: number): boolean {
  if (a.chainageFrom == null || a.chainageTo == null) return false;
  const lo = Math.min(a.chainageFrom, a.chainageTo);
  const hi = Math.max(a.chainageFrom, a.chainageTo);
  const rLo = Math.min(from, to);
  const rHi = Math.max(from, to);
  return lo < rHi && hi > rLo;
}

const MATCH_RANK: Record<ArrangementMatchLevel, number> = { exact_bar: 0, reach: 1, item: 2 };

/**
 * Resolution priority (approved spec §3):
 *  1. exact programmeBarId allocation — ONLY when programmeBarId is genuinely known;
 *  2. compatible BOQ item + reach/scope overlap;
 *  3. compatible BOQ item;
 *  4. none → HLC/Internal.
 * Statuses: APPLICABLE_ARRANGEMENT_STATUSES plus on_hold (flagged, never suggested).
 */
export function resolveRequirementArrangements<T extends RequirementArrangementInput>(
  arrangements: T[] | null | undefined,
  barAllocations: RequirementBarAllocationInput[] | null | undefined,
  ctx: RequirementFulfilmentContext,
): RequirementArrangementResolution<T> {
  const out: Array<ArrangementCandidate<T>> = [];
  if (ctx.boqItemId != null && Array.isArray(arrangements)) {
    const operational = new Set<string>([...APPLICABLE_ARRANGEMENT_STATUSES, HOLD_STATUS]);
    const barLinked = new Set<number>(
      ctx.programmeBarId != null && Array.isArray(barAllocations)
        ? barAllocations.filter((ba) => ba.programmeBarId === ctx.programmeBarId).map((ba) => ba.arrangementId)
        : [],
    );
    for (const a of arrangements) {
      if (!operational.has(a.status)) continue;
      if (!coversItem(a, ctx.boqItemId)) continue;
      let level: ArrangementMatchLevel = "item";
      if (barLinked.has(a.id)) {
        level = "exact_bar";
      } else if (
        ctx.chainageFrom != null && ctx.chainageTo != null &&
        chainageOverlaps(a, ctx.chainageFrom, ctx.chainageTo)
      ) {
        level = "reach";
      }
      out.push({ arrangement: a, matchLevel: level, onHold: a.status === HOLD_STATUS });
    }
    out.sort((x, y) => MATCH_RANK[x.matchLevel] - MATCH_RANK[y.matchLevel] || x.arrangement.id - y.arrangement.id);
  }
  const active = out.filter((c) => !c.onHold);
  return {
    candidates: out,
    suggested: active.length > 0 ? active[0] : null,
    hlcDefault: out.length === 0,
  };
}

/**
 * Informational-only warning when the allocator picks HLC/Internal (or an
 * outside agency) although a standing arrangement assigns this work to an
 * agency. NEVER blocks, NEVER rewrites the standing arrangement or BOM.
 */
export function standingArrangementExceptionNote(
  chosen: FulfilmentInput | null | undefined,
  suggested: { arrangement: { id: number; agencyName?: string | null } } | null | undefined,
): string | null {
  if (!suggested) return null;
  const ft = chosen?.fulfilmentType ?? null;
  if (ft === "hlc") {
    const who = suggested.arrangement.agencyName || "the standing agency";
    return `Standing arrangement assigns this to ${who}. Tomorrow has been allocated internally as an exception.`;
  }
  if (ft === "other_agency") {
    const who = suggested.arrangement.agencyName || "the standing agency";
    return `Standing arrangement assigns this to ${who}. Tomorrow's supply is a one-day exception — the standing arrangement is unchanged.`;
  }
  if (ft === "arrangement" && chosen?.arrangementId != null && chosen.arrangementId !== suggested.arrangement.id) {
    return "A different compatible arrangement was chosen for tomorrow — the standing allocation for this stretch is unchanged.";
  }
  return null;
}

// ---------- 4. Next-day Material Receipt suggestion ----------

export interface ReceiptSuggestion {
  /** Supplier name to suggest in the receipt form (never force-filled). */
  supplierSuggestion: string | null;
  /** Arrangement to suggest linking — ONLY for fulfilmentType 'arrangement'. */
  arrangementId: number | null;
  /** Short human note explaining where the suggestion came from. */
  note: string;
}

/**
 * Derive a receipt-form suggestion from a daily fulfilment entry.
 * - arrangement  → suggest agency + that arrangementId;
 * - other_agency → suggest agency name only (NEVER fabricate an arrangementId);
 * - hlc          → internal context, no supplier suggestion.
 * Never creates a receipt; quantities are never inherited.
 */
export function receiptSuggestionFromFulfilment(entry: AllocationEntryLike | null | undefined): ReceiptSuggestion | null {
  if (!entry?.fulfilmentType) return null;
  if (entry.fulfilmentType === "arrangement") {
    return {
      supplierSuggestion: entry.agencyNameSnapshot ?? null,
      arrangementId: entry.arrangementId ?? null,
      note: "Allocated through this arrangement for the day",
    };
  }
  if (entry.fulfilmentType === "other_agency") {
    return {
      supplierSuggestion: entry.agencyNameSnapshot ?? null,
      arrangementId: null,
      note: "Daily-exception supplier chosen by the allocator",
    };
  }
  return { supplierSuggestion: null, arrangementId: null, note: "Arranged internally (HLC)" };
}
