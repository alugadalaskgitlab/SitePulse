/**
 * Instruction 028 — Shared Execution Arrangement category registry.
 *
 * Authoritative source for category-specific arrangement vocabulary:
 * arrangement types, component keys/labels, default responsibility templates,
 * significant execution components for state derivation, material
 * responsibility components and explicit resource→component mappings.
 *
 * Categories: earthwork (moved from the previously hard-coded earthwork
 * arrays WITHOUT behaviour change) and bituminous (new in 028).
 *
 * Pure data + pure functions only — used by client, server, planning engine
 * and tests. Do NOT duplicate these arrays elsewhere.
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export type WorkCategoryKey = "earthwork" | "bituminous";

export const WORK_CATEGORY_KEYS: readonly WorkCategoryKey[] = ["earthwork", "bituminous"] as const;

/**
 * Permitted responsibility values. `hlc` is the historical stored value for
 * "the company using this deployment" and MUST remain valid (028 §3).
 * `main_contractor` behaves as company-side for demand (028 §27/§39B: when the
 * deployment company is main contractor, binder it supplies stays in demand).
 */
export type ComponentResponsibility =
  | "hlc"
  | "agency"
  | "main_contractor"
  | "client"
  | "shared"
  | "not_applicable"
  | "not_decided";

export const RESPONSIBILITY_VALUES: readonly ComponentResponsibility[] = [
  "hlc", "agency", "main_contractor", "client", "shared", "not_applicable", "not_decided",
] as const;

/** Responsibilities that positively EXCLUDE company demand (external party owns it). */
export const NON_COMPANY_RESPONSIBILITIES: ReadonlySet<string> = new Set(["agency", "client", "not_applicable"]);
/** Responsibilities that RETAIN company demand. `shared` retains (never assume 50:50 — 028 §30). */
export const COMPANY_SIDE_RESPONSIBILITIES: ReadonlySet<string> = new Set(["hlc", "main_contractor", "shared", "not_decided"]);

// ─── Bituminous item types (028 §5) ───────────────────────────────────────────

export type BituminousItemType =
  | "prime_coat"
  | "tack_coat"
  | "dbm"
  | "bc"
  | "sdbc"
  | "bituminous_macadam"
  | "seal_coat"
  | "premix_carpet"
  | "other_bituminous";

export const BITUMINOUS_ITEM_TYPES: readonly BituminousItemType[] = [
  "prime_coat", "tack_coat", "dbm", "bc", "sdbc", "bituminous_macadam", "seal_coat", "premix_carpet", "other_bituminous",
] as const;

export const BITUMINOUS_ITEM_TYPE_LABELS: Record<BituminousItemType, string> = {
  prime_coat: "Prime Coat",
  tack_coat: "Tack Coat",
  dbm: "Dense Bituminous Macadam (DBM)",
  bc: "Bituminous Concrete (BC)",
  sdbc: "Semi-Dense Bituminous Concrete (SDBC)",
  bituminous_macadam: "Bituminous Macadam (BM)",
  seal_coat: "Seal Coat",
  premix_carpet: "Premix Carpet",
  other_bituminous: "Other Bituminous Work",
};

/** Spray-application items (SQM emulsion works — no hot mix). */
export const SPRAY_ITEM_TYPES: ReadonlySet<string> = new Set(["prime_coat", "tack_coat"]);

// ─── Earthwork vocabulary (moved verbatim — 028 §2, keys NOT renamed) ────────

export const EARTHWORK_COMPONENT_KEYS = [
  "material_source",
  "source_identification",
  "excavation",
  "loading",
  "transport",
  "dumping",
  "spreading",
  "watering",
  "compaction",
  "royalty_seigniorage",
  "permits_approvals",
  "equipment",
  "tippers",
  "operators_drivers",
  "diesel_fuel",
  "survey_setting_out",
  "quality_testing",
] as const;

