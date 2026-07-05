// ─── Structure auto-sequencing ────────────────────────────────────────────────
//
// Turns imported structure-location bars (culverts, bridges, retaining walls …)
// that have no usable start date into a properly ordered construction programme:
//   1. Bars are grouped by structureId.
//   2. Each bar is classified into a construction stage (excavation → PCC →
//      reinforcement → RCC → pipe/superstructure → finishing) using its BOQ
//      description.
//   3. Duration is derived from imported duration_days (if present), else from
//      equipment/SDB productivity (qty ÷ output), else a stage default.
//   4. Structures are staggered across a small number of parallel "fronts" per
//      structure type (pipe culverts run more fronts in parallel than bridges),
//      ordered by chainage.
//
// Imported quantities (plannedQty) are NEVER recomputed here — they are treated
// as the source of truth from the Excel import.

import { calculateAutoDurationFull, type ProductivitySettings } from "./planningEngine";

export interface StageDef {
  key: string;
  order: number;
  keywords: string[];
  defaultDurationDays: number;
}

// Ordered construction-stage sequence for a typical structure (culvert/bridge).
// `keywords` are matched case-insensitively against the BOQ item description.
export const STAGE_SEQUENCE: StageDef[] = [
  { key: "excavation",      order: 10, keywords: ["excavat", "earthwork for structure", "foundation excavation"], defaultDurationDays: 5 },
  { key: "pcc",             order: 20, keywords: ["pcc", "plain cement concrete", "leveling course", "levelling course", "mud mat"], defaultDurationDays: 2 },
  { key: "reinforcement",   order: 30, keywords: ["reinforcement", "rebar", "steel bar"], defaultDurationDays: 4 },
  { key: "rcc_foundation",  order: 40, keywords: ["footing", "foundation", "raft", "pile cap", "abutment"], defaultDurationDays: 7 },
  { key: "pipe_laying",     order: 50, keywords: ["pipe", "hume pipe", "rcc pipe", "culvert pipe"], defaultDurationDays: 3 },
  { key: "rcc_super",       order: 60, keywords: ["rcc slab", "deck slab", "superstructure", "box culvert", "pier", "pier cap", "girder", "wing wall", "vent"], defaultDurationDays: 10 },
  { key: "headwall",        order: 70, keywords: ["headwall", "head wall", "apron"], defaultDurationDays: 4 },
  { key: "weepholes",       order: 80, keywords: ["weep hole", "weephole"], defaultDurationDays: 1 },
  { key: "filter_media",    order: 90, keywords: ["filter media", "granular filter", "geotextile"], defaultDurationDays: 2 },
  { key: "pitching",        order: 100, keywords: ["pitching", "stone pitching", "riprap", "protection work"], defaultDurationDays: 3 },
  { key: "wearing_coat",    order: 110, keywords: ["wearing coat", "wearing course", "parapet", "railing", "expansion joint"], defaultDurationDays: 2 },
  { key: "other",           order: 999, keywords: [], defaultDurationDays: 3 },
];

export function classifyStage(description: string | null | undefined): StageDef {
  const d = (description ?? "").toLowerCase();
  for (const stage of STAGE_SEQUENCE) {
    if (stage.keywords.some(k => d.includes(k))) return stage;
  }
  return STAGE_SEQUENCE[STAGE_SEQUENCE.length - 1]; // "other"
}

export type StructureTypeKey = "pipe_culvert" | "slab_culvert" | "box_culvert" | "minor_bridge" | "major_bridge" | "retaining_wall" | "other";

// Number of parallel construction "fronts" reasonably run at once for each
// structure type, and the minimum stagger (in days) between fronts starting.
export const STRUCTURE_TYPE_DEFAULTS: Record<StructureTypeKey, { fronts: number; staggerDays: number }> = {
  pipe_culvert:    { fronts: 2, staggerDays: 7 },
  slab_culvert:    { fronts: 1, staggerDays: 10 },
  box_culvert:     { fronts: 1, staggerDays: 10 },
  minor_bridge:    { fronts: 1, staggerDays: 14 },
  major_bridge:    { fronts: 1, staggerDays: 21 },
  retaining_wall:  { fronts: 2, staggerDays: 7 },
  other:           { fronts: 1, staggerDays: 7 },
};

