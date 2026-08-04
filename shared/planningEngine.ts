// ────────────────────────────────────────────────────────────────────────────
// Planning Engine — ported from Road Estimator GanttPlanner.js / BOM logic
// Pure TypeScript, no DB imports. Runs identically on server and client.
// ────────────────────────────────────────────────────────────────────────────

import {
  mapEquipmentToComponents,
  mapLabourToComponents,
  mapMaterialToComponents,
  bituminousFuelComponent,
  significantComponentsFor,
  findMissingDemandMappings,
  type DemandComponentMappingWarning,
} from "./executionArrangementCategories";

export const WORKING_DAYS_DEFAULT = 26;
export const WORKING_HRS_DEFAULT = 8;

// Unit normalisation map — same as Road Estimator
export const UNIT_MAP: Record<string, string> = {
  CUM: "CUM", CUBICMETER: "CUM", "CUBIC METER": "CUM", M3: "CUM",
  SQM: "SQM", SQMTR: "SQM", SQUAREMETER: "SQM", "SQUARE METER": "SQM", M2: "SQM",
  MT: "MT", TON: "MT", TONNE: "MT", METRIC: "MT", T: "MT", TONNES: "MT", TONS: "MT",
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
  // Item-specific hrs-per-BOQ-unit rate (manual entry, SNL import, or contractor-supplied
  // custom equipment). Already scoped to the item's own BOQ unit, so it's used as a
  // last-resort output source when the generic equipment master has no matching output
  // for the target unit — this is what lets contractor/custom equipment (or SDB equipment
  // used for a unit the master doesn't cover) count in the Gantt bottleneck instead of
  // silently dropping out.
  qtyPerBoqUnit?: number | null;
  count: number; // machines deployed
}

/**
 * Returns effective output per hour for a piece of equipment for a given unit.
 * standardOutputs (multi-unit override) takes priority over theoretical × efficiency,
 * which in turn takes priority over the item-specific qtyPerBoqUnit fallback.
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

  // Last resort: item-specific rate (hrs per BOQ unit). No unit-matching needed since
  // it's already scoped to the item's own unit — covers contractor/custom equipment and
  // SDB equipment used for a unit the generic master doesn't define.
  if (eq.qtyPerBoqUnit && eq.qtyPerBoqUnit > 0) {
    return (1 / eq.qtyPerBoqUnit) * eq.count;
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
  BITUMINOUS: ["HMP", "BC", "SDBC", "DBM", "BM"],
  GRANULAR:   ["WMM", "WBM", "GSB"],
  CONCRETE:   ["RMC", "M20", "M25", "M30", "M35", "M40"],
  EARTHWORK:  ["EG"],
  SPRAY_COAT: ["HMP", "BC"],
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

// ─── Planning Mode (Task #1240 — additive, read-only classification) ─────────
// Derives a display-only "effective planning mode" for a BOQ item's bars,
// WITHOUT rewriting any stored data. Existing stored planningMode values
// (null | "structure_location") are respected as-is; this only fills in a
// label for the UI when the stored value is null/ambiguous. It never mutates
// the database and must not be used to gate any workflow logic.
export type EffectivePlanningMode =
  | "road_reach"
  | "structure_location"
  | "imported_schedule"
  | "manual_planning"
  | "not_plannable_without_input";

export interface PlanningModeBarInput {
  planningMode?: string | null;
  source?: string | null;
  reachLabel?: string | null;
}

const AUTO_GENERATED_LABEL_RE = /^(Full Length|Structures|Bridges|Reach \d+|Struct\. Front \d+|Bridge Grp \d+)$/;

/**
 * Classifies how a single BOQ item entered the work programme, for display
 * purposes only (e.g. a badge in the "By Item" demand tab). Does not alter
 * any persisted planningMode value.
 */
export function derivePlanningMode(bars: PlanningModeBarInput[]): EffectivePlanningMode {
  if (!bars || bars.length === 0) return "not_plannable_without_input";

  // Any bar explicitly marked structure_location → whole item is structure-planned.
  if (bars.some((b) => b.planningMode === "structure_location")) return "structure_location";

  // Any other non-null/non-legacy planningMode value is passed through as-is
  // (forward-compatible with future explicit values written by the app).
  const explicit = bars.find((b) => b.planningMode && b.planningMode !== "structure_location");
  if (explicit?.planningMode === "imported_schedule" || explicit?.planningMode === "manual_planning") {
    return explicit.planningMode;
  }

  // Bars imported from an external schedule (not the structure wizard, not
  // auto-sequenced, not hand-labelled) — identified by source values used by
  // schedule-import flows.
  if (bars.some((b) => b.source === "import" || b.source === "schedule_import")) return "imported_schedule";

  // Hand-placed bars: source === "manual" with a custom (non-auto-generated) label.
  if (bars.some((b) => b.source === "manual" && b.reachLabel && !AUTO_GENERATED_LABEL_RE.test(b.reachLabel))) {
    return "manual_planning";
  }

  // Default: auto-sequenced / auto-generated road-style chainage stretches,
  // or legacy bars with no source recorded (treated as road_reach for
  // backward compatibility — matches historical behaviour).
  return "road_reach";
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
  /** "direct" = quarry/site supply; "plant" = processed at HMP or RMC; undefined = manual/unknown */
  supplyType?: "direct" | "plant";
  /** Instruction 023: true for recognised earthwork/bulk-fill BOQ items. Bypasses Plant Material mapping. */
  isEarthworkBulkRequirement?: boolean;
  /** Instruction 024: true for gravel/moorum items that need user classification before routing. */
  requiresClassification?: boolean;
  originalNormMaterialName?: string;
  displayMaterialName?: string;
  suggestedMaterialMasterName?: string;
  materialGroup?: string;
  reviewNeeded?: boolean;
  normalisationReason?: string;
  breakdown: Array<{
    /** Canonical BOQ item ID that generated this contribution. */
    boqItemId?: number | null;
    /** Whether the contributing BOQ item has Work Programme bars (undefined = fuel/equipment rows). */
    isProgrammed?: boolean;
    itemDescription: string;
    fullDescription?: string;
    itemCode?: string | null;
    unit?: string;
    compositeLabel?: string;
    qtyPerUnit: number;
    workQty: number;
    lineQty: number;
    isAuto?: boolean;
  }>;
  /** Three-state programming status derived from all contributing BOQ items. */
  programmingStatus?: "fully_programmed" | "partly_programmed" | "not_programmed";
  /** Demand attributable to programmed BOQ contributions. */
  programmedTotalDemand?: number;
  /** Demand attributable to BOQ contributions without programme bars. */
  unprogrammedDemand?: number;
}

export interface MaterialNormalisationInput {
  materialName: string;
  uom: string;
  sourceType?: "SDB" | "Mix Template" | "Manual" | "Derived" | "Fuel";
  itemDescription?: string;
  itemCode?: string | null;
  workCategory?: string | null;
  layerType?: LayerConfig["layerType"] | null;
  mixType?: string | null;
  granularSource?: LayerConfig["granularSource"] | null;
  supplyType?: "direct" | "plant";
  isAuto?: boolean | null;
}

export interface MaterialNormalisationResult {
  originalNormMaterialName: string;
  displayMaterialName: string;
  materialGroup: string;
  suggestedMaterialMasterName: string;
  confidence: number;
  reviewNeeded: boolean;
  normalisationReason: string;
}

export interface BomEquipmentRow {
  equipmentName: string;
  count: number;
  totalHours: number;
  monthlyHours: Record<number, number>;
  breakdown: Array<{ itemDescription: string; fullDescription?: string; itemCode?: string | null; unit?: string; hrsPerUnit: number; workQty: number; lineHours: number }>;
}

export interface BomLabourRow {
  designation: string;
  totalDays: number;
  monthlyDays: Record<number, number>;
  breakdown: Array<{ itemDescription: string; fullDescription?: string; itemCode?: string | null; unit?: string; daysPerUnit: number; workQty: number; lineDays: number }>;
}

export interface BomDemand {
  materials: BomMaterialRow[];
  equipment: BomEquipmentRow[];
  labour: BomLabourRow[];
  /** Instruction 025: explanations for every arrangement-driven demand reduction. */
  demandAdjustments?: DemandAdjustment[];
  /** Instruction 025 §11: overlapping active allocations detected (exclusion capped). */
  arrangementOverlaps?: ArrangementOverlapWarning[];
  /** Instruction 028 §22/§33: responsibility components with no matching recipe resource. */
  mappingWarnings?: DemandComponentMappingWarning[];
}

// ─── Instruction 025: Approved execution arrangements reduce HLC demand ──────

export type ComponentResponsibility = "hlc" | "agency" | "client" | "not_applicable" | "not_decided";

/** Statuses whose arrangements affect HLC demand. Draft/submitted/returned/rejected/
 *  cancelled never do; on_hold counts while the approved responsibility remains valid. */
export const DEMAND_AFFECTING_ARRANGEMENT_STATUSES: ReadonlySet<string> = new Set([
  "approved", "mobilisation_pending", "in_progress", "on_hold",
]);

/** Minimal arrangement shape the demand engine needs (mirrors earthwork_arrangements). */
export interface ArrangementDemandInput {
  id: number;
  status: string;
  allocatedQty: number;
  boqItemId?: number | null;
  boqItemAllocations?: Array<{ boqItemId: number; qty: number }> | null;
  components?: Record<string, string> | null; // component key → ComponentResponsibility
  dieselResponsibility?: string | null;       // agency | hlc | mixed
  agencyName?: string | null;
  arrangementType?: string | null;
  /** Instruction 028: arrangement work category (earthwork default for old rows). */
  workCategory?: string | null;
  /** Instruction 028: bituminous item sub-type (prime_coat, dbm, …). */
  bituminousItemType?: string | null;
  /**
   * Instruction 026 §9: links to specific Work Programme bars. When present,
   * the linked quantity is excluded ONLY on that bar (its quantity and dates);
   * any unlinked remainder keeps the legacy BOQ-item-level effect (§5 —
   * never both for the same quantity).
   */
  programmeAllocations?: Array<{ programmeBarId: number; boqItemId: number; qty: number }> | null;
}

export interface DemandAdjustment {
  boqItemId: number;
  itemCode?: string | null;
  kind: "equipment" | "diesel" | "labour" | "material";
  resourceName: string;
  excludedQty: number;   // hours / liters / days / CUM excluded from HLC demand
  unit: string;
  agencyName?: string | null;
  note: string;
}

export interface ArrangementOverlapWarning {
  boqItemId: number;
  allocatedTotal: number; // raw sum of active allocations against the item
  itemQty: number;        // BOQ/programmed quantity the exclusion was capped at
}

/** Per-item slice of an active arrangement after per-source splitting + overlap capping. */
interface ArrangementSlice {
  qty: number;
  components: Record<string, string>;
  dieselResponsibility?: string | null;
  agencyName?: string | null;
  /** Instruction 026: when set, this slice is phased to the linked programme bar's months. */
  barId?: number | null;
  /** Instruction 028: category of the owning arrangement ("earthwork" when absent). */
  workCategory?: string | null;
  bituminousItemType?: string | null;
}

export interface ItemArrangementEffect {
  slices: ArrangementSlice[];
  overlap?: ArrangementOverlapWarning;
}

const NON_HLC = (r: string | undefined | null): boolean =>
  r === "agency" || r === "client" || r === "not_applicable";

/** Resolve a component responsibility; missing keys are "not_decided" (never silently HLC-excluded, never confidently HLC either — Instruction 025 §5 treats not_decided as retained/provisional demand). */
function respOf(components: Record<string, string> | null | undefined, ...keys: string[]): string {
  for (const k of keys) {
    const v = components?.[k];
    if (v) return v;
  }
  return "not_decided";
}

/**
 * Split active arrangements into per-BOQ-item quantity slices and cap total
 * exclusion at each item's quantity (Instruction 025 §10-11: exclusions must
 * never exceed the BOQ/programmed quantity; overlaps are flagged, not doubled).
 *
 * LIMITATION (Instruction 025 §4): actual-progress linkage is not yet reliable,
 * so forward demand uses the approved ALLOCATED quantity, not allocated − completed.
 */
export function buildArrangementEffects(
  items: Array<{ id: number; currentQty: number }>,
  arrangements: ArrangementDemandInput[] | null | undefined,
): Map<number, ItemArrangementEffect> {
  const out = new Map<number, ItemArrangementEffect>();
  if (!arrangements?.length) return out;
  const qtyById = new Map(items.map(i => [i.id, Number(i.currentQty) || 0]));

  for (const arr of arrangements) {
    if (!DEMAND_AFFECTING_ARRANGEMENT_STATUSES.has(String(arr.status))) continue;
    const components = (arr.components && typeof arr.components === "object") ? arr.components as Record<string, string> : {};
    const pushSlice = (boqItemId: number, qty: number, barId?: number | null) => {
      if (!(qty > 0) || !qtyById.has(boqItemId)) return;
      if (!out.has(boqItemId)) out.set(boqItemId, { slices: [] });
      out.get(boqItemId)!.slices.push({
        qty, components,
        dieselResponsibility: arr.dieselResponsibility,
        agencyName: arr.agencyName,
        barId: barId ?? null,
        workCategory: arr.workCategory ?? "earthwork",
        bituminousItemType: arr.bituminousItemType ?? null,
      });
    };

    // Instruction 026 §9: bar-linked quantity is phased per bar; only the
    // UNLINKED remainder falls back to the legacy BOQ-item-level effect (§5).
    const barAllocs = (Array.isArray(arr.programmeAllocations) ? arr.programmeAllocations : [])
      .map(a => ({ programmeBarId: Number(a.programmeBarId), boqItemId: Number(a.boqItemId), qty: Number(a.qty) || 0 }))
      .filter(a => a.qty > 0);
    let linkedTotal = 0;
    for (const a of barAllocs) {
      pushSlice(a.boqItemId, a.qty, a.programmeBarId);
      linkedTotal += a.qty;
    }

    const remainder = Math.max(0, (Number(arr.allocatedQty) || 0) - linkedTotal);
    if (remainder > 0.001) {
      const legacyAllocs: Array<{ boqItemId: number; qty: number }> =
        (Array.isArray(arr.boqItemAllocations) && arr.boqItemAllocations.length > 0)
          ? arr.boqItemAllocations.map(a => ({ boqItemId: Number(a.boqItemId), qty: Number(a.qty) || 0 }))
          : (arr.boqItemId != null ? [{ boqItemId: arr.boqItemId, qty: Number(arr.allocatedQty) || 0 }] : []);
      const legacyTotal = legacyAllocs.reduce((s, a) => s + a.qty, 0);
      if (legacyTotal > 0) {
        // Scale legacy targets down so linked + legacy never exceeds the arrangement total.
        const scale = remainder / legacyTotal;
        for (const a of legacyAllocs) pushSlice(a.boqItemId, a.qty * scale, null);
      }
    }
  }

  // Cap: total active allocation per item must not exceed the item quantity.
  for (const [itemId, eff] of out) {
    const itemQty = qtyById.get(itemId) ?? 0;
    const total = eff.slices.reduce((s: number, sl: ArrangementSlice) => s + sl.qty, 0);
    if (itemQty > 0 && total > itemQty + 0.001) {
      const scale = itemQty / total;
      for (const sl of eff.slices) sl.qty *= scale;
      eff.overlap = { boqItemId: itemId, allocatedTotal: Math.round(total * 1000) / 1000, itemQty };
    }
  }
  return out;
}

