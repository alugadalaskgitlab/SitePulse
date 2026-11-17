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
  itemName?: string | null;
  planningWorkType?: string | null;
  workCategory?: string | null;
  layerConfig?: Record<string, unknown> | null;
  sections?: BoqTypicalSection[];
};

export type TypicalSectionUnit = "CUM" | "SQM";

export interface BoqTypicalSection {
  id?: number;
  chainageFrom: number;
  chainageTo: number;
  topWidthM: number;
  thicknessMm: number | null;
  sideSlope: number;
  note?: string | null;
}

export interface TypicalSectionAllocation {
  sectionIndex: number;
  sectionId?: number;
  quantityPerMetre: number;
  effectiveLengthM: number;
  stretchQuantity: number;
}

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
  /** Present only when valid typical sections were supplied and applied. */
  sectionResults?: TypicalSectionAllocation[];
  /** Quantity by which section-based planning exceeds the item's current BOQ quantity. */
  overBoqQuantity?: number;
}

export function typicalSectionUnit(unit: unknown): TypicalSectionUnit | null {
  const normalized = String(unit ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (["CUM", "M3", "CBM"].includes(normalized)) return "CUM";
  if (["SQM", "M2"].includes(normalized)) return "SQM";
  return null;
}

export function typicalSectionQuantityPerMetre(
  unit: unknown,
  section: Pick<BoqTypicalSection, "topWidthM" | "thicknessMm" | "sideSlope">,
): number | null {
  const sectionUnit = typicalSectionUnit(unit);
  const width = Number(section.topWidthM);
  if (!sectionUnit || !Number.isFinite(width) || width <= 0) return null;
  if (sectionUnit === "SQM") return width;
  const thicknessMm = Number(section.thicknessMm);
  const slope = Number(section.sideSlope);
  if (!Number.isFinite(thicknessMm) || thicknessMm <= 0 || !Number.isFinite(slope) || slope < 0) return null;
  const thicknessM = thicknessMm / 1000;
  return (width + slope * thicknessM) * thicknessM;
}

export function typicalSectionsValidationError(
  unit: unknown,
  sections: BoqTypicalSection[],
): string | null {
  if (Array.isArray(sections) && sections.length === 0) return null;
  const sectionUnit = typicalSectionUnit(unit);
  if (!sectionUnit) return "Typical sections are allowed only for CUM and SQM items.";
  if (!Array.isArray(sections) || sections.length > 500) return "Enter no more than 500 typical sections.";
  const ordered = sections.map((section, index) => {
    const hasNumber = (value: unknown) =>
      (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
      && Number.isFinite(Number(value));
    const from = Number(section.chainageFrom);
    const to = Number(section.chainageTo);
    const width = Number(section.topWidthM);
    const slope = Number(section.sideSlope);
    const thickness = section.thicknessMm == null ? null : Number(section.thicknessMm);
    if (!hasNumber(section.chainageFrom) || from < 0 || !hasNumber(section.chainageTo) || to <= from) {
      return { index, from, to, error: `Row ${index + 1}: enter a valid chainage range.` };
    }
    if (!hasNumber(section.topWidthM) || width <= 0) {
      return { index, from, to, error: `Row ${index + 1}: top width must be greater than zero.` };
    }
    if (!hasNumber(section.sideSlope) || slope < 0) {
      return { index, from, to, error: `Row ${index + 1}: side slope must be zero or greater.` };
    }
    if (sectionUnit === "CUM" && (thickness == null || !hasNumber(section.thicknessMm) || thickness <= 0)) {
      return { index, from, to, error: `Row ${index + 1}: thickness must be greater than zero for CUM.` };
    }
    if (sectionUnit === "SQM" && thickness != null) {
      return { index, from, to, error: `Row ${index + 1}: thickness is not used for SQM.` };
    }
    if (typicalSectionQuantityPerMetre(unit, { topWidthM: width, thicknessMm: thickness, sideSlope: slope }) == null) {
      return { index, from, to, error: `Row ${index + 1}: section values are invalid.` };
    }
    return { index, from, to, error: null };
  });
  const invalid = ordered.find(row => row.error);
  if (invalid?.error) return invalid.error;
  const sorted = [...ordered].sort((a, b) => a.from - b.from || a.to - b.to);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].from < sorted[index - 1].to) {
      return `Rows ${sorted[index - 1].index + 1} and ${sorted[index].index + 1} overlap. Adjust the chainages before saving.`;
    }
  }
  return null;
}

function confirmedSegments(segments: ScopeSegmentLike[]) {
  return segments.filter(segment => (segment.status ?? "confirmed") === "confirmed");
}

const FIXED_UNITS = new Set(["LS", "LUMPSUM", "NOS", "NO", "EACH", "EA", "PCS", "SET", "RM", "RMT"]);