export function classifyStructureType(structureLocType: string | null | undefined): StructureTypeKey {
  const t = (structureLocType ?? "").toLowerCase();
  if (t.includes("pipe")) return "pipe_culvert";
  if (t.includes("box")) return "box_culvert";
  if (t.includes("slab")) return "slab_culvert";
  if (t.includes("major") && t.includes("bridge")) return "major_bridge";
  if (t.includes("minor") && t.includes("bridge")) return "minor_bridge";
  if (t.includes("bridge")) return "minor_bridge";
  if (t.includes("retain")) return "retaining_wall";
  if (t.includes("culvert")) return "slab_culvert";
  return "other";
}

export interface SequenceableBar {
  id: number;
  boqItemId: number;
  structureId: string | null;
  structureLocType: string | null;
  structureChainageKm: number | null;
  chainageFrom: number | null;
  plannedQty: number | null;
  unit: string | null;
  description: string | null;
  durationDays: number | null;   // imported duration, if any
  startDate: string | null;      // imported start date (YYYY-MM-DD), if valid
  boqExcelRow: number | null;
}

export interface EquipmentInput {
  name: string;
  outputUnit?: string | null;
  outputTheoretical?: number | null;
  outputEfficiency?: number | null;
  standardOutputs?: unknown;
  qtyPerBoqUnit?: number | null;
  count?: number;
}

export interface SequenceResult {
  barId: number;
  startMonth: number;
  endMonth: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  stage: string;
  sequenceOrder: number;
  durationSource: "imported" | "productivity" | "default";
  needsReview: boolean;
  scheduled: true;
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z").getTime();
  const b = new Date(bIso + "T00:00:00Z").getTime();
  return (b - a) / 86400000;
}

/**
 * Sequences a set of structure bars into a construction programme.
 *
 * Bars that already have a valid startDate + durationDays are left untouched
 * (durationSource stays whatever the caller decides) — callers should filter
 * those out before calling this if they don't want them re-scheduled.
 */
