import {
  addDays,
  addMonthsClamped,
  daysBetween,
  monthIndexToDateCal,
  toYmd,
  ymdIsValid,
} from "./calendarAxis";
import {
  corridorsForSide,
  resolveEligibleScope,
  segmentAppliesToItem,
  type Corridor,
  type CorridorRange,
  type ScopeItemQuery,
  type ScopeSegmentLike,
} from "./projectScope";
import {
  allocateBoqQuantityToWorkingReaches,
  defaultsToFixedQuantity,
  type WorkingReachAllocation,
  type WorkingReachItem,
} from "./workingReachValue";
import type { BomInputBar, BomInputItem } from "./planningEngine";

const CHAINAGE_EPSILON = 0.0005;
const QUANTITY_EPSILON = 0.000001;
const ROUND_FACTOR = 1_000_000;

type ScopeBomItem = BomInputItem & Partial<WorkingReachItem>;
type ScopeBomBar = BomInputBar & {
  chainageFrom?: number | string | null;
  chainageTo?: number | string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  side?: string | null;
  structureChainageKm?: number | string | null;
};

export type ScopeProgrammeAlignmentRow = {
  barId: number | null;
  rowKey: string;
  boqItemId: number;
  itemCode: string | null;
  itemName: string;
  reachLabel: string | null;
  currentChainageFrom: number | null;
  currentChainageTo: number | null;
  proposedChainageFrom: number | null;
  proposedChainageTo: number | null;
  currentQuantity: number;
  proposedQuantity: number | null;
  action: "update" | "suggest_remove" | "blocked" | "add_bar_needed";
  reason?: string;
};

export type ScopeProgrammeAlignment = {
  rows: ScopeProgrammeAlignmentRow[];
  blockedCount: number;
};

type ItemScopePlan = {
  item: ScopeBomItem;
  allocation: WorkingReachAllocation;
  query: ScopeItemQuery;
  workingSegments: ScopeSegmentLike[];
  masks: ScopeSegmentLike[];
  unrestricted: boolean;
  parts: Array<{
    quantity: number;
    ranges: CorridorRange[];
    fullBoq: boolean;
    reachLabel: string | null;
  }>;
  allowedRanges: CorridorRange[];
};

type ScopeBarQuantities = {
  plansByItem: Map<number, ItemScopePlan>;
  quantityByBarId: Map<number, number>;
};

function round6(value: number): number {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed;
}

function isConfirmed(segment: ScopeSegmentLike): boolean {
  return (segment.status ?? "confirmed") === "confirmed";
}

function itemScopeQuery(item: ScopeBomItem): ScopeItemQuery {
  const layerOrCategory = String(item.layerConfig?.layerType ?? item.workCategory ?? "").toLowerCase();
  return {
    boqItemId: Number(item.id),
    categoryId: item.categoryId == null ? null : Number(item.categoryId),
    isLinear: !["structure", "non_linear"].includes(layerOrCategory),
  };
}

function toWorkingReachItem(item: ScopeBomItem): WorkingReachItem {
  return {
    boqItemId: Number(item.id),
    categoryId: item.categoryId == null ? null : Number(item.categoryId),
    isLinear: itemScopeQuery(item).isLinear,
    currentQty: Number(item.currentQty) || 0,
    unit: item.canonicalUnit ?? item.unit,
    fixedQuantity: item.fixedQuantity,
    fixedQuantityReachId: item.fixedQuantityReachId,
    itemName: item.itemName,
    planningWorkType: item.planningWorkType,
    workCategory: item.workCategory,
    layerConfig: item.layerConfig as Record<string, unknown> | null | undefined,
  };
}

function rangesForReach(
  reach: ScopeSegmentLike,
  masks: ScopeSegmentLike[],
  query: ScopeItemQuery,
): CorridorRange[] {
  return resolveEligibleScope([reach, ...masks], query).executable;
}

