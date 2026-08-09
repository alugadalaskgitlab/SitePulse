// ─────────────────────────────────────────────────────────────────────────────
// Geometry Batch 01 — Road Geometry & Pavement Quantity Engine
//
// Pure, UI-free engine: physical geometry inputs + BOQ item metadata in,
// deterministic calculated quantities out.
//
// HARD UOM INVARIANT: every calculated quantity leaves this module in the
// ACTUAL UoM of the BOQ item (item.unit). Work type NEVER determines the
// output unit. Unit recognition reuses the canonical normaliser
// (shared/boqNormalise.ts canonicalizeUnit) — internal only; the item's
// original display unit is always preserved on the result.
//
// Batch 01 scope: full confirmed corridor only (no No-Scope/withdrawn/block
// deductions), preview/comparison only (nothing feeds downstream modules),
// pavement layers only (no earthwork cut/fill — Geometry Batch 02).
// ─────────────────────────────────────────────────────────────────────────────
import { canonicalizeUnit } from "./boqNormalise";
import { resolveWorkType } from "./workTypeRecipes";

// ── Layer vocabulary ─────────────────────────────────────────────────────────
/** Thickness-bearing pavement layers configurable in the profile. */
export const GEOMETRY_LAYER_TYPES = ["subgrade", "gsb", "wmm", "dbm", "bc"] as const;
export type GeometryLayerType = (typeof GEOMETRY_LAYER_TYPES)[number];

/** Surface treatments — area-based, no thickness, not configured as layers. */
export type GeometrySurfaceType = "prime_coat" | "tack_coat";
export type GeometryItemLayer = GeometryLayerType | GeometrySurfaceType;

export const GEOMETRY_LAYER_LABELS: Record<GeometryItemLayer, string> = {
  subgrade: "Subgrade",
  gsb: "GSB",
  wmm: "WMM",
  dbm: "DBM",
  bc: "BC",
  prime_coat: "Prime Coat",
  tack_coat: "Tack Coat",
};

// ── Profile shape (mirrors road_geometry_profiles) ───────────────────────────
export interface GeometryLayerConfig {
  layerType: GeometryLayerType;
  enabled: boolean;
  thicknessMm: number | null;
  overrideWidthM: number | null;
}

export interface RoadGeometryProfileInput {
  enabled: boolean;
  /** 01A — explicit DESIGN INPUT: the prepared formation/subgrade platform width.
   *  Never derived silently from shoulders once the user has entered it. */
  formationWidthM?: number | null;
  carriagewayWidthM: number | null;
  pavedShoulderLhsM: number | null;
  pavedShoulderRhsM: number | null;
  softShoulderLhsM: number | null;
  softShoulderRhsM: number | null;
  layers: GeometryLayerConfig[];
}

/** Default layer list for a fresh profile — everything off until configured. */
export function defaultGeometryLayers(): GeometryLayerConfig[] {
  return GEOMETRY_LAYER_TYPES.map(layerType => ({
    layerType, enabled: false, thicknessMm: null, overrideWidthM: null,
  }));
}

// ── Default applicable-width rule ────────────────────────────────────────────
// PROPOSED ENGINEERING DEFAULTS — pending user sign-off (spec §5/§19K).
// Assumptions:
//  • bituminous layers (DBM/BC) and tack coat run over carriageway + paved
//    shoulders (soft shoulders are unpaved);
//  • prime coat primes the top granular layer, so it takes the granular width;
//  • granular layers (GSB/WMM) extend across carriageway + paved shoulders;
//  • subgrade extends across the full entered section (carriageway + paved +
//    soft shoulders) as a simple formation proxy — Batch 01 has no separate
//    formation-width field by design.
// Every width is overridable per layer (overrideWidthM).
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** 01A — one-time convenience suggestion for Formation Width when blank:
 *  carriageway + paved + soft shoulders. NEVER silently re-applied once the
 *  user has entered/confirmed their own value. */
export function suggestedFormationWidthM(p: Pick<RoadGeometryProfileInput, "carriagewayWidthM" | "pavedShoulderLhsM" | "pavedShoulderRhsM" | "softShoulderLhsM" | "softShoulderRhsM">): number {
  return n(p.carriagewayWidthM)
    + n(p.pavedShoulderLhsM) + n(p.pavedShoulderRhsM)
    + n(p.softShoulderLhsM) + n(p.softShoulderRhsM);
}

