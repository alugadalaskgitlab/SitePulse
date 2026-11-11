import { afterEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { isDprDerivedQueryKey, refreshDprDerivedQueries } from "./dprQueryInvalidation";

let client: QueryClient;
afterEach(() => client?.clear());

describe("DPR-derived query invalidation", () => {
  it.each([
    [["/api/dprs"]],
    [["/api/dprs/with-details", { dateFrom: "2026-09-01" }]],
    [["/api/dprs", 402]],
    [["/api/dprs/402/corrections"]],
    [["/api/dpr-sections/402"]],
    [["/api/reports/progress?projectId=2&site=ALLADURG"]],
    [["/api/boq/projects", 2, "plan-vs-actual", { dateFrom: "2026-08-15" }]],
    [["/api/site-material-stock", "2026-08-15", "2026-11-01"]],
    [["/api/plant-module/stock-balances"]],
    [["/api/plant-module/stock-ledger", "all"]],
  ])("includes affected query %j", (key) => {
    expect(isDprDerivedQueryKey(key)).toBe(true);
  });

  it.each([
    [["/api/sites"]],
    [["/api/plant-module/materials"]],
    [["/api/reports/equipment"]],
  ])("does not invalidate unrelated query %j", (key) => {
    expect(isDprDerivedQueryKey(key)).toBe(false);
  });

  it("refetches cached DPR, report, plan and stock views after a mutation", async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const counts = { dpr: 0, progress: 0, plan: 0, siteStock: 0, plantStock: 0, unrelated: 0 };
    const cases = [
      { key: ["/api/dprs/with-details"], name: "dpr" as const },
      { key: ["/api/reports/progress?projectId=2"], name: "progress" as const },
      { key: ["/api/boq/projects", 2, "plan-vs-actual"], name: "plan" as const },
      { key: ["/api/site-material-stock"], name: "siteStock" as const },
      { key: ["/api/plant-module/stock-balances"], name: "plantStock" as const },
      { key: ["/api/sites"], name: "unrelated" as const },
    ];
    await Promise.all(cases.map(({ key, name }) => client.fetchQuery({
      queryKey: key,
      queryFn: async () => ++counts[name],
    })));
    await refreshDprDerivedQueries(client);
    expect(counts).toEqual({ dpr: 2, progress: 2, plan: 2, siteStock: 2, plantStock: 2, unrelated: 1 });
  });
});
