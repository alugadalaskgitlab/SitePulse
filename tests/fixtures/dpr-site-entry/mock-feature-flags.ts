export function useFeatureFlags() {
  return {
    rmcEnabled: true,
    companyName: "DPR Browser Fixture",
    companyShortName: "DPR",
    appTagline: "Isolated browser evidence",
    logoFile: "",
    licensedModules: [],
    moduleAllowed: () => true,
  };
}