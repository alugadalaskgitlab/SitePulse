// Deterministic work-type classifier + recipe templates for BOQ item equipment/labour auto-build.
// Pure TS, no DB imports — safe to import from server, tests, or client.
// Equipment names must exactly match MORTH_EQUIPMENT_SEED names (shared/morthSeedData.ts).
// Labour designations must exactly match MORTH_LABOUR_SEED designations.

export type WorkType =
  | "earthwork"
  | "gsb"
  | "wmm"
  | "bituminous_base"
  | "bituminous_wearing"
  | "prime_coat"
  | "tack_coat"
  | "pcc"
  | "rcc"
  | "pqc"
  | "dlc"
  | "drain_masonry";

interface EquipmentLine {
  name: string;               // must match MORTH_EQUIPMENT_SEED name exactly
  preferredUnit: string;      // BOQ unit to try against standard outputs
  fallbackHrsPerUnit: number; // used when master output has no matching unit
  count: number;
}

interface LabourLine {
  designation: string;          // must match MORTH_LABOUR_SEED designation exactly
  fallbackDaysPerUnit: number;  // used when master output has no matching unit
  count: number;
}

interface WorkTypeRecipe {
  equipment: EquipmentLine[];
  labour: LabourLine[];
}

// ──────────────────────────────────────────────────────────────────────────────
// CLASSIFIER
// Returns null for items that cannot be confidently classified (they go into the
// "unrecipied" list — no wrong guesses).
// ──────────────────────────────────────────────────────────────────────────────
export function classifyWorkType(description: string, unit: string): WorkType | null {
  const d = description.toLowerCase();
  const u = unit.toUpperCase().trim();

  // Non-consuming items → no recipe (same guard as Patch 12 isNonConsumingItem)
  if (/\bdismantl|\bdemolit|\bdemolish|\bremoving\b|\bremoval\b|\bbreaking\b|\bscarif|\bmilling\b/i.test(d)) return null;

  // ── Bituminous wearing ──────────────────────────────────────────────────────
  if (/\bsdbc\b|semi[-\s]*dense\s*bituminous/i.test(d)) return "bituminous_wearing";
  if (/wearing\s*coat/i.test(d) && /bitumin/i.test(d)) return "bituminous_wearing";
  // BC / Bituminous Concrete → wearing unless explicitly DBM/dense-bituminous context
  if (/bituminous\s*concrete|\bbc\b/i.test(d) && !/dense\s*bituminous|\bdbm\b/i.test(d)) return "bituminous_wearing";

  // ── Bituminous base / binder ────────────────────────────────────────────────
  if (/\bdbm\b|dense\s*bituminous/i.test(d)) return "bituminous_base";
  if (/bituminous\s*macadam|\bbm\b/i.test(d)) return "bituminous_base";

  // ── Bituminous spray works ──────────────────────────────────────────────────
  // Checked AFTER the mix layers above so a BC/DBM laying item that merely mentions
  // "after applying prime coat" / "over tack coat" is NOT misclassified as a spray coat.
  if (/tack\s*coat/i.test(d)) return "tack_coat";
  if (/prime\s*coat|primer\s*coat|\bprimer\b/i.test(d)) return "prime_coat";

  // ── Granular courses ────────────────────────────────────────────────────────
  if (/\bgsb\b|granular\s*sub[-\s]*base/i.test(d)) return "gsb";
  if (/wet\s*mix\s*macadam|\bwmm\b/i.test(d)) return "wmm";

  // ── Concrete (order matters: pqc > dlc > rcc > pcc) ────────────────────────
  if (/\bpqc\b|pavement\s*quality\s*concrete/i.test(d)) return "pqc";
  if (/\bdlc\b|dry\s*lean\s*concrete/i.test(d)) return "dlc";
  if (/\brcc\b|reinforced\s*cement\s*concrete|reinforced\s*concrete/i.test(d)) return "rcc";
  if (
    /\bpcc\b|plain\s*cement\s*concrete|cement\s*concrete|concrete\s*of\s*grade|grade\s*m\s*-?\s*\d{2}/i.test(d) &&
    !/bitumin/i.test(d)
  ) return "pcc";

  // ── Earthwork (must be CUM-type unit) ───────────────────────────────────────
  if (
    /embankment|excavat|earth\s*work|earthwork|cut\s*(and|&)\s*fill|subgrade/i.test(d) &&
    /^(CUM|CUB|M3|CU\.?M)$/i.test(u)
  ) return "earthwork";

  // ── Minor civil / masonry ────────────────────────────────────────────────────
  if (/masonry|brick\s*work|stone\s*work|drain.*wall|head\s*wall|wing\s*wall/i.test(d)) return "drain_masonry";

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// RECIPE TEMPLATES
// fallbackHrsPerUnit / fallbackDaysPerUnit are derived from MoRTH 5th Rev norms
// and serve as safe defaults when the planning master has no matching unit output.
// ──────────────────────────────────────────────────────────────────────────────
export const WORK_TYPE_RECIPES: Record<WorkType, WorkTypeRecipe> = {

  // ── Earthwork (CUM) ──────────────────────────────────────────────────────────
  // Machine-driven: excavator is the capacity bottleneck. NO volumetric manual
  // labour (the 2 CUM/day manual norm is what caused insane labour numbers).
  earthwork: {
    equipment: [
      // Excavator: 60 CUM/hr → 1/60 = 0.0167 hr/CUM  — primary duration driver
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0167, count: 1 },
      // Grader for spreading/finishing: 150 CUM/hr → 0.0067 hr/CUM
      { name: "Motor Grader (180 HP)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
      // Roller: 700 SQM/hr; at 200 mm lift 1 CUM ≈ 5 SQM → 5/700 = 0.0071 hr/CUM
      { name: "Vibratory Roller (10T)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
      // Water tanker for compaction moisture
      { name: "Water Tanker (6000 L)",          preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      // Operators for excavator + dozer + grader + roller
      // 1 operator per machine; excavator does 60×8=480 CUM/day → 1/480 days/CUM each
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 4 },
      // Drivers for tippers + tanker
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 5 },
    ],
  },

  // ── Granular Sub-Base (CUM) ──────────────────────────────────────────────────
  gsb: {
    equipment: [
      { name: "Hydraulic Excavator (0.9 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0167, count: 1 },
      { name: "Motor Grader (180 HP)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
      { name: "Vibratory Roller (10T)",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
      { name: "Water Tanker (6000 L)",          preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 3 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 4 },
    ],
  },

  // ── Wet Mix Macadam (CUM or MT) ──────────────────────────────────────────────
  // WMM Plant: 100 MT/hr. If BOQ in CUM: 1 CUM WMM ≈ 2.2 MT → 2.2/100 = 0.022 hr/CUM
  wmm: {
    equipment: [
      { name: "WMM Plant (100 T/hr)",   preferredUnit: "MT",  fallbackHrsPerUnit: 0.022,  count: 1 },
      { name: "Motor Grader (180 HP)",  preferredUnit: "CUM", fallbackHrsPerUnit: 0.0067, count: 1 },
      { name: "Vibratory Roller (10T)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
      { name: "Water Tanker (6000 L)",  preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00208, count: 3 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00208, count: 4 },
    ],
  },

  // ── Bituminous Base / Binder course (DBM, BM) — MT or SQM ──────────────────
  // Machine-executed: HMP is the bottleneck. Labourers for joint/edge work only.
  bituminous_base: {
    equipment: [
      // HMP: 120 MT/hr → 1/120 = 0.00833 hr/MT
      { name: "Hot Mix Plant (120 T/hr)",  preferredUnit: "MT",  fallbackHrsPerUnit: 0.00833, count: 1 },
      // Paver: 75 MT/hr or 800 SQM/hr
      { name: "Paver Finisher (sensor)",   preferredUnit: "MT",  fallbackHrsPerUnit: 0.01333, count: 1 },
      { name: "Vibratory Roller (10T)",    preferredUnit: "SQM", fallbackHrsPerUnit: 0.00143, count: 1 },
      { name: "Pneumatic Tyre Roller",     preferredUnit: "SQM", fallbackHrsPerUnit: 0.002,   count: 1 },
    ],
    labour: [
      // HMP+paver+2×rollers → 4 operators; HMP processes 120×8=960 MT/day → 1/960 = 0.00104
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00104, count: 4 },
      { designation: "Paving Gang Supervisor",   fallbackDaysPerUnit: 0.00104, count: 1 },
      // Gang of 8 for joint/edge work at ~600 MT/day paver output → 8/960 = 0.00833
      { designation: "Bituminous Laying Labour", fallbackDaysPerUnit: 0.00833, count: 8 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00104, count: 6 },
    ],
  },

  // ── Bituminous Wearing course (BC, SDBC, wearing coat) — MT or SQM ──────────
  bituminous_wearing: {
    equipment: [
      { name: "Hot Mix Plant (120 T/hr)",  preferredUnit: "MT",  fallbackHrsPerUnit: 0.00833, count: 1 },
      { name: "Paver Finisher (sensor)",   preferredUnit: "MT",  fallbackHrsPerUnit: 0.01333, count: 1 },
      { name: "Vibratory Roller (10T)",    preferredUnit: "SQM", fallbackHrsPerUnit: 0.00143, count: 1 },
      { name: "Pneumatic Tyre Roller",     preferredUnit: "SQM", fallbackHrsPerUnit: 0.002,   count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",       fallbackDaysPerUnit: 0.00104, count: 4 },
      { designation: "Paving Gang Supervisor",   fallbackDaysPerUnit: 0.00104, count: 1 },
      { designation: "Bituminous Laying Labour", fallbackDaysPerUnit: 0.00833, count: 8 },
      { designation: "Driver (Tipper / Tanker)", fallbackDaysPerUnit: 0.00104, count: 6 },
    ],
  },

  // ── Prime Coat (SQM) ─────────────────────────────────────────────────────────
  // Pressure distributor: 3000 SQM/hr → 1/3000 = 0.000333 hr/SQM
  prime_coat: {
    equipment: [
      { name: "Bitumen Pressure Distributor", preferredUnit: "SQM", fallbackHrsPerUnit: 0.000333, count: 1 },
    ],
    labour: [
      // 2 operators + small helper gang; distributor at 3000×8=24000 SQM/day → 1/24000 = 0.0000417
      { designation: "Equipment Operator",      fallbackDaysPerUnit: 0.0000417, count: 2 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.0000417, count: 4 },
    ],
  },

  // ── Tack Coat (SQM) ──────────────────────────────────────────────────────────
  tack_coat: {
    equipment: [
      { name: "Bitumen Pressure Distributor", preferredUnit: "SQM", fallbackHrsPerUnit: 0.000333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",      fallbackDaysPerUnit: 0.0000417, count: 2 },
      { designation: "General Helper / Coolie", fallbackDaysPerUnit: 0.0000417, count: 4 },
    ],
  },

  // ── Plain Cement Concrete (CUM) ──────────────────────────────────────────────
  // Transit mixer: 6 CUM/hr per mixer → 3 mixers = 18 CUM/hr effective
  // Concrete pump: 30 CUM/hr → 0.0333 hr/CUM (pump drives duration)
  pcc: {
    equipment: [
      { name: "Transit Mixer (6 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,  count: 3 },
      { name: "Concrete Pump",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      // Pump at 30 CUM/hr × 8hr = 240 CUM/day → 1/240 = 0.00417 days/CUM per operator
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.00417, count: 2 },
      // Mason: 2.5 CUM/day → 1/2.5 = 0.4 days/CUM
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4,     count: 5 },
      // Carpenter: 20 SQM/day; 1 CUM ≈ 4 SQM formwork → 4/20 = 0.2 days/CUM
      { designation: "Carpenter (Form-work)",        fallbackDaysPerUnit: 0.2,     count: 3 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4,     count: 4 },
    ],
  },

  // ── Reinforced Cement Concrete (CUM) ─────────────────────────────────────────
  // Like PCC but adds steel fixers. Typical RCC ≈ 150 kg/CUM = 0.15 MT.
  // Steel fixer: 0.5 MT/day → 0.15/0.5 = 0.3 days/CUM per fixer.
  rcc: {
    equipment: [
      { name: "Transit Mixer (6 CUM)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,  count: 3 },
      { name: "Concrete Pump",         preferredUnit: "CUM", fallbackHrsPerUnit: 0.0333, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.00417, count: 2 },
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4,     count: 5 },
      { designation: "Carpenter (Form-work)",        fallbackDaysPerUnit: 0.2,     count: 3 },
      { designation: "Steel Fixer (Rebar)",          fallbackDaysPerUnit: 0.3,     count: 4 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4,     count: 4 },
    ],
  },

  // ── Pavement Quality Concrete (CUM) ──────────────────────────────────────────
  // Slip-form paver: 150 CUM/hr → 1/150 = 0.00667 hr/CUM (primary driver)
  // Multiple mixers to keep paver continuously fed.
  pqc: {
    equipment: [
      { name: "Concrete Paver (slip-form)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.00667, count: 1 },
      { name: "Transit Mixer (6 CUM)",      preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,   count: 6 },
    ],
    labour: [
      // Paver+roller+others → 4 operators; paver at 150×8=1200 CUM/day → 1/1200 = 0.000833
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.000833, count: 4 },
      { designation: "Paving Gang Supervisor",       fallbackDaysPerUnit: 0.000833, count: 1 },
      // Edge boards only (not full shuttering)
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.1,      count: 3 },
      { designation: "Driver (Tipper / Tanker)",     fallbackDaysPerUnit: 0.000833, count: 6 },
    ],
  },

  // ── Dry Lean Concrete (CUM) ──────────────────────────────────────────────────
  dlc: {
    equipment: [
      { name: "Transit Mixer (6 CUM)",  preferredUnit: "CUM", fallbackHrsPerUnit: 0.167,  count: 3 },
      { name: "Vibratory Roller (10T)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.0071, count: 1 },
    ],
    labour: [
      { designation: "Equipment Operator",           fallbackDaysPerUnit: 0.00417, count: 2 },
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.2,     count: 3 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.2,     count: 6 },
    ],
  },

  // ── Drain / Masonry / Minor Civil (CUM or RM) ────────────────────────────────
  // Largely manual — mason is the bottleneck.
  drain_masonry: {
    equipment: [
      { name: "Water Tanker (6000 L)", preferredUnit: "CUM", fallbackHrsPerUnit: 0.1, count: 1 },
    ],
    labour: [
      { designation: "Mason (Form-work / Concrete)", fallbackDaysPerUnit: 0.4, count: 4 },
      { designation: "General Helper / Coolie",      fallbackDaysPerUnit: 0.4, count: 4 },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// BUILDERS — called from the auto-build endpoint in server/routes.ts
// ──────────────────────────────────────────────────────────────────────────────

export interface BuiltEquipmentRow {
  equipmentName: string;
  planningEquipmentTypeId: number | null;
  qtyPerBoqUnit: number;
  count: number;
  sortOrder: number;
}

export interface BuiltLabourRow {
  designation: string;
  planningLabourTypeId: number | null;
  qtyPerBoqUnit: number;
  count: number;
  sortOrder: number;
}

type EquipIndexEntry = { id: number; outputs: Array<{ unit: string; outputPerHr: number }> };
type LabourIndexEntry = { id: number; outputs: Array<{ unit: string; outputPerDay: number }> };

/**
 * Build equipment rows for a BOQ item.
 * qtyPerBoqUnit = hours per 1 BOQ unit, derived from master output norms when
 * the BOQ unit matches; falls back to the recipe's hardcoded MoRTH norm otherwise.
 */
export function buildEquipmentRows(
  wt: WorkType,
  boqUnit: string,
  equipIndex: Map<string, EquipIndexEntry>,
): BuiltEquipmentRow[] {
  const recipe = WORK_TYPE_RECIPES[wt];
  if (!recipe) return [];
  const u = boqUnit.toUpperCase().trim();

  return recipe.equipment.map((line, i) => {
    const master = equipIndex.get(line.name.toLowerCase());
    let qtyPerBoqUnit = line.fallbackHrsPerUnit;

    if (master && master.outputs.length > 0) {
      // Use master output only when the BOQ unit matches exactly
      const match = master.outputs.find(o => o.unit.toUpperCase() === u);
      if (match && match.outputPerHr > 0) {
        qtyPerBoqUnit = 1 / match.outputPerHr;
      }
    }

    return {
      equipmentName: line.name,
      planningEquipmentTypeId: master?.id ?? null,
      qtyPerBoqUnit,
      count: line.count,
      sortOrder: i,
    };
  });
}

/**
 * Build labour rows for a BOQ item.
 * qtyPerBoqUnit = days per 1 BOQ unit, derived from master output norms when
 * the BOQ unit matches; falls back to the recipe's hardcoded MoRTH norm otherwise.
 */
export function buildLabourRows(
  wt: WorkType,
  boqUnit: string,
  labourIndex: Map<string, LabourIndexEntry>,
): BuiltLabourRow[] {
  const recipe = WORK_TYPE_RECIPES[wt];
  if (!recipe) return [];
  const u = boqUnit.toUpperCase().trim();

  return recipe.labour.map((line, i) => {
    const master = labourIndex.get(line.designation.toLowerCase());
    let qtyPerBoqUnit = line.fallbackDaysPerUnit;

    if (master && master.outputs.length > 0) {
      const match = master.outputs.find(o => o.unit.toUpperCase() === u);
      if (match && match.outputPerDay > 0) {
        qtyPerBoqUnit = 1 / match.outputPerDay;
      }
    }

    return {
      designation: line.designation,
      planningLabourTypeId: master?.id ?? null,
      qtyPerBoqUnit,
      count: line.count,
      sortOrder: i,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// STANDARD CONCRETE DESIGN-MIX FALLBACK (kg/m³)
// Used ONLY when the RMC module has no user-entered mix design for the grade.
// The user's RMC JMF always takes precedence. Values are conservative MoRTH/IS
// nominal site-mix approximations — replace with the project JMF for accuracy.
// ──────────────────────────────────────────────────────────────────────────────
export interface StandardConcreteDesign {
  grade: string;
  cementContent: number;
  admixtureName: string | null;
  admixtureDosage: number | null;
  componentProportions: { cement: number; fineAgg: number; coarseAgg20: number; coarseAgg10: number };
}

export const STANDARD_CONCRETE_DESIGNS: Record<string, StandardConcreteDesign> = {
  M10: { grade: "M10", cementContent: 220, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 220, fineAgg: 720, coarseAgg20: 730, coarseAgg10: 490 } },
  M15: { grade: "M15", cementContent: 320, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 320, fineAgg: 700, coarseAgg20: 760, coarseAgg10: 500 } },
  M20: { grade: "M20", cementContent: 360, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 360, fineAgg: 680, coarseAgg20: 770, coarseAgg10: 510 } },
  M25: { grade: "M25", cementContent: 380, admixtureName: "PCE Superplasticiser", admixtureDosage: 0.8, componentProportions: { cement: 380, fineAgg: 660, coarseAgg20: 780, coarseAgg10: 520 } },
  M30: { grade: "M30", cementContent: 400, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 400, fineAgg: 650, coarseAgg20: 790, coarseAgg10: 520 } },
  M35: { grade: "M35", cementContent: 420, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 420, fineAgg: 640, coarseAgg20: 800, coarseAgg10: 530 } },
  M40: { grade: "M40", cementContent: 440, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.2, componentProportions: { cement: 440, fineAgg: 620, coarseAgg20: 810, coarseAgg10: 540 } },
  M45: { grade: "M45", cementContent: 360, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 360, fineAgg: 690, coarseAgg20: 720, coarseAgg10: 480 } },
  M50: { grade: "M50", cementContent: 460, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.2, componentProportions: { cement: 460, fineAgg: 600, coarseAgg20: 820, coarseAgg10: 550 } },
  PQC: { grade: "PQC (M40)", cementContent: 400, admixtureName: "PCE Superplasticiser", admixtureDosage: 1.0, componentProportions: { cement: 400, fineAgg: 650, coarseAgg20: 760, coarseAgg10: 480 } },
  DLC: { grade: "DLC (lean)", cementContent: 150, admixtureName: null, admixtureDosage: null, componentProportions: { cement: 150, fineAgg: 700, coarseAgg20: 760, coarseAgg10: 700 } },
};
