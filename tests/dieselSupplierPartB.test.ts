import { describe, expect, it } from "vitest";
import {
  buildDieselSupplierSuggestions,
  dieselSupplierReportGroup,
  findCloseDieselSupplierMatch,
  linkedDieselReceiptCanCreateVendorBillItem,
} from "@shared/dieselSupplier";

const vendors = [
  { id: 1, name: "Durga Fuels", businessName: null, isActive: true },
  { id: 2, name: "North Road Diesel", businessName: "NRD", isActive: true },
  { id: 3, name: "Inactive Fuel", isActive: false },
];
const aliases = [{ canonicalName: "Durga Fuels", alias: "Durga Petroleum" }];

describe("DIESEL-PUR-01B supplier matching", () => {
  it("waits for two letters, matches anywhere, and puts Masters before purchase names", () => {
    expect(buildDieselSupplierSuggestions("u", vendors, aliases, ["Durga Station", "Kurnool Fuels"])).toEqual([]);
    const results = buildDieselSupplierSuggestions("ur", vendors, aliases, ["Durga Station", "Kurnool Fuels"]);
    expect(results.map(({ name, kind }) => [name, kind])).toEqual([
      ["Durga Fuels", "master"],
      ["Durga Station", "previous"],
      ["Kurnool Fuels", "previous"],
    ]);
  });

  it("finds Vendor Master aliases and keeps previously typed names as unlinked suggestions", () => {
    const results = buildDieselSupplierSuggestions("pet", vendors, aliases, ["Durga Petroleum"]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "Durga Fuels", vendorId: 1, kind: "master" });
  });

  it("suggests a close name once without changing the typed spelling", () => {
    expect(findCloseDieselSupplierMatch("Durg Fuels", vendors, [])).toMatchObject({
      name: "Durga Fuels",
      vendorId: 1,
      kind: "master",
    });
    expect(findCloseDieselSupplierMatch("New Fuel Point", vendors, [])).toBeNull();
  });

  it("groups linked purchases under their vendor and only aliases affect report grouping", () => {
    expect(dieselSupplierReportGroup({ supplier: "Old Durga Name", vendorId: null }, vendors, [
      { canonicalName: "Durga Fuels", alias: "Old Durga Name" },
    ])).toMatchObject({ kind: "master", label: "Durga Fuels" });
    expect(linkedDieselReceiptCanCreateVendorBillItem({
      paymentMode: "credit",
      paymentStatus: "pending",
      vendorId: null,
    }, [1])).toBe(false);
    expect(dieselSupplierReportGroup({ supplier: "Durga Fuels", vendorId: null }, vendors, aliases))
      .toMatchObject({ kind: "fuel_station", label: "Durga Fuels" });
    expect(dieselSupplierReportGroup({ supplier: "Durga Fuels", vendorId: 1 }, vendors, []))
      .toMatchObject({ kind: "master", label: "Durga Fuels" });
  });
});

describe("DIESEL-PUR-01B linked diesel vendor-bill eligibility", () => {
  const vendorIds = [21];
  it.each([
    ["credit pending with linked Master", { paymentMode: "credit", paymentStatus: "pending", vendorId: 21 }, true],
    ["credit already paid", { paymentMode: "credit", paymentStatus: "paid", vendorId: 21 }, false],
    ["cash", { paymentMode: "cash", paymentStatus: "pending", vendorId: 21 }, false],
    ["advance", { paymentMode: "advance", paymentStatus: "pending", vendorId: 21 }, false],
    ["upi", { paymentMode: "upi", paymentStatus: "pending", vendorId: 21 }, false],
    ["cheque", { paymentMode: "cheque", paymentStatus: "pending", vendorId: 21 }, false],
    ["rtgs", { paymentMode: "rtgs", paymentStatus: "pending", vendorId: 21 }, false],
    ["typed name without Master link", { paymentMode: "credit", paymentStatus: "pending", vendorId: null }, false],
    ["different Master vendor", { paymentMode: "credit", paymentStatus: "pending", vendorId: 22 }, false],
  ])("%s", (_label, purchase, expected) => {
    expect(linkedDieselReceiptCanCreateVendorBillItem(purchase, vendorIds)).toBe(expected);
  });
});
