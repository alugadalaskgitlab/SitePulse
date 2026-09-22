import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import SiteMaterialTrips from "../../../client/src/pages/SiteMaterialTrips";
import SiteMaterialsReceived from "../../../client/src/pages/SiteMaterialsReceived";
import VendorBills from "../../../client/src/pages/VendorBills";
import "../../../client/src/index.css";

const SOURCE = "VB22 BORROW OWNER";
const TRANSPORTER = "VB22 ROAD TRANSPORT";
const NO_RATE = "VB22 NO RATE SOURCE";
const LEGACY_TRANSPORTER = "VB22 LEGACY TRANSPORT";
const SITE = "VB22 TEST ROAD";
const DATE = "2027-02-14";

type AnyRow = Record<string, any>;
type RequestRecord = { method: string; path: string; body?: any };

const initialTrips: AnyRow[] = [
  { id: 2201, date: DATE, time: "08:10", site: SITE, material: "Soil", supplier: TRANSPORTER, materialSourceSupplier: SOURCE, vehicleNumber: "TS22AA2201", transportType: "agency_vendor", quantity: 600, uom: "CFT", location: "12+200", receiptNumber: "SRC-2201", boqProjectId: 220, boqItemId: 221, isCancelled: false },
  { id: 2202, date: DATE, time: "09:15", site: SITE, material: "Soil", supplier: TRANSPORTER, materialSourceSupplier: null, vehicleNumber: "TS22AA2202", transportType: "agency_vendor", quantity: 600, uom: "CFT", location: "12+400", receiptNumber: "OLD-2202", boqProjectId: 220, boqItemId: 221, isCancelled: false },
  { id: 2203, date: DATE, time: "10:20", site: SITE, material: "Soil", supplier: TRANSPORTER, materialSourceSupplier: null, vehicleNumber: "TS22AA2203", transportType: "agency_vendor", quantity: 600, uom: "CFT", location: "12+600", receiptNumber: "OLD-2203", boqProjectId: 220, boqItemId: 221, isCancelled: false },
  { id: 2204, date: DATE, time: "11:25", site: SITE, material: "GSB", supplier: "VB22 OTHER HAULER", materialSourceSupplier: null, vehicleNumber: "TS22ZZ9999", transportType: "agency_vendor", quantity: 20, uom: "MT", location: "13+000", receiptNumber: "UNRELATED", boqProjectId: 220, boqItemId: 222, isCancelled: false },
  { id: 2205, date: DATE, time: "12:30", site: SITE, material: "Dust", supplier: "VB22 FALLBACK HAULER", materialSourceSupplier: NO_RATE, vehicleNumber: "TS22NR2205", transportType: "agency_vendor", quantity: 600, uom: "CFT", location: "13+200", receiptNumber: "NO-RATE", boqProjectId: 220, boqItemId: 221, isCancelled: false },
  { id: 2206, date: DATE, time: "13:35", site: SITE, material: "Soil", supplier: LEGACY_TRANSPORTER, materialSourceSupplier: null, vehicleNumber: "TS22LG2206", transportType: "agency_vendor", quantity: 600, uom: "CFT", location: "13+400", receiptNumber: "LEGACY", boqProjectId: 220, boqItemId: 221, isCancelled: false },
];

const fixtureState = {
  requests: [] as RequestRecord[],
  createdTrips: [] as AnyRow[],
  bulkAssignments: [] as AnyRow[],
  createdBills: [] as AnyRow[],
  duplicateSimulations: [] as AnyRow[],
  toastMessages: [] as AnyRow[],
};

declare global {
  interface Window {
    __VB22Fixture?: typeof fixtureState;
  }
}

window.__VB22Fixture = fixtureState;
let trips = initialTrips.map(row => ({ ...row }));
let bills: AnyRow[] = [];
let nextTripId = 2290;
let nextBillId = 22900;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

function requestDetails(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  return { url: new URL(raw, window.location.origin), inputMethod: inputMethod.toUpperCase() };
}

