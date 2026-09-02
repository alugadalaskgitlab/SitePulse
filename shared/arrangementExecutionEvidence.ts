/**
 * Read-only execution evidence for an arrangement reach.  This deliberately
 * consumes current source rows; it has no persistence or billing semantics.
 */
import { overlapSegment } from "./chainageOverlap";
import { isDprSideCompatible } from "./barSide";
import { normalizeDprSideKey } from "./dprProgrammeLink";
import { boqProgressQty } from "./dprGeometry";
import { convertSolidQty, normalizeUom } from "./uomConvert";

export const DPR_INCOMPLETE_WARNING = "DPR quantity incomplete / requires review";
export const PARTIALLY_LINKED_WARNING = "Partially linked historical data";

export type EvidenceBar = {
  id: number; boqProjectId: number; boqItemId: number; chainageFrom?: number | null;
  chainageTo?: number | null; side?: string | null;
  allocatedQty?: number | null; unit?: string | null;
};
export type EvidenceArrangement = {
  id: number; boqProjectId: number; agencyName?: string | null; uom?: string | null;
};
export type EvidenceProgress = {
  id: number; boqProjectId: number; boqItemId?: number | null;
  programmeBarId?: number | null; earthworkArrangementId?: number | null;
  quantity?: number | null; dprConversionFactor?: number | null;
  chainageFromKm?: number | null; chainageToKm?: number | null; side?: string | null;
  layerNo?: number | null; isValid?: boolean | null;
};
export type EvidenceTrip = {
  id: number; boqProjectId?: number | null; boqItemId?: number | null;
  programmeBarId?: number | null; earthworkArrangementId?: number | null;
  supplier?: string | null; quantity: number; uom: string; isCancelled?: boolean | null;
  isDeleted?: boolean | null;
};
export type ArrangementBarEvidence = {
  programmeBarId: number; allocatedQty: number | null; allocationUom: string | null;
  dprExecutedQty: number; dprEvidenceAvailable: boolean; tripCount: number; tripOriginal: Array<{ uom: string; quantity: number }>;
  tripConvertedCum: number | null; varianceCum: number | null; balanceVsAllocation: number | null;
  warnings: string[];
};

const n = (x: unknown): number | null =>
  x != null && String(x).trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null;
const sameName = (a?: string | null, b?: string | null) =>
  !!a?.trim() && !!b?.trim() && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** Pure seam usable by the arrangement screen and a later Vendor Bill review. */
