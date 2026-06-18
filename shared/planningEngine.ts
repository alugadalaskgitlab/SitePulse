// ────────────────────────────────────────────────────────────────────────────
// Planning Engine — ported from Road Estimator GanttPlanner.js / BOM logic
// Pure TypeScript, no DB imports. Runs identically on server and client.
// ────────────────────────────────────────────────────────────────────────────

export const WORKING_DAYS_DEFAULT = 26;
export const WORKING_HRS_DEFAULT = 8;

// Unit normalisation map — same as Road Estimator
export const UNIT_MAP: Record<string, string> = {
  CUM: "CUM", CUBICMETER: "CUM", "CUBIC METER": "CUM", M3: "CUM",
  SQM: "SQM", SQMTR: "SQM", SQUAREMETER: "SQM", "SQUARE METER": "SQM", M2: "SQM",
  MT: "MT", TON: "MT", TONNE: "MT", METRIC: "MT",
  RM: "RM", RMT: "RM", LM: "RM", "LINEAR METER": "RM",
  HECT: "HECT", HECTARE: "HECT", HA: "HECT",
  KL: "KL", "KILO LITRE": "KL",
  LS: "LS", LUMPSUM: "LS",
  NOS: "NOS", NO: "NOS", NUM: "NOS",
};

export function normaliseUnit(u: string): string {
  if (!u) return u;
  return UNIT_MAP[u.toUpperCase().replace(/[^A-Z0-9]/g, "")] ?? u.toUpperCase();
}

// ─── Stretch Qty ─────────────────────────────────────────────────────────────

/**
 * Auto-calculates planned qty for a chainage stretch.
 * Matches Road Estimator: boqQty × stretchLength / roadLength
 */
export function calculateStretchQty(
  boqQty: number,
  chainageFrom: number,
  chainageTo: number,
  roadLengthKm: number,
): number {
  if (!roadLengthKm || roadLengthKm <= 0) return boqQty;
  const stretchLen = chainageTo - chainageFrom;
  if (stretchLen <= 0) return 0;
  return boqQty * (stretchLen / roadLengthKm);
}

// ─── Auto Duration ────────────────────────────────────────────────────────────

export interface EquipmentProductivity {
  outputUnit: string | null;
  outputTheoretical: number | null;
  outputEfficiency: number | null;
  standardOutputs?: Array<{ unit: string; outputPerHr: number }> | null;
  count: number; // machines deployed
}

/**
 * Returns effective output per hour for a piece of equipment for a given unit.
 * standardOutputs (multi-unit override) takes priority over theoretical × efficiency.
 */
export function getEffectiveOutputPerHr(
  eq: EquipmentProductivity,
  targetUnit: string,
): number {
  const tu = normaliseUnit(targetUnit);

  // Check standardOutputs first
  if (eq.standardOutputs?.length) {
    const match = eq.standardOutputs.find(
      (s) => normaliseUnit(s.unit) === tu,
    );
    if (match && match.outputPerHr > 0) {
      return match.outputPerHr * eq.count;
    }
  }

  // Fall back to theoretical × efficiency, only if outputUnit matches
  if (
    eq.outputUnit &&
    normaliseUnit(eq.outputUnit) === tu &&
    eq.outputTheoretical &&
    eq.outputTheoretical > 0
  ) {
    const eff = eq.outputEfficiency ?? 0.75;
    return eq.outputTheoretical * eff * eq.count;
  }

  return 0;
}

/**
 * Calculates duration in months using bottleneck (slowest) equipment logic.
 * Mirrors Road Estimator getAutoDuration exactly.
 *
 * Duration = stretchQty / (bottleneckOutputPerHr × workingHrs × workingDays)
 */
export function calculateAutoDuration(
  stretchQty: number,
  unit: string,
  equipment: EquipmentProductivity[],
  workingHoursPerDay: number = WORKING_HRS_DEFAULT,
  workingDaysPerMonth: number = WORKING_DAYS_DEFAULT,
): { months: number; bottleneckEquipment: string | null } {
  if (!equipment.length || stretchQty <= 0) {
    return { months: 0, bottleneckEquipment: null };
  }

  const monthlyOutputs: Array<{ output: number; label: string }> = [];

  for (const eq of equipment) {
    const perHr = getEffectiveOutputPerHr(eq, unit);
    if (perHr > 0) {
      monthlyOutputs.push({
        output: perHr * workingHoursPerDay * workingDaysPerMonth,
        label: "", // label filled in by caller from equipment name
      });
    }
  }

  if (!monthlyOutputs.length) return { months: 0, bottleneckEquipment: null };

  // Bottleneck = minimum monthly output
  monthlyOutputs.sort((a, b) => a.output - b.output);
  const bottleneck = monthlyOutputs[0];
  const months = stretchQty / bottleneck.output;

  return {
    months: Math.max(0.01, months),
    bottleneckEquipment: null,
  };
}

