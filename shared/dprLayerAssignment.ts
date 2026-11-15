import { isEligibleSubmittedDpr, type DprEligibilityState } from "./dprEligibility";
import { parseChainageKm } from "./barSide";

export type DprLayerAssignmentSource = DprEligibilityState & {
  progressId: number;
  dprId: number;
  dprDate: string | Date;
  dprIsDeleted?: boolean | null;
  dprIsCancelled?: boolean | null;
  dprIsSuperseded?: boolean | null;
  boqItemId: number;
  itemName: string;
  itemUnit: string;
  activity: string;
  side: string | null;
  chainageFrom: string | null;
  chainageTo: string | null;
  chainageFromKm?: number | null;
  chainageToKm?: number | null;
  length: number | null;
  width: number | null;
  thickness: number | null;
  quantity: number | null;
  uom: string | null;
  layerNo: number | null;
  noSiteWork?: boolean | null;
};

export type DprLayerReach = {
  id: number;
  label: string | null;
  chainageFrom: number;
  chainageTo: number;
  side: string | null;
  applicability?: string | null;
  itemIds?: string | null;
};

export type DprLayerAssignmentOptions = {
  itemIds: number[];
  layerCount: number;
  compactedThicknessMm: number;
  roadLengthKm: number | null;
  layerOverrides?: Record<number, number>;
};

export type DprLayerAssignmentRow = DprLayerAssignmentSource & {
  counted: boolean;
  proposedLayer: number | null;
  expectedVolumeCum: number | null;
  quantityDifferenceCum: number | null;
  flags: string[];
};

function validPositiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function sideKey(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["lhs", "left", "leftside"].includes(normalized)) return "lhs";
  if (["rhs", "right", "rightside"].includes(normalized)) return "rhs";
  if (["both", "bothsides", "fullwidth", "all"].includes(normalized)) return "both";
  if (normalized.includes("median")) return "median";
  if (normalized.includes("shoulderlhs")) return "shoulder_lhs";
  if (normalized.includes("shoulderrhs")) return "shoulder_rhs";
  if (normalized.includes("serviceroadlhs")) return "service_road_lhs";
  if (normalized.includes("serviceroadrhs")) return "service_road_rhs";
  return normalized;
}

/** Unknown or full-width sides are treated conservatively as overlapping. */
export function dprLayerSidesOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = sideKey(a);
  const right = sideKey(b);
  if (!left || !right || left === "both" || right === "both") return true;
  return left === right;
}

function rowRange(row: DprLayerAssignmentSource): [number, number] | null {
  const from = row.chainageFromKm != null && Number.isFinite(Number(row.chainageFromKm))
    ? Number(row.chainageFromKm)
    : parseChainageKm(row.chainageFrom);
  const to = row.chainageToKm != null && Number.isFinite(Number(row.chainageToKm))
    ? Number(row.chainageToKm)
    : parseChainageKm(row.chainageTo);
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
  return [Math.min(from, to), Math.max(from, to)];
}

function rangesOverlap(a: [number, number] | null, b: [number, number] | null): boolean {
  return !!a && !!b && Math.max(a[0], b[0]) < Math.min(a[1], b[1]);
}

function dateOrder(value: string | Date): { timestamp: number; fallback: string } {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const timestamp = Date.parse(date);
  return { timestamp: Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY, fallback: String(value) };
}

function measuredLengthM(row: DprLayerAssignmentSource): number | null {
  const length = Number(row.length);
  if (Number.isFinite(length) && length > 0) return length;
  const range = rowRange(row);
  return range ? (range[1] - range[0]) * 1000 : null;
}