export const EARTHWORK_COMPONENT_LABELS: Record<string, string> = {
  material_source: "Material Source",
  source_identification: "Source Identification",
  excavation: "Excavation",
  loading: "Loading",
  transport: "Transport",
  dumping: "Dumping",
  spreading: "Spreading",
  watering: "Watering / Compaction Fluid",
  compaction: "Compaction",
  royalty_seigniorage: "Royalty / Seigniorage",
  permits_approvals: "Permits & Approvals",
  equipment: "Equipment (Excavator etc.)",
  tippers: "Tippers",
  operators_drivers: "Operators & Drivers",
  diesel_fuel: "Diesel / Fuel",
  survey_setting_out: "Survey & Setting Out",
  quality_testing: "Quality Testing",
};

export const EARTHWORK_ARRANGEMENT_TYPES = [
  "fully_outsourced_composite",
  "vendor_material_delivered",
  "hlc_source_outsourced_execution",
  "hlc_in_house",
  "partly_outsourced",
  "client_supplied",
  "reused_excavated",
  "not_decided",
] as const;

export const EARTHWORK_ARRANGEMENT_TYPE_LABELS: Record<string, string> = {
  fully_outsourced_composite: "Fully Outsourced (Composite Rate)",
  vendor_material_delivered: "Vendor Material — Delivered to Site",
  hlc_source_outsourced_execution: "HLC Source + Outsourced Execution",
  hlc_in_house: "HLC In-House",
  partly_outsourced: "Partly Outsourced",
  client_supplied: "Client Supplied",
  reused_excavated: "Reuse of Excavated Material",
  not_decided: "Not Decided",
};

/** Earthwork significant execution components (unchanged from executionState.ts). */
export const EARTHWORK_SIGNIFICANT_COMPONENTS = [
  "excavation", "loading", "transport", "spreading", "watering", "compaction", "equipment", "tippers",
] as const;

export const EARTHWORK_MATERIAL_COMPONENTS = ["material_source", "source_identification"] as const;

// ─── Bituminous vocabulary (028 §17) ─────────────────────────────────────────

export const BITUMINOUS_COMPONENT_KEYS = [
  // Materials
  "coarse_aggregates",
  "fine_aggregates",
  "manufactured_sand",
  "mineral_filler",
  "binder_bitumen",
  "emulsion",
  "additives",
  "anti_stripping_agent",
  // Production
  "job_mix_formula",
  "mix_production",
  "hot_mix_plant",
  "plant_operators",
  "plant_fuel",
  "plant_electricity",
  "loading_at_plant",
  "production_qc",
  // Transport
  "mix_transport",
  "transport_tippers",
  "transport_drivers",
  "transport_diesel",
  "temperature_protection",
  // Spraying
  "surface_cleaning",
  "prime_tack_material",
  "mechanical_sprayer",
  "spraying_crew",
  "sprayer_fuel",
  "application_control",
  // Laying / compaction
  "paver",
  "paving_crew",
  "tandem_roller",
  "pneumatic_tyre_roller",
  "finish_roller",
  "roller_operators",
  "paving_diesel",
  "joint_preparation",
  "edge_treatment",
  "compaction_control",
  // Site support
  "survey_levels",
  "traffic_control",
  "field_qc",
  "core_testing",
  "laboratory_testing",
  "safety",
  "wastage",
] as const;

