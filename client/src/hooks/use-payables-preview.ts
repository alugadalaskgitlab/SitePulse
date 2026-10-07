import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { VendorPayablesPreview, VendorPayablesPreviewRequest } from "@shared/vendorPayablesPreview";

export async function requestPayablesPreview(input: VendorPayablesPreviewRequest, forExport = false): Promise<VendorPayablesPreview> {
  const params = new URLSearchParams({ vendorName: input.vendorName, periodFrom: input.periodFrom, periodTo: input.periodTo });
  if (forExport) params.set("export", "1");
  if (input.siteId) params.set("siteId", String(input.siteId));
  if (input.gstRates) params.set("gstRates", JSON.stringify(input.gstRates));
  const response = await apiRequest("GET", `/api/vendor-bills/payables-preview?${params}`);
  return response.json();
}
export function usePayablesPreview(input: VendorPayablesPreviewRequest | null) {
  return useQuery<VendorPayablesPreview>({
    queryKey: ["/api/vendor-bills/payables-preview", input],
    queryFn: () => requestPayablesPreview(input!), enabled: !!input, retry: false, staleTime: 0,
    refetchOnWindowFocus: false,
  });
}