export function calculateDprLayerAssignments(
  sourceRows: readonly DprLayerAssignmentSource[],
  options: DprLayerAssignmentOptions,
): DprLayerAssignmentRow[] {
  const wanted = new Set(options.itemIds.map(Number));
  const rows = sourceRows
    .filter((row) => wanted.has(Number(row.boqItemId)))
    .filter((row) => {
      const flags = {
        dprStatus: row.dprStatus,
        isDeleted: row.dprIsDeleted ?? row.isDeleted,
        isCancelled: row.dprIsCancelled ?? row.isCancelled,
        isSuperseded: row.dprIsSuperseded ?? row.isSuperseded,
      };
      return isEligibleSubmittedDpr(flags)
        || flags.dprStatus === "draft"
          && flags.isDeleted !== true
          && flags.isCancelled !== true
          && flags.isSuperseded !== true;
    })
    .slice()
    .sort((a, b) => {
      const dateA = dateOrder(a.dprDate);
      const dateB = dateOrder(b.dprDate);
      return dateA.timestamp - dateB.timestamp
        || dateA.fallback.localeCompare(dateB.fallback)
        || a.dprId - b.dprId
        || a.progressId - b.progressId;
    });

  const placed: Array<{ row: DprLayerAssignmentSource; range: [number, number]; layer: number }> = [];
  return rows.map((row) => {
    const counted = isEligibleSubmittedDpr({
      dprStatus: row.dprStatus,
      isDeleted: row.dprIsDeleted ?? row.isDeleted,
      isCancelled: row.dprIsCancelled ?? row.isCancelled,
      isSuperseded: row.dprIsSuperseded ?? row.isSuperseded,
    });
    const range = rowRange(row);
    const flags: string[] = [];
    if (!counted) {
      return { ...row, counted: false, proposedLayer: null, expectedVolumeCum: null, quantityDifferenceCum: null, flags: ["draft — not counted"] };
    }

    const earlierLayers = placed
      .filter((previous) => dprLayerSidesOverlap(row.side, previous.row.side) && rangesOverlap(range, previous.range))
      .map((previous) => previous.layer);
    const computedLayer = earlierLayers.length ? Math.max(...earlierLayers) + 1 : 1;
    const override = validPositiveInteger(options.layerOverrides?.[row.progressId]);
    const savedLayer = validPositiveInteger(row.layerNo);
    const proposedLayer = override ?? savedLayer ?? computedLayer;

    if (!range) flags.push("No chainage — overlap not checked");
    const layers = validPositiveInteger(options.layerCount) ?? 0;
    if (proposedLayer > layers) flags.push(`More than ${layers} layers`);

    const expectedUom = String(row.itemUnit ?? "").trim();
    if (!row.uom || String(row.uom).trim().toUpperCase() !== expectedUom.toUpperCase()) {
      flags.push(`Unit not ${expectedUom || "set"}`);
    }

    const length = measuredLengthM(row);
    const width = Number(row.width);
    const thickness = Number(row.thickness);
    if (!(width > 0) || !(thickness > 0)) flags.push("No width / thickness");

    let expectedVolumeCum: number | null = null;
    let quantityDifferenceCum: number | null = null;
    const quantity = row.quantity == null || String(row.quantity).trim() === "" ? Number.NaN : Number(row.quantity);
    if (length != null && width > 0 && thickness > 0) {
      expectedVolumeCum = length * width * thickness;
      if (Number.isFinite(quantity)) {
        quantityDifferenceCum = quantity - expectedVolumeCum;
        if (expectedVolumeCum > 0 && Math.abs(quantityDifferenceCum) / expectedVolumeCum > 0.05) {
          const difference = Number(quantityDifferenceCum.toFixed(3));
          const sign = difference > 0 ? "+" : "";
          flags.push(`Quantity ≠ length × width × thickness by ${sign}${difference} cum`);
        }
      }
    }
    if (range && options.roadLengthKm != null
        && (range[0] < 0 || range[1] > options.roadLengthKm)) flags.push("Outside corridor");

    if (range) placed.push({ row, range, layer: proposedLayer });
    return { ...row, counted: true, proposedLayer, expectedVolumeCum, quantityDifferenceCum, flags };
  });
}

export type DprLayerSummarySpan = {
  fromKm: number;
  toKm: number;
  side: string;
  layers: number[];
  cumulativeThicknessMm: number;
};