export const BITUMINOUS_COMPONENT_LABELS: Record<string, string> = {
  coarse_aggregates: "Coarse Aggregates",
  fine_aggregates: "Fine Aggregates",
  manufactured_sand: "Manufactured Sand",
  mineral_filler: "Mineral Filler",
  binder_bitumen: "Binder (Bitumen)",
  emulsion: "Emulsion",
  additives: "Additives",
  anti_stripping_agent: "Anti-Stripping Agent",
  job_mix_formula: "Job Mix Formula (JMF)",
  mix_production: "Mix Production",
  hot_mix_plant: "Hot Mix Plant",
  plant_operators: "Plant Operators",
  plant_fuel: "Plant Fuel",
  plant_electricity: "Plant Electricity",
  loading_at_plant: "Loading at Plant",
  production_qc: "Production QC",
  mix_transport: "Mix Transport",
  transport_tippers: "Transport Tippers",
  transport_drivers: "Transport Drivers",
  transport_diesel: "Transport Diesel",
  temperature_protection: "Temperature Protection",
  surface_cleaning: "Surface Cleaning",
  prime_tack_material: "Prime/Tack Material (Emulsion)",
  mechanical_sprayer: "Mechanical Sprayer",
  spraying_crew: "Spraying Crew",
  sprayer_fuel: "Sprayer Fuel",
  application_control: "Application Rate Control",
  paver: "Paver",
  paving_crew: "Paving Crew",
  tandem_roller: "Tandem Roller",
  pneumatic_tyre_roller: "Pneumatic Tyre Roller (PTR)",
  finish_roller: "Finish Roller",
  roller_operators: "Roller Operators",
  paving_diesel: "Paving / Rolling Diesel",
  joint_preparation: "Joint Preparation",
  edge_treatment: "Edge Treatment",
  compaction_control: "Compaction Control",
  survey_levels: "Survey & Levels",
  traffic_control: "Traffic Control",
  field_qc: "Field QC",
  core_testing: "Core Testing",
  laboratory_testing: "Laboratory Testing",
  safety: "Safety",
  wastage: "Wastage",
};

export const BITUMINOUS_ARRANGEMENT_TYPES = [
  "company_inhouse",
  "complete_supply_and_lay",
  "finished_mix_supply_only",
  "mix_production_only",
  "production_and_transport",
  "spraying_only",
  "laying_and_compaction_only",
  "supply_transport_and_lay",
  "main_contractor_supplies_binder",
  "main_contractor_supplies_aggregates",
  "material_plus_spraying",
  "client_supplied",
  "partly_outsourced",
  "not_decided",
] as const;

export const BITUMINOUS_ARRANGEMENT_TYPE_LABELS: Record<string, string> = {
  company_inhouse: "Company In-house",
  complete_supply_and_lay: "Complete Supply and Lay",
  finished_mix_supply_only: "Finished Mix Supply Only",
  mix_production_only: "Mix Production Only",
  production_and_transport: "Production and Transport",
  spraying_only: "Spraying Only",
  laying_and_compaction_only: "Laying and Compaction Only",
  supply_transport_and_lay: "Supply, Transport and Lay",
  main_contractor_supplies_binder: "Main Contractor Supplies Binder",
  main_contractor_supplies_aggregates: "Main Contractor Supplies Aggregates",
  material_plus_spraying: "Material Plus Spraying",
  client_supplied: "Client Supplied",
  partly_outsourced: "Partly Outsourced / Shared Responsibility",
  not_decided: "Not Decided",
};

/** Component subsets applicable per bituminous item type (028 §15/§17 last rule). */
const MIX_WORK_COMPONENTS = BITUMINOUS_COMPONENT_KEYS.filter(k =>
  !["surface_cleaning", "prime_tack_material", "mechanical_sprayer", "spraying_crew", "sprayer_fuel", "application_control", "emulsion"].includes(k),
);
const SPRAY_WORK_COMPONENTS = [
  "surface_cleaning", "prime_tack_material", "emulsion", "mechanical_sprayer", "spraying_crew",
  "sprayer_fuel", "application_control", "traffic_control", "field_qc", "safety", "survey_levels", "wastage",
] as const;

export function bituminousComponentsForItemType(itemType: BituminousItemType | null | undefined): readonly string[] {
  if (itemType && SPRAY_ITEM_TYPES.has(itemType)) return SPRAY_WORK_COMPONENTS;
  // seal coat / premix carpet also use mix components minus prime/tack spraying
  return MIX_WORK_COMPONENTS;
}

/** Bituminous significant execution components for state derivation (028 §11). */
export const BITUMINOUS_MIX_SIGNIFICANT_COMPONENTS = [
  "mix_production", "mix_transport", "paver", "paving_crew", "compaction_control",
  "hot_mix_plant", "tandem_roller", "pneumatic_tyre_roller",
] as const;
export const BITUMINOUS_SPRAY_SIGNIFICANT_COMPONENTS = [
  "surface_cleaning", "spraying_crew", "mechanical_sprayer",
] as const;

