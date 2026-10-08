import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { siteMaterialTrips as trips } from "../shared/schema";
import { normalizeVehicleSupplierName, normalizeVehicleSupplierVehicle } from "../shared/vehicleSupplierAssociation";

export type BulkTripFilters = {
  dateFrom?: string; dateTo?: string; site?: string; material?: string;
  vehicleNumber?: string; supplier?: string; onlyUnassigned?: boolean;
  permittedSiteNames?: string[];
};

/** Extracted verbatim matching semantics from bulkAssignSiteMaterialTripMaterialSource.
 * Arrangement linking alone includes own source (explicit owner approval).
 */
export function bulkTripConditions(input: BulkTripFilters, includeOwnSource = false) {
  const conditions = [eq(trips.isCancelled, false), eq(trips.isDeleted, false)];
  if (!includeOwnSource || input.onlyUnassigned) conditions.push(sql`${trips.materialSourceType} IS DISTINCT FROM 'own_source'`);
  if (input.dateFrom) conditions.push(gte(trips.date, input.dateFrom));
  if (input.dateTo) conditions.push(lte(trips.date, input.dateTo));
  if (input.site) conditions.push(sql`UPPER(TRIM(${trips.site})) = ${input.site.trim().toUpperCase()}`);
  if (input.material) conditions.push(sql`UPPER(TRIM(${trips.material})) = ${input.material.trim().toUpperCase()}`);
  if (input.vehicleNumber) conditions.push(sql`upper(regexp_replace(trim(${trips.vehicleNumber}), '[[:space:]-]+', '', 'g')) = ${normalizeVehicleSupplierVehicle(input.vehicleNumber)}`);
  if (input.supplier) conditions.push(sql`UPPER(TRIM(${trips.supplier})) = ${normalizeVehicleSupplierName(input.supplier)}`);
  if (input.onlyUnassigned) conditions.push(or(isNull(trips.materialSourceSupplier), sql`TRIM(${trips.materialSourceSupplier}) = ''`)!);
  if (input.permittedSiteNames !== undefined) conditions.push(input.permittedSiteNames.length ? inArray(trips.site, input.permittedSiteNames) : sql`false`);
  return conditions;
}
