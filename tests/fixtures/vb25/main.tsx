import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TooltipProvider } from "@/components/ui/tooltip";
import VendorBills from "@/pages/VendorBills";
import "@/index.css";

const sites = [
  { id: 251, name: "VB25 NORTH SITE", isActive: true },
  { id: 252, name: "VB25 SOUTH SITE", isActive: true },
];
const vendors = ["VB25 REGULAR VENDOR", "VB25 LEGACY EXPLICIT", "VB25 BLANK UNIT", "VB25 UNSUPPORTED MT", "VB25 MATERIAL SOURCE"];
const money = (qty: number, rate: number) => qty * rate;
const item = (id: number, date: string, category: string, description: string, qty: number, unit: string, rate: number, siteName: string, sourceType = "site_material_trip") => ({
  id, date, category, description, qty, unit, rate, amount: money(qty, rate), source: `auto:${sourceType}:${id}`,
  sourceId: id, sourceType, siteName, vehicleNumber: `TS25-${String(id).padStart(4, "0")}`,
});
const northTrips = [
  item(25001, "2027-03-01", "material", "SOIL (SITE)", 600, "CFT", 0, "VB25 NORTH SITE"),
];
const southTrips = [
  item(25002, "2027-03-02", "material", "SOIL (SITE)", 600, "CFT", 0, "VB25 SOUTH SITE"),
  item(25003, "2027-03-03", "material", "SOIL (SITE)", 600, "CFT", 0, "VB25 SOUTH SITE"),
];
const tripHeavyItems = Array.from({ length: 105 }, (_, index) =>
  item(26000 + index, `2027-03-0${(index % 3) + 1}`, "material", `SOIL TRIP ${index + 1}`, 1, "TRIP", 800, index % 2 ? "VB25 NORTH SITE" : "VB25 SOUTH SITE"));
const combinedItems = [
  item(27001, "2027-03-01", "equipment", "EXCAVATOR HIRE", 1, "DAY", 5000, "VB25 NORTH SITE", "equipment_activity"),
  item(27002, "2027-03-01", "material", "SOIL", 1, "TRIP", 800, "VB25 NORTH SITE"),
  item(27003, "2027-03-02", "labour", "DPR MASON", 2, "HEAD-DAY", 900, "SITE: VB25 NORTH SITE", "site_labour"),
  item(27004, "2027-03-02", "labour", "SHIFT OPERATOR", 1, "HEAD-DAY", 1200, "PLANT: HOT MIX", "plant_shift_manpower"),
  item(27005, "2027-03-03", "labour", "MANUAL HELPER", 1, "HEAD-DAY", 700, "", "manual"),
];
const bill = (id: number, billNo: string, vendorName: string, billType: string, billItems: any[], siteId: number | null = null) => ({
  id, billNo, vendorName, billType, siteId, status: "draft", billDate: "2027-03-05",
  periodFrom: "2027-03-01", periodTo: "2027-03-05",
  totalAmount: billItems.reduce((sum, row) => sum + row.amount, 0),
  netPayableAmount: billItems.reduce((sum, row) => sum + row.amount, 0),
  amountPaid: 0, createdAt: "2027-03-05T08:00:00Z", items: billItems,
  hireStatements: [], additionalAdjustments: [],
});
const bills = [
  bill(2501, "VB25-TRIPS-105", "VB25 TRIP VENDOR", "material", tripHeavyItems),
  bill(2502, "VB25-COMBINED", "VB25 COMBINED VENDOR", "all", combinedItems, 251),
  bill(2503, "VB25-SOUTH-ONLY", "VB25 SOUTH VENDOR", "material", southTrips, 252),
];

