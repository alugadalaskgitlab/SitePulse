import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProgressReport from "../../../client/src/pages/ProgressReport";
import { computeItemEntries, progressReportEntryMatchesSite, type ReportBoqItem, type ReportEntry } from "@shared/progressReport";
import "../../../client/src/index.css";

const boqItem: ReportBoqItem & { itemName: string } = {
  id: 701,
  itemCode: "PR01-DBM",
  itemName: "Dense Bituminous Macadam",
  description: "Dense Bituminous Macadam",
  unit: "Cum",
  boqQty: 500,
  dprMeasurementMethod: "CUM_LWT",
};

const rawEntries: ReportEntry[] = [
  { kind: "progress", entryId: 11, dprId: 1011, dprDate: "2026-09-03", site: "Site Alpha – Edited by Admin – 2026-09-16 05:43:09", engineer: "A. Engineer", boqItemId: 701, chainageFrom: "3+000", chainageTo: "3+100", chainageFromKm: 3, chainageToKm: 3.1, side: "LHS", length: 100, width: 7, thickness: .05, quantity: 35, uom: "Cum", remarks: "Alpha later chainage" },
  { kind: "progress", entryId: 12, dprId: 1012, dprDate: "2026-09-01", site: "Site Alpha - Copy by Engineer - 2026-09-17 06:00:00", engineer: "A. Engineer", boqItemId: 701, chainageFrom: "1+000", chainageTo: "1+100", chainageFromKm: 1, chainageToKm: 1.1, side: "LHS", length: 100, width: 7, thickness: .05, quantity: 35, uom: "Cum", remarks: "Alpha earlier chainage" },
  { kind: "progress", entryId: 21, dprId: 1021, dprDate: "2026-09-02", site: "Site Beta", engineer: "B. Engineer", boqItemId: 701, chainageFrom: "2+000", chainageTo: "2+100", chainageFromKm: 2, chainageToKm: 2.1, side: "RHS", length: 100, width: 7, thickness: .05, quantity: 35, uom: "Cum", remarks: "Beta earlier chainage" },
  { kind: "progress", entryId: 22, dprId: 1022, dprDate: "2026-09-04", site: "Site Beta – Edited by Manager – 2026-09-18 07:00:00", engineer: "B. Engineer", boqItemId: 701, chainageFrom: "4+000", chainageTo: "4+100", chainageFromKm: 4, chainageToKm: 4.1, side: "RHS", length: 100, width: 7, thickness: .05, quantity: 35, uom: "Cum", remarks: "Beta later chainage" },
];

const computed = computeItemEntries(rawEntries, boqItem);
const cleanSites = ["Site Alpha", "Site Beta"];

function report(site: string | null) {
  const entries = site ? computed.filter(entry => progressReportEntryMatchesSite(entry, site)) : computed;
  return {
    project: { id: 7001, name: "PR-01 Synthetic Two-Site Road", startDate: "2026-09-01" },
    defaultFromDate: "2026-09-01",
    sites: cleanSites,
    items: [{ boqItem, entries }],
  };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url, window.location.origin);
  if (url.pathname === "/api/boq/projects") return Response.json([{ id: 7001, name: "PR-01 Synthetic Two-Site Road" }]);
  if (url.pathname === "/api/reports/progress") return Response.json(report(url.searchParams.get("site")));
  if (url.pathname.startsWith("/api/")) return Response.json([]);
  return originalFetch(input, init);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Infinity,
      queryFn: async ({ queryKey }) => {
        const response = await fetch(String(queryKey[0]));
        if (!response.ok) throw new Error(`Fixture request failed: ${response.status}`);
        return response.json();
      },
    },
  },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mb-3 rounded border-2 border-fuchsia-500 bg-fuchsia-50 px-4 py-2 text-sm font-bold text-fuchsia-900" data-testid="fixture-label">
        PR-01 SYNTHETIC ACCEPTANCE FIXTURE — 2 SITES / MULTIPLY-EDITED SITE ALPHA — NO LIVE WRITES
      </div>
      <ProgressReport />
    </div>
  </QueryClientProvider>,
);