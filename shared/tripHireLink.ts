/** Billing identity is separate from the original material/transport facts. */
export const tripHireRegistration = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const tripHireVendor = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
export function tripHireFingerprint(trip: any): string {
  return JSON.stringify([tripHireRegistration(trip.vehicleNumber), tripHireVendor(trip.supplier),
    trip.transportType ?? null, trip.date, trip.site, !!trip.isCancelled, !!trip.isDeleted]);
}
export function tripHireMatch(trip: any, equipment: any[]) {
  const registration = tripHireRegistration(trip.vehicleNumber);
  const matches = equipment.filter(e => registration && tripHireRegistration(e.registrationNumber) === registration);
  const hired = matches.filter(e => e.ownership === "hired");
  const credible = hired.length === 1 && matches.length === 1 && trip.transportType !== "in_house" &&
    !!tripHireVendor(trip.supplier) && tripHireVendor(trip.supplier) === tripHireVendor(hired[0].vendorName);
  return {
    suggestedEquipmentId: credible ? hired[0].id : null,
    issue: !registration ? "Vehicle registration missing" : matches.length > 1 ? "Multiple equipment matches"
      : !hired.length ? "No hired Equipment Master match" : !credible ? "Transport owner/vendor conflict or missing owner" : null,
  };
}
export function validTripHireLink(trip: any, equipment: any, evidence: any): boolean {
  return !!evidence && equipment?.ownership === "hired" && !trip.isCancelled && !trip.isDeleted &&
    evidence.equipmentId === equipment.id && evidence.tripFingerprint === tripHireFingerprint(trip) &&
    evidence.registration === tripHireRegistration(equipment.registrationNumber) &&
    evidence.vendor === tripHireVendor(equipment.vendorName);
}