/**
 * Full version that also returns the bottleneck equipment name.
 */
export function calculateAutoDurationFull(
  stretchQty: number,
  unit: string,
  equipment: Array<EquipmentProductivity & { name: string }>,
  workingHoursPerDay: number = WORKING_HRS_DEFAULT,
  workingDaysPerMonth: number = WORKING_DAYS_DEFAULT,
): { months: number; bottleneckEquipment: string | null } {
  if (!equipment.length || stretchQty <= 0) {
    return { months: 0, bottleneckEquipment: null };
  }

  const candidates: Array<{ output: number; name: string }> = [];

  for (const eq of equipment) {
    const perHr = getEffectiveOutputPerHr(eq, unit);
    if (perHr > 0) {
      candidates.push({
        output: perHr * workingHoursPerDay * workingDaysPerMonth,
        name: eq.name,
      });
    }
  }

  if (!candidates.length) return { months: 0, bottleneckEquipment: null };

  candidates.sort((a, b) => a.output - b.output);
  const bottleneck = candidates[0];
  const months = stretchQty / bottleneck.output;

  return {
    months: Math.max(0.01, months),
    bottleneckEquipment: bottleneck.name,
  };
}

// ─── Monthly Distribution ─────────────────────────────────────────────────────

export interface MonthlySlice {
  month: number; // 1-indexed calendar month
  qty: number;
}

/**
 * Distributes plannedQty across calendar months using fractional overlap.
 * Matches Road Estimator monthlyCosts distribution exactly.
 *
 * overlap = max(0, min(end, m+1) - max(start, m))
 * monthQty = plannedQty × overlap / duration
 */
export function calculateMonthlyDistribution(
  plannedQty: number,
  startMonth: number, // fractional, e.g. 1.0 or 1.5
  endMonth: number,   // fractional
  totalMonths: number,
): MonthlySlice[] {
  const duration = endMonth - startMonth;
  if (duration <= 0 || plannedQty <= 0) return [];

  const result: MonthlySlice[] = [];
  const maxM = Math.ceil(endMonth);

  for (let m = Math.floor(startMonth); m < maxM; m++) {
    const overlap = Math.max(0, Math.min(endMonth, m + 1) - Math.max(startMonth, m));
    if (overlap <= 0) continue;
    const qty = plannedQty * (overlap / duration);
    if (qty > 0 && m + 1 <= totalMonths) {
      result.push({ month: m + 1, qty });
    }
  }

  return result;
}

// ─── Bar Split ────────────────────────────────────────────────────────────────

export interface PlanBar {
  id?: number;
  boqItemId: number;
  reachLabel?: string | null;
  chainageFrom: number;
  chainageTo: number;
  startMonth: number;
  endMonth: number;
  plannedQty: number;
  isQtyOverride: boolean;
  isDurationOverride: boolean;
  notes?: string | null;
}

/**
 * Splits a bar at midChainage. Returns two new bars.
 * Start/end months are distributed proportionally; quantities are auto-split.
 * Matches Road Estimator splitBar() logic.
 */
