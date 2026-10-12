import type { EquipmentMasterType } from "@shared/schema";
import type { TripRoleDraft } from "./TripTransportRoleFields";
import type { TripEquipmentOption } from "./trip-link-utils";
import type { ExistingTripVendor } from "./trip-role-utils";

export function selectTripEquipment(draft: TripRoleDraft, equipment: EquipmentMasterType, owner: TripEquipmentOption | undefined, vendors: ExistingTripVendor[]): TripRoleDraft {
  const owned = equipment.ownership === "owned";
  const vendor = owner?.vendorId && owner.linkedVendorName ? vendors.find(v => v.id === owner.vendorId && !!v.isActive) : null;
  return { ...draft, equipmentId: equipment.id, vehicleManual: false,
    internalEquipmentId: owned ? equipment.id : null,
    vehicleNumber: equipment.registrationNumber || equipment.name,
    ...(!owned && !draft.supplier.trim() && draft.supplierVendorId == null && vendor
      ? { supplier: vendor.name, supplierVendorId: vendor.id, supplierManual: false } : {}),
  };
}

/** Omit untouched associations: reopening must not request reconfirmation. */
export function tripMasterSelection(equipmentId: number | null | undefined, changed: boolean) {
  return changed ? { masterSelection: { equipmentId: equipmentId ?? null } } : {};
}

export function equipmentOwnershipLabel(equipment: { ownership?: string | null }, owner?: string | null) {
  return equipment.ownership === "owned" ? "Owned — HLC"
    : equipment.ownership === "hired" ? `Hired — ${owner || "Owner not linked"}`
    : "Ownership not recorded";
}

export function vendorHireEquipmentLabel(equipment: { name?: string | null; registrationNumber?: string | null; ownership?: string | null; linkedVendorName?: string | null; vendorBusinessName?: string | null }) {
  return [equipment.name || "Unknown equipment", equipment.registrationNumber,
    equipmentOwnershipLabel(equipment, equipment.linkedVendorName || equipment.vendorBusinessName)].filter(Boolean).join(" | ");
}

export const isVendorPayableEquipment = (equipment: { ownership?: string | null }) => equipment.ownership === "hired";
