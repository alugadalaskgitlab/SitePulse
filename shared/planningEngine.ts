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
  originalNormMaterialName?: string;
  displayMaterialName?: string;
  suggestedMaterialMasterName?: string;
  materialGroup?: string;
  reviewNeeded?: boolean;
  normalisationReason?: string;
  breakdown: Array<{ itemDescription: string; fullDescription?: string; itemCode?: string | null; qtyPerUnit: number; workQty: number; lineQty: number; isAuto?: boolean }>;
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
  breakdown: Array<{ itemDescription: string; fullDescription?: string; itemCode?: string | null; hrsPerUnit: number; workQty: number; lineHours: number }>;
}

export interface BomLabourRow {
  designation: string;
  totalDays: number;
  monthlyDays: Record<number, number>;
  breakdown: Array<{ itemDescription: string; fullDescription?: string; itemCode?: string | null; daysPerUnit: number; workQty: number; lineDays: number }>;
}

export interface BomDemand {
  materials: BomMaterialRow[];
  equipment: BomEquipmentRow[];
  labour: BomLabourRow[];
}

export interface BomInputItem {
  id: number;
  description: string;
  itemCode?: string | null;
  itemName?: string | null;
  unit: string;
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

function isEarthworkBoqItem(item: BomInputItem): boolean {
  const desc = item.description.toLowerCase();
  const unit = normaliseUnit(item.unit);

  if (unit !== "CUM") return false;

  if (
    /foundation|footing|abutment|pier|wing\s*wall|return\s*wall|drain|culvert|pipe|trench|structure|back\s*filling|backfilling|behind\s*abutment|behind\s*wall|filter\s*media|stone\s*pitching|pcc|rcc|concrete|gsb|wmm|granular\s*sub[-\s]*base|wet\s*mix/i.test(desc)
  ) {
    return false;
  }

  return (
    /embankment|subgrade|earthen\s*shoulder|shoulder|median\s*filling|borrow\s*soil|selected\s*soil/i.test(desc)
  );
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

  if (/gsb material/i.test(raw)) return "GSB Material";
  if (/wmm material/i.test(raw)) return "WMM Material";

  // Emulsion naming must NEVER apply to a BC/DBM/SDBC/BM mix item that merely mentions
  // "after applying prime coat" / "over tack coat" — those keep their VG-grade binder.
  const descIsBitMix = /bituminous\s*concrete|\bbc\b|\bdbm\b|dense\s*bituminous|sdbc|bituminous\s*macadam|\bbm\b/i.test(desc);
  if (!descIsBitMix && (/emulsion/i.test(raw) || /prim(?:e|er)\s*coat|\bprimer\b|tack\s*coat/i.test(desc))) {
    if (/prim/i.test(desc)) return "Bitumen Emulsion SS-1";
    if (/tack/i.test(desc)) return "Bitumen Emulsion RS-1";
    return "Bitumen Emulsion";
  }

  if (/vg\s*-?\s*40|vg40/i.test(raw) || /vg\s*-?\s*40|vg40/i.test(desc)) return "Bitumen VG-40";
  if (/bitumen|vg\s*-?\s*30|vg30/i.test(raw) || /bitumen|vg\s*-?\s*30|vg30/i.test(desc)) return "Bitumen VG-30";

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
    });
    return rows;
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
        });
      }

      const row = matMap.get(key)!;
      row.materialName = preferDisplayName(row.materialName, finalName);
      row.totalQty += lineQty;
      row.uom = m.uom;
      if (m.isAuto) row.hasAutoSource = true;
      if (m.supplyType) {
        if (!row.supplyType || m.supplyType === "plant") row.supplyType = m.supplyType;
      }
      {
        // Merge only TRUE duplicates (same itemCode AND same description) so 6 identical
        // DBM sub-rows collapse to one contributor, while genuinely distinct lines that
        // share a parent itemCode (steel Foundation/Sub/Super) or repeat across bills
        // (GSB in Bill 3 vs Bill 10) still show separately.
        const bk = String((item.itemCode ?? "") + "|" + (item.description ?? ""));
        const exB = row.breakdown.find((b: any) => ((b.itemCode ?? b.fullDescription) || "") === bk);
        if (exB) { exB.lineQty += lineQty; exB.workQty += workQty; }
        else row.breakdown.push({
          itemDescription: item.itemName || item.description,
          fullDescription: item.description,
          itemCode: item.itemCode,
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

    // Equipment
    for (const e of item.equipment) {
      if (e.isClientSupplied) continue;
      // Manual / labour-based "crew" is labour, not plant — keep it out of the equipment BOM.
      if (/manual|labour[\s-]?based|labor[\s-]?based|by\s*hand|hand[\s-]?(packing|breaking|mixing)|coolie|mazdoor/i.test(e.equipmentName)) continue;
      const cnt = e.count ?? 1;
      const lineHours = e.qtyPerBoqUnit * workQty * cnt;
      const key = canonEquipmentKey(e.equipmentName);
      const display = equipmentBaseName(e.equipmentName);
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
        const exB = row.breakdown.find((b: any) => ((b.itemCode ?? b.fullDescription) || "") === bk);
        if (exB) { exB.lineHours += lineHours; exB.workQty += workQty; }
        else row.breakdown.push({ itemDescription: item.itemName || item.description, fullDescription: item.description, itemCode: item.itemCode, hrsPerUnit: e.qtyPerBoqUnit, workQty, lineHours });
      }
      for (const [month, mwq] of monthlyWork) {
        row.monthlyHours[month] = (row.monthlyHours[month] ?? 0) + e.qtyPerBoqUnit * mwq * cnt;
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
        const fuelPerBoqUnit = e.qtyPerBoqUnit * cnt * norm; // liters per BOQ unit
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
          itemDescription: `${display} — fuel`,
          fullDescription: `${item.description} (${display} @ ${norm} L/hr)`,
          itemCode: item.itemCode,
          qtyPerUnit: fuelPerBoqUnit,
          workQty,
          lineQty: fuelPerBoqUnit * workQty,
          isAuto: true,
        });
        for (const [month, mwq] of monthlyWork) {
          fuelRow.monthlyQty[month] = (fuelRow.monthlyQty[month] ?? 0) + fuelPerBoqUnit * mwq;
        }
      }
    }

    // Labour
    for (const l of item.labour) {
      if (l.isClientSupplied) continue;
      const lineDays = l.qtyPerBoqUnit * workQty;
      const designation = normaliseDesignation(l.designation);
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
        const exB = row.breakdown.find((b: any) => ((b.itemCode ?? b.fullDescription) || "") === bk);
        if (exB) { exB.lineDays += lineDays; exB.workQty += workQty; }
        else row.breakdown.push({ itemDescription: item.itemName || item.description, fullDescription: item.description, itemCode: item.itemCode, daysPerUnit: l.qtyPerBoqUnit, workQty, lineDays });
      }
      for (const [month, mwq] of monthlyWork) {
        row.monthlyDays[month] = (row.monthlyDays[month] ?? 0) + l.qtyPerBoqUnit * mwq;
      }
    }
  }

  // Apply contractor-friendly group sort order
  const materials = sortBomMaterials([...matMap.values()].filter(r => r.totalQty > 0));
  const equipment = [...eqMap.values()].filter(r => r.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours);
  const labour = [...labMap.values()].filter(r => r.totalDays > 0).sort((a, b) => b.totalDays - a.totalDays);

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
    components: Array<{ materialName: string; percent: number | null }>;
  } | null,
  concreteDesign?: ConcreteMixDesignInput | null,
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
    const density = layerConfig.densityTPerCum ?? 2.35;   // MT per CUM of compacted mix
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
      const grade = (mixTemplate!.binderGrade ?? "").trim();
      const binderName = grade
        ? (/bitumen|emulsion/i.test(grade) ? grade : `Bitumen ${grade}`)
        : (tmplBinderComp?.materialName?.trim() || "Bitumen VG-30");
      if (bitPct > 0) rows.push({ materialName: binderName, uom: "MT", qtyPerBoqUnit: (bitPct / 100) * mtPerUnit, isAuto: true });
      for (const c of tmplAggs) {
        rows.push({ materialName: c.materialName, uom: "MT", qtyPerBoqUnit: ((c.percent ?? 0) / 100) * mtPerUnit, isAuto: true });
      }
    } else {
      // ── IRC standard fallback for THIS exact mix type (keeps template grade if given) ──
      const grade = (mixTemplate?.binderGrade ?? "VG-30").trim();
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
