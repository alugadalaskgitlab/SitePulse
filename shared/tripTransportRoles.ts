/** Classifies only explicitly stored role facts; never fills missing history. */
export type TripTransportRole = "same_party" | "different_parties" | "in_house" | "unresolved";
export interface TripRoleFacts {
  materialSourceSupplier?: string | null;
  materialSourceVendorId?: number | null;
  supplier?: string | null;
  supplierVendorId?: number | null;
  transportType?: string | null;
  internalEquipmentId?: number | null;
  vehicleNumber?: string | null;
}
const nameKey = (value?: string | null) => value?.trim().replace(/\s+/g, " ").toUpperCase() || "";

export function classifyTripRoles(trip: TripRoleFacts): TripTransportRole {
  const source = nameKey(trip.materialSourceSupplier);
  const carrier = nameKey(trip.supplier);
  if (!source) return "unresolved";
  if (trip.transportType === "in_house") {
    return trip.internalEquipmentId != null && !carrier && trip.supplierVendorId == null
      ? "in_house" : "unresolved";
  }
  if (trip.transportType !== "agency_vendor" || !carrier || trip.internalEquipmentId != null) return "unresolved";
  // Conflicting IDs/names are not a license to choose either identity.
  if (trip.materialSourceVendorId != null && trip.supplierVendorId != null) {
    const sameId = trip.materialSourceVendorId === trip.supplierVendorId;
    if (sameId !== (source === carrier)) return "unresolved";
    return sameId ? "same_party" : "different_parties";
  }
  return source === carrier ? "same_party" : "different_parties";
}

/** New-entry validation only: historical unrelated edits remain backward compatible. */
export function validateTripRoles(trip: TripRoleFacts): string | null {
  if (!nameKey(trip.materialSourceSupplier)) return "Material from is required.";
  if (!trip.transportType) return "Choose Who brought it.";
  if (trip.transportType === "in_house") {
    if (trip.internalEquipmentId == null) return "Choose our own vehicle from the equipment master.";
    if (nameKey(trip.supplier) || trip.supplierVendorId != null) return "Our own vehicle must not have a transport vendor.";
  }
  if (classifyTripRoles(trip) === "unresolved") return "Set Material from and Who brought it to confirm the transport/source roles.";
  return null;
}

type VendorChoice = { name: string; id: number | null };
type EquipmentChoice = { id: number; registrationNumber?: string | null; name: string };
export function tripRolePayload(
  choice: TripTransportRole | "",
  source: VendorChoice,
  transporter: VendorChoice,
  equipment: EquipmentChoice | null,
  vehicleNumber: string,
): TripRoleFacts {
  if (!choice || choice === "unresolved") throw new Error("Choose Who brought it.");
  if (!source.name.trim()) throw new Error("Material from is required.");
  const own = choice === "in_house";
  if (own && !equipment) throw new Error("Choose our own vehicle from the equipment master.");
  if (choice === "different_parties" && !transporter.name.trim()) throw new Error("Choose another transporter.");
  const carrier = choice === "same_party" ? source : transporter;
  const result: TripRoleFacts = {
    materialSourceSupplier: source.name.trim(),
    materialSourceVendorId: source.id,
    supplier: own ? null : carrier.name.trim(),
    supplierVendorId: own ? null : carrier.id,
    transportType: own ? "in_house" : "agency_vendor",
    internalEquipmentId: own ? equipment!.id : null,
    vehicleNumber: own ? equipment!.registrationNumber || equipment!.name : vehicleNumber,
  };
  const error = validateTripRoles(result);
  if (error) throw new Error(error);
  if (classifyTripRoles(result) !== choice) throw new Error("Choose a different transporter, or select Same party.");
  return result;
}
