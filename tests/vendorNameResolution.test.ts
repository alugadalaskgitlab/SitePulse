import { describe, expect, it } from "vitest";
import { vendors } from "../shared/schema";
import { resolveVendorNameMatch } from "../server/vendorNameResolution";

function executorFor(masterRows: any[], aliasRows: any[]) {
  return {
    select: () => ({
      from: (table: unknown) => Promise.resolve(table === vendors ? masterRows : aliasRows),
    }),
  };
}

describe("resolveVendorNameMatch", () => {
  it("resolves a known alias to its unique master and returns the alias family", async () => {
    const match = await resolveVendorNameMatch("  ACME   SUPPLY ", executorFor(
      [{ id: 7, name: "ACME MATERIALS" }],
      [{ canonicalName: "ACME MATERIALS", alias: "ACME SUPPLY" }],
    ));

    expect(match?.vendorId).toBe(7);
    expect(match?.canonicalName).toBe("ACME MATERIALS");
    expect(match?.variants).toContain("ACME SUPPLY");
    expect(match?.variants).toContain("ACME MATERIALS");
  });

  it("leaves unknown and ambiguous names unresolved", async () => {
    const masters = [{ id: 7, name: "ACME MATERIALS" }, { id: 8, name: "ACME HARDWARE" }];
    const aliases = [
      { canonicalName: "ACME MATERIALS", alias: "SHARED NAME" },
      { canonicalName: "ACME HARDWARE", alias: "SHARED NAME" },
    ];
    const executor = executorFor(masters, aliases);

    expect(await resolveVendorNameMatch("NOT IN MASTER", executor)).toBeNull();
    expect(await resolveVendorNameMatch("SHARED NAME", executor)).toBeNull();
  });
});
