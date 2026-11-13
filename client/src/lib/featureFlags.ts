import { useQuery } from "@tanstack/react-query";
import { DEFAULT_COMPANY_NAME, DEFAULT_PLANT_NAME, deriveCompanyShortName, formatCompanyText } from "@shared/companyIdentity";

interface AppConfig {
  rmcEnabled: boolean;
  companyName: string;
  companyShortName: string;
  appTagline: string;
  logoFile: string;
  companyAddress: string;
  companyGstin: string;
  companyPhone: string;
  defaultPlantName: string;
  ownCompanyPartyId: number | null;
  ownCompanyPartyName: string | null;
  // Deployment-wide licensed modules list.
  // Empty = all modules visible (default, Roads Only effectively shows everything
  // the user has permission for — HMP/RMC just aren't visible since no plant exists).
  // ["hmp"] = HMP licensed. ["hmp","rmc"] = both licensed.
  licensedModules: string[];
}

export function useFeatureFlags() {
  const { data } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const licensedModules: string[] = data?.licensedModules ?? [];
  const companyName = data?.companyName ?? DEFAULT_COMPANY_NAME;
  const companyShortName = data?.companyShortName ?? (data?.companyName ? deriveCompanyShortName(companyName) : DEFAULT_COMPANY_NAME);
  const companyAddress = data?.companyAddress ?? "";
  const companyGstin = data?.companyGstin ?? "";
  const companyPhone = data?.companyPhone ?? "";
  return {
    rmcEnabled: data?.rmcEnabled ?? false,
    companyName,
    companyShortName,
    appTagline: data?.appTagline ?? "Live Ops. Not Just Logs.",
    logoFile: data?.logoFile ?? "",
    defaultPlantName: data?.defaultPlantName ?? DEFAULT_PLANT_NAME,
    ownCompanyPartyId: data?.ownCompanyPartyId ?? null,
    ownCompanyPartyName: data?.ownCompanyPartyName ?? null,
    companyText: (text: string) => formatCompanyText(text, { companyName, companyShortName }),
    companyAddress,
    companyGstin,
    companyPhone,
    companyInfo: { name: companyName, address: companyAddress, gstin: companyGstin, phone: companyPhone },
    licensedModules,
    // Helper: returns true if the module is licensed (or if no restriction is set,
    // meaning this is an unrestricted deployment — HLC's own).
    moduleAllowed: (key: string) => licensedModules.length === 0 || licensedModules.includes(key),
  };
}