/**
 * SUGGESTED width per layer (01A wording: suggestion, not engineering truth):
 *  • Subgrade → Formation Width (design input); falls back to the formation
 *    suggestion only while no Formation Width has been entered.
 *  • DBM / BC / Tack → paved width (carriageway + paved shoulders).
 *  • GSB / WMM / Prime → paved width as an INITIAL suggestion only — these
 *    commonly differ by design; the per-layer override is the confirmation.
 */
export function defaultLayerWidthM(layer: GeometryItemLayer, p: RoadGeometryProfileInput): number {
  const cw = n(p.carriagewayWidthM);
  const paved = n(p.pavedShoulderLhsM) + n(p.pavedShoulderRhsM);
  switch (layer) {
    case "subgrade": {
      const fw = n(p.formationWidthM);
      return fw > 0 ? fw : suggestedFormationWidthM(p);
    }
    case "gsb":
    case "wmm":
    case "prime_coat": return cw + paved;
    case "dbm":
    case "bc":
    case "tack_coat": return cw + paved;
  }
}

/** Applicable width for a layer: override wins, else the proposed default. */
export function applicableLayerWidthM(layer: GeometryItemLayer, p: RoadGeometryProfileInput): number {
  if (layer !== "prime_coat" && layer !== "tack_coat") {
    const cfg = p.layers.find(l => l.layerType === layer);
    if (cfg && cfg.overrideWidthM != null && Number.isFinite(cfg.overrideWidthM) && cfg.overrideWidthM > 0) {
      return cfg.overrideWidthM;
    }
  }
  return defaultLayerWidthM(layer, p);
}

// ── Item → geometry-layer classification ─────────────────────────────────────
// Reuses the canonical resolver (shared/workTypeRecipes.ts resolveWorkType).
// resolveWorkType output is COARSER than geometry layers in two places:
//  • DBM → "bituminous_base", BC → "bituminous_wearing" (1:1, safe to map);
//  • subgrade has NO distinct key (classified "earthwork") — we only accept it
//    when the description explicitly says subgrade; other earthwork is
//    unsupported until Geometry Batch 02.
export type GeometryItemStatus =
  | "calculable"          // mapped to a calculation, math possible
  | "needs_mapping"       // looks like pavement but cannot be safely mapped
  | "unsupported";        // non-linear / structures / out of Batch-01 scope

// ── 01B — generic calculation vocabulary ─────────────────────────────────────
// Physical design layers (GEOMETRY_LAYER_TYPES) stay what they are: project
// settings. BOQ items now resolve to a reusable CALCULATION TYPE instead of
// having to BE one of the fixed layers.
//  • area         = length × applicable width            (Sqm-basis)
//  • volume_layer = length × applicable width × thickness (Cum-basis)
// LINEAR was deliberately NOT added — no current BOQ item/UoM safely requires
// it (spec §3C: don't manufacture support for completeness).
export type GeometryCalcType = "area" | "volume_layer";

/** Where the applicable width comes from — always reported, never assumed silently. */
export type GeometryWidthSource =
  | { kind: "layer_width"; layer: GeometryLayerType }   // resolved physical layer width (override-aware; subgrade → Formation Width)
  | { kind: "paved_width" };                            // carriageway + paved shoulders

/** Where a volume item's thickness comes from. */
export type GeometryThicknessSource = "profile_layer" | "item_config";

export interface GeometryCalcSpec {
  calcType: GeometryCalcType;
  /** Short user-facing label, e.g. "WMM", "SDBC", "Scarifying". */
  label: string;
  /** Physical layer binding when the item IS one of the design layers. */
  layer: GeometryItemLayer | null;
  widthSource: GeometryWidthSource;
  thicknessSource: GeometryThicknessSource | null; // null for area calcs
  /** Item-level thickness (mm) when thicknessSource = "item_config". */
  itemThicknessMm?: number | null;
}

export function widthSourceLabel(ws: GeometryWidthSource): string {
  if (ws.kind === "paved_width") return "Paved width (carriageway + paved shoulders)";
  if (ws.layer === "subgrade") return "Formation Width";
  return `${GEOMETRY_LAYER_LABELS[ws.layer]} layer width`;
}

export interface GeometryClassification {
  status: GeometryItemStatus;
  layer: GeometryItemLayer | null;
  /** Present when status = "calculable" — the reusable calculation to run. */
  calc?: GeometryCalcSpec;
  reason: string;
}

