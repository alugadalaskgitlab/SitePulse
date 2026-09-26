import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SiteMaterialStock from "../../../client/src/pages/SiteMaterialStock";
import { emptyDensitySkips } from "../../../shared/siteMaterialStockWarnings";
import "../../../client/src/index.css";

const skips = emptyDensitySkips();
skips.delivered = { count: 2, quantities: { CUM: 28 } };
skips.ordered = { count: 1, quantities: { CFT: 800 } };
skips.consumed = { count: 1, quantities: { CUM: 6 } };
const base = { site: "SYNTHETIC DEMO SITE", matched: true, uom: "MT", ordered: 0, delivered: 0, consumed: 0, toSupply: 0, lying: 0, lastDeliveryDate: null };
const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
client.setQueryData(["/api/site-material-stock", "", ""], [
  { ...base, material: "Synthetic missing-density material", densitySkips: skips },
  { ...base, material: "Synthetic configured-density material", ordered: 40, delivered: 25, consumed: 12, toSupply: 15, lying: 13, densitySkips: emptyDensitySkips() },
  { ...base, material: "Synthetic unmatched material", matched: false, densitySkips: { ...emptyDensitySkips(), delivered: { count: 2, quantities: { CUM: 28 } } } },
]);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <div className="bg-amber-100 p-4 font-bold">SYNTHETIC TEST DATA — production SiteMaterialStock component. Not live stock; no database writes.</div>
    <SiteMaterialStock />
  </QueryClientProvider>,
);