export const BITUMINOUS_MATERIAL_COMPONENTS = [
  "coarse_aggregates", "fine_aggregates", "manufactured_sand", "mineral_filler",
  "binder_bitumen", "emulsion", "additives", "anti_stripping_agent", "prime_tack_material",
] as const;

// ─── Category descriptors ─────────────────────────────────────────────────────

export interface CategoryDescriptor {
  key: WorkCategoryKey;
  label: string;
  arrangementTypes: readonly string[];
  arrangementTypeLabels: Record<string, string>;
  componentKeys: readonly string[];
  componentLabels: Record<string, string>;
  /** Types with outsourced semantics (agency substantially executes). */
  outsourcedTypes: ReadonlySet<string>;
  /** Types with company-in-house semantics. */
  inhouseTypes: ReadonlySet<string>;
  /** Types with client-supplied semantics. */
  clientTypes: ReadonlySet<string>;
  /** Significant execution components for state derivation (default set). */
  significantComponents: readonly string[];
  /** Components representing material supply responsibility. */
  materialComponents: readonly string[];
}

export const EXECUTION_ARRANGEMENT_CATEGORIES: Record<WorkCategoryKey, CategoryDescriptor> = {
  earthwork: {
    key: "earthwork",
    label: "Earthwork",
    arrangementTypes: EARTHWORK_ARRANGEMENT_TYPES,
    arrangementTypeLabels: EARTHWORK_ARRANGEMENT_TYPE_LABELS,
    componentKeys: EARTHWORK_COMPONENT_KEYS,
    componentLabels: EARTHWORK_COMPONENT_LABELS,
    outsourcedTypes: new Set(["fully_outsourced_composite", "vendor_material_delivered", "hlc_source_outsourced_execution"]),
    inhouseTypes: new Set(["hlc_in_house", "reused_excavated"]),
    clientTypes: new Set(["client_supplied"]),
    significantComponents: EARTHWORK_SIGNIFICANT_COMPONENTS,
    materialComponents: EARTHWORK_MATERIAL_COMPONENTS,
  },
  bituminous: {
    key: "bituminous",
    label: "Bituminous",
    arrangementTypes: BITUMINOUS_ARRANGEMENT_TYPES,
    arrangementTypeLabels: BITUMINOUS_ARRANGEMENT_TYPE_LABELS,
    componentKeys: BITUMINOUS_COMPONENT_KEYS,
    componentLabels: BITUMINOUS_COMPONENT_LABELS,
    outsourcedTypes: new Set([
      "complete_supply_and_lay", "finished_mix_supply_only", "mix_production_only",
      "production_and_transport", "spraying_only", "laying_and_compaction_only",
      "supply_transport_and_lay", "main_contractor_supplies_binder",
      "main_contractor_supplies_aggregates", "material_plus_spraying",
    ]),
    inhouseTypes: new Set(["company_inhouse"]),
    clientTypes: new Set(["client_supplied"]),
    significantComponents: BITUMINOUS_MIX_SIGNIFICANT_COMPONENTS,
    materialComponents: BITUMINOUS_MATERIAL_COMPONENTS,
  },
};

export function getCategoryDescriptor(category: string | null | undefined): CategoryDescriptor {
  return EXECUTION_ARRANGEMENT_CATEGORIES[(category as WorkCategoryKey) ?? "earthwork"]
    ?? EXECUTION_ARRANGEMENT_CATEGORIES.earthwork;
}

/** Significant components for state derivation, item-type aware for bituminous (028 §11). */
export function significantComponentsFor(category: string | null | undefined, itemType?: string | null): readonly string[] {
  if (category === "bituminous" && itemType && SPRAY_ITEM_TYPES.has(itemType as BituminousItemType)) {
    return BITUMINOUS_SPRAY_SIGNIFICANT_COMPONENTS;
  }
  return getCategoryDescriptor(category).significantComponents;
}

// ─── Default responsibility templates (028 §18) ──────────────────────────────