export function splitBar(
  bar: PlanBar,
  midChainage: number,
  roadLengthKm: number,
  boqQty: number,
): [PlanBar, PlanBar] {
  const totalLen = bar.chainageTo - bar.chainageFrom;
  const leftLen = midChainage - bar.chainageFrom;
  const rightLen = bar.chainageTo - midChainage;
  const leftFraction = totalLen > 0 ? leftLen / totalLen : 0.5;
  const rightFraction = 1 - leftFraction;
  const totalDuration = bar.endMonth - bar.startMonth;

  const leftQty = calculateStretchQty(boqQty, bar.chainageFrom, midChainage, roadLengthKm);
  const rightQty = calculateStretchQty(boqQty, midChainage, bar.chainageTo, roadLengthKm);
  const leftEnd = bar.startMonth + totalDuration * leftFraction;

  const left: PlanBar = {
    boqItemId: bar.boqItemId,
    reachLabel: bar.reachLabel ? `${bar.reachLabel}A` : undefined,
    chainageFrom: bar.chainageFrom,
    chainageTo: midChainage,
    startMonth: bar.startMonth,
    endMonth: leftEnd,
    plannedQty: leftQty,
    isQtyOverride: false,
    isDurationOverride: false,
    notes: bar.notes,
  };

  const right: PlanBar = {
    boqItemId: bar.boqItemId,
    reachLabel: bar.reachLabel ? `${bar.reachLabel}B` : undefined,
    chainageFrom: midChainage,
    chainageTo: bar.chainageTo,
    startMonth: leftEnd,
    endMonth: bar.endMonth,
    plannedQty: rightQty,
    isQtyOverride: false,
    isDurationOverride: false,
    notes: bar.notes,
  };

  return [left, right];
}

// ─── BOM / Demand Calculation ─────────────────────────────────────────────────

export interface BomMaterialRow {
  materialName: string;
  uom: string;
  totalQty: number;
  monthlyQty: Record<number, number>;
  breakdown: Array<{ itemDescription: string; qtyPerUnit: number; workQty: number; lineQty: number }>;
}

export interface BomEquipmentRow {
  equipmentName: string;
  count: number;
  totalHours: number;
  monthlyHours: Record<number, number>;
  breakdown: Array<{ itemDescription: string; hrsPerUnit: number; workQty: number; lineHours: number }>;
}

export interface BomLabourRow {
  designation: string;
  totalDays: number;
  monthlyDays: Record<number, number>;
  breakdown: Array<{ itemDescription: string; daysPerUnit: number; workQty: number; lineDays: number }>;
}

export interface BomDemand {
  materials: BomMaterialRow[];
  equipment: BomEquipmentRow[];
  labour: BomLabourRow[];
}

export interface BomInputItem {
  id: number;
  description: string;
  unit: string;
  currentQty: number; // total BOQ qty
  materials: Array<{
    materialName: string;
    uom: string;
    qtyPerBoqUnit: number;
    wastagePct: number;
    isClientSupplied: boolean;
  }>;
  equipment: Array<{
    equipmentName: string;
    qtyPerBoqUnit: number; // hours per BOQ unit
    count?: number;
    isClientSupplied?: boolean;
  }>;
  labour: Array<{
    designation: string;
    qtyPerBoqUnit: number; // days per BOQ unit
    isClientSupplied?: boolean;
  }>;
}

export interface BomInputBar {
  boqItemId: number;
  chainageFrom: number | null;
  chainageTo: number | null;
  startMonth?: number;
  endMonth?: number;
  plannedQty: number;
  isQtyOverride: boolean;
}

/**
 * Calculates BOM demand from work items and Gantt bars.
 * If bars exist for an item, uses sum of bar quantities and distributes
 * demand across calendar months using each bar's startMonth/endMonth.
 * If no bars, falls back to currentQty with no monthly distribution.
 * Mirrors Road Estimator buildBomMaps() — strips all rate/cost output.
 */
