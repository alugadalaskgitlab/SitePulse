import {
  calculateBomDemand,
  calculateMonthlyDistribution,
  type BomInputBar,
  type BomInputItem,
  type BomMaterialRow,
} from "@shared/planningEngine";
import {
  calculateCompactedLooseQuantity,
  boqQuantityToCompactedCum,
  type CompactedLooseProfile,
} from "@shared/compactedLoose";
import { canonicalizeUnit } from "@shared/boqNormalise";
import { formatChainageKm, parseChainageKm } from "@shared/barSide";
import { corridorsForSide } from "@shared/projectScope";

export type WorkValueBalanceRow = {
  boqItemId: number;
  itemCode: string | null;
  description: string;
  unit: string;
  reachId: number | null;
  reachLabel: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  side?: string | null;
  scopeQuantity: number;
  doneQuantity: number;
  balanceQuantity: number;
  rowType: "working_reach" | "no_scope";
};

export type BalanceMaterialRow = {
  materialName: string;
  uom: string;
  totalQty: number;
  compactedCum: number | null;
  mt: number | null;
  looseCum: number | null;
  looseCft: number | null;
  mtPerCum: number | null;
  monthlyUnit: string;
  monthly: Record<number, number>;
  overdue: number;
  notScheduled: number;
  hasUnscheduledWork: boolean;
  valuesUnavailable: boolean;
  contributors: Array<{
    boqItemId: number;
    itemCode: string | null;
    label: string;
    description: string;
    quantity: number;
    unit: string;
  }>;
};

export type BalanceWorkItem = {
  boqItemId: number;
  label: string;
  quantity: number;
  unit: string;
  hasRecipe: boolean;
};

export type BalanceReachGroup = {
  key: string;
  label: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  side: string | null;
  workItems: BalanceWorkItem[];
  materials: BalanceMaterialRow[];
};

export type BalanceMaterialTotal = {
  materialName: string;
  needed: number | null;
  neededUom: string;
  stock: number | null;
  stockUom: string | null;
  stillToArrange: number | null;
  enough: boolean;
  conversionBasis?: string | null;
};

export type BalanceWorkByReachResult = {
  groups: BalanceReachGroup[];
  totals: BalanceMaterialTotal[];
  monthColumns: number[];
  currentMonth: number;
  endMonth: number;
  hasNotScheduled: boolean;
};

type ShortageStockRow = {
  materialName: string;
  uom: string;
  totalDemand: number;
  hlcRecordedStock: number;
  materialMappingUnresolved: boolean;
  conversionBasis?: string | null;
};

type DemandMaterialRow = Pick<BomMaterialRow, "materialName" | "uom" | "totalQty">;

type ReachBuildInput = {
  items: BomInputItem[];
  bars: BomInputBar[];
  workRows: WorkValueBalanceRow[];
  totalMonths: number;
  projectStartDate?: string | null;
  currentMonth: number;
  endMonth?: number;
  demandMaterials?: DemandMaterialRow[];
  stockRows?: ShortageStockRow[];
  arrangements?: any[];
};

const normaliseName = (value: unknown) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase();

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return value == null || value === "" || !Number.isFinite(n) ? null : n;
}

function massInMt(quantity: number, unit: string): number | null {
  const canonical = canonicalizeUnit(unit).toUpperCase();
  if (["MT", "T", "TON", "TONS", "TONNE", "TONNES"].includes(canonical)) return quantity;
  if (["KG", "KGS"].includes(canonical)) return quantity / 1000;
  return null;
}

function unitLabel(unit: string): string {
  const canonical = canonicalizeUnit(unit).toUpperCase();
  if (["MT", "T", "TON", "TONS", "TONNE", "TONNES"].includes(canonical)) return "MT";
  if (["CUM", "M3", "CBM"].includes(canonical)) return "cum";
  if (["CFT", "CUFT"].includes(canonical)) return "CFT";
  if (["L", "LITRE", "LITER", "LITRES", "LITERS"].includes(canonical)) return "L";
  return unit || "—";
}

