import { z } from "zod";
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
};
export function tripArrangementLabel(a: ArrangementOption) {
  return `#${a.id} · ${a.agencyName || "No agency"} · ${a.materialLabel} · ${a.reachLabel || "Whole reach"}${a.chainageFrom != null || a.chainageTo != null ? ` · Ch. ${a.chainageFrom ?? "?"}–${a.chainageTo ?? "?"}` : ""} · ${a.projectName}`;
}
export type TripArrangementPreview = {
  eligibleCount: number; overwriteCount: number; alreadyLinkedCount: number; previewToken: string;
};