export function calculateBomDemand(
  items: BomInputItem[],
  bars: BomInputBar[],
  totalMonths: number = 12,
): BomDemand {
  const matMap = new Map<string, BomMaterialRow>();
  const eqMap = new Map<string, BomEquipmentRow>();
  const labMap = new Map<string, BomLabourRow>();

  // Group bars by boqItemId
  const barsByItem = new Map<number, BomInputBar[]>();
  for (const bar of bars) {
    if (!barsByItem.has(bar.boqItemId)) barsByItem.set(bar.boqItemId, []);
    barsByItem.get(bar.boqItemId)!.push(bar);
  }

  for (const item of items) {
    const itemBars = barsByItem.get(item.id) ?? [];

    // Determine effective work quantity and monthly distribution
    let workQty = 0;
    const monthlyWork = new Map<number, number>(); // month → qty

    if (itemBars.length > 0) {
      workQty = itemBars.reduce((sum, b) => sum + b.plannedQty, 0);
      for (const bar of itemBars) {
        if (bar.startMonth != null && bar.endMonth != null && bar.plannedQty > 0) {
          const slices = calculateMonthlyDistribution(bar.plannedQty, bar.startMonth, bar.endMonth, totalMonths);
          for (const slice of slices) {
            monthlyWork.set(slice.month, (monthlyWork.get(slice.month) ?? 0) + slice.qty);
          }
        }
      }
    } else {
      workQty = item.currentQty;
    }
    if (workQty <= 0) continue;

    // Materials
    for (const m of item.materials) {
      if (m.isClientSupplied) continue;
      const effQtyPerUnit = m.qtyPerBoqUnit * (1 + (m.wastagePct || 0) / 100);
      const lineQty = effQtyPerUnit * workQty;
      const key = m.materialName;
      if (!matMap.has(key)) {
        matMap.set(key, { materialName: key, uom: m.uom, totalQty: 0, monthlyQty: {}, breakdown: [] });
      }
      const row = matMap.get(key)!;
      row.totalQty += lineQty;
      row.uom = m.uom;
      row.breakdown.push({ itemDescription: item.description, qtyPerUnit: effQtyPerUnit, workQty, lineQty });
      for (const [month, mwq] of monthlyWork) {
        row.monthlyQty[month] = (row.monthlyQty[month] ?? 0) + effQtyPerUnit * mwq;
      }
    }

    // Equipment
    for (const e of item.equipment) {
      if (e.isClientSupplied) continue;
      const cnt = e.count ?? 1;
      const lineHours = e.qtyPerBoqUnit * workQty * cnt;
      const key = e.equipmentName;
      if (!eqMap.has(key)) {
        eqMap.set(key, { equipmentName: key, count: cnt, totalHours: 0, monthlyHours: {}, breakdown: [] });
      }
      const row = eqMap.get(key)!;
      row.totalHours += lineHours;
      row.count = Math.max(row.count, cnt);
      row.breakdown.push({ itemDescription: item.description, hrsPerUnit: e.qtyPerBoqUnit, workQty, lineHours });
      for (const [month, mwq] of monthlyWork) {
        row.monthlyHours[month] = (row.monthlyHours[month] ?? 0) + e.qtyPerBoqUnit * mwq * cnt;
      }
    }

    // Labour
    for (const l of item.labour) {
      if (l.isClientSupplied) continue;
      const lineDays = l.qtyPerBoqUnit * workQty;
      const key = l.designation;
      if (!labMap.has(key)) {
        labMap.set(key, { designation: key, totalDays: 0, monthlyDays: {}, breakdown: [] });
      }
      const row = labMap.get(key)!;
      row.totalDays += lineDays;
      row.breakdown.push({ itemDescription: item.description, daysPerUnit: l.qtyPerBoqUnit, workQty, lineDays });
      for (const [month, mwq] of monthlyWork) {
        row.monthlyDays[month] = (row.monthlyDays[month] ?? 0) + l.qtyPerBoqUnit * mwq;
      }
    }
  }

  // Sort by total (largest first)
  const materials = [...matMap.values()].sort((a, b) => b.totalQty - a.totalQty);
  const equipment = [...eqMap.values()].sort((a, b) => b.totalHours - a.totalHours);
  const labour = [...labMap.values()].sort((a, b) => b.totalDays - a.totalDays);

  return { materials, equipment, labour };
}

// ─── Layer Config & Material Derivation ──────────────────────────────────────

/** Default compacted densities in T/CUM for common road layer types */
export const LAYER_DENSITY_DEFAULTS: Record<string, number> = {
  BC: 2.40, SDBC: 2.40, DBM: 2.40,
  BM: 2.35,
  WMM: 2.20,
  GSB: 2.00,
  CC: 2.40, RCC: 2.40, PCC: 2.40,
};

/** Layer config stored as JSONB on boq_items */
export interface LayerConfig {
  layerType: "bituminous" | "granular" | "spray_coat" | "earthwork" | "none";
  // Bituminous
  mixTemplateId?: number | null;
  thicknessMm?: number | null;
  densityTPerCum?: number | null;
  // Granular
  granularSource?: "quarry" | "plant";
  // Spray coat
  coverageRateKgPerSqm?: number | null;
  coverageMaterialName?: string | null;
}

/** Context for unit conversion (set from layerConfig) */
export interface UnitConversionContext {
  densityTPerCum?: number | null;
  thicknessMm?: number | null;
}

/**
 * Returns a multiplicative factor to convert a quantity in `fromUnit` to `toUnit`.
 * Returns `null` when conversion is impossible with the given context.
 */
