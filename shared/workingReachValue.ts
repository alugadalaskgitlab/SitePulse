import { parseChainageKm } from "./barSide";
import {
  resolveEligibleScope,
  segmentAppliesToItem,
  type ScopeItemQuery,
  type ScopeSegmentLike,
  corridorsForSide,
} from "./projectScope";

export type WorkingReachItem = ScopeItemQuery & {
  currentQty: number;
  unit?: string | null;
  clientRate?: number | null;
  fixedQuantity?: boolean | null;
  fixedQuantityReachId?: number | null;
  planningWorkType?: string | null;
  workCategory?: string | null;
  layerConfig?: Record<string, unknown> | null;
};

export interface WorkingReachShare {
  reachId: number | null;
  label: string;
  chainageFrom: number | null;
  chainageTo: number | null;
  effectiveLengthKm: number;
  quantity: number;
}

export interface WorkingReachAllocation {
  denominatorKm: number;
  workingLengthKm: number;
  workingQuantity: number;
  notNeededQuantity: number;
  scoped: boolean;
  shares: WorkingReachShare[];
}

function confirmedSegments(segments: ScopeSegmentLike[]) {
  return segments.filter(segment => (segment.status ?? "confirmed") === "confirmed");
}

const FIXED_UNITS = new Set(["LS", "LUMPSUM", "NOS", "NO", "EACH", "EA", "PCS", "SET", "RM", "RMT"]);

export function defaultsToFixedQuantity(item: Pick<WorkingReachItem, "unit" | "workCategory" | "planningWorkType" | "layerConfig">): boolean {
  const unit = String(item.unit ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  const layerType = String(item.layerConfig?.layerType ?? "").trim().toLowerCase();
  const workType = String(item.planningWorkType ?? "").trim().toLowerCase();
  const category = String(item.workCategory ?? "").trim().toUpperCase();
  return FIXED_UNITS.has(unit)
    || layerType === "structure"
    || workType === "structure"
    || /STRUCTURE|CULVERT|BRIDGE|ROAD_FURNITURE|ROAD_SAFETY/.test(category);
}

function unionLengthByCorridor(segments: ScopeSegmentLike[]): number {
  const intervals = new Map<string, Array<[number, number]>>();
  for (const segment of segments) {
    if (!["working_reach", "no_scope", "withdrawn"].includes(segment.segmentType)) continue;
    for (const corridor of corridorsForSide(segment.side)) {
      const rows = intervals.get(corridor) ?? [];
      rows.push([segment.chainageFrom, segment.chainageTo]);
      intervals.set(corridor, rows);
    }
  }
  let length = 0;
  for (const rows of intervals.values()) {
    rows.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [from, to] of rows) {
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
      const previous = merged[merged.length - 1];
      if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to);
      else merged.push([from, to]);
    }
    length += merged.reduce((sum, [from, to]) => sum + to - from, 0) * 0.5;
  }
  return length;
}

/**
 * Distributes an item's current BOQ quantity only across its confirmed working
 * reaches. The denominator also includes confirmed no-scope and withdrawn
 * corridor lengths, so the unused contract portion is not silently reallocated
 * to the remaining reaches.
 */