export function defaultsToFixedQuantity(item: Pick<WorkingReachItem, "unit" | "itemName" | "workCategory" | "planningWorkType" | "layerConfig">): boolean {
  const unit = String(item.unit ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  const layerType = String(item.layerConfig?.layerType ?? "").trim().toLowerCase();
  const workType = String(item.planningWorkType ?? "").trim().toLowerCase();
  const category = String(item.workCategory ?? "").trim().toUpperCase();
  const itemName = String(item.itemName ?? "").trim().toLowerCase();
  return FIXED_UNITS.has(unit)
    || /\bembankment\b/.test(itemName)
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
  for (const rows of Array.from(intervals.values())) {
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
  sections?: BoqTypicalSection[],
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
      ? workingSegments.length === 1 ? workingSegments[0] : null
      : workingSegments.find(segment => Number(segment.id) === Number(item.fixedQuantityReachId));
    if (item.fixedQuantityReachId != null && !selected) {
      return {
        denominatorKm, workingLengthKm: 0, workingQuantity: 0,
        notNeededQuantity: currentQty, scoped: denominatorKm > 0, shares: [],
      };
    }
    const masks = segments.filter(segment =>
      segment.segmentType === "no_scope" || segment.segmentType === "withdrawn" || segment.segmentType === "temporary_block",
    );
    const selectedLength = (segment: ScopeSegmentLike) =>
      resolveEligibleScope([segment, ...masks], query).contractualSideLenKm;
    const wholeRoadLengthKm = workingSegments.reduce((sum, segment) => sum + selectedLength(segment), 0);
    const share: WorkingReachShare = selected
      ? {
        reachId: selected.id ?? null,
        label: selected.label?.trim() || `Reach ${workingSegments.indexOf(selected) + 1}`,
        chainageFrom: Number(selected.chainageFrom),
        chainageTo: Number(selected.chainageTo),
        effectiveLengthKm: selectedLength(selected),
        quantity: currentQty,
      }
      : { reachId: null, label: "Whole road", chainageFrom: null, chainageTo: null, effectiveLengthKm: wholeRoadLengthKm, quantity: currentQty };
    return {
      denominatorKm,
      workingLengthKm: selected ? share.effectiveLengthKm : wholeRoadLengthKm,
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
  if (!sections?.length || !typicalSectionUnit(item.unit)) {
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
  const sectionsError = typicalSectionsValidationError(item.unit, sections);
  if (sectionsError) throw new Error(sectionsError);

  const coveredLengthBySection = sections.map(section => {
    let effectiveKm = 0;
    for (const reach of workingSegments) {
      const from = Math.max(Number(reach.chainageFrom), Number(section.chainageFrom));
      const to = Math.min(Number(reach.chainageTo), Number(section.chainageTo));
      if (to <= from) continue;
      const clippedReach: ScopeSegmentLike = { ...reach, chainageFrom: from, chainageTo: to };
      effectiveKm += resolveEligibleScope([clippedReach, ...masks], query).eligibleSideLenKm;
    }
    return effectiveKm;
  });
  const sectionResults: TypicalSectionAllocation[] = sections.map((section, sectionIndex) => {
    const quantityPerMetre = typicalSectionQuantityPerMetre(item.unit, section)!;
    const effectiveLengthM = coveredLengthBySection[sectionIndex] * 1000;
    return {
      sectionIndex,
      ...(section.id != null ? { sectionId: section.id } : {}),
      quantityPerMetre,
      effectiveLengthM,
      stretchQuantity: quantityPerMetre * effectiveLengthM,
    };
  });
  const adjustedShares = shares.map(share => {
    const reach = workingSegments.find(segment => Number(segment.id ?? -1) === Number(share.reachId ?? -2));
    if (!reach) return share;
    let coveredKm = 0;
    for (const section of sections) {
      const from = Math.max(Number(reach.chainageFrom), Number(section.chainageFrom));
      const to = Math.min(Number(reach.chainageTo), Number(section.chainageTo));
      if (to <= from) continue;
      const clippedReach: ScopeSegmentLike = { ...reach, chainageFrom: from, chainageTo: to };
      coveredKm += resolveEligibleScope([clippedReach, ...masks], query).eligibleSideLenKm;
    }
    coveredKm = Math.min(share.effectiveLengthKm, coveredKm);
    const sectionQuantity = sections.reduce((sum, section, sectionIndex) => {
      const from = Math.max(Number(reach.chainageFrom), Number(section.chainageFrom));
      const to = Math.min(Number(reach.chainageTo), Number(section.chainageTo));
      if (to <= from) return sum;
      const clippedReach: ScopeSegmentLike = { ...reach, chainageFrom: from, chainageTo: to };
      const eligibleKm = resolveEligibleScope([clippedReach, ...masks], query).eligibleSideLenKm;
      return sum + sectionResults[sectionIndex].quantityPerMetre * eligibleKm * 1000;
    }, 0);
    const uncoveredQuantity = currentQty * Math.max(0, share.effectiveLengthKm - coveredKm) / denominatorKm;
    return { ...share, quantity: sectionQuantity + uncoveredQuantity };
  });
  const workingLengthKm = adjustedShares.reduce((sum, share) => sum + share.effectiveLengthKm, 0);
  const workingQuantity = adjustedShares.reduce((sum, share) => sum + share.quantity, 0);
  return {
    denominatorKm,
    workingLengthKm,
    workingQuantity,
    notNeededQuantity: Math.max(0, currentQty - workingQuantity),
    scoped: true,
    shares: adjustedShares,
    sectionResults,
    overBoqQuantity: Math.max(0, workingQuantity - currentQty),
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

