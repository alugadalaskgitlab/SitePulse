import type { Action, PermissionMatrix, SectionKey } from "./permissions";
import { canViewVendorFinancials } from "./vendorFinancialAccess";

export const ACCESS_RULES_V2_SETTING_KEY = "access_rules_v2";

export type AccessRuleId =
  | "dashboard_nav"
  | "hmp_nav"
  | "rmc_nav"
  | "masters_nav"
  | "settings_nav"
  | "reports_hub_content"
  | "plant_admin_guide"
  | "plant_dispatch_summary"
  | "plant_project_report"
  | "stale_grn_alert"
  | "grn_acceptance_edit"
  | "home_dispatch_tile"
  | "payables_preview"
  | "whole_bill_export"
  | "site_req_review_ui"
  | "site_req_status_api"
  | "site_req_allocation_api"
  | "site_req_material_button"
  | "site_req_equipment_button"
  | "site_req_labour_button"
  | "site_req_immediate_button"
  | "site_req_material_api"
  | "site_req_equipment_api"
  | "site_req_labour_api"
  | "site_req_immediate_api"
  | "site_req_execution_summary"
  | "site_req_outcome"
  | "execution_arrangement_outcome"
  | "cutfill_reconciliation_ui"
  | "cutfill_reconciliation_api"
  | "ldo_orphan_cleanup"
  | "stale_grn_push_audience";

export type AccessRuleActor = {
  id?: number;
  isAdmin?: boolean;
  isOwner?: boolean;
  isFieldEngineer?: boolean;
  businessRole?: string | null;
  /** The legacy app user.role / req.session.role value, if one exists. */
  legacyRole?: string | null;
  /** Legacy stale-GRN push eligibility comes from stored subscription roles. */
  legacyStaleGrnPushAudience?: boolean;
  authenticated?: boolean;
};

export type AccessRulePermissions = Partial<PermissionMatrix> &
  Record<string, Partial<Record<Action, boolean>> | undefined>;

export type AccessRuleDecision = {
  id: AccessRuleId;
  label: string;
  current: boolean;
  proposed: boolean;
  outcome: "GAIN" | "LOSE" | "UNCHANGED";
};

export const ACCESS_RULES_V2: ReadonlyArray<{ id: AccessRuleId; label: string }> = [
  { id: "dashboard_nav", label: "Dashboard navigation" },
  { id: "hmp_nav", label: "HMP navigation" },
  { id: "rmc_nav", label: "RMC navigation" },
  { id: "masters_nav", label: "Masters navigation" },
  { id: "settings_nav", label: "Settings navigation" },
  { id: "reports_hub_content", label: "Reports Hub reports section" },
  { id: "plant_admin_guide", label: "Plant Admin Guide export" },
  { id: "plant_dispatch_summary", label: "Plant dispatch-summary tile" },
  { id: "plant_project_report", label: "Plant-Project Dispatch Summary" },
  { id: "stale_grn_alert", label: "Stale-GRN alert" },
  { id: "grn_acceptance_edit", label: "GRN acceptance editing" },
  { id: "home_dispatch_tile", label: "Dashboard Dispatches Today tile" },
  { id: "payables_preview", label: "Vendor payables preview" },
  { id: "whole_bill_export", label: "Whole-bill Excel/PDF export controls" },
  { id: "site_req_review_ui", label: "Site Requirement review controls" },
  { id: "site_req_status_api", label: "Site Requirement status API" },
  { id: "site_req_allocation_api", label: "Site Requirement allocation API" },
  { id: "site_req_material_button", label: "Site Requirement material status control" },
  { id: "site_req_equipment_button", label: "Site Requirement equipment status control" },
  { id: "site_req_labour_button", label: "Site Requirement labour status control" },
  { id: "site_req_immediate_button", label: "Site Requirement immediate status control" },
  { id: "site_req_material_api", label: "Site Requirement material-status API" },
  { id: "site_req_equipment_api", label: "Site Requirement equipment-status API" },
  { id: "site_req_labour_api", label: "Site Requirement labour-status API" },
  { id: "site_req_immediate_api", label: "Site Requirement immediate-status API" },
  { id: "site_req_execution_summary", label: "Site Requirement execution summary" },
  { id: "site_req_outcome", label: "Site Requirement execution outcome" },
  { id: "execution_arrangement_outcome", label: "Execution Arrangement outcome controls/API" },
  { id: "cutfill_reconciliation_ui", label: "Cut/fill reconciliation controls" },
  { id: "cutfill_reconciliation_api", label: "Cut/fill reconciliation write API" },
  { id: "ldo_orphan_cleanup", label: "LDO orphan cleanup control/API" },
  { id: "stale_grn_push_audience", label: "Stale-GRN push audience eligibility" },
];

const ACCESS_RULE_LABELS = new Map(ACCESS_RULES_V2.map(rule => [rule.id, rule.label]));

function loggedIn(actor: AccessRuleActor | null | undefined): boolean {
  return !!actor && actor.authenticated !== false;
}