export function allocateBoqQuantityToWorkingReaches(
  item: WorkingReachItem,
  sourceSegments: ScopeSegmentLike[],
): WorkingReachAllocation {
  const segments = confirmedSegments(sourceSegments);
  const query: ScopeItemQuery = {
    boqItemId: item.boqItemId,
    categoryId: item.categoryId,
    isLinear: item.isLinear,
  };
  const denominatorKm = unionLengthByCorridor(segments);
  const workingSegments = segments.filter(segment =>
    segment.segmentType === "working_reach" && segmentAppliesToItem(segment, query),
  );
  const currentQty = Number.isFinite(Number(item.currentQty)) ? Math.max(0, Number(item.currentQty)) : 0;
  const fixed = item.fixedQuantity ?? defaultsToFixedQuantity(item);
  if (fixed) {
    const selected = item.fixedQuantityReachId == null
      ? null
      : workingSegments.find(segment => Number(segment.id) === Number(item.fixedQuantityReachId));
    if (item.fixedQuantityReachId != null && !selected) {
      return {
        denominatorKm, workingLengthKm: 0, workingQuantity: 0,
        notNeededQuantity: currentQty, scoped: denominatorKm > 0, shares: [],
      };
    }
    const share: WorkingReachShare = selected
      ? {
        reachId: selected.id ?? null,
        label: selected.label?.trim() || "Selected reach",
        chainageFrom: Number(selected.chainageFrom),
        chainageTo: Number(selected.chainageTo),
        effectiveLengthKm: Math.max(0, Number(selected.chainageTo) - Number(selected.chainageFrom)),
        quantity: currentQty,
      }
      : { reachId: null, label: "Whole project", chainageFrom: null, chainageTo: null, effectiveLengthKm: 0, quantity: currentQty };
    return {
      denominatorKm,
      workingLengthKm: selected ? share.effectiveLengthKm : 0,
      workingQuantity: currentQty,
      notNeededQuantity: 0,
      scoped: denominatorKm > 0,
      shares: [share],
    };
  }
  if (denominatorKm <= 0) {
    const hasLinearScope = item.isLinear && segments.some(segment =>
      ["working_reach", "no_scope", "withdrawn"].includes(segment.segmentType),
    );
    if (hasLinearScope) {
      return {
        denominatorKm: 0,
        workingLengthKm: 0,
        workingQuantity: 0,
        notNeededQuantity: currentQty,
        scoped: true,
        shares: [],
      };
    }
    return {
      denominatorKm: 0,
      workingLengthKm: 0,
      workingQuantity: currentQty,
      notNeededQuantity: 0,
      scoped: false,
      shares: [{ reachId: null, label: "Full BOQ", chainageFrom: null, chainageTo: null, effectiveLengthKm: 0, quantity: currentQty }],
    };
  }
  if (!workingSegments.length) {
    return {
      denominatorKm,
      workingLengthKm: 0,
      workingQuantity: 0,
      notNeededQuantity: currentQty,
      scoped: true,
      shares: [],
    };
  }

  const masks = segments.filter(segment =>
    segment.segmentType === "no_scope" || segment.segmentType === "withdrawn" || segment.segmentType === "temporary_block",
  );
  const shares = workingSegments.map((reach, index) => {
    const effective = resolveEligibleScope([reach, ...masks], query);
    const effectiveLengthKm = effective.contractualSideLenKm;
    return {
      reachId: reach.id ?? null,
      label: reach.label?.trim() || `Reach ${index + 1}`,
      chainageFrom: Number(reach.chainageFrom),
      chainageTo: Number(reach.chainageTo),
      effectiveLengthKm,
      quantity: currentQty * effectiveLengthKm / denominatorKm,
    };
  }).filter(share => share.effectiveLengthKm > 0);
  const workingLengthKm = shares.reduce((sum, share) => sum + share.effectiveLengthKm, 0);
  const workingQuantity = shares.reduce((sum, share) => sum + share.quantity, 0);
  return {
    denominatorKm,
    workingLengthKm,
    workingQuantity,
    notNeededQuantity: Math.max(0, currentQty - workingQuantity),
    scoped: true,
    shares,
  };
}

export interface ProgressWorkForReach {
  quantity: number | string | null;
  dprConversionFactor?: number | string | null;
  side?: string | null;
  chainageFrom?: string | null;
  chainageTo?: string | null;
  chainageFromKm?: number | string | null;
  chainageToKm?: number | string | null;
  isIncidental?: boolean | null;
  reworkNoNewMaterial?: boolean | null;
}

export function workingValueCategory(row: Pick<ProgressWorkForReach, "isIncidental" | "reworkNoNewMaterial">) {
  if (row.reworkNoNewMaterial === true) return "rework" as const;
  if (row.isIncidental === true) return "incidental" as const;
  return "billable" as const;
}

function numericChainage(raw: string | null | undefined, value: number | string | null | undefined): number | null {
  if (value != null && Number.isFinite(Number(value))) return Number(value);
  return parseChainageKm(raw);
}

/**
 * Portion of a submitted DPR line attributed to one reach. Full-width DPR
 * quantities are split across matching half-corridors; missing chainage is
 * assigned only when exactly one reach is applicable.
 */
export function quantityForWorkingReach(
  row: ProgressWorkForReach,
  reach: Pick<ScopeSegmentLike, "chainageFrom" | "chainageTo" | "side">,
  applicableReachCount: number,
): number | null {
  const quantity = Number(row.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const factor = row.dprConversionFactor == null ? 1 : Number(row.dprConversionFactor);
  if (!Number.isFinite(factor) || factor < 0) return null;
  const total = quantity * factor;
  const from = numericChainage(row.chainageFrom, row.chainageFromKm);
  const to = numericChainage(row.chainageTo, row.chainageToKm);
  if (from == null || to == null || to <= from) return applicableReachCount === 1 ? total : null;
  const overlap = Math.max(0, Math.min(to, reach.chainageTo) - Math.max(from, reach.chainageFrom));
  if (overlap <= 0) return 0;
  const rowCorridors = corridorsForSide(row.side);
  const reachCorridors = new Set(corridorsForSide(reach.side));
  const matchingCorridors = rowCorridors.filter(corridor => reachCorridors.has(corridor)).length;
  if (!matchingCorridors) return 0;
  const corridorShare = matchingCorridors / rowCorridors.length;
  return total * overlap / (to - from) * corridorShare;
}