/** Map an equipment name to the arrangement component key(s) that own it (Instruction 025 §7). */
export function equipmentComponentKeys(equipmentName: string): string[] {
  const n = equipmentName.toLowerCase();
  if (/tipper|dumper|hyva|\btruck\b|trailer/.test(n)) return ["tippers", "transport"];
  // Purpose wins over machine type: "Dozer for spreading" is spreading plant, not excavation.
  if (/spread|grading/.test(n)) return ["spreading", "equipment"];
  if (/excavat|\bjcb\b|backhoe|poclain|dozer|shovel|ripper/.test(n)) return ["excavation", "equipment"];
  if (/loader/.test(n)) return ["loading", "equipment"];
  if (/grader/.test(n)) return ["spreading", "equipment"];
  if (/roller|compactor|rammer/.test(n)) return ["compaction", "equipment"];
  if (/water\s*(tanker|browser|bowser)|sprinkler/.test(n)) return ["watering", "equipment"];
  if (/tractor/.test(n)) return ["transport", "equipment"];
  return ["equipment"];
}

/** Map a labour designation to its owning component; null = general execution crew. */
export function labourComponentKey(designation: string): string | null {
  const n = designation.toLowerCase();
  if (/survey/.test(n)) return "survey_setting_out";
  if (/quality|\blab\b|technician/.test(n)) return "quality_testing";
  if (/operator|driver/.test(n)) return "operators_drivers";
  return null;
}

const EXECUTION_COMPONENT_KEYS = ["excavation", "loading", "transport", "spreading", "watering", "compaction"] as const;

/**
 * HLC-retained fraction of an item's quantity for a demand kind.
 * A slice excludes demand only when the relevant responsibility is positively
 * non-HLC (agency/client/not_applicable). "not_decided" retains demand
 * (provisional — never silently treated as outsourced).
 */
export function hlcRetainedFraction(
  eff: ItemArrangementEffect | undefined,
  itemQty: number,
  isSliceExcluded: (sl: ArrangementSlice) => boolean,
): { fraction: number; excludedQty: number; agencies: string[] } {
  if (!eff || !(itemQty > 0)) return { fraction: 1, excludedQty: 0, agencies: [] };
  let excluded = 0;
  const agencies: string[] = [];
  for (const sl of eff.slices) {
    if (isSliceExcluded(sl)) {
      excluded += sl.qty;
      if (sl.agencyName && !agencies.includes(sl.agencyName)) agencies.push(sl.agencyName);
    }
  }
  excluded = Math.min(excluded, itemQty);
  return { fraction: Math.max(0, 1 - excluded / itemQty), excludedQty: excluded, agencies };
}

/**
 * Instruction 026 §9-10: month-phased exclusion effect. Bar-linked slices exclude
 * demand only in the linked bar's programmed months; legacy (unlinked) slices
 * spread proportionally across the item's own monthly distribution (the previous
 * Instruction 025 behaviour). Totals equal the sum of monthly retained demand.
 */
export interface ExclusionEffect {
  fraction: number;      // overall HLC-retained fraction of the item quantity
  excludedQty: number;   // BOQ-unit quantity excluded (capped at item qty)
  agencies: string[];
  /** HLC-retained fraction for a specific programme month. */
  monthFraction: (month: number) => number;
}

export function arrangementExclusionEffect(
  eff: ItemArrangementEffect | undefined,
  itemQty: number,
  monthlyWork: Map<number, number>,
  barMonthShares: Map<number, Map<number, number>>, // barId → month → share of bar qty (sums to 1)
  isSliceExcluded: (sl: ArrangementSlice) => boolean,
): ExclusionEffect {
  const base = hlcRetainedFraction(eff, itemQty, isSliceExcluded);
  const flat: ExclusionEffect = { ...base, monthFraction: () => base.fraction };
  if (!eff || !(itemQty > 0) || base.excludedQty <= 0) return flat;

  const excludedSlices = eff.slices.filter(isSliceExcluded);
  const hasBarPhasing = excludedSlices.some(sl => sl.barId != null && barMonthShares.has(sl.barId));
  if (!hasBarPhasing || monthlyWork.size === 0) return flat;

  // Cap scale: if raw excluded exceeded item qty, hlcRetainedFraction capped it —
  // scale each slice down by the same factor so monthly sums match the capped total.
  const rawExcluded = excludedSlices.reduce((s, sl) => s + sl.qty, 0);
  const capScale = rawExcluded > 0 ? base.excludedQty / rawExcluded : 0;
  let monthlyTotal = 0;
  monthlyWork.forEach(q => { monthlyTotal += q; });

  const excludedMonthly = new Map<number, number>();
  for (const sl of excludedSlices) {
    const q = sl.qty * capScale;
    const shares = sl.barId != null ? barMonthShares.get(sl.barId) : undefined;
    if (shares) {
      shares.forEach((share, m) => excludedMonthly.set(m, (excludedMonthly.get(m) ?? 0) + q * share));
    } else if (monthlyTotal > 0) {
      monthlyWork.forEach((mw, m) => excludedMonthly.set(m, (excludedMonthly.get(m) ?? 0) + q * (mw / monthlyTotal)));
    }
  }
  return {
    ...base,
    monthFraction: (m: number) => {
      const mw = monthlyWork.get(m) ?? 0;
      if (!(mw > 0)) return base.fraction;
      const ex = excludedMonthly.get(m) ?? 0;
      // Never below zero (Instruction 026 §13) — cap exclusion at the month's work.
      return Math.max(0, 1 - Math.min(ex, mw) / mw);
    },
  };
}

// ─── Instruction 026 §4/§19: bar-allocation validation (pure, server + tests) ──

export type BarAllocationErrorCode =
  | "PROGRAMME_BAR_NOT_FOUND"
  | "ARRANGEMENT_PROJECT_MISMATCH"
  | "ARRANGEMENT_BOQ_ITEM_MISMATCH"
  | "BAR_ALLOCATION_EXCEEDS_PLANNED_QTY"
  | "ARRANGEMENT_ALLOCATION_TOTAL_MISMATCH"
  | "INVALID_ALLOCATION_QTY";

export interface BarAllocationValidationInput {
  allocatedQty: number;
  bar: { id: number; boqProjectId: number; boqItemId: number; plannedQty: number } | null | undefined;
  arrangement: {
    boqProjectId: number;
    allocatedQty: number;
    boqItemId?: number | null;
    boqItemAllocations?: Array<{ boqItemId: number; qty: number }> | null;
  };
  /** Existing ACTIVE allocations against the same bar (excluding the one being edited). */
  existingActiveOnBar: number;
  /** Existing ACTIVE bar allocations for this arrangement (excluding the one being edited). */
  existingActiveForArrangement: number;
}

export function validateBarAllocation(input: BarAllocationValidationInput):
  | { ok: true }
  | { ok: false; code: BarAllocationErrorCode; message: string; remainingQty?: number } {
  const { allocatedQty, bar, arrangement, existingActiveOnBar, existingActiveForArrangement } = input;
  if (!bar) return { ok: false, code: "PROGRAMME_BAR_NOT_FOUND", message: "Programme bar not found." };
  if (!(allocatedQty > 0)) return { ok: false, code: "INVALID_ALLOCATION_QTY", message: "Allocated quantity must be positive." };
  if (bar.boqProjectId !== arrangement.boqProjectId) {
    return { ok: false, code: "ARRANGEMENT_PROJECT_MISMATCH", message: "Arrangement and programme bar belong to different projects." };
  }
  const arrItemIds = new Set<number>(
    (Array.isArray(arrangement.boqItemAllocations) && arrangement.boqItemAllocations.length > 0)
      ? arrangement.boqItemAllocations.map(a => Number(a.boqItemId))
      : (arrangement.boqItemId != null ? [Number(arrangement.boqItemId)] : []),
  );
  if (arrItemIds.size > 0 && !arrItemIds.has(bar.boqItemId)) {
    return { ok: false, code: "ARRANGEMENT_BOQ_ITEM_MISMATCH", message: "The programme bar's BOQ item does not match the arrangement's BOQ item(s)." };
  }
  const barRemaining = Math.max(0, (Number(bar.plannedQty) || 0) - existingActiveOnBar);
  if (allocatedQty > barRemaining + 0.001) {
    return {
      ok: false, code: "BAR_ALLOCATION_EXCEEDS_PLANNED_QTY", remainingQty: Math.round(barRemaining * 1000) / 1000,
      message: `Allocation exceeds the bar's remaining plannable quantity. Remaining allocatable: ${Math.round(barRemaining * 1000) / 1000}.`,
    };
  }
  const arrRemaining = Math.max(0, (Number(arrangement.allocatedQty) || 0) - existingActiveForArrangement);
  if (allocatedQty > arrRemaining + 0.001) {
    return {
      ok: false, code: "ARRANGEMENT_ALLOCATION_TOTAL_MISMATCH", remainingQty: Math.round(arrRemaining * 1000) / 1000,
      message: `Bar allocations cannot exceed the arrangement total. Remaining unassigned arrangement quantity: ${Math.round(arrRemaining * 1000) / 1000}.`,
    };
  }
  return { ok: true };
}

/** Equipment slice exclusion: the owning component is positively non-HLC.
 *  028 §19: bituminous slices use the explicit registry mapping first; an
 *  unmapped resource is NEVER excluded (no false certainty — §23/§33). */
export function equipmentSliceExcluded(sl: ArrangementSlice, equipmentName: string): boolean {
  if (sl.workCategory === "bituminous") {
    const m = mapEquipmentToComponents("bituminous", equipmentName);
    if (m.componentKeys.length === 0) return false; // unmapped → retain demand
    return NON_HLC(respOf(sl.components, ...m.componentKeys));
  }
  const keys = equipmentComponentKeys(equipmentName);
  return NON_HLC(respOf(sl.components, ...keys));
}

/**
 * Diesel slice exclusion (Instruction 025 §8): fuel follows the equipment/activity
 * consuming it, but when HLC supplies diesel to the agency (diesel_fuel = hlc or
 * dieselResponsibility = hlc), HLC diesel demand is retained even for excluded equipment.
 */
export function dieselSliceExcluded(sl: ArrangementSlice, equipmentName: string): boolean {
  if (!equipmentSliceExcluded(sl, equipmentName)) return false;
  if (sl.workCategory === "bituminous") {
    // 028 §20 Fuel: fuel follows its category-specific component (plant_fuel /
    // transport_diesel / sprayer_fuel / paving_diesel); company-retained fuel
    // stays even when the machine itself is agency-owned.
    const fuelKey = bituminousFuelComponent(equipmentName);
    const fuelComp = respOf(sl.components, fuelKey);
    const dieselResp = sl.dieselResponsibility ?? null;
    if (fuelComp === "hlc" || fuelComp === "main_contractor" || dieselResp === "hlc") return false;
    return NON_HLC(fuelComp) || dieselResp === "agency";
  }
  const dieselComp = respOf(sl.components, "diesel_fuel");
  const dieselResp = sl.dieselResponsibility ?? null;
  if (dieselComp === "hlc" || dieselResp === "hlc") return false; // HLC supplies diesel to agency
  return NON_HLC(dieselComp) || dieselResp === "agency";
}

/** Labour slice exclusion: mapped component non-HLC, or (general crew) the whole
 *  execution chain is non-HLC — never drop all labour just because an arrangement exists. */
export function labourSliceExcluded(sl: ArrangementSlice, designation: string): boolean {
  if (sl.workCategory === "bituminous") {
    const m = mapLabourToComponents("bituminous", designation);
    if (m.componentKeys.length > 0) return NON_HLC(respOf(sl.components, ...m.componentKeys));
    // general crew: drops only when the whole bituminous execution chain is non-company
    const sig = significantComponentsFor("bituminous", sl.bituminousItemType);
    return sig.every(k => NON_HLC(respOf(sl.components, k)));
  }
  const key = labourComponentKey(designation);
  if (key) return NON_HLC(respOf(sl.components, key));
  return EXECUTION_COMPONENT_KEYS.every(k => NON_HLC(respOf(sl.components, k)));
}

/** Material/source slice exclusion (Instruction 025 §6): agency or client owns the material.
 *  028: bituminous slices resolve the material's own component (binder vs aggregates vs
 *  emulsion …) through the explicit registry; unmapped materials are never excluded. */
export function materialSliceExcluded(sl: ArrangementSlice, materialName?: string): boolean {
  if (sl.workCategory === "bituminous") {
    if (!materialName) return false;
    const m = mapMaterialToComponents("bituminous", materialName);
    if (m.componentKeys.length === 0) return false;
    return NON_HLC(respOf(sl.components, ...m.componentKeys));
  }
  return NON_HLC(respOf(sl.components, "material_source", "source_identification"));
}

export interface BomInputItem {
  id: number;
  description: string;
  itemCode?: string | null;
  itemName?: string | null;
  unit: string;
  canonicalUnit?: string | null;
  currentQty: number; // total BOQ qty
  layerConfig?: LayerConfig | null;
  workCategory?: string | null;
  materials: Array<{
    materialName: string;
    uom: string;
    qtyPerBoqUnit: number;
    wastagePct: number;
    isClientSupplied: boolean;
    isAuto?: boolean | null;
    supplyType?: "direct" | "plant";
  }>;
  equipment: Array<{
    equipmentName: string;
    qtyPerBoqUnit: number; // hours per BOQ unit
    count?: number;
    isClientSupplied?: boolean;
    consumptionNorm?: number | null; // fuel liters per hour
    fuelType?: string | null;        // "Diesel" | "Petrol" | "Electric" | "None"
  }>;
  labour: Array<{
    designation: string;
    qtyPerBoqUnit: number; // days per BOQ unit
    isClientSupplied?: boolean;
  }>;
  // Set by the BOM endpoint after resolving the RMC design / mix template / JMF.
  // When present, these rows DRIVE the demand directly (bypassing the legacy SDB rows).
  derivedKeyMaterials?: Array<{
    materialName: string;
    uom: string;
    qtyPerBoqUnit: number;
    wastagePct?: number;
    isClientSupplied?: boolean;
    isAuto?: boolean | null;
    supplyType?: "direct" | "plant";
    /** Cut-to-fill routing: earthwork layer-config rows carry this into the arrangement flow. */
    isEarthworkBulkRequirement?: boolean;
  }>;
  /**
   * Instruction 024: DB column bulk_material_classification.
   * null/undefined = not yet classified.
   * "earthwork"      = route into arrangement flow (same as isEarthworkBoqItem = true).
   * "vendor_supplied"= route into normal Plant Material mapping.
   */
  bulkMaterialClassification?: string | null;
}

export interface BomInputBar {
  /** DB id of the work_program_bars row — required for arrangement bar-level phasing (Instruction 026). */
  id?: number;
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
// Canonical grouping key — merges resources that differ only by letter-case or spacing
// (e.g. "Motor Grader (3.70m blade)" vs "MOTOR GRADER (3.70M BLADE)").
function canonResourceKey(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, " ");
}

// Collapse the many verbose SDB labour descriptions into standard trade designations
// so the labour demand is a clean, realistic list (not 30 "Mazdoor for ..." variants).
function normaliseDesignation(raw: string): string {
  const d = String(raw ?? "").toLowerCase();
  if (/mason/.test(d)) return "Mason";
  if (/carpenter/.test(d)) return "Carpenter";
  if (/bar\s*bend|blacksmith|steel\s*fixer|bar[-\s]*bending/.test(d)) return "Bar Bender / Blacksmith";
  if (/fitter|welder/.test(d)) return "Fitter / Welder";
  if (/\bmate\b/.test(d)) return "Mate";
  if (/supervisor|mistr|foreman/.test(d)) return "Supervisor / Mistry";
  if (/operator/.test(d)) return "Operator";
  if (/driver/.test(d)) return "Driver";
  if (/skilled/.test(d) && /mazdoor|labour|labor|worker|beldar/.test(d)) return "Mazdoor (Skilled)";
  if (/mazdoor|beldar|unskilled|coolie|cooli|helper|\blabour\b|\blabor\b|worker/.test(d)) return "Mazdoor (Unskilled)";
  return raw.trim();
}

