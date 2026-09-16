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
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${SITE_MATERIAL_SUGGESTIONS_QUERY_KEY}?site=${encodeURIComponent(siteValue)}`,
        { credentials: "include", signal },
      );
      if (!response.ok) {
        throw new Error(`Suggestions unavailable (${response.status})`);
      }
      const body = (await response.json()) as Partial<SiteMaterialSuggestions>;
      return {
        vehicles: Array.isArray(body.vehicles)
          ? body.vehicles.filter((value): value is string => typeof value === "string")
          : [],
        suppliers: Array.isArray(body.suppliers)
          ? body.suppliers.filter((value): value is string => typeof value === "string")
          : [],
      };
    },
  });

  return {
    ...query,
    suggestions: query.data ?? { vehicles: [], suppliers: [] },
    vehicles: query.data?.vehicles ?? [],
    suppliers: query.data?.suppliers ?? [],
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