function makeItemScopePlan(
  item: ScopeBomItem,
  segments: ScopeSegmentLike[],
): ItemScopePlan {
  const confirmed = segments.filter(isConfirmed);
  const query = itemScopeQuery(item);
  const workingSegments = confirmed.filter(segment =>
    segment.segmentType === "working_reach" && segmentAppliesToItem(segment, query),
  );
  const masks = confirmed.filter(segment =>
    segment.segmentType === "no_scope" ||
    segment.segmentType === "withdrawn" ||
    segment.segmentType === "temporary_block",
  );
  const allocation = allocateBoqQuantityToWorkingReaches(toWorkingReachItem(item), segments);
  const unrestricted = allocation.shares.some(share => share.label === "Full BOQ") ||
    (allocation.shares.some(share => share.label === "Whole road") && workingSegments.length === 0);
  const parts: ItemScopePlan["parts"] = [];

  for (const share of allocation.shares) {
    if (share.reachId != null) {
      const reach = workingSegments.find(segment => Number(segment.id) === Number(share.reachId));
      if (!reach) continue;
      parts.push({
        quantity: Math.max(0, Number(share.quantity) || 0),
        ranges: rangesForReach(reach, masks, query),
        fullBoq: false,
        reachLabel: share.label,
      });
      continue;
    }
    if (unrestricted) {
      parts.push({
        quantity: Math.max(0, Number(share.quantity) || 0),
        ranges: [],
        fullBoq: true,
        reachLabel: share.label,
      });
      continue;
    }

    const weightedReaches = workingSegments.map(reach => ({
      reach,
      length: resolveEligibleScope([reach, ...masks], query).contractualSideLenKm,
    })).filter(entry => entry.length > 0);
    const lengthTotal = weightedReaches.reduce((sum, entry) => sum + entry.length, 0);
    if (lengthTotal <= 0) continue;
    for (const entry of weightedReaches) {
      parts.push({
        quantity: Math.max(0, Number(share.quantity) || 0) * entry.length / lengthTotal,
        ranges: rangesForReach(entry.reach, masks, query),
        fullBoq: false,
        reachLabel: entry.reach.label ?? share.label,
      });
    }
  }

  const allowedRanges = unrestricted
    ? []
    : parts.filter(part => !part.fullBoq).flatMap(part => part.ranges);
  return { item, allocation, query, workingSegments, masks, unrestricted, parts, allowedRanges };
}

