// Deterministic reach-wise auto-sequencer with dependencies + multiple fronts.
// Pure TypeScript — imports only the pure classifier. Produces Work Programme bars
// where each reach (front) runs the crust sequence in dependency order, reaches run
// in parallel (staggered), and the critical chain is scaled to fit the project duration.

import { classifyWorkType, WORK_TYPE_PLAN_CATEGORY, type WorkType } from "./workTypeRecipes";

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
}

// ─── Item classifier ──────────────────────────────────────────────────────────
function classifyItem(it: SeqInputItem): { track: Track; stage: number } {
  const wt = classifyWorkType(it.description, it.unit);

  // Resolve effective planning track.
  // The stored planningWorkType is the primary hint, BUT if the WorkType
  // classifier definitively disagrees (e.g. item is clearly road earthwork
  // yet stored as "structure" because its description mentions "structure
  // excavation" as a source of material), trust the WorkType.
  let effectivePWT = it.planningWorkType;
  if (wt !== null && effectivePWT) {
    const wtCategory = WORK_TYPE_PLAN_CATEGORY[wt]; // "road" | "structure" | undefined
    if (wtCategory === "road" && effectivePWT === "structure") effectivePWT = "road";
    if (wtCategory === "structure" && effectivePWT === "road") effectivePWT = "structure";
  }

  // 1. Use (corrected) planningWorkType as the track hint.
  if (effectivePWT === "road") {
    const stage = wt !== null ? (PAVEMENT_STAGE[wt] ?? 99) : 99;
    return { track: "pavement", stage };
  }

  if (effectivePWT === "structure") {
    if (isBridgeDesc(it.description)) {
      const stage = wt !== null ? (BRIDGE_STAGE[wt] ?? 99) : 99;
      return { track: "bridge", stage };
    }
    const stage = wt !== null ? (CULVERT_STAGE[wt] ?? 99) : 99;
    return { track: "structure", stage };
  }

  // 2. No stored hint — classify from WorkType + description.
  if (wt === null) return { track: "other", stage: 99 };

  if (wt in PAVEMENT_STAGE) {
    return { track: "pavement", stage: PAVEMENT_STAGE[wt]! };
  }

  // Structure work types — distinguish bridge from culvert by description.
  if (isBridgeDesc(it.description)) {
    return { track: "bridge", stage: BRIDGE_STAGE[wt] ?? 99 };
  }

  if (wt in CULVERT_STAGE) {
    return { track: "structure", stage: CULVERT_STAGE[wt]! };
  }

  return { track: "other", stage: 99 };
}

// ─── Main sequencer ───────────────────────────────────────────────────────────
export function generateSequencedProgramme(items: SeqInputItem[], opts: SeqOptions): SeqBar[] {
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
  const oth = classified.filter((c) => c.track === "other");

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

  for (let r = 0; r < fronts; r++) {
    const chFrom = startCh + r * reachLen;
    const chTo   = startCh + (r + 1) * reachLen;
    const offset = r * stagger; // each reach/group starts `stagger` months later

    // ── Road (pavement) front ──────────────────────────────────────────────────
    // Items at the same stage start concurrently (same stageStart); the cursor
    // only advances after each stage group using the MAX duration in that group.
    const reachLabel = fronts > 1 ? `Reach ${r + 1}` : "Full Length";
    let pavCursor = offset;
    let prevPavStage = -1;
    let pavStageStart = offset;
    let pavStageDur = 0;
    for (const c of pav) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      if (c.stage !== prevPavStage) {
        // Close the previous stage group and advance cursor
        if (prevPavStage !== -1) pavCursor = pavStageStart + pavStageDur + lag;
        pavStageStart = pavCursor;
        pavStageDur = 0;
        prevPavStage = c.stage;
      }
      bars.push(mkBar(c.it, reachLabel, chFrom, chTo, pavStageStart, pavStageStart + dur, qty));
      pavStageDur = Math.max(pavStageDur, dur);
    }
    for (const c of oth) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      bars.push(mkBar(c.it, reachLabel, chFrom, chTo, offset, offset + dur, qty));
    }

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

  if (!bars.length) return bars;

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

  return bars;
}
