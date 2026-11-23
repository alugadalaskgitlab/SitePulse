export type SupplyMixTemplate = {
  id: number;
  name: string;
  mixType: string;
  bitumenPercent: number | null;
  ldoNorm: number | null;
};

export type SupplyMixComponent = {
  templateId: number;
  materialId: number;
  percent: number | null;
  moistureContent: number | null;
  wastageFactor: number | null;
};

export type SupplyOrderLine = {
  mixTemplateId: number;
  orderedMt: number;
  plannedMtPerDay: number | null;
};

export type SupplyDispatch = {
  date: string;
  mixTemplateId: number;
  loadWeight: number;
};

export type SupplyMaterial = {
  id: number;
  name: string;
};

export type MaterialQuantity = {
  materialId: number;
  quantity: number;
  uom: "MT" | "Liters";
};

function positive(value: number | null | undefined): number {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
}

/** Matches the dispatcher's theoretical material-use formula. */
export function materialNeedForMix(
  template: SupplyMixTemplate,
  components: SupplyMixComponent[],
  mixTonnes: number,
  materials: SupplyMaterial[],
): MaterialQuantity[] {
  if (!Number.isFinite(mixTonnes) || mixTonnes <= 0) return [];
  const needs = new Map<number, MaterialQuantity>();
  const add = (materialId: number | undefined, quantity: number, uom: "MT" | "Liters") => {
    if (!materialId || quantity <= 0 || !Number.isFinite(quantity)) return;
    const existing = needs.get(materialId);
    if (existing && existing.uom !== uom) throw new Error(`Material ${materialId} has mixed supply units.`);
    needs.set(materialId, { materialId, quantity: (existing?.quantity ?? 0) + quantity, uom });
  };

  const bitumenId = materials.find((material) => /bitumen/i.test(material.name))?.id;
  add(bitumenId, mixTonnes * positive(template.bitumenPercent) / 100, "MT");

  const ldoId = materials.find((material) => /^LDO$/i.test(material.name.trim()))?.id;
  add(ldoId, mixTonnes * positive(template.ldoNorm ?? 6), "Liters");

  for (const component of components.filter((row) => row.templateId === template.id)) {
    const percent = positive(component.percent);
    const moisture = Math.max(0, Math.min(Number(component.moistureContent) || 0, 30));
    const wastage = Math.max(0, Math.min(Number(component.wastageFactor) || 0, 20));
    if (moisture >= 100) throw new Error(`Invalid moisture content for material ${component.materialId}.`);
    const base = mixTonnes * percent / 100;
    const adjusted = base * (1 + wastage / 100) / (1 - moisture / 100);
    add(component.materialId, adjusted, "MT");
  }

  return [...needs.values()].map((row) => ({ ...row, quantity: Number(row.quantity.toFixed(6)) }));
}

export function dispatchedByMix(
  lines: SupplyOrderLine[],
  dispatches: SupplyDispatch[],
): Map<number, number> {
  const allowed = new Set(lines.map((line) => line.mixTemplateId));
  const result = new Map<number, number>();
  for (const dispatch of dispatches) {
    if (!allowed.has(dispatch.mixTemplateId)) continue;
    const weight = Number(dispatch.loadWeight);
    if (Number.isFinite(weight) && weight > 0) {
      result.set(dispatch.mixTemplateId, (result.get(dispatch.mixTemplateId) ?? 0) + weight);
    }
  }
  return result;
}

export function orderMaterialNeeds(
  lines: SupplyOrderLine[],
  templates: SupplyMixTemplate[],
  components: SupplyMixComponent[],
  materials: SupplyMaterial[],
  dispatched: Map<number, number>,
): MaterialQuantity[] {
  const totals = new Map<number, MaterialQuantity>();
  for (const line of lines) {
    const remaining = Math.max(0, positive(line.orderedMt) - (dispatched.get(line.mixTemplateId) ?? 0));
    const template = templates.find((row) => row.id === line.mixTemplateId);
    if (!template || remaining === 0) continue;
    for (const need of materialNeedForMix(template, components, remaining, materials)) {
      const current = totals.get(need.materialId);
      totals.set(need.materialId, {
        materialId: need.materialId,
        quantity: Number(((current?.quantity ?? 0) + need.quantity).toFixed(6)),
        uom: need.uom,
      });
    }
  }
  return [...totals.values()];
}

/** Planned daily mix rates win; missing rates use the last three party production days. */
export function dailyMixTonnes(
  lines: SupplyOrderLine[],
  dispatches: SupplyDispatch[],
): Map<number, number> {
  const planned = lines.filter((line) => positive(line.plannedMtPerDay) > 0);
  const daily = new Map<number, number>();
  for (const line of planned) daily.set(line.mixTemplateId, positive(line.plannedMtPerDay));

  const fallbackLines = lines.filter((line) => !daily.has(line.mixTemplateId));
  if (fallbackLines.length === 0) return daily;

  const productionDays = [...new Set(dispatches.map((dispatch) => dispatch.date).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3);
  if (productionDays.length === 0) {
    for (const line of fallbackLines) daily.set(line.mixTemplateId, 0);
    return daily;
  }
  const daySet = new Set(productionDays);
  const totals = new Map<number, number>();
  for (const dispatch of dispatches) {
    if (!daySet.has(dispatch.date)) continue;
    const weight = Number(dispatch.loadWeight);
    if (Number.isFinite(weight) && weight > 0) {
      totals.set(dispatch.mixTemplateId, (totals.get(dispatch.mixTemplateId) ?? 0) + weight);
    }
  }
  for (const line of fallbackLines) {
    daily.set(line.mixTemplateId, Number(((totals.get(line.mixTemplateId) ?? 0) / productionDays.length).toFixed(6)));
  }
  return daily;
}

export function isRunningLow(stockAvailable: number, dailyNeed: number): boolean {
  return Number.isFinite(stockAvailable) && Number.isFinite(dailyNeed) && dailyNeed > 0 && stockAvailable / dailyNeed < 1;
}

export function daysOfStockLeft(stockAvailable: number, dailyNeed: number): number | null {
  if (!Number.isFinite(stockAvailable) || !Number.isFinite(dailyNeed) || dailyNeed <= 0) return null;
  return Math.max(0, stockAvailable) / dailyNeed;
}
