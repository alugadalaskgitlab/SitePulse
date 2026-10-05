import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canExportWholeBill } from "../client/src/components/vendor-bills/wholeBillSnapshot";

describe("whole-bill role precedence", () => {
  for (const canExport of [false, true]) {
    for (const field of [false, true]) {
      for (const admin of [false, true]) {
        for (const owner of [false, true]) {
          it(`reports=${canExport}, field=${field}, admin=${admin}, owner=${owner}`, () => {
            expect(canExportWholeBill(canExport, field, admin, owner))
              .toBe(admin || owner || (canExport && !field));
          });
        }
      }
    }
  }
  it("preserves legacy non-privileged callers", () => {
    expect(canExportWholeBill(true)).toBe(true);
    expect(canExportWholeBill(false)).toBe(false);
    expect(canExportWholeBill(true, true)).toBe(false);
  });
  it("threads both privileged flags into all five screen placements", () => {
    const source = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    const calls = source.match(/<WholeBillExportButtons\b[\s\S]*?\/>/g)!;
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call).toContain("isAdmin={user?.isAdmin}");
      expect(call).toContain("isOwner={user?.isOwner}");
    }
  });
});
