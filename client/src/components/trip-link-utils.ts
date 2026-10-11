export type TripEquipmentOption = {
  id: number;
  name: string;
  equipmentType?: string | null;
  type?: string | null;
  registrationNumber?: string | null;
  vendorName?: string | null;
  linkedVendorName?: string | null;
  vendorId?: number | null;
  isActive?: boolean;
};

const registrationKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A registration is a suggestion, never a confirmation or a new master row. */
export function uniqueRegistrationMatch(options: TripEquipmentOption[], registration: string) {
  const key = registrationKey(registration);
  const matches = key ? options.filter(e => registrationKey(e.registrationNumber || "") === key) : [];
  return matches.length === 1 ? matches[0] : null;
}

export function filterEquipmentByRegistration(options: TripEquipmentOption[], search: string) {
  const key = registrationKey(search);
  return key ? options.filter(e => registrationKey(e.registrationNumber || "").includes(key)) : options;
}

export function equipmentIdentityLabel(e: TripEquipmentOption) {
  return `${e.registrationNumber || "Registration missing"} · ${e.equipmentType || e.type || e.name || "Type not recorded"} · Recorded owner: ${e.vendorName || "Not recorded"} · Vendor Master: ${e.linkedVendorName || "Unlinked"}`;
}

export function buildTripIdentityLinkPayload(
  trip: { supplierVendorId?: number | null; materialSourceVendorId?: number | null;
    supplier?: string | null; materialSourceSupplier?: string | null },
  selections: { supplierVendorId?: number; materialSourceVendorId?: number },
  reason: string,
) {
  const changes = Object.fromEntries(Object.entries(selections).filter(([key, value]) =>
    value != null && value !== trip[key as keyof typeof trip],
  ));
  if (!Object.keys(changes).length) throw new Error("Select a new or changed Vendor Master link.");
  if (reason.trim().length < 3) throw new Error("Enter an identity verification reason.");
  // No names, registration or role facts belong in an ID-only confirmation.
  return {
    ...changes,
    expectedSupplierVendorId: trip.supplierVendorId ?? null,
    expectedMaterialSourceVendorId: trip.materialSourceVendorId ?? null,
    expectedSupplier: trip.supplier ?? null,
    expectedMaterialSourceSupplier: trip.materialSourceSupplier ?? null,
    reason: reason.trim(),
  };
}
