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

export type SupplyOrderMixComponent = {
  materialId: number;
  aggregateSharePercent: number;
};

export type SupplyAlertRecipientChoice = { roles: string[]; userIds: number[] };
export type SupplyAlertSettings = {
  running_low: SupplyAlertRecipientChoice;
  exhausted: SupplyAlertRecipientChoice;
  borrowed: SupplyAlertRecipientChoice;
};

function normalizeSupplyAlertChoice(
  value: Partial<SupplyAlertRecipientChoice> | undefined,
  fallback: SupplyAlertRecipientChoice,
): SupplyAlertRecipientChoice {
  return {
    roles: Array.from(new Set((value?.roles ?? fallback.roles).filter(role => typeof role === "string"))),
    userIds: Array.from(new Set((value?.userIds ?? fallback.userIds).map(Number).filter(id => Number.isInteger(id) && id > 0))),
  };
}

export function resolveSupplyAlertSettings(
  stored: Partial<SupplyAlertSettings> & { ownerDefaultsApplied?: boolean },
  defaults: SupplyAlertSettings,
  activeOwnerIds: number[],
): SupplyAlertSettings {
  const resolved: SupplyAlertSettings = {
    running_low: normalizeSupplyAlertChoice(stored.running_low, defaults.running_low),
    exhausted: normalizeSupplyAlertChoice(stored.exhausted, defaults.exhausted),
    borrowed: normalizeSupplyAlertChoice(stored.borrowed, defaults.borrowed),
  };
  if (stored.ownerDefaultsApplied !== true) {
    for (const choice of Object.values(resolved)) {
      choice.userIds = Array.from(new Set([...choice.userIds, ...activeOwnerIds]));
    }
  }
  return resolved;
}

export function includeSupplyAlertOwners(
  kind: "running_low" | "exhausted" | "borrowed" | "morning_summary",
  recipientIds: number[],
  activeOwnerIds: number[],
): number[] {
  return Array.from(new Set([
    ...recipientIds,
    ...(kind === "borrowed" ? activeOwnerIds : []),
  ]));
}

