import { describe, expect, it } from "vitest";
import { classifyTripRoles, tripRolePayload, validateTripRoles } from "../shared/tripTransportRoles";
import { vendorBillTripCandidate } from "../shared/vendorBillTripRoles";
const agency = {
  id: 999, date: "2026-10-08", material: "SOIL", quantity: 600, uom: "CFT",
  materialSourceType: "own_source" as const, materialSourceLabel: "Borrow area 212",
  materialSourceSupplier: null, materialSourceVendorId: null,
  transportType: "agency_vendor", supplier: "TRANSPORTER", supplierVendorId: 12,
  internalEquipmentId: null,
};
describe("Explicit own-source facts", () => {
  it("classifies own material hauled by an agency without a seller", () => {
    expect(classifyTripRoles(agency)).toBe("own_source_agency");
    expect(validateTripRoles(agency)).toBeNull();
  });
  it("classifies own material hauled by own fleet", () => {
    const row = { ...agency, transportType: "in_house", supplier: null, supplierVendorId: null, internalEquipmentId: 4 };
    expect(classifyTripRoles(row)).toBe("own_source_in_house");
    expect(vendorBillTripCandidate(row, true, true, "all")).toBeNull();
  });
  it("requires label only in new-entry validation, not historical classification", () => {
    expect(validateTripRoles({...agency,materialSourceLabel:"  "})).toContain("borrow area");
    expect(classifyTripRoles({...agency,materialSourceLabel:null})).toBe("own_source_agency");
  });
  it("does not reinterpret blank legacy seller columns", () => {
    expect(classifyTripRoles({...agency,materialSourceType:null})).toBe("unresolved");
    expect(classifyTripRoles({...agency,materialSourceType:"vendor"})).toBe("unresolved");
  });
  it("still requires real transport evidence", () => {
    expect(classifyTripRoles({...agency,supplier:null})).toBe("unresolved");
  });
  it("rejects a vendor stored against own material", () => {
    expect(validateTripRoles({...agency,materialSourceSupplier:"SELF"})).toContain("must not");
  });
  it("builds explicit null seller fields without resolving a self vendor", () => {
    const row=tripRolePayload("different_parties",{name:"",id:null},{name:"TRANSPORTER",id:12},null,"TS15UE4470",agency);
    expect(row).toMatchObject({materialSourceSupplier:null,materialSourceVendorId:null,materialSourceLabel:"Borrow area 212",supplierVendorId:12});
  });
  it("never supplies a material bill row, even with a stale seller match", () => {
    expect(vendorBillTripCandidate(agency,true,true,"material")).toBeNull();
    expect(vendorBillTripCandidate(agency,true,false,"all")).toBeNull();
  });
  it("retains the existing one-trip transport candidate and physical evidence", () => {
    expect(vendorBillTripCandidate(agency,false,true,"all")).toMatchObject({
      category:"transport",qty:1,unit:"TRIP",physicalQuantity:600,physicalUnit:"CFT",
      sourceType:"site_material_trip_transport",sourceId:999,
    });
  });
});