function fill(keys: readonly string[], resp: ComponentResponsibility): Record<string, ComponentResponsibility> {
  return Object.fromEntries(keys.map(k => [k, resp]));
}

/**
 * Default bituminous templates. Company side stored as "hlc" for storage
 * compatibility (existing `hlc` values remain valid — 028 §3).
 * Defaults are editable before submission.
 */
export function bituminousDefaultComponents(
  type: string,
  itemType?: BituminousItemType | null,
): Record<string, ComponentResponsibility> {
  const keys = bituminousComponentsForItemType(itemType ?? null);
  const base = fill(keys, "not_decided");
  const set = (patch: Record<string, ComponentResponsibility>) => ({ ...base, ...pickKnown(patch, keys) });

  const allAgency = fill(keys, "agency");
  const companyQc: Record<string, ComponentResponsibility> = {
    field_qc: "hlc", laboratory_testing: "hlc", core_testing: "hlc", production_qc: "hlc", survey_levels: "hlc",
  };

  switch (type) {
    case "company_inhouse":
      return { ...fill(keys, "hlc") };
    case "client_supplied":
      return { ...fill(keys, "client"), ...pickKnown(companyQc, keys) };
    case "complete_supply_and_lay":
    case "supply_transport_and_lay":
      return { ...allAgency, ...pickKnown(companyQc, keys) };
    case "main_contractor_supplies_binder":
      return { ...allAgency, ...pickKnown({ binder_bitumen: "hlc", ...companyQc }, keys) };
    case "main_contractor_supplies_aggregates":
      return { ...allAgency, ...pickKnown({ coarse_aggregates: "hlc", fine_aggregates: "hlc", manufactured_sand: "hlc", mineral_filler: "hlc", ...companyQc }, keys) };
    case "finished_mix_supply_only":
      return set({
        coarse_aggregates: "agency", fine_aggregates: "agency", manufactured_sand: "agency",
        mineral_filler: "agency", binder_bitumen: "agency", additives: "agency", anti_stripping_agent: "agency",
        job_mix_formula: "agency", mix_production: "agency", hot_mix_plant: "agency",
        plant_operators: "agency", plant_fuel: "agency", plant_electricity: "agency",
        loading_at_plant: "agency", production_qc: "agency",
        mix_transport: "hlc", transport_tippers: "hlc", transport_drivers: "hlc", transport_diesel: "hlc",
        temperature_protection: "hlc",
        paver: "hlc", paving_crew: "hlc", tandem_roller: "hlc", pneumatic_tyre_roller: "hlc",
        finish_roller: "hlc", roller_operators: "hlc", paving_diesel: "hlc",
        joint_preparation: "hlc", edge_treatment: "hlc", compaction_control: "hlc",
        survey_levels: "hlc", traffic_control: "hlc", field_qc: "hlc", core_testing: "hlc",
        laboratory_testing: "hlc", safety: "hlc", wastage: "hlc",
      });
    case "mix_production_only":
      return set({
        coarse_aggregates: "agency", fine_aggregates: "agency", manufactured_sand: "agency",
        mineral_filler: "agency", binder_bitumen: "agency", additives: "agency", anti_stripping_agent: "agency",
        job_mix_formula: "agency", mix_production: "agency", hot_mix_plant: "agency",
        plant_operators: "agency", plant_fuel: "agency", plant_electricity: "agency",
        loading_at_plant: "agency", production_qc: "agency",
        mix_transport: "hlc", transport_tippers: "hlc", transport_drivers: "hlc", transport_diesel: "hlc",
        paver: "hlc", paving_crew: "hlc", tandem_roller: "hlc", pneumatic_tyre_roller: "hlc",
        finish_roller: "hlc", roller_operators: "hlc", paving_diesel: "hlc",
        field_qc: "hlc", survey_levels: "hlc",
      });
    case "production_and_transport":
      return set({
        coarse_aggregates: "agency", fine_aggregates: "agency", manufactured_sand: "agency",
        mineral_filler: "agency", binder_bitumen: "agency", additives: "agency", anti_stripping_agent: "agency",
        job_mix_formula: "agency", mix_production: "agency", hot_mix_plant: "agency",
        plant_operators: "agency", plant_fuel: "agency", plant_electricity: "agency",
        loading_at_plant: "agency", production_qc: "agency",
        mix_transport: "agency", transport_tippers: "agency", transport_drivers: "agency", transport_diesel: "agency",
        temperature_protection: "agency",
        paver: "hlc", paving_crew: "hlc", tandem_roller: "hlc", pneumatic_tyre_roller: "hlc",
        finish_roller: "hlc", roller_operators: "hlc", paving_diesel: "hlc",
        field_qc: "hlc", survey_levels: "hlc",
      });
    case "laying_and_compaction_only":
      return set({
        coarse_aggregates: "hlc", fine_aggregates: "hlc", manufactured_sand: "hlc",
        mineral_filler: "hlc", binder_bitumen: "hlc", additives: "hlc", anti_stripping_agent: "hlc",
        job_mix_formula: "hlc", mix_production: "hlc", hot_mix_plant: "hlc",
        plant_operators: "hlc", plant_fuel: "hlc", plant_electricity: "hlc",
        loading_at_plant: "hlc", production_qc: "hlc",
        mix_transport: "hlc", transport_tippers: "hlc", transport_drivers: "hlc", transport_diesel: "hlc",
        paver: "agency", paving_crew: "agency", tandem_roller: "agency", pneumatic_tyre_roller: "agency",
        finish_roller: "agency", roller_operators: "agency", paving_diesel: "agency",
        joint_preparation: "agency", edge_treatment: "agency", compaction_control: "agency",
        field_qc: "hlc", survey_levels: "hlc",
      });
    case "spraying_only":
      // Company supplies emulsion; agency sprays.
      return set({
        prime_tack_material: "hlc", emulsion: "hlc",
        surface_cleaning: "agency", mechanical_sprayer: "agency", spraying_crew: "agency",
        sprayer_fuel: "agency", application_control: "agency",
        field_qc: "hlc", traffic_control: "hlc", safety: "agency",
      });
    case "material_plus_spraying":
      // Agency supplies emulsion AND sprays.
      return set({
        prime_tack_material: "agency", emulsion: "agency",
        surface_cleaning: "agency", mechanical_sprayer: "agency", spraying_crew: "agency",
        sprayer_fuel: "agency", application_control: "agency",
        field_qc: "hlc", traffic_control: "hlc",
      });
    case "partly_outsourced":
    case "not_decided":
    default:
      return base;
  }
}

