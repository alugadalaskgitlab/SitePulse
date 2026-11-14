import { calculateBomDemand, type BomInputBar, type BomInputItem } from "./planningEngine";

export type FundRecipeOverride = Partial<Record<
  "compactedDensity" | "bitumenPercent" | "dryerLdoPerMt" | "wmmDensity" |
  "soilLooseFactor" | "sprayRateKgPerSqm" | "waterAddedPerPart",
  number
>>;

export type FundRecipeOverrides = Record<string, FundRecipeOverride>;

export type FundPlanWork = { itemId: number; quantity: number };

export function quantityForFundPlanLength(scopeQuantity: number, scopeLengthM: number, lengthM: number): number {
  if (![scopeQuantity, scopeLengthM, lengthM].every(Number.isFinite) || scopeLengthM <= 0 || lengthM < 0) return 0;
  return lengthM * scopeQuantity / scopeLengthM;
}

function mtFactor(uom: unknown): number | null {
  const unit = String(uom ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["MT", "T", "TON", "TONS", "TONNE", "TONNES"].includes(unit)) return 1;
  if (["KG", "KGS"].includes(unit)) return 0.001;
  return null;
}

function litresFactor(uom: unknown): number | null {
  const unit = String(uom ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["L", "LITER", "LITRE", "LITERS", "LITRES"].includes(unit)) return 1;
  if (["KL"].includes(unit)) return 1000;
  return null;
}

function materialRows(item: BomInputItem) {
  return item.derivedKeyMaterials?.length
    ? item.derivedKeyMaterials.map(row => ({ ...row }))
    : item.materials.map(row => ({ ...row }));
}