// Prefer a readable (not ALL-CAPS) display name when merging case-variants.
function preferDisplayName(existing: string, candidate: string): string {
  const allCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
  if (allCaps(existing) && !allCaps(candidate)) return candidate;
  return existing;
}
// Equipment groups by BASE name only — the size/spec in brackets is ignored, e.g.
// "Vibratory Roller (11T)" / "(10T)" / "VIBRATORY ROLLER" → one "Vibratory Roller".
function equipmentBaseName(name: string): string {
  const base = name.split("(")[0].trim();
  return base || name.trim();
}
function canonEquipmentKey(name: string): string {
  return equipmentBaseName(name).toUpperCase().replace(/\s+/g, " ");
}

// ─── Key-Material BOM V1 helpers ──────────────────────────────────────────────
// Material BOM V1 is NOT a full rate-analysis material explosion.
// Only these procurement-critical material categories are included.

type KeyBomMaterialInputRow = {
  materialName: string;
  uom: string;
  qtyPerBoqUnit: number;
  wastagePct: number;
  isClientSupplied: boolean;
  isAuto?: boolean | null;
  supplyType?: "direct" | "plant";
  /** Instruction 023: true for earthwork/bulk-fill BOQ items (Earth, Subgrade, Shoulder, etc.) */
  isEarthworkBulkRequirement?: boolean;
  /** Instruction 024: true for gravel/moorum items with no saved bulkMaterialClassification. */
  requiresClassification?: boolean;
};

