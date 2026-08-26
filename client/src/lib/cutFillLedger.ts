import { classifyWorkType } from "@shared/workTypeRecipes";
import { validateExcavationMaterialOutcome, type CutFillConsumptionInput } from "@shared/cutFillReconciliation";

export type ChainageCandidate = {
  id: number;
  description: string;
  unit: string;
  chainageFrom?: number | null;
  chainageTo?: number | null;
};

export function rankCutFillSources<T extends ChainageCandidate>(
  candidates: T[],
  destinationFrom?: number | null,
  destinationTo?: number | null,
): T[] {
  const midpoint = destinationFrom != null && destinationTo != null
    ? (destinationFrom + destinationTo) / 2
    : destinationFrom ?? destinationTo;
  return candidates
    .map((candidate, index) => {
      const sourceMid = candidate.chainageFrom != null && candidate.chainageTo != null
        ? (candidate.chainageFrom + candidate.chainageTo) / 2
        : candidate.chainageFrom ?? candidate.chainageTo;
      const distance = midpoint != null && sourceMid != null ? Math.abs(midpoint - sourceMid) : Number.POSITIVE_INFINITY;
      return { candidate, distance, index };
    })
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ candidate }) => candidate);
}

export function roadwayExcavationCandidates<T extends ChainageCandidate>(
  items: T[],
  destinationBoqItemIds: Array<number | null | undefined> = [],
) {
  const destinations = new Set(destinationBoqItemIds.map(Number).filter(Number.isFinite));
  return items.filter(item =>
    !destinations.has(Number(item.id))
    && classifyWorkType(item.description, item.unit) === "roadway_excavation"
  );
}

export function preselectedSourceId<T extends ChainageCandidate>(candidates: T[]): number | null {
  return candidates.length === 1 ? candidates[0].id : null;
}

export type CutFillSourceOption = {
  key: string;
  kind: "progress" | "opening" | "same_dpr";
  label: string;
  date?: string | null;
  activity?: string | null;
  sourceEntryKey?: string | null;
  openingBalanceId?: number | null;
  sourceBoqItemId: number;
  availableQty: number;
};
export type LedgerSource = Pick<CutFillSourceOption, "key" | "availableQty">;
export type LedgerAllocation = { sourceKey: string; sourceEntryKey?: string | null; openingBalanceId?: number | null; quantity: number };

export type CutFillFormRow = {
  entryKey: string; boqItemId: number | null; quantity: number | null;
  materialOutcome?: string | null; reusableQty?: number | null;
  earthworkArrangementId?: number | null; allocations?: LedgerAllocation[];
};
export type CutFillArrangement = { id: number; arrangementType: string; sourceExcavationBoqItemId?: number | null };
export type CutFillFormContext = {
  sources: CutFillSourceOption[];
  rowLedger: Record<string, ReturnType<typeof projectFormLedger>[number]>;
};

