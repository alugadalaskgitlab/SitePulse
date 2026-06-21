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
 *
 * Optional `productivitySettings` + `itemType`:
 * - When mode = "project" and an outputPerHr override exists for `itemType`,
 *   that single rate replaces all equipment-based bottleneck logic.
 * - When mode = "snl" or "company" (or settings absent), standard equipment
 *   norms are used unchanged.
 */
export function calculateAutoDurationFull(
  stretchQty: number,
  unit: string,
  equipment: Array<EquipmentProductivity & { name: string }>,
  workingHoursPerDay: number = WORKING_HRS_DEFAULT,
  workingDaysPerMonth: number = WORKING_DAYS_DEFAULT,
  productivitySettings?: ProductivitySettings | null,
  itemType?: string | null,
): { months: number; bottleneckEquipment: string | null } {
  if (stretchQty <= 0) return { months: 0, bottleneckEquipment: null };

  // ── Project-mode override takes precedence over equipment norms ──────────
  const projectOverride = resolveProductivityForType(productivitySettings, itemType);
  if (projectOverride && projectOverride > 0) {
    const monthlyOutput = projectOverride * workingHoursPerDay * workingDaysPerMonth;
    return {
      months: Math.max(0.01, stretchQty / monthlyOutput),
      bottleneckEquipment: `[${String(itemType ?? "override").toUpperCase()} · project norm]`,
    };
  }

  if (!equipment.length) return { months: 0, bottleneckEquipment: null };

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

// ─── Productivity Settings ────────────────────────────────────────────────────

/**
 * Project-level productivity settings loaded from boq_program_settings.
 *
 * Modes:
 * - "snl"     : IRC/MoRTH standard norms library (default). Equipment master
 *               outputs are used as-is; no override applied.
 * - "company" : Company-configured standard outputs. Same resolution path as
 *               SNL until company norms are independently stored.
 * - "project" : Per-item-type output overrides in productivityOverrides JSONB.
 *               Overrides completely replace equipment bottleneck logic.
 *
 * Override keys are case-insensitive layer types (e.g. "BITUMINOUS", "GRANULAR",
 * "EARTHWORK", "CONCRETE", "SPRAY_COAT") or mix types (e.g. "BC", "DBM", "WMM").
 */
export interface ProductivitySettings {
  mode: "snl" | "company" | "project";
  overrides: Record<string, { outputPerHr?: number; unit?: string }> | null;
}

/**
 * Layer-type alias map: items report layerType keys (e.g. "bituminous") while
 * the settings UI stores overrides under industry mix-type keys (e.g. "BC", "DBM").
 * This table gives the ordered alias list to try when a direct lookup misses.
 * First alias with an outputPerHr override wins (most-specific first).
 */
const LAYER_TYPE_ALIASES: Record<string, string[]> = {
  BITUMINOUS: ["BC", "SDBC", "DBM", "BM"],
  GRANULAR:   ["WMM", "WBM", "GSB", "EG"],
  CONCRETE:   ["M20", "M25", "M30", "M35", "M40", "RMC"],
  EARTHWORK:  ["EG"],
  SPRAY_COAT: ["BC"],
};

/**
 * Resolves an outputPerHr project-mode override for `itemType`.
 * Returns the override value (>0) or null when no match / wrong mode.
 *
 * Resolution order (first match wins):
 * 1. Direct key lookup — case-insensitive exact match against override keys.
 * 2. Layer-type alias expansion — maps "BITUMINOUS" → tries ["BC","DBM","SDBC","BM"]
 *    in order. This bridges the gap between item.layerConfig.layerType keys stored in
 *    BOQ items and the industry mix-type keys (BC / WMM / M20) used in the settings UI.
 */
export function resolveProductivityForType(
  settings: ProductivitySettings | null | undefined,
  itemType: string | null | undefined,
): number | null {
  // Only "project" mode applies productivityOverrides from program settings.
  // "company" mode is planned for a separate company-norms source (no-op for now, falls through to SNL norms).
  // "snl" mode always uses equipment-master IRC norms with no override.
  if (!settings || settings.mode !== "project" || !settings.overrides || !itemType) return null;
  const raw = itemType.trim();
  const up = raw.toUpperCase();
  const ov = settings.overrides;

  // 1. Direct lookup (case-insensitive)
  const direct = ov[up] ?? ov[raw];
  const directVal = direct?.outputPerHr;
  if (typeof directVal === "number" && directVal > 0) return directVal;

  // 2. Layer-type alias expansion
  const aliases = LAYER_TYPE_ALIASES[up];
  if (aliases) {
    for (const alias of aliases) {
      const aliased = ov[alias] ?? ov[alias.toLowerCase()];
      const aliasedVal = aliased?.outputPerHr;
      if (typeof aliasedVal === "number" && aliasedVal > 0) return aliasedVal;
    }
  }

  return null;
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
    // m is already the 1-indexed project month — no +1
    if (qty > 0 && m <= totalMonths) {
      result.push({ month: m, qty });
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
  hasAutoSource: boolean;
  breakdown: Array<{ itemDescription: string; qtyPerUnit: number; workQty: number; lineQty: number; isAuto?: boolean }>;
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
    isAuto?: boolean | null;
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
        matMap.set(key, { materialName: key, uom: m.uom, totalQty: 0, monthlyQty: {}, hasAutoSource: false, breakdown: [] });
      }
      const row = matMap.get(key)!;
      row.totalQty += lineQty;
      row.uom = m.uom;
      if (m.isAuto) row.hasAutoSource = true;
      row.breakdown.push({ itemDescription: item.description, qtyPerUnit: effQtyPerUnit, workQty, lineQty, isAuto: m.isAuto ?? false });
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
  // Specific mix/grade type resolved from the linked plant template (e.g. "BC", "DBM", "WMM", "M20").
  // Used by the planning engine to resolve the correct productivity override key rather than
  // falling back to a generic layerType alias (which would collapse all bituminous → "BC").
  mixType?: string | null;
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
  // Hectare ↔ SQM (1 HA = 10,000 SQM)
  if (from === "HECT" && to === "SQM") return 10000;
  if (from === "SQM" && to === "HECT") return 1 / 10000;
  // Hectare ↔ CUM (via thickness)
  if (from === "HECT" && to === "CUM" && thicknessMm) return 10000 * (thicknessMm / 1000);
  if (from === "CUM" && to === "HECT" && thicknessMm) return 1 / (10000 * (thicknessMm / 1000));
  // Hectare ↔ MT (via density + thickness)
  if (from === "HECT" && to === "MT" && densityTPerCum && thicknessMm)
    return 10000 * (thicknessMm / 1000) * densityTPerCum;
  if (from === "MT" && to === "HECT" && densityTPerCum && thicknessMm)
    return 1 / (10000 * (thicknessMm / 1000) * densityTPerCum);
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
  applicationNote?: string;
}

/** Standard spray coat application rates (kg/SQM) per IRC SP-20 guidelines */
export const SPRAY_RATES_KG_M2: Record<string, number> = {
  PC: 0.7,   // Prime Coat
  TC: 0.2,   // Tack Coat
  FS: 0.25,  // Fog Seal
  TC_MOD: 0.35, // Modified / CRMB Tack Coat
};

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
    const note = matName.toLowerCase().includes("emulsion")
      ? "Dilute 1:1 with water before spraying (RS-1 / SS-1)"
      : matName.toLowerCase().includes("prime")
      ? "Apply @ 60–70°C; cure for 24 hrs before overlay"
      : undefined;
    return [{ materialName: matName, uom: "MT", qtyPerBoqUnit: coverage / 1000, isAuto: true, applicationNote: note }];
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

// ─── Calendar date ↔ month-index conversions ──────────────────────────────────

/**
 * Convert a real calendar date to a 1-based fractional month index relative to
 * projectStartDate (M1 = project start date exactly).
 *
 * Uses average-days-per-month (365.25/12 ≈ 30.4375) so the conversion is
 * perfectly reversible and dateToMonthIndex(projectStartDate, projectStartDate)
 * always returns exactly 1.0 regardless of which day of the month the project starts.
 *
 * Examples (projectStartDate = 2025-06-15):
 *   "2025-06-15" → 1.0   (project start = M1)
 *   "2025-07-15" → 2.0   (1 avg-month later = M2)
 *   "2025-07-01" → ~1.54  (≈16 cal-days into M1)
 */
const AVG_DAYS_PER_MONTH = 365.25 / 12; // ≈ 30.4375

function parseLocalDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  // Append time to avoid UTC midnight → local prev-day shift
  return new Date(d + "T00:00:00");
}

