import { useQuery } from "@tanstack/react-query";

interface AppConfig {
  rmcEnabled: boolean;
}

export function useFeatureFlags(): AppConfig {
  const { data } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return { rmcEnabled: data?.rmcEnabled ?? false };
}
