import type { QueryClient, QueryKey } from "@tanstack/react-query";

const DPR_DERIVED_ENDPOINTS = [
  "/api/dprs",
  "/api/dpr-sections",
  "/api/reports/progress",
  "/api/site-material-stock",
  "/api/site-stock",
  "/api/site-purchases",
  "/api/plant-module/stock-balances",
  "/api/plant-module/stock-ledger",
  "/api/plant-module/stock-ledger-all",
  "/api/stock-summary",
  "/api/dashboard",
  "/api/site-hub",
] as const;

export function isDprDerivedQueryKey(key: QueryKey): boolean {
  const endpoint = key[0];
  if (typeof endpoint !== "string") return false;
  if (DPR_DERIVED_ENDPOINTS.some((prefix) =>
    endpoint === prefix || endpoint.startsWith(`${prefix}/`) || endpoint.startsWith(`${prefix}?`)
  )) return true;
  return endpoint.startsWith("/api/boq/projects") &&
    (endpoint.includes("plan-vs-actual") || key.some((part) => part === "plan-vs-actual"));
}

/** Refresh DPR detail and every cached report/stock view derived from DPRs. */
export async function refreshDprDerivedQueries(client: QueryClient): Promise<void> {
  await client.invalidateQueries({
    predicate: (query) => isDprDerivedQueryKey(query.queryKey),
    refetchType: "all",
  });
}
