import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import VendorBills from "../../../client/src/pages/VendorBills";
import "../../../client/src/index.css";

const VENDOR = "VB20 MONTHLY HIRE FIXTURE";
const EQUIPMENT_ID = 2020;

type RequestRecord = { method: string; path: string; body?: any };
const fixtureState = {
  requests: [] as RequestRecord[],
  createdPayloads: [] as any[],
  toastMessages: [] as any[],
  simulatedOverlapRejections: [] as any[],
};

declare global {
  interface Window {
    __VB20Fixture?: typeof fixtureState;
  }
}
window.__VB20Fixture = fixtureState;

let bills: any[] = [];
let nextBillId = 20001;
const billedRanges: Array<{ from: string; to: string; billNo: string }> = [];

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

function details(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  return { url: new URL(raw, window.location.origin), inputMethod: inputMethod.toUpperCase() };
}

function overlaps(from: string, to: string) {
  return billedRanges.find(range => from <= range.to && to >= range.from);
}

function activityRows(from: string, to: string) {
  const inPeriod = (date: string) => date >= from && date <= to;
  const equipment = {
    id: EQUIPMENT_ID,
    name: "VB20 EXCAVATOR",
    registrationNumber: "FIXTURE-2020",
    hireBillingBasis: "monthly",
    hireRate: 60000,
    hireStartDate: "2026-08-01",
    hireEndDate: null,
    hireMonthlyDivisorType: "30",
    hireMonthlyDivisor: null,
    hireDieselResponsibility: "hlc",
    hireBreakdownDeductionEnabled: true,
    consumptionNorm: 10,
  };
  const rows: any[] = [{
    source: "equipment_default", sourceId: EQUIPMENT_ID, equipmentId: EQUIPMENT_ID,
    equipment,
  }];
  const dated = [
    { source: "dpr_log", sourceId: 20801, equipmentId: EQUIPMENT_ID, businessDate: "2026-08-10", entryType: "hourly", hoursOrKmRun: 10, openingDiesel: 100, closingDiesel: 40, actualDiesel: 50, dieselSource: "plant_stock", occurredAt: "2026-08-10T08:00:00Z", description: "August fixture runtime" },
    { source: "maintenance", sourceId: 20802, equipmentId: EQUIPMENT_ID, businessDate: "2026-08-18", eventType: "breakdown", downtimeHours: 10, description: "AUGUST FIXTURE BREAKDOWN" },
    { source: "maintenance", sourceId: 20803, equipmentId: EQUIPMENT_ID, businessDate: "2026-08-22", eventType: "breakdown", downtimeHours: 10, description: "AUGUST FIXTURE BREAKDOWN TWO" },
    { source: "dpr_log", sourceId: 20901, equipmentId: EQUIPMENT_ID, businessDate: "2026-09-10", entryType: "hourly", hoursOrKmRun: 5, openingDiesel: 80, closingDiesel: 20, actualDiesel: 20, dieselSource: "plant_stock", occurredAt: "2026-09-10T08:00:00Z", description: "September fixture runtime" },
    { source: "maintenance", sourceId: 20902, equipmentId: EQUIPMENT_ID, businessDate: "2026-09-12", eventType: "breakdown", downtimeHours: 5, description: "SEPTEMBER FIXTURE BREAKDOWN" },
    { source: "dpr_log", sourceId: 21001, equipmentId: EQUIPMENT_ID, businessDate: "2026-10-10", entryType: "hourly", hoursOrKmRun: 2, openingDiesel: 50, closingDiesel: 20, actualDiesel: 10, dieselSource: "plant_stock", occurredAt: "2026-10-10T08:00:00Z", description: "October fixture runtime" },
    { source: "maintenance", sourceId: 21002, equipmentId: EQUIPMENT_ID, businessDate: "2026-10-15", eventType: "breakdown", downtimeHours: 2, description: "OCTOBER FIXTURE BREAKDOWN" },
    { source: "diesel_rate", sourceId: 20700, businessDate: "2026-07-31", date: "2026-07-31", rate: 90, qtyPurchased: 1000, purchasedAt: "2026-07-31T12:00:00Z" },
  ];
  const breakdownScenario = new URLSearchParams(window.location.search).get("scenario") === "breakdown";
  return rows.concat(dated.filter(row =>
    (row.source !== "maintenance" || breakdownScenario) &&
    (!row.businessDate || inPeriod(row.businessDate) || row.source === "diesel_rate")
  ));
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
    reviewRows: [], events: [], projects: [],
    fleet: [{ equipmentId: EQUIPMENT_ID, dailyRows: [] }],
  });
  if (pathname === "/api/vendor-rate-cards" && method === "GET") return json([]);
  if (pathname === "/api/vendor-rate-cards/discover" && method === "GET") return json([]);
  if (pathname === "/api/equipment-master/canonical-types" && method === "GET") return json([]);
  if (pathname === "/api/plant-materials" && method === "GET") return json([]);

  if (pathname === "/api/vendor-bills" && method === "POST") {
    const ranges = (body?.hireGroups || []).map((group: any) => ({ from: group.periodFrom, to: group.periodTo }));
    const duplicate = ranges.map((range: any) => ({ ...range, prior: overlaps(range.from, range.to) })).find((range: any) => range.prior);
    if (duplicate) {
      const error = { message: `Fixture overlap simulation: ${duplicate.from}–${duplicate.to} overlaps ${duplicate.prior.billNo}. Backend overlap behavior requires its separate server test.` };
      fixtureState.simulatedOverlapRejections.push({ body, error });
      window.dispatchEvent(new CustomEvent("vb20-overlap", { detail: error }));
      return json(error, 409);
    }
    fixtureState.createdPayloads.push(body);
    const id = nextBillId++;
    const created = { ...body, id, status: "draft", billNo: body.billNo || `VB20-${id}`, netPayableAmount: Number(body.totalAmount || 0), createdAt: new Date().toISOString() };
    bills = [created, ...bills];
    ranges.forEach((range: any) => billedRanges.push({ ...range, billNo: created.billNo }));
    return json(created, 201);
  }
  if (pathname.startsWith("/api/")) return json({});
  return originalFetch(input, init);
};

function FixtureShell() {
  const [overlap, setOverlap] = useState("");
  useEffect(() => {
    const listener = (event: Event) => setOverlap((event as CustomEvent).detail?.message || "");
    window.addEventListener("vb20-overlap", listener);
    return () => window.removeEventListener("vb20-overlap", listener);
  }, []);
  return <>
    <div className="sticky top-0 z-[100] border-b border-purple-300 bg-purple-50 px-4 py-2 text-center text-xs font-bold text-purple-900" data-testid="vb20-fixture-disclosure">
      FIXTURE VERIFICATION — SYNTHETIC API DATA — NOT LIVE BILLS — NO DATABASE WRITES
    </div>
    {overlap && <div className="border-b border-red-400 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800" data-testid="vb20-simulated-overlap">{overlap}</div>}
    <VendorBills />
  </>;
}

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><FixtureShell /></QueryClientProvider>,
);