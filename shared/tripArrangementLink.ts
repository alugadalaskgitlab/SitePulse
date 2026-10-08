import { z } from "zod";
import { APPLICABLE_ARRANGEMENT_STATUSES } from "./materialReceiptSummary";
import { arrangementStatusAsOf, isArrangementOperationalAsOf, isValidArrangementEffectiveDate, type ArrangementStatusAsOfInput } from "./arrangementStatusHistory";

/** Receipt linkage uses the receipt operational set, not planning allocation status. */
export function canLinkTripArrangement(arrangement: ArrangementStatusAsOfInput, tripDate: string | null | undefined) {
  return isValidArrangementEffectiveDate(tripDate)
    && isArrangementOperationalAsOf(arrangement, tripDate, APPLICABLE_ARRANGEMENT_STATUSES);
}
export function tripArrangementLinkError(arrangement: ArrangementStatusAsOfInput, tripDate: string | null | undefined) {
  return canLinkTripArrangement(arrangement, tripDate) ? null
    : `Arrangement is not commercially valid on ${tripDate ?? "the trip date"} (status: ${arrangementStatusAsOf(arrangement, tripDate)}). No new link was saved.`;
}
/** A cancelled arrangement can still be selectable for historical trips. */
export function hasValidTripLinkPeriod(arrangement: ArrangementStatusAsOfInput) {
  if (isArrangementOperationalAsOf(arrangement, undefined, APPLICABLE_ARRANGEMENT_STATUSES)) return true;
  if (!Array.isArray(arrangement.revisionHistory)) return false;
  return arrangement.revisionHistory.some(event => {
    if (event?.eventType !== "status_change" || !isValidArrangementEffectiveDate(event.effectiveFrom)) return false;
    const previousDay = new Date(`${event.effectiveFrom}T00:00:00Z`);
    previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    return canLinkTripArrangement(arrangement, event.effectiveFrom)
      || canLinkTripArrangement(arrangement, previousDay.toISOString().slice(0, 10));
  });
}
export const bulkTripArrangementSchema = z.object({
  site: z.string().trim().min(1),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  material: z.string().trim().min(1).optional(),
  vehicleNumber: z.string().trim().min(1).optional(),
  supplier: z.string().trim().min(1).optional(),
  onlyUnassigned: z.boolean().optional(),
  onlyWithoutArrangement: z.boolean().optional(),
  onlyUnlinked: z.boolean().default(true),
  roleFilter: z.literal("all"),
  earthworkArrangementId: z.number().int().positive(),
  previewToken: z.string().optional(),
}).strict().refine(x => !x.dateFrom || !x.dateTo || x.dateFrom <= x.dateTo, {message:"dateFrom must be on or before dateTo"});
export type BulkTripArrangementInput = z.infer<typeof bulkTripArrangementSchema>;
export type ArrangementOption = {
  id: number; agencyName: string | null; materialLabel: string;
  reachLabel: string | null; chainageFrom: number | null; chainageTo: number | null;
  projectName: string;
  status?: string;
  revisionHistory?: unknown;
};
export function tripArrangementLabel(a: ArrangementOption) {
  return `#${a.id} · ${a.agencyName || "No agency"} · ${a.materialLabel} · ${a.reachLabel || "Whole reach"}${a.chainageFrom != null || a.chainageTo != null ? ` · Ch. ${a.chainageFrom ?? "?"}–${a.chainageTo ?? "?"}` : ""} · ${a.projectName}${a.status ? ` · ${a.status}` : ""}`;
}
export type TripArrangementPreview = {
  eligibleCount: number; overwriteCount: number; alreadyLinkedCount: number; previewToken: string;
  excludedCount: number;
  exclusionMessage: string;
};
