import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import VendorBills from "../../../client/src/pages/VendorBills";
import "../../../client/src/index.css";

const VENDOR = "VB21 SYNTHETIC HIRE VENDOR";
const HOURLY_ID = 2101;
const TIPPER_ID = 2102;

type RequestRecord = { method: string; path: string; body?: any };
const fixtureState = {
  requests: [] as RequestRecord[],
  createdPayloads: [] as any[],
  toastMessages: [] as any[],
};

declare global {
  interface Window {
    __VB21Fixture?: typeof fixtureState;
  }
}
window.__VB21Fixture = fixtureState;

let bills: any[] = [];
let nextBillId = 21001;
const scenario = () => new URLSearchParams(window.location.search).get("scenario") === "tipper" ? "tipper" : "hourly";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

function details(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  return { url: new URL(raw, window.location.origin), inputMethod: inputMethod.toUpperCase() };
}

function hourlyActivity() {
  const equipment = {
    id: HOURLY_ID, name: "VB21 EXCAVATOR", registrationNumber: "VB21-HR",
    meterType: "hour_meter",
    hireBillingBasis: "monthly", hireRate: 30000, hireStartDate: "2026-11-01", hireEndDate: null,
    hireMonthlyDivisorType: "30", hireMonthlyDivisor: null, hireDieselResponsibility: "hlc",
    hireBreakdownDeductionEnabled: true, consumptionNorm: 3, normBasis: "litres_per_hour",
  };
  return [
    { source: "equipment_default", sourceId: HOURLY_ID, equipmentId: HOURLY_ID, equipment },
    {
      source: "dpr_log", sourceId: 21101, equipmentId: HOURLY_ID, businessDate: "2026-11-01",
      entryType: "hourly", hoursOrKmRun: 4, openingReading: 100, closingReading: 104,
      openingDiesel: 40, closingDiesel: 40, actualDiesel: 16, expectedDiesel: 12,
      expectedDieselAvailable: true, dieselSource: "plant_stock", occurredAt: "2026-11-01T08:00:00Z",
      consumptionNorm: 3, normBasis: "litres_per_hour", site: "ALLADURG PWD ROAD", task: "Embankment",
      equipmentName: "VB21 EXCAVATOR", status: "submitted",
    },
    {
      source: "plant_usage", sourceId: 21102, equipmentId: HOURLY_ID, businessDate: "2026-11-01",
      entryType: "hourly", hoursOrKmRun: 4, openingReading: 105, closingReading: 109,
      openingDiesel: 40, closingDiesel: 40, actualDiesel: 16, expectedDiesel: 12, expectedDieselAvailable: true,
      dieselSource: "plant_stock", occurredAt: "2026-11-01T13:00:00Z",
      consumptionNorm: 3, normBasis: "litres_per_hour", site: "ALLADURG PWD ROAD", task: "Shoulder dressing",
      equipmentName: "VB21 EXCAVATOR", status: "open",
    },
    {
      source: "dpr_log", sourceId: 21103, equipmentId: HOURLY_ID, businessDate: "2026-11-02",
      entryType: "hourly", hoursOrKmRun: 0, openingReading: 109, closingReading: 109,
      openingDiesel: 40, closingDiesel: 40, actualDiesel: 0, expectedDiesel: 0, expectedDieselAvailable: true,
      dieselSource: "plant_stock", occurredAt: "2026-11-02T08:00:00Z",
      consumptionNorm: 3, normBasis: "litres_per_hour", site: "ALLADURG PWD ROAD", task: "Inspection only",
      equipmentName: "VB21 EXCAVATOR", status: "submitted",
    },
    {
      source: "maintenance", sourceId: 21104, equipmentId: HOURLY_ID, businessDate: "2026-11-04",
      eventType: "breakdown", downtimeHours: 6, description: "HYDRAULIC HOSE BREAKDOWN",
    },
    { source: "diesel_rate", sourceId: 21090, businessDate: "2026-10-31", date: "2026-10-31", rate: 90, qtyPurchased: 1000, purchasedAt: "2026-10-31T12:00:00Z" },
  ];
}

function tipperActivity() {
  const equipment = {
    id: TIPPER_ID, name: "VB21 TIPPER", registrationNumber: "VB21-TRIP",
    meterType: "odometer",
    hireBillingBasis: "monthly", hireRate: 45000, hireStartDate: "2026-11-01", hireEndDate: null,
    hireMonthlyDivisorType: "30", hireMonthlyDivisor: null, hireDieselResponsibility: "hlc",
    hireBreakdownDeductionEnabled: false, consumptionNorm: 0.4, normBasis: "l/km",
  };
  const trip = (sourceId: number, opening: number, closing: number) => ({
    source: "site_material_trip", sourceId, equipmentId: TIPPER_ID, businessDate: "2026-11-01",
    entryType: "trip_based", numberOfTrips: 1, hoursOrKmRun: 20, openingReading: opening, closingReading: closing,
    openingDiesel: 30, closingDiesel: 30, actualDiesel: 10, expectedDiesel: 8, expectedDieselAvailable: true, dieselSource: "plant_stock",
    occurredAt: `2026-11-01T${sourceId === 21201 ? "08" : "12"}:00:00Z`,
    consumptionNorm: 0.4, normBasis: "l/km", site: "CRUSHER TO ALLADURG", task: "Aggregate transport",
    equipmentName: "VB21 TIPPER", status: "submitted",
  });
  return [
    { source: "equipment_default", sourceId: TIPPER_ID, equipmentId: TIPPER_ID, equipment },
    trip(21201, 5000, 5020), trip(21202, 5020, 5040),
    { source: "diesel_rate", sourceId: 21090, businessDate: "2026-10-31", date: "2026-10-31", rate: 90, qtyPurchased: 1000, purchasedAt: "2026-10-31T12:00:00Z" },
  ];
}