function isSoilOrGranular(item: BomInputItem, material: BomMaterialRow): boolean {
  const layerType = String(item.layerConfig?.layerType ?? "").toLowerCase();
  if (layerType === "bituminous" || layerType === "spray_coat" || layerType === "concrete") return false;
  if (layerType === "earthwork" || layerType === "granular") return true;
  return /soil|earth|borrow|shoulder|granular|gsb|wmm/i.test(
    `${item.description} ${item.workCategory ?? ""} ${material.materialName}`,
  );
}

function barWeightForWorkRow(bar: BomInputBar, row: WorkValueBalanceRow): number {
  const barCorridors = corridorsForSide((bar as any).side);
  const rowCorridors = row.reachId == null ? barCorridors : corridorsForSide(row.side);
  const matchingCorridors = barCorridors.filter(corridor => rowCorridors.includes(corridor));
  if (!matchingCorridors.length) return 0;
  const barFrom = chainageKm(bar.chainageFrom);
  const barTo = chainageKm(bar.chainageTo);
  const rowFrom = numberOrNull(row.chainageFrom);
  const rowTo = numberOrNull(row.chainageTo);
  if (row.reachId == null) {
    return barFrom != null && barTo != null && barTo > barFrom
      ? (barTo - barFrom) * matchingCorridors.length * 0.5
      : numberOrNull((bar as any).structureChainageKm) != null ? matchingCorridors.length * 0.5 : 0;
  }
  if (barFrom != null && barTo != null && barTo > barFrom && rowFrom != null && rowTo != null && rowTo > rowFrom) {
    return Math.max(0, Math.min(barTo, rowTo) - Math.max(barFrom, rowFrom)) * matchingCorridors.length * 0.5;
  }
  const point = numberOrNull((bar as any).structureChainageKm);
  if (point != null && rowFrom != null && rowTo != null &&
    point >= rowFrom - 0.0005 && point <= rowTo + 0.0005) {
    return matchingCorridors.length * 0.5;
  }
  return normaliseName((bar as any).reachLabel) === normaliseName(row.reachLabel) ? matchingCorridors.length * 0.5 : 0;
}

function scheduleForWorkRow(
  row: WorkValueBalanceRow,
  itemBars: BomInputBar[],
  allWorkRows: WorkValueBalanceRow[],
  balance: number,
  totalMonths: number,
  currentMonth: number,
  endMonth: number,
): { monthlyWork: Record<number, number>; overdueWork: number; notScheduledWork: number } {
  const monthlyWork: Record<number, number> = {};
  if (balance <= 0 || itemBars.length === 0) {
    return { monthlyWork, overdueWork: 0, notScheduledWork: Math.max(0, balance) };
  }

  const itemRows = allWorkRows.filter(candidate =>
    Number(candidate.boqItemId) === Number(row.boqItemId) && candidate.rowType === "working_reach",
  );
  const eligible = itemBars.flatMap(bar => {
    const rowWeight = barWeightForWorkRow(bar, row);
    const totalWeight = itemRows.reduce((sum, candidate) => sum + barWeightForWorkRow(bar, candidate), 0);
    const plannedQty = Math.max(0, Number(bar.plannedQty) || 0) *
      (totalWeight > 0 ? rowWeight / totalWeight : 0);
    const start = Number(bar.startMonth);
    const end = Number(bar.endMonth);
    if (plannedQty <= 0 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{ bar, plannedQty }];
  });
  const capacity = eligible.reduce((sum, entry) => sum + entry.plannedQty, 0);
  if (capacity <= 0) {
    return { monthlyWork, overdueWork: 0, notScheduledWork: Math.max(0, balance) };
  }

  const scheduledWork = Math.min(balance, capacity);
  let overdueWork = 0;
  for (const entry of eligible) {
    const barWork = scheduledWork * entry.plannedQty / capacity;
    const slices = (entry.bar.monthlyDayShares
      ? Object.entries(entry.bar.monthlyDayShares)
        .map(([month, share]) => ({ month: Number(month), qty: barWork * Number(share) }))
        .filter(slice => Number.isInteger(slice.month) && slice.month > 0 && slice.qty > 0)
      : calculateMonthlyDistribution(
        barWork,
        Number(entry.bar.startMonth),
        Number(entry.bar.endMonth),
        Math.max(totalMonths, endMonth),
      ));
    for (const slice of slices) {
      if (slice.month < currentMonth) overdueWork += slice.qty;
      else if (slice.month <= endMonth) monthlyWork[slice.month] = (monthlyWork[slice.month] ?? 0) + slice.qty;
    }
  }
  const scheduledInRange = overdueWork + Object.values(monthlyWork).reduce((sum, value) => sum + value, 0);
  return {
    monthlyWork,
    overdueWork,
    notScheduledWork: Math.max(0, balance - scheduledInRange),
  };
}