export interface GeometryBoqItemLike {
  id: number;
  description: string;
  unit: string;
  canonicalUnit?: string | null;
  workCategory?: string | null;
  displayName?: string | null;
  /** 01A/01B — existing saved BOQ Layer Config (boq_items.layer_config jsonb). */
  layerConfig?: { layerType?: string | null; mixType?: string | null; thicknessMm?: number | null } | null;
}

// 01A — explicit saved Layer Config mixType is the HIGHEST-priority source.
// Matching is trim-safe and case-insensitive; the stored value is never
// modified. Only mixTypes that correspond to a Batch-01 geometry layer map;
// anything unknown (SDBC, BM, MA, SD, …) falls through safely to the next
// classification source instead of being guessed.
const MIXTYPE_TO_LAYER: Record<string, GeometryLayerType> = {
  "GSB": "gsb", "GRANULAR SUB BASE": "gsb",
  "WMM": "wmm", "WET MIX MACADAM": "wmm",
  "DBM": "dbm", "DENSE BITUMINOUS MACADAM": "dbm",
  "BC": "bc", "BITUMINOUS CONCRETE": "bc",
};

// 01B — mixTypes that are real thickness-bearing pavement courses but NOT one
// of the five physical design layers. They calculate as volume_layer using the
// paved width, with thickness from the item's OWN Layer Config (thicknessMm) —
// no new engine formula and no new GEOMETRY_LAYER_TYPES entry per mix.
const MIXTYPE_ITEM_COURSE: Record<string, string> = {
  "SDBC": "SDBC", "SEMI DENSE BITUMINOUS CONCRETE": "SDBC", "SEMI-DENSE BITUMINOUS CONCRETE": "SDBC",
  "BM": "BM", "BITUMINOUS MACADAM": "BM",
};

export function geometryItemCourseFromMixType(mixType: string | null | undefined): string | null {
  if (typeof mixType !== "string") return null;
  const key = mixType.trim().toUpperCase();
  return key ? MIXTYPE_ITEM_COURSE[key] ?? null : null;
}

export function geometryLayerFromMixType(mixType: string | null | undefined): GeometryLayerType | null {
  if (typeof mixType !== "string") return null;
  const key = mixType.trim().toUpperCase();
  if (!key) return null;
  return MIXTYPE_TO_LAYER[key] ?? null;
}

const SUBGRADE_RE = /\bsub\s*-?\s*grade\b/i;
const PAVEMENT_HINT_RE = /\b(gsb|granular\s+sub\s*-?\s*base|wmm|wet\s+mix|dbm|dense\s+(bituminous|graded)|bituminous|bitumen|macadam|prime\s+coat|tack\s+coat|asphalt)\b/i;

const WORK_TYPE_TO_LAYER: Record<string, GeometryItemLayer> = {
  gsb: "gsb",
  wmm: "wmm",
  bituminous_base: "dbm",
  bituminous_wearing: "bc",
  prime_coat: "prime_coat",
  tack_coat: "tack_coat",
};

/** Units the Batch-01 pavement math can express results in. */
const CALCULABLE_UNITS = new Set(["Cum", "Sqm", "MT"]);

// 01B — build the calc spec for a physical design layer (the original seven).
function specForLayer(layer: GeometryItemLayer, label?: string): GeometryCalcSpec {
  if (layer === "prime_coat" || layer === "tack_coat") {
    return { calcType: "area", label: GEOMETRY_LAYER_LABELS[layer], layer, widthSource: { kind: "paved_width" }, thicknessSource: null };
  }
  return {
    calcType: "volume_layer", label: label ?? GEOMETRY_LAYER_LABELS[layer], layer,
    widthSource: { kind: "layer_width", layer }, thicknessSource: "profile_layer",
  };
}

const SCARIFY_RE = /\bscarif\w*|\bmilling\b/i;

