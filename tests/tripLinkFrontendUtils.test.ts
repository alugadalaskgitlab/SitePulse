import { describe, expect, it } from "vitest";
import { buildTripIdentityLinkPayload, equipmentIdentityLabel, uniqueRegistrationMatch } from "../client/src/components/trip-link-utils";
import { resolveSelectedTripVendor } from "../client/src/components/trip-role-utils";

describe("trip link selection safety", () => {
  it("suggests exactly one registration, never an ambiguous or missing one", () => {
    const options = [{ id: 41, name: "Tipper", registrationNumber: "TS15UE4470" }];
    expect(uniqueRegistrationMatch(options, "ts 15 ue 4470")?.id).toBe(41);
    expect(uniqueRegistrationMatch([...options, { ...options[0], id: 42 }], "TS15UE4470")).toBeNull();
    expect(uniqueRegistrationMatch(options, "")).toBeNull();
    expect(uniqueRegistrationMatch(options, "TS15UE4471")).toBeNull();
  });
  it("retains separate original names by excluding all text facts from the reviewed ID payload", () => {
    const original = Object.freeze({ supplierVendorId: null, materialSourceVendorId: 11, supplier: "NARSIMULU", vehicleNumber: "TS15UE4470" });
    expect(buildTripIdentityLinkPayload(original, { supplierVendorId: 12, materialSourceVendorId: 11 }, "Owner reviewed")).toEqual({
      supplierVendorId: 12, expectedSupplierVendorId: null, expectedMaterialSourceVendorId: 11, reason: "Owner reviewed",
      expectedSupplier: "NARSIMULU", expectedMaterialSourceSupplier: null,
    });
    expect(original.supplier).toBe("NARSIMULU");
    expect(() => buildTripIdentityLinkPayload(original, { materialSourceVendorId: 11 }, "Reviewed")).toThrow("changed");
    expect(() => buildTripIdentityLinkPayload(original, { supplierVendorId: 12 }, "")).toThrow("reason");
  });
  it("resolves duplicate master names only through an explicit selected ID", () => {
    const options = [{ id: 11, name: "SAME PARTY", isActive: true }, { id: 12, name: "SAME PARTY", isActive: true }];
    expect(resolveSelectedTripVendor("SAME PARTY", 12, options).id).toBe(12);
    expect(() => resolveSelectedTripVendor("SAME PARTY", null, options)).toThrow("Select an active Vendor Master");
  });
  it("labels owner, confirmed identity and equipment type without any financial data", () => {
    const label = equipmentIdentityLabel({ id: 41, name: "Tipper 7", equipmentType: "Tipper",
      registrationNumber: "TS15UE4470", vendorName: "NARSIMULU", linkedVendorName: "GANGARAM NARSIMHULU" });
    expect(label).toContain("Recorded owner: NARSIMULU");
    expect(label).toContain("Vendor Master: GANGARAM NARSIMHULU");
    expect(label).toContain("Tipper");
  });
});
