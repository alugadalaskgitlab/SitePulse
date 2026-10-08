import { z } from "zod";

export const arrangementBillingTermsSchema = z.object({
  scope: z.enum(["full_service", "transport_only"]),
  basis: z.enum(["trip", "cum", "mt", "km"]),
}).strict();
export type ArrangementBillingTerms = z.infer<typeof arrangementBillingTermsSchema>;

/** Frozen on explicit bill save; never reconstructed from today's arrangement on read. */
export const arrangementPricingSchema = z.object({
  arrangementId: z.number().int().positive(),
  tripId: z.number().int().positive(),
  terms: arrangementBillingTermsSchema.nullable(),
  tripQuantity: z.number().finite().positive(),
  tripUom: z.string().min(1),
  rateApplied: z.number().finite().nonnegative(),
  billedQty: z.number().finite().nonnegative(),
  billedUnit: z.string(),
  reason: z.string().nullable(),
  conflict: z.boolean(),
}).strict();
export type ArrangementPricing = z.infer<typeof arrangementPricingSchema>;
export type ArrangementBillingFacts = {
  id: number; billingTerms?: ArrangementBillingTerms | null;
  agreedRate?: number | null;
  tripRates?: { quantity: number; uom: string; rate: number }[] | null;
};
export const ARRANGEMENT_TRIP_SOURCE = "site_material_trip_arrangement";
export function arrangementBasisLabel(terms?: ArrangementBillingTerms | null) {
  if (!terms) return "Billing basis not declared — manual review required";
  return `${terms.scope === "full_service" ? "Full service: extraction, loading, haulage and tipping" : "Transport only"} · ${{
    trip: "per trip, by recorded size", cum: "per cum", mt: "per MT (not auto-priced)", km: "per km (not auto-priced)",
  }[terms.basis]}`;
}
export function priceArrangementTrip(
  trip: { id: number; quantity: number; uom?: string | null },
  arrangement: ArrangementBillingFacts, conflict = false,
): ArrangementPricing {
  const p: ArrangementPricing = {
    arrangementId: arrangement.id, tripId: trip.id, terms: arrangement.billingTerms ?? null,
    tripQuantity: Number(trip.quantity), tripUom: trip.uom || "NOS",
    rateApplied: 0, billedQty: 1, billedUnit: "TRIP", reason: null, conflict,
  };
  if (conflict) p.reason = `Unpriced — the landed material row already includes delivery, but transport-only Arrangement #${arrangement.id} also covers haulage for this same vendor and trip #${trip.id}. The owner must decide which applies; no additional haulage row has been added.`;
  else if (!p.terms) p.reason = `Unpriced — Arrangement #${arrangement.id} has no declared commercial basis; existing rates do not declare one.`;
  else if (p.terms.basis === "trip") {
    const rates = (arrangement.tripRates ?? []).filter(r => Number(r.quantity) === p.tripQuantity && r.uom === p.tripUom);
    if (rates.length !== 1 || !(rates[0].rate > 0) || !Number.isFinite(rates[0].rate)) {
      p.reason = `Unpriced — no unique exact rate for ${p.tripQuantity} ${p.tripUom} in Arrangement #${arrangement.id}.`;
    } else p.rateApplied = rates[0].rate;
  } else if (p.terms.basis === "cum") {
    const unit = p.tripUom.trim().toUpperCase();
    const qty = ["CUM", "M3", "M³", "CU.M"].includes(unit) ? p.tripQuantity
      : ["CFT", "FT3", "FT³", "CU.FT"].includes(unit) ? p.tripQuantity / 35.3147 : null;
    p.billedUnit = "CUM";
    p.billedQty = qty ?? 0;
    if (qty == null) p.reason = `Unpriced — ${p.tripUom} cannot be converted exactly to cum; no density is inferred.`;
    else if (arrangement.agreedRate == null || !Number.isFinite(arrangement.agreedRate) || arrangement.agreedRate <= 0)
      p.reason = `Unpriced — Arrangement #${arrangement.id} has no agreed per-cum rate.`;
    else p.rateApplied = arrangement.agreedRate;
  } else p.reason = p.terms.basis === "mt"
    ? "Unpriced — arrangement per-MT pricing is not supported in this batch; no weight or density is inferred."
    : "Unpriced — arrangement per-km pricing is not supported in this batch; the separate transport rate-card path is unchanged.";
  return p;
}
export function arrangementWorking(p?: ArrangementPricing | null, count = 1) {
  if (!p) return null;
  if (p.reason) return p.reason;
  const qty = p.billedQty * count;
  return `₹${p.rateApplied.toLocaleString("en-IN")}/${p.billedUnit.toLowerCase()} × ${qty.toLocaleString("en-IN", { maximumFractionDigits: 6 })} ${p.billedUnit === "TRIP" ? "trips" : "cum"} = ₹${(p.rateApplied * qty).toLocaleString("en-IN", { maximumFractionDigits: 2 })}, Arrangement #${p.arrangementId} · ${p.tripQuantity} ${p.tripUom} per trip`;
}
export function tripBillIdentity(source?: string | null) {
  const m = /^auto:site_material_trip(_material|_transport|_arrangement)?:(\d+)$/.exec((source || "").toLowerCase());
  return m ? { tripId: Number(m[2]), role: m[1] || "landed" } : null;
}
/** Extend the existing source identity, not a second already-billed mechanism. */
export function tripBillSourcesConflict(left?: string | null, right?: string | null) {
  const a = tripBillIdentity(left), b = tripBillIdentity(right);
  return !!a && !!b && a.tripId === b.tripId &&
    (a.role === b.role || a.role === "_arrangement" || b.role === "_arrangement");
}
