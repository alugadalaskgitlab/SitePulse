import { describe, expect, it } from "vitest";
import { can, type FeatureAccessState, type FeatureAction, type FeatureId } from "../shared/featureAccess";
import { emptyMatrix } from "../shared/permissions";

const ordinaryUser = { id: 7, isActive: true, isAdmin: false, isOwner: false };

function configuredState(feature: FeatureId, action: FeatureAction, unrelated?: [FeatureId, FeatureAction]): FeatureAccessState {
  return {
    rolesConfigured: true,
    userRoles: [1],
    roleTicks: {
      1: {
        [feature]: { [action]: true },
        ...(unrelated ? { [unrelated[0]]: { [unrelated[1]]: true } } : {}),
      },
    },
    legacyPermissions: emptyMatrix(),
  };
}

describe("independent feature actions", () => {
  it.each([
    ["grn", "cancel", "grn", "edit"],
    ["reports", "export", "reports", "view"],
    ["dpr", "approve", "dpr", "view"],
    ["vendor_bills", "technical_verify", "vendor_bills", "edit"],
    ["vendor_bills", "accounts_verify", "vendor_bills", "approve"],
    ["vendor_bills", "final", "vendor_bills", "accounts_verify"],
  ] as const)("does not let %s %s inherit %s %s", (feature, action, _sameFeature, unrelatedAction) => {
    const state = configuredState(feature, unrelatedAction as FeatureAction, [feature, action]);
    expect(can(ordinaryUser, feature, action, {
      ...state,
      roleTicks: { 1: { [feature]: { [unrelatedAction]: true } } },
    })).toBe(false);
  });

  it.each([
    ["grn", "cancel"],
    ["reports", "export"],
    ["dpr", "approve"],
    ["vendor_bills", "technical_verify"],
    ["vendor_bills", "accounts_verify"],
    ["vendor_bills", "final"],
  ] as const)("allows %s %s with that tick alone", (feature, action) => {
    expect(can(ordinaryUser, feature, action, configuredState(feature, action))).toBe(true);
  });

  it("requires an active signed-in user", () => {
    const state = configuredState("grn", "cancel");
    expect(can(null, "grn", "cancel", state)).toBe(false);
    expect(can({ ...ordinaryUser, isActive: false }, "grn", "cancel", state)).toBe(false);
  });

  it("grants every feature action to Owner, but not to Admin after setup", () => {
    const state = configuredState("grn", "cancel");
    expect(can({ ...ordinaryUser, isOwner: true }, "vendor_bills", "export", state)).toBe(true);
    expect(can({ ...ordinaryUser, isAdmin: true }, "vendor_bills", "export", state)).toBe(false);
  });

  it("preserves legacy Admin access only before roles are configured", () => {
    const admin = { ...ordinaryUser, isAdmin: true };
    expect(can(admin, "vendor_bills", "export", {
      rolesConfigured: false,
      legacyPermissions: emptyMatrix(),
    })).toBe(true);
  });
});