function applyRecipeOverrides(item: BomInputItem, overrides: FundRecipeOverride): BomInputItem {
  if (!Object.keys(overrides).length) return item;
  const layerType = String(item.layerConfig?.layerType ?? "").toLowerCase();
  const settings = (item as any).fundPlannerRecipeSettings ?? {};
  const rows = materialRows(item);
  const massRows = rows.filter(row => mtFactor(row.uom) != null && !/ldo|diesel|fuel/i.test(row.materialName));
  const beforeTotalMt = massRows.reduce((sum, row) => sum + row.qtyPerBoqUnit * (mtFactor(row.uom) ?? 0), 0);
  let targetTotalMt = beforeTotalMt;

  if (layerType === "bituminous" && overrides.compactedDensity != null) {
    const baseDensity = Number(settings.compactedDensity);
    if (baseDensity > 0 && overrides.compactedDensity > 0) {
      targetTotalMt = beforeTotalMt * overrides.compactedDensity / baseDensity;
      for (const row of massRows) row.qtyPerBoqUnit *= overrides.compactedDensity / baseDensity;
    }
  }
  if (layerType === "granular" && overrides.wmmDensity != null &&
      /wmm|wet\s*mix/i.test(String(settings.mixType ?? item.layerConfig?.mixType ?? ""))) {
    const baseDensity = Number(settings.wmmDensity);
    if (baseDensity > 0 && overrides.wmmDensity > 0) {
      targetTotalMt = beforeTotalMt * overrides.wmmDensity / baseDensity;
      for (const row of massRows) row.qtyPerBoqUnit *= overrides.wmmDensity / baseDensity;
    }
  }

  if (layerType === "bituminous" && overrides.bitumenPercent != null) {
    const binderRows = massRows.filter(row => /bitumen|binder|vg\s*-?\s*\d+|emulsion/i.test(row.materialName));
    const aggregateRows = massRows.filter(row => !binderRows.includes(row));
    const currentBinderMt = binderRows.reduce((sum, row) => sum + row.qtyPerBoqUnit * (mtFactor(row.uom) ?? 0), 0);
    const currentAggregateMt = aggregateRows.reduce((sum, row) => sum + row.qtyPerBoqUnit * (mtFactor(row.uom) ?? 0), 0);
    const basePercent = Number(settings.bitumenPercent);
    const targetPercent = Math.min(100, Math.max(0, overrides.bitumenPercent));
    const total = targetTotalMt > 0 ? targetTotalMt : beforeTotalMt;
    const targetBinder = total * targetPercent / 100;
    const targetAggregate = total - targetBinder;
    if (binderRows.length && currentBinderMt > 0) {
      const scale = targetBinder / currentBinderMt;
      for (const row of binderRows) row.qtyPerBoqUnit *= scale;
    }
    if (aggregateRows.length && currentAggregateMt > 0) {
      const scale = targetAggregate / currentAggregateMt;
      for (const row of aggregateRows) row.qtyPerBoqUnit *= scale;
    }
    if (!(basePercent > 0) && !binderRows.length) {
      // No binder row exists in the saved recipe; never invent a new material row.
      for (const row of aggregateRows) row.qtyPerBoqUnit *= 1;
    }
  }

  if (layerType === "bituminous" && overrides.dryerLdoPerMt != null) {
    const fuelRows = rows.filter(row => /ldo|diesel|fuel/i.test(row.materialName) && litresFactor(row.uom) != null);
    const baseRate = Number(settings.dryerLdoPerMt);
    const targetRate = Math.max(0, overrides.dryerLdoPerMt);
    const currentFuelLitres = fuelRows.reduce((sum, row) => sum + row.qtyPerBoqUnit * (litresFactor(row.uom) ?? 0), 0);
    const wantedFuelLitres = (targetTotalMt || beforeTotalMt) * targetRate;
    if (fuelRows.length && currentFuelLitres > 0) {
      const scale = wantedFuelLitres / currentFuelLitres;
      for (const row of fuelRows) row.qtyPerBoqUnit *= scale;
    } else if (fuelRows.length && baseRate > 0) {
      for (const row of fuelRows) row.qtyPerBoqUnit *= targetRate / baseRate;
    }
  }

  if (layerType === "earthwork" && overrides.soilLooseFactor != null) {
    const baseFactor = Number(settings.soilLooseFactor);
    if (baseFactor > 0 && overrides.soilLooseFactor > 0) {
      const scale = overrides.soilLooseFactor / baseFactor;
      for (const row of rows) {
        if (/soil|earth|borrow/i.test(row.materialName)) row.qtyPerBoqUnit *= scale;
      }
    }
  }

  if (layerType === "spray_coat") {
    if (overrides.sprayRateKgPerSqm != null && overrides.sprayRateKgPerSqm >= 0) {
      const rate = overrides.sprayRateKgPerSqm;
      for (const row of rows) {
        if (/emulsion/i.test(row.materialName) && mtFactor(row.uom) != null) {
          row.qtyPerBoqUnit = rate / 1000;
        }
      }
    }
    if (overrides.waterAddedPerPart != null && overrides.waterAddedPerPart >= 0) {
      for (const row of rows) {
        if (/emulsion/i.test(row.materialName)) row.waterAddedPerPart = overrides.waterAddedPerPart;
      }
    }
  }

  const derivedKeyMaterials = item.derivedKeyMaterials?.length ? rows : item.derivedKeyMaterials;
  const materials = item.derivedKeyMaterials?.length ? item.materials : rows;
  return { ...item, materials, derivedKeyMaterials };
}

export function previewFundPlanMaterials(
  items: BomInputItem[],
  works: FundPlanWork[],
  recipeOverrides: FundRecipeOverrides,
) {
  const workByItem = new Map<number, number>();
  for (const work of works) {
    if (Number.isSafeInteger(work.itemId) && Number.isFinite(work.quantity) && work.quantity > 0) {
      workByItem.set(work.itemId, work.quantity);
    }
  }
  const selectedItems = items
    .filter(item => workByItem.has(Number(item.id)))
    .map(item => {
      const quantity = workByItem.get(Number(item.id))!;
      const overrides = recipeOverrides[String(item.id)] ?? {};
      return applyRecipeOverrides({ ...item, currentQty: quantity }, overrides);
    });
  const bars: BomInputBar[] = selectedItems.map(item => ({
    boqItemId: item.id,
    chainageFrom: null,
    chainageTo: null,
    plannedQty: item.currentQty,
    isQtyOverride: true,
    isProgrammed: true,
  }));
  const demand = calculateBomDemand(selectedItems, bars, 1);
  return {
    materials: demand.materials.map(material => ({
      materialName: material.materialName,
      uom: material.uom,
      totalQty: material.totalQty,
      byItem: material.breakdown.map(part => ({
        itemId: Number(part.boqItemId),
        quantity: Number(part.lineQty) || 0,
      })),
    })),
  };
}
