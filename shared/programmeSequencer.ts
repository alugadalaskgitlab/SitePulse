// Deterministic reach-wise auto-sequencer with dependencies + multiple fronts.
// Pure TypeScript — imports only the pure classifier. Produces Work Programme bars
// where each reach (front) runs the crust sequence in dependency order, reaches run
// in parallel (staggered), and the critical chain is scaled to fit the project duration.

import { classifyWorkType, type WorkType } from "./workTypeRecipes";

export type Track = "pavement" | "structure" | "bridge" | "other";

// ─── Bridge keyword detector ──────────────────────────────────────────────────
// Fires for bridges, viaducts, flyovers, retaining/breast walls.
// Used to route structure items onto the bridge track instead of culvert track.
function isBridgeDesc(desc: string): boolean {
  return /\bbridge\b|viaduct|flyover|abutment|pier\b|bearing\b|girder|deck\s*slab|superstructure|substructure|pile\s*cap|pylon|\barch\b|major\s*bridge|minor\s*bridge|retaining\s*wall|breast\s*wall/i.test(desc);
}

// ─── Pavement crust (road items) ─────────────────────────────────────────────
// IRC / MoRTH Clause 400–500 sequence for flexible pavements.
const PAVEMENT_STAGE: Partial<Record<WorkType, number>> = {
  earthwork:          1,   // embankment / subgrade preparation
  gsb:                2,   // granular sub-base
  wmm:                3,   // wet mix macadam base course
  dlc:                3,   // dry lean concrete (rigid alternative sub-base)
  prime_coat:         4,   // spray on completed WMM/GSB before bituminous
  tack_coat:          5,   // inter-layer spray coat
  bituminous_base:    5,   // DBM / BM binder course
  pqc:                5,   // pavement quality concrete (rigid pavement)
  bituminous_wearing: 6,   // BC / SDBC wearing course — always last
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
// Foundation Exc. → PCC → Substructure (pier/abutment + rebar) → Bearing/Backfill
// → Superstructure / Deck wearing / Waterproofing
const BRIDGE_STAGE: Partial<Record<WorkType, number>> = {
  excavation_structure: 1,   // foundation pit excavation
  pcc:                  2,   // PCC levelling course under foundation
  rcc:                  3,   // pier / abutment / pile cap RCC
  reinforcement:        3,   // rebar (concurrent with RCC substructure)
  filter_media:         4,   // bearing pads / drainage layer
  backfill_structure:   4,   // backfill behind abutments
  pipe_culvert:         4,   // pipe drainage if any
  drain_masonry:        5,   // return walls / wing walls
  waterproofing_structure: 5,// deck waterproofing / membrane
  bituminous_wearing:   5,   // wearing coat on bridge deck
  stone_pitching:       5,   // slope protection at toe of embankment
};

// ─── Exported sequence rules (used by Sequence Rules info panel in UI) ────────
export const SEQUENCE_RULES = {
  pavement: [
    { stage: 1, label: "Earthwork / Embankment" },
    { stage: 2, label: "Granular Sub-Base (GSB)" },
    { stage: 3, label: "WMM / DLC (Base Course)" },
    { stage: 4, label: "Prime Coat" },
    { stage: 5, label: "DBM / BM / Tack Coat (Binder)" },
    { stage: 6, label: "BC / SDBC (Wearing Course)" },
  ],
  culvert: [
    { stage: 1, label: "Foundation Excavation" },
    { stage: 2, label: "PCC Bedding / Levelling" },
    { stage: 3, label: "Pipe / RCC Walls / Rebar" },
    { stage: 4, label: "Filter Media / Drainage Layer" },
    { stage: 5, label: "Structural Backfill" },
    { stage: 6, label: "Headwall / Wingwall / Stone Pitching" },
  ],
  bridge: [
    { stage: 1, label: "Foundation Excavation" },
    { stage: 2, label: "PCC Levelling Course" },
    { stage: 3, label: "Pier / Abutment (RCC + Rebar)" },
    { stage: 4, label: "Backfill / Filter / Bearing" },
    { stage: 5, label: "Superstructure / Wearing / Waterproofing" },
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
  staggerMonths?: number; // mobilisation offset between successive reaches (default 1)
  lagMonths?: number;     // gap between dependent stages within a reach (default 0.25)
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

  // 1. Use stored planningWorkType as an authoritative track hint.
  if (it.planningWorkType === "road") {
    const stage = wt !== null ? (PAVEMENT_STAGE[wt] ?? 99) : 99;
    return { track: "pavement", stage };
  }

  if (it.planningWorkType === "structure") {
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
    const reachLabel = fronts > 1 ? `Reach ${r + 1}` : "Full Length";
    let pavCursor = offset;
    for (const c of pav) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      bars.push(mkBar(c.it, reachLabel, chFrom, chTo, pavCursor, pavCursor + dur, qty));
      pavCursor += dur + lag;
    }
    for (const c of oth) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      bars.push(mkBar(c.it, reachLabel, chFrom, chTo, offset, offset + dur, qty));
    }

  }

  // ── Structure (culvert / drain) fronts ─────────────────────────────────────
  // Culverts and drains are distributed works — the MoRTH stage sequence
  // (excavation → PCC → RCC → bedding → backfill → headwall) repeats in each
  // chainage zone. Every structure group runs the COMPLETE stage cycle.
  // Quantity and duration are divided by fronts so total planned qty = BOQ qty.
  // Group g maps to the same chainage zone as road front g (chainage-aware).
  if (str.length > 0) {
    for (let g = 0; g < fronts; g++) {
      const strLabel = fronts > 1 ? `Struct. Front ${g + 1}` : "Structures";
      const chFrom = startCh + g * reachLen;
      const chTo   = startCh + (g + 1) * reachLen;
      let strCursor = g * stagger;
      for (const c of str) {
        const qty = c.it.totalQty / fronts;
        const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
        bars.push(mkBar(c.it, strLabel, chFrom, chTo, strCursor, strCursor + dur, qty));
        strCursor += dur + lag;
      }
    }
  }

  // ── Bridge / major-structure fronts ────────────────────────────────────────
  // Same logic as culverts: each bridge group covers one front's chainage zone
  // and runs the complete bridge stage sequence.
  // Bridge qty/duration divided by fronts for proportional distribution.
  if (brg.length > 0) {
    for (let g = 0; g < fronts; g++) {
      const brgLabel = fronts > 1 ? `Bridge Grp ${g + 1}` : "Bridges";
      const chFrom = startCh + g * reachLen;
      const chTo   = startCh + (g + 1) * reachLen;
      let brgCursor = g * stagger;
      for (const c of brg) {
        const qty = c.it.totalQty / fronts;
        const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
        bars.push(mkBar(c.it, brgLabel, chFrom, chTo, brgCursor, brgCursor + dur, qty));
        brgCursor += dur + lag;
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