function pickKnown(
  patch: Record<string, ComponentResponsibility>,
  keys: readonly string[],
): Record<string, ComponentResponsibility> {
  const keySet = new Set(keys);
  return Object.fromEntries(Object.entries(patch).filter(([k]) => keySet.has(k)));
}

// ─── Explicit resource → component mapping registry (028 §19–20) ─────────────
//
// Preferred order: explicit metadata on the resource row (source A, handled by
// callers when present) → this canonical mapping (source B) → narrow regex
// fallback for historic unmapped records (source C, earthwork legacy only).

export interface ResourceMappingResult {
  /** Component keys that own this resource, in priority order. */
  componentKeys: string[];
  /** Which mapping tier produced the result. */
  source: "registry" | "regex_fallback" | "unmapped";
}

/** Bituminous equipment mapping (canonical, 028 §20). */
const BITUMINOUS_EQUIPMENT_RULES: Array<{ re: RegExp; keys: string[] }> = [
  { re: /hot\s*mix\s*plant|\bhmp\b|batch(ing)?\s*(mix\s*)?plant|drum\s*mix/i, keys: ["hot_mix_plant", "mix_production"] },
  { re: /paver|paving\s*machine|sensor\s*paver/i, keys: ["paver"] },
  { re: /tandem\s*roller/i, keys: ["tandem_roller"] },
  { re: /pneumatic|\bptr\b|tyre[d]?\s*roller/i, keys: ["pneumatic_tyre_roller"] },
  { re: /finish(ing)?\s*roller/i, keys: ["finish_roller"] },
  { re: /smooth\s*wheel(ed)?\s*roller|static\s*roller|road\s*roller|vibratory\s*roller|roller|compactor/i, keys: ["tandem_roller"] },
  { re: /sprayer|distributor|emulsion\s*(pressure\s*)?dist/i, keys: ["mechanical_sprayer"] },
  { re: /broom|sweeper|air\s*compressor|blower/i, keys: ["surface_cleaning"] },
  { re: /tipper|dumper|hyva|\btruck\b|trailer/i, keys: ["mix_transport", "transport_tippers"] },
  { re: /loader|front\s*end/i, keys: ["loading_at_plant"] },
  { re: /generator|\bdg\s*set\b/i, keys: ["plant_electricity"] },
];

