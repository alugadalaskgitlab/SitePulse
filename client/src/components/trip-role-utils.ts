import { classifyTripRoles, type TripTransportRole } from "@shared/tripTransportRoles";
import { formatTripQuantity } from "@shared/tripQuantityDisplay";
import type { SiteMaterialTrip } from "@shared/schema";

export type ExistingTripVendor = { id: number; name: string };
export type TripRoleFilter = "all" | TripTransportRole;
export const TRIP_ROLE_OPTIONS = [
  { value: "same_party", label: "Same party" },
  { value: "different_parties", label: "Another transporter" },
  { value: "in_house", label: "Our own vehicle" },
] as const;

const vendorKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleUpperCase();

/** Names are only accepted when they resolve to exactly one existing master ID. */
export function resolveTripVendor(name: string, vendors: ExistingTripVendor[]): ExistingTripVendor {
  const matches = vendors.filter((vendor) => vendorKey(vendor.name) === vendorKey(name));
  if (!name.trim() || matches.length === 0) throw new Error("Choose an existing vendor from the suggestions. New vendor names cannot be created here.");
  if (matches.length !== 1) throw new Error("This vendor name matches multiple existing vendors. Ask the office to confirm the vendor; no trip has been saved.");
  return matches[0];
}

export function existingTripVendorSuggestions(recent: string[], vendors: ExistingTripVendor[]): string[] {
  const ordered = [...recent, ...vendors.map((vendor) => vendor.name)];
  const seen = new Set<number>();
  return ordered.flatMap((name) => {
    try {
      const vendor = resolveTripVendor(name, vendors);
      if (seen.has(vendor.id)) return [];
      seen.add(vendor.id);
      return [vendor.name];
    } catch {
      return [];
    }
  });
}

export function filterTripsByRole(trips: SiteMaterialTrip[], role: TripRoleFilter): SiteMaterialTrip[] {
  return role === "all" ? trips : trips.filter((trip) => classifyTripRoles(trip) === role);
}

export function tripRoleDescription(trip: SiteMaterialTrip, equipmentName?: string): string {
  const prefix = `${trip.material} ${formatTripQuantity(trip, false)} ${trip.uom}`;
  const role = classifyTripRoles(trip);
  if (role === "unresolved") {
    const raw = [trip.materialSourceSupplier, trip.supplier].filter(Boolean).join(" · ");
    return `${prefix}${raw ? ` · ${raw}` : ""} · roles not confirmed`;
  }
  if (role === "in_house") return `${prefix} · from ${trip.materialSourceSupplier} · brought by our ${equipmentName || trip.vehicleNumber || `equipment #${trip.internalEquipmentId}`}`;
  const vehicle = role === "different_parties" && trip.vehicleNumber ? ` (${trip.vehicleNumber})` : "";
  return `${prefix} · from ${trip.materialSourceSupplier} · brought by ${trip.supplier}${vehicle}`;
}