function mergeMaterial(
  map: Map<string, BalanceMaterialRow>,
  materialName: string,
  uom: string,
  totalQty: number,
  compactedCum: number | null,
  mt: number | null,
  looseCum: number | null,
  looseCft: number | null,
  monthlyUnit: string,
  monthlyValues: Record<number, number>,
  overdue: number,
  notScheduled: number,
  hasUnscheduledWork: boolean,
  valuesUnavailable = false,
  mtPerCum: number | null = null,
  contributor?: BalanceMaterialRow["contributors"][number],
) {
  const key = `${normaliseName(materialName)}|${normaliseName(uom)}`;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      materialName,
      uom,
      totalQty,
      compactedCum,
      mt,
      looseCum,
      looseCft,
      mtPerCum,
      monthlyUnit,
      monthly: { ...monthlyValues },
      overdue,
      notScheduled,
      hasUnscheduledWork,
      valuesUnavailable,
      contributors: contributor ? [{ ...contributor }] : [],
    });
    return;
  }
  existing.totalQty += totalQty;
  existing.compactedCum = existing.compactedCum == null || compactedCum == null
    ? null
    : existing.compactedCum + compactedCum;
  existing.mt = existing.mt == null || mt == null ? null : existing.mt + mt;
  existing.looseCum = existing.looseCum == null || looseCum == null
    ? null
    : existing.looseCum + looseCum;
  existing.looseCft = existing.looseCft == null || looseCft == null
    ? null
    : existing.looseCft + looseCft;
  existing.mtPerCum = existing.mtPerCum == null || mtPerCum == null ||
    Math.abs(existing.mtPerCum - mtPerCum) > 0.000001
    ? null
    : existing.mtPerCum;
  if (contributor) {
    const previousContributor = existing.contributors.find(row => row.boqItemId === contributor.boqItemId);
    if (previousContributor) previousContributor.quantity += contributor.quantity;
    else existing.contributors.push({ ...contributor });
  }
  existing.overdue += overdue;
  existing.notScheduled += notScheduled;
  existing.hasUnscheduledWork ||= hasUnscheduledWork;
  existing.valuesUnavailable ||= valuesUnavailable;
  for (const [month, value] of Object.entries(monthlyValues)) {
    const key = Number(month);
    existing.monthly[key] = (existing.monthly[key] ?? 0) + value;
  }
}

function findUniqueByName<T extends { materialName: string }>(rows: T[], name: string): T | null {
  const matching = rows.filter(row => normaliseName(row.materialName) === normaliseName(name));
  return matching.length === 1 ? matching[0] : null;
}

export function calculateStillToArrange(needed: number, stock: number): { quantity: number; enough: boolean } {
  const available = Math.max(0, Number(stock) || 0);
  const quantity = Math.max(0, (Number(needed) || 0) - available);
  return { quantity, enough: available > (Number(needed) || 0) };
}

