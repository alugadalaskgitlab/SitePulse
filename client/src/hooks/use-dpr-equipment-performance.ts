import { useQuery } from "@tanstack/react-query";
import { fetchDprEquipmentPerformance, isLiveDprPerformanceContext, type DprPerformanceContext } from "@/lib/dprEquipmentEfficiency";

export function useDprEquipmentPerformance(
  dpr: (DprPerformanceContext & { equipment?: unknown[] }) | null | undefined,
  canView: boolean,
  userId?: number,
  hasCompleteContext = false,
) {
  return useQuery({
    queryKey: ["/api/reports/equipment-performance", "dpr-actual", dpr?.date, userId, canView, hasCompleteContext],
    queryFn: ({ signal }) => fetchDprEquipmentPerformance(dpr!.date, signal),
    enabled: canView && hasCompleteContext && isLiveDprPerformanceContext(dpr) && (dpr?.equipment?.length ?? 0) > 0,
    // A regrant must revalidate even if the previous complete-access result is
    // still fresh under the application's five-minute default cache policy.
    staleTime: 0,
    retry: false,
  });
}