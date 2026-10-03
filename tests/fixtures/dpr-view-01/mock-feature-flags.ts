export function useFeatureFlags() {
  return {
    rmcEnabled: true, companyName: "DPR409 isolated fixture", companyShortName: "DPR",
    appTagline: "Isolated browser evidence", logoFile: "fixture-logo.svg",
    licensedModules: [], moduleAllowed: () => true,
  };
}