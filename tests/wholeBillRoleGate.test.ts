import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { can } from "../shared/featureAccess";

describe("whole-bill export feature gate", () => {
  it("allows export only when the effective Vendor Bills export tick is granted", () => {
    const user = { isActive: true, isAdmin: false, isOwner: false };
    const state = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { vendor_bills: { export: true } } },
    };
    expect(can(user, "vendor_bills", "export", state)).toBe(true);
    expect(can(user, "vendor_bills", "export", {
      ...state,
      roleTicks: { 1: { vendor_bills: { export: false } } },
    })).toBe(false);
  });

  it("uses the same effective section permission for each bill export placement", () => {
    const billSource = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    const buttonSource = readFileSync("client/src/components/vendor-bills/WholeBillExportButtons.tsx", "utf8");
    const calls = billSource.match(/<WholeBillExportButtons\b[\s\S]*?\/>/g)!;
    expect(calls).toHaveLength(4);
    expect(billSource).toContain('const canExport = featureCan("vendor_bills", "export")');
    expect(buttonSource).toContain("if (!canExport) return null");
    expect(buttonSource).not.toContain("accessRulesV2");
    for (const call of calls) expect(call).toContain("canExport={canExport}");
  });
});
