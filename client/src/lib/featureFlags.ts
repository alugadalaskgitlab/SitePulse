import { useQuery } from "@tanstack/react-query";

interface AppConfig {
  rmcEnabled: boolean;
  companyName: string;
  companyShortName: string;
  appTagline: string;
  logoFile: string;
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
    companyShortName: data?.companyShortName ?? "HLC",
    appTagline: data?.appTagline ?? "Live Ops. Not Just Logs.",
    logoFile: data?.logoFile ?? "hlc-logo.jpg",
  };
}