export function autoSequenceStructureBars(opts: {
  bars: SequenceableBar[];
  projectStartDate: string;      // YYYY-MM-DD
  workingDaysPerMonth: number;
  totalMonths: number;
  equipmentByBoqItemId: Map<number, EquipmentInput[]>;
  workingHoursPerDay?: number;
  productivitySettings?: ProductivitySettings | null;
}): { results: SequenceResult[]; structures: number; fronts: number; needsReviewCount: number } {
  const { bars, projectStartDate, workingDaysPerMonth, totalMonths, equipmentByBoqItemId, productivitySettings } = opts;
  const workingHoursPerDay = opts.workingHoursPerDay ?? 8;

  // 1. Group by structureId (fallback to a synthetic per-bar key when absent).
  const groups = new Map<string, SequenceableBar[]>();
  for (const b of bars) {
    const key = b.structureId?.trim() || `__bar_${b.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }

  // 2. Build structure summaries: type + representative chainage.
  const structures = Array.from(groups.entries()).map(([structureId, groupBars]) => {
    const chainage = groupBars.find(b => b.structureChainageKm != null)?.structureChainageKm
      ?? groupBars.find(b => b.chainageFrom != null)?.chainageFrom
      ?? 0;
    const structureType = classifyStructureType(groupBars[0]?.structureLocType);
    return { structureId, bars: groupBars, chainage: chainage ?? 0, structureType };
  });

  // 3. Sort by chainage within each structure type, then assign round-robin to fronts.
  const byType = new Map<StructureTypeKey, typeof structures>();
  for (const s of structures) {
    if (!byType.has(s.structureType)) byType.set(s.structureType, []);
    byType.get(s.structureType)!.push(s);
  }

  // front cursor date, keyed by `${structureType}:${frontIndex}`
  const frontCursor = new Map<string, string>();
  let totalFronts = 0;
  const results: SequenceResult[] = [];
  let needsReviewCount = 0;

  for (const [structureType, group] of Array.from(byType.entries())) {
    group.sort((a: { chainage: number }, b: { chainage: number }) => a.chainage - b.chainage);
    const defaults = STRUCTURE_TYPE_DEFAULTS[structureType as StructureTypeKey];
    const fronts = Math.max(1, Math.min(defaults.fronts, group.length));
    totalFronts += fronts;

    group.forEach((structure: (typeof group)[number], idx: number) => {
      const frontIdx = idx % fronts;
      const frontKey = `${structureType}:${frontIdx}`;
      let cursor = frontCursor.get(frontKey) ?? projectStartDate;
      // stagger successive structures on the same front slightly beyond the
      // previous structure's finish, so trailing activities (curing, backfill)
      // don't visually collide.
      if (idx >= fronts) cursor = addDays(cursor, 0);

      // 4. Order this structure's bars by construction stage, then by the
      //    original Excel row (stable secondary sort for same-stage items).
      const orderedBars = [...structure.bars].sort((a, b) => {
        const sa = classifyStage(a.description).order;
        const sb = classifyStage(b.description).order;
        if (sa !== sb) return sa - sb;
        return (a.boqExcelRow ?? 0) - (b.boqExcelRow ?? 0);
      });

      let seq = 1;
      for (const bar of orderedBars) {
        const stageDef = classifyStage(bar.description);
        let durationDays: number;
        let durationSource: SequenceResult["durationSource"];

        if (bar.durationDays && bar.durationDays > 0) {
          durationDays = bar.durationDays;
          durationSource = "imported";
        } else {
          const equipment = equipmentByBoqItemId.get(bar.boqItemId) ?? [];
          const dur = calculateAutoDurationFull(
            bar.plannedQty ?? 0,
            bar.unit ?? "",
            equipment as any,
            workingHoursPerDay,
            workingDaysPerMonth,
            productivitySettings ?? null,
            stageDef.key,
          );
          if (dur.months > 0) {
            durationDays = Math.max(1, Math.round(dur.months * workingDaysPerMonth));
            durationSource = "productivity";
          } else {
            durationDays = stageDef.defaultDurationDays;
            durationSource = "default";
          }
        }

        const needsReview = durationSource === "default";
        if (needsReview) needsReviewCount++;

        const startDateIso = bar.startDate && /^\d{4}-\d{2}-\d{2}/.test(bar.startDate) ? bar.startDate : cursor;
        const endDateIso = addDays(startDateIso, durationDays);

        const startOffsetDays = daysBetween(projectStartDate, startDateIso);
        const endOffsetDays = daysBetween(projectStartDate, endDateIso);
        let startMonth = +(1 + startOffsetDays / workingDaysPerMonth).toFixed(3);
        let endMonth = +(1 + endOffsetDays / workingDaysPerMonth).toFixed(3);
        if (endMonth <= startMonth) endMonth = +(startMonth + 0.1).toFixed(3);
        if (endMonth > totalMonths) endMonth = totalMonths;
        if (startMonth > totalMonths) startMonth = totalMonths;

        results.push({
          barId: bar.id,
          startMonth,
          endMonth,
          startDate: startDateIso,
          endDate: endDateIso,
          durationDays,
          stage: stageDef.key,
          sequenceOrder: seq++,
          durationSource,
          needsReview,
          scheduled: true,
        });

        cursor = endDateIso;
      }

      cursor = addDays(cursor, defaults.staggerDays > 0 && idx + fronts < group.length ? 0 : 0);
      frontCursor.set(frontKey, cursor);
    });
  }

  return { results, structures: structures.length, fronts: totalFronts, needsReviewCount };
}