export function dateToMonthIndex(d: string | Date, projectStartDate: string | Date): number {
  const start = parseLocalDate(projectStartDate);
  const target = parseLocalDate(d);
  const diffMs = target.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return +(1 + diffDays / AVG_DAYS_PER_MONTH).toFixed(4);
}

/**
 * Convert a 1-based fractional month index back to a real calendar date.
 * M1 = projectStartDate exactly. Uses average-days-per-month for symmetry
 * with dateToMonthIndex.
 */
export function monthIndexToDate(idx: number, projectStartDate: string | Date): Date {
  const start = parseLocalDate(projectStartDate);
  const daysOffset = (idx - 1) * AVG_DAYS_PER_MONTH;
  return new Date(start.getTime() + daysOffset * 24 * 60 * 60 * 1000);
}

/**
 * Fixed-duration back-calculation: given a quantity, start date, and end date,
 * returns the daily and monthly output required to complete within that window.
 */
export function calculateRequiredOutput(
  qty: number,
  startDate: string | Date,
  endDate: string | Date,
  workingDaysPerMonth: number,
  capacityMonthlyOutput?: number,
): {
  dailyOutput: number;
  monthlyOutput: number;
  durationMonths: number;
  durationWorkingDays: number;
  /** How many "standard equipment sets" are needed to hit this target.
   *  1.0 = exactly one set; 1.5 = 50% more than one set, etc.
   *  Null when capacityMonthlyOutput is not provided or is zero. */
  requiredResourceMultiplier: number | null;
} {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diffMs = end.getTime() - start.getTime();
  const calDays = diffMs / (1000 * 60 * 60 * 24);
  const durationMonths = calDays / AVG_DAYS_PER_MONTH;
  const durationWorkingDays = durationMonths * workingDaysPerMonth;
  const dailyOutput = durationWorkingDays > 0 ? qty / durationWorkingDays : 0;
  const monthlyOutput = dailyOutput * workingDaysPerMonth;
  const requiredResourceMultiplier =
    capacityMonthlyOutput != null && capacityMonthlyOutput > 0
      ? monthlyOutput / capacityMonthlyOutput
      : null;
  return { dailyOutput, monthlyOutput, durationMonths, durationWorkingDays, requiredResourceMultiplier };
}

/** Format a Date as YYYY-MM-DD for HTML date inputs */
export function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
