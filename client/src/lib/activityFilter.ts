/**
 * Activity filter helpers for the Site Dashboard (Instruction 06X-HF2).
 *
 * Identity rules:
 *  • BOQ-linked progress rows  (boqItemId != null): identity = "boq:<id>"
 *    The display label is derived from the BOQ item name fields when present,
 *    otherwise falls back to the stored activity text.
 *  • Legacy rows              (boqItemId = null):  identity = normalizeActivity(activity)
 *    (trimmed, all whitespace runs collapsed to a single space, lower-cased)
 *
 * No fuzzy matching; stored activity text is never rewritten.
 */

import { boqItemDisplayName, type BoqItemNameFields } from "@shared/boqItemName";

// ── Canonical activity identity ───────────────────────────────────────────────

/** Prefix used to distinguish BOQ-keyed filter values from legacy text values. */
const BOQ_PREFIX = "boq:";

/**
 * Normalise a raw activity string to a stable, case-insensitive identity.
 * Used only for legacy rows where boqItemId is null.
 */
export function normalizeActivity(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Return true when a filter value encodes a BOQ item id.
 */
export function isBoqActivityValue(filterValue: string): boolean {
  return filterValue.startsWith(BOQ_PREFIX);
}

/**
 * Extract the numeric BOQ item id from a "boq:<id>" filter value.
 * Returns NaN if not a valid BOQ-prefixed value.
 */
export function boqActivityId(filterValue: string): number {
  return parseInt(filterValue.slice(BOQ_PREFIX.length), 10);
}

/**
 * Build the canonical filter value for a progress row.
 *  • BOQ-linked (boqItemId != null) → "boq:<boqItemId>"
 *  • Legacy (boqItemId null)        → normalizeActivity(activity)
 */
export function activityFilterValue(
  activity: string,
  boqItemId: number | null | undefined,
): string {
  if (boqItemId != null) return `${BOQ_PREFIX}${boqItemId}`;
  return normalizeActivity(activity);
}

// ── Progress row type (minimal shape expected) ────────────────────────────────

export interface ProgressRowLike {
  activity: string;
  boqItemId?: number | null;
  /** Optional BOQ item name fields — present when the endpoint joins them. */
  boqItem?: BoqItemNameFields | null;
}

// ── Unique activity entries for the dropdown ──────────────────────────────────

export interface ActivityFilterOption {
  /** Canonical filter value stored in state and matched against. */
  value: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
}

/**
 * Build a deduplicated, sorted list of activity filter options from all DPR
 * progress rows.
 *
 * Deduplication key is the canonical `value`:
 *  – Two BOQ-linked rows with different activity text but the same boqItemId
 *    collapse to one entry (the first label seen wins).
 *  – Two legacy rows with identical normalised text collapse to one entry
 *    (case-insensitive duplicate removal).
 */
export function buildActivityFilterOptions(
  dprsWithDetails: Array<{ progress?: ProgressRowLike[] | null }>,
): ActivityFilterOption[] {
  const seen = new Map<string, string>(); // value → label

  for (const dpr of dprsWithDetails) {
    if (!dpr.progress) continue;
    for (const p of dpr.progress) {
      if (!p.activity) continue;
      const value = activityFilterValue(p.activity, p.boqItemId ?? null);
      if (seen.has(value)) continue;

      let label: string;
      if (p.boqItemId != null && p.boqItem) {
        // BOQ item fields present — use authoritative display name
        label = boqItemDisplayName(p.boqItem) || p.activity;
      } else if (p.boqItemId != null) {
        // BOQ-linked but no item fields in payload — fall back to activity text
        label = p.activity;
      } else {
        // Legacy row — keep raw text as label (preserves original casing)
        label = p.activity;
      }
      seen.set(value, label);
    }
  }

  return Array.from(seen.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── DPR-level activity match ──────────────────────────────────────────────────

/**
 * Return true when at least one progress row in `dpr` matches the canonical
 * filter value `activityFilter`.
 *
 * Matching rules:
 *  • "boq:<id>" filter  → row must have boqItemId === id (regardless of text)
 *  • legacy text filter → row must have boqItemId null AND
 *                         normalizeActivity(row.activity) === activityFilter
 */
export function dprMatchesActivityFilter(
  dpr: { progress?: ProgressRowLike[] | null },
  activityFilter: string,
): boolean {
  if (!dpr.progress) return false;

  if (isBoqActivityValue(activityFilter)) {
    const id = boqActivityId(activityFilter);
    return dpr.progress.some((p) => p.boqItemId === id);
  }

  // Legacy normalized-text match
  return dpr.progress.some(
    (p) =>
      (p.boqItemId == null) &&
      normalizeActivity(p.activity) === activityFilter,
  );
}

// ── Display label for an active filter value (for exports / print) ────────────

/**
 * Resolve a human-readable label for an activity filter value.
 * Used in export headers and print filter summaries.
 *
 * Falls back to the raw value if no matching option is found.
 */
export function activityFilterLabel(
  filterValue: string,
  options: ActivityFilterOption[],
): string {
  if (!filterValue) return "";
  const opt = options.find((o) => o.value === filterValue);
  return opt ? opt.label : filterValue;
}
