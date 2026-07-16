import { useQuery } from "@tanstack/react-query";

interface AppConfig {
  rmcEnabled: boolean;
  companyName: string;
  companyShortName: string;
  appTagline: string;
  logoFile: string;
  // Deployment-wide licensed modules list.
  // Empty = all modules visible (default, Roads Only effectively shows everything
  // the user has permission for — HMP/RMC just aren't visible since no plant exists).
  // ["hmp"] = HMP licensed. ["hmp","rmc"] = both licensed.
  licensedModules: string[];
}

export function useFeatureFlags() {
  const { data } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const licensedModules: string[] = data?.licensedModules ?? [];
  return {
    rmcEnabled: data?.rmcEnabled ?? false,
    companyName: data?.companyName ?? "High Lane Constructions Pvt Ltd",
    companyShortName: data?.companyShortName ?? "HLC",
    appTagline: data?.appTagline ?? "Live Ops. Not Just Logs.",
    logoFile: data?.logoFile ?? "hlc-logo.jpg",
    licensedModules,
    // Helper: returns true if the module is licensed (or if no restriction is set,
    // meaning this is an unrestricted deployment — HLC's own).
    moduleAllowed: (key: string) => licensedModules.length === 0 || licensedModules.includes(key),
  };
}
