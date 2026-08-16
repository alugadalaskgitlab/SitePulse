/**
 * shared/layerDisplay.ts — Batch 06P: client-side display convention for the
 * optional layer/lift number on progress entries.
 *
 * The stored value is ONLY the integer progress_entries.layerNo. Whether the
 * UI calls it "Layer" or the friendlier "Lift" (earthwork/embankment) is a
 * pure render-time convention keyed off the activity name — never persisted.
 * null layerNo is never coerced to 1 anywhere.
 */

/** Friendlier word for the layer dimension, derived from the activity name. */
export function layerWord(activity: string | null | undefined): "Lift" | "Layer" {
  const s = String(activity ?? "").toLowerCase();
  return s.includes("embank") ? "Lift" : "Layer";
}

/** Field label for the DPR-entry input ("Layer / Lift", "Lift / Layer"). */
export function layerFieldLabel(activity: string | null | undefined): string {
  return layerWord(activity) === "Lift" ? "Lift / Layer" : "Layer / Lift";
}

/** Display label for a specific recorded layer ("Layer 2", "Lift 1"). */
export function layerDisplayName(activity: string | null | undefined, layerNo: number): string {
  return `${layerWord(activity)} ${layerNo}`;
}
