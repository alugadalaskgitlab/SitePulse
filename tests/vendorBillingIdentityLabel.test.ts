import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vendorBillingIdentityLabel } from "@/components/vendor-bills/vendorBillingIdentityLabel";

describe("VB-TRIP-PULL-01 hire vendor display identity", () => {
  const identities = [{ id: 17, name: "RAVI KUMAR", businessName: "Riverbend Haulage" }];

  it("displays Business Name without mutating canonical identity", () => {
    expect(vendorBillingIdentityLabel("RAVI KUMAR", identities)).toBe("Riverbend Haulage");
    expect(vendorBillingIdentityLabel(" ravi kumar ", identities)).toBe("Riverbend Haulage");
    expect(identities).toEqual([{ id: 17, name: "RAVI KUMAR", businessName: "Riverbend Haulage" }]);
  });

  it("falls back to Master Name for absent, null or blank Business Name", () => {
    for (const businessName of [undefined, null, "", "   "]) {
      expect(vendorBillingIdentityLabel("RAVI KUMAR", [{ id: 17, name: "RAVI KUMAR", businessName }])).toBe("RAVI KUMAR");
    }
  });

  it("does not guess missing or ambiguous Master identities", () => {
    expect(vendorBillingIdentityLabel("ONE-TIME OWNER")).toBe("ONE-TIME OWNER");
    expect(vendorBillingIdentityLabel("RAVI KUMAR", [...identities, { id: 18, name: "RAVI KUMAR", businessName: "Another Haulier" }])).toBe("RAVI KUMAR");
  });

  it("wires display labels only, preserving canonical selection, requests and saved identity", () => {
    const source = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(source).toContain("useQuery<VendorBillingIdentity[]>");
    expect(source).toContain("vendorBillingIdentityLabel(vendor.vendorName, billingIdentities.data)");
    expect(source).toContain("value={(vendorName && isHireVendorDisplay ? selectedHireVendorLabel : vendorName) || vendorSearch}");
    expect(source).toContain("Vendor Master linked: ${selectedHireVendorLabel}");
    expect(source).toContain("setVendorName(vendor.vendorName)");
    expect(source).toContain("setVendorName(name)");
    expect(source).toContain("vendorName=${encodeURIComponent(vendorName)}");
    expect(source).toContain("billingVendorId: matchingBillingIdentities[0].id");
    expect(source).toContain('data-testid="text-vendor-name">{bill.vendorName}');
    expect(source).not.toMatch(/setVendorName\((?:selectedHireVendorLabel|vendorBillingIdentityLabel)/);
  });
});