function tripItems(vendor: string) {
  if (vendor === SOURCE) {
    return trips.filter(row => row.materialSourceSupplier === SOURCE && row.material.toUpperCase() === "SOIL").map(row => ({
      date: row.date, category: "material", description: "SOIL (SITE)", qty: row.quantity, unit: row.uom,
      rate: 0, amount: 0, source: "auto", sourceId: row.id,
      sourceType: "site_material_trip_material", siteName: row.site,
      transporter: row.supplier, vehicleNumber: row.vehicleNumber, receiptNumber: row.receiptNumber,
    }));
  }
  if (vendor === TRANSPORTER) {
    return trips.filter(row => row.supplier === TRANSPORTER).map(row => ({
      date: row.date, category: "transport", description: "SOIL TRANSPORT", qty: 1, unit: "TRIP",
      rate: 350, amount: 350, source: "auto", sourceId: row.id,
      sourceType: "site_material_trip", siteName: row.site,
      suppliedTo: row.materialSourceSupplier, vehicleNumber: row.vehicleNumber, receiptNumber: row.receiptNumber,
    }));
  }
  if (vendor === NO_RATE) {
    return trips.filter(row => row.materialSourceSupplier === NO_RATE).map(row => ({
      date: row.date, category: "material", description: "DUST (SITE)", qty: row.quantity, unit: row.uom,
      rate: 0, amount: 0, source: "auto", sourceId: row.id,
      sourceType: "site_material_trip_material", siteName: row.site,
      transporter: row.supplier, vehicleNumber: row.vehicleNumber, receiptNumber: row.receiptNumber,
    }));
  }
  if (vendor === LEGACY_TRANSPORTER) {
    return trips.filter(row => row.supplier === LEGACY_TRANSPORTER).map(row => ({
      date: row.date, category: "transport", description: "SOIL TRANSPORT", qty: 1, unit: "TRIP",
      rate: 325, amount: 325, source: "auto", sourceId: row.id,
      sourceType: "site_material_trip", siteName: row.site,
      vehicleNumber: row.vehicleNumber, receiptNumber: row.receiptNumber,
    }));
  }
  return [];
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const request = requestDetails(input);
  const method = String(init?.method || request.inputMethod).toUpperCase();
  const pathname = request.url.pathname;
  let body: any;
  try { body = init?.body ? JSON.parse(String(init.body)) : undefined; } catch { body = init?.body; }
  fixtureState.requests.push({ method, path: `${pathname}${request.url.search}`, body });

  if (pathname === "/api/sites" && method === "GET") return json([{ id: 22, name: SITE, isActive: true }]);
  if (pathname === "/api/plant-module/equipment" && method === "GET") return json([]);
  if (pathname === "/api/site-requirements" && method === "GET") return json([]);
  if (pathname === "/api/boq/projects" && method === "GET") return json([{ id: 220, name: "VB22 ROAD BOQ" }]);
  if (pathname === "/api/boq/projects/220/items" && method === "GET") return json([
    { id: 221, itemCode: "EW-01", description: "SOIL EMBANKMENT", unit: "CUM" },
    { id: 222, itemCode: "GSB-01", description: "GSB LAYER", unit: "CUM" },
  ]);
  if (pathname.includes("/earthwork-arrangements/item/") && method === "GET") return json([]);
  if (pathname.endsWith("/arrangement-programme-allocations") && method === "GET") return json([]);
  if (pathname === "/api/dpr/programme-bars" && method === "GET") return json([]);
  if (pathname === "/api/material-receipt-suggestions" && method === "GET") return json({
    suppliers: [TRANSPORTER, "VB22 OTHER HAULER"], materialSourceSuppliers: [SOURCE, NO_RATE],
    vehicles: ["TS22AA2201", "TS22AA2202", "TS22AA2203"], vehicleSuppliers: [],
  });
  if (pathname.includes("/suggest") && method === "GET") return json({
    suppliers: [TRANSPORTER, "VB22 OTHER HAULER"], materialSourceSuppliers: [SOURCE, NO_RATE],
    vehicles: ["TS22AA2201", "TS22AA2202", "TS22AA2203"], vehicleSuppliers: [],
  });
  if (pathname === "/api/site-material-trips" && method === "GET") {
    const from = request.url.searchParams.get("dateFrom");
    const to = request.url.searchParams.get("dateTo");
    const material = request.url.searchParams.get("material");
    const supplier = request.url.searchParams.get("supplier") || request.url.searchParams.get("transporter");
    const site = request.url.searchParams.get("site");
    const vehicleNumber = request.url.searchParams.get("vehicleNumber");
    const onlyUnassigned = request.url.searchParams.get("onlyUnassigned") === "true";
    return json(trips.filter(row =>
      (!from || row.date >= from) && (!to || row.date <= to) &&
      (!material || row.material.toUpperCase() === material.toUpperCase()) &&
      (!supplier || row.supplier.toUpperCase().includes(supplier.toUpperCase())) &&
      (!site || row.site === site) &&
      (!vehicleNumber || row.vehicleNumber.toUpperCase().includes(vehicleNumber.toUpperCase())) &&
      (!onlyUnassigned || !row.materialSourceSupplier)
    ));
  }
  if (pathname === "/api/site-material-trips" && method === "POST") {
    const created = { ...body, id: nextTripId++, isCancelled: false };
    trips = [created, ...trips];
    fixtureState.createdTrips.push(created);
    return json(created, 201);
  }
  if (pathname === "/api/materials-received" && method === "GET") {
    return json(trips.map(row => ({ ...row, source: "trip" })));
  }
  if (pathname === "/api/materials/suppliers" && method === "GET") {
    return json([TRANSPORTER, "VB22 OTHER HAULER"]);
  }
  if (/^\/api\/site-material-trips\/\d+$/.test(pathname) && method === "PATCH") {
    const id = Number(pathname.split("/").pop());
    let updated: AnyRow | undefined;
    trips = trips.map(row => {
      if (row.id !== id) return row;
      updated = { ...row, ...body };
      return updated;
    });
    return updated ? json(updated) : json({ message: "Trip not found" }, 404);
  }
  if (/^\/api\/site-material-trips\/\d+$/.test(pathname) && method === "DELETE") {
    trips = trips.filter(row => row.id !== Number(pathname.split("/").pop()));
    return json({});
  }
  if (pathname.includes("/api/site-material-trips") && method === "PATCH" && /bulk|material-source/.test(pathname)) {
    fixtureState.bulkAssignments.push(body);
    const ids = Array.isArray(body?.tripIds) ? body.tripIds.map(Number) : null;
    const value = body?.materialSourceSupplier ?? body?.supplier ?? "";
    trips = trips.map(row => (!ids || ids.includes(row.id)) &&
      (!body?.material || row.material.toUpperCase() === String(body.material).toUpperCase()) &&
      (!body?.dateFrom || row.date >= body.dateFrom) && (!body?.dateTo || row.date <= body.dateTo)
      && (!body?.site || row.site === body.site)
      && (!body?.vehicleNumber || row.vehicleNumber.toUpperCase().includes(String(body.vehicleNumber).toUpperCase()))
      && (!body?.supplier || row.supplier.toUpperCase().includes(String(body.supplier).toUpperCase()))
      && (!body?.onlyUnassigned || !row.materialSourceSupplier)
      ? { ...row, materialSourceSupplier: value } : row);
    const updatedCount = trips.filter(row => row.materialSourceSupplier === value && row.id !== 2201).length;
    return json({ updatedCount, trips });
  }
  if (pathname.includes("/api/site-material-trips") && method === "POST" && /bulk|material-source/.test(pathname)) {
    fixtureState.bulkAssignments.push(body);
    const ids = Array.isArray(body?.tripIds) ? body.tripIds.map(Number) : null;
    const value = body?.materialSourceSupplier ?? body?.supplier ?? "";
    let updatedCount = 0;
    trips = trips.map(row => {
      const matches = (!ids || ids.includes(row.id))
        && (!body?.material || row.material.toUpperCase() === String(body.material).toUpperCase())
        && (!body?.dateFrom || row.date >= body.dateFrom) && (!body?.dateTo || row.date <= body.dateTo)
        && (!body?.site || row.site === body.site)
        && (!body?.vehicleNumber || row.vehicleNumber.toUpperCase().includes(String(body.vehicleNumber).toUpperCase()))
        && (!body?.supplier || row.supplier.toUpperCase().includes(String(body.supplier).toUpperCase()))
        && (!body?.onlyUnassigned || !row.materialSourceSupplier);
      if (!matches) return row;
      updatedCount++;
      return { ...row, materialSourceSupplier: value };
    });
    return json({ updatedCount, trips });
  }

  if (pathname === "/api/vendor-bills" && method === "GET") return json(bills);
  if (pathname === "/api/audit-logs" && method === "GET") return json([
    {
      id: 24002, module: "site_material_trips", transactionId: Number(request.url.searchParams.get("transactionId")),
      action: "update", userId: 2201, userName: "VB-24 Fixture Reviewer", userRole: "admin",
      oldValues: { materialSourceSupplier: SOURCE }, newValues: { materialSourceSupplier: "VB24 CORRECTED QUARRY" },
      reason: "Single-trip edit", stockImpact: null, createdAt: "2027-02-14T10:45:00.000Z",
    },
    {
      id: 24001, module: "site_material_trips", transactionId: Number(request.url.searchParams.get("transactionId")),
      action: "update", userId: 2201, userName: "VB-24 Fixture Reviewer", userRole: "admin",
      oldValues: { materialSourceSupplier: null }, newValues: { materialSourceSupplier: SOURCE },
      reason: "Bulk assigned material source supplier", stockImpact: null, createdAt: "2027-02-14T09:30:00.000Z",
    },
  ]);
  if (pathname === "/api/vendor-bills/summary" && method === "GET") return json({
    total: bills.length, totalAmount: bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0),
    draft: bills.length, draftAmount: bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0),
    verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0,
    gstByCategory: { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 }, totalGst: 0,
  });
  if (pathname === "/api/vendor-bills/vendor-names" && method === "GET") return json([SOURCE, TRANSPORTER, NO_RATE, LEGACY_TRANSPORTER]);
  if (pathname === "/api/vendor-aliases" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/company-accounts" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/discover-vendors" && method === "GET") {
    return json([SOURCE, TRANSPORTER, NO_RATE, LEGACY_TRANSPORTER].map(vendorName => ({
      vendorName, recordCount: tripItems(vendorName).length, categories: [...new Set(tripItems(vendorName).map(row => row.category))],
      existingBill: null,
    })));
  }
  if (pathname === "/api/vendor-bills/auto-items" && method === "GET") return json(tripItems(request.url.searchParams.get("vendorName") || ""));
  if (pathname === "/api/vendor-bills/hire-activities" && method === "GET") return json([]);
  if (pathname === "/api/reports/equipment-performance" && method === "GET") return json({
    filterOptions: { projects: [], ownership: [], owners: [], equipmentTypes: [], equipment: [], scopes: [] },
    totals: { eventCount: 0, linkedCount: 0, confirmedLegacyCount: 0, unclassifiedCount: 0, runtimeHours: 0, totalKm: 0, trips: 0, dieselActual: 0, dieselExpected: 0, dieselVariance: 0, activeDays: 0, efficiencyPercent: null, dieselBasis: "unavailable", dieselComparedActual: 0, dieselComparisonIncomplete: true },
    reviewRows: [], events: [], fleet: [], projects: [],
  });
  if (pathname === "/api/vendor-rate-cards" && method === "GET") {
    const vendor = request.url.searchParams.get("vendorName");
    return json(vendor === SOURCE ? [{ id: 22001, vendorName: SOURCE, category: "material", itemKey: "MAT_SOIL_TRIP", itemLabel: "SOIL", unit: "TRIP", rate: 800, notes: null }] : []);
  }
  if (pathname === "/api/vendor-rate-cards/discover" && method === "GET") return json([]);
  if (pathname === "/api/vendor-rate-cards/bulk-upsert" && method === "POST") return json(body?.items || []);
  if (pathname === "/api/equipment-master/canonical-types" && method === "GET") return json([]);
  if (pathname === "/api/plant-materials" && method === "GET") return json([{ name: "SOIL" }, { name: "DUST" }]);
  if (pathname === "/api/vendor-bills/check-duplicates" && method === "POST") {
    const requested = body?.items || [];
    const duplicateScenario = new URLSearchParams(window.location.search).get("scenario") === "duplicate";
    const duplicateIndex = requested.findIndex((row: any) => row.sourceType === "site_material_trip_material");
    const duplicate = duplicateScenario && duplicateIndex >= 0
      ? [{ index: duplicateIndex, billNo: "VB22-DUP-001", billStatus: "draft" }]
      : [];
    fixtureState.duplicateSimulations.push({ request: body, response: duplicate, label: "SYNTHETIC SAME-ROLE DUPLICATE API SIMULATION" });
    return json(duplicate);
  }
  if (pathname === "/api/vendor-bills" && method === "POST") {
    if (new URLSearchParams(window.location.search).get("scenario") === "duplicate") {
      const error = { message: "SYNTHETIC SAME-ROLE DUPLICATE API SIMULATION — source trip already billed to this vendor" };
      fixtureState.duplicateSimulations.push({ request: body, response: error, label: "SYNTHETIC SAME-ROLE DUPLICATE API SIMULATION" });
      window.dispatchEvent(new CustomEvent("vb22-duplicate", { detail: error.message }));
      return json(error, 409);
    }
    const created = { ...body, id: nextBillId++, status: "draft", createdAt: new Date().toISOString() };
    fixtureState.createdBills.push(created);
    bills = [created, ...bills];
    return json(created, 201);
  }
  if (pathname.startsWith("/api/attachments") && method === "GET") return json([]);
  if (pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

function FixtureRoute() {
  const [location] = useLocation();
  const [duplicateMessage, setDuplicateMessage] = useState("");
  const duplicateScenario = new URLSearchParams(window.location.search).get("scenario") === "duplicate";
  useEffect(() => {
    const listener = (event: Event) => setDuplicateMessage((event as CustomEvent).detail || "");
    window.addEventListener("vb22-duplicate", listener);
    return () => window.removeEventListener("vb22-duplicate", listener);
  }, []);
  const vb24Scenario = new URLSearchParams(window.location.search).get("scenario") === "vb24";
  return <>
    <div className={`${vb24Scenario ? "fixed inset-x-0 top-0" : "sticky top-0"} z-[200] border-b border-purple-300 bg-purple-50 px-4 py-2 text-center text-xs font-bold text-purple-900`} data-testid="vb22-fixture-disclosure">
      {vb24Scenario
        ? "VB-24 REAL-COMPONENT FIXTURE — SYNTHETIC API + AUDIT HISTORY — NO LIVE API OR DATABASE WRITES"
        : "VB-22 REAL-COMPONENT FIXTURE — SYNTHETIC API DATA — NO LIVE API OR DATABASE WRITES"}
    </div>
    {(duplicateScenario || duplicateMessage) && <div className="border-b border-red-400 bg-red-50 px-4 py-2 text-center text-sm font-bold text-red-800" data-testid="vb22-duplicate-simulation">
      {duplicateMessage || "SYNTHETIC SAME-ROLE DUPLICATE API SIMULATION — expected pull block only for the same material-source vendor"}
    </div>}
    {location.startsWith("/site/materials-received")
      ? <SiteMaterialsReceived />
      : location.startsWith("/site/material-trips")
        ? <SiteMaterialTrips />
        : <VendorBills />}
  </>;
}

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><FixtureRoute /></QueryClientProvider>,
);