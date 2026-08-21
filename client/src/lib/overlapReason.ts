/**
 * Batch 06V — Chainage overlap reason pick-list helpers.
 *
 * Pure (no React) so they can be tested in the Vitest node environment and
 * imported by both ChainageOverlapGuard (UI) and unit tests.
 */

/**
 * Fixed reasons the engineer can choose from.
 * "Other" requires a free-text elaboration and is always the last option.
 */
export const OVERLAP_REASON_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "Vegetation regrowth / repeat clearing", label: "Vegetation regrowth / repeat clearing" },
  { value: "Re-measurement after approved correction", label: "Re-measurement after approved correction" },
  { value: "Genuine separately payable repeated operation", label: "Genuine separately payable repeated operation" },
  { value: "Other",                            label: "Other (free text)" },
] as const;

export const OTHER_VALUE = "Other";

/**
 * Classify an existing reason string into a pick-list key and optional
 * "Other" free-text elaboration, so we can pre-populate the dialog when
 * it is re-opened for an entry that already has a reason.
 *
 * If the string exactly matches a predefined value it is used as-is.
 * Everything else maps to "Other" with the original string as elaboration.
 */
export function classifyReason(reason: string): { pick: string; elaboration: string } {
  if (!reason.trim()) return { pick: "", elaboration: "" };
  const found = OVERLAP_REASON_OPTIONS.find(
    (o) => o.value === reason.trim() && o.value !== OTHER_VALUE,
  );
  if (found) return { pick: found.value, elaboration: "" };
  return { pick: OTHER_VALUE, elaboration: reason.trim() };
}

/**
 * Combine a pick value and elaboration into the final reason string that is
 * stored in `chainageOverrideReason`. Returns empty string when incomplete.
 */
export function buildReason(pick: string, elaboration: string): string {
  if (!pick) return "";
  if (pick === OTHER_VALUE) return elaboration.trim();
  return pick;
}
