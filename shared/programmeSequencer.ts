// Deterministic reach-wise auto-sequencer with dependencies + multiple fronts.
// Pure TypeScript — imports only the pure classifier. Produces Work Programme bars
// where each reach (front) runs the crust sequence in dependency order, reaches run
// in parallel (staggered), and the critical chain is scaled to fit the project duration.

import { classifyWorkType, type WorkType } from "./workTypeRecipes";

type Track = "pavement" | "structure" | "other";

// Stage numbers within each track — items with lower stage run before higher stage.
// Adapted from IRC / MoRTH construction sequence for road projects.
// "pcc" / "rcc" / "drain_masonry" run on a parallel structure track (culverts, drains).
const STAGE: Partial<Record<WorkType, { stage: number; track: Track }>> = {
  // ── Flexible pavement sequence ─────────────────────────────────────────────
  earthwork:          { stage: 1, track: "pavement" },   // embankment / subgrade
  gsb:                { stage: 2, track: "pavement" },   // granular sub-base
  wmm:                { stage: 3, track: "pavement" },   // wet mix macadam base
  dlc:                { stage: 3, track: "pavement" },   // dry lean concrete (rigid sub-base)
  prime_coat:         { stage: 4, track: "pavement" },   // spray on WMM before bituminous
  tack_coat:          { stage: 5, track: "pavement" },   // spray between bituminous layers
  bituminous_base:    { stage: 5, track: "pavement" },   // DBM / BM binder course
  bituminous_wearing: { stage: 6, track: "pavement" },   // BC / SDBC wearing course
  pqc:                { stage: 5, track: "pavement" },   // rigid pavement layer (PQC)
  // ── Structure track (culverts, bridges, drains) ───────────────────────────
  pcc:                { stage: 1, track: "structure" },
  rcc:                { stage: 1, track: "structure" },
  drain_masonry:      { stage: 2, track: "structure" },
  // earthwork / gsb also appear under structures occasionally — handled by "other" fallback
};

export interface SeqInputItem {
  boqItemId: number;
  description: string;
  unit: string;
  totalQty: number;
  fullDurationMonths: number; // duration for totalQty at a single front
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
}

export function generateSequencedProgramme(items: SeqInputItem[], opts: SeqOptions): SeqBar[] {
  const fronts = Math.max(1, Math.floor(opts.fronts || 1));
  const lag = opts.lagMonths ?? 0.25;
  const stagger = opts.staggerMonths ?? 1;
  const startCh = opts.chainageStartKm ?? 0;
  const reachLen = opts.roadLengthKm > 0 ? opts.roadLengthKm / fronts : 0;

  // Classify every item and assign track + stage
  const classified = items.map((it) => {
    const wt = classifyWorkType(it.description, it.unit);
    const meta = wt ? STAGE[wt] : null;
    return {
      it,
      stage: meta?.stage ?? 99,
      track: (meta?.track ?? "other") as Track,
    };
  });

  const pav = classified.filter((c) => c.track === "pavement").sort((a, b) => a.stage - b.stage);
  const str = classified.filter((c) => c.track === "structure").sort((a, b) => a.stage - b.stage);
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
  });

  for (let r = 0; r < fronts; r++) {
    const chFrom = startCh + r * reachLen;
    const chTo   = startCh + (r + 1) * reachLen;
    const label  = fronts > 1 ? `Reach ${r + 1}` : "Full Length";
    const offset = r * stagger; // each reach starts `stagger` months later

    let pavCursor    = offset;
    let structCursor = offset;
    let otherCursor  = offset;

    for (const c of pav) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      bars.push(mkBar(c.it, label, chFrom, chTo, pavCursor, pavCursor + dur, qty));
      pavCursor += dur + lag;
    }

    for (const c of str) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      bars.push(mkBar(c.it, label, chFrom, chTo, structCursor, structCursor + dur, qty));
      structCursor += dur + lag;
    }

    for (const c of oth) {
      const qty = c.it.totalQty / fronts;
      const dur = Math.max(0.1, c.it.fullDurationMonths / fronts);
      bars.push(mkBar(c.it, label, chFrom, chTo, otherCursor, otherCursor + dur, qty));
      otherCursor += dur + lag;
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
