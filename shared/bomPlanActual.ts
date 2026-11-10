import {
  CUBIC_FEET_PER_CUBIC_METRE,
  hasCompleteCompactedLooseProfile,
  looseWeightPerCumFromProfile,
  type CompactedLooseProfile,
} from "./compactedLoose";

export type MaterialPlanBasis = "compacted" | "loose";

export interface MaterialPlanDensity extends CompactedLooseProfile {
  bulkDensity?: number | null;
}

export interface SiteMaterialReceiptScope {
  boqProjectId: number | null | undefined;
  site: string | null | undefined;
}

export function normalisePlanMaterialName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase();
}

function canonicalUnit(value: string): string {
  const key = value.trim().toUpperCase().replace(/[²³]/g, (part) => part === "³" ? "3" : "2");
  const compact = key.replace(/[^A-Z0-9]/g, "");
  if (["MT", "T", "TON", "TONNE", "TONNES"].includes(compact)) return "MT";
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS"].includes(compact)) return "KG";
  if (["CUM", "M3", "CBM", "CUBICMETRE", "CUBICMETRES"].includes(compact)) return "CUM";
  if (["CFT", "CUFT", "CUBICFOOT", "CUBICFEET"].includes(compact)) return "CFT";
  if (["KL", "KILOLITRE", "KILOLITER", "KILOLITRES", "KILOLITERS"].includes(compact)) return "KL";
  if (["L", "LITRE", "LITER", "LITRES", "LITERS"].includes(compact)) return "L";
  if (["RM", "M", "METRE", "METER", "METRES", "METERS"].includes(compact)) return "RM";
  return compact;
}

function compactedDensity(profile: MaterialPlanDensity | null | undefined): number | null {
  if (
    !profile ||
    !Number.isFinite(Number(profile.rolledDensity)) || Number(profile.rolledDensity) <= 0 ||
    !Number.isFinite(Number(profile.rollingPct)) || Number(profile.rollingPct) <= 0
  ) return null;
  return Number(profile.rolledDensity) * Number(profile.rollingPct) / 100;
}

/**
 * Volume-to-mass conversion for this view must use the material's own saved
 * delivered density/profile. Callers must not pass a mix/layer profile here.
 */
export function materialPlanQuantity(
  quantity: number,
  fromUom: string,
  toUom: string,
  profile: MaterialPlanDensity | null | undefined,
  basis: MaterialPlanBasis = "loose",
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const from = canonicalUnit(fromUom);
  const to = canonicalUnit(toUom);
  if (!from || !to) return from === to ? quantity : null;
  if (from === to) return quantity;

  if (from === "KG" && to === "MT") return quantity / 1000;
  if (from === "MT" && to === "KG") return quantity * 1000;
  if (from === "L" && to === "KL") return quantity / 1000;
  if (from === "KL" && to === "L") return quantity * 1000;

  if ((from === "CUM" || from === "CFT") && (to === "CUM" || to === "CFT")) {
    const cum = from === "CUM" ? quantity : quantity / CUBIC_FEET_PER_CUBIC_METRE;
    return to === "CUM" ? cum : cum * CUBIC_FEET_PER_CUBIC_METRE;
  }

  const density = basis === "compacted"
    ? compactedDensity(profile)
    : looseWeightPerCumFromProfile(profile) ??
      (profile?.bulkDensity != null && Number(profile.bulkDensity) > 0 ? Number(profile.bulkDensity) : null);
  if (density == null || !Number.isFinite(density) || density <= 0) return null;

  const toMt = (amount: number, unit: string): number | null => {
    if (unit === "MT") return amount;
    if (unit === "KG") return amount / 1000;
    if (unit === "CUM") return amount * density;
    if (unit === "CFT") return amount * density / CUBIC_FEET_PER_CUBIC_METRE;
    if (unit === "KL") return amount * density;
    if (unit === "L") return amount * density / 1000;
    return null;
  };
  const fromMt = (amount: number, unit: string): number | null => {
    if (unit === "MT") return amount;
    if (unit === "KG") return amount * 1000;
    if (unit === "CUM") return amount / density;
    if (unit === "CFT") return amount / density * CUBIC_FEET_PER_CUBIC_METRE;
    if (unit === "KL") return amount / density;
    if (unit === "L") return amount / density * 1000;
    return null;
  };
  const asMt = toMt(quantity, from);
  if (asMt == null) return null;
  return fromMt(asMt, to);
}

export function soilCompactedToLooseCum(
  compactedCum: number,
  profile: CompactedLooseProfile | null | undefined,
  legacyLooseToCompactedFactors: number[] = [],
): number | null {
  if (!Number.isFinite(compactedCum) || compactedCum < 0) return null;
  if (profile && hasCompleteCompactedLooseProfile(profile)) {
    return compactedCum * profile.looseFactor;
  }
  const valid = legacyLooseToCompactedFactors.filter((factor) => Number.isFinite(factor) && factor > 0);
  if (valid.length !== 1) return null;
  return compactedCum / valid[0];
}

