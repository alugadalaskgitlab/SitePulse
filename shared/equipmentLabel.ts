export interface EquipmentLabelSource {
  name?: string | null;
  registrationNumber?: string | null;
  ownership?: string | null;
  vendorName?: string | null;
  meterType?: string | null;
}

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.toLowerCase() === "undefined" || text.toLowerCase() === "null") return null;
  return text;
}

/**
 * Canonical Equipment Master identity label used by equipment selectors and
 * equipment-referencing lists. Operational values such as norms and location
 * remain separate because they are not part of the selectable identity.
 */
export function formatEquipmentOptionLabel(equipment: EquipmentLabelSource): string {
  const name = optionalText(equipment.name) ?? "Unknown equipment";
  const registration = optionalText(equipment.registrationNumber);
  const vendor = optionalText(equipment.vendorName);
  const ownership = equipment.ownership === "hired"
    ? `Hired${vendor ? ` - ${vendor}` : ""}`
    : "Owned";
  const meterType = equipment.meterType === "hour_meter"
    ? "Hour Meter"
    : equipment.meterType === "odometer"
      ? "Odometer"
      : null;

  return [name, registration, ownership, meterType].filter(Boolean).join(" | ");
}