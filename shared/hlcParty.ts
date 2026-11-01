export type HlcPartyLike = { id: number; name: string | null };

/**
 * Resolve the configured HLC Party record without ever guessing an arbitrary
 * party. Exact "HLC" wins; otherwise use a name containing "HIGH LANE".
 */
export function resolveHlcParty<T extends HlcPartyLike>(partyRows: T[]): T | null {
  const exactMatches = partyRows.filter(party => party.name?.trim().toUpperCase() === "HLC");
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;
  const highLaneMatches = partyRows.filter(party => party.name?.toUpperCase().includes("HIGH LANE"));
  return highLaneMatches.length === 1 ? highLaneMatches[0] : null;
}
