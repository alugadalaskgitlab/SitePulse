import { useQuery } from "@tanstack/react-query";

interface AppConfig {
  rmcEnabled: boolean;
  companyName: string;
}

export function useFeatureFlags() {
  const { data } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return {
    rmcEnabled: data?.rmcEnabled ?? false,
    companyName: data?.companyName ?? "High Lane Constructions Pvt Ltd",
  };
}