export type SupplyOrderMix = {
  mixTemplateId: number;
  mixName: string;
  sourceBitumenPercent: number;
  bitumenPercent: number;
  ldoNorm: number | null;
  components: SupplyOrderMixComponent[];
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

export function orderQuantityToMt(quantity: number, unit: "MT" | "cum", mtPerCumFactor: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Order quantity must be greater than zero.");
  if (unit === "MT") return Number(quantity.toFixed(6));
  if (!Number.isFinite(mtPerCumFactor) || mtPerCumFactor <= 0) {
    throw new Error("Enter a valid MT-per-cum factor.");
  }
  return Number((quantity * mtPerCumFactor).toFixed(6));
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

  return Array.from(needs.values()).map((row) => ({ ...row, quantity: Number(row.quantity.toFixed(6)) }));
}

/** Computes an order-specific recipe without mutating its source mix template. */
export function materialNeedForOrderMix(
  template: SupplyMixTemplate,
  orderMix: SupplyOrderMix,
  mixTonnes: number,
  materials: SupplyMaterial[],
): MaterialQuantity[] {
  const aggregatePercentOfTotalMix = (100 - orderMix.bitumenPercent) / 100;
  const components: SupplyMixComponent[] = orderMix.components.map((component, index) => ({
    templateId: template.id,
    materialId: component.materialId,
    percent: aggregatePercentOfTotalMix * component.aggregateSharePercent,
    moistureContent: 0,
    wastageFactor: 0,
  }));
  return materialNeedForMix(
    {
      ...template,
      bitumenPercent: orderMix.bitumenPercent,
      ldoNorm: orderMix.ldoNorm,
    },
    components,
    mixTonnes,
    materials,
  );
}

export function orderMixAggregateQuantities(
  mixTonnes: number,
  bitumenPercent: number,
  components: SupplyOrderMixComponent[],
): Record<number, number> {
  if (!Number.isFinite(mixTonnes) || mixTonnes <= 0) return {};
  if (!Number.isFinite(bitumenPercent) || bitumenPercent < 0 || bitumenPercent >= 100) {
    throw new Error("Order-mix bitumen percent must be from 0 up to, but not including, 100.");
  }
  const totalAggregateShare = (100 - bitumenPercent) / 100;
  const quantities: Record<number, number> = {};
  for (const component of components) {
    if (!Number.isFinite(component.aggregateSharePercent) || component.aggregateSharePercent < 0) {
      throw new Error("Order-mix aggregate share must be a non-negative number.");
    }
    const quantity = mixTonnes * totalAggregateShare * component.aggregateSharePercent / 100;
    quantities[component.materialId] = (quantities[component.materialId] ?? 0) + quantity;
  }
  return Object.fromEntries(Object.entries(quantities).map(([id, quantity]) => [id, Number(quantity.toFixed(6))]));
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
  return Array.from(totals.values());
}

export function orderMaterialNeedsWithOrderMix(
  lines: SupplyOrderLine[],
  templates: SupplyMixTemplate[],
  components: SupplyMixComponent[],
  orderMixes: SupplyOrderMix[],
  materials: SupplyMaterial[],
  dispatched: Map<number, number>,
): MaterialQuantity[] {
  const totals = new Map<number, MaterialQuantity>();
  for (const line of lines) {
    const remaining = Math.max(0, positive(line.orderedMt) - (dispatched.get(line.mixTemplateId) ?? 0));
    const template = templates.find((row) => row.id === line.mixTemplateId);
    if (!template || remaining === 0) continue;
    const orderMix = orderMixes.find((row) => row.mixTemplateId === line.mixTemplateId);
    const needs = orderMix
      ? materialNeedForOrderMix(template, orderMix, remaining, materials)
      : materialNeedForMix(template, components, remaining, materials);
    for (const need of needs) {
      const current = totals.get(need.materialId);
      totals.set(need.materialId, {
        materialId: need.materialId,
        quantity: Number(((current?.quantity ?? 0) + need.quantity).toFixed(6)),
        uom: need.uom,
      });
    }
  }
  return Array.from(totals.values());
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

  const productionDays = Array.from(new Set(dispatches.map((dispatch) => dispatch.date).filter(Boolean)))
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

export function materialAvailabilityForScope(
  need: number,
  dailyNeed: number,
  scope: "party" | "hlc",
  partyStock: number,
  hlcStock: number,
) {
  const selectedStock = Number(scope === "party" ? partyStock : hlcStock);
  const stockAvailable = Number.isFinite(selectedStock) ? selectedStock : 0;
  const safeNeed = Number.isFinite(need) ? Math.max(0, need) : 0;
  const shortage = Math.max(0, safeNeed - Math.max(stockAvailable, 0));
  return {
    stockAvailable,
    shortage,
    daysLeft: daysOfStockLeft(stockAvailable, dailyNeed),
    runningLow: isRunningLow(stockAvailable, dailyNeed),
  };
}

export function allocateSupplyOrderLdo(
  totalLitres: number,
  orders: Array<{ orderId: number; dispatchMt: number }>,
) {
  const eligible = orders.filter(row => Number.isFinite(row.dispatchMt) && row.dispatchMt > 0);
  const totalDispatchMt = eligible.reduce((sum, row) => sum + row.dispatchMt, 0);
  if (!Number.isFinite(totalLitres) || totalLitres < 0 || totalDispatchMt <= 0) return [];
  return eligible.map(row => ({
    orderId: row.orderId,
    sharePercent: row.dispatchMt / totalDispatchMt * 100,
    allocatedLitres: totalLitres * row.dispatchMt / totalDispatchMt,
  }));
}

export function dispatchCrossesStockZero(beforeDispatch: number, afterDispatch: number): boolean {
  return Number.isFinite(beforeDispatch) && Number.isFinite(afterDispatch) && beforeDispatch > 0 && afterDispatch <= 0;
}

export function formatPlantSupplyMorningSummary(order: {
  orderNo: string;
  lines: Array<{ mixName: string; balanceMt: number }>;
  materials: Array<{ materialName: string; daysLeft: number | null }>;
}): string {
  const mixBalances = order.lines.map(line => `${line.mixName}: ${line.balanceMt.toFixed(3)} MT to go`);
  const materialDays = order.materials.map(material =>
    `${material.materialName}: ${material.daysLeft == null ? "days remaining unavailable" : `${material.daysLeft.toFixed(1)} days left`}`,
  );
  return [order.orderNo, ...mixBalances, ...materialDays].join(" · ");
}
