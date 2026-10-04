import { useQuery } from "@tanstack/react-query";
import type { ReceivedEntry } from "@/lib/materialUnloadingSummary";

export type DprMaterialReceipt = ReceivedEntry & {
  id: number; time?: string | null; supplier?: string | null; vehicleNumber?: string | null;
  materialSourceSupplier?: string | null; receiptNumber?: string | null; yardLabel?: string | null;
  boqQuantity?: { quantity: number; uom: string } | null;
};
export function useDprMaterialReceipts(site: string, date: string) {
  const params = new URLSearchParams({ site: site?.trim() || "", dateFrom: date?.trim() || "", dateTo: date?.trim() || "" });
  return useQuery<DprMaterialReceipt[]>({
    queryKey: [`/api/materials-received?${params.toString()}`],
    enabled: !!site?.trim() && !!date?.trim(),
  });
}