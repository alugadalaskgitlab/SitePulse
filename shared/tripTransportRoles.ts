/** Classifies only explicitly stored role facts; never fills missing history. */
export type TripTransportRole = "same_party" | "different_parties" | "in_house" | "unresolved" | "own_source_agency" | "own_source_in_house";
export interface TripRoleFacts {
  materialSourceType?: "vendor" | "own_source" | null;
  materialSourceLabel?: string | null;
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
  if (trip.materialSourceType === "own_source") {
    if (trip.transportType === "in_house" && trip.internalEquipmentId != null && !carrier && trip.supplierVendorId == null) return "own_source_in_house";
    if (trip.transportType === "agency_vendor" && carrier && trip.internalEquipmentId == null) return "own_source_agency";
    return "unresolved"; // Missing transport evidence, never missing material vendor.
  }
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
export function validateTripRoles(trip: TripRoleFacts, requireSourceLabel = true): string | null {
  if (trip.materialSourceType === "own_source") {
    if (requireSourceLabel && !trip.materialSourceLabel?.trim()) return "Enter the borrow area / source description.";
    if (trip.materialSourceSupplier != null || trip.materialSourceVendorId != null) return "Our own source must not have a material vendor.";
  } else if (!nameKey(trip.materialSourceSupplier)) return "Material from is required.";
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
  origin?: Pick<TripRoleFacts, "materialSourceType" | "materialSourceLabel">,
  requireSourceLabel = true,
): TripRoleFacts {
  if (!choice || choice === "unresolved") throw new Error("Choose Who brought it.");
  if (origin?.materialSourceType === "own_source") {
    const internal = choice === "in_house" || choice === "own_source_in_house";
    if (choice === "same_party") throw new Error("Choose another transporter or our own vehicle for our own source.");
    const result: TripRoleFacts = {
      materialSourceType: "own_source", materialSourceLabel: origin.materialSourceLabel?.trim() || null,
      materialSourceSupplier: null, materialSourceVendorId: null,
      supplier: internal ? null : transporter.name.trim() || null,
      supplierVendorId: internal ? null : transporter.id,
      transportType: internal ? "in_house" : "agency_vendor",
      internalEquipmentId: internal ? equipment?.id ?? null : null,
      vehicleNumber: internal ? equipment?.registrationNumber || equipment?.name || "" : vehicleNumber,
    };
    const error = validateTripRoles(result, requireSourceLabel);
    if (error) throw new Error(error);
    return result;
  }
  if (!source.name.trim()) throw new Error("Material from is required.");
  const own = choice === "in_house";
  if (own && !equipment) throw new Error("Choose our own vehicle from the equipment master.");
  if (choice === "different_parties" && !transporter.name.trim()) throw new Error("Choose another transporter.");
  const carrier = choice === "same_party" ? source : transporter;
  const result: TripRoleFacts = {
    ...(origin?.materialSourceType === "vendor" ? { materialSourceType: "vendor" as const, materialSourceLabel: null } : {}),
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
