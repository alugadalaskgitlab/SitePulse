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
  | "calculable"          // mapped to a layer, math possible
  | "needs_mapping"       // looks like pavement but cannot be safely mapped
  | "unsupported";        // non-linear / structures / out of Batch-01 scope

export interface GeometryClassification {
  status: GeometryItemStatus;
  layer: GeometryItemLayer | null;
  reason: string;
}

export interface GeometryBoqItemLike {
  id: number;
  description: string;
  unit: string;
  canonicalUnit?: string | null;
  workCategory?: string | null;
  displayName?: string | null;
  /** 01A — existing saved BOQ Layer Config (boq_items.layer_config jsonb). */
  layerConfig?: { layerType?: string | null; mixType?: string | null } | null;
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
    return { status: "calculable", layer: fromMixType, reason: `Confirmed by BOQ Layer Config (mixType = ${String(item.layerConfig!.mixType).trim()}).` };
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
    return { status: "calculable", layer: mapped, reason: `Classified as ${GEOMETRY_LAYER_LABELS[mapped]} by work-type resolver.` };
  }

  if (wt === "earthwork") {
    if (SUBGRADE_RE.test(desc)) {
      if (!CALCULABLE_UNITS.has(canon)) {
        return { status: "needs_mapping", layer: "subgrade", reason: `Subgrade item with unsupported BOQ unit "${item.unit}".` };
      }
      return { status: "calculable", layer: "subgrade", reason: "Earthwork item explicitly describing subgrade." };
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
  layer: GeometryItemLayer;
  lengthM: number;
  widthM: number;
  thicknessM: number | null;   // null for area-based results
  formula: string;             // human-readable "3800 m × 9.5 m × 0.040 m"
  internalUnit: "Cum" | "Sqm"; // unit the raw geometry math produced
  outputUnit: string;          // ALWAYS the BOQ item's own unit
  conversion: string | null;   // e.g. note when internal unit ≠ display alias
}

export type GeometryItemResult =
  | { boqItemId: number; status: "calculated"; layer: GeometryItemLayer; quantity: number; unit: string; basis: GeometryCalcBasis }
  | { boqItemId: number; status: "conversion_required"; layer: GeometryItemLayer; unit: string; reason: string; basis: Omit<GeometryCalcBasis, "outputUnit" | "conversion"> }
  | { boqItemId: number; status: "layer_not_configured"; layer: GeometryItemLayer; unit: string; reason: string }
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
    if (cls.status === "needs_mapping") {
      return { boqItemId: item.id, status: "needs_mapping", layer: cls.layer, unit: item.unit, reason: cls.reason };
    }
    const layer = cls.layer as GeometryItemLayer;
    const widthM = applicableLayerWidthM(layer, profile);
    if (!(widthM > 0)) {
      return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: "Enter road widths in the geometry profile first." };
    }

    const canon = canonicalizeUnit(item.canonicalUnit || item.unit || "");
    const isSurface = layer === "prime_coat" || layer === "tack_coat";

    // Thickness (mm → m) for volume math on configurable layers.
    let thicknessM: number | null = null;
    if (!isSurface) {
      const cfg = profile.layers.find(l => l.layerType === layer);
      if (!cfg || !cfg.enabled) {
        return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: `${GEOMETRY_LAYER_LABELS[layer]} layer is not enabled in the geometry profile.` };
      }
      if (canon !== "Sqm") { // Sqm items need no thickness
        if (cfg.thicknessMm == null || !(cfg.thicknessMm > 0)) {
          return { boqItemId: item.id, status: "layer_not_configured", layer, unit: item.unit, reason: `Enter ${GEOMETRY_LAYER_LABELS[layer]} thickness in the geometry profile.` };
        }
        thicknessM = cfg.thicknessMm / 1000;
      }
    }

    const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(round2(v)));

    if (canon === "Sqm") {
      const qty = round2(lengthM * widthM);
      return {
        boqItemId: item.id, status: "calculated", layer, quantity: qty, unit: item.unit,
        basis: {
          layer, lengthM, widthM, thicknessM: null,
          formula: `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m`,
          internalUnit: "Sqm", outputUnit: item.unit,
          conversion: canonicalizeUnit(item.unit) === "Sqm" && item.unit !== "Sqm" ? `displayed in BOQ unit "${item.unit}" (≡ Sqm)` : null,
        },
      };
    }

    if (canon === "Cum") {
      const t = thicknessM ?? (isSurface ? null : thicknessM);
      if (t == null) {
        // Surface treatment measured in Cum is unusual — don't guess.
        return { boqItemId: item.id, status: "needs_mapping", layer, unit: item.unit, reason: `${GEOMETRY_LAYER_LABELS[layer]} measured in "${item.unit}" needs a thickness basis — not supported in Batch 01.` };
      }
      const qty = round2(lengthM * widthM * t);
      return {
        boqItemId: item.id, status: "calculated", layer, quantity: qty, unit: item.unit,
        basis: {
          layer, lengthM, widthM, thicknessM: t,
          formula: `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m × ${t} m`,
          internalUnit: "Cum", outputUnit: item.unit,
          conversion: canonicalizeUnit(item.unit) === "Cum" && item.unit !== "Cum" ? `displayed in BOQ unit "${item.unit}" (≡ Cum)` : null,
        },
      };
    }

    // MT — mass output needs an explicit density/conversion basis. Batch 01
    // has no density input, so never fabricate a number (spec §7C / §18 H).
    return {
      boqItemId: item.id, status: "conversion_required", layer, unit: item.unit,
      reason: `BOQ unit is "${item.unit}" (mass). A density/conversion basis is required to convert geometry volume to ${item.unit} — none is configured.`,
      basis: {
        layer, lengthM, widthM, thicknessM,
        formula: thicknessM != null ? `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m × ${thicknessM} m` : `${fmtNum(lengthM)} m × ${fmtNum(widthM)} m`,
        internalUnit: thicknessM != null ? "Cum" : "Sqm",
      },
    };
  });

  return { status: "ok", lengthM, results };
}