export function buildBalanceWorkByReach(input: ReachBuildInput): BalanceWorkByReachResult {
  const currentMonth = Math.max(1, Math.floor(Number(input.currentMonth) || 1));
  const endMonth = Math.max(
    0,
    Math.floor(Number(input.endMonth) || 0),
    Math.floor(Number(input.totalMonths) || 0),
    ...input.bars.map(bar => Math.ceil(Number(bar.endMonth) || 0)),
  );
  const itemById = new Map(input.items.map(item => [Number(item.id), item]));
  const barsByItem = new Map<number, BomInputBar[]>();
  for (const bar of input.bars) {
    const key = Number(bar.boqItemId);
    barsByItem.set(key, [...(barsByItem.get(key) ?? []), bar]);
  }

  const rows = input.workRows
    .filter(row => row.rowType === "working_reach" && Number(row.balanceQuantity) > 0)
    .map(row => ({ ...row, balanceQuantity: Number(row.balanceQuantity) }));
  const groupByKey = new Map<string, BalanceReachGroup>();
  const materialsByGroupKey = new Map<string, Map<string, BalanceMaterialRow>>();
  const itemMaterialTotals = new Map<string, { materialName: string; uom: string; qty: number }>();

  for (const row of rows) {
    const item = itemById.get(Number(row.boqItemId));
    const isWholeRoad = row.reachId == null;
    const key = isWholeRoad ? "whole-road" : `reach-${row.reachId}`;
    const group = groupByKey.get(key) ?? {
      key,
      label: isWholeRoad
        ? "Whole road"
        : row.chainageFrom != null && row.chainageTo != null
          ? `${row.reachLabel} · ${formatChainage(row.chainageFrom)}–${formatChainage(row.chainageTo)}`
          : row.reachLabel,
      chainageFrom: numberOrNull(row.chainageFrom),
      chainageTo: numberOrNull(row.chainageTo),
      side: row.side ?? null,
      workItems: [],
      materials: [],
    };
    if (!groupByKey.has(key)) {
      groupByKey.set(key, group);
      materialsByGroupKey.set(key, new Map());
    }

    if (!item) {
      group.workItems.push({
        boqItemId: row.boqItemId,
        label: row.itemCode ? `[${row.itemCode}] ${row.description}` : row.description,
        quantity: row.balanceQuantity,
        unit: row.unit,
        hasRecipe: false,
      });
      continue;
    }

    const materialDemand = calculateBomDemand(
      [{ ...item, currentQty: row.balanceQuantity }],
      [],
      Math.max(input.totalMonths, endMonth),
      { arrangements: input.arrangements },
    );
    const materialMap = materialsByGroupKey.get(key)!;
    const itemBars = barsByItem.get(Number(item.id)) ?? [];
    const schedule = scheduleForWorkRow(
      row,
      itemBars,
      input.workRows,
      row.balanceQuantity,
      Math.max(input.totalMonths, endMonth),
      currentMonth,
      endMonth,
    );
    const profile = item.layerQuantityProfile as CompactedLooseProfile | null | undefined;
    const compactedCum = boqQuantityToCompactedCum(
      row.balanceQuantity,
      canonicalizeUnit(item.canonicalUnit ?? item.unit ?? ""),
      Number(item.layerConfig?.thicknessMm),
      profile,
    );
    const mixLayer = String(item.layerConfig?.layerType ?? "").toLowerCase() === "bituminous";
    const mixProfileResult = compactedCum == null ? null : calculateCompactedLooseQuantity(compactedCum, profile);
    const recipeMt = materialDemand.materials.reduce((sum, material) => {
      const mt = massInMt(Number(material.totalQty) || 0, material.uom);
      return sum + (mt ?? 0);
    }, 0);
    const mixMt = mixLayer ? (mixProfileResult?.compactedMt ?? (recipeMt > 0 ? recipeMt : null)) : null;
    group.workItems.push({
      boqItemId: row.boqItemId,
      label: row.itemCode ? `[${row.itemCode}] ${item.itemName || item.description}` : (item.itemName || item.description),
      quantity: row.balanceQuantity,
      unit: row.unit,
      hasRecipe: materialDemand.materials.length > 0,
    });

    if (mixLayer && mixMt != null) {
      const mixType = String(item.layerConfig?.mixType ?? "Plant").trim() || "Plant";
      const mixMonthly: Record<number, number> = {};
      for (const [month, workQty] of Object.entries(schedule.monthlyWork)) {
        mixMonthly[Number(month)] = mixMt * Number(workQty) / row.balanceQuantity;
      }
      mergeMaterial(
        materialMap,
        `${mixType} mix`,
        "MT",
        mixMt,
        compactedCum,
        mixMt,
        mixProfileResult?.looseCum ?? null,
        mixProfileResult?.looseCft ?? null,
        "MT",
        mixMonthly,
        mixMt * schedule.overdueWork / row.balanceQuantity,
        mixMt * schedule.notScheduledWork / row.balanceQuantity,
        schedule.notScheduledWork > 0.000001,
        false,
        mixProfileResult && compactedCum && compactedCum > 0
          ? mixProfileResult.looseWeightPerCum
          : null,
        {
          boqItemId: row.boqItemId,
          itemCode: row.itemCode,
          label: item.itemName || item.description,
          description: item.description,
          quantity: mixMt,
          unit: "MT",
        },
      );
    }

    for (const material of materialDemand.materials) {
      const totalQty = Number(material.totalQty) || 0;
      if (totalQty <= 0) continue;
      const canonicalUom = canonicalizeUnit(material.uom).toUpperCase();
      const volumeCum = ["CUM", "M3", "CBM"].includes(canonicalUom);
      const looseMaterial = isSoilOrGranular(item, material);
      const looseResult = volumeCum && looseMaterial
        ? calculateCompactedLooseQuantity(totalQty, profile)
        : null;
      const massMt = massInMt(totalQty, material.uom);
      const unconvertedCft = ["CFT", "CUFT"].includes(canonicalUom);
      const monthlyUnit = unconvertedCft
        ? "—"
        : looseMaterial && volumeCum
          ? "loose cum"
          : massMt != null
            ? "MT"
            : unitLabel(material.uom);
      const rate = totalQty / row.balanceQuantity;
      const monthlyValues: Record<number, number> = {};
      for (const [month, workQty] of Object.entries(schedule.monthlyWork)) {
        const workShare = Number(workQty) / row.balanceQuantity;
        if (unconvertedCft) {
          continue;
        } else if (looseMaterial && volumeCum) {
          if (looseResult) monthlyValues[Number(month)] = totalQty * workShare * looseResult.looseCum / totalQty;
        } else {
          const amount = massMt ?? totalQty;
          monthlyValues[Number(month)] = amount * workShare;
        }
      }
      const overdue = unconvertedCft
        ? 0
        : looseMaterial && volumeCum
          ? looseResult ? schedule.overdueWork * rate * looseResult.looseCum / totalQty : 0
          : (massMt ?? totalQty) * (schedule.overdueWork / row.balanceQuantity);
      const notScheduled = unconvertedCft
        ? 0
        : looseMaterial && volumeCum
          ? looseResult ? schedule.notScheduledWork * rate * looseResult.looseCum / totalQty : 0
          : (massMt ?? totalQty) * (schedule.notScheduledWork / row.balanceQuantity);
      const compactedForRow = volumeCum ? totalQty : null;
      const materialMt = looseResult?.compactedMt ?? massMt;
      mergeMaterial(
        materialMap,
        material.materialName,
        canonicalUom || material.uom,
        totalQty,
        compactedForRow,
        materialMt,
        looseResult?.looseCum ?? null,
        looseResult?.looseCft ?? null,
        monthlyUnit,
        monthlyValues,
        overdue,
        notScheduled,
        schedule.notScheduledWork > 0.000001,
        unconvertedCft,
        looseResult?.looseWeightPerCum ?? null,
        {
          boqItemId: row.boqItemId,
          itemCode: row.itemCode,
          label: item.itemName || item.description,
          description: item.description,
          quantity: totalQty,
          unit: material.uom,
        },
      );

      const totalKey = `${normaliseName(material.materialName)}|${normaliseName(canonicalUom || material.uom)}`;
      const total = itemMaterialTotals.get(totalKey);
      if (total) total.qty += totalQty;
      else itemMaterialTotals.set(totalKey, {
        materialName: material.materialName,
        uom: canonicalUom || material.uom,
        qty: totalQty,
      });
    }
    group.materials = Array.from(materialMap.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
  }

  const groups = Array.from(groupByKey.values()).sort((a, b) => {
    if (a.key === "whole-road") return 1;
    if (b.key === "whole-road") return -1;
    return (a.chainageFrom ?? 0) - (b.chainageFrom ?? 0);
  });
  const totals = Array.from(itemMaterialTotals.values())
    .sort((a, b) => a.materialName.localeCompare(b.materialName))
    .map(material => {
      const demand = findUniqueByName(input.demandMaterials ?? [], material.materialName);
      const stockRow = findUniqueByName(input.stockRows ?? [], material.materialName);
      const needsOwnWeightForCft = ["CFT", "CUFT"].includes(canonicalizeUnit(material.uom).toUpperCase());
      let needed: number | null = needsOwnWeightForCft ? null : material.qty;
        let neededUom = needsOwnWeightForCft ? "—" : material.uom;
      let stock: number | null = null;
      let stockUom: string | null = null;
      let conversionBasis: string | null = null;
      if (stockRow) {
        stockUom = stockRow.uom;
        conversionBasis = stockRow.conversionBasis ?? null;
        if (needed == null) {
          stockUom = null;
        } else if (canonicalizeUnit(material.uom).toUpperCase() === canonicalizeUnit(stockRow.uom).toUpperCase()) {
          neededUom = stockRow.uom;
        } else if (demand && Number(demand.totalQty) > 0 && Number(stockRow.totalDemand) > 0) {
          const factor = Number(stockRow.totalDemand) / Number(demand.totalQty);
          if (Number.isFinite(factor)) {
            needed *= factor;
            neededUom = stockRow.uom;
          } else {
            stockUom = null;
          }
        } else {
          stockUom = null;
        }
        if (stockUom && !stockRow.materialMappingUnresolved) {
          stock = Number(stockRow.hlcRecordedStock);
          if (!Number.isFinite(stock)) stock = null;
        }
      }
      const still = stock == null || needed == null ? null : calculateStillToArrange(needed, stock);
      return {
        materialName: material.materialName,
        needed,
        neededUom,
        stock,
        stockUom,
        stillToArrange: still?.quantity ?? null,
        enough: still?.enough ?? false,
        conversionBasis,
      };
    });

  const monthColumns = Array.from(
    { length: Math.max(0, endMonth - currentMonth + 1) },
    (_, index) => currentMonth + index,
  );
  return {
    groups,
    totals,
    monthColumns,
    currentMonth,
    endMonth,
    hasNotScheduled: groups.some(group => group.materials.some(row => row.hasUnscheduledWork)),
  };
}

function formatChainage(value: number): string {
  const km = Number(value);
  if (!Number.isFinite(km)) return "—";
  return formatChainageKm(km) ?? "—";
}

function chainageKm(value: unknown): number | null {
  const numeric = numberOrNull(value);
  return numeric ?? (typeof value === "string" ? parseChainageKm(value) : null);
}