export function siteReceiptAttribution(
  receipt: SiteMaterialReceiptScope,
  projectId: number,
  siteName: string,
): "by project/item" | "by site" | null {
  if (receipt.boqProjectId === projectId) return "by project/item";
  if (receipt.boqProjectId != null) return null;
  return normalisePlanMaterialName(receipt.site) === normalisePlanMaterialName(siteName)
    ? "by site"
    : null;
}

export function explicitlyLinkedStoreIssue(
  issue: { boqProjectId: number | null | undefined; boqItemId: number | null | undefined },
  projectId: number,
  boqItemId: number,
): boolean {
  return Number(issue.boqProjectId) === projectId &&
    Number(issue.boqItemId) === boqItemId &&
    issue.boqProjectId != null &&
    issue.boqItemId != null;
}

export type MaterialUsedSource = "plant dispatch" | "DPR × recipe" | "linked store issue";

export function useSourceForLayer(
  layerType: string | null | undefined,
  granularSource?: string | null,
): MaterialUsedSource {
  if (layerType === "bituminous" || (layerType === "granular" && granularSource === "plant")) {
    return "plant dispatch";
  }
  if (layerType === "none") return "linked store issue";
  return "DPR × recipe";
}

export function remainingMaterialToBuy(
  need: number | null,
  boughtOrStock: number | null,
  used: number | null,
  plantMix: boolean,
): { remaining: number | null; excess: number | null } {
  if (need == null || boughtOrStock == null || (plantMix && used == null)) {
    return { remaining: null, excess: null };
  }
  const balance = plantMix
    ? need - (used ?? 0) - boughtOrStock
    : need - boughtOrStock;
  return balance < 0
    ? { remaining: 0, excess: -balance }
    : { remaining: balance, excess: null };
}

export function remainingBySupplySource(input: {
  siteNeed: number;
  plantNeed: number;
  bought: number | null;
  plantUsed: number | null;
  atPlantNow: number | null;
  hasSiteSupply: boolean;
  hasPlantMix: boolean;
}): { remaining: number | null; excess: number | null } {
  if (
    (input.hasSiteSupply && input.bought == null) ||
    (input.hasPlantMix && (input.plantUsed == null || input.atPlantNow == null))
  ) return { remaining: null, excess: null };

  const siteBalance = input.hasSiteSupply ? input.siteNeed - (input.bought ?? 0) : 0;
  const plantBalance = input.hasPlantMix
    ? input.plantNeed - (input.plantUsed ?? 0) - (input.atPlantNow ?? 0)
    : 0;
  const balance = siteBalance + plantBalance;
  return balance < 0
    ? { remaining: 0, excess: -balance }
    : { remaining: balance, excess: null };
}

export function siteMaterialLyingBalance(
  delivered: number,
  consumed: number,
): { lying: number; overConsumed: boolean } {
  const safeDelivered = Number.isFinite(delivered) ? delivered : 0;
  const safeConsumed = Number.isFinite(consumed) ? consumed : 0;
  return {
    lying: Math.max(0, safeDelivered - safeConsumed),
    overConsumed: safeConsumed > safeDelivered,
  };
}

export function reportedMaterialNeed(
  need: number,
  complete: boolean,
  missingEarthworkValueCount = 0,
): number | null {
  if (complete) return need;
  return missingEarthworkValueCount > 0 && need > 0 ? need : null;
}

export function materialNeedsCftEquivalent(name: string): boolean {
  return /aggregate|sand|stone\s*dust|dust|filler/i.test(name);
}

export function plantMixComponentQuantities(
  loadWeightMt: number,
  components: Array<{ materialName: string; percent: number | null | undefined }>,
  bitumenPercent: number | null | undefined,
  binderName: string,
): Array<{ materialName: string; quantityMt: number }> {
  if (!Number.isFinite(loadWeightMt) || loadWeightMt < 0) return [];
  const componentRows = components
    .filter((component) => component.materialName.trim() && Number.isFinite(Number(component.percent)) && Number(component.percent) >= 0)
    .map((component) => ({
      materialName: component.materialName.trim(),
      quantityMt: loadWeightMt * Number(component.percent) / 100,
    }));
  const hasBinderComponent = components.some((component) =>
    /bitumen|binder|emulsion|vg[\s-]?\d+/i.test(component.materialName),
  );
  const binderPct = Number(bitumenPercent);
  if (!hasBinderComponent && Number.isFinite(binderPct) && binderPct > 0) {
    componentRows.push({ materialName: binderName, quantityMt: loadWeightMt * binderPct / 100 });
  }
  return componentRows;
}

export function materialTonnesToCft(
  tonnes: number | null,
  profile: MaterialPlanDensity | null | undefined,
): number | null {
  if (tonnes == null || !Number.isFinite(tonnes) || tonnes < 0) return null;
  const deliveredDensity = looseWeightPerCumFromProfile(profile) ??
    (profile?.bulkDensity != null && Number(profile.bulkDensity) > 0 ? Number(profile.bulkDensity) : null);
  return deliveredDensity == null
    ? null
    : tonnes / deliveredDensity * CUBIC_FEET_PER_CUBIC_METRE;
}
