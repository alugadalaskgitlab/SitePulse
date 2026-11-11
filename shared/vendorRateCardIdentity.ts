/**
 * Persisted manual rate-card rows need an identity that does not depend on
 * whether the row happens to have historical usage yet.  Keep this marker in
 * the existing notes column so this remains a data-only change (no migration).
 */
export const MANUAL_VENDOR_RATE_CARD_NOTE = "RATE_CARD_MANUAL_ROW";

export function isManualVendorRateCard(notes: string | null | undefined): boolean {
  return notes === MANUAL_VENDOR_RATE_CARD_NOTE;
}

export function vendorRateCardIdentity(category: string | null | undefined, itemKey: string, unit: string | null | undefined): string {
  return `${(category || "").toUpperCase().trim()}:${itemKey.toUpperCase().trim()}:${(unit || "").toUpperCase().trim()}`;
}