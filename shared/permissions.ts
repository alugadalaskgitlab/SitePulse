// Section catalog and per-section actions used by the user-permissions matrix.
// Section keys are typed const so every reference (storage, routes, UI) is
// compile-time checked.

export const SECTION_KEYS = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  "dashboard",

  // ── Hub navigation (toggle entire domain hubs on/off per user) ───────────
  "hmp_hub",
  "site_hub",
  "reports_hub",
  "stores_hub",
  "finance_hub",
  "masters_hub",
  "admin_hub",
  "rmc_hub",

  // ── Site DPRs ─────────────────────────────────────────────────────────────
  "site_dprs",
  "site_materials",

  // ── Purchase Indents (granular: view / raise / approve) ───────────────────
  "site_procurement",            // legacy broad key — kept for backward compat
  "purchase_indents_view",
  "purchase_indents_raise",
  "purchase_indents_approve",

  // ── Diesel Requirements (granular: view / raise / approve) ────────────────
  "site_diesel",                 // legacy broad key — kept for backward compat
  "diesel_req_view",
  "diesel_req_raise",
  "diesel_req_approve",

  // ── Internal Requisitions / IRN (coming soon) ─────────────────────────────
  "irn_view",
  "irn_raise",
  "irn_approve",

  // ── HMP Plant — Operations ─────────────────────────────────────────────────
  "plant_shift_logs",
  "plant_manpower_review",
  "plant_heating",
  "plant_heating_trends",
  "plant_equipment",
  "plant_generator_logs",
  "plant_maintenance",
  "plant_production",
  "plant_materials",
  "plant_bitumen",
  "plant_ldo",

  // ── HMP Plant — Reports & Ledgers ─────────────────────────────────────────
  "plant_daily_reports",
  "plant_stock",
  "plant_ldo_reconciliation",
  "plant_variance",
  "plant_audit",
  "plant_diesel_proc",

  // ── RMC Module ────────────────────────────────────────────────────────────
  "rmc_operations",              // legacy broad key — kept for backward compat
  "rmc_batch_records",
  "rmc_mix_designs",
  "rmc_cube_tests",
  "rmc_raw_materials",
  "rmc_delivery_challans",
  "rmc_daily_report",

  // ── Vendor Bills (granular: view / raise / verify / approve / aliases) ────
  "vendor_bills",                // legacy broad key — kept for backward compat
  "vendor_bills_view",
  "vendor_bills_raise",
  "vendor_bills_verify",
  "vendor_bills_approve",
  "vendor_bill_aliases",

  // ── Reports ───────────────────────────────────────────────────────────────
  "reports",                     // legacy broad key — kept for backward compat
  "report_management",
  "report_site_purchases",

  // ── Stores ────────────────────────────────────────────────────────────────
  "stores_inventory",

  // ── Rate Calculators & Estimator Portal ───────────────────────────────────
  "estimator_portal",
  "mix_calculator",
  "concrete_calculator",
  "qto_boq",
  "rate_cards",

  // ── Masters ───────────────────────────────────────────────────────────────
  "master_parties",
  "master_materials",
  "master_equipment",
  "master_personnel",

  // ── Admin & System Tools (split from legacy admin_settings) ───────────────
  "admin_settings",              // legacy broad key — kept for backward compat
  "site_management",
  "admin_ldo_tools",
  "admin_ledger_tools",
  "data_sync",

  // ── User & Access Management ──────────────────────────────────────────────
  "user_management",
  "permission_manager",
  "device_approval",
  "push_notifications",

  // ── Legacy card-level keys (kept for backward compat) ─────────────────────
  "hmp_operations",
  "reports_analysis",
  "estimates_manager",
  "app_management",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  // Dashboard
  dashboard: "Home Dashboard",

  // Hub navigation
  hmp_hub: "HMP Hub (entry page)",
  site_hub: "Site Hub (entry page)",
  reports_hub: "Reports Hub (entry page)",
  stores_hub: "Stores Hub (entry page)",
  finance_hub: "Finance Hub (entry page)",
  masters_hub: "Masters Hub (entry page)",
  admin_hub: "Admin Hub (entry page)",
  rmc_hub: "RMC Hub (entry page)",

  // Site
  site_dprs: "Site DPRs — File & View",
  site_materials: "Site Materials Received",

  // Purchase Indents
  site_procurement: "Purchase Indents (legacy)",
  purchase_indents_view: "Purchase Indents — View List",
  purchase_indents_raise: "Purchase Indents — Raise / Submit",
  purchase_indents_approve: "Purchase Indents — Approve / Reject",

  // Diesel Requirements
  site_diesel: "Diesel Requirements (legacy)",
  diesel_req_view: "Diesel Requirements — View List",
  diesel_req_raise: "Diesel Requirements — Raise / Submit",
  diesel_req_approve: "Diesel Requirements — Approve / Reject",

  // IRN
  irn_view: "Internal Requisitions — View",
  irn_raise: "Internal Requisitions — Raise",
  irn_approve: "Internal Requisitions — Approve / Issue",

  // HMP Operations
  plant_shift_logs: "Shift Log — File & View",
  plant_manpower_review: "Shift Log — Manpower Review Report",
  plant_heating: "Heating Sessions — Log & View",
  plant_heating_trends: "Heating Trends Report",
  plant_equipment: "Equipment Usage — Log & View",
  plant_generator_logs: "Generator (DG) Logs",
  plant_maintenance: "Equipment Maintenance Logs",
  plant_production: "Production & Dispatches",
  plant_materials: "Material Receipts / Issues / Returns",
  plant_bitumen: "Bitumen Stock Tracker",
  plant_ldo: "LDO Flow Meter",

  // HMP Reports
  plant_daily_reports: "Daily Plant Reports (single day + PDF bulk)",
  plant_stock: "Material Stock Ledger",
  plant_ldo_reconciliation: "LDO Book vs Physical Reconciliation",
  plant_variance: "Stock Variance Report",
  plant_audit: "Audit Report",
  plant_diesel_proc: "Diesel Procurement Report",

  // RMC
  rmc_operations: "RMC Operations (legacy)",
  rmc_batch_records: "RMC Batch Records",
  rmc_mix_designs: "RMC Mix Designs",
  rmc_cube_tests: "RMC Cube Tests (QC)",
  rmc_raw_materials: "RMC Raw Materials",
  rmc_delivery_challans: "RMC Delivery Challans",
  rmc_daily_report: "RMC Daily Report",

  // Vendor Bills
  vendor_bills: "Vendor Bills (legacy)",
  vendor_bills_view: "Vendor Bills — View List",
  vendor_bills_raise: "Vendor Bills — Raise / Create",
  vendor_bills_verify: "Vendor Bills — Mark Verified",
  vendor_bills_approve: "Vendor Bills — Final Approve / Mark Paid",
  vendor_bill_aliases: "Vendor Aliases (merge duplicate names)",

  // Reports
  reports: "Reports (legacy)",
  report_management: "Management Report",
  report_site_purchases: "Site Purchases Report",

  // Stores
  stores_inventory: "Stores — GRNs, Issues & Ledger",

  // Rate Calculators
  estimator_portal: "Estimator Portal (login + hub)",
  mix_calculator: "Bituminous Mix Rate Calculator",
  concrete_calculator: "Concrete Rate Calculator (v1 & v2)",
  qto_boq: "QTO & BOQ Estimator",
  rate_cards: "Rate Cards — View & Edit",

  // Masters
  master_parties: "Party / Job Master",
  master_materials: "Materials, Mix Types & Templates",
  master_equipment: "Equipment Master",
  master_personnel: "Personnel Master",

  // Admin tools
  admin_settings: "Admin Settings (legacy)",
  site_management: "Sites & Plants — Add / Configure",
  admin_ldo_tools: "LDO Backfill & Reconciliation Tools",
  admin_ledger_tools: "Stock Ledger Rebuild / Reassign / Transfer",
  data_sync: "Data Export / Import (Admin Tool)",

  // User management
  user_management: "User Management — View & Edit Profiles",
  permission_manager: "Manage Permissions for Other Users",
  device_approval: "Device Approval",
  push_notifications: "Push Notification Admin",

  // Legacy card keys
  hmp_operations: "HMP Operations (legacy)",
  reports_analysis: "Reports & Analysis (legacy)",
  estimates_manager: "Estimates Manager (legacy)",
  app_management: "App Management (legacy)",
};

