import { isLegacyHlcCompany, type CompanyIdentity } from "./companyIdentity";

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

export function resolveOwnCompanyParty<T extends HlcPartyLike & { isActive?: number | null }>(
  partyRows: T[],
  configuredPartyId: string | number | null,
  identity: CompanyIdentity,
): T | null {
  if (configuredPartyId !== null) {
    const selectedId = Number(configuredPartyId);
    return Number.isInteger(selectedId) && selectedId > 0
      ? partyRows.find(party => party.id === selectedId && (party.isActive == null || party.isActive === 1)) ?? null
      : null;
  }
  if (!isLegacyHlcCompany(identity)) return null;
  const active = partyRows.filter(party => party.isActive == null || party.isActive === 1);
  return resolveHlcParty(active);
}
