// Deterministic reach-wise auto-sequencer with dependencies + multiple fronts.
// Pure TypeScript — imports only the pure classifier. Produces Work Programme bars
// where each reach (front) runs the crust sequence in dependency order, reaches run
// in parallel (staggered), and the critical chain is scaled to fit the project duration.

import { resolveWorkType, WORK_TYPE_PLAN_CATEGORY, WORK_CAT_PLAN_CATEGORY, isShoulderDesc, classifyShoulderLayer, SHOULDER_CLASSES, type ShoulderClass, type WorkType } from "./workTypeRecipes";
import { areSidesDistinctCorridors } from "./barSide";

export type Track = "pavement" | "structure" | "bridge" | "other";

// ─── Bridge keyword detector ──────────────────────────────────────────────────
// Fires for bridges, viaducts, flyovers, retaining/breast walls.
// Used to route structure items onto the bridge track instead of culvert track.
function isBridgeDesc(desc: string): boolean {
  return /\bbridge\b|viaduct|flyover|abutment|pier\b|bearing\b|girder|deck\s*slab|superstructure|substructure|pile\s*cap|pylon|\barch\b|major\s*bridge|minor\s*bridge|retaining\s*wall|breast\s*wall/i.test(desc);
}

// ─── Pavement crust (road items) ─────────────────────────────────────────────
// MoRTH sequence: C&G → Dismantling → Earthwork (Excavation + Embankment concurrent) → GSB → WMM → Prime → DBM → BC
const PAVEMENT_STAGE: Partial<Record<WorkType, number>> = {
  clearing_grubbing:   1,   // MoRTH Cl. 201 — absolute first
  dismantling:         2,   // MoRTH Cl. 202 — existing structures/pavement
  roadway_excavation:  3,   // MoRTH Cl. 301 — cutting; concurrent with embankment
  earthwork:           3,   // MoRTH Cl. 305 — embankment (cut/borrow); concurrent with excavation
  gsb:                4,   // granular sub-base
  wmm:                5,   // wet mix macadam base course
  dlc:                5,   // dry lean concrete (rigid alternative sub-base)
  prime_coat:         6,   // spray on completed WMM/GSB before bituminous
  tack_coat:          7,   // inter-layer spray coat
  bituminous_base:    7,   // DBM / BM binder course
  pqc:                7,   // pavement quality concrete (rigid pavement)
  bituminous_wearing: 8,   // BC / SDBC wearing course — always last
};

// ─── Shoulder sub-type stages ────────────────────────────────────────────────
// Shoulders follow their actual construction layer, per-stretch (Reach+Side):
//   earth  → with earthwork/subgrade (stage 3, unchanged from before)
//   gsb    → with/after the GSB stage (4)
//   wmm    → with/after the WMM stage (5)
//   dbm    → strictly AFTER carriageway DBM (7) → 7.5 (before BC at 8)
//   bc     → strictly AFTER carriageway BC (8) → 8.5
//   paved  → complete/hard shoulder not split into layers → after BC (8.5)
// Fractional stages slot between the integer crust stages: the scheduler groups
// by distinct stage value, so 7.5 starts after stage-7 finishes (+lag).
export const SHOULDER_STAGE: Record<Exclude<ShoulderClass, "unclassified">, number> = {
  earth: 3,
  gsb:   4,
  wmm:   5,
  dbm:   7.5,
  bc:    8.5,
  paved: 8.5,
};

export const SHOULDER_REVIEW_REASON =
  "Shoulder sequence review required — the construction layer (earth/GSB/WMM/DBM/BC/paved) " +
  "could not be determined from the description. Confirm the shoulder layer so it can be staged correctly.";

// ─── Culvert / cross-drainage / drain sequence ───────────────────────────────
// Excavation → PCC bed → Pipe / RCC walls → Filter → Backfill → Headwall/Apron
const CULVERT_STAGE: Partial<Record<WorkType, number>> = {
  excavation_structure: 1,
  pcc:                  2,   // PCC bedding / levelling
  rcc:                  3,   // RCC walls, box sections
  pipe_culvert:         3,   // hume pipe / HDPE pipe laying
  reinforcement:        3,   // rebar concurrent with RCC walls
  filter_media:         4,   // drainage filter layer
  backfill_structure:   5,   // backfill behind walls / wingwalls
  drain_masonry:        6,   // headwall, wingwalls, masonry apron
  stone_pitching:       6,   // slope protection / apron pitching
  waterproofing_structure: 6,// final waterproofing treatment
};

// ─── Bridge / major structure sequence ───────────────────────────────────────
// Foundation Exc. → PCC → Foundation RCC → Substructure → Bearings/Backfill
// → Superstructure / Deck / Waterproofing / Wearing
// NOTE: Foundation (raft/pile cap) and Substructure (piers/abutments) both use
// the same rcc/reinforcement WorkType. The classifier assigns them both to stage 3.
// Planners should use manual stage assignment to split the two phases precisely.
const BRIDGE_STAGE: Partial<Record<WorkType, number>> = {
  excavation_structure: 1,   // foundation pit / pile boring
  pcc:                  2,   // PCC levelling course under foundation
  rcc:                  3,   // foundation (raft/pile cap) + substructure (piers/abutments)
  reinforcement:        3,   // rebar concurrent with RCC works above
  drain_masonry:        4,   // wing walls / return walls / approach slab masonry
  filter_media:         5,   // bearing pads / drainage layer
  backfill_structure:   5,   // backfill behind abutments
  pipe_culvert:         5,   // pipe drainage through abutment / wing wall
  waterproofing_structure: 6,// deck waterproofing / membrane
  bituminous_wearing:   6,   // wearing coat on bridge deck
  stone_pitching:       6,   // slope protection at toe / approach embankment
};