export function getUnitConversionFactor(
  fromUnit: string,
  toUnit: string,
  ctx: UnitConversionContext,
): number | null {
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);
  if (from === to) return 1;
  const { densityTPerCum, thicknessMm } = ctx;
  if (from === "MT" && to === "CUM" && densityTPerCum) return 1 / densityTPerCum;
  if (from === "CUM" && to === "MT" && densityTPerCum) return densityTPerCum;
  if (from === "SQM" && to === "CUM" && thicknessMm) return thicknessMm / 1000;
  if (from === "CUM" && to === "SQM" && thicknessMm) return 1000 / thicknessMm;
  if (from === "MT" && to === "SQM" && densityTPerCum && thicknessMm)
    return 1 / ((thicknessMm / 1000) * densityTPerCum);
  if (from === "SQM" && to === "MT" && densityTPerCum && thicknessMm)
    return (thicknessMm / 1000) * densityTPerCum;
  return null;
}

export interface ConvertedOutput {
  outputPerHr: number;
  nativeUnit: string | null;
  convertedVia: "exact" | "converted" | "none";
}

/**
 * Like `getEffectiveOutputPerHr` but falls back to unit conversion using ctx.
 * Returns 0 when no conversion is possible.
 */
export function getEffectiveOutputPerHrConverted(
  eq: EquipmentProductivity,
  targetUnit: string,
  ctx: UnitConversionContext,
): ConvertedOutput {
  // Exact match first
  const exact = getEffectiveOutputPerHr(eq, targetUnit);
  if (exact > 0) return { outputPerHr: exact, nativeUnit: targetUnit, convertedVia: "exact" };

  // Try each standardOutput with conversion
  if (eq.standardOutputs?.length) {
    for (const s of eq.standardOutputs) {
      if (s.outputPerHr > 0) {
        const factor = getUnitConversionFactor(s.unit, targetUnit, ctx);
        if (factor !== null) {
          return { outputPerHr: s.outputPerHr * eq.count * factor, nativeUnit: s.unit, convertedVia: "converted" };
        }
      }
    }
  }

  // Try theoretical × efficiency with conversion
  if (eq.outputUnit && eq.outputTheoretical && eq.outputTheoretical > 0) {
    const factor = getUnitConversionFactor(eq.outputUnit, targetUnit, ctx);
    if (factor !== null) {
      const eff = eq.outputEfficiency ?? 0.75;
      return { outputPerHr: eq.outputTheoretical * eff * eq.count * factor, nativeUnit: eq.outputUnit, convertedVia: "converted" };
    }
  }

  return { outputPerHr: 0, nativeUnit: null, convertedVia: "none" };
}

// ─── Tipper Fleet Sizing ──────────────────────────────────────────────────────

export interface TipperFleetInput {
  plantOutputMTperHr: number;
  tipperCapacityMT: number;
  haulDistanceKm: number;
  avgSpeedKmHr: number;
  loadingTimeMins: number;
  unloadingTimeMins: number;
}

export interface TipperFleetResult {
  cycleTimeMins: number;
  tippersNeeded: number;
  deliveryRateMTperHr: number;
  isAdequate: boolean;
}

/**
 * Calculates tipper fleet requirement for a given haul distance.
 * Covered by unit tests.
 */
export function calculateTipperFleet(input: TipperFleetInput): TipperFleetResult {
  const { plantOutputMTperHr, tipperCapacityMT, haulDistanceKm, avgSpeedKmHr, loadingTimeMins, unloadingTimeMins } = input;
  const travelTimeMins = avgSpeedKmHr > 0 ? (haulDistanceKm * 2 / avgSpeedKmHr) * 60 : 0;
  const cycleTimeMins = travelTimeMins + loadingTimeMins + unloadingTimeMins;
  const tripsPerHr = cycleTimeMins > 0 ? 60 / cycleTimeMins : 0;
  const deliveryPerTipper = tipperCapacityMT * tripsPerHr;
  const tippersNeeded = deliveryPerTipper > 0 ? Math.ceil(plantOutputMTperHr / deliveryPerTipper) : 0;
  const deliveryRateMTperHr = deliveryPerTipper * tippersNeeded;
  return { cycleTimeMins, tippersNeeded, deliveryRateMTperHr, isAdequate: deliveryRateMTperHr >= plantOutputMTperHr };
}

// ─── Material Derivation from Layer Config ────────────────────────────────────

