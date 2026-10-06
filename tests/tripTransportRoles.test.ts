import { describe, expect, it } from "vitest";
import { classifyTripRoles, tripRolePayload, validateTripRoles } from "../shared/tripTransportRoles";

const seller = { id: 101, name: "SELLER" };
const hauler = { id: 102, name: "HAULER" };
const own = { id: 103, name: "TIPPER-03", registrationNumber: "TS15UF4308" };

describe("trip transport/source roles: explicit entry, read-only classification", () => {
  it("same party writes both names and IDs explicitly", () => {
    expect(tripRolePayload("same_party", seller, hauler, own, "TRUCK")).toEqual({
      materialSourceSupplier: "SELLER", materialSourceVendorId: 101,
      supplier: "SELLER", supplierVendorId: 101,
      transportType: "agency_vendor", internalEquipmentId: null, vehicleNumber: "TRUCK",
    });
  });
  it("different parties writes independent identities and the entered vehicle", () => {
    const result = tripRolePayload("different_parties", seller, hauler, null, "TS15UF4308");
    expect(result).toMatchObject({ materialSourceVendorId: 101, supplierVendorId: 102, vehicleNumber: "TS15UF4308", transportType: "agency_vendor" });
    expect(classifyTripRoles(result)).toBe("different_parties");
  });
  it("own fleet clears both transport vendor fields and uses the master vehicle", () => {
    const result = tripRolePayload("in_house", seller, hauler, own, "STALE");
    expect(result).toMatchObject({ supplier: null, supplierVendorId: null, internalEquipmentId: 103, vehicleNumber: "TS15UF4308", transportType: "in_house" });
    expect(classifyTripRoles(result)).toBe("in_house");
  });
  it.each(["", "unresolved"] as const)("blocks missing explicit selection %s", (choice) => {
    expect(() => tripRolePayload(choice, seller, hauler, null, "")).toThrow("Who brought it");
  });
  it("requires Material from", () => {
    expect(() => tripRolePayload("same_party", { name: "", id: null }, hauler, null, "TRUCK")).toThrow("Material from");
  });
  it("requires master equipment for own fleet", () => {
    expect(() => tripRolePayload("in_house", seller, hauler, null, "TRUCK")).toThrow("equipment master");
  });
  it("does not classify historical transporter-only values or mutate the object", () => {
    const trip = Object.freeze({ supplier: "HAULER", supplierVendorId: 102, materialSourceSupplier: null, transportType: "agency_vendor" });
    expect(classifyTripRoles(trip)).toBe("unresolved");
    expect(trip.materialSourceSupplier).toBeNull();
  });
  it("does not treat blank transport vendor as same party", () => {
    expect(classifyTripRoles({ materialSourceSupplier: "SELLER", transportType: "agency_vendor" })).toBe("unresolved");
  });
  it("does not guess a missing transport type", () => {
    expect(classifyTripRoles({ materialSourceSupplier: "SELLER", supplier: "SELLER" })).toBe("unresolved");
  });
  it("classifies explicit legacy names without writing IDs", () => {
    const trip = Object.freeze({ materialSourceSupplier: "seller", supplier: " SELLER ", transportType: "agency_vendor" });
    expect(classifyTripRoles(trip)).toBe("same_party");
    expect(trip).not.toHaveProperty("materialSourceVendorId");
  });
  it.each([
    { materialSourceVendorId: 1, supplierVendorId: 2, materialSourceSupplier: "SELLER", supplier: "SELLER" },
    { materialSourceVendorId: 1, supplierVendorId: 1, materialSourceSupplier: "SELLER", supplier: "HAULER" },
  ])("leaves conflicting identity facts unresolved", (facts) => {
    expect(classifyTripRoles({ ...facts, transportType: "agency_vendor" })).toBe("unresolved");
  });
  it("leaves in-house trips with a transport vendor unresolved", () => {
    expect(validateTripRoles({ materialSourceSupplier: "SELLER", transportType: "in_house", internalEquipmentId: 3, supplierVendorId: 2 })).toContain("must not have");
  });
  it("blocks same vendor under Another transporter", () => {
    expect(() => tripRolePayload("different_parties", seller, seller, null, "TRUCK")).toThrow("Same party");
  });
});
