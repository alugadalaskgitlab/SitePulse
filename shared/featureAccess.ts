import {
  emptyMatrix,
  fullMatrix,
  SECTION_KEYS,
  type PermissionMatrix,
  type SectionKey,
} from "./permissions";

export const FEATURE_GROUPS = [
  { id: "site_work", label: "Site work" },
  { id: "stores", label: "Stores" },
  { id: "plant", label: "Plant" },
  { id: "equipment", label: "Equipment" },
  { id: "procurement", label: "Procurement & billing" },
  { id: "planning", label: "Planning & client billing" },
  { id: "office", label: "Office" },
] as const;

export const FEATURE_ACTIONS = [
  "view", "add", "edit", "cancel", "verify", "allocate", "technical_verify",
  "accounts_verify", "approve", "final", "export",
] as const;

export type FeatureAction = (typeof FEATURE_ACTIONS)[number];
export type FeatureGroupId = (typeof FEATURE_GROUPS)[number]["id"];
export type EntryScope = "own" | "team" | "all";
export type FeatureId =
  | "dpr" | "labour_attendance" | "site_materials" | "site_requirements"
  | "requirement_allocation_material" | "requirement_allocation_equipment" | "requirement_allocation_labour"
  | "grn" | "issues_stock" | "diesel_issue" | "diesel_requirement"
  | "plant_receipts" | "hmp_rmc"
  | "equipment_usage" | "maintenance"
  | "irn" | "purchase_indent" | "purchase_orders" | "vendor_bills"
  | "rate_cards" | "payables"
  | "boq_programme" | "progress_actual" | "ra_bills"
  | "reports" | "masters" | "users_permissions" | "estimating";

export type FeatureDefinition = {
  id: FeatureId;
  label: string;
  group: FeatureGroupId;
  actions: readonly FeatureAction[];
  license?: "hmp" | "rmc" | "estimating";
  inactive?: boolean;
};

const viewAddEdit = ["view", "add", "edit"] as const;

export const FEATURES: readonly FeatureDefinition[] = [
  { id: "dpr", label: "DPR", group: "site_work", actions: ["view", "add", "edit", "cancel", "verify", "approve", "export"] },
  { id: "labour_attendance", label: "Labour & attendance", group: "site_work", actions: ["view", "add", "edit", "cancel", "verify", "export"] },
  { id: "site_materials", label: "Material received at site", group: "site_work", actions: ["view", "add", "edit", "cancel", "verify", "export"] },
  { id: "site_requirements", label: "Tomorrow's plan & requirements", group: "site_work", actions: ["view", "add", "edit", "cancel", "verify", "approve"] },
  { id: "requirement_allocation_material", label: "Requirement allocation — material", group: "site_work", actions: ["view", "allocate"] },
  { id: "requirement_allocation_equipment", label: "Requirement allocation — equipment", group: "site_work", actions: ["view", "allocate"] },
  { id: "requirement_allocation_labour", label: "Requirement allocation — labour", group: "site_work", actions: ["view", "allocate"] },
  { id: "grn", label: "GRN", group: "stores", actions: ["view", "add", "edit", "cancel", "verify", "export"] },
  { id: "issues_stock", label: "Issues & stock ledger", group: "stores", actions: ["view", "add", "edit", "cancel", "verify", "export"] },
  { id: "diesel_issue", label: "Diesel issue", group: "stores", actions: ["view", "add", "edit", "cancel", "verify", "export"] },
  { id: "diesel_requirement", label: "Diesel requirement", group: "stores", actions: ["view", "add", "edit", "cancel", "verify", "approve", "export"] },
  { id: "plant_receipts", label: "Plant material receipts", group: "plant", actions: ["view", "add", "edit", "cancel", "verify", "export"], license: "hmp" },
  { id: "hmp_rmc", label: "HMP/RMC production & dispatch", group: "plant", actions: ["view", "add", "edit", "cancel", "verify", "export"], license: "hmp" },
  { id: "equipment_usage", label: "Equipment usage", group: "equipment", actions: ["view", "add", "edit", "cancel", "verify", "export"] },
  { id: "maintenance", label: "Maintenance & breakdowns", group: "equipment", actions: ["view", "add", "edit", "cancel", "approve"] },
  { id: "irn", label: "IRN", group: "procurement", actions: ["view", "add", "edit", "cancel", "verify", "approve"] },
  { id: "purchase_indent", label: "PI", group: "procurement", actions: ["view", "add", "edit", "cancel", "verify", "approve", "export"] },
  { id: "purchase_orders", label: "Purchases / POs", group: "procurement", actions: ["view", "add", "edit", "cancel", "verify", "approve", "export"] },
  { id: "vendor_bills", label: "Vendor bills", group: "procurement", actions: ["view", "add", "edit", "cancel", "technical_verify", "accounts_verify", "approve", "final", "export"] },
  { id: "rate_cards", label: "Rate cards & vendor rates", group: "procurement", actions: ["view", "add", "edit", "cancel"] },
  { id: "payables", label: "Payables & vendor financials", group: "procurement", actions: ["view", "export"] },
  { id: "boq_programme", label: "BOQ & work programme", group: "planning", actions: ["view", "add", "edit", "cancel", "approve", "export"] },
  { id: "progress_actual", label: "Progress — planned vs actual", group: "planning", actions: ["view", "add", "edit", "export"] },
  { id: "ra_bills", label: "RA bills", group: "planning", actions: ["view", "add", "edit", "cancel", "verify", "approve", "export"], inactive: true },
  { id: "reports", label: "Reports", group: "office", actions: ["view", "export"] },
  { id: "masters", label: "Masters", group: "office", actions: viewAddEdit },
  { id: "users_permissions", label: "Users & permissions", group: "office", actions: viewAddEdit },
  { id: "estimating", label: "Estimating", group: "office", actions: ["view", "add", "edit", "cancel", "export"], license: "estimating" },
] as const;

