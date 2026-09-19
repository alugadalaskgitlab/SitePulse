/** Human-readable reference for the exact saved DPR record. */
export function formatDprReference(id: number | string): string {
  return `DPR-${id}`;
}

/**
 * Match an exact saved DPR id from either its display reference (DPR-123)
 * or the bare numeric id (123). Invalid non-empty searches match nothing.
 */
export function dprMatchesReference(id: unknown, search: string): boolean {
  const query = search.trim();
  if (!query) return true;

  const match = query.match(/^(?:DPR\s*-\s*)?(\d+)$/i);
  if (!match) return false;

  const searchedId = Number(match[1]);
  const savedId = typeof id === "number" ? id : Number(id);
  return Number.isSafeInteger(searchedId)
    && Number.isSafeInteger(savedId)
    && searchedId === savedId;
}