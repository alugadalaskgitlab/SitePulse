import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { billableTripCandidates, isSiteTripTransport, isUnconfirmedTrip } from "./tripCandidateSafety";

describe("trip candidate safety (synthetic fixtures, not live data evidence)", () => {
  const normal = { sourceType: "site_material_trip_material", sourceId: 42, category: "material" };
  const transport = { sourceType: "site_material_trip_transport", sourceId: 43, category: "transport" };
  const unresolved = { sourceType: "site_material_trip_unresolved", sourceId: 44, rolesUnconfirmed: true, category: "other" };
  it("excludes unresolved candidates and leaves normal contracts/reference identities intact", () => {
    const input = [normal, unresolved, transport];
    expect(billableTripCandidates(input)).toEqual([normal, transport]);
    expect(billableTripCandidates(input)[0]).toBe(normal);
    expect(input).toEqual([normal, unresolved, transport]);
  });
  it("fails closed on either unresolved signal, without classifying other rows", () => {
    expect(isUnconfirmedTrip({ sourceType: "site_material_trip_unresolved" })).toBe(true);
    expect(isUnconfirmedTrip({ rolesUnconfirmed: true })).toBe(true);
    expect(isUnconfirmedTrip({ sourceType: "manual", rolesUnconfirmed: false })).toBe(false);
    expect(isSiteTripTransport(transport)).toBe(true);
    expect(isSiteTripTransport(normal)).toBe(false);
  });
});

describe("VendorBills source wiring regression checks (not browser integration)", () => {
  const page = readFileSync(new URL("../../pages/VendorBills.tsx", import.meta.url), "utf8");
  it("uses guarded discovery for group pulls, Pull All and duplicate preflight", () => {
    expect(page).toContain("availableOtherBillItems(billableAutoItems, lineItems, includedHireGroups)");
    expect(page).toContain("availableOtherBillItems(billableAutoItems, [], includedHireGroups)");
    expect(page).toContain("availableOtherItems.map(sourceQualifiedDuplicateBillItemPayload)");
    expect(page).toContain("const billableItems = billableTripCandidates(items)");
    expect(page).toContain("billableItems.map(item => ({ ...item }))");
  });
  it("short-circuits site-trip transport before material conversion regardless of pricing", () => {
    const start = page.indexOf("const priced = applyTransportCard(item, rateCards, vendorName)");
    const end = page.indexOf("if (priced !== item)", start);
    expect(page.slice(start, end)).toContain("if (isSiteTripTransport(item))");
    expect(page.slice(start, end)).toContain("mapped[i] = priced;");
    expect(page.slice(start, end)).toContain("continue;");
    expect(end).toBeLessThan(page.indexOf("selectAutoMaterialRateConversion(item", start));
  });
  it("does not introduce discovery safety filters on saved lineItems", () => {
    expect(page).not.toContain("billableTripCandidates(lineItems)");
    expect(page).not.toContain("lineItems.filter(isUnconfirmedTrip)");
  });
});
