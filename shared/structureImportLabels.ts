// Header-label matching helpers for the structure-import matrix parser
// (server/routes.ts parseMatrixSheet). Extracted so the matching logic can
// be unit tested without spinning up the full import route.
//
// Header text is normalized (lowercased, non-alphanumeric characters
// stripped) before matching, so variant phrasing like "Chainage (Km)",
// "Chainage in Km", or "Structure Type:" is still recognized — the same
// approach the legacy flat-sheet parser's normHeader() already uses.

export function normalizeHeaderLabel(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isStructureTypeLabel(rawCell: string): boolean {
  return normalizeHeaderLabel(rawCell).startsWith("structuretype");
}

export function isChainageLabel(rawCell: string): boolean {
  return normalizeHeaderLabel(rawCell).startsWith("chainage");
}

// The frozen 4-sheet Structure Schedule Import format uses two separate
// metadata rows — "Chainage From" and "Chainage To" — instead of a single
// "Chainage" row. isChainageFromLabel() also matches a bare "Chainage" row
// (no "From"/"To" suffix) for backward compatibility with older single-row
// sheets, treating that single value as the "from" (point) chainage.
export function isChainageFromLabel(rawCell: string): boolean {
  const n = normalizeHeaderLabel(rawCell);
  return n.startsWith("chainagefrom") || n === "chainage";
}

export function isChainageToLabel(rawCell: string): boolean {
  return normalizeHeaderLabel(rawCell).startsWith("chainageto");
}
