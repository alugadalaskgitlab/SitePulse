import { describe, expect, it } from "vitest";
import {
  ACCESS_RULES_V2,
  buildAccessChangesPreview,
  compareAccessRule,
  evaluateAccessRule,
  hasLegacyStaleGrnPushSubscription,
  parseAccessRulesV2Setting,
  type AccessRuleActor,
  type AccessRulePermissions,
} from "../shared/accessRulesV2";

function actor(overrides: Partial<AccessRuleActor> = {}): AccessRuleActor {
  return { id: 9, authenticated: true, isAdmin: false, isOwner: false, isFieldEngineer: false, ...overrides };
}

describe("access_rules_v2 shared decision engine", () => {
  it("defaults a missing or unrecognized setting to OFF", () => {
    expect(parseAccessRulesV2Setting(null)).toBe(false);
    expect(parseAccessRulesV2Setting(undefined)).toBe(false);
    expect(parseAccessRulesV2Setting("")).toBe(false);
    expect(parseAccessRulesV2Setting("enabled")).toBe(false);
    expect(parseAccessRulesV2Setting("TRUE")).toBe(true);
    expect(parseAccessRulesV2Setting("true")).toBe(true);
  });

  it("keeps every check on the legacy result when OFF and the saved-permission result when ON", () => {
    const cases: Array<{ user: AccessRuleActor; permissions: AccessRulePermissions }> = [
      { user: actor({ legacyRole: "manager" }), permissions: { stores_inventory: { view: true, create: false, edit: false, notify: false }, site_dprs: { approve: false, edit: false, view_reports: false } } },
      { user: actor({ isAdmin: true, legacyRole: "admin" }), permissions: {} },
      { user: actor({ isOwner: true, legacyRole: "manager" }), permissions: {} },
      { user: actor({ isFieldEngineer: true, legacyRole: "engineer" }), permissions: { plant_production: { view: true }, vendor_bills: { export: true, view_reports: true }, vendor_financials: { view: false } } },
      { user: actor({ legacyRole: "engineer" }), permissions: { plant_production: { view: true }, site_dprs: { edit: true, approve: true, view_reports: true }, work_programme_review: { edit: true }, stores_inventory: { notify: true } } },
    ];

    for (const sample of cases) {
      for (const { id } of ACCESS_RULES_V2) {
        const comparison = compareAccessRule(id, sample.user, sample.permissions);
        expect(evaluateAccessRule(id, false, sample.user, sample.permissions)).toBe(comparison.current);
        expect(evaluateAccessRule(id, true, sample.user, sample.permissions)).toBe(comparison.proposed);
      }
    }
  });

  it("uses the same ON decision for each paired screen and server check", () => {
    const manager = actor({ legacyRole: "manager" });
    const grants: AccessRulePermissions = {
      stores_inventory: { create: true, edit: true, notify: true },
      plant_equipment: { create: false },
      labour_management: { create: false },
      site_dprs: { edit: true, approve: false, view_reports: true },
      work_programme: { edit: true },
      work_programme_review: { edit: true },
      plant_production: { view: true },
    };
    const pairs = [
      ["site_req_material_button", "site_req_material_api"],
      ["site_req_equipment_button", "site_req_equipment_api"],
      ["site_req_labour_button", "site_req_labour_api"],
      ["site_req_immediate_button", "site_req_immediate_api"],
      ["cutfill_reconciliation_ui", "cutfill_reconciliation_api"],
    ] as const;

    for (const [screenCheck, serverCheck] of pairs) {
      const screenResult = evaluateAccessRule(screenCheck, true, manager, grants);
      const serverResult = evaluateAccessRule(serverCheck, true, manager, grants);
      expect(screenResult).toBe(serverResult);
    }
    expect(evaluateAccessRule("stale_grn_alert", true, manager, grants)).toBe(false);
    expect(evaluateAccessRule("stale_grn_push_audience", true, manager, grants)).toBe(true);
    expect(evaluateAccessRule("home_dispatch_tile", true, manager, grants)).toBe(true);
    expect(evaluateAccessRule("plant_dispatch_summary", true, manager, grants)).toBe(true);
  });

  it("keeps vendor financial visibility special and grants Admin/Owner bypass consistently", () => {
    const admin = actor({ isAdmin: true });
    const owner = actor({ isOwner: true });
    expect(evaluateAccessRule("payables_preview", true, admin, { vendor_bills: { view_reports: true } })).toBe(false);
    expect(evaluateAccessRule("payables_preview", true, owner, { vendor_bills: { view_reports: true } })).toBe(true);
    expect(evaluateAccessRule("payables_preview", true, admin, {
      vendor_bills: { view_reports: true },
      vendor_financials: { view: true },
    })).toBe(true);
    expect(evaluateAccessRule("execution_arrangement_outcome", true, owner, {})).toBe(true);
    expect(evaluateAccessRule("cutfill_reconciliation_api", true, admin, {})).toBe(true);
    expect(evaluateAccessRule("ldo_orphan_cleanup", true, owner, {})).toBe(true);
  });

  it("previews every registered check for every active user", () => {
    const user = {
      ...actor({ legacyRole: null, legacyStaleGrnPushAudience: false }),
      id: 41,
      fullName: "Preview User",
    };
    const preview = buildAccessChangesPreview([{ user, permissions: {} }]);
    expect(preview).toHaveLength(1);
    expect(preview[0].changes.map(row => row.id)).toEqual(ACCESS_RULES_V2.map(rule => rule.id));
    const current = new Map(preview[0].changes.map(row => [row.id, row.current]));
    for (const id of [
      "site_req_review_ui",
      "site_req_status_api",
      "site_req_allocation_api",
      "site_req_execution_summary",
      "site_req_outcome",
      "execution_arrangement_outcome",
      "cutfill_reconciliation_ui",
      "cutfill_reconciliation_api",
      "ldo_orphan_cleanup",
      "stale_grn_push_audience",
    ] as const) {
      expect(current.get(id), id).toBe(false);
    }
  });

  it("derives the legacy stale-GRN audience from stored subscription roles, not Admin status", () => {
    const subscriptions = [
      { userId: 41, role: "manager" },
      { userId: 42, role: "admin" },
      { userId: 43, role: "engineer" },
      { userId: null, role: "manager" },
    ];
    expect(hasLegacyStaleGrnPushSubscription(41, subscriptions)).toBe(true);
    expect(hasLegacyStaleGrnPushSubscription(42, subscriptions)).toBe(true);
    expect(hasLegacyStaleGrnPushSubscription(43, subscriptions)).toBe(false);
    expect(hasLegacyStaleGrnPushSubscription(44, subscriptions)).toBe(false);

    const subscribedManager = {
      ...actor({
        legacyRole: null,
        legacyStaleGrnPushAudience: hasLegacyStaleGrnPushSubscription(41, subscriptions),
      }),
      id: 41,
      fullName: "Subscribed Manager",
    };
    const subscribedPreview = buildAccessChangesPreview([{ user: subscribedManager, permissions: {} }]);
    expect(subscribedPreview[0].changes.find(row => row.id === "stale_grn_push_audience")?.current).toBe(true);

    const adminWithoutSubscription = {
      ...actor({ isAdmin: true, legacyRole: null, legacyStaleGrnPushAudience: false }),
      id: 45,
      fullName: "Admin Without Subscription",
    };
    const preview = buildAccessChangesPreview([{ user: adminWithoutSubscription, permissions: {} }]);
    expect(preview[0].changes.find(row => row.id === "stale_grn_push_audience")?.current).toBe(false);
  });
});
