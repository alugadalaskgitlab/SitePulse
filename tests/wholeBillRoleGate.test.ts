import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateAccessRule } from "../shared/accessRulesV2";

describe("whole-bill export access rule", () => {
  for (const canExport of [false, true]) {
    for (const field of [false, true]) {
      for (const admin of [false, true]) {
        for (const owner of [false, true]) {
          it(`setting OFF preserves reports=${canExport}, field=${field}, admin=${admin}, owner=${owner}`, () => {
            expect(evaluateAccessRule("whole_bill_export", false, {
              authenticated: true,
              isFieldEngineer: field,
              isAdmin: admin,
              isOwner: owner,
            }, {
              vendor_bills: { export: canExport },
              vendor_bills_view: { export: false },
            })).toBe(admin || owner || (canExport && !field));
          });
          it(`setting ON follows matrix export for reports=${canExport}, field=${field}, admin=${admin}, owner=${owner}`, () => {
            expect(evaluateAccessRule("whole_bill_export", true, {
              authenticated: true,
              isFieldEngineer: field,
              isAdmin: admin,
              isOwner: owner,
            }, {
              vendor_bills: { export: canExport },
              vendor_bills_view: { export: false },
            })).toBe(admin || owner || canExport);
          });
        }
      }
    }
  }
  it("uses the shared rule for all four screen placements", () => {
    const billSource = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    const buttonSource = readFileSync("client/src/components/vendor-bills/WholeBillExportButtons.tsx", "utf8");
    const calls = billSource.match(/<WholeBillExportButtons\b[\s\S]*?\/>/g)!;
    expect(calls).toHaveLength(4);
    expect(buttonSource).toContain('evaluateAccessRule("whole_bill_export"');
    expect(buttonSource).not.toContain("useAccessRule");
    for (const call of calls) expect(call).toContain("accessRulesV2={accessRulesV2}");
  });
});
