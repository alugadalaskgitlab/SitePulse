import { z } from "zod";
import { calcCandidateAmount, groupRateItems } from "./vendorBillCandidates";
import { matchingRateCardsForGroup, type VendorRateCardRecord } from "../client/src/lib/vendorBillRateSelection";

/** Frozen on explicit bill save; never reconstructed from today's card on read. */
export const transportPricingSchema = z.object({
  basis: z.enum(["trip", "mt"]),
  cardId: z.number().int().positive().nullable(),
  cardLeadDistanceKm: z.number().finite().positive(),
  payloadMt: z.number().finite().positive(),
  actualMt: z.number().finite().nonnegative().nullable(),
  tripCount: z.number().finite().nonnegative(),
}).strict();
export type TransportPricing = z.infer<typeof transportPricingSchema>;
type TransportCard = VendorRateCardRecord & {
  id?: number; leadDistanceKm?: number | null; payloadMt?: number | null; ratePerKm?: number | null;
};
type Row = {
  category: string; description: string; equipmentId: number | null;
  unit: string; qty: number; rate: number; amount: number; leadDistance?: number | null;
  actualMt?: number | null; physicalQuantity?: number; physicalUnit?: string;
  transportPricing?: TransportPricing | null;
};
export function quantityInMt(qty: number, unit: string): number | null {
  if (!Number.isFinite(qty) || qty < 0) return null;
  const u = unit.trim().toUpperCase();
  if (["MT", "TON", "TONS", "TONNE", "TONNES"].includes(u)) return qty;
  if (["KG", "KGS"].includes(u)) return qty / 1000;
  return null; // Never infer density, payload, or weight from a description.
}
export function applyTransportCard<T extends Row>(row: T, cards: TransportCard[], vendor: string): T {
  if (row.category !== "transport" || row.transportPricing) return row;
  const configured = cards.filter(c => c.category === "transport" &&
    Number.isFinite(c.leadDistanceKm) && c.leadDistanceKm! > 0 &&
    Number.isFinite(c.payloadMt) && c.payloadMt! > 0 &&
    Number.isFinite(c.ratePerKm) && c.ratePerKm! >= 0);
  const group = groupRateItems([row])[0];
  const exact = configured.filter(c => matchingRateCardsForGroup(group, c.unit || "", [c], vendor, { allowVendorAliases: true }).length);
  // A single configured transport card is the vendor's default. Ambiguous
  // cards are never selected by timestamp, spelling similarity or array order.
  const matches = exact.length ? exact : configured;
  if (matches.length !== 1) return row;
  const card = matches[0];
  const weight = quantityInMt(row.physicalQuantity ?? row.qty, row.physicalUnit ?? row.unit);
  const actualMt = row.actualMt ?? weight;
  const tripCount = /^(TRIP|TRIPS)$/i.test(row.unit) ? row.qty : 1;
  const basis = weight != null ? "mt" : "trip";
  const next = { ...row,
    physicalQuantity: row.physicalQuantity ?? row.qty, physicalUnit: row.physicalUnit ?? row.unit,
    leadDistance: row.leadDistance ?? card.leadDistanceKm!,
    rate: card.ratePerKm!,
    qty: basis === "mt" ? actualMt! : tripCount,
    unit: basis === "mt" ? "MT" : "TRIP",
    transportPricing: { basis, cardId: card.id ?? null, cardLeadDistanceKm: card.leadDistanceKm!,
      payloadMt: card.payloadMt!, actualMt, tripCount } as TransportPricing,
  };
  return { ...next, amount: calcCandidateAmount(next) };
}
export function changeTransportBasis<T extends Row>(row: T, basis: "trip" | "mt"): T {
  const setup = row.transportPricing;
  if (!setup || (basis === "mt" && setup.actualMt == null)) return row;
  const next = { ...row, transportPricing: { ...setup, basis },
    unit: basis === "mt" ? "MT" : "TRIP", qty: basis === "mt" ? setup.actualMt! : setup.tripCount };
  return { ...next, amount: calcCandidateAmount(next) };
}
export function transportWorking(row: { rate?: number | null; leadDistance?: number | null; transportPricing?: TransportPricing | null }): string | null {
  const p = row.transportPricing;
  if (!p) return null;
  const rate = Number(row.rate || 0), lead = Number(row.leadDistance || 0);
  const fmt = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const trip = rate * lead * 2;
  return `₹${fmt(trip)}/trip (₹${fmt(rate)}/km × ${fmt(lead)} km × 2) · ₹${fmt(trip / p.payloadMt)}/MT · payload ${fmt(p.payloadMt)} MT · carried ${p.actualMt == null ? "weight not recorded" : `${fmt(p.actualMt)} MT`}`;
}
