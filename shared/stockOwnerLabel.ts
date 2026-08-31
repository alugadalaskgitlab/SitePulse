export interface StockOwnerLabelInput {
  partyId: number | null | undefined;
  materialName: string | null | undefined;
  resolvedPartyName?: string | null;
  unresolvedPartyPrefix?: string;
  nullPartyFallback?: string;
}

/**
 * Diesel with no party is the shared plant stock bucket. Keep the legacy
 * null-party label for every other material until those screens are reviewed
 * separately, and never disguise an unresolved non-null party id.
 */
export function stockOwnerLabel({
  partyId,
  materialName,
  resolvedPartyName,
  unresolvedPartyPrefix = "Party",
  nullPartyFallback = "Unknown",
}: StockOwnerLabelInput): string {
  if (partyId == null) {
    const canonicalMaterial = materialName?.trim().toUpperCase();
    return canonicalMaterial === "DIESEL" || canonicalMaterial === "HSD"
      ? "Plant Common"
      : nullPartyFallback;
  }

  const separator = unresolvedPartyPrefix.endsWith("#") ? "" : " ";
  return resolvedPartyName || `${unresolvedPartyPrefix}${separator}${partyId}`;
}