const requests: Array<{ method: string; path: string; body?: unknown }> = [];
declare global { interface Window { __VB25Fixture?: { requests: typeof requests; isolation: string } } }
window.__VB25Fixture = { requests, isolation: "Synthetic fetch interception; no request reaches a live API and no writes are performed." };
(window as any).__VB22Fixture = { toastMessages: [] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.origin);
  const method = String(init?.method || (typeof input === "object" && "method" in input ? input.method : "GET") || "GET").toUpperCase();
  let body: unknown;
  try { body = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { body = init?.body; }
  requests.push({ method, path: `${url.pathname}${url.search}`, body });
  if (url.pathname === "/api/sites") return json(sites);
  if (url.pathname === "/api/vendor-bills" && method === "GET") return json(bills);
  if (url.pathname === "/api/vendor-bills/summary") return json({
    total: bills.length, totalAmount: bills.reduce((sum, row) => sum + row.totalAmount, 0),
    draft: bills.length, draftAmount: bills.reduce((sum, row) => sum + row.totalAmount, 0),
    verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0,
    gstByCategory: {}, totalGst: 0,
  });
  if (url.pathname === "/api/vendor-bills/vendor-names") return json([...vendors, ...bills.map(row => row.vendorName)]);
  if (url.pathname === "/api/vendor-bills/company-accounts") return json([]);
  if (url.pathname === "/api/vendor-aliases") return json([]);
  if (url.pathname === "/api/vendor-bills/discover-vendors") return json(vendors.map(vendorName => ({
    vendorName, recordCount: 3, categories: ["material"], existingBill: null,
  })));
  if (url.pathname === "/api/vendor-bills/auto-items") {
    const vendor = url.searchParams.get("vendorName") || "";
    const selectedSite = Number(url.searchParams.get("siteId"));
    const rows = vendor === "VB25 MATERIAL SOURCE"
      ? northTrips.map(row => ({ ...row, sourceType: "site_material_trip_material", source: `auto:site_material_trip_material:${row.id}` }))
      : [...northTrips, ...southTrips];
    return json(selectedSite ? rows.filter(row => row.siteName === sites.find(site => site.id === selectedSite)?.name) : rows);
  }
  if (url.pathname === "/api/vendor-rate-cards") {
    const vendorName = url.searchParams.get("vendorName");
    const card = vendorName === "VB25 REGULAR VENDOR"
      ? { itemKey: "MAT_SOIL_TRIP", unit: "TRIP" }
      : vendorName === "VB25 LEGACY EXPLICIT"
        ? { itemKey: "MAT_SOIL", unit: "TRIP" }
        : vendorName === "VB25 BLANK UNIT"
          ? { itemKey: "MAT_SOIL", unit: "" }
          : vendorName === "VB25 UNSUPPORTED MT"
            ? { itemKey: "MAT_SOIL_MT", unit: "MT" }
          : vendorName === "VB25 MATERIAL SOURCE"
            ? { itemKey: "MAT_SOIL_TRIP", unit: "TRIP" }
            : null;
    return json(card ? [{ id: 25001, vendorName, category: "material", itemLabel: "SOIL", rate: 800, ...card }] : []);
  }
  if (url.pathname === "/api/vendor-bills/check-duplicates") return json([]);
  if (url.pathname === "/api/vendor-bills/hire-activities") return json([]);
  if (url.pathname === "/api/vendor-rate-cards/discover") return json([]);
  if (url.pathname === "/api/equipment-master/canonical-types") return json([]);
  if (url.pathname === "/api/plant-materials") return json([{ name: "SOIL" }]);
  if (url.pathname === "/api/reports/equipment-performance") return json({ filterOptions: {}, totals: {}, reviewRows: [], events: [], fleet: [], projects: [] });
  const detail = url.pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (detail && method === "GET") return json(bills.find(row => row.id === Number(detail[1])) || {}, bills.some(row => row.id === Number(detail[1])) ? 200 : 404);
  if (url.pathname.startsWith("/api/attachments")) return json([]);
  if (url.pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div data-testid="vb25-disclosure" className="sticky top-0 z-[200] border-b-2 border-violet-700 bg-violet-50 px-4 py-2 text-center text-xs font-bold text-violet-950">
        VB-25 ISOLATED EVIDENCE — ACTUAL VENDORBILLS COMPONENT — SYNTHETIC INTERCEPTED API — NO LIVE READS OR WRITES
      </div>
      <VendorBills />
    </TooltipProvider>
  </QueryClientProvider>,
);