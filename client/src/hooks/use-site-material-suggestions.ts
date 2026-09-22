import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

/**
 * The first part of this key is intentionally a URL-like prefix.  A number
 * of material-trip screens use URL query keys, so keeping suggestions under a
 * separate prefix lets mutations invalidate both the list and the
 * site-scoped suggestions without accidentally depending on a particular
 * filter URL.
 */
export const SITE_MATERIAL_SUGGESTIONS_QUERY_KEY =
  "/api/site-material-trips/suggestions";

export interface SiteMaterialSuggestions {
  vehicles: string[];
  suppliers: string[];
  /** Material purchase/source vendors; independent from vehicle transporters. */
  materialSourceSuppliers: string[];
  /**
   * Associations are deliberately separate from the free-text lists.  A
   * vehicle is only allowed to fill a supplier after an explicit vehicle
   * suggestion selection, and only when this entry is stable (`linked`).
   */
  vehicleSuppliers: Record<string, VehicleSupplierAssociation>;
  /** The server decides whether this user may change future associations. */
  canCorrectVehicleSupplier: boolean;
}

export type VehicleSupplierAssociationStatus =
  | "linked"
  | "conflict"
  | "unlinked";

export interface VehicleSupplierAssociation {
  status: VehicleSupplierAssociationStatus;
  supplier: string | null;
  version: string | null;
}

export type SuggestionMatch = "vehicle" | "supplier";

/** Matching is deliberately more forgiving than storage/display formatting. */
export function normaliseFreeTextSuggestion(
  value: string,
  match: SuggestionMatch,
): string {
  const collapsed = value.trim().toLocaleUpperCase();
  return match === "vehicle"
    ? collapsed.replace(/[\s-]+/g, "")
    : collapsed.replace(/\s+/g, "");
}

export const normalizeFreeTextSuggestion = normaliseFreeTextSuggestion;

/** The stable association key: uppercase, with spaces and hyphens removed. */
export function normalizeVehicleSupplierKey(value: string | null | undefined): string {
  return typeof value === "string"
    ? value.trim().toLocaleUpperCase().replace(/[\s-]+/g, "")
    : "";
}

/**
 * Find a server association without ever inferring one from the supplier
 * suggestion list.  The backend sends normalized keys, but normalizing the
 * key here also keeps the client safe when a legacy response has display
 * formatting in its object keys.
 */
export function vehicleSupplierAssociationFor(
  associations: Record<string, VehicleSupplierAssociation> | null | undefined,
  vehicleNumber: string | null | undefined,
): VehicleSupplierAssociation | undefined {
  const key = normalizeVehicleSupplierKey(vehicleNumber);
  if (!key || !associations) return undefined;
  if (associations[key]) return associations[key];
  const matchingKey = Object.keys(associations).find(
    (candidate) => normalizeVehicleSupplierKey(candidate) === key,
  );
  return matchingKey ? associations[matchingKey] : undefined;
}

export function filterFreeTextSuggestions(
  suggestions: string[],
  value: string,
  match: SuggestionMatch,
): string[] {
  const needle = normaliseFreeTextSuggestion(value, match);
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (!suggestion?.trim()) return false;
    const normalised = normaliseFreeTextSuggestion(suggestion, match);
    if (seen.has(normalised)) return false;
    seen.add(normalised);
    return !needle || normalised.includes(needle);
  });
}

/**
 * Fetch the recent values for one site.  The QueryFunction signal is passed
 * directly to fetch: changing sites therefore aborts an in-flight request
 * instead of allowing a slower response to overwrite the new site's data.
 *
 * The query intentionally does not retain a previous result while switching
 * sites.  A switch must never present another site's choices as if they
 * belonged to the newly selected site.
 */
