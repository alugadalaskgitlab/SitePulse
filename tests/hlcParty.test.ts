import { describe, expect, it } from "vitest";
import { resolveHlcParty, resolveOwnCompanyParty } from "../shared/hlcParty";
import { resolveCompanyIdentity } from "../shared/companyIdentity";

describe("resolveHlcParty", () => {
  it("prefers a case-insensitive exact HLC party name", () => {
    expect(resolveHlcParty([
      { id: 10, name: "High Lane Constructions Private Limited" },
      { id: 11, name: " hlc " },
    ])?.id).toBe(11);
  });

  it("uses the unique HIGH LANE match only when exact HLC is absent", () => {
    expect(resolveHlcParty([{ id: 3, name: "High Lane Construction" }])?.id).toBe(3);
    expect(resolveHlcParty([
      { id: 3, name: "High Lane Construction" },
      { id: 4, name: "Other Vendor" },
    ])?.id).toBe(3);
  });

  it("returns no party rather than choosing an ambiguous or unrelated record", () => {
    expect(resolveHlcParty([{ id: 1, name: "Other Vendor" }])).toBeNull();
    expect(resolveHlcParty([
      { id: 2, name: "High Lane Construction" },
      { id: 3, name: "High Lane Logistics" },
    ])).toBeNull();
    expect(resolveHlcParty([
      { id: 4, name: "HLC" },
      { id: 5, name: "HLC" },
    ])).toBeNull();
  });
});

describe("resolveOwnCompanyParty", () => {
  const rows = [
    { id: 1, name: "Contractor One", isActive: 1 },
    { id: 2, name: "High Lane Constructions Pvt Ltd", isActive: 1 },
    { id: 3, name: "Inactive own party", isActive: 0 },
  ];

  it("uses the configured active party id", () => {
    expect(resolveOwnCompanyParty(rows, 1, resolveCompanyIdentity({ companyName: "Acme", companyShortName: "ABC" }))?.id).toBe(1);
  });

  it("uses the legacy name resolver only for an unconfigured HLC installation", () => {
    expect(resolveOwnCompanyParty(rows, null, resolveCompanyIdentity({
      companyName: "High Lane Constructions Pvt Ltd", companyShortName: "HLC",
    }))?.id).toBe(2);
    expect(resolveOwnCompanyParty(rows, null, resolveCompanyIdentity({
      companyName: "Acme Roads", companyShortName: "ABC",
    }))).toBeNull();
  });

  it("does not fall back from an invalid explicit choice or choose the first unrelated party", () => {
    const identity = resolveCompanyIdentity({ companyName: "Acme Roads", companyShortName: "ABC" });
    expect(resolveOwnCompanyParty(rows, 99, identity)).toBeNull();
    expect(resolveOwnCompanyParty(rows, null, identity)).toBeNull();
    expect(resolveOwnCompanyParty(rows, 3, identity)).toBeNull();
  });
});
