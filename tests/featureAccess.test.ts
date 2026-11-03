import { describe, expect, it } from "vitest";
import {
  can,
  canLegacySection,
  legacyFeatureTick,
  projectFeaturePermissions,
  type FeatureAccessState,
  type LegacyActor,
} from "../shared/featureAccess";
import { emptyMatrix } from "../shared/permissions";

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

  it("keeps Estimating Owner-only even when licensed and explicitly granted", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { estimating: { view: true, add: true, edit: true } } },
      licensedModules: ["estimating"],
    };
    expect(can(user, "estimating", "view", state)).toBe(false);
    expect(can({ ...user, isOwner: true }, "estimating", "view", state)).toBe(true);
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