/** Bituminous labour mapping. */
const BITUMINOUS_LABOUR_RULES: Array<{ re: RegExp; keys: string[] }> = [
  { re: /plant\s*operator/i, keys: ["plant_operators"] },
  { re: /roller\s*operator/i, keys: ["roller_operators"] },
  { re: /driver/i, keys: ["transport_drivers"] },
  { re: /spray/i, keys: ["spraying_crew"] },
  { re: /paver|paving|screed|raker/i, keys: ["paving_crew"] },
  { re: /quality|\blab\b|technician/i, keys: ["field_qc"] },
  { re: /survey/i, keys: ["survey_levels"] },
  { re: /operator/i, keys: ["plant_operators"] },
];

/** Bituminous material mapping. */
const BITUMINOUS_MATERIAL_RULES: Array<{ re: RegExp; keys: string[] }> = [
  { re: /emulsion|ss[-\s]?1|rs[-\s]?1|\bck\b/i, keys: ["emulsion", "prime_tack_material"] },
  { re: /bitumen|\bvg[-\s]?\d+\b|crmb|pmb|binder|asphalt\s*cement/i, keys: ["binder_bitumen"] },
  { re: /anti[-\s]*strip/i, keys: ["anti_stripping_agent"] },
  { re: /additive|rejuvenat|warm\s*mix/i, keys: ["additives"] },
  { re: /filler|lime\b|cement\b/i, keys: ["mineral_filler"] },
  { re: /stone\s*dust|quarry\s*dust|\bdust\b|crusher\s*sand|m[-\s]?sand|manufactured\s*sand/i, keys: ["fine_aggregates", "manufactured_sand"] },
  { re: /\bsand\b|fine\s*agg/i, keys: ["fine_aggregates"] },
  { re: /\b(?:6|6\.7|10|13\.2)\s*mm\b.*agg|agg.*\b(?:6|6\.7|10|13\.2)\s*mm\b/i, keys: ["fine_aggregates"] },
  { re: /aggregate|metal|chips|grit/i, keys: ["coarse_aggregates"] },
];

function applyRules(name: string, rules: Array<{ re: RegExp; keys: string[] }>): ResourceMappingResult {
  for (const r of rules) {
    if (r.re.test(name)) return { componentKeys: [...r.keys], source: "registry" };
  }
  return { componentKeys: [], source: "unmapped" };
}

/** Map an equipment name to owning component keys for a category. */
export function mapEquipmentToComponents(category: WorkCategoryKey, equipmentName: string): ResourceMappingResult {
  if (category === "bituminous") return applyRules(equipmentName, BITUMINOUS_EQUIPMENT_RULES);
  return { componentKeys: [], source: "unmapped" }; // earthwork keeps its legacy engine mapping
}

/** Map a labour designation to owning component keys for a category. */
export function mapLabourToComponents(category: WorkCategoryKey, designation: string): ResourceMappingResult {
  if (category === "bituminous") return applyRules(designation, BITUMINOUS_LABOUR_RULES);
  return { componentKeys: [], source: "unmapped" };
}

/** Map a material name to owning component keys for a category. */
export function mapMaterialToComponents(category: WorkCategoryKey, materialName: string): ResourceMappingResult {
  if (category === "bituminous") return applyRules(materialName, BITUMINOUS_MATERIAL_RULES);
  return { componentKeys: [], source: "unmapped" };
}