export function calculateArrangementExecutionEvidence(
  arrangement: EvidenceArrangement, bars: EvidenceBar[], progress: EvidenceProgress[], trips: EvidenceTrip[],
): ArrangementBarEvidence[] {
  const barsById = new Map(bars.map(bar => [bar.id, bar]));
  const out = new Map<number, ArrangementBarEvidence>(bars.map(bar => [bar.id, {
    programmeBarId: bar.id, allocatedQty: n(bar.allocatedQty), allocationUom: arrangement.uom ?? null,
    dprExecutedQty: 0, dprEvidenceAvailable: false, tripCount: 0, tripOriginal: [], tripConvertedCum: null,
    varianceCum: null, balanceVsAllocation: null, warnings: [] as string[],
  }]));
  const addWarning = (barId: number, warning: string) => {
    const row = out.get(barId); if (row && !row.warnings.includes(warning)) row.warnings.push(warning);
  };
  for (const entry of progress) {
    if (entry.isValid === false || entry.boqProjectId !== arrangement.boqProjectId || !entry.boqItemId) continue;
    const qty = n(entry.quantity);
    if (qty == null || qty <= 0) continue;
    // An explicit arrangement ID is authoritative: never let a row for another
    // arrangement fall through into a loose reach match.
    if (entry.earthworkArrangementId != null && entry.earthworkArrangementId !== arrangement.id) continue;
    const direct = entry.programmeBarId != null ? barsById.get(entry.programmeBarId) : undefined;
    if (direct) {
      if (direct.boqItemId === entry.boqItemId) {
        const row = out.get(direct.id)!;
        row.dprExecutedQty += boqProgressQty(qty, { dprConversionFactor: entry.dprConversionFactor })!;
        row.dprEvidenceAvailable = true;
      }
      continue;
    }
    const sameItemBars = bars.filter(bar => {
      if (bar.boqItemId !== entry.boqItemId) return false;
      return true;
    });
    const dprSide = normalizeDprSideKey(entry.side);
    // A programme bar has no layer/lift identity in the schema. A fallback
    // row that declares a layer consequently cannot be assigned honestly;
    // only its exact programme-bar ID can establish that association.
    const candidates = entry.layerNo != null ? [] : sameItemBars.filter(bar =>
      !!dprSide &&
      isDprSideCompatible(bar.side ?? null, dprSide),
    );
    const from = n(entry.chainageFromKm), to = n(entry.chainageToKm);
    if (from == null || to == null || candidates.length === 0) {
      sameItemBars.forEach(bar => addWarning(bar.id, DPR_INCOMPLETE_WARNING));
      continue;
    }
    const length = Math.abs(to - from);
    const overlaps = candidates.map(bar => {
      const barFrom = n(bar.chainageFrom), barTo = n(bar.chainageTo);
      return { bar, segment: barFrom == null || barTo == null ? null : overlapSegment(from, to, barFrom, barTo) };
    })
      .filter((x): x is { bar: EvidenceBar; segment: { from: number; to: number } } => !!x.segment);
    if (!overlaps.length || length <= 0) { candidates.forEach(bar => addWarning(bar.id, DPR_INCOMPLETE_WARNING)); continue; }
    const ordered = [...overlaps].sort((a, b) => a.segment.from - b.segment.from);
    if (ordered.some((entry, index) => index > 0 && entry.segment.from < ordered[index - 1].segment.to - 1e-6)) {
      candidates.forEach(bar => addWarning(bar.id, DPR_INCOMPLETE_WARNING));
      continue; // overlapping bars cannot be split reliably without an allocation rule
    }
    const covered = overlaps.reduce((sum, x) => sum + (x.segment.to - x.segment.from), 0);
    const credited = boqProgressQty(qty, { dprConversionFactor: entry.dprConversionFactor })!;
    // Split only by the physical intersecting reach. This prevents a full DPR
    // quantity being duplicated onto every overlapping bar.
    for (const { bar, segment } of overlaps) {
      const row = out.get(bar.id)!;
      row.dprExecutedQty += credited * ((segment.to - segment.from) / length);
      row.dprEvidenceAvailable = true;
    }
    if (covered < length - 1e-6) overlaps.forEach(({ bar }) => addWarning(bar.id, DPR_INCOMPLETE_WARNING));
  }
  const seenTripIds = new Set<number>();
  const unconvertibleTripBars = new Set<number>();
  for (const trip of trips) {
    if (seenTripIds.has(trip.id)) continue;
    seenTripIds.add(trip.id);
    if (trip.isCancelled || trip.isDeleted || trip.boqProjectId !== arrangement.boqProjectId) continue;
    let bar: EvidenceBar | undefined;
    if (trip.earthworkArrangementId != null) {
      if (trip.earthworkArrangementId !== arrangement.id) continue;
      bar = trip.programmeBarId != null ? barsById.get(trip.programmeBarId) : undefined;
    } else if (trip.boqItemId != null && trip.programmeBarId != null) {
      bar = barsById.get(trip.programmeBarId);
      if (!bar || bar.boqItemId !== trip.boqItemId) continue;
    } else {
      // Names/material text are intentionally never authoritative linkage.
      if (trip.boqItemId != null && sameName(trip.supplier, arrangement.agencyName)) {
        bars.filter(b => b.boqItemId === trip.boqItemId).forEach(b => addWarning(b.id, PARTIALLY_LINKED_WARNING));
      }
      continue;
    }
    if (!bar || trip.boqItemId != null && trip.boqItemId !== bar.boqItemId || !sameName(trip.supplier, arrangement.agencyName)) {
      if (bar) addWarning(bar.id, PARTIALLY_LINKED_WARNING);
      continue;
    }
    const row = out.get(bar.id)!;
    row.tripCount++;
    const unit = trip.uom?.trim() || "";
    const existing = row.tripOriginal.find(x => normalizeUom(x.uom) === normalizeUom(unit));
    if (existing) existing.quantity += Number(trip.quantity) || 0; else row.tripOriginal.push({ uom: unit, quantity: Number(trip.quantity) || 0 });
    const cum = convertSolidQty(Number(trip.quantity) || 0, unit, "CUM");
    if (cum == null) { unconvertibleTripBars.add(bar.id); addWarning(bar.id, PARTIALLY_LINKED_WARNING); }
    else if (!unconvertibleTripBars.has(bar.id)) row.tripConvertedCum = (row.tripConvertedCum ?? 0) + cum;
  }
  return bars.map(bar => {
    const row = out.get(bar.id)!;
    row.dprExecutedQty = Number(row.dprExecutedQty.toFixed(6));
    if (unconvertibleTripBars.has(bar.id)) row.tripConvertedCum = null;
    else row.tripConvertedCum = row.tripConvertedCum == null ? null : Number(row.tripConvertedCum.toFixed(6));
    row.varianceCum = !row.dprEvidenceAvailable || row.tripConvertedCum == null
      ? null : Number((row.dprExecutedQty - row.tripConvertedCum).toFixed(6));
    row.balanceVsAllocation = row.warnings.includes(DPR_INCOMPLETE_WARNING) || row.allocatedQty == null
      ? null : Number((row.allocatedQty - row.dprExecutedQty).toFixed(6));
    return row;
  });
}