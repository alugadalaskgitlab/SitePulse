/** Discovery-only guards. Never use these to filter or rewrite saved bill rows. */
export type TripCandidateSafety = {
  sourceType?: string | null;
  rolesUnconfirmed?: boolean;
  tripId?: number | null;
  roleWarning?: string | null;
  transportPricingNote?: string | null;
};

export const UNCONFIRMED_TRIP_WARNING = "Roles not confirmed — this trip may be material or transport";

export function isUnconfirmedTrip(item: TripCandidateSafety): boolean {
  return item.rolesUnconfirmed === true || item.sourceType === "site_material_trip_unresolved";
}

export function billableTripCandidates<T extends TripCandidateSafety>(items: readonly T[]): T[] {
  return items.filter(item => !isUnconfirmedTrip(item));
}

/** A site trip's transport liability must never enter material-rate conversion. */
export function isSiteTripTransport(item: TripCandidateSafety): boolean {
  return item.sourceType === "site_material_trip_transport";
}
