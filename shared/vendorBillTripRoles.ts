import { classifyTripRoles, type TripRoleFacts } from "./tripTransportRoles";
import { ARRANGEMENT_TRIP_SOURCE, priceArrangementTrip, type ArrangementBillingFacts } from "./vendorBillArrangement";

export const TRIP_ROLE_WARNING = "Roles not confirmed — this trip may be material or transport";
type Trip = TripRoleFacts & {
  id: number; date: string | Date; material?: string | null; quantity: number;
  uom?: string | null; site?: string | null; receiptNumber?: string | null;
  isCancelled?: boolean; isDeleted?: boolean;
};

/** Matching is supplied by the existing SQL alias matcher, never inferred here. */
export function vendorBillTripCandidate(
  row: Trip, matchesSeller: boolean, matchesTransporter: boolean, billType: string,
  arrangement?: ArrangementBillingFacts | null, matchesAgency = false,
) {
  if (row.isCancelled || row.isDeleted || !(row.quantity > 0) ||
      (!matchesSeller && !matchesTransporter && !matchesAgency)) return null;
  const role = classifyTripRoles(row);
  if (arrangement && matchesAgency && ["all", "material", "transport"].includes(billType)) {
    const keepMaterial = matchesSeller && role === "same_party" && arrangement.billingTerms?.scope !== "full_service";
    const conflict = keepMaterial && arrangement.billingTerms?.scope === "transport_only";
    const pricing = priceArrangementTrip(row, arrangement, conflict);
    // No second haulage row alongside a landed-material row. Keep that row,
    // visibly unpriced, even in a transport pull so the conflict cannot hide.
    return {
      date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
      category: keepMaterial ? "material" : "other",
      description: keepMaterial ? `${(row.material || "MATERIAL").toUpperCase()} (SITE TRIP)`
        : `${(row.material || "MATERIAL").toUpperCase()} hauled against Arrangement #${arrangement.id} — ${row.quantity} ${row.uom || "NOS"}`,
      source: "auto", sourceType: keepMaterial ? null : ARRANGEMENT_TRIP_SOURCE,
      sourceId: keepMaterial ? `site_material_trip:${row.id}` : row.id,
      qty: keepMaterial ? row.quantity : pricing.billedQty,
      unit: keepMaterial ? row.uom || "NOS" : pricing.billedUnit,
      rate: pricing.rateApplied, amount: keepMaterial ? 0 : pricing.rateApplied * pricing.billedQty,
      siteName: `SITE: ${(row.site || "").toUpperCase()}`,
      vehicleNumber: row.vehicleNumber ?? null, receiptNumber: row.receiptNumber ?? null,
      arrangementPricing: pricing, transportPricingNote: pricing.reason,
    };
  }
  // Own-source material has no seller liability, even if a caller supplies
  // a stale seller match. Transport continues through the existing path.
  if (row.materialSourceType === "own_source") {
    matchesSeller = false;
    if (!matchesTransporter || role === "own_source_in_house" || role === "unresolved") return null;
  }
  const base = {
    date: typeof row.date === "string" ? row.date : row.date.toISOString().split("T")[0],
    qty: row.quantity, unit: row.uom || "NOS", source: "auto",
    siteName: `SITE: ${(row.site || "").toUpperCase()}`,
    vehicleNumber: row.vehicleNumber ?? null, receiptNumber: row.receiptNumber ?? null,
  };
  const material = (row.material || "MATERIAL").toUpperCase();
  if (role === "unresolved") {
    return { ...base, category: "other", description: `${material} (SITE TRIP)`,
      sourceType: "site_material_trip_unresolved", sourceId: row.id,
      rolesUnconfirmed: true, tripId: row.id, roleWarning: TRIP_ROLE_WARNING };
  }
  if (matchesSeller && (billType === "material" || billType === "all")) {
    // Retain the first legacy landed row exactly, not the duplicate source row.
    if (role === "same_party") return { ...base, category: "material",
      description: `${material} (SITE TRIP)`, sourceId: `site_material_trip:${row.id}` };
    return { ...base, category: "material", description: `${material} (SITE TRIP MATERIAL)`,
      sourceType: "site_material_trip_material", sourceId: row.id };
  }
  if ((role === "different_parties" || role === "own_source_agency") && matchesTransporter &&
      (billType === "transport" || billType === "all")) {
    return { ...base, category: "transport", description: `${material} - TRANSPORT`,
      qty: 1, unit: "TRIP", physicalQuantity: row.quantity, physicalUnit: row.uom || "NOS",
      sourceType: "site_material_trip_transport", sourceId: row.id };
  }
  return null;
}