export const ACTIONS = ["view", "create", "edit", "delete", "view_reports", "export", "approve", "notify"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  view_reports: "Reports",
  export: "Export",
  approve: "Approve",
  notify: "Notify",
};

export type SectionPermission = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  view_reports: boolean;
  export: boolean;
  approve: boolean;
  notify: boolean;
};

export type PermissionMatrix = Record<SectionKey, SectionPermission>;

export const EMPTY_PERMISSION: SectionPermission = {
  view: false,
  create: false,
  edit: false,
  delete: false,
  view_reports: false,
  export: false,
  approve: false,
  notify: false,
};

// Notify is intentionally false in FULL_PERMISSION — push alerts must be
// explicitly opted-in per section, even when "Grant all" is clicked.
export const FULL_PERMISSION: SectionPermission = {
  view: true,
  create: true,
  edit: true,
  delete: true,
  view_reports: true,
  export: true,
  approve: true,
  notify: false,
};

export function emptyMatrix(): PermissionMatrix {
  const out = {} as PermissionMatrix;
  for (const k of SECTION_KEYS) out[k] = { ...EMPTY_PERMISSION };
  return out;
}

export function fullMatrix(): PermissionMatrix {
  const out = {} as PermissionMatrix;
  for (const k of SECTION_KEYS) out[k] = { ...FULL_PERMISSION };
  return out;
}