// ─── Exported sequence rules (used by Sequence Rules info panel in UI) ────────
export const SEQUENCE_RULES = {
  pavement: [
    { stage: 1, label: "Clearing & Grubbing (MoRTH Cl. 201)" },
    { stage: 2, label: "Dismantling Existing Structures / Pavement (Cl. 202)" },
    { stage: 3, label: "Earthwork — Roadway Excavation (Cl. 301) + Embankment/Borrow (Cl. 305) — concurrent" },
    { stage: 4, label: "Granular Sub-Base (GSB)" },
    { stage: 5, label: "WMM / DLC (Base Course)" },
    { stage: 6, label: "Prime Coat" },
    { stage: 7, label: "DBM / BM / Tack Coat (Binder Course)" },
    { stage: 8, label: "BC / SDBC (Wearing Course)" },
  ],
  culvert: [
    { stage: 1, label: "Foundation Excavation" },
    { stage: 2, label: "PCC Bedding / Levelling" },
    { stage: 3, label: "Pipe Laying / RCC Walls / Rebar" },
    { stage: 4, label: "Filter Media / Drainage Layer" },
    { stage: 5, label: "Structural Backfill" },
    { stage: 6, label: "Headwall / Wingwall / Stone Pitching / Apron" },
  ],
  bridge: [
    { stage: 1, label: "Foundation Excavation (Pit / Pile Boring)" },
    { stage: 2, label: "PCC Levelling Course" },
    { stage: 3, label: "Foundation (Raft / Isolated Footing / Pile Cap — RCC + Rebar)" },
    { stage: 4, label: "Substructure (Abutments / Piers / Wing Walls — RCC + Rebar)" },
    { stage: 5, label: "Bearings / Expansion Joints / Backfill" },
    { stage: 6, label: "Superstructure (Girders / Deck Slab)" },
    { stage: 7, label: "Wearing Course / Waterproofing / Parapet / Railing" },
  ],
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SeqInputItem {
  boqItemId: number;
  description: string;
  unit: string;
  totalQty: number;
  fullDurationMonths: number; // duration for totalQty at a single front
  planningWorkType?: "road" | "structure"; // stored DB hint — overrides classifier
  /** Persisted operational work-category code (e.g. "EARTHWORK", "BITUMINOUS").
   *  Used as a fallback when classifyWorkType cannot match the description+unit. */
  workCategory?: string | null;
  needsReview?: boolean; // if already flagged, still try to classify
  /** Planner-confirmed shoulder layer class (persisted on the BOQ item).
   *  Highest precedence for shoulder items — remembered across regenerations. */
  shoulderLayerClass?: string | null;
  /** 029C — the item's layerConfig.layerType classification (earthwork |
   *  granular | bituminous | spray_coat | concrete | none | null). Drives the
   *  automatic category allocation rule; NOT a user-facing basis selector. */
  layerType?: string | null;
}

/** Rich diagnostic record for a BOQ item that could not be placed in any stage. */
export interface UnclassifiedSeqItem {
  boqItemId: number;
  description: string;
  workCategory: string | null;
  unit: string;
  resolvedWorkType: WorkType | null;
  skipReason: string;
}

/** Per-item classification trace — returned by generateSequencedProgramme so callers
 *  can surface exactly how each item was resolved (or why it was skipped). */
export interface SeqDiagItem {
  boqItemId: number;
  description: string;
  unit: string;
  workCategory: string | null;
  planningWorkType: "road" | "structure" | undefined;
  resolvedWorkType: WorkType | null;
  track: Track;
  stage: number;
  wouldHaveBar: boolean;
  skipReason: string | null;
}

export interface SeqResult {
  bars: SeqBar[];
  /** Item IDs that could not be classified to any construction stage.
   *  Kept for backward compatibility — prefer unclassifiedItems for display. */
  unclassifiedItemIds: number[];
  /** Richer diagnostic records for every unclassified item. */
  unclassifiedItems: UnclassifiedSeqItem[];
  /** Per-item classification trace for all items that reached the sequencer. */
  diagnostics: SeqDiagItem[];
}

export interface SeqOptions {
  fronts: number;
  totalMonths: number;
  roadLengthKm: number;
  chainageStartKm?: number;
  staggerMonths?: number;    // mobilisation offset between successive reaches (default 1, 0 = concurrent)
  lagMonths?: number;        // gap between dependent stages within a reach (default 0.25)
  /** How many structure groups to create (≤ fronts). Each group covers one chainage zone.
   *  Quantity per bar = totalQty / structureGroups (not / fronts).
   *  Defaults to fronts when omitted. */
  structureGroups?: number;
  /** How many bridge groups to create (≤ fronts). Defaults to fronts when omitted. */
  bridgeGroups?: number;
  /**
   * When true, skip auto-generation of Struct. Front / Bridge Grp bars for
   * items classified as structure or bridge. Structure BOQ items will be
   * excluded from the auto-sequenced output entirely; planners must provide
   * structure bars via the Structure Schedule Import wizard instead.
   */
  disableStructureFronts?: boolean;
  /**
   * Instruction 029 — real user-entered stretch boundaries for the ROAD/pavement
   * front table. When provided (non-empty), these replace the equal division of
   * roadLengthKm by `fronts` for pavement bars. Structure/bridge groups are
   * unaffected. Each stretch carries an execution priority independent of its
   * chainage position: priority 1 mobilises first (stagger offset 0), priority 2
   * next, etc. Quantities default to the proportionate calculateStretchQty
   * formula; manualQtyFraction (share of the item's total qty, 0..1) overrides it.
   */
  stretches?: RoadStretchInput[];
}

/** Instruction 029 — one user-entered road stretch row. */
export interface RoadStretchInput {
  /** Optional custom label. When omitted, "Reach {priority}" is used so the
   *  visible number reflects EXECUTION priority, not chainage position. */
  label?: string | null;
  chainageFrom: number;
  chainageTo: number;
  /** Execution STAGE (029B — formerly unique priority; 1 = first to mobilise).
   *  Multiple stretches may share a stage: they start together (same offset).
   *  Independent of chainage order. */
  priority: number;
  /** 029B — optional free-text execution front label (e.g. "Front A").
   *  Same stage + same front + overlapping dates → non-blocking warning. */
  front?: string | null;
  /** 029B — display-only tiebreaker within a stage. Never implies sequence. */
  executionOrder?: number | null;
  /** Optional manual quantity share (fraction of each item's total qty, 0..1).
   *  null/undefined → proportionate calculateStretchQty default. */
  manualQtyFraction?: number | null;
  /** Instruction 030A — optional side for the stretch (full_width | lhs | rhs |
   *  both_sides | …). Carried onto every road bar generated for this stretch.
   *  null/undefined = unspecified ("Side Review Required"). */
  side?: string | null;
  /** 029C #11/#15 — optional planned carriageway width for this stretch (m).
   *  Only used for the automatic width-matched LHS/RHS split; never a basis
   *  selector. */
  plannedWidthM?: number | null;
}

/** One genuine chainage overlap between two stretches (blocking). */
export interface StretchOverlap {
  aIndex: number;
  bIndex: number;
  aLabel: string;
  bLabel: string;
  overlapFrom: number;
  overlapTo: number;
}

/** One uncovered chainage range (non-blocking warning — gaps can be legitimate). */
export interface StretchGap {
  from: number;
  to: number;
}

export interface StretchValidation {
  /** Blocking errors: malformed rows (to ≤ from, negative, unconfirmed side on overlapping chainage). */
  errors: string[];
  /** Blocking: genuine chainage overlaps between stretches (side-aware since 029B). */
  overlaps: StretchOverlap[];
  /** Non-blocking: uncovered ranges within [rangeFrom, rangeTo]. */
  gaps: StretchGap[];
  /** 029B — non-blocking warnings (e.g. same stage + same front double-booking). */
  warnings: string[];
}

const CH_EPS = 0.0005; // 0.5 m tolerance — touching boundaries are NOT overlaps

/**
 * Instruction 029 Part C — single source of truth for stretch gap/overlap
 * validation, shared by the Auto-Sequence dialog (client) and the
 * /auto-sequence + bar-save routes (server). Overlaps and malformed rows are
 * blocking; gaps are warnings only.
 */
export function validateStretches(
  stretches: Array<Pick<RoadStretchInput, "label" | "chainageFrom" | "chainageTo" | "priority" | "side" | "front">>,
  rangeFrom?: number | null,
  rangeTo?: number | null,
): StretchValidation {
  const errors: string[] = [];
  const overlaps: StretchOverlap[] = [];
  const gaps: StretchGap[] = [];
  const warnings: string[] = [];
  const labelOf = (s: { label?: string | null; priority: number }, i: number) =>
    (s.label && s.label.trim()) || `Reach ${s.priority || i + 1}`;

  stretches.forEach((s, i) => {
    if (!Number.isFinite(s.chainageFrom) || !Number.isFinite(s.chainageTo)) {
      errors.push(`${labelOf(s, i)}: chainage must be numeric`);
    } else if (s.chainageTo - s.chainageFrom <= CH_EPS) {
      errors.push(`${labelOf(s, i)}: chainage-to must be greater than chainage-from`);
    } else if (s.chainageFrom < -CH_EPS) {
      errors.push(`${labelOf(s, i)}: chainage cannot be negative`);
    }
    if (!Number.isFinite(s.priority) || s.priority < 1 || Math.floor(s.priority) !== s.priority) {
      errors.push(`${labelOf(s, i)}: execution stage must be a whole number ≥ 1`);
    }
  });
  // 029B Part C: duplicate stages are NORMAL (parallel fronts) — the old
  // "priority used more than once" blocking rule is intentionally gone.

  // Overlaps — strict interior intersection (touching boundaries allowed).
  // 029B Part D: side-aware. Physically distinct corridors (LHS vs RHS, etc.)
  // sharing chainage are NOT overlaps. The interval math itself is unchanged.
  const sideConfirmFlagged = new Set<string>();
  for (let i = 0; i < stretches.length; i++) {
    for (let j = i + 1; j < stretches.length; j++) {
      const a = stretches[i], b = stretches[j];
      const from = Math.max(a.chainageFrom, b.chainageFrom);
      const to = Math.min(a.chainageTo, b.chainageTo);
      if (to - from > CH_EPS) {
        const aSide = (a as any).side ?? null;
        const bSide = (b as any).side ?? null;
        if (areSidesDistinctCorridors(aSide, bSide)) continue; // e.g. LHS vs RHS — not an overlap
        if (aSide == null || bSide == null) {
          // Never silently separate or silently block on an unconfirmed side.
          const key = `${i}-${j}`;
          if (!sideConfirmFlagged.has(key)) {
            sideConfirmFlagged.add(key);
            errors.push(
              `${labelOf(a, i)} and ${labelOf(b, j)} share chainage Km ${+from.toFixed(3)}–${+to.toFixed(3)}: side must be confirmed before overlapping chainage stretches can be validated`,
            );
          }
          continue;
        }
        overlaps.push({
          aIndex: i, bIndex: j,
          aLabel: labelOf(a, i), bLabel: labelOf(b, j),
          overlapFrom: +from.toFixed(3), overlapTo: +to.toFixed(3),
        });
      }
    }
  }

  // 029B Part C: non-blocking same-stage same-front double-booking warning.
  // Stretches in the same stage start together, so a shared (non-empty) front
  // label within one stage means the front is planned to work two stretches
  // at once. Warn — do not block; no capacity modelling in this batch.
  const frontKey = (s: { front?: string | null }) => (s.front ?? "").trim().toLowerCase();
  const byStageFront = new Map<string, number[]>();
  stretches.forEach((s, i) => {
    const f = frontKey(s);
    if (!f || !Number.isFinite(s.priority)) return;
    const k = `${s.priority}::${f}`;
    byStageFront.set(k, [...(byStageFront.get(k) ?? []), i]);
  });
  Array.from(byStageFront.entries()).forEach(([k, idxs]) => {
    if (idxs.length < 2) return;
    const stage = k.split("::")[0];
    warnings.push(
      `Front "${(stretches[idxs[0]] as any).front}" is double-booked in stage ${stage} (${idxs.map(i => labelOf(stretches[i] as any, i)).join(", ")} start together). Allowed — but the same front cannot physically work two stretches at once.`,
    );
  });

  // Gaps — only when a real range is known.
  if (rangeFrom != null && rangeTo != null && rangeTo - rangeFrom > CH_EPS && stretches.length > 0) {
    const sorted = [...stretches]
      .filter((s) => Number.isFinite(s.chainageFrom) && Number.isFinite(s.chainageTo) && s.chainageTo > s.chainageFrom)
      .sort((a, b) => a.chainageFrom - b.chainageFrom);
    let cursor = rangeFrom;
    for (const s of sorted) {
      if (s.chainageFrom - cursor > CH_EPS) {
        gaps.push({ from: +cursor.toFixed(3), to: +Math.min(s.chainageFrom, rangeTo).toFixed(3) });
      }
      cursor = Math.max(cursor, s.chainageTo);
    }
    if (rangeTo - cursor > CH_EPS) gaps.push({ from: +cursor.toFixed(3), to: +rangeTo.toFixed(3) });
  }

  return { errors, overlaps, gaps, warnings };
}

export interface SeqBar {
  boqItemId: number;
  reachLabel: string;
  chainageFrom: number;
  chainageTo: number;
  startMonth: number;
  endMonth: number;
  plannedQty: number;
  isQtyOverride: boolean;
  isDurationOverride: boolean;
  /** Always "auto-sequence" so the route can safely replace only auto-generated bars */
  source: "auto-sequence";
  /** Instruction 029/029B — execution STAGE for road-reach bars (1 = first;
   *  stages may be shared by parallel stretches). Stored in
   *  work_program_bars.sequenceOrder. Undefined for structure/bridge
   *  group bars (their sequencing is unchanged). */
  sequenceOrder?: number;
  /** 029B — free-text front label carried onto road bars. */
  executionFront?: string | null;
  /** 029B — display-only tiebreaker within a stage. */
  executionOrder?: number | null;
  /** 030A/029C — stretch side carried onto the bar. */
  side?: string | null;
  /** 029C — planned width from the stretch (m), when supplied. */
  plannedWidthM?: number | null;
  /** 029C — which automatic category rule computed plannedQty. */
  allocationRule?: "pavement" | "earthwork-estimate" | "mt-proportional" | "manual";
  /** 029C — non-blocking allocation note (e.g. width-split fallback). */
  allocationNote?: string | null;
  /** 029C — persisted bar note (earthwork "Planning Estimate" label). */
  notes?: string | null;
}

// ─── 029C: automatic category-aware side allocation helpers ──────────────────
// One-sided corridors get half the length-proportional share by default;
// full-width/both-sides/median (and unspecified) stretches get the full share.
const ONE_SIDED_CORRIDORS = new Set([
  "lhs", "rhs", "shoulder_lhs", "shoulder_rhs", "service_road_lhs", "service_road_rhs",
]);

export const WIDTH_SPLIT_FALLBACK_NOTE =
  "Width-based split needs matching LHS/RHS reach boundaries; using standard side allocation.";

export const EARTHWORK_ESTIMATE_LABEL =
  "Planning Estimate — based on BOQ quantity and reach length.";

/** 029C #12: MT-UOM detection for bituminous items — proportional only, never density/geometry. */
function isMtUnit(unit: string): boolean {
  return /^\s*(mt|ton(ne)?s?)\b/i.test(unit ?? "");
}

/** 029C: automatic allocation rule for an item (no user selector). */
export function allocationRuleForItem(it: Pick<SeqInputItem, "layerType" | "unit">): "pavement" | "earthwork-estimate" | "mt-proportional" {
  if (it.layerType === "earthwork") return "earthwork-estimate";
  if (it.layerType === "bituminous" && isMtUnit(it.unit)) return "mt-proportional";
  return "pavement";
}

/**
 * 029C #9-#11: side fraction for a stretch, given all stretches for the run.
 * - full_width/both_sides/median/null → 1
 * - one-sided → 0.5, EXCEPT the width-matched case: an lhs/rhs pair with
 *   IDENTICAL boundaries and both plannedWidthM set splits w/(wL+wR).
 * - one-sided with widths but mismatched boundaries → 0.5 + fallback note.
 */
export function sideShareForStretch(
  st: { chainageFrom: number; chainageTo: number; side?: string | null; plannedWidthM?: number | null },
  all: Array<{ chainageFrom: number; chainageTo: number; side?: string | null; plannedWidthM?: number | null }>,
): { fraction: number; note: string | null } {
  const side = st.side ?? null;
  if (side == null || !ONE_SIDED_CORRIDORS.has(side)) return { fraction: 1, note: null };
  // Width-matched split only for the plain lhs/rhs carriageway pair.
  const opposite = side === "lhs" ? "rhs" : side === "rhs" ? "lhs" : null;
  if (opposite && st.plannedWidthM != null && st.plannedWidthM > 0) {
    const EPS = 0.0005;
    const exact = all.find(o =>
      o !== st && (o.side ?? null) === opposite &&
      Math.abs(o.chainageFrom - st.chainageFrom) <= EPS &&
      Math.abs(o.chainageTo - st.chainageTo) <= EPS &&
      o.plannedWidthM != null && o.plannedWidthM > 0,
    );
    if (exact) {
      return { fraction: st.plannedWidthM / (st.plannedWidthM + exact.plannedWidthM!), note: null };
    }
    // A width was supplied but no exactly-matching counterpart: if an
    // opposite-side stretch overlaps this chainage at all, surface the
    // explicit fallback note (segmented width math is 029D's scope).
    const partial = all.some(o =>
      o !== st && (o.side ?? null) === opposite &&
      Math.min(o.chainageTo, st.chainageTo) - Math.max(o.chainageFrom, st.chainageFrom) > EPS &&
      o.plannedWidthM != null && o.plannedWidthM > 0,
    );
    if (partial) return { fraction: 0.5, note: WIDTH_SPLIT_FALLBACK_NOTE };
  }
  return { fraction: 0.5, note: null };
}

// ─── Internal classify result ─────────────────────────────────────────────────
interface ClassifyResult {
  track: Track;
  stage: number;
  resolvedWorkType: WorkType | null;
  skipReason: string | null;
}

// ─── workCategory → track + stage (last-resort, when wt still null) ──────────
// Fires only when resolveWorkType could not derive a WorkType from the description
// or workCategory (e.g. ROAD_FURNITURE, ELECTRICAL, BUILDINGS which have no
// recipe template and therefore no canonical WorkType in WORK_CAT_FALLBACK_WORK_TYPE).
function stageByWorkCategory(wc: string): { track: Track; stage: number } | null {
  // Road-side works installed before everything else
  if (wc === "PRELIM" || wc === "MOBILISATION")              return { track: "pavement", stage: 1 };
  if (wc === "SITE_CLEARANCE")                               return { track: "pavement", stage: 2 };
  if (wc === "EARTHWORK" || wc === "SHOULDERS_MEDIANS")     return { track: "pavement", stage: 3 };
  if (wc === "SUBBASE_BASE")                                 return { track: "pavement", stage: 4 };
  if (wc === "BITUMINOUS")                                   return { track: "pavement", stage: 7 };
  // Road furniture / electrical / misc civil — installed after pavement is complete
  if (wc === "ROAD_FURNITURE" || wc === "ELECTRICAL" ||
      wc === "BUILDINGS"       || wc === "ENVIRONMENTAL")   return { track: "pavement", stage: 9 };
  // Structure types
  if (wc === "CONCRETE")                                     return { track: "structure", stage: 3 };
  if (wc === "DRAINAGE" || wc === "CROSS_DRAINAGE")         return { track: "structure", stage: 3 };
  if (wc === "MAJOR_BRIDGES")                                return { track: "bridge",    stage: 3 };
  return null;
}

// ─── Item classifier ──────────────────────────────────────────────────────────
// Uses resolveWorkType() — the same shared resolver used by Auto-build Recipes —
// so items with a saved Work Category are correctly classified even when the
// description-only regex returns null.  This fixes the regression where items
// such as "Roadway Excavation (EARTHWORK)" and "WMM base course (SUBBASE_BASE)"
// were placed in "other" simply because their descriptions did not match a regex.
function classifyItem(it: SeqInputItem): ClassifyResult {
  // Resolve via the shared three-tier resolver:
  //   Tier 1: classifyWorkType (description + canonical unit regex)
  //   Tier 2: WORK_CAT_FALLBACK_WORK_TYPE[workCategory] with sub-classification
  //   Tier 3: null + diagnostic reason
  const resolution = resolveWorkType(it.description, it.unit, {
    workCategory: it.workCategory,
  });
  const wt = resolution.workType;

  // Resolve effective planning track.
  // The stored planningWorkType is the primary hint, BUT if the WorkType
  // classifier definitively disagrees (e.g. item is clearly road earthwork
  // yet stored as "structure" because its description mentions "structure
  // excavation" as a source of material), trust the WorkType.
  let effectivePWT = it.planningWorkType;
  if (wt !== null && effectivePWT) {
    const wtCategory = WORK_TYPE_PLAN_CATEGORY[wt]; // "road" | "structure" | undefined
    if (wtCategory === "road" && effectivePWT === "structure") effectivePWT = "road";
    // Only flip road→structure when workCategory ALSO confirms structure (or is unset).
    // Prevents Tier-1 description-regex false positives from overriding an explicitly
    // road planningWorkType + road workCategory — e.g. "Earthwork excavation in road
    // way...for trench cutting" matching excavation_structure despite wc=EARTHWORK.
    if (wtCategory === "structure" && effectivePWT === "road") {
      const catResult = it.workCategory ? stageByWorkCategory(it.workCategory) : null;
      if (!catResult || catResult.track !== "pavement") {
        // workCategory is either not set or itself indicates structure → trust the WType
        effectivePWT = "structure";
      }
      // else: workCategory is a road category (EARTHWORK, SUBBASE_BASE, BITUMINOUS…)
      //       Keep effectivePWT=road — saved categories take precedence over regex.
    }
  }

  // 0. Shoulder items (road track only) — stage by ACTUAL construction layer.
  // Precedence: planner-confirmed shoulderLayerClass (persisted, survives
  // regeneration) → description sub-classifier → review-required (never a
  // silent earthwork default).
  if (effectivePWT !== "structure" && isShoulderDesc(it.description)) {
    const persisted = (it.shoulderLayerClass ?? "").trim().toLowerCase();
    const cls: ShoulderClass = (SHOULDER_CLASSES as readonly string[]).includes(persisted)
      ? (persisted as ShoulderClass)
      : classifyShoulderLayer(it.description);
    if (cls !== "unclassified") {
      return { track: "pavement", stage: SHOULDER_STAGE[cls], resolvedWorkType: wt, skipReason: null };
    }
    return { track: "other", stage: 99, resolvedWorkType: wt, skipReason: SHOULDER_REVIEW_REASON };
  }

  // 1. planningWorkType = "road" ─────────────────────────────────────────────
  if (effectivePWT === "road") {
    if (wt !== null) {
      const stage = PAVEMENT_STAGE[wt];
      if (stage !== undefined) {
        return { track: "pavement", stage, resolvedWorkType: wt, skipReason: null };
      }
      // wt is not in PAVEMENT_STAGE (e.g. a structure-family WorkType that slipped
      // through on a confirmed road item — "excavation_structure" on wc=EARTHWORK).
      // Fall through to the workCategory stage map rather than silently using stage 99.
    }
    // resolveWorkType returned null OR wt is not in PAVEMENT_STAGE —
    // try workCategory direct stage map before giving up.
    // Handles ROAD_FURNITURE, ELECTRICAL, BUILDINGS, and wt-mismatch cases.
    if (it.workCategory) {
      const catResult = stageByWorkCategory(it.workCategory);
      if (catResult) return { ...catResult, resolvedWorkType: wt, skipReason: null };
    }
    return {
      track: "other",
      stage: 99,
      resolvedWorkType: null,
      skipReason: resolution.reason
        ?? `planningWorkType=road but no work type or category stage could be derived (workCategory: ${it.workCategory ?? "not set"})`,
    };
  }

  // 2. planningWorkType = "structure" ────────────────────────────────────────
  if (effectivePWT === "structure") {
    if (isBridgeDesc(it.description)) {
      const stage = wt !== null ? (BRIDGE_STAGE[wt] ?? 99) : 99;
      return { track: "bridge", stage, resolvedWorkType: wt, skipReason: null };
    }
    const stage = wt !== null ? (CULVERT_STAGE[wt] ?? 99) : 99;
    return { track: "structure", stage, resolvedWorkType: wt, skipReason: null };
  }

  // 3. No stored planningWorkType — classify from WorkType + description ─────
  if (wt === null) {
    // resolveWorkType already tried both the description regex AND the
    // workCategory fallback.  The only remaining option is the direct
    // category-to-stage map for categories with no canonical WorkType.
    if (it.workCategory) {
      const catResult = stageByWorkCategory(it.workCategory);
      if (catResult) return { ...catResult, resolvedWorkType: null, skipReason: null };
    }
    return {
      track: "other",
      stage: 99,
      resolvedWorkType: null,
      skipReason: resolution.reason
        ?? `No work type or category recognised — assign a Work Category in BOQ Item Review`,
    };
  }

  if (wt in PAVEMENT_STAGE) {
    return { track: "pavement", stage: PAVEMENT_STAGE[wt]!, resolvedWorkType: wt, skipReason: null };
  }

  // Structure work types — distinguish bridge from culvert by description.
  if (isBridgeDesc(it.description)) {
    return { track: "bridge", stage: BRIDGE_STAGE[wt] ?? 99, resolvedWorkType: wt, skipReason: null };
  }

  if (wt in CULVERT_STAGE) {
    return { track: "structure", stage: CULVERT_STAGE[wt]!, resolvedWorkType: wt, skipReason: null };
  }

  return {
    track: "other",
    stage: 99,
    resolvedWorkType: wt,
    skipReason: `Work type "${wt}" has no sequence stage — not in pavement, culvert, or bridge stage maps`,
  };
}

// ─── Main sequencer ───────────────────────────────────────────────────────────
export function generateSequencedProgramme(items: SeqInputItem[], opts: SeqOptions): SeqResult {
  const fronts = Math.max(1, Math.floor(opts.fronts || 1));
  const lag = opts.lagMonths ?? 0.25;
  const stagger = opts.staggerMonths ?? 1;
  const startCh = opts.chainageStartKm ?? 0;
  const reachLen = opts.roadLengthKm > 0 ? opts.roadLengthKm / fronts : 0;

  // Classify every item
  const classified = items.map((it) => ({ it, ...classifyItem(it) }));

  const pav = classified.filter((c) => c.track === "pavement").sort((a, b) => a.stage - b.stage);
  const str = classified.filter((c) => c.track === "structure").sort((a, b) => a.stage - b.stage);
  const brg = classified.filter((c) => c.track === "bridge").sort((a, b) => a.stage - b.stage);
  // "other" track = items with no classifiable stage. We DON'T schedule them
  // at Month 1 (old behaviour). Instead, we skip them and return their IDs so
  // the caller can mark them needsReview = true in the DB.
  const oth = classified.filter((c) => c.track === "other");
  const unclassifiedItemIds = oth.map((c) => c.it.boqItemId);
  const unclassifiedItems: UnclassifiedSeqItem[] = oth.map((c) => ({
    boqItemId: c.it.boqItemId,
    description: c.it.description,
    workCategory: c.it.workCategory ?? null,
    unit: c.it.unit,
    resolvedWorkType: c.resolvedWorkType,
    skipReason: c.skipReason ?? "No work type or category recognised — assign a Work Category in BOQ Item Review",
  }));

  // Build per-item diagnostic trace for all items (classified and unclassified).
  const classifiedIds = new Set(classified.filter(c => c.track !== "other").map(c => c.it.boqItemId));
  const diagnostics: SeqDiagItem[] = classified.map((c) => ({
    boqItemId: c.it.boqItemId,
    description: c.it.description,
    unit: c.it.unit,
    workCategory: c.it.workCategory ?? null,
    planningWorkType: c.it.planningWorkType,
    resolvedWorkType: c.resolvedWorkType,
    track: c.track,
    stage: c.stage,
    wouldHaveBar: classifiedIds.has(c.it.boqItemId),
    skipReason: c.skipReason,
  }));

  const bars: SeqBar[] = [];

  const mkBar = (
    it: SeqInputItem,
    label: string,
    chF: number,
    chT: number,
    start: number,
    end: number,
    qty: number,
  ): SeqBar => ({
    boqItemId: it.boqItemId,
    reachLabel: label,
    chainageFrom: +chF.toFixed(3),
    chainageTo: +chT.toFixed(3),
    startMonth: start,
    endMonth: end,
    plannedQty: +qty.toFixed(3),
    isQtyOverride: true,
    isDurationOverride: false,
    source: "auto-sequence",
  });

  // ── Road (pavement) fronts ────────────────────────────────────────────────
  // Instruction 029: when real stretch rows are supplied, they drive chainage,
  // quantity, and execution-priority order. Otherwise the legacy equal split of
  // roadLengthKm by `fronts` applies (with default priority = chainage order).
  const roadStretches: Array<{
    label: string;
    chainageFrom: number;
    chainageTo: number;
    priority: number;
    manualQtyFraction: number | null;
    side: string | null;
    front: string | null;          // 029B
    executionOrder: number | null; // 029B
    plannedWidthM: number | null;  // 029C
  }> =
    opts.stretches && opts.stretches.length > 0
      ? opts.stretches.map((s, i) => ({
          label: (s.label && s.label.trim()) || (opts.stretches!.length > 1 ? `Reach ${s.priority}` : "Full Length"),
          chainageFrom: s.chainageFrom,
          chainageTo: s.chainageTo,
          priority: Number.isFinite(s.priority) && s.priority >= 1 ? Math.floor(s.priority) : i + 1,
          manualQtyFraction:
            s.manualQtyFraction != null && s.manualQtyFraction > 0 ? Math.min(1, s.manualQtyFraction) : null,
          side: s.side ?? null, // 030A — never default to Full Width silently
          front: typeof s.front === "string" && s.front.trim() ? s.front.trim() : null, // 029B
          executionOrder: s.executionOrder != null && Number.isFinite(s.executionOrder) ? Math.floor(s.executionOrder) : null, // 029B
          plannedWidthM: s.plannedWidthM != null && Number.isFinite(s.plannedWidthM) && s.plannedWidthM > 0 ? s.plannedWidthM : null, // 029C
        }))
      : Array.from({ length: fronts }, (_, r) => ({
          label: fronts > 1 ? `Reach ${r + 1}` : "Full Length",
          chainageFrom: startCh + r * reachLen,
          chainageTo: startCh + (r + 1) * reachLen,
          priority: r + 1, // default execution stage = chainage order
          manualQtyFraction: null,
          side: null,
          front: null,
          executionOrder: null,
          plannedWidthM: null,
        }));

  // Mobilisation order follows EXECUTION STAGE, not chainage position.
  // 029B Part C: stretches SHARING a stage share the same stagger offset —
  // they start together. Offsets advance by distinct-stage rank, so stage 1
  // gets offset 0, stage 2 gets 1×stagger, … regardless of how many parallel
  // stretches each stage contains.
  const byPriority = [...roadStretches].sort((a, b) => a.priority - b.priority);
  const totalRoadLen = opts.roadLengthKm > 0 ? opts.roadLengthKm : 0;
  const distinctStages = Array.from(new Set(byPriority.map(s => s.priority))).sort((a, b) => a - b);
  const stageRank = new Map(distinctStages.map((s, i) => [s, i]));

  for (let rank = 0; rank < byPriority.length; rank++) {
    const st = byPriority[rank];
    const offset = (stageRank.get(st.priority) ?? 0) * stagger; // distinct-stage rank drives the stagger
    const stretchLen = Math.max(0, st.chainageTo - st.chainageFrom);
    // 029C: base length-proportional share (identical to calculateStretchQty:
    // boqQty × stretchLen / roadLen), then a side fraction on top for one-sided
    // corridors. manualQtyFraction remains an explicit override that BYPASSES
    // all automatic side-fraction math.
    const lengthShare = totalRoadLen > 0 ? stretchLen / totalRoadLen : 1 / byPriority.length;
    const sideShare = sideShareForStretch(st, byPriority);
    const share =
      st.manualQtyFraction != null
        ? st.manualQtyFraction
        : lengthShare * sideShare.fraction;

    let pavCursor = offset;
    let prevPavStage = -1;
    let pavStageStart = offset;
    let pavStageDur = 0;
    for (const c of pav) {
      const qty = c.it.totalQty * share;
      const dur = Math.max(0.1, c.it.fullDurationMonths * (totalRoadLen > 0 ? stretchLen / totalRoadLen : 1 / byPriority.length));
      if (c.stage !== prevPavStage) {
        // Close the previous stage group and advance cursor
        if (prevPavStage !== -1) pavCursor = pavStageStart + pavStageDur + lag;
        pavStageStart = pavCursor;
        pavStageDur = 0;
        prevPavStage = c.stage;
      }
      const bar = mkBar(c.it, st.label, st.chainageFrom, st.chainageTo, pavStageStart, pavStageStart + dur, qty);
      bar.sequenceOrder = st.priority; // Instruction 029/029B — execution stage (shared = parallel)
      bar.side = st.side;              // Instruction 030A — stretch side carried onto every road bar
      bar.executionFront = st.front ?? null;           // 029B — front label
      bar.executionOrder = st.executionOrder ?? null;  // 029B — display-only tiebreaker
      bar.plannedWidthM = st.plannedWidthM;            // 029C — width carried for round-trip + width split
      // 029C: category rule + labels — no user-facing basis selector.
      const rule = st.manualQtyFraction != null ? "manual" : allocationRuleForItem(c.it);
      bar.allocationRule = rule;
      bar.allocationNote = st.manualQtyFraction != null ? null : sideShare.note;
      if (rule === "earthwork-estimate") {
        bar.notes = EARTHWORK_ESTIMATE_LABEL; // visible on the bar after persist
      }
      bars.push(bar);
      pavStageDur = Math.max(pavStageDur, dur);
    }
    // "other" items are NOT scheduled here — they are returned in unclassifiedItemIds.
  }

  // ── Structure (culvert / drain) fronts ─────────────────────────────────────
  // Culverts/drains are distributed along the road. We create at most `fronts`
  // independent structure groups; each group covers the matching chainage zone.
  // The number of groups is controlled by opts.structureGroups (≤ fronts).
  // Every group runs the COMPLETE MoRTH culvert stage cycle (excav→PCC→RCC→
  // bedding→backfill→headwall) so planners see the full sequence per zone.
  // Quantity per bar = totalQty / numStrGroups (task spec §3).
  // Skipped when disableStructureFronts = true — structure bars are instead
  // imported via the Structure Schedule Import wizard per physical location.
  if (str.length > 0 && !opts.disableStructureFronts) {
    const numStrGroups = Math.max(1, Math.floor(opts.structureGroups ?? fronts));
    const strReachLen  = opts.roadLengthKm > 0 ? opts.roadLengthKm / numStrGroups : 0;
    for (let g = 0; g < numStrGroups; g++) {
      const strLabel = numStrGroups > 1 ? `Struct. Front ${g + 1}` : "Structures";
      const chFrom = startCh + g * strReachLen;
      const chTo   = startCh + (g + 1) * strReachLen;
      // Map structure group g to the nearest road front for its stagger offset.
      const roadFront = Math.round((g / Math.max(1, numStrGroups - 1)) * (fronts - 1));
      let strCursor = roadFront * stagger;
      let prevStrStage = -1;
      let strStageStart = strCursor;
      let strStageDur = 0;
      for (const c of str) {
        const qty = c.it.totalQty / numStrGroups;
        const dur = Math.max(0.1, c.it.fullDurationMonths / numStrGroups);
        if (c.stage !== prevStrStage) {
          if (prevStrStage !== -1) strCursor = strStageStart + strStageDur + lag;
          strStageStart = strCursor;
          strStageDur = 0;
          prevStrStage = c.stage;
        }
        bars.push(mkBar(c.it, strLabel, chFrom, chTo, strStageStart, strStageStart + dur, qty));
        strStageDur = Math.max(strStageDur, dur);
      }
    }
  }

  // ── Bridge / major-structure fronts ────────────────────────────────────────
  // Bridge items occupy specific chainage points. We create at most `fronts`
  // bridge groups (controlled by opts.bridgeGroups). Each group covers the
  // matching chainage zone and runs the full bridge stage cycle.
  // Quantity per bar = totalQty / numBrgGroups (task spec §3).
  // Skipped when disableStructureFronts = true (same as structure above).
  if (brg.length > 0 && !opts.disableStructureFronts) {
    const numBrgGroups = Math.max(1, Math.floor(opts.bridgeGroups ?? fronts));
    const brgReachLen  = opts.roadLengthKm > 0 ? opts.roadLengthKm / numBrgGroups : 0;
    for (let g = 0; g < numBrgGroups; g++) {
      const brgLabel = numBrgGroups > 1 ? `Bridge Grp ${g + 1}` : "Bridges";
      const chFrom = startCh + g * brgReachLen;
      const chTo   = startCh + (g + 1) * brgReachLen;
      const roadFront = Math.round((g / Math.max(1, numBrgGroups - 1)) * (fronts - 1));
      let brgCursor = roadFront * stagger;
      let prevBrgStage = -1;
      let brgStageStart = brgCursor;
      let brgStageDur = 0;
      for (const c of brg) {
        const qty = c.it.totalQty / numBrgGroups;
        const dur = Math.max(0.1, c.it.fullDurationMonths / numBrgGroups);
        if (c.stage !== prevBrgStage) {
          if (prevBrgStage !== -1) brgCursor = brgStageStart + brgStageDur + lag;
          brgStageStart = brgCursor;
          brgStageDur = 0;
          prevBrgStage = c.stage;
        }
        bars.push(mkBar(c.it, brgLabel, chFrom, chTo, brgStageStart, brgStageStart + dur, qty));
        brgStageDur = Math.max(brgStageDur, dur);
      }
    }
  }

  if (!bars.length) return { bars, unclassifiedItemIds, unclassifiedItems, diagnostics };

  // Scale the critical chain so the last bar ends at (totalMonths - 1), then
  // shift everything to 1-indexed month numbers (Month 1 = project start).
  const maxEnd = bars.reduce((m, b) => Math.max(m, b.endMonth), 0);
  const target = opts.totalMonths > 1 ? opts.totalMonths - 1 : opts.totalMonths;
  const scale  = maxEnd > target && target > 0 ? target / maxEnd : 1;

  for (const b of bars) {
    b.startMonth = +(1 + b.startMonth * scale).toFixed(2);
    b.endMonth   = +(1 + b.endMonth   * scale).toFixed(2);
    if (opts.totalMonths > 0 && b.endMonth > opts.totalMonths) b.endMonth = opts.totalMonths;
    if (b.endMonth <= b.startMonth) b.endMonth = +(b.startMonth + 0.1).toFixed(2);
  }

  return { bars, unclassifiedItemIds, unclassifiedItems, diagnostics };
}
