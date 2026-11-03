import { describe, expect, it } from "vitest";
import {
  can,
  canAccessRule,
  canLegacySection,
  projectFeaturePermissions,
  type FeatureAccessState,
  type LegacyActor,
} from "../shared/featureAccess";
import { emptyMatrix } from "../shared/permissions";

const user: LegacyActor = { isActive: true, isAdmin: false, isOwner: false };

describe("shared feature access", () => {
  it("uses the legacy matrix unchanged until explicit role setup", () => {
    const legacy = emptyMatrix();
    legacy.site_dprs.view = true;
    const state: FeatureAccessState = { rolesConfigured: false, legacyPermissions: legacy };
    expect(can(user, "dpr", "view", state)).toBe(true);
    expect(can(user, "dpr", "edit", state)).toBe(false);
    expect(projectFeaturePermissions(user, legacy, state, "/site/dashboard")).toBe(legacy);
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

  it("uses the same feature rule for the screen helper and API helper", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { site_requirements: { verify: true, edit: true }, boq_programme: { edit: true } } },
      legacyPermissions: emptyMatrix(),
    };
    const legacy = emptyMatrix();
    const pairs = [
      ["site_req_review_ui", "site_requirements", "verify"],
      ["site_req_status_api", "site_requirements", "edit"],
      ["execution_arrangement_outcome", "boq_programme", "edit"],
    ] as const;
    for (const [rule, feature, action] of pairs) {
      expect(canAccessRule(rule, user, state)).toBe(can(user, feature, action, state));
    }
    expect(canLegacySection(user, legacy, "site_dprs", "edit", state, "/site/requirements")).toBe(true);
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

  it("hides unlicensed features", () => {
    const state: FeatureAccessState = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { estimating: { view: true } } },
      licensedModules: ["roads"],
    };
    expect(can(user, "estimating", "view", state)).toBe(false);
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