// ── Permission groups for the admin UI ────────────────────────────────────────
// Each group has an id, a display label, and an ordered list of section keys.
export const PERMISSION_GROUPS: { id: string; label: string; sections: SectionKey[] }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    sections: ["dashboard"],
  },
  {
    id: "hubs",
    label: "Hub Navigation (page access)",
    sections: ["hmp_hub", "site_hub", "reports_hub", "stores_hub", "finance_hub", "masters_hub", "admin_hub", "rmc_hub"],
  },
  {
    id: "site",
    label: "Site — DPRs & Materials",
    sections: ["site_dprs", "site_materials"],
  },
  {
    id: "indents",
    label: "Purchase Indents",
    sections: ["purchase_indents_view", "purchase_indents_raise", "purchase_indents_approve"],
  },
  {
    id: "diesel",
    label: "Diesel Requirements",
    sections: ["diesel_req_view", "diesel_req_raise", "diesel_req_approve"],
  },
  {
    id: "irn",
    label: "Internal Requisitions (IRN — coming soon)",
    sections: ["irn_view", "irn_raise", "irn_approve"],
  },
  {
    id: "hmp_ops",
    label: "HMP Plant — Operations",
    sections: [
      "plant_shift_logs", "plant_manpower_review",
      "plant_heating", "plant_heating_trends",
      "plant_equipment", "plant_generator_logs", "plant_maintenance",
      "plant_production",
      "plant_materials",
      "plant_bitumen", "plant_ldo",
    ],
  },
  {
    id: "hmp_reports",
    label: "HMP Plant — Reports & Ledgers",
    sections: [
      "plant_daily_reports", "plant_stock", "plant_ldo_reconciliation",
      "plant_variance", "plant_audit", "plant_diesel_proc",
    ],
  },
  {
    id: "rmc",
    label: "RMC Module",
    sections: [
      "rmc_batch_records", "rmc_mix_designs", "rmc_cube_tests",
      "rmc_raw_materials", "rmc_delivery_challans", "rmc_daily_report",
    ],
  },
  {
    id: "vendor_bills",
    label: "Vendor Bills",
    sections: [
      "vendor_bills_view", "vendor_bills_raise",
      "vendor_bills_verify", "vendor_bills_approve", "vendor_bill_aliases",
    ],
  },
  {
    id: "reports",
    label: "Reports",
    sections: ["report_management", "report_site_purchases"],
  },
  {
    id: "stores",
    label: "Stores & Inventory",
    sections: ["stores_inventory"],
  },
  {
    id: "calculators",
    label: "Rate Calculators & Estimator",
    sections: ["estimator_portal", "mix_calculator", "concrete_calculator", "qto_boq", "rate_cards"],
  },
  {
    id: "masters",
    label: "Masters",
    sections: ["master_parties", "master_materials", "master_equipment", "master_personnel"],
  },
  {
    id: "admin_tools",
    label: "Admin & System Tools",
    sections: ["site_management", "admin_ldo_tools", "admin_ledger_tools", "data_sync"],
  },
  {
    id: "access",
    label: "User & Access Management",
    sections: ["user_management", "permission_manager", "device_approval", "push_notifications"],
  },
  {
    id: "legacy",
    label: "Legacy / Broad Keys (backward compat)",
    sections: [
      "site_procurement", "site_diesel", "vendor_bills", "reports", "admin_settings",
      "hmp_operations", "rmc_operations", "reports_analysis", "estimates_manager", "app_management",
    ],
  },
];

export const SESSION_POLICIES = ["strict", "sticky"] as const;
export type SessionPolicy = (typeof SESSION_POLICIES)[number];

// Session-policy timing constants (minutes / days).
export const STRICT_IDLE_MINUTES = 5;
export const STICKY_MAX_AGE_DAYS = 30;
export const DEVICE_COOKIE_DAYS = 90;

export const SESSION_COOKIE_NAME = "hlc_sess";
export const DEVICE_COOKIE_NAME = "hlc_dev";