export function useSiteMaterialSuggestions(site?: string | null) {
  const siteValue = site ?? "";
  const query = useQuery<SiteMaterialSuggestions>({
    queryKey: [SITE_MATERIAL_SUGGESTIONS_QUERY_KEY, siteValue],
    enabled: siteValue.trim().length > 0,
    // Saved associations can be changed by another authorized user/device.
    // Refreshing never writes form state; only an explicit suggestion
    // selection or correction confirmation may do that.
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${SITE_MATERIAL_SUGGESTIONS_QUERY_KEY}?site=${encodeURIComponent(siteValue)}`,
        { credentials: "include", signal },
      );
      if (!response.ok) {
        throw new Error(`Suggestions unavailable (${response.status})`);
      }
      const body = (await response.json()) as Partial<SiteMaterialSuggestions>;
      const rawAssociations = body.vehicleSuppliers;
      const vehicleSuppliers: Record<string, VehicleSupplierAssociation> = {};
      if (rawAssociations && typeof rawAssociations === "object") {
        for (const [key, value] of Object.entries(rawAssociations)) {
          if (!value || typeof value !== "object") continue;
          const association = value as Partial<VehicleSupplierAssociation>;
          if (
            association.status !== "linked" &&
            association.status !== "conflict" &&
            association.status !== "unlinked"
          ) {
            continue;
          }
          const normalizedKey = normalizeVehicleSupplierKey(key);
          if (!normalizedKey) continue;
          vehicleSuppliers[normalizedKey] = {
            status: association.status,
            supplier:
              typeof association.supplier === "string"
                ? association.supplier
                : null,
            version:
              typeof association.version === "string"
                ? association.version
                : null,
          };
        }
      }
      const base = {
        vehicles: Array.isArray(body.vehicles)
          ? body.vehicles.filter((value): value is string => typeof value === "string")
          : [],
        suppliers: Array.isArray(body.suppliers)
          ? body.suppliers.filter((value): value is string => typeof value === "string")
          : [],
        materialSourceSuppliers: Array.isArray(body.materialSourceSuppliers)
          ? body.materialSourceSuppliers.filter((value): value is string => typeof value === "string")
          : [],
      };
      // Keep the old two-field result shape for older deployments while
      // exposing the augmented contract as soon as the server sends it.
      return (
        Object.prototype.hasOwnProperty.call(body, "vehicleSuppliers") ||
        Object.prototype.hasOwnProperty.call(body, "canCorrectVehicleSupplier")
          ? {
              ...base,
              vehicleSuppliers,
              canCorrectVehicleSupplier: body.canCorrectVehicleSupplier === true,
            }
          : base
      ) as SiteMaterialSuggestions;
    },
  });

  return {
    ...query,
    // Keep the loading/disabled value compatible with the original
    // two-field suggestion shape; augmented fields are exposed below with
    // safe empty defaults and arrive in `suggestions` once the server does.
    suggestions: query.data ?? { vehicles: [], suppliers: [], materialSourceSuppliers: [] },
    vehicles: query.data?.vehicles ?? [],
    suppliers: query.data?.suppliers ?? [],
    materialSourceSuppliers: query.data?.materialSourceSuppliers ?? [],
    vehicleSuppliers: query.data?.vehicleSuppliers ?? {},
    canCorrectVehicleSupplier: query.data?.canCorrectVehicleSupplier ?? false,
  };
}

/**
 * Invalidate every matching suggestion cache entry, or only the supplied
 * sites.  Mutations can pass both the old and new site after an edit; callers
 * that do not have the old row (delete/cancel) can safely invalidate all.
 */
export function invalidateSiteMaterialSuggestions(
  sites?: string | string[] | null,
) {
  const siteValues =
    sites == null ? [] : (Array.isArray(sites) ? sites : [sites]).filter(Boolean);
  const requestedSites = siteValues.length > 0 ? new Set(siteValues) : null;

  return queryClient.invalidateQueries({
    predicate: (query) => {
      const firstKey = query.queryKey[0];
      if (
        typeof firstKey !== "string" ||
        !firstKey.startsWith(SITE_MATERIAL_SUGGESTIONS_QUERY_KEY)
      ) {
        return false;
      }
      if (!requestedSites) return true;
      return typeof query.queryKey[1] === "string" &&
        requestedSites.has(query.queryKey[1]);
    },
  });
}