import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import SiteMaterialTrips from "../../../client/src/pages/SiteMaterialTrips";
import SiteMaterialsReceived from "../../../client/src/pages/SiteMaterialsReceived";
import SiteEdit from "../../../client/src/pages/SiteEdit";
import { DprDayTripsPanel } from "../../../client/src/components/DprDayTripsPanel";
import { lookupTripBoqQuantity } from "../../../shared/tripQuantityDisplay";
import "../../../client/src/index.css";

type AnyRow = Record<string, any>;
const today = new Date().toISOString().slice(0, 10);
const scenario = () => new URLSearchParams(window.location.search).get("scenario") || "assigned";
const baseTrip: AnyRow = {
  id: 13021,
  date: today,
  time: "09:30",
  site: "MAT02 SYNTHETIC SITE",
  material: "WMM",
  supplier: "MAT02 SYNTHETIC TRANSPORTER",
  materialSourceSupplier: "MAT02 ASSIGNED QUARRY",
  vehicleNumber: "TS13AB1302",
  transportType: "agency_vendor",
  quantity: 22,
  uom: "MT",
  receiptNumber: "MAT02-CH-001",
  workType: "road",
  source: "trip",
  isCancelled: false,
};
let trip = { ...baseTrip };
const mat03 = scenario() === "mat03";
if (mat03) trip = { ...trip, quantity: 800, uom: "CFT", boqProjectId: 31, boqItemId: 32, unloadedAt: "yard", yardLabel: "SYNTHETIC OLD YARD" };
const enrich = (row: AnyRow) => ({ ...row, boqQuantity: lookupTripBoqQuantity(row as any,
  [{ boqItemId: 32, materialName: "WMM", uom: "Cum" }, { boqItemId: 32, materialName: "Soil", uom: "Cum" }],
  [{ name: "WMM", bulkDensity: 1.6 }, { name: "Soil", bulkDensity: null }]) });
trip = enrich(trip);
(window as any).__mat03Writes = [];

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(raw, window.location.origin);
  const method = String(init?.method || (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  let body: AnyRow = {};
  try {
    body = init?.body ? JSON.parse(String(init.body)) : {};
  } catch {
    body = {};
  }

  if (url.pathname === "/api/sites") return json([{ id: 1302, name: baseTrip.site, isActive: true }]);
  if (mat03 && url.pathname === "/api/dprs/3") return json({
    id: 3, date: today, site: baseTrip.site, engineer: "SYNTHETIC ENGINEER", role: "engineer",
    dprStatus: "draft", boqProjectId: 31, progress: [], materials: [], equipment: [], labour: [],
    labourEntries: [], diesel: [], dieselEntries: [], safety: [], delays: [], photos: [], remarks: "",
  });
  if (mat03 && url.pathname === "/api/boq/projects") return json([{ id: 31, name: "SYNTHETIC BOQ", siteId: 1302 }]);
  if (mat03 && url.pathname === "/api/boq/projects/31/items") return json([{ id: 32, projectId: 31, itemCode: "FILL", description: "SYNTHETIC WMM FILL", unit: "Cum" }]);
  if (mat03 && url.pathname === "/api/site-material-trips" && method === "POST") {
    trip = enrich({ ...body, id: 13022, source: "trip", isCancelled: false });
    (window as any).__mat03Writes.push({ method, payload: body, returned: trip });
    sessionStorage.setItem("mat03-created", JSON.stringify(trip));
    return json(trip, 201);
  }
  if (url.pathname === "/api/site-material-trips" && method === "GET") {
    if (scenario() === "backlog") return json([{ ...trip, materialSourceSupplier: "   " }]);
    return json(mat03 ? [trip,
      enrich({ ...trip, id: 13023, boqItemId: null, boqProjectId: null, vehicleNumber: "SYNTHETIC UNLINKED" }),
      enrich({ ...trip, id: 13024, material: "Soil", vehicleNumber: "SYNTHETIC NO DENSITY" }),
    ] : [trip]);
  }
  if (url.pathname === "/api/materials-received" && method === "GET") {
    if (mat03 && sessionStorage.getItem("mat03-created")) trip = JSON.parse(sessionStorage.getItem("mat03-created")!);
    if (mat03 && new URLSearchParams(window.location.search).has("legacy")) trip = { ...trip, unloadedAt: null, yardLabel: null };
    return json([trip]);
  }
  if (url.pathname === `/api/site-material-trips/${trip.id}` && method === "PATCH") {
    if (scenario() === "failure") {
      return json({ message: "SYNTHETIC INTERCEPTED SAVE FAILURE" }, 500);
    }
    trip = enrich({ ...trip, ...body });
    if (mat03) {
      (window as any).__mat03Writes.push({ method, payload: body, returned: trip });
      sessionStorage.setItem("mat03-created", JSON.stringify(trip));
    }
    return json(trip);
  }
  if (url.pathname === "/api/material-receipt-suggestions") return json({
    suppliers: [baseTrip.supplier],
    materialSourceSuppliers: [baseTrip.materialSourceSupplier, "MAT02 SAVED QUARRY"],
    vehicles: [baseTrip.vehicleNumber],
    vehicleSuppliers: [],
  });
  if (url.pathname === "/api/materials/suppliers") return json([
    baseTrip.supplier,
    baseTrip.materialSourceSupplier,
    "MAT02 SAVED QUARRY",
  ]);
  if (url.pathname === "/api/plant-module/equipment") return json([]);
  if (url.pathname === "/api/site-requirements") return json([]);
  if (url.pathname.startsWith("/api/attachments")) return json([]);
  if (url.pathname.startsWith("/api/")) return json([]);
  return new Response("Not found", { status: 404 });
};

function Fixture() {
  const [toast, setToast] = useState<{ title?: string; description?: string; variant?: string } | null>(null);
  useEffect(() => {
    const listener = (event: Event) => setToast((event as CustomEvent).detail);
    window.addEventListener("mat02-toast", listener);
    return () => window.removeEventListener("mat02-toast", listener);
  }, []);
  const received = window.location.pathname.startsWith("/site/materials-received");
  return (
    <>
      <div className="sticky top-0 z-[200] border-b border-purple-400 bg-purple-50 px-4 py-2 text-center text-xs font-bold text-purple-900" data-testid="mat02-fixture-disclosure">
        {mat03 ? "MAT-03" : "MAT-02"} PRODUCTION COMPONENT — SYNTHETIC INTERCEPTED API — NO LIVE API OR DATABASE WRITES — {scenario().toUpperCase()}
      </div>
      {toast && (
        <div
          className={`sticky top-8 z-[199] border-b px-4 py-2 text-center text-sm font-bold ${toast.variant === "destructive" ? "border-red-400 bg-red-50 text-red-900" : "border-green-400 bg-green-50 text-green-900"}`}
          data-testid="mat02-toast"
        >
          {toast.title}: {toast.description}
        </div>
      )}
      {window.location.pathname.startsWith("/site/edit/") ? <SiteEdit /> : received ? <SiteMaterialsReceived /> : <SiteMaterialTrips />}
      {mat03 && !window.location.pathname.startsWith("/site/edit/") && <DprDayTripsPanel siteName={baseTrip.site} date={today} testIdPrefix="mat03" />}
    </>
  );
}

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><Fixture /></QueryClientProvider>,
);