/** Fuel component for a bituminous equipment resource (028 §20 Fuel). */
export function bituminousFuelComponent(equipmentName: string): string {
  const m = mapEquipmentToComponents("bituminous", equipmentName);
  const k = m.componentKeys[0];
  if (k === "hot_mix_plant" || k === "mix_production" || k === "loading_at_plant" || k === "plant_electricity") return "plant_fuel";
  if (k === "mix_transport" || k === "transport_tippers") return "transport_diesel";
  if (k === "mechanical_sprayer" || k === "surface_cleaning") return "sprayer_fuel";
  return "paving_diesel";
}

// ─── Missing-mapping disclosure (028 §22–23, §33) ─────────────────────────────

export interface DemandComponentMappingWarning {
  code: "DEMAND_COMPONENT_MAPPING_MISSING";
  boqItemId: number;
  componentKey: string;
  componentLabel: string;
  message: string;
}

/**
 * Given a bituminous arrangement's non-company components and the item's actual
 * recipe resources, report responsibility components that have NO corresponding
 * demand resource (do not pretend demand was excluded when none existed).
 */
export function findMissingDemandMappings(
  boqItemId: number,
  components: Record<string, string> | null | undefined,
  recipe: { materials: string[]; equipment: string[]; labour: string[] },
): DemandComponentMappingWarning[] {
  if (!components) return [];
  const mappedComponents = new Set<string>();
  for (const m of recipe.materials) mapMaterialToComponents("bituminous", m).componentKeys.forEach(k => mappedComponents.add(k));
  for (const e of recipe.equipment) {
    mapEquipmentToComponents("bituminous", e).componentKeys.forEach(k => mappedComponents.add(k));
    mappedComponents.add(bituminousFuelComponent(e));
  }
  for (const l of recipe.labour) mapLabourToComponents("bituminous", l).componentKeys.forEach(k => mappedComponents.add(k));

  // Components that carry demand semantics (materials, equipment-ish, labour-ish, fuel)
  const DEMAND_BEARING = new Set<string>([
    ...BITUMINOUS_MATERIAL_COMPONENTS,
    "mix_production", "hot_mix_plant", "loading_at_plant", "plant_operators", "plant_fuel", "plant_electricity",
    "mix_transport", "transport_tippers", "transport_drivers", "transport_diesel",
    "mechanical_sprayer", "spraying_crew", "sprayer_fuel", "surface_cleaning",
    "paver", "paving_crew", "tandem_roller", "pneumatic_tyre_roller", "finish_roller",
    "roller_operators", "paving_diesel",
  ]);

  const out: DemandComponentMappingWarning[] = [];
  for (const [key, resp] of Object.entries(components)) {
    if (!NON_COMPANY_RESPONSIBILITIES.has(resp)) continue;
    if (!DEMAND_BEARING.has(key)) continue;
    if (mappedComponents.has(key)) continue;
    const label = BITUMINOUS_COMPONENT_LABELS[key] ?? key;
    out.push({
      code: "DEMAND_COMPONENT_MAPPING_MISSING",
      boqItemId,
      componentKey: key,
      componentLabel: label,
      message: `Execution responsibility recorded, but the BOQ demand recipe has no mapped ${label} resource.`,
    });
  }
  return out;
}

// ─── Server-side validation helpers (028 §35) ─────────────────────────────────

export function isValidWorkCategory(v: unknown): v is WorkCategoryKey {
  return v === "earthwork" || v === "bituminous";
}

export function isArrangementTypeAllowed(category: string | null | undefined, type: string): boolean {
  return getCategoryDescriptor(category).arrangementTypes.includes(type);
}

export function invalidComponentKeys(category: string | null | undefined, components: Record<string, unknown> | null | undefined): string[] {
  if (!components) return [];
  const allowed = new Set(getCategoryDescriptor(category).componentKeys);
  return Object.keys(components).filter(k => !allowed.has(k));
}

export function isValidBituminousItemType(v: unknown): v is BituminousItemType {
  return typeof v === "string" && (BITUMINOUS_ITEM_TYPES as readonly string[]).includes(v);
}
