import { getBaseSiteName } from "./siteName";

/** Maximum number of recent, active trip rows scanned for suggestions. */
export const SITE_TRIP_HISTORY_SCAN_LIMIT = 1000;

/** Maximum number of distinct suggestions returned for either field. */
export const SITE_TRIP_SUGGESTION_LIMIT = 50;

export interface SiteTripHistoryValueRow {
  vehicleNumber?: string | null;
  supplier?: string | null;
  materialSourceSupplier?: string | null;
}

export interface SiteTripSuggestions {
  vehicles: string[];
  suppliers: string[];
  materialSourceSuppliers: string[];
}

/**
 * Canonical site key used only for exact site comparisons and the bounded
 * history query. Provenance suffixes follow the same shared site-name rules
 * used by the rest of the application; whitespace and casing are harmless,
 * but this is deliberately not a prefix/substring match.
 */
export function normalizeSiteTripHistorySite(site: string | null | undefined): string {
  if (typeof site !== "string") return "";
  return getBaseSiteName(site).trim().replace(/\s+/g, " ").toUpperCase();
}

/** Supplier display normalization: trim/collapse whitespace and uppercase. */
export function normalizeSiteTripSupplier(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Vehicle display normalization. Matching ignores both spacing and hyphens,
 * while the most-recent value's meaningful spacing/hyphen shape is retained
 * in the display (with casing normalized).
 */
export function normalizeSiteTripVehicle(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function siteTripVehicleKey(value: string): string {
  return value.replace(/[\s-]/g, "");
}

function collectSuggestions(
  rows: readonly SiteTripHistoryValueRow[],
  field: "vehicleNumber" | "supplier" | "materialSourceSupplier",
  normalize: (value: string | null | undefined) => string,
  key: (value: string) => string = (value) => value,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  // The storage query orders rows newest first. Keep that order so the first
  // value for a key is also the display value from the most recent trip.
  for (const row of rows) {
    const value = normalize(row[field]);
    if (!value) continue;
    const identity = key(value);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(value);
    if (result.length >= SITE_TRIP_SUGGESTION_LIMIT) break;
  }
  return result;
}

/**
 * Build suggestions from rows already bounded and ordered by the database.
 * This function is intentionally read-only: history rows are never rewritten.
 */
export function buildSiteTripSuggestions(
  rows: readonly SiteTripHistoryValueRow[],
): SiteTripSuggestions {
  return {
    vehicles: collectSuggestions(
      rows,
      "vehicleNumber",
      normalizeSiteTripVehicle,
      siteTripVehicleKey,
    ),
    suppliers: collectSuggestions(rows, "supplier", normalizeSiteTripSupplier),
    materialSourceSuppliers: collectSuggestions(rows, "materialSourceSupplier", normalizeSiteTripSupplier),
  };
}

// Type-only compatibility export for callers that already consume the
// site-trip history contract.
export type { SiteMaterialTripSuggestions } from "./vehicleSupplierAssociation";