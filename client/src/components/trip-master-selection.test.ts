import { describe, expect, it } from "vitest";
import type { EquipmentMasterType } from "@shared/schema";
import { resolveSelectedTripVendor, searchTripVendors } from "./trip-role-utils";
import { equipmentOwnershipLabel, isVendorPayableEquipment, selectTripEquipment, tripMasterSelection, vendorHireEquipmentLabel } from "./trip-master-selection";
import type { TripRoleDraft } from "./TripTransportRoleFields";

const vendors = [
  { id: 13, name: "Saravana", businessName: "SARAVANA METAL INDUSTRIES", isActive: true },
  { id: 27, name: "Gangaram Narsimulu", businessName: "G N Transport", isActive: true },
  { id: 29, name: "NARSI inactive", isActive: false },
];
const hired = { id: 41, name: "Tipper", equipmentType: "Tipper", registrationNumber: "TS15UE4470", ownership: "hired", isActive: true } as unknown as EquipmentMasterType;
const owner = { id: 41, name: "Tipper", vendorId: 27, linkedVendorName: "G N Transport" };
const blank: TripRoleDraft = { materialSourceType: "own_source", materialSourceLabel: "Borrow area", materialSourceSupplier: "", supplier: "", vehicleNumber: "", internalEquipmentId: null };

describe("Master-only trip selection", () => {
  it("matches SARA anywhere in business or Master name", () => expect(searchTripVendors(vendors, "sArA").map(v => v.id)).toEqual([13]));
  it("matches NARSI in Master name and excludes inactive records", () => expect(searchTripVendors(vendors, "NARSI").map(v => v.id)).toEqual([27]));
  it("requires two characters", () => expect(searchTripVendors(vendors, "s")).toEqual([]));
  it("never guesses a legacy name into an ID", () => expect(() => resolveSelectedTripVendor("Saravana", null, vendors)).toThrow("Select an active"));
  it("resolves the saved ID rather than displayed text", () => expect(resolveSelectedTripVendor("old recorded name", 13, vendors).id).toBe(13));
  it("rejects an inactive selected ID", () => expect(() => resolveSelectedTripVendor("NARSI inactive", 29, vendors)).toThrow());
  it("hired selection fills a blank transporter with confirmed active owner", () => {
    const draft = selectTripEquipment(blank, hired, owner, vendors);
    expect(draft).toMatchObject({ equipmentId: 41, internalEquipmentId: null, supplierVendorId: 27, vehicleNumber: "TS15UE4470", materialSourceType: "own_source", materialSourceSupplier: "" });
  });
  it("does not overwrite an existing different transporter", () => expect(selectTripEquipment({ ...blank, supplier: "Saravana", supplierVendorId: 13 }, hired, owner, vendors).supplierVendorId).toBe(13));
  it("preserves legacy transporter text rather than filling an ID", () => expect(selectTripEquipment({ ...blank, supplier: "Legacy transporter" }, hired, owner, vendors).supplierVendorId).toBeUndefined());
  it("does not infer an owner from recorded vendorName", () => expect(selectTripEquipment(blank, hired, { id: 41, name: "Tipper", vendorId: 27, vendorName: "Gangaram Narsimulu" }, vendors).supplier).toBe(""));
  it("owned equipment uses internal equipment ID", () => expect(selectTripEquipment(blank, { ...hired, ownership: "owned" }, undefined, vendors).internalEquipmentId).toBe(41));
  it("omits untouched association on reopening", () => expect(tripMasterSelection(41, false)).toEqual({}));
  it("sends routine ID-only atomic selection without reason/fingerprint", () => expect(tripMasterSelection(41, true)).toEqual({ masterSelection: { equipmentId: 41 } }));
  it("explicit outside choice sends null association", () => expect(tripMasterSelection(null, true)).toEqual({ masterSelection: { equipmentId: null } }));
  it("ownership is authoritative and independent of hire basis", () => {
    expect(equipmentOwnershipLabel({ ownership: "owned" }, "Outside Vendor")).toBe("Owned — HLC");
    expect(equipmentOwnershipLabel({ ownership: "hired" }, "G N Transport")).toBe("Hired — G N Transport");
    expect(equipmentOwnershipLabel({})).toBe("Ownership not recorded");
  });
  it("unknown legacy ownership and HLC owned equipment are not auto-payable", () => {
    expect(isVendorPayableEquipment({ ownership: "owned" })).toBe(false);
    expect(isVendorPayableEquipment({})).toBe(false);
    expect(isVendorPayableEquipment(hired)).toBe(true);
  });
  it("bill selection label displays linked business identity, never guessed Owned", () => {
    expect(vendorHireEquipmentLabel({ ...hired, linkedVendorName: "G N Transport" })).toContain("Hired — G N Transport");
    expect(vendorHireEquipmentLabel({ name: "Historical tipper" })).toContain("Ownership not recorded");
  });
});