export const ROLE_NAMES = [
  "Project Head", "Project Manager", "Sr Engineer", "Site Engineer",
  "Supervisor", "Foreman", "Surveyor", "Store In-charge", "Store Keeper",
  "Plant Engineer", "P&M In-charge", "QC Engineer", "Procurement",
  "QS / Billing", "HR / Site Admin", "Accounts", "Viewer",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
export type FeatureTicks = Partial<Record<FeatureId, Partial<Record<FeatureAction, boolean>>>>;
export type PersonalTickChanges = Partial<Record<FeatureId, Partial<Record<FeatureAction, boolean>>>>;

// Suggestions are not applied by role seeding. They are written only after
// an Owner reviews and confirms the preview in Settings.
export const SUGGESTED_NEW_ROW_ROLE_TICKS: Partial<Record<RoleName, FeatureTicks>> = {
  "Project Head": {
    requirement_allocation_material: { view: true },
    requirement_allocation_equipment: { view: true },
    requirement_allocation_labour: { view: true },
    diesel_requirement: { view: true },
    diesel_issue: { view: true },
  },
  "Project Manager": {
    requirement_allocation_material: { view: true },
    requirement_allocation_equipment: { view: true },
    requirement_allocation_labour: { view: true },
    diesel_requirement: { view: true, approve: true },
    diesel_issue: { view: true },
  },
  "Sr Engineer": {
    diesel_requirement: { view: true, add: true, verify: true },
  },
  "Site Engineer": {
    diesel_requirement: { view: true, add: true },
    diesel_issue: { view: true },
  },
  "Supervisor": {
    diesel_requirement: { view: true, add: true },
    diesel_issue: { view: true },
  },
  "Store In-charge": {
    requirement_allocation_material: { view: true, allocate: true },
    diesel_requirement: { view: true },
    diesel_issue: { view: true, add: true, edit: true, verify: true },
  },
  "Store Keeper": {
    requirement_allocation_material: { view: true },
    diesel_issue: { view: true, add: true },
  },
  "Plant Engineer": {
    requirement_allocation_equipment: { view: true },
    diesel_requirement: { view: true, add: true },
    diesel_issue: { view: true },
  },
  "P&M In-charge": {
    requirement_allocation_equipment: { view: true, allocate: true },
    diesel_requirement: { view: true, verify: true },
    diesel_issue: { view: true },
  },
  "Procurement": {
    requirement_allocation_material: { view: true },
  },
  "HR / Site Admin": {
    requirement_allocation_labour: { view: true, allocate: true },
  },
};

type FeatureKey = `${FeatureId}.${FeatureAction}`;
type RoleDefault = Partial<Record<FeatureKey, true>>;

function ticks(entries: Array<[FeatureId, FeatureAction[]]>): RoleDefault {
  const result: RoleDefault = {};
  for (const [feature, actions] of entries) for (const action of actions) result[`${feature}.${action}`] = true;
  return result;
}

const V = ["view"] as FeatureAction[];
const VA = ["view", "add"] as FeatureAction[];
const VAE = ["view", "add", "edit"] as FeatureAction[];
const VVe = ["view", "verify"] as FeatureAction[];
const VAp = ["view", "approve"] as FeatureAction[];
const VVt = ["view", "technical_verify"] as FeatureAction[];
const VVaF = ["view", "accounts_verify", "final"] as FeatureAction[];

export const DEFAULT_ROLE_TICKS: Record<RoleName, RoleDefault> = {
  "Project Head": ticks([
    ["dpr", V], ["labour_attendance", V], ["site_materials", V], ["site_requirements", V],
    ["grn", V], ["issues_stock", V], ["diesel_issue", V], ["plant_receipts", V], ["hmp_rmc", V],
    ["equipment_usage", V], ["boq_programme", VAp], ["progress_actual", V], ["ra_bills", VAp], ["reports", V], ["masters", V],
  ]),
  "Project Manager": ticks([
    ["dpr", ["view", "verify", "approve"]], ["labour_attendance", ["view", "verify"]],
    ["site_materials", ["view", "verify"]], ["site_requirements", VAp], ["grn", V],
    ["issues_stock", V], ["diesel_issue", V], ["plant_receipts", V], ["hmp_rmc", V],
    ["equipment_usage", VVe], ["maintenance", VAp], ["irn", VAp], ["purchase_indent", VAp],
    ["purchase_orders", VVe], ["vendor_bills", ["view", "approve"]],
    ["boq_programme", ["view", "add", "edit", "approve"]],
    ["progress_actual", ["view", "add", "edit"]], ["ra_bills", ["view", "verify"]],
    ["reports", V], ["masters", V],
  ]),
  "Sr Engineer": ticks([
    ["dpr", ["view", "add", "edit", "verify"]], ["labour_attendance", VVe],
    ["site_materials", VVe], ["site_requirements", ["view", "add", "edit", "verify"]],
    ["issues_stock", V], ["irn", ["view", "add", "verify"]], ["vendor_bills", VVt],
    ["boq_programme", V], ["progress_actual", ["view", "add", "edit"]], ["reports", V],
  ]),
  "Site Engineer": ticks([
    ["dpr", VAE], ["labour_attendance", VAE], ["site_materials", VAE],
    ["site_requirements", VAE], ["issues_stock", V], ["diesel_issue", VA],
    ["equipment_usage", VAE], ["irn", VA], ["purchase_indent", V],
    ["boq_programme", V], ["progress_actual", VA], ["reports", V],
  ]),
  "Supervisor": ticks([
    ["dpr", VA], ["labour_attendance", VA], ["site_materials", VA],
    ["site_requirements", VA], ["diesel_issue", VA], ["equipment_usage", VA],
    ["reports", V],
  ]),
  "Foreman": ticks([
    ["dpr", V], ["labour_attendance", VA], ["site_materials", VA], ["equipment_usage", VA],
  ]),
  "Surveyor": ticks([
    ["dpr", VA], ["site_requirements", VA], ["boq_programme", V],
    ["progress_actual", VAE], ["reports", V],
  ]),
  "Store In-charge": ticks([
    ["site_materials", VVe], ["site_requirements", V], ["grn", ["view", "add", "edit", "cancel", "verify"]],
    ["issues_stock", ["view", "add", "edit", "cancel", "verify"]],
    ["diesel_issue", ["view", "add", "edit", "verify"]],
    ["plant_receipts", ["view", "add", "edit", "verify"]],
    ["irn", VA], ["purchase_indent", VA], ["purchase_orders", V],
    ["reports", V], ["masters", VAE],
  ]),
  "Store Keeper": ticks([
    ["site_materials", VA], ["grn", VA], ["issues_stock", VA], ["diesel_issue", VA],
    ["plant_receipts", VA], ["reports", V],
  ]),
  "Plant Engineer": ticks([
    ["diesel_issue", VA], ["plant_receipts", VVe], ["hmp_rmc", ["view", "add", "edit", "verify"]],
    ["equipment_usage", VAE], ["maintenance", VA], ["reports", V],
  ]),
  "P&M In-charge": ticks([
    ["site_requirements", V], ["diesel_issue", VVe], ["equipment_usage", ["view", "add", "edit", "verify"]],
    ["maintenance", ["view", "add", "edit", "verify"]], ["irn", VA], ["vendor_bills", VVt],
    ["reports", V], ["masters", VAE],
  ]),
  "QC Engineer": ticks([
    ["site_materials", V], ["plant_receipts", V], ["hmp_rmc", V], ["reports", V],
  ]),
  "Procurement": ticks([
    ["site_requirements", V], ["grn", V], ["irn", VVe],
    ["purchase_indent", ["view", "add", "edit", "verify"]],
    ["purchase_orders", ["view", "add", "edit"]],
    ["vendor_bills", ["view", "add", "edit"]],
    ["rate_cards", VAE], ["reports", V], ["masters", VAE],
  ]),
  "QS / Billing": ticks([
    ["site_materials", V], ["equipment_usage", V], ["vendor_bills", ["view", "add", "edit", "technical_verify"]],
    ["rate_cards", V], ["boq_programme", VAE], ["progress_actual", V],
    ["ra_bills", VAE], ["reports", V],
  ]),
  "HR / Site Admin": ticks([
    ["labour_attendance", ["view", "add", "edit", "verify"]],
    ["reports", V], ["masters", VAE], ["users_permissions", VAE],
  ]),
  "Accounts": ticks([
    ["labour_attendance", V], ["grn", V], ["issues_stock", V], ["purchase_indent", V],
    ["purchase_orders", V], ["vendor_bills", VVaF], ["payables", V],
    ["ra_bills", V], ["reports", V],
  ]),
  "Viewer": ticks([
    ["dpr", V], ["labour_attendance", V], ["site_materials", V], ["hmp_rmc", V],
    ["boq_programme", V], ["progress_actual", V], ["reports", V],
  ]),
};

export const LEGACY_FEATURE_KEYS: Readonly<Record<FeatureId, readonly SectionKey[]>> = {
  dpr: ["site_dprs"],
  labour_attendance: ["site_dprs", "plant_manpower_review"],
  site_materials: ["site_materials"],
  site_requirements: ["site_dprs"],
  requirement_allocation_material: ["stores_inventory"],
  requirement_allocation_equipment: ["plant_equipment"],
  requirement_allocation_labour: ["labour_management"],
  grn: ["stores_inventory"],
  issues_stock: ["stores_inventory", "plant_stock", "stock_reconciliation"],
  diesel_issue: ["site_diesel", "stores_inventory"],
  diesel_requirement: ["diesel_req_view", "diesel_req_raise", "diesel_req_approve"],
  plant_receipts: ["plant_materials"],
  hmp_rmc: ["plant_production", "plant_daily_reports", "plant_shift_logs", "rmc_operations", "rmc_batch_records", "rmc_mix_designs", "rmc_cube_tests", "rmc_raw_materials", "rmc_delivery_challans", "rmc_daily_report", "hmp_operations"],
  equipment_usage: ["plant_equipment"],
  maintenance: ["plant_maintenance", "plant_equipment"],
  irn: ["irn_view", "irn_raise", "irn_approve", "stores_inventory"],
  purchase_indent: ["site_procurement", "purchase_indents_view", "purchase_indents_raise", "purchase_indents_approve", "stores_inventory"],
  purchase_orders: ["site_procurement", "purchase_indents_view", "purchase_indents_raise", "purchase_indents_approve"],
  vendor_bills: ["vendor_bills", "vendor_bills_view", "vendor_bills_raise", "vendor_bills_verify", "vendor_bills_approve"],
  rate_cards: ["rate_cards", "vendor_masters_manage"],
  payables: ["vendor_financials", "vendor_bills_view", "vendor_bills"],
  boq_programme: ["qto_boq", "work_programme", "work_programme_review", "planning_masters", "project_scope", "norms_library"],
  progress_actual: ["work_programme_review", "site_dprs"],
  ra_bills: [],
  reports: ["reports", "reports_hub", "report_management", "report_site_purchases", "plant_daily_reports", "plant_variance", "plant_audit", "plant_diesel_proc", "plant_stock", "plant_ldo_reconciliation", "stock_reconciliation", "equipment_performance_report", "rmc_daily_report", "plant_heating_trends", "reports_analysis"],
  masters: ["master_parties", "master_materials", "master_equipment", "master_personnel", "site_management", "sites_plants_manage", "vendor_masters_manage"],
  users_permissions: ["user_management", "permission_manager"],
  estimating: ["estimator_portal", "mix_calculator", "concrete_calculator", "concrete_estimates_manage", "estimates_manager"],
};

export type LegacyActor = {
  isAdmin?: boolean;
  isOwner?: boolean;
  isActive?: boolean;
  isFieldEngineer?: boolean;
  canManagePermissions?: boolean;
  permissionManagerScope?: string | null;
  canUnlockRecords?: boolean;
};

export type FeatureAccessState = {
  rolesConfigured: boolean;
  userRoles?: readonly number[];
  roleTicks?: Readonly<Record<number, FeatureTicks>>;
  personalChanges?: PersonalTickChanges;
  legacyPermissions?: PermissionMatrix;
  licensedModules?: readonly string[];
};

export function legacyFeatureTick(
  matrix: PermissionMatrix | undefined,
  feature: FeatureId,
  action: FeatureAction,
): boolean {
  if (!matrix) return false;
  // Legacy stock-reconciliation posting was guarded by its `create` tick.
  // Preserve that exact behavior for installations that have not configured
  // feature roles yet; the configured role path uses the separate `verify` tick.
  if (feature === "issues_stock" && action === "verify" && matrix.stock_reconciliation?.create) {
    return true;
  }
  const keys = LEGACY_FEATURE_KEYS[feature];
  return keys.some(section => {
    const row = matrix[section];
    if (!row) return false;
    if (action === "view") {
      return row.view || ((feature === "reports" || feature === "vendor_bills") && row.view_reports);
    }
    if (action === "add" || action === "allocate") return row.create;
    if (action === "edit") return row.edit;
    if (action === "cancel") return row.delete;
    if (action === "export") return row.export;
    if (action === "technical_verify") return row.approve && section === "vendor_bills_verify";
    if (action === "accounts_verify" || action === "approve" || action === "final") {
      return row.approve && (section !== "vendor_bills_verify");
    }
    if (action === "verify") {
      return row.approve && section !== "vendor_bills_approve" && section !== "vendor_bills_verify";
    }
    return false;
  });
}

export function isFeatureLicensed(
  feature: FeatureId,
  licensedModules?: readonly string[],
): boolean {
  const definition = FEATURES.find(item => item.id === feature);
  if (!definition?.license || !licensedModules?.length) return true;
  if (definition.license === "hmp") return licensedModules.includes("hmp") || licensedModules.includes("rmc");
  return licensedModules.includes(definition.license);
}

export function can(
  user: LegacyActor | null | undefined,
  feature: FeatureId,
  action: FeatureAction,
  state: FeatureAccessState,
): boolean {
  const definition = FEATURES.find(item => item.id === feature);
  if (!user || user.isActive === false || !definition || definition.inactive ||
      !isFeatureLicensed(feature, state.licensedModules)) return false;
  if (user.isOwner) return true;
  if (user.isAdmin && !state.rolesConfigured) return true;
  if (!state.rolesConfigured) {
    if (feature === "users_permissions" && user.canManagePermissions) {
      return action === "view" || action === "edit" || (action === "add" && user.permissionManagerScope === "full");
    }
    return legacyFeatureTick(state.legacyPermissions, feature, action);
  }

  let granted = (state.userRoles ?? []).some(roleId => state.roleTicks?.[roleId]?.[feature]?.[action] === true);
  const personal = state.personalChanges?.[feature]?.[action];
  if (personal !== undefined) granted = personal;
  return granted;
}

export const FEATURE_ROUTE_ALIASES: Readonly<Partial<Record<SectionKey, readonly FeatureId[]>>> = {
  dashboard: ["dpr"],
  hmp_hub: ["hmp_rmc", "plant_receipts"],
  site_hub: ["dpr", "labour_attendance", "site_materials", "site_requirements", "requirement_allocation_material", "requirement_allocation_equipment", "requirement_allocation_labour"],
  equipment_hub: ["equipment_usage", "maintenance"],
  reports_hub: ["reports"],
  stores_hub: ["grn", "issues_stock", "diesel_issue", "diesel_requirement", "plant_receipts"],
  finance_hub: ["irn", "purchase_indent", "purchase_orders", "vendor_bills", "rate_cards", "payables"],
  masters_hub: ["masters"],
  admin_hub: ["users_permissions"],
  rmc_hub: ["hmp_rmc"],
  site_dprs: ["dpr", "site_requirements", "progress_actual"],
  site_materials: ["site_materials"],
  site_procurement: ["purchase_indent", "purchase_orders"],
  purchase_indents_view: ["purchase_indent", "purchase_orders"],
  purchase_indents_raise: ["purchase_indent", "purchase_orders"],
  purchase_indents_approve: ["purchase_indent", "purchase_orders"],
  site_diesel: ["diesel_issue"],
  diesel_req_view: ["diesel_requirement"],
  diesel_req_raise: ["diesel_requirement"],
  diesel_req_approve: ["diesel_requirement"],
  irn_view: ["irn"],
  irn_raise: ["irn"],
  irn_approve: ["irn"],
  plant_shift_logs: ["hmp_rmc"],
  plant_manpower_review: ["labour_attendance"],
  plant_heating: ["hmp_rmc"],
  plant_heating_trends: ["reports"],
  plant_equipment: ["equipment_usage", "maintenance", "site_requirements", "requirement_allocation_equipment"],
  plant_generator_logs: ["maintenance"],
  plant_maintenance: ["maintenance"],
  plant_production: ["hmp_rmc"],
  plant_materials: ["plant_receipts"],
  plant_bitumen: ["plant_receipts"],
  plant_ldo: ["plant_receipts"],
  plant_daily_reports: ["hmp_rmc", "reports"],
  plant_stock: ["issues_stock", "reports"],
  plant_ldo_reconciliation: ["reports"],
  plant_variance: ["reports"],
  plant_audit: ["reports"],
  plant_diesel_proc: ["reports"],
  stock_reconciliation: ["issues_stock", "reports"],
  equipment_performance_report: ["reports", "equipment_usage"],
  rmc_operations: ["hmp_rmc"],
  rmc_batch_records: ["hmp_rmc"],
  rmc_mix_designs: ["hmp_rmc"],
  rmc_cube_tests: ["hmp_rmc"],
  rmc_raw_materials: ["hmp_rmc"],
  rmc_delivery_challans: ["hmp_rmc"],
  rmc_daily_report: ["hmp_rmc", "reports"],
  vendor_bills: ["vendor_bills", "payables"],
  vendor_bills_view: ["vendor_bills", "payables"],
  vendor_financials: ["payables"],
  vendor_bills_raise: ["vendor_bills"],
  vendor_bills_verify: ["vendor_bills"],
  vendor_bills_approve: ["vendor_bills"],
  vendor_bill_aliases: ["masters"],
  reports: ["reports"],
  report_management: ["reports"],
  report_site_purchases: ["reports"],
  stores_inventory: ["grn", "issues_stock", "diesel_issue", "plant_receipts", "irn", "purchase_indent", "requirement_allocation_material"],
  labour_management: ["site_requirements", "requirement_allocation_labour"],
  estimator_portal: ["estimating"],
  mix_calculator: ["estimating"],
  concrete_calculator: ["estimating"],
  qto_boq: ["boq_programme"],
  planning_masters: ["boq_programme"],
  work_programme: ["boq_programme"],
  work_programme_review: ["boq_programme", "progress_actual"],
  norms_library: ["boq_programme"],
  edit_requests_review: ["users_permissions"],
  project_scope: ["boq_programme"],
  rate_cards: ["rate_cards"],
  master_parties: ["masters"],
  master_materials: ["masters"],
  master_equipment: ["masters"],
  master_personnel: ["masters"],
  admin_settings: ["users_permissions"],
  site_management: ["masters"],
  sites_plants_manage: ["masters"],
  vendor_masters_manage: ["rate_cards", "masters"],
  concrete_estimates_manage: ["estimating"],
  admin_notifications_manage: ["users_permissions"],
  admin_ldo_tools: ["users_permissions"],
  admin_ledger_tools: ["users_permissions"],
  data_sync: ["users_permissions"],
  user_management: ["users_permissions"],
  permission_manager: ["users_permissions"],
  device_approval: ["users_permissions"],
  push_notifications: ["users_permissions"],
  hmp_operations: ["hmp_rmc"],
  reports_analysis: ["reports"],
  estimates_manager: ["estimating"],
  app_management: ["users_permissions"],
};

export function featureForPath(path: string): FeatureId[] {
  const p = path.toLowerCase();
  if (/\/(reports|api\/reports)(\/|$)/.test(p)) return ["reports"];
  if (/\/api\/auth\/users|\/api\/access-control/.test(p)) return ["users_permissions"];
  if (/\/api\/(site-requirements|material-requirements|earthwork-arrangements)/.test(p)) return ["site_requirements"];
  if (/\/api\/(site-material-trips|site-materials|material-logs)/.test(p)) return ["site_materials"];
  if (/\/api\/(labour|labor|attendance|plant-module\/(manpower|shift-log-manpower))/.test(p)) return ["labour_attendance"];
  if (/\/api\/stores\/grns|\/api\/grns/.test(p)) return ["grn"];
  if (/\/api\/stores\/(issues|returns|stock)|\/api\/stock-reconciliation/.test(p)) return ["issues_stock"];
  if (/\/api\/diesel-requirements/.test(p)) return ["diesel_requirement"];
  if (/\/api\/(site-diesel|diesel-issues)/.test(p)) return ["diesel_issue"];
  if (/\/api\/plant-module\/(material-receipts|materials\/receipts)|\/api\/plant\/material-receipts/.test(p)) return ["plant_receipts"];
  if (/\/api\/(rmc|plant-module\/dispatches|plant-module\/production|plant-module\/shift-logs)/.test(p)) return ["hmp_rmc"];
  if (/\/api\/(equipment|plant-module\/equipment-usage|plant\/equipment-usage)/.test(p)) return ["equipment_usage"];
  if (/\/api\/(maintenance|plant-module\/maintenance|plant-module\/breakdowns)/.test(p)) return ["maintenance"];
  if (/\/api\/irn/.test(p)) return ["irn"];
  if (/\/api\/(purchase-indents|purchase-indent-deliveries)/.test(p)) return ["purchase_indent"];
  if (/\/api\/(purchase-orders|purchase-order)/.test(p)) return ["purchase_orders"];
  if (/\/api\/(vendor-bills|hire-bills)/.test(p)) {
    return /payables|financial|payment|statement|ledger|gst-register/.test(p) ? ["payables"] : ["vendor_bills"];
  }
  if (/\/api\/(rate-cards|vendor-rates|transport-rates)/.test(p)) return ["rate_cards"];
  if (/\/api\/(boq|work-programme|planning|norms)/.test(p)) return ["boq_programme"];
  if (/\/api\/(progress|actual-progress|reports\/progress)/.test(p)) return ["progress_actual"];
  if (/\/api\/(reports|report)/.test(p)) return ["reports"];
  if (/\/api\/(masters|parties|plant-materials|equipment-master|personnel)/.test(p)) return ["masters"];
  if (/\/api\/(mix-estimates|price-scenarios|concrete-estimates|estimator)/.test(p)) return ["estimating"];
  if (/\/api\/(admin\/settings|admin\/devices|admin\/data-sync|admin\/edit-requests|admin\/notifications|admin\/ledger|admin\/ldo)/.test(p)) return [];
  if (/\/api\/dprs/.test(p)) return ["dpr"];
  if (/\/(site\/)?(requirements|site-requirements)(\/|$)/.test(p)) return ["site_requirements"];
  if (/\/(site\/)?(materials|site-materials|material-trips)(\/|$)/.test(p)) return ["site_materials"];
  if (/\/(site\/)?(labour|labor|attendance)(\/|$)/.test(p)) return ["labour_attendance"];
  if (/\/(stores\/)?(grn|grns)(\/|$)/.test(p)) return ["grn"];
  if (/\/(stores\/)?(issues|stock-ledger|stock-reconciliation)(\/|$)/.test(p)) return ["issues_stock"];
  if (/\/plant\/diesel-requirements(\/|$)/.test(p)) return ["diesel_requirement"];
  if (/\/(diesel|diesel-requirements)(\/|$)/.test(p)) return ["diesel_issue"];
  if (/\/(plant\/)?(dispatches|production|shift-logs|hmp|rmc)(\/|$)/.test(p)) return ["hmp_rmc"];
  if (/\/plant\/material-receipts(\/|$)/.test(p)) return ["plant_receipts"];
  if (/\/plant\/equipment-usage(\/|$)/.test(p)) return ["equipment_usage"];
  if (/\/plant\/shift-log(\/|$)/.test(p)) return ["hmp_rmc"];
  if (/\/(equipment|fleet)(\/|$)/.test(p)) return p.includes("maintenance") ? ["maintenance"] : ["equipment_usage"];
  if (/\/(maintenance|breakdowns)(\/|$)/.test(p)) return ["maintenance"];
  if (/\/irn(\/|$)/.test(p)) return ["irn"];
  if (/\/(purchase-indents|purchase-indent)(\/|$)/.test(p)) return ["purchase_indent"];
  if (/\/(purchase-orders|purchase-orders)(\/|$)/.test(p)) return ["purchase_orders"];
  if (/\/(vendor-bills|hire-bills)(\/|$)/.test(p)) return p.includes("payable") ? ["payables"] : ["vendor_bills"];
  if (/\/(rate-cards|vendor-rates)(\/|$)/.test(p)) return ["rate_cards"];
  if (/\/(boq|work-programme|work-program|norms)(\/|$)/.test(p)) return ["boq_programme"];
  if (/\/(progress|actual-progress)(\/|$)/.test(p)) return ["progress_actual"];
  if (/\/(masters|parties|materials-master|equipment-master|personnel)(\/|$)/.test(p)) return ["masters"];
  if (/\/(estimator|mix-calculator|concrete-calculator|mix-estimates)(\/|$)/.test(p)) return ["estimating"];
  if (/\/(site|dprs|daily-report)(\/|$)/.test(p)) return ["dpr"];
  return [];
}

function reportSourceForPath(path: string): FeatureId | null {
  const p = path.toLowerCase();
  if (/vendor|payable|gst|financial/.test(p)) return "payables";
  if (/equipment|fleet|hire/.test(p)) return "equipment_usage";
  if (/site.*material|material.*site/.test(p)) return "site_materials";
  if (/ldo/.test(p)) return "plant_receipts";
  if (/plant.*(material|receipt)|material.*plant|receipt/.test(p)) return "plant_receipts";
  if (/labour|labor|attendance/.test(p)) return "labour_attendance";
  if (/diesel/.test(p)) return "diesel_issue";
  if (/grn|stock|issue|stores|audit|variance/.test(p)) return "issues_stock";
  if (/site-purchases|purchase-orders?/.test(p)) return "purchase_orders";
  if (/purchase|procurement|irn/.test(p)) return "purchase_indent";
  if (/plant|hmp|rmc|dispatch|shift|production|heating/.test(p)) return "hmp_rmc";
  if (/progress|programme|boq/.test(p)) return "progress_actual";
  if (/site|dpr|daily/.test(p)) return "dpr";
  return null;
}

export function featureActionsFromLegacy(action: string, path?: string): FeatureAction[] {
  const normalizedPath = (path ?? "").toLowerCase();
  if (normalizedPath.includes("technical-verify") || normalizedPath.includes("technical_verify")) return ["technical_verify"];
  if (normalizedPath.includes("accounts-verify") || normalizedPath.includes("accounts_verify")) return ["accounts_verify"];
  if (normalizedPath.endsWith("/final") || normalizedPath.includes("/finalise") || normalizedPath.includes("/finalize")) return ["final"];
  if (action === "view") return ["view"];
  if (action === "create" || action === "add") return ["add"];
  if (action === "edit") return ["edit"];
  if (action === "delete" || action === "cancel") return ["cancel"];
  if (action === "export") return ["export"];
  if (action === "approve") return ["approve"];
  if (action === "verify") return ["verify"];
  return [];
}

export function canLegacySection(
  user: LegacyActor | null | undefined,
  matrix: PermissionMatrix | undefined,
  section: SectionKey,
  action: string,
  state: FeatureAccessState,
  path?: string,
): boolean {
  const pathFeatures = path ? featureForPath(path) : [];
  const sectionFeatures = FEATURE_ROUTE_ALIASES[section] ?? [];
  const relevantPathFeatures = pathFeatures.filter(feature => sectionFeatures.includes(feature));
  const candidates = relevantPathFeatures.length ? relevantPathFeatures : sectionFeatures;
  const requestedActions = featureActionsFromLegacy(action, path);
  const reportOnlySections = new Set<SectionKey>([
    "plant_heating_trends", "plant_daily_reports", "plant_ldo_reconciliation",
    "plant_variance", "plant_audit", "plant_diesel_proc",
    "equipment_performance_report", "rmc_daily_report", "report_site_purchases",
    "reports_analysis",
  ]);
  const reportArea = !!path && (
    /\/(reports|api\/reports)(\/|$)/i.test(path) || reportOnlySections.has(section)
  );
  if (reportArea) {
    const accessState = { ...state, legacyPermissions: matrix ?? state.legacyPermissions };
    if (action !== "view" && action !== "export") return false;
    if (!can(user, "reports", "view", accessState)) return false;
    if (action === "export" && !can(user, "reports", "export", accessState)) return false;
    const source = path ? reportSourceForPath(path) : null;
    if (source) return can(user, source, "view", accessState);
    const reportSources: FeatureId[] = [
      "dpr", "labour_attendance", "site_materials", "grn", "issues_stock", "diesel_issue",
      "plant_receipts", "hmp_rmc", "equipment_usage", "maintenance", "purchase_indent",
      "purchase_orders", "vendor_bills", "payables", "boq_programme", "progress_actual",
    ];
    const aliasedSources = candidates.filter(feature => feature !== "reports");
    const requiredSources = aliasedSources.length ? aliasedSources : reportSources;
    return requiredSources.some(sourceFeature => can(user, sourceFeature, "view", accessState));
  }
  if (candidates.length) {
    // Some operational sections historically shared a Reports key. That
    // alias must not turn a Reports tick into access to the operational API.
    const operationalCandidates = candidates.filter(feature => feature !== "reports");
    const actionCandidates = operationalCandidates.length ? operationalCandidates : candidates;
    return actionCandidates.some(feature =>
      requestedActions.some(featureAction =>
        can(user, feature, featureAction, { ...state, legacyPermissions: matrix ?? state.legacyPermissions }),
      ),
    );
  }
  if (!user || user.isActive === false) return false;
  if (user.isOwner || (user.isAdmin && !state.rolesConfigured)) return true;
  const legacy = matrix?.[section];
  if (!state.rolesConfigured) {
    if (!legacy) return false;
    const legacyAction = action === "add" ? "create" : action === "cancel" ? "delete" : action;
    return !!(legacy as Record<string, boolean>)[legacyAction];
  }
  return false;
}

export function projectFeaturePermissions(
  user: LegacyActor | null | undefined,
  legacyMatrix: PermissionMatrix,
  state: FeatureAccessState,
  path?: string,
): PermissionMatrix {
  if (!state.rolesConfigured) {
    return user?.isAdmin || user?.isOwner ? fullMatrix() : legacyMatrix;
  }
  if (user?.isOwner) return fullMatrix();
  const projected = emptyMatrix();
  const pathFeatures = path ? featureForPath(path) : [];
  for (const section of SECTION_KEYS) {
    const aliases = FEATURE_ROUTE_ALIASES[section] ?? [];
    const matched = pathFeatures.filter(feature => aliases.includes(feature));
    const features = matched.length ? matched : aliases;
    for (const feature of features) {
      const allowed = (action: FeatureAction) => can(user, feature, action, state);
      const row = projected[section];
      row.view ||= allowed("view");
      row.create ||= allowed("add");
      row.edit ||= allowed("edit");
      row.delete ||= allowed("cancel");
      row.export ||= allowed("export");
      row.approve ||= allowed("approve") || allowed("verify") ||
        allowed("technical_verify") || allowed("accounts_verify") || allowed("final");
      if (feature === "reports") row.view_reports ||= allowed("view");
    }
  }
  return projected;
}