export type DprLayerSummary = {
  reachId: number | null;
  reachLabel: string;
  layerLengthsM: Record<number, number>;
  spans: DprLayerSummarySpan[];
};

function reachAppliesToItem(reach: DprLayerReach, itemId: number): boolean {
  if (reach.applicability !== "items" || !reach.itemIds) return true;
  try {
    return (JSON.parse(reach.itemIds) as unknown[]).map(Number).includes(Number(itemId));
  } catch {
    return false;
  }
}

function rowSideWithinReach(rowSide: string | null, reachSide: string | null): boolean {
  return !reachSide || dprLayerSidesOverlap(rowSide, reachSide);
}

export function summarizeDprLayerAssignments(
  rows: readonly DprLayerAssignmentRow[],
  reaches: readonly DprLayerReach[],
  options: Pick<DprLayerAssignmentOptions, "itemIds" | "compactedThicknessMm" | "roadLengthKm">,
): DprLayerSummary[] {
  const selected = new Set(options.itemIds.map(Number));
  const work = rows.filter((row) => row.counted && row.proposedLayer != null && selected.has(Number(row.boqItemId)));
  const effectiveReaches: DprLayerReach[] = reaches.length
    ? [...reaches]
    : [{
        id: 0,
        label: "Project corridor",
        chainageFrom: 0,
        chainageTo: Math.max(0, Number(options.roadLengthKm) || 0),
        side: null,
      }];
  const summaries: DprLayerSummary[] = [];

  for (const reach of effectiveReaches) {
    const intervals = work.flatMap((row) => {
      const range = rowRange(row);
      if (!range || !reachAppliesToItem(reach, row.boqItemId) || !rowSideWithinReach(row.side, reach.side)) return [];
      const fromKm = Math.max(range[0], Number(reach.chainageFrom));
      const toKm = Math.min(range[1], Number(reach.chainageTo));
      return fromKm < toKm ? [{ row, fromKm, toKm, side: sideKey(row.side) || "unspecified" }] : [];
    });
    if (!intervals.length) continue;

    const groups = new Map<string, typeof intervals>();
    for (const interval of intervals) groups.set(interval.side, [...(groups.get(interval.side) ?? []), interval]);
    const layerLengthsM: Record<number, number> = {};
    const spans: DprLayerSummarySpan[] = [];
    Array.from(groups.entries()).forEach(([side, sideIntervals]) => {
      const boundaries = Array.from(new Set(sideIntervals.flatMap((i) => [i.fromKm, i.toKm]))).sort((a, b) => a - b);
      for (let index = 0; index < boundaries.length - 1; index++) {
        const fromKm = boundaries[index];
        const toKm = boundaries[index + 1];
        if (toKm <= fromKm) continue;
        const mid = (fromKm + toKm) / 2;
        const activeLayers = Array.from(new Set(sideIntervals
          .filter((i) => i.fromKm <= mid && i.toKm > mid)
          .map((i) => Number(i.row.proposedLayer))))
          .filter((layer) => Number.isSafeInteger(layer) && layer > 0)
          .sort((a, b) => a - b);
        if (!activeLayers.length) continue;
        const lengthM = (toKm - fromKm) * 1000;
        for (const layer of activeLayers) layerLengthsM[layer] = (layerLengthsM[layer] ?? 0) + lengthM;
        spans.push({
          fromKm,
          toKm,
          side,
          layers: activeLayers,
          cumulativeThicknessMm: Math.max(...activeLayers) * Number(options.compactedThicknessMm || 0),
        });
      }
    });
    for (const layer of Object.keys(layerLengthsM)) layerLengthsM[Number(layer)] = Math.round(layerLengthsM[Number(layer)] * 100) / 100;
    summaries.push({
      reachId: reach.id || null,
      reachLabel: reach.label || `Reach ${reach.id}`,
      layerLengthsM,
      spans,
    });
  }
  return summaries;
}
