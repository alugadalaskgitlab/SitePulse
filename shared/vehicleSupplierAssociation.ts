import { normalizeSiteTripSupplier, normalizeSiteTripVehicle, siteTripVehicleKey } from "./siteTripHistory";

/**
 * The app-settings row used by this feature is deliberately namespaced.  It
 * is not a general setting: callers must use the association storage methods
 * so that writes are serialized and the optimistic version is checked.
 */
export const VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY =
  "site_material_vehicle_supplier_associations.v1";

export type VehicleSupplierAssociationStatus = "linked" | "conflict" | "unlinked";

export interface VehicleSupplierAssociationView {
  status: VehicleSupplierAssociationStatus;
  supplier: string | null;
  version: string | null;
}

export interface VehicleSupplierAssociationRecord {
  supplier: string;
  version: string;
}

export type VehicleSupplierAssociations = Record<string, VehicleSupplierAssociationRecord>;

/**
 * This is the response contract for site-material quick-entry suggestions.
 * `vehicleSuppliers` is intentionally keyed by the normalized vehicle key,
 * not by a display spelling.  This prevents spacing/hyphen variants from
 * creating separate associations.
 */
export interface SiteMaterialTripSuggestions {
  vehicles: string[];
  suppliers: string[];
  materialSourceSuppliers: string[];
  vehicleSuppliers: Record<string, VehicleSupplierAssociationView>;
  canCorrectVehicleSupplier: boolean;
}

export function isVehicleSupplierAssociationSettingKey(key: string): boolean {
  return key === VEHICLE_SUPPLIER_ASSOCIATIONS_SETTING_KEY;
}

export function normalizeVehicleSupplierVehicle(value: string | null | undefined): string {
  return siteTripVehicleKey(normalizeSiteTripVehicle(value));
}

/** Alias used by API/client callers that refer to this value as the key. */
export const normalizeVehicleSupplierKey = normalizeVehicleSupplierVehicle;

export function normalizeVehicleSupplierName(value: string | null | undefined): string {
  return normalizeSiteTripSupplier(value);
}

/**
 * Return the public association state for a vehicle.  `historySuppliers` must
 * contain normalized supplier names from the complete active history, not a
 * bounded "recent rows" sample.  Conflicting names are intentionally not
 * returned to the caller.
 */
export function associationView(
  persisted: VehicleSupplierAssociationRecord | null | undefined,
  historySuppliers: Iterable<string>,
): VehicleSupplierAssociationView {
  const suppliers = new Set(Array.from(historySuppliers).map(normalizeVehicleSupplierName).filter(Boolean));
  const persistedSupplier = normalizeVehicleSupplierName(persisted?.supplier);
  return {
    // An explicit/persisted correction is the future association authority.
    // Historical disagreement remains visible only when there is no explicit
    // mapping yet; once resolved, a conflicting old trip must not disable the
    // linked supplier autofill forever.
    status: persistedSupplier ? "linked" : suppliers.size > 1 ? "conflict" : suppliers.size === 1 ? "linked" : "unlinked",
    supplier: persistedSupplier || (suppliers.size === 1 ? Array.from(suppliers)[0] : null),
    version: persisted?.version ?? null,
  };
}