function roleIs(actor: AccessRuleActor | null | undefined, ...roles: string[]): boolean {
  const role = String(actor?.legacyRole ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return roles.includes(role);
}

function ordinaryAction(
  actor: AccessRuleActor | null | undefined,
  permissions: AccessRulePermissions | null | undefined,
  section: string,
  action: Action,
): boolean {
  if (!loggedIn(actor)) return false;
  if (section === "vendor_financials") {
    return action === "view" && canViewVendorFinancials(actor, permissions as Partial<PermissionMatrix> | undefined);
  }
  if (actor?.isAdmin || actor?.isOwner) return true;
  return permissions?.[section]?.[action] === true;
}

function anyAction(
  actor: AccessRuleActor | null | undefined,
  permissions: AccessRulePermissions | null | undefined,
  options: Array<[string, Action]>,
): boolean {
  return options.some(([section, action]) => ordinaryAction(actor, permissions, section, action));
}

function legacyManagerOrAdmin(actor: AccessRuleActor | null | undefined): boolean {
  return roleIs(actor, "admin", "manager");
}

function legacyProjectManager(actor: AccessRuleActor | null | undefined): boolean {
  return roleIs(actor, "admin", "manager", "pm", "project_manager");
}

function v2Allowed(
  id: AccessRuleId,
  actor: AccessRuleActor | null | undefined,
  permissions: AccessRulePermissions | null | undefined,
): boolean {
  switch (id) {
    case "dashboard_nav":
      return ordinaryAction(actor, permissions, "dashboard", "view");
    case "hmp_nav":
      return ordinaryAction(actor, permissions, "hmp_hub", "view");
    case "rmc_nav":
      return ordinaryAction(actor, permissions, "rmc_hub", "view");
    case "masters_nav":
      return ordinaryAction(actor, permissions, "masters_hub", "view");
    case "settings_nav":
      return ordinaryAction(actor, permissions, "admin_hub", "view");
    case "reports_hub_content":
      return ordinaryAction(actor, permissions, "reports_hub", "view");
    case "plant_admin_guide":
      return ordinaryAction(actor, permissions, "admin_settings", "export");
    case "plant_dispatch_summary":
    case "plant_project_report":
    case "home_dispatch_tile":
      return ordinaryAction(actor, permissions, "plant_production", "view");
    case "stale_grn_alert":
      return ordinaryAction(actor, permissions, "stores_inventory", "view");
    case "grn_acceptance_edit":
      return ordinaryAction(actor, permissions, "stores_inventory", "edit");
    case "payables_preview":
      return anyAction(actor, permissions, [
        ["vendor_bills", "view_reports"],
        ["vendor_bills_view", "view_reports"],
      ]) && ordinaryAction(actor, permissions, "vendor_financials", "view");
    case "whole_bill_export":
      return anyAction(actor, permissions, [
        ["vendor_bills", "export"],
        ["vendor_bills_view", "export"],
      ]);
    case "site_req_review_ui":
    case "site_req_outcome":
      return ordinaryAction(actor, permissions, "site_dprs", "approve");
    case "site_req_status_api":
    case "site_req_allocation_api":
      return ordinaryAction(actor, permissions, "site_dprs", "edit");
    case "site_req_material_button":
    case "site_req_material_api":
      return ordinaryAction(actor, permissions, "stores_inventory", "create");
    case "site_req_equipment_button":
    case "site_req_equipment_api":
      return ordinaryAction(actor, permissions, "plant_equipment", "create");
    case "site_req_labour_button":
    case "site_req_labour_api":
      return ordinaryAction(actor, permissions, "labour_management", "create");
    case "site_req_immediate_button":
    case "site_req_immediate_api":
      return anyAction(actor, permissions, [
        ["stores_inventory", "create"],
        ["plant_equipment", "create"],
      ]);
    case "site_req_execution_summary":
      return ordinaryAction(actor, permissions, "site_dprs", "view_reports");
    case "execution_arrangement_outcome":
      return ordinaryAction(actor, permissions, "work_programme", "edit");
    case "cutfill_reconciliation_ui":
    case "cutfill_reconciliation_api":
      return ordinaryAction(actor, permissions, "work_programme_review", "edit");
    case "ldo_orphan_cleanup":
      return loggedIn(actor) && (!!actor?.isAdmin || !!actor?.isOwner);
    case "stale_grn_push_audience":
      return ordinaryAction(actor, permissions, "stores_inventory", "notify");
  }
}

function legacyAllowed(
  id: AccessRuleId,
  actor: AccessRuleActor | null | undefined,
  permissions: AccessRulePermissions | null | undefined,
): boolean {
  switch (id) {
    case "dashboard_nav":
    case "hmp_nav":
    case "rmc_nav":
    case "plant_dispatch_summary":
    case "plant_project_report":
    case "stale_grn_alert":
    case "grn_acceptance_edit":
    case "reports_hub_content":
      return loggedIn(actor);
    case "masters_nav":
      return loggedIn(actor) && (!!actor?.isAdmin || anyAction(actor, permissions, [
        ["master_parties", "view"],
        ["master_materials", "view"],
        ["master_equipment", "view"],
        ["master_personnel", "view"],
      ]));
    case "settings_nav":
      return loggedIn(actor) && !!actor?.isAdmin;
    case "plant_admin_guide":
      return ordinaryAction(actor, permissions, "admin_settings", "export");
    case "home_dispatch_tile":
      return loggedIn(actor) && !actor?.isFieldEngineer;
    case "payables_preview":
      return loggedIn(actor)
        && !actor?.isFieldEngineer
        && anyAction(actor, permissions, [
          ["vendor_bills", "view_reports"],
          ["vendor_bills_view", "view_reports"],
        ])
        && ordinaryAction(actor, permissions, "vendor_financials", "view");
    case "whole_bill_export":
      return loggedIn(actor)
        && (!!actor?.isAdmin || !!actor?.isOwner || (
          !actor?.isFieldEngineer
          && anyAction(actor, permissions, [
            ["vendor_bills", "export"],
            ["vendor_bills_view", "export"],
          ])
        ));
    case "site_req_review_ui":
      return legacyManagerOrAdmin(actor);
    case "site_req_status_api":
    case "site_req_allocation_api":
    case "site_req_execution_summary":
    case "site_req_outcome":
      return legacyManagerOrAdmin(actor);
    case "site_req_material_button":
      return ordinaryAction(actor, permissions, "stores_inventory", "view") || roleIs(actor, "admin", "manager");
    case "site_req_equipment_button":
      return ordinaryAction(actor, permissions, "plant_equipment", "view") || roleIs(actor, "admin", "manager");
    case "site_req_labour_button":
      return ordinaryAction(actor, permissions, "labour_management", "view") || roleIs(actor, "admin", "manager");
    case "site_req_immediate_button":
      return ordinaryAction(actor, permissions, "stores_inventory", "view")
        || ordinaryAction(actor, permissions, "plant_equipment", "view")
        || roleIs(actor, "admin", "manager");
    case "site_req_material_api":
      return ordinaryAction(actor, permissions, "stores_inventory", "create") || roleIs(actor, "manager");
    case "site_req_equipment_api":
      return ordinaryAction(actor, permissions, "plant_equipment", "create") || roleIs(actor, "manager");
    case "site_req_labour_api":
      return ordinaryAction(actor, permissions, "labour_management", "create") || roleIs(actor, "manager");
    case "site_req_immediate_api":
      return ordinaryAction(actor, permissions, "stores_inventory", "create")
        || ordinaryAction(actor, permissions, "plant_equipment", "create")
        || roleIs(actor, "manager");
    case "execution_arrangement_outcome":
      return loggedIn(actor) && (!!actor?.isAdmin || !!actor?.isOwner || legacyProjectManager(actor));
    case "cutfill_reconciliation_ui":
      return loggedIn(actor) && (!!actor?.isAdmin || legacyProjectManager(actor));
    case "cutfill_reconciliation_api":
      return ordinaryAction(actor, permissions, "work_programme_review", "edit")
        && (!!actor?.isAdmin || legacyProjectManager(actor));
    case "ldo_orphan_cleanup":
      return loggedIn(actor) && roleIs(actor, "admin");
    case "stale_grn_push_audience":
      return loggedIn(actor) && actor?.legacyStaleGrnPushAudience === true;
  }
}

export function evaluateAccessRule(
  id: AccessRuleId,
  enabled: boolean,
  actor: AccessRuleActor | null | undefined,
  permissions: AccessRulePermissions | null | undefined,
): boolean {
  return enabled
    ? v2Allowed(id, actor, permissions)
    : legacyAllowed(id, actor, permissions);
}

export function compareAccessRule(
  id: AccessRuleId,
  actor: AccessRuleActor,
  permissions: AccessRulePermissions,
): AccessRuleDecision {
  const current = legacyAllowed(id, actor, permissions);
  const proposed = v2Allowed(id, actor, permissions);
  return {
    id,
    label: ACCESS_RULE_LABELS.get(id) ?? id,
    current,
    proposed,
    outcome: current === proposed ? "UNCHANGED" : proposed ? "GAIN" : "LOSE",
  };
}

export function buildAccessChangesPreview<T extends AccessRuleActor & { id: number; fullName: string }>(
  users: Array<{ user: T; permissions: AccessRulePermissions }>,
) {
  return users.map(({ user, permissions }) => ({
    id: user.id,
    fullName: user.fullName,
    isAdmin: !!user.isAdmin,
    isOwner: !!user.isOwner,
    isFieldEngineer: !!user.isFieldEngineer,
    changes: ACCESS_RULES_V2.map(rule => compareAccessRule(rule.id, user, permissions)),
  }));
}

export function parseAccessRulesV2Setting(value: string | null | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

export function getSectionAction(
  permissions: AccessRulePermissions | null | undefined,
  section: SectionKey,
  action: Action,
): boolean {
  return permissions?.[section]?.[action] === true;
}

export function hasLegacyStaleGrnPushSubscription(
  userId: number,
  subscriptions: ReadonlyArray<{ userId: number | null; role: string | null }>,
): boolean {
  return subscriptions.some(subscription =>
    subscription.userId === userId
    && (subscription.role === "manager" || subscription.role === "admin"),
  );
}
