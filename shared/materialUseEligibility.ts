/** False Soil rows saved on clearance / scarifying recipes are historical
 * recipe data, not material use. Keep the recipe rows, but exclude them from
 * generated requirements and stock calculations. */
export function isClearanceOrScarifyingSoilRecipe(
  item: { description?: unknown; itemName?: unknown; workCategory?: unknown } | null | undefined,
  materialName: unknown,
): boolean {
  const material = String(materialName ?? "");
  if (!/\bsoil\b|\bearth\b/i.test(material)) return false;
  const identity = [
    item?.workCategory,
    item?.itemName,
    item?.description,
  ].map(value => String(value ?? "")).join(" ");
  return /\bclearing\s*(?:and|&)\s*grubbing\b|\bscarifying\b/i.test(identity);
}

export function directGranularMasterHint(item: {
  description?: unknown; itemName?: unknown; workCategory?: unknown; layerConfig?: any;
}): string | null {
  const explicit = item?.layerConfig?.materialMasterName ?? item?.layerConfig?.mixType ?? "";
  const text = `${explicit} ${item?.itemName ?? ""} ${item?.description ?? ""} ${item?.workCategory ?? ""}`;
  if (/\bWMM\b|wet\s+mix\s+macadam/i.test(text)) return "WMM";
  if (/\bGSB\b|granular\s+sub[- ]?base/i.test(text)) return "GSB";
  return null;
}