export function buildCutFillFormContext(
  rows: CutFillFormRow[], boqItems: any[], priorSources: any[], openingBalances: any[],
  options: { arrangements?: CutFillArrangement[]; editOriginalConsumptions?: CutFillConsumptionInput[] } = {},
): CutFillFormContext {
  const arrangements = options.arrangements ?? [];
  const items = new Map(boqItems.map(item => [Number(item.id), item]));
  const sameDpr: CutFillSourceOption[] = rows.filter(row => {
    const item = items.get(Number(row.boqItemId));
    return item && classifyWorkType(String(item.description ?? item.itemName ?? ""), String(item.unit ?? "")) === "roadway_excavation" && row.reusableQty != null;
  }).map(row => ({ key: `progress:${row.entryKey}`, kind: "same_dpr", label: `${items.get(Number(row.boqItemId))?.description ?? "Excavation"} · this DPR`, activity: items.get(Number(row.boqItemId))?.description, sourceEntryKey: row.entryKey, sourceBoqItemId: Number(row.boqItemId), availableQty: Math.max(0, Number(row.reusableQty) || 0) }));
  const prior: CutFillSourceOption[] = priorSources.map(source => ({ key: `progress:${source.entryKey}`, kind: "progress", label: `${source.activity || source.sourceItemDescription || "Excavation"} · ${source.date || "prior"}`, date: source.date, activity: source.activity, sourceEntryKey: source.entryKey, sourceBoqItemId: Number(source.boqItemId), availableQty: Math.max(0, Number(source.availableQty ?? Number(source.reusableQty ?? 0) - Number(source.consumedQty ?? 0))) }));
  const opening: CutFillSourceOption[] = openingBalances.map(balance => ({ key: `opening:${balance.id}`, kind: "opening", label: `Opening balance · ${balance.confirmedAt ? String(balance.confirmedAt).slice(0, 10) : "confirmed"}`, openingBalanceId: Number(balance.id), sourceBoqItemId: Number(balance.sourceExcavationBoqItemId), availableQty: Math.max(0, Number(balance.quantity) || 0) }));
  const allSources = [...sameDpr, ...prior, ...opening].filter((source, index, all) => all.findIndex(item => item.key === source.key) === index);
  const original = new Map<string, number>();
  for (const consumption of options.editOriginalConsumptions ?? []) {
    const key = consumption.sourceEntryKey ? `progress:${consumption.sourceEntryKey}` : `opening:${consumption.openingBalanceId}`;
    original.set(key, (original.get(key) ?? 0) + consumption.quantity);
  }
  const adjustedSources = allSources.map(source => ({ ...source, availableQty: source.availableQty + (original.get(source.key) ?? 0) }));
  const rowLedger = Object.fromEntries(projectFormLedger(rows, adjustedSources).map(result => [result.entryKey, result]));
  return { sources: adjustedSources, rowLedger };
}

export function validateCutFillForm(rows: CutFillFormRow[], boqItems: any[], arrangements: CutFillArrangement[], sources: CutFillSourceOption[], isFinal: boolean): string[] {
  if (!isFinal) return [];
  const items = new Map(boqItems.map(item => [Number(item.id), item]));
  const byId = new Map(arrangements.map(arrangement => [arrangement.id, arrangement]));
  const issues: string[] = [];
  for (const row of rows) {
    const item = items.get(Number(row.boqItemId));
    const workType = item ? classifyWorkType(String(item.description ?? item.itemName ?? ""), String(item.unit ?? "")) : null;
    if (workType === "roadway_excavation") {
      const issue = row.materialOutcome == null
        ? "record whether the excavated material is fully reusable, partly reusable, or unsuitable."
        : validateExcavationMaterialOutcome(row.quantity, row.materialOutcome, row.reusableQty);
      if (issue) issues.push(`${item.description ?? item.itemName}: ${issue}`);
    }
    const arrangement = row.earthworkArrangementId != null ? byId.get(Number(row.earthworkArrangementId)) : undefined;
    if (arrangement?.arrangementType === "reused_excavated" && arrangement.sourceExcavationBoqItemId != null) {
      const required = Number(row.quantity) || 0;
      const allocated = (row.allocations ?? []).reduce((sum, allocation) => sum + (Number(allocation.quantity) || 0), 0);
      if (allocated <= 0 || Math.abs(allocated - required) > 0.0001) issues.push(`${item?.description ?? "Fill row"}: allocations must equal ${required} ${item?.unit ?? "CUM"}.`);
    }
  }
  const totals = new Map<string, number>();
  rows.forEach(row => (row.allocations ?? []).forEach(allocation => totals.set(allocation.sourceKey, (totals.get(allocation.sourceKey) ?? 0) + Math.max(0, Number(allocation.quantity) || 0))));
  sources.forEach(source => { if ((totals.get(source.key) ?? 0) > source.availableQty + 0.0001) issues.push(`${source.label}: allocation exceeds available quantity.`); });
  return issues;
}