export function classifyItemForGeometry(item: GeometryBoqItemLike): GeometryClassification {
  const desc = item.description ?? "";
  const canon = canonicalizeUnit(item.canonicalUnit || item.unit || "");

  // Priority 1 (01A): explicit saved Layer Config mixType — SitePulse already
  // knows this item's layer; never make the user configure it again.
  const fromMixType = geometryLayerFromMixType(item.layerConfig?.mixType);
  if (fromMixType) {
    if (!CALCULABLE_UNITS.has(canon)) {
      return {
        status: "needs_mapping", layer: fromMixType,
        reason: `Layer Config confirms ${GEOMETRY_LAYER_LABELS[fromMixType]} but BOQ unit "${item.unit}" is not a supported geometry unit (Cum/Sqm/MT).`,
      };
    }
    return { status: "calculable", layer: fromMixType, calc: specForLayer(fromMixType), reason: `Confirmed by BOQ Layer Config (mixType = ${String(item.layerConfig!.mixType).trim()}).` };
  }

  // Priority 1b (01B): mixTypes that are real pavement courses but not one of
  // the five physical design layers (SDBC, BM). volume_layer over the paved
  // width; thickness from the item's own Layer Config — never parsed from the
  // description and never fabricated.
  const itemCourse = geometryItemCourseFromMixType(item.layerConfig?.mixType);
  if (itemCourse) {
    if (!CALCULABLE_UNITS.has(canon)) {
      return { status: "needs_mapping", layer: null, reason: `Layer Config confirms ${itemCourse} but BOQ unit "${item.unit}" is not a supported geometry unit (Cum/Sqm/MT).` };
    }
    const tMm = item.layerConfig?.thicknessMm;
    // Thickness is required REGARDLESS of UoM: SDBC/BM are thickness-bearing
    // courses, and an unconfigured thickness must surface as needs_mapping —
    // never silently degrade to an area quantity.
    if (!(typeof tMm === "number" && Number.isFinite(tMm) && tMm > 0)) {
      return { status: "needs_mapping", layer: null, reason: `${itemCourse} needs its thickness set in the item's Layer Config before geometry can calculate it.` };
    }
    return {
      status: "calculable", layer: null,
      calc: { calcType: "volume_layer", label: itemCourse, layer: null, widthSource: { kind: "paved_width" }, thicknessSource: "item_config", itemThicknessMm: tMm ?? null },
      reason: `Confirmed by BOQ Layer Config (mixType = ${String(item.layerConfig!.mixType).trim()}); thickness from item Layer Config.`,
    };
  }

  const resolution = resolveWorkType(desc, item.unit ?? "", {
    workCategory: item.workCategory ?? null,
    canonicalUnit: item.canonicalUnit ?? null,
  });
  const wt = resolution?.workType ?? null;

  const mapped = wt ? WORK_TYPE_TO_LAYER[wt] : undefined;
  // SAFETY GATE: only HIGH-confidence (explicit description regex) resolutions
  // may produce geometry quantities. Medium-confidence category fallbacks
  // (e.g. workCategory=BITUMINOUS defaulting to bituminous_base, or
  // SUBBASE_BASE defaulting to gsb without explicit evidence) must surface
  // as needs_mapping — never a silently wrong layer quantity (spec §8/§18 N-O).
  if (mapped && resolution?.confidence !== "high") {
    return {
      status: "needs_mapping", layer: mapped,
      reason: `Category suggests ${GEOMETRY_LAYER_LABELS[mapped]} but the description doesn't explicitly confirm the layer — needs manual confirmation before geometry can calculate it.`,
    };
  }
  if (mapped) {
    if (!CALCULABLE_UNITS.has(canon)) {
      return {
        status: "needs_mapping", layer: mapped,
        reason: `Recognised as ${GEOMETRY_LAYER_LABELS[mapped]} but BOQ unit "${item.unit}" is not a supported geometry unit (Cum/Sqm/MT) — check the item or its unit.`,
      };
    }
    return { status: "calculable", layer: mapped, calc: specForLayer(mapped), reason: `Classified as ${GEOMETRY_LAYER_LABELS[mapped]} by work-type resolver.` };
  }

  // 01B — scarifying/milling of existing pavement: an AREA treatment when
  // the description is explicit AND the BOQ unit is Sqm (unambiguous basis).
  // Any other dismantling (structures, Cum, LS…) stays out of geometry.
  if (wt === "dismantling" && SCARIFY_RE.test(desc)) {
    if (canon === "Sqm") {
      return {
        status: "calculable", layer: null,
        calc: { calcType: "area", label: "Scarifying / Milling", layer: null, widthSource: { kind: "paved_width" }, thicknessSource: null },
        reason: "Scarifying/milling of existing pavement measured in Sqm — area basis.",
      };
    }
    return { status: "needs_mapping", layer: null, reason: `Scarifying/milling item in "${item.unit}" — area basis needs a Sqm unit; confirm the item before geometry can calculate it.` };
  }

  if (wt === "earthwork") {
    if (SUBGRADE_RE.test(desc)) {
      if (!CALCULABLE_UNITS.has(canon)) {
        return { status: "needs_mapping", layer: "subgrade", reason: `Subgrade item with unsupported BOQ unit "${item.unit}".` };
      }
      return { status: "calculable", layer: "subgrade", calc: specForLayer("subgrade"), reason: "Earthwork item explicitly describing subgrade." };
    }
    return { status: "unsupported", layer: null, reason: "Earthwork (embankment/cut/fill) — geometry for earthwork comes in Geometry Batch 02." };
  }

  // Not resolved to a pavement work type. If it still smells like pavement,
  // surface it for manual attention instead of guessing (spec §8/§18 O).
  if (PAVEMENT_HINT_RE.test(desc)) {
    return { status: "needs_mapping", layer: null, reason: "Description suggests a pavement item but the classifier could not map it to a layer — needs manual mapping." };
  }
  return { status: "unsupported", layer: null, reason: "Non-linear / structure / miscellaneous item — outside pavement geometry." };
}

