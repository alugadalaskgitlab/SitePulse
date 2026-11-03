import { describe, expect, it } from "vitest";
import {
  can,
  canLegacySection,
  DEFAULT_ROLE_TICKS,
  featureForPath,
  legacyFeatureTick,
  projectFeaturePermissions,
  SUGGESTED_NEW_ROW_ROLE_TICKS,
  type FeatureAccessState,
  type LegacyActor,
} from "../shared/featureAccess";
import { EDIT_RECORD_TYPE_SECTION, emptyMatrix } from "../shared/permissions";

const user: LegacyActor = { isActive: true, isAdmin: false, isOwner: false };

describe("shared feature access", () => {
  it("keeps report viewing separate from source-feature view, with explicit legacy mappings", () => {
    const legacy = emptyMatrix();
    legacy.site_diesel.view_reports = true;
    legacy.vendor_bills_view.view_reports = true;
    legacy.reports_hub.view_reports = true;

    expect(legacyFeatureTick(legacy, "diesel_issue", "view")).toBe(false);
    expect(legacyFeatureTick(legacy, "vendor_bills", "view")).toBe(true);
    expect(legacyFeatureTick(legacy, "reports", "view")).toBe(true);
  });

  it("uses the legacy matrix unchanged until explicit role setup", () => {
    const legacy = emptyMatrix();
    legacy.site_dprs.view = true;
    const state: FeatureAccessState = { rolesConfigured: false, legacyPermissions: legacy };
    expect(can(user, "dpr", "view", state)).toBe(true);
    expect(can(user, "dpr", "edit", state)).toBe(false);
    expect(projectFeaturePermissions(user, legacy, state, "/site/dashboard")).toBe(legacy);
  });

  it("maps legacy plant shift-log access to HMP/RMC", () => {
    const legacy = emptyMatrix();
    legacy.plant_shift_logs.view = true;
    const state: FeatureAccessState = { rolesConfigured: false, legacyPermissions: legacy };

    expect(legacyFeatureTick(legacy, "hmp_rmc", "view")).toBe(true);
    expect(can(user, "hmp_rmc", "view", state)).toBe(true);
  });

  it("unions role grants and applies personal false overrides", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [10, 20],
      roleTicks: {
        10: { grn: { view: true } },
        20: { grn: { edit: true } },
      },
      personalChanges: { grn: { edit: false } },
      legacyPermissions: emptyMatrix(),
    };
    expect(can(user, "grn", "view", state)).toBe(true);
    expect(can(user, "grn", "edit", state)).toBe(false);
    expect(can(user, "grn", "export", state)).toBe(false);
    expect(canLegacySection(user, emptyMatrix(), "stores_inventory", "view", state, "/stores/grns")).toBe(true);
  });

  it("uses the same feature action for the screen helper and API guard", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { site_requirements: { view: true, verify: true, edit: true }, boq_programme: { edit: true } } },
      legacyPermissions: emptyMatrix(),
    };
    const legacy = emptyMatrix();
    expect(can(user, "site_requirements", "verify", state)).toBe(true);
    expect(canLegacySection(user, legacy, "site_dprs", "view", state, "/site/requirements")).toBe(true);
    expect(can(user, "site_requirements", "edit", state)).toBe(true);
    expect(can(user, "boq_programme", "approve", state)).toBe(false);
  });

  it("keeps requirement allocation grants separate by material, equipment, and labour", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: {
        1: {
          requirement_allocation_material: { view: true, allocate: true },
          requirement_allocation_equipment: { view: true, allocate: false },
          requirement_allocation_labour: { view: false, allocate: false },
          site_requirements: { view: true, edit: true },
        },
      },
      legacyPermissions: emptyMatrix(),
    };
    expect(can(user, "requirement_allocation_material", "allocate", state)).toBe(true);
    expect(can(user, "requirement_allocation_equipment", "view", state)).toBe(true);
    expect(can(user, "requirement_allocation_equipment", "allocate", state)).toBe(false);
    expect(can(user, "requirement_allocation_labour", "view", state)).toBe(false);
    expect(can(user, "requirement_allocation_labour", "allocate", state)).toBe(false);
  });

  it("maps legacy allocation and diesel-requirement grants without broadening the parent or issue feature", () => {
    const legacy = emptyMatrix();
    legacy.stores_inventory.view = true;
    legacy.stores_inventory.create = true;
    legacy.plant_equipment.create = true;
    legacy.labour_management.create = true;
    legacy.diesel_req_view.view = true;
    legacy.diesel_req_raise.create = true;
    legacy.diesel_req_approve.approve = true;
    const state: FeatureAccessState = { rolesConfigured: false, legacyPermissions: legacy };

    expect(can(user, "requirement_allocation_material", "view", state)).toBe(true);
    expect(can(user, "requirement_allocation_material", "allocate", state)).toBe(true);
    expect(can(user, "requirement_allocation_equipment", "allocate", state)).toBe(true);
    expect(can(user, "requirement_allocation_labour", "allocate", state)).toBe(true);
    expect(can(user, "site_requirements", "edit", state)).toBe(false);
    expect(can(user, "diesel_requirement", "view", state)).toBe(true);
    expect(can(user, "diesel_requirement", "add", state)).toBe(true);
    expect(can(user, "diesel_requirement", "approve", state)).toBe(true);
    expect(can(user, "diesel_issue", "add", state)).toBe(true); // stores_inventory remains a diesel-register grant.

    const raiseOnly = emptyMatrix();
    raiseOnly.diesel_req_raise.create = true;
    expect(can(user, "diesel_issue", "add", { rolesConfigured: false, legacyPermissions: raiseOnly })).toBe(false);
  });

  it("keeps new permission rows unticked by default and only presents suggestions", () => {
    const newRows = [
      "requirement_allocation_material",
      "requirement_allocation_equipment",
      "requirement_allocation_labour",
      "diesel_requirement",
    ] as const;
    for (const defaults of Object.values(DEFAULT_ROLE_TICKS)) {
      for (const feature of newRows) expect(defaults[`${feature}.view` as keyof typeof defaults]).toBeUndefined();
    }
    expect(SUGGESTED_NEW_ROW_ROLE_TICKS["Store In-charge"]?.requirement_allocation_material?.allocate).toBe(true);
    expect(featureForPath("/api/diesel-requirements")).toEqual(["diesel_requirement"]);
    const editState: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { diesel_requirement: { edit: true } } },
      legacyPermissions: emptyMatrix(),
    };
    expect(EDIT_RECORD_TYPE_SECTION.diesel_requirement).toBe("diesel_req_raise");
    expect(canLegacySection(
      user, emptyMatrix(), EDIT_RECORD_TYPE_SECTION.diesel_requirement, "edit", editState,
    )).toBe(true);
  });

  it("requires Reports and the source feature for report routes", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { reports: { view: true }, progress_actual: { view: false } } },
      legacyPermissions: emptyMatrix(),
    };
    expect(canLegacySection(user, emptyMatrix(), "reports_hub", "view", state, "/reports/progress")).toBe(false);
    state.roleTicks = { 1: { reports: { view: true }, progress_actual: { view: true } } };
    expect(canLegacySection(user, emptyMatrix(), "reports_hub", "view", state, "/reports/progress")).toBe(true);
  });

  it("uses each report page's own source feature, including plant and site-purchase reports", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: {
        1: {
          reports: { view: true },
          hmp_rmc: { view: false },
          plant_receipts: { view: true },
          purchase_orders: { view: true },
          purchase_indent: { view: false },
        },
      },
      legacyPermissions: emptyMatrix(),
    };
    expect(canLegacySection(user, emptyMatrix(), "plant_heating_trends", "view", state, "/plant/heating-trends")).toBe(false);
    state.roleTicks![1].hmp_rmc = { view: true };
    expect(canLegacySection(user, emptyMatrix(), "plant_heating_trends", "view", state, "/plant/heating-trends")).toBe(true);
    expect(canLegacySection(user, emptyMatrix(), "reports_hub", "view", state, "/reports/site-purchases")).toBe(true);
  });

  it("hides unlicensed features", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { estimating: { view: true } } },
      licensedModules: ["roads"],
    };
    expect(can(user, "estimating", "view", state)).toBe(false);
  });

  it("allows licensed Estimating role ticks for non-Owners while Owners retain their bypass", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { estimating: { view: true, add: true, edit: true } } },
      licensedModules: ["estimating"],
    };
    expect(can(user, "estimating", "view", state)).toBe(true);
    expect(can({ ...user, isOwner: true }, "estimating", "view", state)).toBe(true);
    expect(can(user, "estimating", "view", { ...state, roleTicks: { 1: {} } })).toBe(false);
  });

  it("keeps legacy Admin access only until feature roles are configured", () => {
    const admin: LegacyActor = { isActive: true, isAdmin: true, isOwner: false };
    const legacyState: FeatureAccessState = {
      rolesConfigured: false,
      legacyPermissions: emptyMatrix(),
    };
    const configuredState: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [],
      roleTicks: {},
      legacyPermissions: emptyMatrix(),
    };

    expect(can(admin, "dpr", "edit", legacyState)).toBe(true);
    expect(can(admin, "dpr", "edit", configuredState)).toBe(false);
    expect(can({ ...admin, isOwner: true }, "dpr", "edit", configuredState)).toBe(true);
  });

  it("preserves legacy stock-reconciliation posting for create-authorized users", () => {
    const legacy = emptyMatrix();
    legacy.stock_reconciliation.create = true;
    const state: FeatureAccessState = {
      rolesConfigured: false,
      legacyPermissions: legacy,
    };
    expect(can(user, "issues_stock", "verify", state)).toBe(true);

    const configured: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [],
      roleTicks: {},
      legacyPermissions: legacy,
    };
    expect(can(user, "issues_stock", "verify", configured)).toBe(false);
  });
});
