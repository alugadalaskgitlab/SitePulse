import type { EquipmentHireFinancials, HireGroupCalculationResult } from "./hireBilling";
import type { GstCategory } from "./vendor-bill-gst";

export const PAYABLES_PREVIEW_LABEL = "Preview — not a saved bill" as const;
export const PAYABLES_CATEGORIES: GstCategory[] = ["equipment", "material", "transport", "labour", "other"];
export type PreviewGstRates = Record<GstCategory, number | null>;
export interface VendorPayablesPreviewRequest {
  vendorName: string; periodFrom: string; periodTo: string; siteId?: number | null;
  gstRates?: Partial<PreviewGstRates>;
}
export interface PayablesTotals {
  preTax: number | null; gst: number | null; withGst: number | null;
}
export interface PayablesItem {
  date: string; category: GstCategory; description: string; qty: number; unit: string;
  rate: number | null; amount: number | null; source: string;
  sourceType?: string | null; sourceId?: number | string | null;
  equipmentId: number | null; leadDistance?: number | null; siteName: string | null;
  unallocatedReason?: string; warning?: string;
}
export interface PayablesHireGroup {
  id: string; equipmentId: number; equipmentName: string; periodFrom: string; periodTo: string;
  basis: string; rate: number; siteName: string | null; unallocatedReason?: string;
  dieselResponsibility: string | null; consumptionNorm: number | null; meterType: string | null;
  result: HireGroupCalculationResult;
  financials?: EquipmentHireFinancials;
}
export interface VendorPayablesPreview {
  label: typeof PAYABLES_PREVIEW_LABEL; generatedAt: string;
  vendorName: string; periodFrom: string; periodTo: string; siteId: number | null; siteName: string | null;
  gstRates: PreviewGstRates; gstSources: Record<GstCategory, "from last bill — check" | "entered" | "missing">;
  categories: Array<{ category: GstCategory; items: PayablesItem[]; totals: PayablesTotals }>;
  hireGroups: PayablesHireGroup[]; excludedCount: number; unpricedCount: number;
  grandTotal: PayablesTotals; siteTotal: PayablesTotals; unallocatedTotal: PayablesTotals;
  warnings: string[];
}