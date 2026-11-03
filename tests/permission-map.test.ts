import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_TICKS,
  FEATURE_ACTIONS,
  FEATURE_GROUPS,
  FEATURES,
  ROLE_NAMES,
} from "../shared/featureAccess";

describe("feature permission catalog", () => {
  it("defines the 28 features, 17 roles, and action columns from ACCESS-02C", () => {
    expect(FEATURES).toHaveLength(28);
    expect(ROLE_NAMES).toHaveLength(17);
    expect(FEATURE_ACTIONS).toEqual([
      "view", "add", "edit", "cancel", "verify", "allocate", "technical_verify",
      "accounts_verify", "approve", "final", "export",
    ]);
    expect(FEATURE_GROUPS.map(group => group.label)).toEqual([
      "Site work", "Stores", "Plant", "Equipment", "Procurement & billing",
      "Planning & client billing", "Office",
    ]);
  });

  it("keeps Estimating unticked in role defaults and RA bills visible but inactive", () => {
    expect(Object.keys(DEFAULT_ROLE_TICKS).every(role =>
      !Object.keys(DEFAULT_ROLE_TICKS[role as keyof typeof DEFAULT_ROLE_TICKS])
        .some(key => key.startsWith("estimating.")),
    )).toBe(true);
    expect(FEATURES.find(feature => feature.id === "ra_bills")?.inactive).toBe(true);
  });

  it("never grants Export by default", () => {
    for (const role of ROLE_NAMES) {
      expect(
        Object.keys(DEFAULT_ROLE_TICKS[role]).some(key => key.endsWith(".export")),
        role,
      ).toBe(false);
    }
  });

  it("keeps the split vendor-bill verification actions", () => {
    expect(FEATURES.find(feature => feature.id === "vendor_bills")?.actions).toContain("technical_verify");
    expect(FEATURES.find(feature => feature.id === "vendor_bills")?.actions).toContain("accounts_verify");
    expect(FEATURES.find(feature => feature.id === "vendor_bills")?.actions).not.toContain("verify");
  });
});