function normalizedCategoryForFixedDefault(item: ScopeBomItem): string {
  return String(item.workCategory ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isFixedForAlignment(item: ScopeBomItem): boolean {
  if (item.fixedQuantity != null) return item.fixedQuantity;
  return defaultsToFixedQuantity({
    ...toWorkingReachItem(item),
    workCategory: normalizedCategoryForFixedDefault(item),
  });
}

function alignmentFixedAllocation(
  item: ScopeBomItem,
  segments: ScopeSegmentLike[],
): WorkingReachAllocation {
  return allocateBoqQuantityToWorkingReaches(
    { ...toWorkingReachItem(item), fixedQuantity: true },
    segments,
  );
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isWholeCountUnit(item: ScopeBomItem): boolean {
  const unit = String(item.canonicalUnit ?? item.unit ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return ["NO", "NOS", "EACH", "EA", "SET", "SETS", "PC", "PCS"].includes(unit);
}

function distributeFixedQuantity(
  quantity: number,
  item: ScopeBomItem,
  candidates: Array<{ barId: number; weight: number }>,
): Map<number, number> {
  const result = new Map<number, number>();
  const positive = candidates
    .filter(candidate => candidate.weight > QUANTITY_EPSILON)
    .sort((a, b) => a.barId - b.barId);
  const totalWeight = positive.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (!positive.length || totalWeight <= QUANTITY_EPSILON) return result;

  if (isWholeCountUnit(item)) {
    const total = Math.max(0, Math.round(quantity));
    const rows = positive.map(candidate => {
      const exact = total * candidate.weight / totalWeight;
      const base = Math.floor(exact);
      return { ...candidate, value: base, remainder: exact - base };
    });
    let remaining = total - rows.reduce((sum, row) => sum + row.value, 0);
    const byRemainder = [...rows].sort((a, b) =>
      b.remainder - a.remainder || a.barId - b.barId,
    );
    for (let index = 0; remaining > 0; index = (index + 1) % byRemainder.length) {
      byRemainder[index].value += 1;
      remaining -= 1;
    }
    for (const row of rows) result.set(row.barId, row.value);
    return result;
  }

  const total = Math.max(0, round2(quantity));
  let assigned = 0;
  positive.forEach((candidate, index) => {
    const value = index === positive.length - 1
      ? round2(Math.max(0, total - assigned))
      : Math.min(round2(total * candidate.weight / totalWeight), Math.max(0, total - assigned));
    assigned = round2(assigned + value);
    result.set(candidate.barId, value);
  });
  return result;
}

function barWeightWithinRanges(bar: ScopeBomBar, ranges: CorridorRange[]): number {
  const barCorridors = corridorsForSide(bar.side);
  const from = finite(bar.chainageFrom);
  const to = finite(bar.chainageTo);
  if (from != null && to != null && to > from) {
    return barCorridors.reduce((sum, corridor) => {
      const overlap = ranges
        .filter(range => range.corridor === corridor)
        .reduce((rangeSum, range) =>
          rangeSum + Math.max(0, Math.min(to, range.to) - Math.max(from, range.from)),
        0);
      return sum + overlap * 0.5;
    }, 0);
  }
  const point = finite(bar.structureChainageKm);
  if (point == null) return 0;
  return barCorridors.reduce((sum, corridor) =>
    sum + (ranges.some(range =>
      range.corridor === corridor &&
      point >= range.from - CHAINAGE_EPSILON &&
      point <= range.to + CHAINAGE_EPSILON,
    ) ? 0.5 : 0),
  0);
}

function fullBarWeight(bar: ScopeBomBar): number {
  const from = finite(bar.chainageFrom);
  const to = finite(bar.chainageTo);
  if (from != null && to != null && to > from) {
    return (to - from) * corridorsForSide(bar.side).length * 0.5;
  }
  const point = finite(bar.structureChainageKm);
  return point == null ? 0 : corridorsForSide(bar.side).length * 0.5;
}

function calculateScopeBarQuantities(
  items: ScopeBomItem[],
  bars: ScopeBomBar[],
  segments: ScopeSegmentLike[],
): ScopeBarQuantities {
  const plansByItem = new Map<number, ItemScopePlan>();
  const barsByItem = new Map<number, ScopeBomBar[]>();
  for (const bar of bars) {
    const itemId = Number(bar.boqItemId);
    barsByItem.set(itemId, [...(barsByItem.get(itemId) ?? []), bar]);
  }

  const quantityByBarId = new Map<number, number>();
  for (const item of items) {
    const itemId = Number(item.id);
    const plan = makeItemScopePlan(item, segments);
    plansByItem.set(itemId, plan);
    if (plan.allocation.workingQuantity <= QUANTITY_EPSILON) continue;
    const itemBars = barsByItem.get(itemId) ?? [];

    for (const part of plan.parts) {
      if (part.quantity <= QUANTITY_EPSILON) continue;
      const weightedBars = itemBars.map(bar => ({
        bar,
        weight: part.fullBoq ? fullBarWeight(bar) : barWeightWithinRanges(bar, part.ranges),
      })).filter(entry => entry.weight > QUANTITY_EPSILON);
      const totalWeight = weightedBars.reduce((sum, entry) => sum + entry.weight, 0);
      if (totalWeight <= QUANTITY_EPSILON) continue;
      for (const entry of weightedBars) {
        if (entry.bar.id == null) continue;
        const quantity = part.quantity * entry.weight / totalWeight;
        quantityByBarId.set(
          Number(entry.bar.id),
          (quantityByBarId.get(Number(entry.bar.id)) ?? 0) + quantity,
        );
      }
    }
  }
  return { plansByItem, quantityByBarId };
}

function barMonthShares(
  bar: ScopeBomBar,
  projectStartDate: string | Date | null | undefined,
  totalMonths: number,
): Record<number, number> | undefined {
  if (!projectStartDate) return undefined;
  const projectStart = toYmd(projectStartDate);
  if (!ymdIsValid(projectStart)) return undefined;

  const startYmd = bar.startDate != null
    ? toYmd(bar.startDate)
    : bar.startMonth != null
      ? toYmd(monthIndexToDateCal(Number(bar.startMonth), projectStartDate))
      : null;
  const endExclusive = bar.endDate != null
    ? addDays(toYmd(bar.endDate), 1)
    : bar.endMonth != null
      ? toYmd(monthIndexToDateCal(Number(bar.endMonth), projectStartDate))
      : null;
  if (!startYmd || !endExclusive || !ymdIsValid(startYmd) || !ymdIsValid(endExclusive)) return undefined;
  const duration = daysBetween(startYmd, endExclusive);
  if (duration <= 0) return undefined;

  const result: Record<number, number> = {};
  for (let month = 1; month <= totalMonths; month++) {
    const monthStart = addMonthsClamped(projectStart, month - 1);
    const monthEnd = addMonthsClamped(projectStart, month);
    const overlapStart = daysBetween(startYmd, monthStart) > 0 ? monthStart : startYmd;
    const overlapEnd = daysBetween(endExclusive, monthEnd) > 0 ? endExclusive : monthEnd;
    const overlap = Math.max(
      0,
      daysBetween(overlapStart, overlapEnd),
    );
    if (overlap > 0) result[month] = overlap / duration;
  }
  return Object.keys(result).length ? result : undefined;
}

export function buildScopeBasedBomSchedule(input: {
  items: BomInputItem[];
  bars: BomInputBar[];
  segments: ScopeSegmentLike[];
  projectStartDate?: string | Date | null;
  totalMonths: number;
}): { items: BomInputItem[]; bars: BomInputBar[] } {
  const items = input.items as ScopeBomItem[];
  const bars = input.bars as ScopeBomBar[];
  const { plansByItem, quantityByBarId } = calculateScopeBarQuantities(items, bars, input.segments);
  const scopedItems: BomInputItem[] = [];
  const scopedBars: BomInputBar[] = [];

  for (const item of items) {
    const plan = plansByItem.get(Number(item.id));
    if (!plan || plan.allocation.workingQuantity <= QUANTITY_EPSILON) continue;
    scopedItems.push({ ...item, currentQty: plan.allocation.workingQuantity });
    let scheduledQty = 0;
    for (const bar of bars.filter(candidate => Number(candidate.boqItemId) === Number(item.id))) {
      if (bar.id == null) continue;
      const qty = quantityByBarId.get(Number(bar.id)) ?? 0;
      if (qty <= QUANTITY_EPSILON) continue;
      scheduledQty += qty;
      scopedBars.push({
        ...bar,
        plannedQty: qty,
        monthlyDayShares: barMonthShares(bar, input.projectStartDate, input.totalMonths),
        isProgrammed: true,
      });
    }
    const unscheduled = Math.max(0, plan.allocation.workingQuantity - scheduledQty);
    if (unscheduled > QUANTITY_EPSILON) {
      scopedBars.push({
        boqItemId: Number(item.id),
        chainageFrom: null,
        chainageTo: null,
        plannedQty: unscheduled,
        isQtyOverride: false,
        isProgrammed: false,
      });
    }
  }
  return { items: scopedItems, bars: scopedBars };
}

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = intervals
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to - from > CHAINAGE_EPSILON)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [from, to] of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && from <= previous[1] + CHAINAGE_EPSILON) previous[1] = Math.max(previous[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

function allowedIntervalsForBar(
  bar: ScopeBomBar,
  ranges: CorridorRange[],
): { intervals: Array<[number, number]>; hasDifferentCorridorRanges: boolean } {
  const corridors = corridorsForSide(bar.side);
  const byCorridor = corridors.map(corridor => ({
    corridor,
    intervals: mergeIntervals(ranges
      .filter(range => range.corridor === corridor)
      .map(range => [range.from, range.to] as [number, number])),
  }));
  if (!byCorridor.length) return { intervals: [], hasDifferentCorridorRanges: false };
  const first = byCorridor[0].intervals;
  const different = byCorridor.some(({ intervals }) =>
    intervals.length !== first.length ||
    intervals.some((interval, index) =>
      Math.abs(interval[0] - (first[index]?.[0] ?? NaN)) > CHAINAGE_EPSILON ||
      Math.abs(interval[1] - (first[index]?.[1] ?? NaN)) > CHAINAGE_EPSILON,
    ),
  );
  if (different) return { intervals: [], hasDifferentCorridorRanges: true };
  return { intervals: first, hasDifferentCorridorRanges: false };
}

function alignmentReachLabel(
  plan: ItemScopePlan,
  bar: ScopeBomBar,
  from: number | null,
  to: number | null,
): string | null {
  if (plan.unrestricted) return "Whole road";
  if (from == null || to == null) return null;
  const corridors = corridorsForSide(bar.side);
  const labels = Array.from(new Set(plan.parts
    .filter(part => !part.fullBoq && part.ranges.some(range =>
      corridors.includes(range.corridor) &&
      Math.min(to, range.to) - Math.max(from, range.from) > CHAINAGE_EPSILON,
    ))
    .map(part => part.reachLabel)
    .filter((label): label is string => !!label)));
  return labels.length ? labels.join(", ") : null;
}

export function buildScopeProgrammeAlignment(input: {
  items: BomInputItem[];
  bars: BomInputBar[];
  segments: ScopeSegmentLike[];
}): ScopeProgrammeAlignment {
  const items = input.items as ScopeBomItem[];
  const bars = input.bars as ScopeBomBar[];
  const itemById = new Map(items.map(item => [Number(item.id), item]));
  const { plansByItem, quantityByBarId } = calculateScopeBarQuantities(items, bars, input.segments);
  const states: Array<{
    bar: ScopeBomBar;
    item: ScopeBomItem;
    plan: ItemScopePlan;
    currentFrom: number | null;
    currentTo: number | null;
    proposedFrom: number | null;
    proposedTo: number | null;
    action: ScopeProgrammeAlignmentRow["action"];
    reason?: string;
  }> = [];

  for (const bar of bars) {
    if (bar.id == null) continue;
    const item = itemById.get(Number(bar.boqItemId));
    const plan = plansByItem.get(Number(bar.boqItemId));
    if (!item || !plan) continue;
    const currentFrom = finite(bar.chainageFrom);
    const currentTo = finite(bar.chainageTo);
    const point = finite(bar.structureChainageKm);
    if ((currentFrom == null || currentTo == null || currentTo <= currentFrom) && point == null) {
      states.push({
        bar, item, plan, currentFrom, currentTo,
        proposedFrom: null, proposedTo: null, action: "blocked",
        reason: "This bar has no chainage or structure location; set its location before applying scope alignment.",
      });
      continue;
    }

    let proposedFrom = currentFrom;
    let proposedTo = currentTo;
    let action: ScopeProgrammeAlignmentRow["action"] = "update";
    let reason: string | undefined;

    if (!plan.unrestricted) {
      const allowed = allowedIntervalsForBar(bar, plan.allowedRanges);
      if (allowed.hasDifferentCorridorRanges) {
        action = "blocked";
        reason = "The bar covers sides with different working chainages; one bar cannot represent both.";
      } else if (currentFrom != null && currentTo != null && currentTo > currentFrom) {
        const intersections = allowed.intervals
          .map(([from, to]) => [Math.max(from, currentFrom), Math.min(to, currentTo)] as [number, number])
          .filter(([from, to]) => to - from > CHAINAGE_EPSILON);
        if (!intersections.length) {
          action = "suggest_remove";
          reason = "This bar does not overlap an applicable confirmed working reach.";
        } else if (intersections.length > 1) {
          action = "blocked";
          reason = "The bar crosses separated working ranges; trimming it would require splitting the bar.";
        } else {
          proposedFrom = round6(intersections[0][0]);
          proposedTo = round6(intersections[0][1]);
        }
      } else if (point != null) {
        const pointIsEligible = corridorsForSide(bar.side).some(corridor =>
          allowed.intervals.some(([from, to]) =>
            point >= from - CHAINAGE_EPSILON && point <= to + CHAINAGE_EPSILON,
          ),
        );
        if (!pointIsEligible) {
          action = "suggest_remove";
          reason = "This structure location is outside an applicable confirmed working reach.";
        }
      }
    }

    states.push({ bar, item, plan, currentFrom, currentTo, proposedFrom, proposedTo, action, reason });
  }

  const fixedQuantityByBarId = new Map<number, number>();
  const noRemainingFixedItems = new Set<number>();
  for (const item of items) {
    if (!isFixedForAlignment(item)) continue;
    const allocation = alignmentFixedAllocation(item, input.segments);
    if (allocation.workingQuantity <= QUANTITY_EPSILON) continue;
    const itemStates = states.filter(state => Number(state.item.id) === Number(item.id));
    const remaining = itemStates.filter(state => state.action !== "suggest_remove");
    if (!remaining.length) {
      noRemainingFixedItems.add(Number(item.id));
      continue;
    }
    const candidates = remaining.flatMap(state => {
      if (state.bar.id == null) return [];
      const from = state.action === "update" ? state.proposedFrom : state.currentFrom;
      const to = state.action === "update" ? state.proposedTo : state.currentTo;
      const weight = fullBarWeight({
        ...state.bar,
        chainageFrom: from,
        chainageTo: to,
      });
      return weight > QUANTITY_EPSILON
        ? [{ barId: Number(state.bar.id), weight }]
        : [];
    });
    if (!candidates.length) continue;
    const allocated = distributeFixedQuantity(allocation.workingQuantity, item, candidates);
    for (const [barId, quantity] of allocated) fixedQuantityByBarId.set(barId, quantity);
  }

  const rows: ScopeProgrammeAlignmentRow[] = [];
  for (const state of states) {
    const { bar, item, plan, currentFrom, currentTo, proposedFrom, proposedTo, action, reason } = state;
    if (bar.id == null) continue;
    const barId = Number(bar.id);
    const fixed = isFixedForAlignment(item);
    const proposedQuantity = action === "suggest_remove" || action === "blocked"
      ? null
      : fixed
        ? fixedQuantityByBarId.get(barId) ?? null
        : round6(quantityByBarId.get(barId) ?? 0);
    if (action === "suggest_remove") {
      rows.push({
        barId,
        rowKey: `bar-${barId}`,
        boqItemId: Number(bar.boqItemId),
        itemCode: item.itemCode ?? null,
        itemName: item.itemName || item.description,
        reachLabel: alignmentReachLabel(plan, bar, currentFrom, currentTo) ?? "No applicable working reach",
        currentChainageFrom: currentFrom,
        currentChainageTo: currentTo,
        proposedChainageFrom: null,
        proposedChainageTo: null,
        currentQuantity: Number(bar.plannedQty) || 0,
        proposedQuantity: null,
        action,
        reason,
      });
      continue;
    }
    if (action === "blocked") {
      rows.push({
        barId,
        rowKey: `bar-${barId}`,
        boqItemId: Number(bar.boqItemId),
        itemCode: item.itemCode ?? null,
        itemName: item.itemName || item.description,
        reachLabel: alignmentReachLabel(plan, bar, currentFrom, currentTo),
        currentChainageFrom: currentFrom,
        currentChainageTo: currentTo,
        proposedChainageFrom: null,
        proposedChainageTo: null,
        currentQuantity: Number(bar.plannedQty) || 0,
        proposedQuantity,
        action,
        reason,
      });
      continue;
    }

    const chainageChanged =
      (currentFrom == null) !== (proposedFrom == null) ||
      (currentTo == null) !== (proposedTo == null) ||
      (currentFrom != null && proposedFrom != null && Math.abs(currentFrom - proposedFrom) > CHAINAGE_EPSILON) ||
      (currentTo != null && proposedTo != null && Math.abs(currentTo - proposedTo) > CHAINAGE_EPSILON);
    const quantityChanged = proposedQuantity != null &&
      Math.abs((Number(bar.plannedQty) || 0) - proposedQuantity) > QUANTITY_EPSILON;
    if (!chainageChanged && !quantityChanged) continue;
    rows.push({
      barId,
      rowKey: `bar-${barId}`,
      boqItemId: Number(bar.boqItemId),
      itemCode: item.itemCode ?? null,
      itemName: item.itemName || item.description,
      reachLabel: alignmentReachLabel(plan, bar, proposedFrom, proposedTo),
      currentChainageFrom: currentFrom,
      currentChainageTo: currentTo,
      proposedChainageFrom: proposedFrom,
      proposedChainageTo: proposedTo,
      currentQuantity: Number(bar.plannedQty) || 0,
      proposedQuantity,
      action: "update",
    });
  }

  for (const itemId of noRemainingFixedItems) {
    const item = itemById.get(itemId);
    if (!item) continue;
    const allocation = alignmentFixedAllocation(item, input.segments);
    const itemName = item.itemName || item.description;
    rows.push({
      barId: null,
      rowKey: `item-${itemId}-add-bar`,
      boqItemId: itemId,
      itemCode: item.itemCode ?? null,
      itemName,
      reachLabel: allocation.shares.map(share => share.label).join(", ") || null,
      currentChainageFrom: null,
      currentChainageTo: null,
      proposedChainageFrom: null,
      proposedChainageTo: null,
      currentQuantity: 0,
      proposedQuantity: null,
      action: "add_bar_needed",
      reason: `${itemName} has no programme bar in its reach — add a bar`,
    });
  }

  return {
    rows,
    blockedCount: rows.filter(row => row.action === "blocked").length,
  };
}
