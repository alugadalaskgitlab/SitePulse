import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import DprDetails from "../../../client/src/pages/DprDetails";
import SiteReport from "../../../client/src/pages/SiteReport";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

// Browser-local synthetic responses only. No request from this fixture can
// reach an application API; unexpected API calls fail visibly instead.
const site = "DPR17 TEST SITE";
const date = "2026-09-15";
const reports = {
  1701: {
    id: 1701, site, date, engineer: "Fixture Engineer", workType: "road",
    dprStatus: "submitted", submittedAt: "2026-09-15T18:00:00Z",
    progress: [], equipment: [], labour: [], materials: [], sitePurchases: [],
    structureItems: [], boqProjectId: null, remarks: "",
  },
  1702: {
    id: 1702, site, date: "2026-09-16", engineer: "Fixture Engineer",
    workType: "road", dprStatus: "submitted", progress: [], equipment: [],
    labour: [], materials: [], sitePurchases: [], structureItems: [],
    boqProjectId: null, remarks: "",
  },
};

const received = [
  { id: 101, source: "trip", material: "Aggregate", quantity: 5, uom: "MT",
    boqQuantity: { quantity: 3.125, uom: "CUM" }, unloadedAt: "stretch",
    time: "09:15", supplier: "Test Transport", vehicleNumber: "TEST-101",
    materialSourceSupplier: "Test Quarry", receiptNumber: "R-101" },
  { id: 102, source: "trip", material: "Aggregate", quantity: 7, uom: "MT",
    boqQuantity: { quantity: 4.375, uom: "CUM" }, unloadedAt: "yard",
    yardLabel: "Test Yard", time: "10:30", supplier: "Test Transport",
    vehicleNumber: "TEST-102", materialSourceSupplier: "Test Quarry",
    receiptNumber: "R-102" },
  { id: 103, source: "trip", material: "Sand", quantity: 2, uom: "MT",
    boqQuantity: { quantity: 1.2, uom: "CUM" }, unloadedAt: null,
    supplier: "Another Carrier", receiptNumber: "R-103" },
  { id: 104, source: "trip", material: "Sand", quantity: 3, uom: "MT",
    boqQuantity: null, unloadedAt: "stretch", receiptNumber: "R-104" },
  { id: 105, source: "dpr", material: "Cement", quantity: 4, uom: "BAG",
    boqQuantity: null, receiptNumber: "DPR-105" },
];

type RequestLog = { method: string; path: string };
declare global {
  interface Window {
    __dpr17Fixture: { requests: RequestLog[]; blocked: RequestLog[] };
  }
}
window.__dpr17Fixture = { requests: [], blocked: [] };

const nativeFetch = window.fetch.bind(window);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
window.fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const url = new URL(request?.url ?? String(input), window.location.origin);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const log = { method, path: url.pathname + url.search };
  window.__dpr17Fixture.requests.push(log);
  if (method !== "GET") {
    window.__dpr17Fixture.blocked.push(log);
    return json({ error: "Fixture blocks all API writes" }, 405);
  }
  if (url.pathname === "/api/materials-received") {
    return json(url.searchParams.get("site") === site
      && url.searchParams.get("dateFrom") === date
      && url.searchParams.get("dateTo") === date ? received : []);
  }
  if (url.pathname === "/api/sites") return json([{ id: 17, name: site }]);
  if (url.pathname === "/api/personnel") return json([]);
  if (url.pathname === "/api/edit-requests/check") return json({ hasPermission: false, request: null });
  if (url.pathname === "/api/edit-requests/mine") return json([]);
  if (url.pathname === "/api/plant-module/equipment") return json([]);
  if (url.pathname === "/api/attachments") return json([]);
  if (url.pathname === "/api/boq/projects") return json([]);
  if (/^\/api\/dprs\/\d+$/.test(url.pathname)) {
    const report = reports[Number(url.pathname.split("/").at(-1)) as keyof typeof reports];
    return report ? json(report) : json({ error: "Unknown fixture DPR" }, 404);
  }
  window.__dpr17Fixture.blocked.push(log);
  return json({ error: `Unexpected fixture API: ${log.path}` }, 500);
};

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <p data-testid="dpr17-fixture-label" className="mb-4 text-sm font-semibold">
          DPR17 isolated synthetic API · real {window.location.pathname.startsWith("/site/report/") ? "SiteReport" : "DprDetails"} page
        </p>
        {window.location.pathname.startsWith("/site/report/")
          ? <SiteReport />
          : <DprDetails />}
      </div>
    </main>
  </QueryClientProvider>,
);