// ── Quantity calculation ─────────────────────────────────────────────────────
export interface GeometryCorridorInput {
  chainageFrom: number | null;
  chainageTo: number | null;
  corridorConfirmed: boolean;
}

export interface GeometryCalcBasis {
  layer: GeometryItemLayer | null; // physical layer binding, when there is one
  calcType: GeometryCalcType;      // 01B — which reusable calculation ran
  calcLabel: string;               // 01B — e.g. "WMM", "SDBC", "Scarifying / Milling"
  widthSource: string;             // 01B — human-readable width provenance
  thicknessSource: GeometryThicknessSource | null; // 01B — provenance for volume items
  lengthM: number;
  widthM: number;
  thicknessM: number | null;   // null for area-based results
  formula: string;             // human-readable "3800 m × 9.5 m × 0.040 m"
  internalUnit: "Cum" | "Sqm"; // unit the raw geometry math produced
  outputUnit: string;          // ALWAYS the BOQ item's own unit
  conversion: string | null;   // e.g. note when internal unit ≠ display alias
}

export type GeometryItemResult =
  | { boqItemId: number; status: "calculated"; layer: GeometryItemLayer | null; quantity: number; unit: string; basis: GeometryCalcBasis }
  | { boqItemId: number; status: "conversion_required"; layer: GeometryItemLayer | null; unit: string; reason: string; basis: Omit<GeometryCalcBasis, "outputUnit" | "conversion"> }
  | { boqItemId: number; status: "layer_not_configured"; layer: GeometryItemLayer | null; unit: string; reason: string }
  | { boqItemId: number; status: "needs_mapping"; layer: GeometryItemLayer | null; unit: string; reason: string }
  | { boqItemId: number; status: "unsupported"; layer: null; unit: string; reason: string };

export type GeometryPreview =
  | { status: "disabled" }
  | { status: "corridor_unconfirmed"; message: string }
  | { status: "ok"; lengthM: number; results: GeometryItemResult[] };

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Compute the full-corridor geometry preview for a set of BOQ items.
 * Never calculates against a missing/unconfirmed/invalid corridor.
 */