export function projectFormLedger(
  rows: Array<{ entryKey: string; quantity: number | null; allocations?: LedgerAllocation[] }>,
  sources: LedgerSource[],
) {
  const used = new Map<string, number>();
  rows.forEach(row => (row.allocations ?? []).forEach(a => used.set(a.sourceKey, (used.get(a.sourceKey) ?? 0) + Math.max(0, Number(a.quantity) || 0))));
  return rows.map(row => {
    const required = Math.max(0, Number(row.quantity) || 0);
    const allocations = row.allocations ?? [];
    const allocated = allocations.reduce((sum, a) => sum + Math.max(0, Number(a.quantity) || 0), 0);
    const available = sources.reduce((sum, source) => sum + Math.max(0, source.availableQty - (used.get(source.key) ?? 0) + allocations.filter(a => a.sourceKey === source.key).reduce((s, a) => s + a.quantity, 0)), 0);
    const overdraw = sources.reduce((sum, source) => Math.max(sum, (used.get(source.key) ?? 0) - source.availableQty), 0);
    return { entryKey: row.entryKey, required, allocated, available, uncovered: Math.max(0, required - allocated), overdraw };
  });
}

export function provisionalLedger(
  requiredQty: number,
  sources: LedgerSource[],
  allocations: LedgerAllocation[],
) {
  const allocatedBySource = new Map<string, number>();
  for (const allocation of allocations) {
    allocatedBySource.set(allocation.sourceKey, (allocatedBySource.get(allocation.sourceKey) ?? 0) + Math.max(0, Number(allocation.quantity) || 0));
  }
  const available = sources.reduce((sum, source) => sum + Math.max(0, source.availableQty - (allocatedBySource.get(source.key) ?? 0)), 0);
  const allocated = allocations.reduce((sum, allocation) => sum + Math.max(0, Number(allocation.quantity) || 0), 0);
  return { required: Math.max(0, requiredQty), allocated, available, uncovered: Math.max(0, requiredQty - allocated) };
}

export function flattenCutFillConsumptions(
  rows: Array<{ entryKey: string; allocations?: Array<{ sourceKey?: string; sourceEntryKey?: string | null; openingBalanceId?: number | null; quantity: number }> }>,
): CutFillConsumptionInput[] {
  return rows.flatMap(row => (row.allocations ?? []).map(allocation => ({
    fillEntryKey: row.entryKey,
    sourceEntryKey: allocation.sourceEntryKey ?? (allocation.sourceKey?.startsWith("progress:") ? allocation.sourceKey.slice(9) : null),
    openingBalanceId: allocation.openingBalanceId ?? (allocation.sourceKey?.startsWith("opening:") ? Number(allocation.sourceKey.slice(8)) : null),
    quantity: Number(allocation.quantity),
  })));
}

export function hydrateCutFillConsumptions<T extends { entryKey: string; allocations?: Array<{ sourceEntryKey?: string | null; openingBalanceId?: number | null; quantity: number }> }>(
  rows: T[],
  consumptions: CutFillConsumptionInput[] | null | undefined,
): T[] {
  const byEntry = new Map<string, T>();
  rows.forEach(row => byEntry.set(row.entryKey, { ...row, allocations: [] }));
  for (const consumption of consumptions ?? []) {
    const row = byEntry.get(consumption.fillEntryKey);
    if (row) row.allocations!.push({
      sourceKey: consumption.sourceEntryKey ? `progress:${consumption.sourceEntryKey}` : `opening:${consumption.openingBalanceId}`,
      sourceEntryKey: consumption.sourceEntryKey ?? null,
      openingBalanceId: consumption.openingBalanceId ?? null,
      quantity: Number(consumption.quantity),
    });
  }
  return rows.map(row => byEntry.get(row.entryKey)!);
}