export interface DerivedMaterialRow {
  materialName: string;
  uom: string;
  qtyPerBoqUnit: number;
  isAuto: true;
}

/**
 * Derives material rows from a BOQ item's layer config.
 * mixTemplate should include bitumen% and aggregate component list.
 */
export function deriveMaterialsFromLayerConfig(
  layerConfig: LayerConfig,
  _boqUnit: string,
  mixTemplate?: {
    bitumenPercent: number | null;
    components: Array<{ materialName: string; percent: number | null }>;
  } | null,
): DerivedMaterialRow[] {
  if (layerConfig.layerType === "earthwork") {
    return [{ materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1.0, isAuto: true }];
  }

  if (layerConfig.layerType === "spray_coat") {
    const coverage = layerConfig.coverageRateKgPerSqm ?? 0;
    const matName = layerConfig.coverageMaterialName?.trim() || "Bitumen Emulsion";
    if (coverage <= 0) return [];
    return [{ materialName: matName, uom: "MT", qtyPerBoqUnit: coverage / 1000, isAuto: true }];
  }

  if (layerConfig.layerType === "granular") {
    if (layerConfig.granularSource === "plant") {
      return [{ materialName: "WMM (Processed)", uom: "MT", qtyPerBoqUnit: 1.0, isAuto: true }];
    }
    if (mixTemplate?.components?.length) {
      return mixTemplate.components
        .filter((c) => (c.percent ?? 0) > 0)
        .map((c) => ({ materialName: c.materialName, uom: "CUM", qtyPerBoqUnit: (c.percent ?? 0) / 100, isAuto: true as const }));
    }
    return [{ materialName: "Aggregate", uom: "CUM", qtyPerBoqUnit: 1.0, isAuto: true }];
  }

  if (layerConfig.layerType === "bituminous") {
    const thickness = layerConfig.thicknessMm ?? 0;
    const density = layerConfig.densityTPerCum ?? 2.35;
    if (thickness <= 0) return [];
    const mtPerSqm = (thickness / 1000) * density;
    const rows: DerivedMaterialRow[] = [];
    if (mixTemplate) {
      const bitPct = mixTemplate.bitumenPercent ?? 0;
      if (bitPct > 0) rows.push({ materialName: "Bitumen VG-30", uom: "MT", qtyPerBoqUnit: (bitPct / 100) * mtPerSqm, isAuto: true });
      for (const c of mixTemplate.components) {
        if ((c.percent ?? 0) > 0) {
          rows.push({ materialName: c.materialName, uom: "MT", qtyPerBoqUnit: ((c.percent ?? 0) / 100) * mtPerSqm, isAuto: true });
        }
      }
    } else {
      rows.push({ materialName: "Bituminous Mix", uom: "MT", qtyPerBoqUnit: mtPerSqm, isAuto: true });
    }
    return rows;
  }

  return [];
}

// ─── Gantt helpers ────────────────────────────────────────────────────────────

/** Month label: "Jun '25" from startDate + 0-indexed offset */
export function monthLabel(month: number, startDate: string | null | undefined): string {
  if (!startDate) return `M${month}`;
  try {
    const d = new Date(startDate + "T00:00:00");
    d.setMonth(d.getMonth() + (month - 1));
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  } catch {
    return `M${month}`;
  }
}

/** Abbreviate long item names for narrow Gantt label column */
export function getShortName(name: string, maxLen = 28): string {
  const ABBREV: Record<string, string> = {
    "Granular Sub Base": "GSB",
    "Wet Mix Macadam": "WMM",
    "Dense Bituminous Macadam": "DBM",
    "Bituminous Concrete": "BC",
    "Bituminous Macadam": "BM",
    "Prime Coat": "PC",
    "Tack Coat": "TC",
    "Fog Seal": "FS",
    "Slurry Seal": "SS",
    "Cement Concrete": "CC",
    "Reinforced Cement Concrete": "RCC",
    "Portland Cement Concrete": "PCC",
    "Compaction": "Comp.",
    "Earthwork": "EW",
    "Embankment": "Emb.",
    "Subgrade": "SG",
    "Formation": "Form.",
  };
  for (const [long, short] of Object.entries(ABBREV)) {
    if (name.includes(long)) return name.replace(long, short).slice(0, maxLen);
  }
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

/** Format number compactly: 1234.56 → "1,234.6" */
export function fmtQty(n: number, decimals = 1): string {
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
