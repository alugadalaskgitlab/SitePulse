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

/**
 * Task #1419 — the minimal, pure shape of a BOQ item needed to decide whether
 * a DPR progress row is *layer-capable* (i.e. the same chainage/side can be
 * built up in multiple physical lifts/layers, so the optional layerNo field is
 * meaningful). Both the Guided DPR wizard and Site Entry pass their in-memory
 * BOQ item straight in — everything here is optional so callers never have to
 * fabricate fields.
 */
export interface LayerCapabilityItem {
  description?: string | null;
  unit?: string | null;
  workCategory?: string | null;
  categoryName?: string | null;
  /** boqItems.layerConfig (jsonb) — only layerType/mixType are read. */
  layerConfig?: { layerType?: string | null; mixType?: string | null } | null;
}

// Normalise a string for exact/whole-token matching: lower-case, punctuation to
// spaces, collapse whitespace. NOT fuzzy — used only for whole-word regex tests.
function normText(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Task #1419 — the single shared, pure predicate deciding whether a BOQ item
 * supports multi-lift / multi-layer execution. Deliberately CONSERVATIVE:
 * exact/normalised category, workCategory, layerConfig.layerType and whole-word
 * description checks only — never fuzzy or single-loose-word matching. When the
 * item is missing/unknown we return false (the field stays hidden unless an
 * existing saved layerNo forces it visible; that is the caller's job).
 *
 * Layer-capable set:
 *  - Earthwork / embankment fill (built up in compacted lifts)
 *  - Subgrade
 *  - Granular Sub-Base (GSB)
 *  - Wet Mix Macadam (WMM)
 *  - BOQ items explicitly configured for multi-lift/layer work via layerConfig
 *    (layerType earthwork | granular | bituminous — the multi-lift pavement /
 *    fill families; spray_coat/concrete/none are single-application and excluded)
 */
export function isLayerCapableItem(item: LayerCapabilityItem | null | undefined): boolean {
  if (!item) return false;

  // 1. Explicit layerConfig classification — the authoritative signal.
  //    Only the genuinely multi-lift families count; a single sprayed coat or a
  //    single concrete pour is not layer-capable.
  const layerType = normText(item.layerConfig?.layerType).replace(/ /g, "_");
  if (layerType === "earthwork" || layerType === "granular" || layerType === "bituminous") {
    return true;
  }
  if (layerType === "spray_coat" || layerType === "concrete" || layerType === "none") {
    return false;
  }

  // 2. Explicit work-category metadata (exact codes from boqWorkCategories).
  //    BITUMINOUS is intentionally not sufficient by itself: that category
  //    also contains single-application prime/tack/seal coats. Those items
  //    become layer-capable only through an explicit multi-layer layerConfig.
  const wc = normText(item.workCategory);
  if (wc === "earthwork" || wc === "subbase base") {
    return true;
  }

  // 3. Conservative whole-word description checks for the named families.
  const desc = ` ${normText(item.description)} `;
  const cat = ` ${normText(item.categoryName)} `;
  const hay = desc + cat;

  // Earthwork / embankment fill (compacted lifts). Exclude excavation-only and
  // structural back-fill which are not lift-tracked here.
  if (/\b(embankment|subgrade|earthen shoulder)\b/.test(hay)) return true;

  // Granular Sub-Base — accept the abbreviation and the full phrase.
  if (/\bgsb\b/.test(hay) || /\bgranular sub base\b/.test(hay)) return true;

  // Wet Mix Macadam — abbreviation or full phrase.
  if (/\bwmm\b/.test(hay) || /\bwet mix macadam\b/.test(hay)) return true;

  return false;
}

/**
 * Task #1419 — screen-level rule for whether the optional layer/lift field
 * should be shown on a DPR progress row. Pure and shared by both live entry
 * screens so they behave identically:
 *  - always show when the item is layer-capable, OR
 *  - always show when a layerNo is already saved on the row (existing values
 *    stay visible/editable even if the current BOQ metadata is incomplete).
 * Never makes the field mandatory; returning false only hides the input.
 */
export function showLayerField(
  item: LayerCapabilityItem | null | undefined,
  existingLayerNo: number | null | undefined,
): boolean {
  if (existingLayerNo != null) return true;
  return isLayerCapableItem(item);
}