function textOf(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function getLayerType(item: BomInputItem): string {
  return textOf((item.layerConfig as any)?.layerType);
}

function isDirectGranularSupplyMaterial(m: KeyBomMaterialInputRow): boolean {
  const name = textOf(m.materialName);
  return (
    m.supplyType === "direct" &&
    (name.includes("gsb material") || name.includes("wmm material"))
  );
}

function isPlantMixTemplateMaterial(item: BomInputItem, m: KeyBomMaterialInputRow): boolean {
  const layerType = getLayerType(item);
  const isMixLayer =
    layerType === "bituminous" ||
    layerType === "granular" ||
    layerType === "concrete" ||
    /dbm|bituminous concrete|\bbc\b|bituminous macadam|\bbm\b|sdbc|wet mix|wmm|pcc|rcc|concrete/i.test(item.description);

  if (!isMixLayer) return false;
  if (m.supplyType !== "plant") return false;

  return (
    /aggregate|stone dust|aggregate dust|dust|filler|\bsand\b|fine\s*agg/i.test(m.materialName) ||
    /bitumen|vg-30|vg-40|crmb|pmb/i.test(m.materialName) ||
    /cement/i.test(m.materialName) ||
    /admixture|plasticizer|super\s*plasticizer/i.test(m.materialName)
  );
}

function isSprayCoatEmulsionMaterial(item: BomInputItem, m: KeyBomMaterialInputRow): boolean {
  const layerType = getLayerType(item);
  return (
    (layerType === "spray_coat" || /prime\s*coat|tack\s*coat/i.test(item.description)) &&
    /emulsion|bitumen/i.test(m.materialName)
  );
}

function isReinforcementBoqItem(item: BomInputItem): boolean {
  const unit = normaliseUnit(item.unit);
  return (
    unit === "MT" &&
    /hysd|tmt|reinforcement|reinforcing\s*steel|steel\s*reinforcement|rebar/i.test(item.description)
  );
}

export function isEarthworkBoqItem(item: BomInputItem): boolean {
  const desc = item.description.toLowerCase();
  const unit = normaliseUnit(item.unit);

  if (unit !== "CUM") return false;

  // Explicit exclusions: structural, drainage, roads base/mix, concrete items
  if (
    /foundation|footing|abutment|pier|wing\s*wall|return\s*wall|drain|culvert|pipe|trench|structure|back\s*filling|backfilling|behind\s*abutment|behind\s*wall|filter\s*media|stone\s*pitching|pcc|rcc|concrete|gsb|wmm|granular\s*sub[-\s]*base|wet\s*mix/i.test(desc)
  ) {
    return false;
  }

  // Instruction 024: gravel / moorum must NOT be auto-classified as earthwork.
  // Those items are ambiguous (may be earthwork-inclusive OR vendor-supplied) and
  // require explicit user classification before routing. Matching them here would
  // bypass the classification gate and send them straight into the arrangement flow.
  if (isGravelOrMoorumItem(item)) {
    return false;
  }

  // Instruction 024: expanded positive match — bulk earthwork / natural fill
  return (
    /embankment|subgrade|earthen\s*shoulder|shoulder|median\s*filling|borrow\s*soil|borrow\s*earth|selected\s*soil|selected\s*earth|suitable\s*soil|suitable\s*earth|embankment\s*material|subgrade\s*material|subgrade\s*soil|reused\s*excavat/i.test(desc)
  );
}

/**
 * Instruction 028 §8 — Separate shared bituminous classifier.
 * Order: explicit BOQ work-category/layer metadata → accepted complete
 * descriptions/abbreviations → (manual override handled by the caller via
 * executionArrangementCategoryForItem). Never classifies on loose words like
 * "coat" / "mix" / "concrete" / "plant" alone.
 */
export function isBituminousBoqItem(item: BomInputItem): boolean {
  const desc = item.description.toLowerCase();

  // Prime/tack coats are sprayed OVER granular layers — their descriptions often
  // mention WMM/GSB as the receiving surface, so check them before the veto.
  const isSprayCoat = /\bprime[\s-]*coat\b|\btack[\s-]*coat\b/i.test(desc);

  // Hard vetoes — cement concrete family and non-bituminous granular layers (028 §7/§9)
  if (/\bpcc\b|\brcc\b|cement\s*concrete|plain\s*concrete|reinforced\s*concrete/i.test(desc)) return false;
  if (!isSprayCoat && /gsb|granular\s*sub[-\s]*base|wmm|wet\s*mix\s*macadam/i.test(desc)) return false;
  if (/dismantl|removal|removing|breaking|milling/i.test(desc)) return false;

  // 1. Explicit metadata first
  const wc = textOf(item.workCategory);
  const layerType = getLayerType(item);
  if (wc === "bituminous" || layerType === "bituminous" || layerType === "spray_coat") return true;

  // 2. Accepted complete descriptions and abbreviations
  if (/\bprime[\s-]*coat\b|\btack[\s-]*coat\b/i.test(desc)) return true;
  if (/dense\s*bituminous\s*macadam|\bdbm\b/i.test(desc)) return true;
  if (/semi[-\s]*dense\s*bituminous\s*concrete|\bsdbc\b/i.test(desc)) return true;
  if (/bituminous\s*concrete|asphalt(ic)?\s*concrete/i.test(desc)) return true;
  if (/bituminous\s*macadam/i.test(desc)) return true;
  if (/\bseal\s*coat\b|premix\s*carpet|open[-\s]*graded\s*premix/i.test(desc)) return true;
  if (/bituminous\s*(mix\s*)?(supply|supply\s*and\s*lay)|emulsion\s*spray/i.test(desc)) return true;
  // Bare "BC" / "BM" only in a pavement/bituminous context (028 §9)
  const pavementContext = wc === "bituminous" || layerType === "bituminous"
    || /pavement|wearing\s*(coat|course)|binder\s*course|bitumin|asphalt|overlay/i.test(desc);
  if (/\bbc\b/i.test(desc) && pavementContext) return true;
  if (/\bbm\b/i.test(desc) && pavementContext) return true;

  return false;
}

/** Instruction 028 §5 — sub-type of a recognised bituminous item. */
export function bituminousItemTypeOf(item: BomInputItem):
  | "prime_coat" | "tack_coat" | "dbm" | "bc" | "sdbc" | "bituminous_macadam"
  | "seal_coat" | "premix_carpet" | "other_bituminous" | null {
  if (!isBituminousBoqItem(item)) return null;
  const desc = item.description.toLowerCase();
  if (/\bprime[\s-]*coat\b/i.test(desc)) return "prime_coat";
  if (/\btack[\s-]*coat\b/i.test(desc)) return "tack_coat";
  if (/dense\s*bituminous\s*macadam|\bdbm\b/i.test(desc)) return "dbm";
  if (/semi[-\s]*dense|\bsdbc\b/i.test(desc)) return "sdbc";
  if (/\bseal\s*coat\b/i.test(desc)) return "seal_coat";
  if (/premix\s*carpet|open[-\s]*graded\s*premix/i.test(desc)) return "premix_carpet";
  if (/bituminous\s*concrete|asphalt(ic)?\s*concrete|\bbc\b/i.test(desc)) return "bc";
  if (/bituminous\s*macadam|\bbm\b/i.test(desc)) return "bituminous_macadam";
  return "other_bituminous";
}

/**
 * Instruction 028 §10/§16 — resolve the Execution Arrangement category for a
 * BOQ item. Manual classification (bulkMaterialClassification) takes
 * precedence over keyword detection.
 * Returns "earthwork" | "bituminous" | null (not eligible).
 */
export function executionArrangementCategoryForItem(item: BomInputItem): "earthwork" | "bituminous" | null {
  const manual = textOf(item.bulkMaterialClassification);
  if (manual === "earthwork") return "earthwork";
  if (manual === "bituminous" || manual === "bituminous_arrangement_eligible") return "bituminous";
  if (manual === "not_bituminous" || manual === "vendor_supplied" || manual === "review_required") {
    // explicitly not bituminous — earthwork auto-detect may still apply for vendor_supplied? No:
    // vendor_supplied routes to material mapping; review_required is undecided. Neither enables arrangements.
    return manual === "not_bituminous" && isEarthworkBoqItem(item) ? "earthwork" : null;
  }
  if (isEarthworkBoqItem(item)) return "earthwork";
  if (isBituminousBoqItem(item)) return "bituminous";
  return null;
}

/**
 * Instruction 024 §6 — Gravel and moorum are ambiguous:
 * they may be earthwork (included in agency rate) or vendor-supplied material.
 * When this returns true AND the item is not already classified in boq_items,
 * the UI shows a "Classify" action instead of silently routing to material mapping.
 */
export function isGravelOrMoorumItem(item: BomInputItem): boolean {
  const desc = item.description.toLowerCase();
  const unit = normaliseUnit(item.unit);
  if (unit !== "CUM") return false;
  // Already excluded by the structural veto above
  if (/gsb|wmm|granular\s*sub[-\s]*base|wet\s*mix/i.test(desc)) return false;
  return /\bgravel\b|moorum|murrum|mooram/i.test(desc);
}

function isFlyAshBoqItem(item: BomInputItem): boolean {
  return normaliseUnit(item.unit) === "CUM" && /fly\s*ash/i.test(item.description);
}

// Pipes for cross-drainage / culvert works — a key procurement material taken by BOQ qty, by size.
function isPipeBoqItem(item: BomInputItem): boolean {
  const d = item.description;
  if (/dismantl|removal|removing|breaking/i.test(d)) return false;
  return /hume\s*pipe|\bnp[2-4]\b|rcc\s*pipe|spun\s*pipe|hdpe\s*pipe|reinforced\s*concrete\s*pipe/i.test(d);
}

function pipeMaterialName(item: BomInputItem): string {
  const d = item.description;
  // Class — tolerant of "NP-4" / "NP 4" / "NP4"
  const cls =
    /np[\s-]?4/i.test(d) ? "NP4" :
    /np[\s-]?3/i.test(d) ? "NP3" :
    /np[\s-]?2/i.test(d) ? "NP2" :
    /hdpe/i.test(d) ? "HDPE" : "";
  // Diameter in mm — tolerant of "1200 mm", "1200mm dia", "1200 dia", "DIA 1200", "1.2 m"
  let mm: number | null = null;
  const mDia = d.match(/(\d{3,4})\s*(?:mm)?\s*dia\b/i)   // "1200 dia" / "1200 mm dia"
            || d.match(/(\d{3,4})\s*mm\b/i)               // "1200 mm"
            || d.match(/dia\.?\s*(\d{3,4})\b/i);          // "dia 1200"
  const mMtr = d.match(/\b(\d(?:\.\d+)?)\s*m\b/i);        // "1.2 m"
  if (mDia) mm = parseInt(mDia[1], 10);
  else if (mMtr && parseFloat(mMtr[1]) < 10) mm = Math.round(parseFloat(mMtr[1]) * 1000);
  const size = mm ? `${mm}mm dia` : "";
  const base = /hdpe/i.test(d) ? "HDPE Pipe" : "RCC Hume Pipe";
  return [base, cls && `(${cls})`, size].filter(Boolean).join(" ");
}

function earthworkMaterialName(item: BomInputItem): string {
  const d = item.description.toLowerCase();
  if (/fly\s*ash/.test(d)) return "Fly Ash";
  if (/selected\s*soil|subgrade/.test(d)) return "Selected Soil / Subgrade Material";
  if (/shoulder/.test(d)) return "Shoulder Earth / Soil";
  if (/median/.test(d)) return "Median Fill Material";
  if (/embankment|borrow\s*soil/.test(d)) return "Earth / Borrow Soil";
  return "Earth / Borrow Soil";
}

function normaliseKeyMaterialName(item: BomInputItem, m: KeyBomMaterialInputRow): string {
  const raw = m.materialName || "";
  const desc = item.description;

  if (/tmt|hysd|reinforcement|reinforcing\s*steel|steel\s*reinforcement|rebar/i.test(raw)) {
    return "TMT / Reinforcement Steel";
  }

  if (/hume\s*pipe|hdpe\s*pipe|rcc\s*pipe|\bnp[2-4]\b|spun\s*pipe/i.test(raw)) {
    return raw; // pipes keep their size/class label
  }

  // Mirrors isGsbContext() / isWmmContext(): collapse into a single canonical line when
  // the BOQ item *description* identifies the layer type, even if the SDB norm names the
  // bulk granular component something else (e.g. "Granular Material" instead of
  // "WMM Material").  Regex borrowed from those helpers; normaliseBomMaterial() is
  // deliberately NOT called here because it can misclassify other material types
  // (e.g. rename steel as cement) in this context.
  if (
    /gsb material/i.test(raw) ||
    /\bgsb\b|granular\s*sub[-\s]*base/i.test(desc) ||
    /\bgsb\b|granular\s*sub[-\s]*base/i.test(raw)
  ) return "GSB Material";
  if (
    /wmm material/i.test(raw) ||
    /\bwmm\b|wet\s*mix\s*macadam|wet\s*mix/i.test(desc) ||
    /\bwmm\b|wet\s*mix\s*macadam|wet\s*mix/i.test(raw)
  ) return "WMM Material";

  // Emulsion naming must NEVER apply to a BC/DBM/SDBC/BM mix item that merely mentions
  // "after applying prime coat" / "over tack coat" — those keep their VG-grade binder.
  const descIsBitMix = /bituminous\s*concrete|\bbc\b|\bdbm\b|dense\s*bituminous|sdbc|bituminous\s*macadam|\bbm\b/i.test(desc);
  if (!descIsBitMix && (/emulsion/i.test(raw) || /prim(?:e|er)\s*coat|\bprimer\b|tack\s*coat/i.test(desc))) {
    if (/prim/i.test(desc)) return "Bitumen Emulsion SS-1";
    if (/tack/i.test(desc)) return "Bitumen Emulsion RS-1";
    return "Bitumen Emulsion";
  }

  // Only fall back to the item description for VG-grade detection when the raw material
  // name is itself binder-like. Without this guard, aggregate names like "10/12MM" or
  // "6MM DOWN" in a DBM item (whose description contains "bituminous macadam") would
  // be misclassified as "Bitumen VG-30" and collapse into the bitumen row.
  const rawIsBinder = /bitumen|vg[\s-]?\d+|binder|emulsion/i.test(raw);
  if (/vg\s*-?\s*40|vg40/i.test(raw) || (rawIsBinder && /vg\s*-?\s*40|vg40/i.test(desc))) return "Bitumen VG-40";
  if (/bitumen|vg\s*-?\s*30|vg30/i.test(raw) || (rawIsBinder && /vg\s*-?\s*30|vg30/i.test(desc))) return "Bitumen VG-30";

  if (/cement/i.test(raw)) return "Cement";
  if (/admixture|plasticizer|super\s*plasticizer/i.test(raw)) return "Admixture";

  if (/\bsand\b|fine\s*agg/i.test(raw)) return "Sand";
  if (/filler/i.test(raw)) return "Filler";
  if (/stone\s*dust|aggregate\s*dust|crusher\s*dust|dust/i.test(raw)) return "Stone Dust";
  if (/6\s*mm/i.test(raw)) return "6mm Aggregate";
  if (/10\s*mm|10\s*\/?\s*12\s*mm|11\.?2\s*mm|12\.?5\s*mm|13\.?2\s*mm/i.test(raw)) return "10mm Aggregate";
  if (/20\s*mm/i.test(raw)) return "20mm Aggregate";
  if (/40\s*mm|37\.?5\s*mm|53\s*mm|45\s*mm/i.test(raw)) return "40mm Aggregate";
  if (/aggregate/i.test(raw)) return "Aggregate";

  return raw;
}

function buildKeyMaterialRows(item: BomInputItem): KeyBomMaterialInputRow[] {
  const rows: KeyBomMaterialInputRow[] = [];

  // 1. Steel/rebars: use BOQ quantity directly — do not rely on SDB material rows.
  if (isReinforcementBoqItem(item)) {
    rows.push({
      materialName: "TMT / Reinforcement Steel",
      uom: "MT",
      qtyPerBoqUnit: 1,
      wastagePct: 0,
      isClientSupplied: false,
      isAuto: true,
    });
    return rows;
  }

  // 2. Fly ash: keep separate from borrow earth.
  if (isFlyAshBoqItem(item)) {
    rows.push({
      materialName: "Fly Ash",
      uom: normaliseUnit(item.unit),
      qtyPerBoqUnit: 1,
      wastagePct: 0,
      isClientSupplied: false,
      isAuto: true,
    });
    return rows;
  }

  // 2b. Pipes for cross-drainage / culvert works: by BOQ qty, grouped by size/class.
  if (isPipeBoqItem(item)) {
    rows.push({
      materialName: pipeMaterialName(item),
      uom: normaliseUnit(item.unit),
      qtyPerBoqUnit: 1,
      wastagePct: 0,
      isClientSupplied: false,
      isAuto: true,
    });
    return rows;
  }

  // 3. Main road earthwork/fill only: use BOQ quantity directly.
  // Does not include foundation excavation, structural backfilling, drains, walls, abutments.
  if (isEarthworkBoqItem(item)) {
    rows.push({
      materialName: earthworkMaterialName(item),
      uom: normaliseUnit(item.unit),
      qtyPerBoqUnit: 1,
      wastagePct: 0,
      isClientSupplied: false,
      isAuto: true,
      isEarthworkBulkRequirement: true, // Instruction 023: signals execution-arrangement flow
    });
    return rows;
  }

  // Instruction 024: Gravel/Moorum items are ambiguous — may be earthwork-inclusive or vendor-supplied.
  // Route based on the saved bulk_material_classification column.
  if (isGravelOrMoorumItem(item)) {
    const classification = item.bulkMaterialClassification;
    if (classification === "earthwork") {
      // Explicitly classified as earthwork: route into arrangement flow
      rows.push({
        materialName: "Gravel / Moorum",
        uom: normaliseUnit(item.unit),
        qtyPerBoqUnit: 1,
        wastagePct: 0,
        isClientSupplied: false,
        isAuto: true,
        isEarthworkBulkRequirement: true,
      });
      return rows;
    }
    if (classification !== "vendor_supplied") {
      // Unclassified (null/undefined): requires user decision before routing.
      // Emits a demand row with requiresClassification = true so shortage-check
      // returns "earthwork_classification_required" instead of "mapping_required".
      rows.push({
        materialName: "Gravel / Moorum (Unclassified)",
        uom: normaliseUnit(item.unit),
        qtyPerBoqUnit: 1,
        wastagePct: 0,
        isClientSupplied: false,
        isAuto: true,
        requiresClassification: true,
      });
      return rows;
    }
    // vendor_supplied: fall through to normal material-row handling below
  }

  // 2c. Template-derived materials (RMC design / mix-template JMF / granular / spray)
  // take precedence — links the BOM to the actual templates instead of legacy SDB rows.
  if (item.derivedKeyMaterials && item.derivedKeyMaterials.length > 0) {
    return item.derivedKeyMaterials.map(m => ({
      materialName: m.materialName,
      uom: m.uom,
      qtyPerBoqUnit: m.qtyPerBoqUnit,
      wastagePct: m.wastagePct ?? 0,
      isClientSupplied: m.isClientSupplied ?? false,
      isAuto: m.isAuto ?? true,
      supplyType: m.supplyType,
      // Cut-to-fill routing: derived earthwork soil rows keep their arrangement flag
      // even when the BOQ item itself failed isEarthworkBoqItem (e.g. "trench cutting"
      // phrasing in MoRT&H 301 roadway-excavation descriptions trips the exclusion).
      isEarthworkBulkRequirement: m.isEarthworkBulkRequirement ?? false,
    }));
  }

  // 3. Accept material rows only if they pass the strict key-material allowlist.
  for (const m of item.materials) {
    if (m.isClientSupplied) continue;

    const row: KeyBomMaterialInputRow = {
      materialName: m.materialName,
      uom: m.uom,
      qtyPerBoqUnit: m.qtyPerBoqUnit,
      wastagePct: m.wastagePct,
      isClientSupplied: m.isClientSupplied,
      isAuto: m.isAuto,
      supplyType: m.supplyType,
    };

    if (isDirectGranularSupplyMaterial(row)) {
      rows.push({ ...row, materialName: normaliseKeyMaterialName(item, row) });
      continue;
    }
    if (isPlantMixTemplateMaterial(item, row)) {
      rows.push({ ...row, materialName: normaliseKeyMaterialName(item, row) });
      continue;
    }
    if (isSprayCoatEmulsionMaterial(item, row)) {
      rows.push({ ...row, materialName: normaliseKeyMaterialName(item, row) });
      continue;
    }
  }

  return rows;
}

export function calculateBomDemand(
  items: BomInputItem[],
  bars: BomInputBar[],
  totalMonths: number = 12,
  options?: {
    /** Instruction 025: active execution arrangements — reduce HLC demand per component responsibility. */
    arrangements?: ArrangementDemandInput[];
  },
): BomDemand {
  const matMap = new Map<string, BomMaterialRow>();
  const eqMap = new Map<string, BomEquipmentRow>();
  const labMap = new Map<string, BomLabourRow>();

  // ── Instruction 025: per-item arrangement effects (active statuses only) ──
  const arrangementEffects = buildArrangementEffects(items, options?.arrangements);
  const demandAdjustments: DemandAdjustment[] = [];
  const arrangementOverlaps: ArrangementOverlapWarning[] = [];
  for (const eff of arrangementEffects.values()) {
    if (eff.overlap) arrangementOverlaps.push(eff.overlap);
  }

  // Group bars by boqItemId
  const barsByItem = new Map<number, BomInputBar[]>();
  for (const bar of bars) {
    if (!barsByItem.has(bar.boqItemId)) barsByItem.set(bar.boqItemId, []);
    barsByItem.get(bar.boqItemId)!.push(bar);
  }

  // Instruction 026 §9-10: per-bar monthly share profiles (barId → month → share of
  // the bar's quantity). Used to phase bar-linked arrangement exclusions so demand
  // is excluded only in the linked bar's programmed months.
  const barMonthShares = new Map<number, Map<number, number>>();
  for (const bar of bars) {
    if (bar.id == null || bar.startMonth == null || bar.endMonth == null || !(bar.plannedQty > 0)) continue;
    const slices = calculateMonthlyDistribution(bar.plannedQty, bar.startMonth, bar.endMonth, totalMonths);
    const shares = new Map<number, number>();
    for (const s of slices) shares.set(s.month, (shares.get(s.month) ?? 0) + s.qty / bar.plannedQty);
    barMonthShares.set(bar.id, shares);
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

    // Materials — V1 KEY MATERIALS ONLY.
    // Do not explode all SDB/SNL rate-analysis material rows into procurement BOM.
    // Accepted sources:
    // - GSB/WMM direct-supply rows
    // - HMP/RMC/JMF/mix-template components (aggregates, bitumen, cement, admixture)
    // - prime/tack coat emulsion rows
    // - reinforcement BOQ quantity as steel (quantity-based, no SDB dependency)
    // - earthwork/fill BOQ quantity as soil/earth (quantity-based)
    const keyMaterialRows = buildKeyMaterialRows(item);

    if (item.materials.length > 0 && keyMaterialRows.length === 0 && typeof console !== "undefined") {
      console.debug("[BOM V1 ignored non-key material rows]", {
        itemCode: item.itemCode,
        description: item.description,
        ignoredMaterialCount: item.materials.length,
      });
    }

    for (const m of keyMaterialRows) {
      if (m.isClientSupplied) continue;

      const effQtyPerUnit = m.qtyPerBoqUnit * (1 + (m.wastagePct || 0) / 100);
      const lineQty = effQtyPerUnit * workQty;
      if (lineQty <= 0) continue;

      // Key material rows are already deliberately generated/allowed.
      // Do not pass through normaliseBomMaterial() — it reads BOQ description and
      // can wrongly rename steel as cement, earth as another category, etc.
      const finalName = normaliseKeyMaterialName(item, m);
      const key = canonResourceKey(finalName);

      if (!matMap.has(key)) {
        matMap.set(key, {
          materialName: finalName,
          uom: m.uom,
          totalQty: 0,
          monthlyQty: {},
          hasAutoSource: false,
          breakdown: [],
          originalNormMaterialName: m.materialName,
          displayMaterialName: finalName,
          suggestedMaterialMasterName: finalName,
          materialGroup: finalName,
          reviewNeeded: false,
          normalisationReason: "Material BOM V1 key-material allowlist",
          supplyType: m.supplyType,
          isEarthworkBulkRequirement: m.isEarthworkBulkRequirement ?? false, // Instruction 023
          requiresClassification: m.requiresClassification ?? false,       // Instruction 024
        });
      }

      const row = matMap.get(key)!;
      row.materialName = preferDisplayName(row.materialName, finalName);
      row.totalQty += lineQty;
      row.uom = m.uom;
      if (m.isAuto) row.hasAutoSource = true;
      // OR-merge earthwork/classification flags: if ANY contributing item marks the
      // row as an earthwork bulk requirement, the merged row routes to the arrangement flow.
      if (m.isEarthworkBulkRequirement) row.isEarthworkBulkRequirement = true;
      if (m.requiresClassification) row.requiresClassification = true;
      if (m.supplyType) {
        if (!row.supplyType || m.supplyType === "plant") row.supplyType = m.supplyType;
      }
      {
        // Merge only TRUE duplicates (same itemCode AND same description) so 6 identical
        // DBM sub-rows collapse to one contributor, while genuinely distinct lines that
        // share a parent itemCode (steel Foundation/Sub/Super) or repeat across bills
        // (GSB in Bill 3 vs Bill 10) still show separately.
        const bk = String((item.itemCode ?? "") + "|" + (item.description ?? ""));
        const exB = row.breakdown.find((b: any) => ((b.itemCode ?? "") + "|" + (b.fullDescription ?? "")) === bk);
        if (exB) {
          // Same item, different component normalising to the same material (e.g. composite
          // items where "10/12MM" and "10mm Aggregate" both → "10mm Aggregate").
          // Only accumulate lineQty; workQty stays at the value already set (same bars,
          // not a different item), and update qtyPerUnit to show the combined rate.
          exB.lineQty += lineQty;
          exB.qtyPerUnit = exB.lineQty / exB.workQty;
        } else row.breakdown.push({
          boqItemId: item.id,
          isProgrammed: itemBars.length > 0,
          itemDescription: item.itemName || item.description,
          fullDescription: item.description,
          itemCode: item.itemCode,
          unit: item.canonicalUnit ?? item.unit,
          compositeLabel: (item as any).compositeLabel ?? undefined,
          qtyPerUnit: effQtyPerUnit,
          workQty,
          lineQty,
          isAuto: m.isAuto ?? true,
        });
      }
      for (const [month, mwq] of monthlyWork) {
        row.monthlyQty[month] = (row.monthlyQty[month] ?? 0) + effQtyPerUnit * mwq;
      }
    }

    // Instruction 025: arrangement effects for this item (exclusion fractions are
    // computed against the full BOQ item quantity, then applied to programmed demand).
    const itemEff = arrangementEffects.get(item.id);
    const itemQtyForEff = Number(item.currentQty) > 0 ? Number(item.currentQty) : workQty;

    // Equipment
    for (const e of item.equipment) {
      if (e.isClientSupplied) continue;
      // Manual / labour-based "crew" is labour, not plant — keep it out of the equipment BOM.
      if (/manual|labour[\s-]?based|labor[\s-]?based|by\s*hand|hand[\s-]?(packing|breaking|mixing)|coolie|mazdoor/i.test(e.equipmentName)) continue;
      const cnt = e.count ?? 1;
      const display = equipmentBaseName(e.equipmentName);

      // Instruction 025 §7: retain only the HLC-responsible fraction, component by component.
      const eqEff = arrangementExclusionEffect(itemEff, itemQtyForEff, monthlyWork, barMonthShares, sl => equipmentSliceExcluded(sl, e.equipmentName));
      const fullLineHours = e.qtyPerBoqUnit * workQty * cnt;
      const lineHours = fullLineHours * eqEff.fraction;
      if (eqEff.fraction < 1 && fullLineHours > 0) {
        demandAdjustments.push({
          boqItemId: item.id,
          itemCode: item.itemCode,
          kind: "equipment",
          resourceName: display,
          excludedQty: Math.round((fullLineHours - lineHours) * 100) / 100,
          unit: "hrs",
          agencyName: eqEff.agencies.join(", ") || null,
          note: `${Math.round(eqEff.excludedQty).toLocaleString()} ${item.canonicalUnit ?? item.unit ?? ""} excluded from HLC ${display} demand under approved arrangement${eqEff.agencies.length ? ` with ${eqEff.agencies.join(", ")}` : ""}.`,
        });
      }
      if (lineHours <= 0) {
        // Fully agency-owned equipment for the whole allocated quantity — still fall
        // through to diesel below in case HLC supplies fuel to the agency equipment.
      }
      const key = canonEquipmentKey(e.equipmentName);
      if (!eqMap.has(key)) {
        eqMap.set(key, { equipmentName: display, count: cnt, totalHours: 0, monthlyHours: {}, breakdown: [] });
      }
      const row = eqMap.get(key)!;
      row.equipmentName = preferDisplayName(row.equipmentName, display);
      row.totalHours += lineHours;
      row.count = Math.max(row.count, cnt);
      {
        // Merge only TRUE duplicates (same itemCode AND same description) so 6 identical
        // DBM sub-rows collapse to one contributor, while genuinely distinct lines that
        // share a parent itemCode (steel Foundation/Sub/Super) or repeat across bills
        // (GSB in Bill 3 vs Bill 10) still show separately.
        const bk = String((item.itemCode ?? "") + "|" + (item.description ?? ""));
        const exB = row.breakdown.find((b: any) => ((b.itemCode ?? "") + "|" + (b.fullDescription ?? "")) === bk);
        if (exB) { exB.lineHours += lineHours; exB.workQty += workQty; }
        else row.breakdown.push({ itemDescription: item.itemName || item.description, fullDescription: item.description, itemCode: item.itemCode, unit: item.canonicalUnit ?? item.unit, hrsPerUnit: e.qtyPerBoqUnit, workQty, lineHours });
      }
      for (const [month, mwq] of monthlyWork) {
        row.monthlyHours[month] = (row.monthlyHours[month] ?? 0) + e.qtyPerBoqUnit * mwq * cnt * eqEff.monthFraction(month);
      }

      // FROZEN RULE 7 — Diesel / HSD fuel: the ONLY fuel source for the BOM is
      // equipment/plant running hours × consumption norm (liters/hour). Wired month-wise.
      const norm = e.consumptionNorm ?? 0;
      const isDiesel = /diesel|hsd/i.test(textOf(e.fuelType));
      // HSD scoping: cranes/lifting run intermittently → never fuel the BOM.
      // Structure-erection / fixing / misc items don't consume continuous plant fuel.
      const isCraneEquip = /\bcrane\b|lifting|girder|launch/i.test(e.equipmentName);
      const isNonHsdItem = /toll\s*booth|toll\s*plaza|crash\s*barrier|\bsignage\b|sign\s*board|road\s*furniture|delineator|road\s*marking|thermoplastic|painting|railing|parapet|building|\bbooth\b|guard\s*rail|metal\s*beam|gantry|\bkm\s*stone|boundary\s*(stone|pillar)|reflector/i.test(item.description || "");
      if (norm > 0 && isDiesel && !isCraneEquip && !isNonHsdItem) {
        // Instruction 025 §8: diesel follows the responsibility for the consuming
        // equipment/activity — but stays with HLC when HLC supplies fuel to the agency.
        const fuelEff = arrangementExclusionEffect(itemEff, itemQtyForEff, monthlyWork, barMonthShares, sl => dieselSliceExcluded(sl, e.equipmentName));
        const fuelPerBoqUnit = e.qtyPerBoqUnit * cnt * norm * fuelEff.fraction; // liters per BOQ unit (HLC share)
        if (fuelEff.fraction < 1) {
          const fullFuel = e.qtyPerBoqUnit * cnt * norm * workQty;
          demandAdjustments.push({
            boqItemId: item.id,
            itemCode: item.itemCode,
            kind: "diesel",
            resourceName: `Diesel / HSD (${display})`,
            excludedQty: Math.round((fullFuel - fuelPerBoqUnit * workQty) * 100) / 100,
            unit: "L",
            agencyName: fuelEff.agencies.join(", ") || null,
            note: `${Math.round(fuelEff.excludedQty).toLocaleString()} ${item.canonicalUnit ?? item.unit ?? ""} excluded from HLC ${display} diesel demand under approved arrangement${fuelEff.agencies.length ? ` with ${fuelEff.agencies.join(", ")}` : ""}.`,
          });
        }
        if (fuelPerBoqUnit <= 0) {
          // Entire fuel demand for this equipment is agency-owned — nothing to add.
        } else {
        const fuelKey = canonResourceKey("Diesel / HSD");
        if (!matMap.has(fuelKey)) {
          matMap.set(fuelKey, {
            materialName: "Diesel / HSD",
            uom: "L",
            totalQty: 0,
            monthlyQty: {},
            hasAutoSource: true,
            breakdown: [],
            originalNormMaterialName: "Diesel / HSD",
            displayMaterialName: "Diesel / HSD",
            suggestedMaterialMasterName: "Diesel / HSD",
            materialGroup: "Diesel / HSD",
            reviewNeeded: false,
            normalisationReason: "Fuel demand from equipment consumption norm × running hours",
          });
        }
        const fuelRow = matMap.get(fuelKey)!;
        fuelRow.totalQty += fuelPerBoqUnit * workQty;
        fuelRow.breakdown.push({
          boqItemId: item.id,
          isProgrammed: itemBars.length > 0,
          itemDescription: `${display} — fuel`,
          fullDescription: `${item.description} (${display} @ ${norm} L/hr)`,
          itemCode: item.itemCode,
          qtyPerUnit: fuelPerBoqUnit,
          workQty,
          lineQty: fuelPerBoqUnit * workQty,
          isAuto: true,
        });
        for (const [month, mwq] of monthlyWork) {
          // Bar-level phasing: apply the month-specific retained fraction, not the flat one.
          fuelRow.monthlyQty[month] = (fuelRow.monthlyQty[month] ?? 0) + e.qtyPerBoqUnit * cnt * norm * mwq * fuelEff.monthFraction(month);
        }
        }
      }
    }

    // Labour
    for (const l of item.labour) {
      if (l.isClientSupplied) continue;
      const designation = normaliseDesignation(l.designation);
      // Instruction 025 §9: exclude labour only where explicitly agency-owned;
      // general crews drop only for fully-outsourced execution chains.
      const labEff = arrangementExclusionEffect(itemEff, itemQtyForEff, monthlyWork, barMonthShares, sl => labourSliceExcluded(sl, designation));
      const lineDays = l.qtyPerBoqUnit * workQty * labEff.fraction;
      if (labEff.fraction < 1) {
        demandAdjustments.push({
          boqItemId: item.id,
          itemCode: item.itemCode,
          kind: "labour",
          resourceName: designation,
          excludedQty: Math.round(l.qtyPerBoqUnit * workQty * (1 - labEff.fraction) * 100) / 100,
          unit: "days",
          agencyName: labEff.agencies.join(", ") || null,
          note: `${Math.round(labEff.excludedQty).toLocaleString()} ${item.canonicalUnit ?? item.unit ?? ""} excluded from HLC ${designation} demand under approved arrangement${labEff.agencies.length ? ` with ${labEff.agencies.join(", ")}` : ""}.`,
        });
      }
      if (lineDays <= 0) continue;
      const key = canonResourceKey(designation);
      if (!labMap.has(key)) {
        labMap.set(key, { designation, totalDays: 0, monthlyDays: {}, breakdown: [] });
      }
      const row = labMap.get(key)!;
      row.designation = preferDisplayName(row.designation, designation);
      row.totalDays += lineDays;
      {
        // Merge only TRUE duplicates (same itemCode AND same description) so 6 identical
        // DBM sub-rows collapse to one contributor, while genuinely distinct lines that
        // share a parent itemCode (steel Foundation/Sub/Super) or repeat across bills
        // (GSB in Bill 3 vs Bill 10) still show separately.
        const bk = String((item.itemCode ?? "") + "|" + (item.description ?? ""));
        const exB = row.breakdown.find((b: any) => ((b.itemCode ?? "") + "|" + (b.fullDescription ?? "")) === bk);
        if (exB) { exB.lineDays += lineDays; exB.workQty += workQty; }
        else row.breakdown.push({ itemDescription: item.itemName || item.description, fullDescription: item.description, itemCode: item.itemCode, unit: item.canonicalUnit ?? item.unit, daysPerUnit: l.qtyPerBoqUnit, workQty, lineDays });
      }
      for (const [month, mwq] of monthlyWork) {
        row.monthlyDays[month] = (row.monthlyDays[month] ?? 0) + l.qtyPerBoqUnit * mwq * labEff.monthFraction(month);
      }
    }
  }

  // Apply contractor-friendly group sort order
  const materials = sortBomMaterials([...matMap.values()].filter(r => r.totalQty > 0));
  const equipment = [...eqMap.values()].filter(r => r.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours);
  const labour = [...labMap.values()].filter(r => r.totalDays > 0).sort((a, b) => b.totalDays - a.totalDays);

  // ── Derive 3-state programming status per material row ─────────────────────
  // Uses the boqItemId + isProgrammed flags stamped on each breakdown entry.
  for (const row of materials) {
    // Only entries with an explicit isProgrammed flag count (materials/fuel have it;
    // legacy entries without the flag are treated as unknown / excluded from the count).
    const flagged = row.breakdown.filter(bd => bd.isProgrammed !== undefined);
    if (flagged.length === 0) {
      // No flag information — treat as fully programmed (fallback)
      row.programmingStatus = "fully_programmed";
      row.programmedTotalDemand = row.totalQty;
      row.unprogrammedDemand = 0;
    } else {
      const prog = flagged.filter(bd => bd.isProgrammed === true);
      const unprog = flagged.filter(bd => bd.isProgrammed === false);
      if (unprog.length === 0) {
        row.programmingStatus = "fully_programmed";
      } else if (prog.length === 0) {
        row.programmingStatus = "not_programmed";
      } else {
        row.programmingStatus = "partly_programmed";
      }
      row.programmedTotalDemand = prog.reduce((sum, bd) => sum + bd.lineQty, 0);
      row.unprogrammedDemand = unprog.reduce((sum, bd) => sum + bd.lineQty, 0);
    }
  }

  // ── Instruction 025 §6/§12 + 028 §25–29: material rows — physical quantity
  // stays visible; expose the outsourced vs HLC split instead of shrinking
  // totalQty. Earthwork rows use the source components; bituminous rows resolve
  // each material's own component (binder / aggregates / emulsion / filler).
  if (arrangementEffects.size > 0) {
    const itemQtyById = new Map(items.map(i => [i.id, Number(i.currentQty) || 0]));
    // Items that have at least one bituminous arrangement slice
    const bituminousEffItems = new Set<number>();
    arrangementEffects.forEach((eff, iid) => {
      if (eff.slices.some(sl => sl.workCategory === "bituminous")) bituminousEffItems.add(iid);
    });
    for (const row of materials) {
      const isEarthworkRow = !!(row as any).isEarthworkBulkRequirement;
      const isBituminousRow = !isEarthworkRow
        && row.breakdown.some(bd => (bd as any).boqItemId != null && bituminousEffItems.has((bd as any).boqItemId));
      if (!isEarthworkRow && !isBituminousRow) continue;
      let outsourced = 0;
      const agencies: string[] = [];
      for (const bd of row.breakdown) {
        const bid = (bd as any).boqItemId;
        const eff = bid != null ? arrangementEffects.get(bid) : undefined;
        if (!eff) continue;
        const m = hlcRetainedFraction(eff, itemQtyById.get(bid) ?? 0, sl => materialSliceExcluded(sl, row.materialName));
        outsourced += (bd.lineQty ?? 0) * (1 - m.fraction);
        for (const a of m.agencies) if (!agencies.includes(a)) agencies.push(a);
      }
      if (outsourced > 0.001) {
        (row as any).arrangementOutsourcedQty = Math.round(Math.min(outsourced, row.totalQty) * 1000) / 1000;
        (row as any).arrangementHlcQty = Math.round(Math.max(0, row.totalQty - outsourced) * 1000) / 1000;
        demandAdjustments.push({
          boqItemId: row.breakdown[0]?.boqItemId ?? 0,
          itemCode: null,
          kind: "material",
          resourceName: row.materialName,
          excludedQty: Math.round(outsourced * 1000) / 1000,
          unit: row.uom,
          agencyName: agencies.join(", ") || null,
          note: `${Math.round(outsourced).toLocaleString()} ${row.uom} of ${row.materialName} sourced by agency/client under approved arrangement${agencies.length ? ` with ${agencies.join(", ")}` : ""} — excluded from HLC procurement demand.`,
        });
      }
    }
  }

  // ── Instruction 028 §22–23: disclose responsibility components that have NO
  // matching resource in the item's actual recipe (never invent demand, never
  // claim "excluded" when nothing existed).
  const mappingWarnings: DemandComponentMappingWarning[] = [];
  if (arrangementEffects.size > 0) {
    for (const item of items) {
      const eff = arrangementEffects.get(item.id);
      if (!eff) continue;
      const bituminousSlices = eff.slices.filter(sl => sl.workCategory === "bituminous");
      if (bituminousSlices.length === 0) continue;
      const recipe = {
        materials: [
          ...item.materials.map(m => m.materialName),
          ...(item.derivedKeyMaterials ?? []).map(m => m.materialName),
        ],
        equipment: item.equipment.map(e => e.equipmentName),
        labour: item.labour.map(l => l.designation),
      };
      const mergedComponents: Record<string, string> = {};
      for (const sl of bituminousSlices) {
        for (const [k, v] of Object.entries(sl.components ?? {})) {
          if (v === "agency" || v === "client" || v === "not_applicable") mergedComponents[k] = v;
        }
      }
      for (const w of findMissingDemandMappings(item.id, mergedComponents, recipe)) {
        if (!mappingWarnings.some(x => x.boqItemId === w.boqItemId && x.componentKey === w.componentKey)) {
          mappingWarnings.push(w);
        }
      }
    }
  }

  return { materials, equipment, labour, demandAdjustments, arrangementOverlaps, mappingWarnings };
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
  layerType: "bituminous" | "granular" | "spray_coat" | "earthwork" | "concrete" | "none";
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
  convertedVia: "exact" | "converted" | "manual" | "none";
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
  // Exact match first (standardOutputs / theoretical×efficiency only — exclude the
  // qtyPerBoqUnit fallback here so it can be reported separately as "manual" below).
  const exact = getEffectiveOutputPerHr({ ...eq, qtyPerBoqUnit: null }, targetUnit);
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

  // Last resort: item-specific qtyPerBoqUnit rate — already scoped to the item's own
  // unit, no conversion needed. Reported as "manual" so callers can distinguish it from
  // a genuine master-derived output.
  if (eq.qtyPerBoqUnit && eq.qtyPerBoqUnit > 0) {
    return { outputPerHr: (1 / eq.qtyPerBoqUnit) * eq.count, nativeUnit: targetUnit, convertedVia: "manual" };
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

// ─── Material Group Sort Order ────────────────────────────────────────────────

/** V1 key-material procurement order for the BOM materials table. */
const MATERIAL_GROUP_ORDER: readonly string[] = [
  "gsb material",
  "wmm material",

  "earth / borrow soil",
  "fly ash",
  "selected soil / subgrade material",
  "shoulder earth / soil",
  "median fill material",

  "bitumen vg-30",
  "bitumen vg-40",
  "bitumen emulsion ss-1",
  "bitumen emulsion rs-1",
  "bitumen emulsion",

  "stone dust",
  "aggregate dust",
  "6mm aggregate",
  "10mm aggregate",
  "20mm aggregate",
  "40mm aggregate",
  "aggregate",
  "filler",

  "sand",
  "cement",
  "admixture",

  "tmt / reinforcement steel",
];

/**
 * Sorts BOM material rows in contractor-friendly procurement order.
 * Known group names appear in the fixed order above; unknown names sort
 * by total quantity descending after all known names.
 */
export function sortBomMaterials(materials: BomMaterialRow[]): BomMaterialRow[] {
  const orderMap = new Map(MATERIAL_GROUP_ORDER.map((n, i) => [n, i]));
  return [...materials].sort((a, b) => {
    const ai = orderMap.get(a.materialName.toLowerCase()) ?? 9999;
    const bi = orderMap.get(b.materialName.toLowerCase()) ?? 9999;
    if (ai !== bi) return ai - bi;
    return b.totalQty - a.totalQty;
  });
}

// ─── Material Derivation from Layer Config ────────────────────────────────────

export interface DerivedMaterialRow {
  materialName: string;
  uom: string;
  qtyPerBoqUnit: number;
  isAuto: true;
  applicationNote?: string;
  /**
   * Cut-to-fill routing: layer-config-derived soil/earth rows (layerType "earthwork")
   * must route into the execution-arrangement flow, not Plant Material mapping.
   */
  isEarthworkBulkRequirement?: boolean;
}

/** Standard bulk densities for converting mix-design kg/m³ → procurement CUM. */
export const SAND_BULK_DENSITY_T_PER_CUM = 1.6;        // fine aggregate / sand
export const COARSE_AGG_BULK_DENSITY_T_PER_CUM = 1.45;  // coarse aggregate (10mm/20mm)

/** Concrete mix design pulled from the RMC module (rmc_mix_designs). */
export interface ConcreteMixDesignInput {
  grade: string;
  cementContent?: number | null;        // kg/m³
  admixtureName?: string | null;
  admixtureDosage?: number | null;       // % of cement weight
  componentProportions?: {
    cement?: number | null;
    fineAgg?: number | null;
    coarseAgg10?: number | null;
    coarseAgg20?: number | null;
  } | null;
}

/** Standard spray coat application rates (kg/SQM) per IRC SP-20 guidelines */
export const SPRAY_RATES_KG_M2: Record<string, number> = {
  PC: 0.7,   // Prime Coat
  TC: 0.2,   // Tack Coat
  FS: 0.25,  // Fog Seal
  TC_MOD: 0.35, // Modified / CRMB Tack Coat
};

/**
 * Maps full mix-type names (and common aliases) to their canonical abbreviation.
 * Used to normalise mix-type strings entered by users or stored in project settings
 * before comparing against mix-template link keys.
 */
const MIX_TYPE_ALIASES: Record<string, string> = {
  "BITUMINOUS CONCRETE": "BC",
  "BC": "BC",
  "DENSE BITUMINOUS MACADAM": "DBM",
  "DBM": "DBM",
  "BITUMINOUS MACADAM": "BM",
  "BM": "BM",
  "SEMI-DENSE BITUMINOUS CONCRETE": "SDBC",
  "SEMI DENSE BITUMINOUS CONCRETE": "SDBC",
  "SDBC": "SDBC",
  "MASTIC ASPHALT": "MA",
  "MA": "MA",
  "SURFACE DRESSING": "SD",
  "SD": "SD",
  "WET MIX MACADAM": "WMM",
  "WMM": "WMM",
  "GRANULAR SUB BASE": "GSB",
  "GSB": "GSB",
};

/**
 * Normalise a mix-type string to its canonical upper-case abbreviation.
 * Returns the trimmed upper-case input unchanged when no alias is found.
 */
export function normaliseMixType(mixType: string): string {
  const key = mixType.trim().toUpperCase();
  return MIX_TYPE_ALIASES[key] ?? key;
}

// Patterns indicating a name is already a practical procurement name — skip normalisation.
// NOTE: /\bMaterial$/i is intentionally excluded here because "Granular Material" must go
// through the direct-supply collapse logic before being passed through unchanged.
const ALREADY_PRACTICAL_PATTERNS: RegExp[] = [
  /\(Processed\)$/i,                // GSB (Processed), WMM (Processed)
  /^(GSB|WMM|WBM)\s+Material$/i,    // Only known-correct finished-material names pass through
  /\bmm\s+Aggregate$/i,             // 10mm Aggregate, 20mm Aggregate, 40mm Aggregate
  /^13mm\s+Aggregate$/i,
  /^Bitumen\s+VG-\d+/i,             // Bitumen VG-30, VG-40
  /^Bitumen\s+Emulsion\s+[RC]S-/i,  // RS-1, SS-1 already specified
  /^LDO\s*\/\s*Process/i,           // LDO / Process Fuel
  /^Diesel\s*\/\s*HSD/i,            // Diesel / HSD
  /^(Cement|Sand|Water)$/i,
  /^TMT\s*\/\s*Reinforcement/i,
  /^Stone\s+Dust$/i,
  /^Filler(\s+\(.+\))?$/i,          // Filler, Filler (Lime)
  /^Bituminous\s+Mix$/i,
  /^Soil\s*\/\s*Earth$/i,
];

function isWmmContext(desc: string, mix: string, raw: string): boolean {
  return (
    mix === "WMM" ||
    /\bwmm\b|wet\s*mix|wet\s*mix\s*macadam/i.test(desc) ||
    /\bwmm\b|wet\s*mix|wet\s*mix\s*macadam/i.test(raw)
  );
}

function isGsbContext(desc: string, mix: string, raw: string): boolean {
  return (
    mix === "GSB" ||
    /\bgsb\b|granular\s*sub[-\s]*base|sub[-\s]*base/i.test(desc) ||
    /\bgsb\b|granular\s*sub[-\s]*base/i.test(raw)
  );
}

function isDirectGranularContext(input: MaterialNormalisationInput): boolean {
  return (
    (input.layerType === "granular" &&
      (input.granularSource == null || input.granularSource !== "plant")) ||
    input.supplyType === "direct"
  );
}

/**
 * Converts SDB/SNL technical material names to practical procurement names.
 * Pure function — no DB access. Called inside calculateBomDemand before keying.
 *
 * Rule priority order (most specific first):
 *   1. Direct-supply granular GSB/WMM collapse  ← MUST fire before ALREADY_PRACTICAL_PATTERNS
 *   2. ALREADY_PRACTICAL_PATTERNS pass-through
 *   3. Fuel (Diesel/HSD, LDO)
 *   4. Emulsion / spray coat
 *   5. Bitumen (generic)
 *   6. Steel / reinforcement
 *   7. Cement / Sand / Water
 *   8. Aggregate gradation ranges
 *   9. Fallback (reviewNeeded = true)
 */
export function normaliseBomMaterial(input: MaterialNormalisationInput): MaterialNormalisationResult {
  const raw = input.materialName || "";
  const s = raw.toLowerCase().trim();
  const desc = (input.itemDescription || "").toLowerCase();
  const mix = normaliseMixType(input.mixType || "");
  const directGranular = isDirectGranularContext(input);

  const identity = (): MaterialNormalisationResult => ({
    originalNormMaterialName: raw,
    displayMaterialName: raw,
    materialGroup: raw,
    suggestedMaterialMasterName: raw,
    confidence: 0.99,
    reviewNeeded: false,
    normalisationReason: "Already a practical procurement name",
  });

  // 1. Direct-supply GSB/WMM collapse BEFORE the practical-patterns check.
  //    Without this ordering, "Granular Material" matches /\bMaterial$/i and
  //    passes through before the correct "WMM Material"/"GSB Material" can be set.
  if (directGranular) {
    if (isWmmContext(desc, mix, raw)) {
      return { originalNormMaterialName: raw, displayMaterialName: "WMM Material", materialGroup: "WMM Material", suggestedMaterialMasterName: "WMM Material", confidence: 0.98, reviewNeeded: false, normalisationReason: "Direct-supply WMM collapsed to finished procurement material" };
    }
    if (isGsbContext(desc, mix, raw)) {
      return { originalNormMaterialName: raw, displayMaterialName: "GSB Material", materialGroup: "GSB Material", suggestedMaterialMasterName: "GSB Material", confidence: 0.98, reviewNeeded: false, normalisationReason: "Direct-supply GSB collapsed to finished procurement material" };
    }
  }

  // 2. Pass through names that are already practical.
  if (ALREADY_PRACTICAL_PATTERNS.some((p) => p.test(raw))) return identity();

  // 3. Fuel — keep practical names.
  if (/diesel|hsd/i.test(raw)) {
    return { originalNormMaterialName: raw, displayMaterialName: "Diesel / HSD", materialGroup: "Diesel / HSD", suggestedMaterialMasterName: "Diesel / HSD", confidence: 0.99, reviewNeeded: false, normalisationReason: "Fuel demand from equipment consumption" };
  }
  if (/ldo|process\s*fuel/i.test(raw)) {
    return { originalNormMaterialName: raw, displayMaterialName: "LDO / Process Fuel", materialGroup: "LDO / Process Fuel", suggestedMaterialMasterName: "LDO / Process Fuel", confidence: 0.99, reviewNeeded: false, normalisationReason: "HMP process fuel demand" };
  }

  // 4. Emulsion / spray coat.
  if (/emulsion/i.test(raw)) {
    const label = /prime/i.test(desc) ? "Bitumen Emulsion SS-1" : /tack/i.test(desc) ? "Bitumen Emulsion RS-1" : "Bitumen Emulsion";
    return { originalNormMaterialName: raw, displayMaterialName: label, materialGroup: label, suggestedMaterialMasterName: label, confidence: 0.85, reviewNeeded: false, normalisationReason: "Emulsion normalised from spray coat context" };
  }

  // 5. Bitumen (generic — no emulsion).
  if (/bitumen/i.test(raw)) {
    return { originalNormMaterialName: raw, displayMaterialName: "Bitumen VG-30", materialGroup: "Bitumen VG-30", suggestedMaterialMasterName: "Bitumen VG-30", confidence: 0.80, reviewNeeded: false, normalisationReason: "Bitumen normalised to default project grade VG-30" };
  }

  // 6. Steel / reinforcement — must be before aggregate (avoids "mm" catch on bar diameters).
  if (/hysd|tmt|reinforcement|rebar|steel/i.test(raw)) {
    return { originalNormMaterialName: raw, displayMaterialName: "TMT / Reinforcement Steel", materialGroup: "TMT / Reinforcement Steel", suggestedMaterialMasterName: "TMT / Reinforcement Steel", confidence: 0.85, reviewNeeded: false, normalisationReason: "Steel/reinforcement normalisation" };
  }

  // 7. Common materials.
  if (/cement/i.test(raw))   return { originalNormMaterialName: raw, displayMaterialName: "Cement",  materialGroup: "Cement",  suggestedMaterialMasterName: "Cement",  confidence: 0.90, reviewNeeded: false, normalisationReason: "Common material normalisation" };
  if (/\bsand\b/i.test(raw)) return { originalNormMaterialName: raw, displayMaterialName: "Sand",    materialGroup: "Sand",    suggestedMaterialMasterName: "Sand",    confidence: 0.90, reviewNeeded: false, normalisationReason: "Common material normalisation" };
  if (/\bwater\b/i.test(raw)) return { originalNormMaterialName: raw, displayMaterialName: "Water",  materialGroup: "Water",   suggestedMaterialMasterName: "Water",   confidence: 0.95, reviewNeeded: false, normalisationReason: "Common material normalisation" };

  // 8. Aggregate gradation/range mapping — SDB technical names only.
  if (/aggregate|stone|chips|mm|micron|dust|filler/i.test(raw)) {
    let label: string | null = null;
    // Check from filler/dust up through largest aggregates first so composite-size
    // descriptions (e.g. "25mm and 12.5mm") hit the correct larger bucket before the
    // generic smaller-size patterns can fire.
    if (/75\s*micron|filler/.test(s))                                                                    label = "Filler";
    else if (/below\s*2\.?36|2\.?36.*below|0\.075|dust|stone\s*dust|crusher\s*dust/.test(s))            label = "Stone Dust";
    else if (/4\.?75.*0\.?075|2\.?36.*0\.?075|below\s*4\.?75|4\.?75\s*mm\s*and\s*below/.test(s))       label = "Stone Dust";
    else if (/63.*45|60\s*mm|65\s*mm/.test(s))                                                          label = "60mm Aggregate";
    else if (/53.*22\.?4|45.*22\.?4|37\.?5.*25|40\s*mm|25\s*mm.*12\.?5\s*mm/.test(s))                  label = "40mm Aggregate";
    else if (/26\.?5.*19|25.*19|20\s*mm/.test(s))                                                       label = "20mm Aggregate";
    else if (/13\s*mm/.test(s))                                                                          label = "13mm Aggregate";
    else if (/19.*9\.?5|22\.?4.*11\.?2|25.*10|10\s*mm|12\s*mm|12\.?5\s*mm/.test(s))                    label = "10mm Aggregate";
    else if (/13\.?2.*5\.?6|9\.?5.*2\.?36|10.*5|6\s*mm/.test(s))                                       label = "6mm Aggregate";

    if (label) {
      return { originalNormMaterialName: raw, displayMaterialName: label, materialGroup: label, suggestedMaterialMasterName: label, confidence: 0.75, reviewNeeded: false, normalisationReason: `SDB gradation "${raw}" normalised to market name "${label}"` };
    }
  }

  // 9. Fallback — keep original but flag for review.
  return { originalNormMaterialName: raw, displayMaterialName: raw, materialGroup: raw, suggestedMaterialMasterName: raw, confidence: 0.40, reviewNeeded: true, normalisationReason: "No confident normalisation rule matched" };
}

/**
 * IRC-standard proportions (%) for common bituminous mixes, used as a
 * deterministic fallback when no mix template is configured for a project.
 * Values are approximate guidance figures from MoRTH / IRC SP-11 specifications.
 * bitumenPct + sum(aggregates.pct) = 100
 */
export const BITUMINOUS_IRC_DEFAULTS: Record<string, {
  bitumenPct: number;
  /** IRC-specified binder grade for this mix type when no template is linked.
   *  Omit for mixes (BC/DBM/etc.) whose grade always comes from the project template.
   *  MA requires VG-40 hard bitumen per IRC:SP:93. */
  grade?: string;
  aggregates: Array<{ name: string; pct: number }>;
}> = {
  BC: {
    bitumenPct: 5.5,
    aggregates: [
      { name: "20mm Aggregate", pct: 32.0 },
      { name: "10mm Aggregate", pct: 25.0 },
      { name: "Stone Dust",     pct: 35.0 },
      { name: "Filler (Lime)",  pct: 2.5  },
    ],
  },
  SDBC: {
    bitumenPct: 5.0,
    aggregates: [
      { name: "13mm Aggregate", pct: 37.0 },
      { name: "Stone Dust",     pct: 58.0 },
    ],
  },
  DBM: {
    bitumenPct: 4.5,
    aggregates: [
      { name: "40mm Aggregate", pct: 28.0 },
      { name: "20mm Aggregate", pct: 27.0 },
      { name: "10mm Aggregate", pct: 30.0 },
      { name: "Stone Dust",     pct: 10.5 },
    ],
  },
  BM: {
    bitumenPct: 3.5,
    aggregates: [
      { name: "40mm Aggregate", pct: 38.0 },
      { name: "20mm Aggregate", pct: 30.0 },
      { name: "10mm Aggregate", pct: 22.0 },
      { name: "Stone Dust",     pct: 6.5  },
    ],
  },
  MA: {
    bitumenPct: 8.5,
    grade: "VG-40",   // Mastic Asphalt requires hard bitumen VG-40 per IRC:SP:93
    aggregates: [
      { name: "10mm Aggregate", pct: 28.0 },
      { name: "Stone Dust",     pct: 50.0 },
      { name: "Filler (Lime)",  pct: 13.5 },
    ],
  },
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
    ldoNorm?: number | null;
    binderGrade?: string | null;
    densityTPerCum?: number | null;
    components: Array<{ materialName: string; percent: number | null }>;
  } | null,
  concreteDesign?: ConcreteMixDesignInput | null,
  opts?: { descBinderGrade?: string | null },
): DerivedMaterialRow[] {
  if (layerConfig.layerType === "earthwork") {
    // Earthwork soil demand is never a procurement/mapping problem — it is resolved
    // through execution arrangements (borrow, outsourced, or cut-to-fill reuse).
    return [{ materialName: "Soil / Earth", uom: "CUM", qtyPerBoqUnit: 1.0, isAuto: true, isEarthworkBulkRequirement: true }];
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
    const granNorm = normaliseMixType(layerConfig.mixType ?? "");
    if (layerConfig.granularSource === "plant") {
      // Plant-processed: expand into mix fractions if a template is linked; else generic label.
      if (mixTemplate?.components?.length) {
        return mixTemplate.components
          .filter((c) => (c.percent ?? 0) > 0)
          .map((c) => ({ materialName: c.materialName, uom: "MT", qtyPerBoqUnit: (c.percent ?? 0) / 100, isAuto: true as const }));
      }
      const plantLabel = granNorm === "GSB" ? "GSB (Processed)" : granNorm === "WBM" ? "WBM (Processed)" : "WMM (Processed)";
      return [{ materialName: plantLabel, uom: "MT", qtyPerBoqUnit: 1.0, isAuto: true }];
    }
    // Direct supply (quarry/crusher): one practical procurement line — no grading fractions.
    const directLabel =
      granNorm === "GSB" ? "GSB Material" :
      granNorm === "WMM" ? "WMM Material" :
      granNorm === "WBM" ? "WBM Material" :
      "Granular Material";
    return [{ materialName: directLabel, uom: "CUM", qtyPerBoqUnit: 1.0, isAuto: true }];
  }

  if (layerConfig.layerType === "concrete") {
    // Concrete materials come ONLY from the RMC module mix design (no guessing).
    if (!concreteDesign) return [];
    const rows: DerivedMaterialRow[] = [];
    const cp = concreteDesign.componentProportions;
    const cementKg = (cp?.cement ?? concreteDesign.cementContent ?? 0); // kg/m³
    if (cementKg > 0) {
      rows.push({ materialName: "Cement", uom: "MT", qtyPerBoqUnit: cementKg / 1000, isAuto: true, applicationNote: `${concreteDesign.grade} @ ${cementKg} kg/m³` });
      const dosage = concreteDesign.admixtureDosage ?? 0;
      if (dosage > 0) {
        rows.push({
          materialName: concreteDesign.admixtureName ? `Admixture (${concreteDesign.admixtureName})` : "Admixture",
          uom: "kg",
          qtyPerBoqUnit: (cementKg * dosage) / 100,
          isAuto: true,
        });
      }
    }
    const sandKg = cp?.fineAgg ?? 0;
    if (sandKg > 0) rows.push({ materialName: "Sand", uom: "CUM", qtyPerBoqUnit: sandKg / (SAND_BULK_DENSITY_T_PER_CUM * 1000), isAuto: true });
    const agg20 = cp?.coarseAgg20 ?? 0;
    if (agg20 > 0) rows.push({ materialName: "20mm Aggregate", uom: "CUM", qtyPerBoqUnit: agg20 / (COARSE_AGG_BULK_DENSITY_T_PER_CUM * 1000), isAuto: true });
    const agg10 = cp?.coarseAgg10 ?? 0;
    if (agg10 > 0) rows.push({ materialName: "10mm Aggregate", uom: "CUM", qtyPerBoqUnit: agg10 / (COARSE_AGG_BULK_DENSITY_T_PER_CUM * 1000), isAuto: true });
    return rows;
  }

  if (layerConfig.layerType === "bituminous") {
    // Density priority: template → saved layerConfig → IRC mix-type default → absolute fallback
    const IRC_DENSITY: Record<string, number> = { BC: 2.40, SDBC: 2.40, DBM: 2.40, BM: 2.35 };
    const mixKeyDens = normaliseMixType(layerConfig.mixType ?? "");
    const density = mixTemplate?.densityTPerCum
      ?? layerConfig.densityTPerCum
      ?? IRC_DENSITY[mixKeyDens]
      ?? 2.35;
    const thickness = layerConfig.thicknessMm ?? 0;

    // MT of mix per 1 BOQ unit — depends on how the BOQ measures the item:
    //   CUM → 1 CUM = density MT (thickness irrelevant)
    //   MT  → 1
    //   SQM → (thickness/1000) × density  (needs thickness)
    const u = String(_boqUnit || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let mtPerUnit: number;
    if (/^(CUM|CUB|M3|CU|CUBICM)$/.test(u)) {
      mtPerUnit = density;
    } else if (/^(MT|TON|T|TONNE|TONNES|TONS)$/.test(u)) {
      mtPerUnit = 1;
    } else {
      if (thickness <= 0) return [];
      mtPerUnit = (thickness / 1000) * density;
    }

    const isBinderName = (n: string) => /bitumen|\bvg[\s-]?\d+\b|binder|emulsion/i.test(n || "");

    // Source of the job mix: PREFER a complete approved Masters/JMF template. Only when
    // none resolves (or it is incomplete) fall back to the built-in IRC default for THIS
    // exact mix type, so BC never borrows DBM's grade/aggregates and vice-versa.
    const tmplAggs = (mixTemplate?.components ?? []).filter(c => !isBinderName(c.materialName) && (c.percent ?? 0) > 0);
    const tmplBinderComp = (mixTemplate?.components ?? []).find(c => isBinderName(c.materialName) && (c.percent ?? 0) > 0);
    const tmplHasBinder = (mixTemplate?.bitumenPercent ?? 0) > 0 || !!tmplBinderComp || !!(mixTemplate?.binderGrade && mixTemplate.binderGrade.trim());
    const templateUsable = !!mixTemplate && tmplAggs.length > 0 && tmplHasBinder;

    const mixKey = normaliseMixType(layerConfig.mixType ?? "");
    const ircDefault = BITUMINOUS_IRC_DEFAULTS[mixKey];
    if (!templateUsable && !ircDefault) return [];   // unknown mix type AND no usable template

    const rows: DerivedMaterialRow[] = [];

    if (templateUsable) {
      // ── Approved Masters template (JMF) ───────────────────────────────────────
      const bitPct = tmplBinderComp?.percent ?? mixTemplate!.bitumenPercent ?? 0;
      // Description-explicit grade (e.g. "VG-30" in item text) wins over the template
      // grade so one template can serve both VG-30 and VG-40 variants of the same mix.
      const grade = (opts?.descBinderGrade ?? mixTemplate!.binderGrade ?? "").trim();
      const binderName = grade
        ? (/bitumen|emulsion/i.test(grade) ? grade : `Bitumen ${grade}`)
        : (tmplBinderComp?.materialName?.trim() || "Bitumen VG-30");
      if (bitPct > 0) rows.push({ materialName: binderName, uom: "MT", qtyPerBoqUnit: (bitPct / 100) * mtPerUnit, isAuto: true });
      for (const c of tmplAggs) {
        rows.push({ materialName: c.materialName, uom: "MT", qtyPerBoqUnit: ((c.percent ?? 0) / 100) * mtPerUnit, isAuto: true });
      }
    } else {
      // ── IRC standard fallback for THIS exact mix type (keeps template grade if given) ──
      // Description-explicit grade wins; then template grade; then IRC mix-type grade
      // (e.g. MA → VG-40 per IRC:SP:93); then generic VG-30.
      const grade = (opts?.descBinderGrade ?? mixTemplate?.binderGrade ?? ircDefault.grade ?? "VG-30").trim();
      const binderName = /bitumen|emulsion/i.test(grade) ? grade : `Bitumen ${grade}`;
      rows.push({ materialName: binderName, uom: "MT", qtyPerBoqUnit: (ircDefault.bitumenPct / 100) * mtPerUnit, isAuto: true, applicationNote: `IRC default ${mixKey} JMF (no complete template)` });
      for (const a of ircDefault.aggregates) {
        rows.push({ materialName: a.name, uom: "MT", qtyPerBoqUnit: (a.pct / 100) * mtPerUnit, isAuto: true });
      }
    }

    // LDO / Process Fuel — HMP fuel demand (liters per MT of mix × MT per unit)
    const ldoNorm = mixTemplate?.ldoNorm ?? 6; // liters/MT default = 6
    if (ldoNorm > 0) {
      rows.push({
        materialName: "LDO / Process Fuel",
        uom: "L",
        qtyPerBoqUnit: ldoNorm * mtPerUnit,
        isAuto: true,
        applicationNote: `HMP plant fuel at ${ldoNorm} L/MT`,
      });
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
 * Convert a fractional month index (1-based, from dateToMonthIndex) to an
 * integer programme-month bucket using floor-based containment.
 *
 * This is the SOLE authoritative formula for horizon bucket resolution.
 * Never call Math.ceil on a rawIdx — ceil rounds a mid-month cutoff into
 * the next bucket, overstating demand.
 *
 * Contract:
 *   rawIdx < 1                  → 0   (before programme start; zero demand)
 *   rawIdx ∈ [N, N+1) for N≥1  → N   (cutoff inside programme month N)
 *   rawIdx > maxProgrammeMonth  → maxProgrammeMonth (past programme end; full demand)
 *
 * Boundary rule: a date exactly at the start of month N (rawIdx == N) maps
 * to N (inclusive), meaning month N demand IS included for that cutoff.
 */
export function dateToMonthBucket(rawIdx: number, maxProgrammeMonth: number): number {
  if (rawIdx < 1) return 0;
  return Math.min(maxProgrammeMonth, Math.floor(rawIdx));
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

// ─── Time-phased shortage-check (Task #1240 — additive, read-only) ───────────
// Pure, side-effect-free computation extracted from
// GET /api/boq/projects/:id/shortage-check so the month-by-month running
// balance / suggestion logic can be unit-tested independently of the DB.

export interface ShortageMaterialDemand {
  materialName: string;
  uom: string;
  totalQty: number;
  /** month index (1-based) -> demand qty for that month */
  monthlyQty: Record<number, number>;
  /** Canonical plant_materials.id if resolved; null means unresolved (block requirement creation) */
  materialId?: number | null;
  /** Primary BOQ item contributing to this demand row */
  sourceBoqItemId?: number | null;
}

export interface ShortageMonthlyBreakdown {
  month: number;
  demand: number;
  shortfall: number;
  isCurrentOrPast: boolean;
}

export type ShortageSuggestion =
  | "adequate"
  | "adequate_selected_horizon"
  | "monitor"
  | "raise_irn"
  | "raise_pi"
  | "raise_both"
  | "review_hlc_stock"
  | "review_internal_issue"
  | "resolve_mapping";

/** Instruction 023/024: summary of an earthwork arrangement, attached to ShortageRowResult. */
export interface EarthworkArrangementSummary {
  id: number;
  arrangementType: string;
  /** Full status set: draft|submitted|approved|mobilisation_pending|in_progress|on_hold|completed|returned|rejected|cancelled */
  status: string;
  agencyName: string | null;
  allocatedQty: number;
  uom: string;
  agreedRate: number | null;
  /** Computed: allocatedQty × agreedRate — planning value only, not an accounting liability. */
  estimatedValue: number | null;
  plannedDailyOutput: number | null;
  mobilisationDate: string | null;
  plannedStartDate: string | null;
  actualStartDate: string | null;
  targetCompletionDate: string | null;
  reachLabel: string | null;
  components: Record<string, string> | null;
  /** Progress from linked DPR entries (submitted/approved DPRs only). */
  completedQty: number;
  recentDailyOutput: number;
  lastEntryDate: string | null;
  daysSinceLastEntry: number | null;
  /** boqItemAllocations: [{boqItemId, qty}] for multi-BOQ arrangements */
  boqItemAllocations: Array<{ boqItemId: number; qty: number }> | null;
  /** Single-source arrangement's BOQ item (null for multi-source). */
  boqItemId?: number | null;
  /** Cut-to-fill: linked roadway-excavation BOQ item supplying this fill (optional). */
  sourceExcavationBoqItemId?: number | null;
  /** Cut-to-fill: current BOQ quantity of the linked excavation item (injected by route). */
  cutAvailableQty?: number | null;
}

// ─── Cut-to-fill sourcing badge (Task: internally sourced earthwork) ──────────

export type EarthworkSourcingBadge =
  | "internally_sourced"   // fully covered, all coverage from reused_excavated arrangements
  | "fully_arranged"       // fully covered, at least one non-reused arrangement
  | "partially_arranged"   // some coverage but not full
  | "none";                // no active coverage

const SOURCING_TOL = 0.001;

/**
 * Derive the sourcing badge for an earthwork Work Demand row from its
 * arrangements. Cancelled and rejected arrangements never count as coverage.
 * "internally_sourced" means the entire demand is satisfied by reuse of the
 * project's own cut material (cut-to-fill) — nothing to procure or outsource.
 */
export function deriveEarthworkSourcingBadge(
  arrangements: Pick<EarthworkArrangementSummary, "arrangementType" | "status" | "allocatedQty">[] | undefined,
  totalDemand: number,
): EarthworkSourcingBadge {
  const active = (arrangements ?? []).filter(a => a.status !== "cancelled" && a.status !== "rejected");
  const allocatedTotal = active.reduce((s, a) => s + (Number(a.allocatedQty) || 0), 0);
  if (active.length === 0 || allocatedTotal <= SOURCING_TOL) return "none";
  if (allocatedTotal < totalDemand - SOURCING_TOL) return "partially_arranged";
  return active.every(a => a.arrangementType === "reused_excavated")
    ? "internally_sourced"
    : "fully_arranged";
}

/**
 * Cut-to-fill balance check: compare available cut quantity from the linked
 * excavation BOQ item against the fill quantity allocated from it.
 */
export function checkCutFillBalance(
  cutAvailableQty: number | null | undefined,
  fillRequiredQty: number,
): { sufficient: boolean; shortfall: number } | null {
  if (cutAvailableQty == null || !isFinite(cutAvailableQty)) return null;
  const shortfall = Math.max(0, fillRequiredQty - cutAvailableQty);
  return { sufficient: shortfall <= SOURCING_TOL, shortfall: Math.round(shortfall * 1000) / 1000 };
}

/**
 * Contract-mandated cut-to-fill detection: descriptions that tie earthwork to
 * roadway excavation (e.g. "Forming embankment with excavated earth obtained
 * from roadway excavation" or "Earthwork excavation in road way soils") mean
 * the soil is internally sourced by contract — never borrowed or procured.
 * Borrow-based items ("borrowed useful earth", "borrow pits") are excluded.
 */
export function isContractCutToFillDescription(description: string | null | undefined): boolean {
  const d = String(description ?? "").toLowerCase().replace(/\s+/g, " ");
  if (!d) return false;
  if (/borrow/.test(d)) return false;
  // "roadway/road way" within short range of "excavat" (either order)
  return (
    /(road\s*way|roadway)[^.]{0,40}excavat/.test(d) ||
    /excavat[^.]{0,40}(road\s*way|roadway)/.test(d) ||
    /reused\s+excavat/.test(d)
  );
}

/**
 * Suggest the source cut (excavation) BOQ item for a contract cut-to-fill row.
 * Picks roadway-excavation candidates, excluding fill/embankment items that merely
 * mention roadway excavation as their material source. Returns the candidate with
 * the largest available quantity, or null when none qualifies.
 */
export function suggestCutToFillSourceItem<T extends { id: number; description?: string | null; currentQty?: number | null }>(
  candidates: T[] | null | undefined,
): T | null {
  const cuts = (candidates ?? []).filter(c => {
    const d = String(c.description ?? "").toLowerCase();
    if (!/excavat/.test(d)) return false;
    if (/embankment|forming|back\s*filling|backfilling|foundation|trench(?!\s*cutting)|structure/.test(d)) return false;
    return /(road\s*way|roadway)/.test(d);
  });
  if (cuts.length === 0) return null;
  return cuts.reduce((best, c) => (Number(c.currentQty ?? 0) > Number(best.currentQty ?? 0) ? c : best), cuts[0]);
}

/** Instruction 024: baseline for an earthwork BOQ item. */
export interface EarthworkBaselineSummary {
  boqItemId: number;
  originalStart: string | null;
  originalFinish: string | null;
  originalQty: number | null;
  capturedAt: string;
}

/** Instruction 024: current working forecast for an earthwork BOQ item. */
export interface EarthworkForecastSummary {
  id: number;
  versionNumber: number;
  forecastFinishDate: string | null;
  balanceQty: number | null;
  plannedDailyOutput: number | null;
  expectedWorkingDays: number | null;
  delayReasonCode: string | null;
  status: string;
  /** Three-quantity split (§25). */
  overdueBacklog: number;
  executableHorizon: number;
  futureBalance: number;
  reforecastRequired: boolean;
  reforecastReasons: string[];
}

/** Instruction 020 §3 / 023/024: authoritative server-side procurement status. */
export type ProcurementStatus =
  | "mapping_required"
  | "uom_resolution_required"
  | "multiple_matches"
  | "earthwork_arrangement_required"   // 023: recognised earthwork with no Plant Material mapping
  | "earthwork_classification_required" // 024: ambiguous bulk material (gravel/moorum) needing user classification
  | "future_not_due"
  | "covered_by_stock"
  | "covered_by_incoming"
  | "partially_covered"
  | "action_required";

/** Instruction 020 §1: precise material resolution diagnostic reason. */
export type ResolutionReason =
  | "saved_mapping"
  | "alias_resolved"
  | "inactive_material"
  | "uom_incompatible"
  | "ambiguous"
  | "no_match";

export interface ShortageRowResult {
  materialName: string;
  uom: string;
  /** Total demand across the full Work Programme (all months). */
  totalDemand: number;
  /** Cumulative demand up to and including the selected horizon month. */
  demandUpToSelectedDate: number;
  /** max(0, totalDemand − demandUpToSelectedDate) — future pipeline after horizon. */
  futureRequirement: number;
  monthlyDemand: Record<number, number>;
  /** @deprecated use hlcRecordedStock */
  currentStock: number;
  /** Stock held under HLC/company custody (partyId IS NULL in stock_balances). */
  hlcRecordedStock: number;
  /** Stock with external parties — informational only, not auto-deducted. */
  stockWithOtherParties: number;
  stockMatched: boolean;
  /** @deprecated use confirmedIncomingPurchase */
  pendingProcurement: number;
  /** Only real operational purchase commitments (ordered/purchased-awaiting-receipt). */
  confirmedIncomingPurchase: number;
  /** Stores-committed IRN balance (stores_verified stage only). */
  confirmedInternalIncoming: number;
  /** hlcRecordedStock + confirmedIncomingPurchase + confirmedInternalIncoming */
  usableCommittedCoverage: number;
  /** max(0, demandUpToSelectedDate − usableCommittedCoverage) */
  actionableShortfall: number;
  shortfall: number;
  nearTermShortfall: number;
  monthlyBreakdown: ShortageMonthlyBreakdown[];
  suggestion: ShortageSuggestion;
  /** Canonical plant_materials.id; null = unresolved in master */
  materialId: number | null;
  /** Primary BOQ item driving this demand */
  sourceBoqItemId: number | null;
  /** @deprecated use stockWithOtherParties */
  stockElsewhere: number;
  /** Whether the BOQ item has at least one Work Programme bar. */
  isProgrammed: boolean;
  /** True when no canonical materialId was resolved from the mapping table or master. */
  materialMappingUnresolved: boolean;
  /** ISO date (YYYY-MM-DD) — first programme month where this material has a shortfall. */
  requiredByDate: string | null;
  /** Three-state programming status derived from all contributing BOQ items. */
  programmingStatus: "fully_programmed" | "partly_programmed" | "not_programmed";
  /** Demand attributable to programmed BOQ contributions only. */
  programmedTotalDemand: number;
  /** Demand attributable to BOQ contributions without programme bars. */
  unprogrammedDemand: number;
  /** max(0, programmedTotalDemand − demandUpToSelectedDate) */
  futureProgrammedRequirement: number;
  /** Distinct source BOQ item IDs across all contributions (multi-source awareness). */
  sourceBoqItemIds: number[];
  /** Instruction 020 §3: authoritative procurement status derived server-side. */
  procurementStatus: ProcurementStatus;
  /** Instruction 020 §1: precise resolution diagnostic reason. */
  resolutionReason: ResolutionReason | null;
  /** Instruction 023: true for earthwork/bulk-fill rows that bypass Plant Material mapping. */
  isEarthworkBulkRequirement: boolean;
  /** Instruction 024: true for gravel/moorum rows awaiting user classification. */
  requiresClassification: boolean;
  /** Instruction 023: arrangements saved for this earthwork row (injected by route). */
  earthworkArrangements?: EarthworkArrangementSummary[];
  /** Instruction 023: source BOQ item ID for single-source earthwork rows. */
  earthworkBoqItemId?: number | null;
}

/**
 * Extended options for the v2 procurement intelligence path (Instruction 017).
 * All fields are optional so existing callers without opts still work.
 */
export interface ShortageRowOpts {
  /** Programme month index (1-based) up to which demandUpToSelectedDate is computed. */
  horizonMonthIndex?: number;
  /** Project start date for requiredByDate derivation — no longer bolt-on in route. */
  projectStartDate?: string | null;
  /** Stock held by HLC/company (partyId IS NULL) — replaces positional currentStock. */
  hlcRecordedStock?: number;
  /** Stock with external parties — informational, never auto-deducted from shortfall. */
  stockWithOtherParties?: number;
  /** Confirmed purchase incoming (ORDERED/PURCHASED-awaiting-receipt items only). */
  confirmedIncomingPurchase?: number;
  /** Confirmed internal incoming (stores_verified IRN balance only). */
  confirmedInternalIncoming?: number;
  /** Whether the BOQ item has at least one Work Programme bar. */
  isProgrammed?: boolean;
  /** True when no canonical materialId was found for this BOM label. */
  materialMappingUnresolved?: boolean;
  /** Three-state programming status from calculateBomDemand. */
  programmingStatus?: "fully_programmed" | "partly_programmed" | "not_programmed";
  /** Demand attributable to programmed BOQ contributions only. */
  programmedTotalDemand?: number;
  /** Demand attributable to BOQ contributions without programme bars. */
  unprogrammedDemand?: number;
  /** Distinct source BOQ item IDs for multi-source traceability. */
  sourceBoqItemIds?: number[];
  /** Instruction 020 §1: precise material resolution reason for procurement status derivation. */
  resolutionReason?: ResolutionReason | null;
  /** Instruction 023: true for earthwork/bulk-fill rows — fires earthwork_arrangement_required status instead of mapping_required. */
  isEarthworkBulkRequirement?: boolean;
  /** Instruction 024: true for gravel/moorum rows pending user classification. */
  requiresClassification?: boolean;
  /** Instruction 023: boqItemId of the earthwork BOQ item, for arrangement lookup. */
  earthworkBoqItemId?: number | null;
  /** Instruction 023: summary of active arrangements already saved for this item (injected by route). */
  earthworkArrangements?: EarthworkArrangementSummary[];
}

/**
 * Computes a single material's time-phased shortage row.
 *
 * Backward-compatible: all positional params are unchanged; existing test
 * callers that omit `opts` continue to work and get the v1 suggestion logic.
 *
 * New callers (Instruction 017 route) pass `opts` to activate v2 behaviour:
 *   – horizon-bounded demandUpToSelectedDate
 *   – renamed/split stock and incoming fields
 *   – new recommendation taxonomy (resolve_mapping, adequate_selected_horizon,
 *     review_hlc_stock, review_internal_issue)
 *   – requiredByDate derived here — no route-level mutation needed
 *
 * Never mutates any input.
 */
export function computeShortageRow(
  matRow: ShortageMaterialDemand,
  currentStock: number,
  stockMatched: boolean,
  pendingProcurement: number,
  currentMonth: number,
  stockElsewhere: number = 0,
  opts?: ShortageRowOpts,
): ShortageRowResult {
  const months = Object.keys(matRow.monthlyQty).map(Number).sort((a, b) => a - b);
  let runningAvailable = currentStock + pendingProcurement;
  const monthlyBreakdown: ShortageMonthlyBreakdown[] = [];
  for (const m of months) {
    const monthDemand = matRow.monthlyQty[m] ?? 0;
    const monthShortfall = Math.max(0, monthDemand - Math.max(0, runningAvailable));
    runningAvailable -= monthDemand;
    monthlyBreakdown.push({ month: m, demand: monthDemand, shortfall: monthShortfall, isCurrentOrPast: m <= currentMonth });
  }

  const netAvailable = currentStock + pendingProcurement;
  const shortfall = Math.max(0, matRow.totalQty - netAvailable);
  const nearTermShortfall = monthlyBreakdown
    .filter((mb) => mb.isCurrentOrPast)
    .reduce((sum, mb) => sum + mb.shortfall, 0);

  // ── v2 extended fields (populated when opts is supplied) ─────────────────
  const hlcRecordedStock = opts?.hlcRecordedStock ?? currentStock;
  const stockWithOtherParties = opts?.stockWithOtherParties ?? stockElsewhere;
  const confirmedIncomingPurchase = opts?.confirmedIncomingPurchase ?? pendingProcurement;
  const confirmedInternalIncoming = opts?.confirmedInternalIncoming ?? 0;
  const isProgrammed = opts?.isProgrammed ?? true;
  const materialMappingUnresolved = opts?.materialMappingUnresolved ?? (matRow.materialId == null);
  const programmingStatus = opts?.programmingStatus ?? (isProgrammed ? "fully_programmed" : "not_programmed");
  const programmedTotalDemand = opts?.programmedTotalDemand ?? (isProgrammed ? matRow.totalQty : 0);
  const unprogrammedDemand = opts?.unprogrammedDemand ?? (isProgrammed ? 0 : matRow.totalQty);
  const sourceBoqItemIds = opts?.sourceBoqItemIds ?? [];

  // Demand up to the horizon month (cumulative sum of months ≤ horizonIdx)
  const horizonIdx = opts?.horizonMonthIndex ?? (months.length ? Math.max(...months) : currentMonth);
  const demandUpToSelectedDate = months
    .filter(m => m <= horizonIdx)
    .reduce((sum, m) => sum + (matRow.monthlyQty[m] ?? 0), 0);
  const futureRequirement = Math.max(0, matRow.totalQty - demandUpToSelectedDate);
  const futureProgrammedRequirement = Math.max(0, programmedTotalDemand - demandUpToSelectedDate);

  const usableCommittedCoverage = hlcRecordedStock + confirmedIncomingPurchase + confirmedInternalIncoming;
  const actionableShortfall = Math.max(0, demandUpToSelectedDate - usableCommittedCoverage);

  // requiredByDate — derived here so no route-level mutation is needed (Instruction 017 §16)
  let requiredByDate: string | null = null;
  if (opts?.projectStartDate) {
    const firstShortfallMonth = monthlyBreakdown.find(mb => mb.shortfall > 0)?.month ?? null;
    if (firstShortfallMonth) {
      requiredByDate = monthIndexToDate(firstShortfallMonth, opts.projectStartDate)
        .toISOString().split("T")[0];
    }
  }

  // ── Suggestion logic (v1/v2 — kept for backward compat) ──────────────────
  let suggestion: ShortageSuggestion;
  if (opts) {
    // v2 logic — Instruction 017 §11
    if (materialMappingUnresolved) {
      suggestion = "resolve_mapping";
    } else if (actionableShortfall <= 0) {
      suggestion = "adequate_selected_horizon";
    } else if (hlcRecordedStock <= 0) {
      // No HLC stock at all — must purchase
      suggestion = "raise_pi";
    } else if (hlcRecordedStock >= demandUpToSelectedDate) {
      // HLC stock alone covers horizon demand — review whether it can be issued
      suggestion = "review_internal_issue";
    } else {
      // Some HLC stock exists but not enough — review stock + purchase the balance
      suggestion = "review_hlc_stock";
    }
  } else {
    // v1 backward-compatible logic — existing tests and legacy callers
    if (shortfall <= 0) {
      suggestion = "adequate";
    } else if (nearTermShortfall <= 0 && shortfall <= matRow.totalQty * 0.1) {
      suggestion = "monitor";
    } else if (stockElsewhere > 0) {
      const coverableByIrn = Math.min(stockElsewhere, shortfall);
      const uncoveredByIrn = shortfall - coverableByIrn;
      suggestion = uncoveredByIrn > 0.001 ? "raise_both" : "raise_irn";
    } else {
      suggestion = "raise_pi";
    }
  }

  // ── Instruction 020 §3-4 / 023/024: authoritative procurement status ────────
  // Strict precedence: resolution issues → future timing → coverage level → action needed.
  // UI uses this field for rendering; suggestion is kept only for backward compatibility.
  const resolutionReason: ResolutionReason | null = opts?.resolutionReason ?? null;
  const isEarthworkBulkRequirement = opts?.isEarthworkBulkRequirement ?? false;
  const requiresClassification = opts?.requiresClassification ?? false;
  const PROC_TOL = 0.001;
  let procurementStatus: ProcurementStatus;
  if (opts) {
    if (requiresClassification) {
      // 024: gravel/moorum items with no saved classification — user must classify before routing.
      procurementStatus = "earthwork_classification_required";
    } else if (isEarthworkBulkRequirement && materialMappingUnresolved) {
      // 023: earthwork bulk rows never go through Plant Material mapping.
      // Show execution-arrangement flow regardless of resolution reason.
      procurementStatus = "earthwork_arrangement_required";
    } else if (resolutionReason === "inactive_material" || resolutionReason === "no_match") {
      procurementStatus = "mapping_required";
    } else if (resolutionReason === "uom_incompatible") {
      procurementStatus = "uom_resolution_required";
    } else if (resolutionReason === "ambiguous") {
      procurementStatus = "multiple_matches";
    } else if (materialMappingUnresolved) {
      procurementStatus = "mapping_required";
    } else if (demandUpToSelectedDate <= PROC_TOL && futureRequirement > PROC_TOL) {
      // §4D: no horizon demand but future demand exists — not yet due
      procurementStatus = "future_not_due";
    } else if (demandUpToSelectedDate <= PROC_TOL) {
      // No demand in horizon or future
      procurementStatus = "covered_by_stock";
    } else if (hlcRecordedStock >= demandUpToSelectedDate - PROC_TOL) {
      // §4E: HLC stock alone covers horizon demand
      procurementStatus = "covered_by_stock";
    } else if (usableCommittedCoverage >= demandUpToSelectedDate - PROC_TOL) {
      // §4F: HLC stock is insufficient alone but stock + incoming covers
      procurementStatus = "covered_by_incoming";
    } else if (usableCommittedCoverage > PROC_TOL) {
      // §4G: partial coverage — actionable balance still needed
      procurementStatus = "partially_covered";
    } else {
      // §4H: resolved material, positive demand, zero coverage
      procurementStatus = "action_required";
    }
  } else {
    // v1 backward-compat: derive from shortfall only
    procurementStatus = shortfall <= 0 ? "covered_by_stock" : "action_required";
  }

  return {
    materialName: matRow.materialName,
    uom: matRow.uom,
    totalDemand: matRow.totalQty,
    demandUpToSelectedDate,
    futureRequirement,
    monthlyDemand: matRow.monthlyQty,
    currentStock,
    hlcRecordedStock,
    stockWithOtherParties,
    stockMatched,
    pendingProcurement,
    confirmedIncomingPurchase,
    confirmedInternalIncoming,
    usableCommittedCoverage,
    actionableShortfall,
    shortfall,
    nearTermShortfall,
    monthlyBreakdown,
    suggestion,
    materialId: matRow.materialId ?? null,
    sourceBoqItemId: matRow.sourceBoqItemId ?? null,
    stockElsewhere,
    isProgrammed,
    materialMappingUnresolved,
    requiredByDate,
    programmingStatus,
    programmedTotalDemand,
    unprogrammedDemand,
    futureProgrammedRequirement,
    sourceBoqItemIds,
    procurementStatus,
    resolutionReason,
    isEarthworkBulkRequirement,
    requiresClassification,
    // 023: earthworkArrangements and earthworkBoqItemId are injected by the route
    // after calling this function — not populated here.
  };
}

// ─── Requirement Status ───────────────────────────────────────────────────────

export type RequirementStatus =
  | "raised"
  | "awaiting_review"
  | "partly_allocated"
  | "fully_allocated"
  | "internally_committed"
  | "procurement_in_progress"
  | "partly_fulfilled"
  | "fulfilled"
  | "deferred"
  | "cancelled"
  | "reconciliation_required";

export interface RequirementStatusInput {
  requiredQty: number;
  internallyAllocatedQty: number;
  internallyIssuedQty: number;
  procurementRequestedQty: number;
  orderedQty: number;
  receivedQty: number;
  status: string; // current persisted status (for cancelled/deferred overrides)
}

/**
 * Single authoritative function to derive requirement status from its
 * allocation and fulfilment quantities. Do not derive status independently in
 * multiple UI screens or route handlers.
 */
export function computeRequirementStatus(r: RequirementStatusInput): RequirementStatus {
  if (r.status === "cancelled") return "cancelled";
  if (r.status === "deferred") return "deferred";

  const totalFulfilled = (r.internallyIssuedQty ?? 0) + (r.receivedQty ?? 0);
  if (totalFulfilled >= r.requiredQty - 0.001) return "fulfilled";
  if (totalFulfilled > 0) return "partly_fulfilled";

  const totalAllocated = (r.internallyAllocatedQty ?? 0) + (r.procurementRequestedQty ?? 0);
  if (r.orderedQty > 0 && r.procurementRequestedQty > 0) return "procurement_in_progress";
  if (r.internallyAllocatedQty > 0 && r.procurementRequestedQty <= 0 && r.orderedQty <= 0) return "internally_committed";
  if (totalAllocated >= r.requiredQty - 0.001) return "fully_allocated";
  if (totalAllocated > 0) return "partly_allocated";
  return "raised";
}
