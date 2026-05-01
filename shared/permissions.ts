// Section catalog and per-section actions used by the user-permissions matrix.
// Section keys are typed const so every reference (storage, routes, UI) is
// compile-time checked.

export const SECTION_KEYS = [
  "dashboard",
  "site_dprs",
  "site_materials",
  "site_procurement",
  "site_diesel",
  "plant_shift_logs",
  "plant_heating",
  "plant_equipment",
  "plant_stock",
  "plant_production",
  "plant_materials",
  "plant_daily_reports",
  "plant_variance",
  "plant_audit",
  "plant_diesel_proc",
  "plant_bitumen",
  "plant_ldo",
  "vendor_bills",
  "reports",
  "admin_settings",
  "master_parties",
  "master_materials",
  "master_equipment",
  "master_personnel",
  "user_management",
  "device_approval",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  dashboard: "Dashboard",
  site_dprs: "Site DPRs",
  site_materials: "Site Materials",
  site_procurement: "Site Procurement (Indents)",
  site_diesel: "Site Diesel Requirements",
  plant_shift_logs: "Shift Log",
  plant_heating: "Heating Sessions",
  plant_equipment: "Equipment Usage",
  plant_stock: "Stock Balances & Ledger",
  plant_production: "Production & Dispatches",
  plant_materials: "Material Receipts / Issues / Returns",
  plant_daily_reports: "Daily Plant Reports",
  plant_variance: "Variance Report",
  plant_audit: "Audit Report",
  plant_diesel_proc: "Diesel Procurement",
  plant_bitumen: "Bitumen Stock Tracker",
  plant_ldo: "LDO Flow Meter",
  vendor_bills: "Vendor Bills",
  reports: "Reports",
  admin_settings: "Admin Settings (Sites, Rate Cards, Tools)",
  master_parties: "Party / Job Master",
  master_materials: "Materials, Mix Types & Templates",
  master_equipment: "Equipment Master",
  master_personnel: "Personnel Master",
  user_management: "User Management",
  device_approval: "Device Approval",
};

export const ACTIONS = ["view", "create", "edit", "delete", "view_reports", "export"] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  view_reports: "View Reports",
  export: "Export",
};

export type SectionPermission = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  view_reports: boolean;
  export: boolean;
};

export type PermissionMatrix = Record<SectionKey, SectionPermission>;

export const EMPTY_PERMISSION: SectionPermission = {
  view: false,
  create: false,
  edit: false,
  delete: false,
  view_reports: false,
  export: false,
};

export const FULL_PERMISSION: SectionPermission = {
  view: true,
  create: true,
  edit: true,
  delete: true,
  view_reports: true,
  export: true,
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


export const SESSION_POLICIES = ["strict", "sticky"] as const;
export type SessionPolicy = (typeof SESSION_POLICIES)[number];

// Session-policy timing constants (minutes / days).
export const STRICT_IDLE_MINUTES = 5;
export const STICKY_MAX_AGE_DAYS = 30;
export const DEVICE_COOKIE_DAYS = 90;

export const SESSION_COOKIE_NAME = "hlc_sess";
export const DEVICE_COOKIE_NAME = "hlc_dev";
