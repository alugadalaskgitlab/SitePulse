const BITUMINOUS_MIX_CODES = new Set([
  "BC",
  "DBM",
  "DGBM",
  "SDBC",
  "BM",
  "MSS",
  "OGPC",
]);

export function isBituminousMixTemplate(mixType: string | null | undefined, bitumenPercent?: number | null): boolean {
  if (Number.isFinite(Number(bitumenPercent)) && Number(bitumenPercent) > 0) return true;
  const normalized = String(mixType ?? "").trim().toUpperCase();
  if (!normalized) return false;
  if (normalized.includes("BITUMINOUS")) return true;
  return normalized.split(/[^A-Z0-9]+/).some(token => BITUMINOUS_MIX_CODES.has(token));
}

export function isGranularRoadMixMaterial(name: string | null | undefined): boolean {
  const normalized = String(name ?? "").trim().toUpperCase();
  return /\bWMM\b|\bWET\s+MIX\s+MACADAM\b|\bGSB\b|\bGRANULAR\s+SUB[-\s]?BASE\b/.test(normalized);
}

export function isMixTemplateProportionMaterial(category: string | null | undefined): boolean {
  return category === "Aggregate" || category === "Filler";
}

export function shouldShowMixTemplateProportionMaterial(input: {
  category?: string | null;
  name?: string | null;
  mixType?: string | null;
  bitumenPercent?: number | null;
}): boolean {
  if (!isMixTemplateProportionMaterial(input.category)) return false;
  return !(isBituminousMixTemplate(input.mixType, input.bitumenPercent) && isGranularRoadMixMaterial(input.name));
}

export function shouldShowMixTemplateRebuildBanner(proportionsChanged: boolean, dispatchCount: unknown): boolean {
  return proportionsChanged && Number(dispatchCount) > 0;
}
