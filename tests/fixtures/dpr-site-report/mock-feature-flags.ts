export function useFeatureFlags() {
  return {
    rmcEnabled: true,
    companyName: "DPR-01 browser fixture",
    companyShortName: "DPR",
    appTagline: "Isolated browser evidence",
    logoFile: "",
    licensedModules: [],
    moduleAllowed: () => true,
  };
}