export function computeGeometryPreview(
  corridor: GeometryCorridorInput,
  profile: RoadGeometryProfileInput,
  items: GeometryBoqItemLike[],
): GeometryPreview {
  if (!profile.enabled) return { status: "disabled" };

  const from = corridor.chainageFrom, to = corridor.chainageTo;
  if (
    !corridor.corridorConfirmed ||
    from == null || to == null ||
    !Number.isFinite(from) || !Number.isFinite(to) ||
    to <= from
  ) {
    return {
      status: "corridor_unconfirmed",
      message: "Confirm project corridor first to calculate geometry quantities.",
    };
  }
  const lengthM = (to - from) * 1000;

  const results: GeometryItemResult[] = items.map(item => {
    const cls = classifyItemForGeometry(item);
    if (cls.status === "unsupported") {
      return { boqItemId: item.id, status: "unsupported", layer: null, unit: item.unit, reason: cls.reason };
    }
    if (cls.status === "needs_mapping" || !cls.calc) {
      return { boqItemId: item.id, status: "needs_mapping", layer: cls.layer, unit: item.unit, reason: cls.reason };
    }
    const calc = cls.calc;
    const layer = cls.layer;

    // ── Width (01B: resolved from the spec's declared source, reported back) ──
    const widthM = calc.widthSource.kind === "layer_width"
      ? applicableLayerWidthM(calc.widthSource.layer, profile)
      : n(profile.carriagewayWidthM) + n(profile.pavedShoulderLhsM) + n(profile.pavedShoulderRhsM);
    const wsLabel = widthSourceLabel(calc.widthSource);
    if (!(widthM > 0)) {
      return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: "Enter road widths in the geometry profile first." };
    }

    const canon = canonicalizeUnit(item.canonicalUnit || item.unit || "");

    // ── Thickness (mm → m) for volume calculations, from the declared source ──
    let thicknessM: number | null = null;
    if (calc.calcType === "volume_layer" && canon !== "Sqm") { // Sqm items need no thickness
      if (calc.thicknessSource === "profile_layer") {
        const layerCfg = profile.layers.find(l => l.layerType === calc.layer);
        if (!layerCfg || !layerCfg.enabled) {
          return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: `${calc.label} layer is not enabled in the geometry profile.` };
        }
        if (layerCfg.thicknessMm == null || !(layerCfg.thicknessMm > 0)) {
          return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: `Enter ${calc.label} thickness in the geometry profile.` };
        }
        thicknessM = layerCfg.thicknessMm / 1000;
      } else if (calc.thicknessSource === "item_config") {
        if (calc.itemThicknessMm == null || !(calc.itemThicknessMm > 0)) {
          return { boqItemId: item.id, status: "needs_mapping", layer, unit: item.unit, reason: `${calc.label} needs its thickness set in the item's Layer Config.` };
        }
        thicknessM = calc.itemThicknessMm / 1000;
      } else {
        return { boqItemId: item.id, status: "needs_mapping", layer, unit: item.unit, reason: `${calc.label} volume calculation has no reliable thickness source.` };
      }
    }
    // volume_layer + Sqm items also need the layer enabled when profile-bound
    if (calc.calcType === "volume_layer" && canon === "Sqm" && calc.thicknessSource === "profile_layer") {
      const layerCfg = profile.layers.find(l => l.layerType === calc.layer);
      if (!layerCfg || !layerCfg.enabled) {
        return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: `${calc.label} layer is not enabled in the geometry profile.` };
      }
    }

    const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(round2(v)));
    const baseMeta = { layer, calcType: calc.calcType, calcLabel: calc.label, widthSource: wsLabel, thicknessSource: canon === "Sqm" || calc.calcType === "area" ? null : calc.thicknessSource } as const;

    if (canon === "Sqm") {
      const qty = round2(lengthM * widthM);
      return {
        boqItemId: item.id, status: "calculated", layer, quantity: qty, unit: item.unit,
        basis: {
          ...baseMeta, lengthM, widthM, thicknessM: null,
          formula: `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m`,
          internalUnit: "Sqm", outputUnit: item.unit,
          conversion: canonicalizeUnit(item.unit) === "Sqm" && item.unit !== "Sqm" ? `displayed in BOQ unit "${item.unit}" (≡ Sqm)` : null,
        },
      };
    }

    if (canon === "Cum") {
      if (calc.calcType === "area" || thicknessM == null) {
        // Area treatment measured in Cum is unusual — don't guess.
        return { boqItemId: item.id, status: "needs_mapping", layer, unit: item.unit, reason: `${calc.label} measured in "${item.unit}" needs a thickness basis — not safely available.` };
      }
      const qty = round2(lengthM * widthM * thicknessM);
      return {
        boqItemId: item.id, status: "calculated", layer, quantity: qty, unit: item.unit,
        basis: {
          ...baseMeta, lengthM, widthM, thicknessM,
          formula: `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m × ${thicknessM} m`,
          internalUnit: "Cum", outputUnit: item.unit,
          conversion: canonicalizeUnit(item.unit) === "Cum" && item.unit !== "Cum" ? `displayed in BOQ unit "${item.unit}" (≡ Cum)` : null,
        },
      };
    }

    // MT — mass output needs an explicit density/conversion basis. Batch 01
    // has no density input, so never fabricate a number.
    return {
      boqItemId: item.id, status: "conversion_required", layer, unit: item.unit,
      reason: `BOQ unit is "${item.unit}" (mass). A density/conversion basis is required to convert geometry volume to ${item.unit} — none is configured.`,
      basis: {
        ...baseMeta, lengthM, widthM, thicknessM,
        formula: thicknessM != null ? `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m × ${thicknessM} m` : `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m`,
        internalUnit: thicknessM != null ? "Cum" : "Sqm",
      },
    };
  });

  return { status: "ok", lengthM, results };
}