function activityRows(from: string, to: string) {
  const source = scenario() === "tipper" ? tipperActivity() : hourlyActivity();
  return source.filter((row: any) =>
    row.source === "equipment_default" || row.source === "diesel_rate" ||
    (row.businessDate >= from && row.businessDate <= to),
  );
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const request = details(input);
  const method = String(init?.method || request.inputMethod).toUpperCase();
  const pathname = request.url.pathname;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fixtureState.requests.push({ method, path: `${pathname}${request.url.search}`, body });

  if (pathname === "/api/vendor-bills" && method === "GET") return json(bills);
  if (pathname === "/api/vendor-bills/summary" && method === "GET") return json({
    total: bills.length, totalAmount: bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0),
    draft: bills.length, draftAmount: bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0),
    verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0,
    gstByCategory: { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 }, totalGst: 0,
  });
  if (pathname === "/api/vendor-bills/vendor-names" && method === "GET") return json([VENDOR]);
  if (pathname === "/api/vendor-aliases" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/company-accounts" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/discover-vendors" && method === "GET") {
    return json([{ vendorName: VENDOR, recordCount: 1, categories: ["equipment"], existingBill: null }]);
  }
  if (pathname === "/api/vendor-bills/auto-items" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/hire-activities" && method === "GET") {
    return json(activityRows(request.url.searchParams.get("periodFrom") || "", request.url.searchParams.get("periodTo") || ""));
  }
  if (pathname === "/api/vendor-bills/check-duplicates" && method === "POST") return json([]);
  if (pathname === "/api/reports/equipment-performance" && method === "GET") return json({
    filterOptions: { projects: [], ownership: [], owners: [], equipmentTypes: [], equipment: [], scopes: [] },
    totals: { eventCount: 0, linkedCount: 0, confirmedLegacyCount: 0, unclassifiedCount: 0, runtimeHours: 0, totalKm: 0, trips: 0, dieselActual: 0, dieselExpected: 0, dieselVariance: 0, activeDays: 0, efficiencyPercent: null, dieselBasis: "unavailable", dieselComparedActual: 0, dieselComparisonIncomplete: true },
    reviewRows: [], events: [], projects: [], fleet: scenario() === "tipper" ? [{
      equipmentId: TIPPER_ID, dieselConsumed: 20, expectedDiesel: 16, difference: 4,
      consumptionIncomplete: false, dailyRows: [],
    }] : [{
      equipmentId: HOURLY_ID, dieselConsumed: 32, expectedDiesel: 24, difference: 8,
      consumptionIncomplete: false, dailyRows: [],
    }],
  });
  if (pathname === "/api/vendor-rate-cards" && method === "GET") return json([]);
  if (pathname === "/api/vendor-rate-cards/discover" && method === "GET") return json([]);
  if (pathname === "/api/equipment-master/canonical-types" && method === "GET") return json([]);
  if (pathname === "/api/plant-materials" && method === "GET") return json([]);

  if (pathname === "/api/vendor-bills" && method === "POST") {
    fixtureState.createdPayloads.push(body);
    const id = nextBillId++;
    const created = {
      ...body, id, status: "draft", billNo: body.billNo || `VB21-${id}`,
      netPayableAmount: Number(body.totalAmount || 0), createdAt: new Date().toISOString(),
      hireSnapshot: {
        expectedDiesel: scenario() === "tipper" ? 16 : 24,
        actualDiesel: scenario() === "tipper" ? 20 : 32,
        dieselRecoveryFinalAmount: body?.hireGroups?.[0]?.dieselRecoveryFinalAmount,
      },
    };
    bills = [created, ...bills];
    return json(created, 201);
  }
  if (pathname.startsWith("/api/")) return json({});
  return originalFetch(input, init);
};

function FixtureShell() {
  return <>
    <div className="sticky top-0 z-[100] border-b border-purple-300 bg-purple-50 px-4 py-2 text-center text-xs font-bold text-purple-900" data-testid="vb21-fixture-disclosure">
      VB-21 FIXTURE — SYNTHETIC API DATA — NOT LIVE BILLS — NO DATABASE WRITES — {scenario().toUpperCase()}
    </div>
    <VendorBills />
  </>;
}

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><FixtureShell /></QueryClientProvider>,
);