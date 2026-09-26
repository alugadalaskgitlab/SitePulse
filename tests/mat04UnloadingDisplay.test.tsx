import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { summarizeReceived, unloadingLabel } from "../client/src/lib/materialUnloadingSummary";
import { emptyDensitySkips } from "../shared/siteMaterialStockWarnings";

vi.mock("wouter", () => ({
  useSearch: () => "",
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
import SiteMaterialStock from "../client/src/pages/SiteMaterialStock";

describe("MAT-04 unloading display", () => {
  it("shows the API's existing stretch/yard fields beside Delivered without changing any stock totals or density warnings", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const skips = emptyDensitySkips();
    skips.delivered = { count: 1, quantities: { CUM: 10 } };
    client.setQueryData(["/api/site-material-stock", "", ""], [{
      site: "Test site", material: "GSB", matched: true, uom: "MT",
      ordered: 40, delivered: 25, deliveredAtStretch: 5, deliveredAtYard: 20,
      consumed: 12, toSupply: 15, lying: 13, lastDeliveryDate: null, densitySkips: skips,
    }]);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><SiteMaterialStock /></QueryClientProvider>);
    expect(html).toContain("Of Delivered (MT): Stretch 5.00 · Yard 20.00");
    expect(html).toContain("25.00");
    expect(html).toContain("40.00");
    expect(html).toContain("12.00");
    expect(html).toContain("13.00");
    expect(html).toContain("MT totals incomplete");
  });

  it("groups only like native units and labels trip null as unset, not stretch; non-trips are not trips", () => {
    const summaries = summarizeReceived([
      { material: "GSB", quantity: 10, uom: "CFT", source: "trip", unloadedAt: "stretch" },
      { material: "GSB", quantity: 20, uom: "cft", source: "trip", unloadedAt: "yard" },
      { material: "GSB", quantity: 5, uom: "CFT", source: "trip", unloadedAt: null },
      { material: "GSB", quantity: 3, uom: "CFT", source: "dpr", unloadedAt: "stretch" },
      { material: "GSB", quantity: 2, uom: "MT", source: "trip", unloadedAt: "yard" },
    ]);
    expect(summaries).toEqual([
      { material: "GSB", uom: "CFT", count: 4, totalQty: 38, stretch: 10, yard: 20, unset: 5, other: 3 },
      { material: "GSB", uom: "MT", count: 1, totalQty: 2, stretch: 0, yard: 2, unset: 0, other: 0 },
    ]);
    expect(unloadingLabel({ source: "trip", unloadedAt: null })).toBe("Not recorded");
    expect(unloadingLabel({ source: "dpr", unloadedAt: "stretch" })).toBe("Not applicable");
  });
});