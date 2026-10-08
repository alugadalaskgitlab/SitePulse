import { arrangementPricingSchema, tripBillIdentity } from "./vendorBillArrangement";
import { vendorBillAutoSourceFromCandidate } from "./siteName";

type Item = { source?: string | null; qty?: number | null; unit?: string | null; rate?: number | null; amount?: number | null; arrangementPricing?: unknown; category?: string | null; siteName?: string | null; date?: string | null };
function equalSnapshot(a: unknown, b: unknown) {
  const pa = arrangementPricingSchema.safeParse(a), pb = arrangementPricingSchema.safeParse(b);
  return pa.success && pb.success && JSON.stringify(pa.data) === JSON.stringify(pb.data);
}
function sameNumbers(a: Item, b: Item) {
  return ["qty", "rate", "amount"].every(k => a[k as keyof Item] === b[k as keyof Item]) &&
    (a.unit || "").toUpperCase() === (b.unit || "").toUpperCase();
}
/** Saved snapshots are immutable; new ones must be the server's current facts. */
export function arrangementBillValidationError(
  submitted: readonly Item[], authoritative: readonly (Item & { sourceType?: string | null; sourceId?: number | string | null })[],
  existing: readonly Item[] = [],
): string | null {
  for (const item of submitted) {
    const saved = existing.find(row => row.source && row.source.toLowerCase() === item.source?.toLowerCase());
    if (saved?.arrangementPricing) {
      if (!equalSnapshot(saved.arrangementPricing, item.arrangementPricing) || !sameNumbers(saved, item) ||
          saved.date !== item.date || saved.category !== item.category || saved.siteName !== item.siteName)
        return "Saved arrangement pricing is frozen. Its snapshot, quantity, rate and amount cannot be changed.";
      continue;
    }
    if (saved && item.arrangementPricing) return "An existing bill item cannot be given an inferred arrangement snapshot.";
    const candidate = authoritative.find(row => vendorBillAutoSourceFromCandidate(row) === item.source?.toLowerCase());
    if (!item.arrangementPricing && !candidate?.arrangementPricing &&
        tripBillIdentity(item.source)?.role !== "_arrangement") continue;
    if (!candidate?.arrangementPricing || !equalSnapshot(candidate.arrangementPricing, item.arrangementPricing) ||
        !sameNumbers(candidate, item))
      return "Arrangement pricing no longer matches the server's trip and agreed terms. Refresh the activity before saving; unresolved rows must remain visibly unpriced.";
  }
  return null;
}
