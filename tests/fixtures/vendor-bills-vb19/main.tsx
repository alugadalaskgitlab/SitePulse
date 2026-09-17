import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import VendorBills from "../../../client/src/pages/VendorBills";
import RateCards from "../../../client/src/pages/RateCards";
import "../../../client/src/index.css";

type FixtureItem = Record<string, any>;
type FixtureBill = Record<string, any>;

const VENDOR = "VB19 FASIUDDIN";
const ORDINARY_VENDOR = "VB19 ORDINARY SUPPLIER";

const soilItems: FixtureItem[] = Array.from({ length: 95 }, (_, index) => ({
  date: "2027-01-01",
  category: "material",
  description: "SOIL (SITE)",
  qty: 600,
  unit: "CFT",
  rate: 0,
  amount: 0,
  source: "auto",
  sourceId: 19000 + index,
  siteName: "VB19 ROAD",
}));

const ordinaryItems: FixtureItem[] = [{
  date: "2027-01-01",
  category: "material",
  description: "SAND (SITE)",
  qty: 3,
  unit: "MT",
  rate: 0,
  amount: 0,
  source: "auto",
  sourceId: 19100,
  siteName: "VB19 ROAD",
}];

const discoveredItems: FixtureItem[] = [
  { itemKey: "EQ_EXCAVATOR_HRS", itemLabel: "EXCAVATOR - HOURLY HIRE", category: "equipment", unit: "HRS", rate: 0, isManual: false },
  { itemKey: "MAT_SOIL_CFT", itemLabel: "SOIL", category: "material", unit: "CFT", rate: 800, isManual: false },
  { itemKey: "EQ_TIPPER_TRIP", itemLabel: "TIPPER - TRIP", category: "transport", unit: "TRIP", rate: 800, isManual: false },
  { itemKey: "LAB_SKILLED", itemLabel: "LABOUR SKILLED", category: "labour", unit: "HEAD-DAY", rate: 900, isManual: false },
];

const initialRateCards: FixtureItem[] = [
  { id: 19001, vendorName: VENDOR, category: "material", itemKey: "MAT_SOIL_CFT", itemLabel: "SOIL", unit: "CFT", rate: 800, notes: null },
  { id: 19002, vendorName: VENDOR, category: "material", itemKey: "MAT_SOIL_TRIP", itemLabel: "SOIL", unit: "TRIP", rate: 800, notes: null },
  { id: 19003, vendorName: VENDOR, category: "material", itemKey: "MAT_SAND_MT", itemLabel: "SAND", unit: "MT", rate: 325, notes: null },
  { id: 19004, vendorName: VENDOR, category: "equipment", itemKey: "EQ_EXCAVATOR_HRS", itemLabel: "EXCAVATOR - HOURLY HIRE", unit: "HRS", rate: 4500, notes: null },
  { id: 19005, vendorName: VENDOR, category: "transport", itemKey: "EQ_TIPPER_TRIP", itemLabel: "TIPPER - TRIP", unit: "TRIP", rate: 800, notes: null },
  { id: 19006, vendorName: VENDOR, category: "labour", itemKey: "LAB_SKILLED", itemLabel: "LABOUR SKILLED", unit: "HEAD-DAY", rate: 900, notes: null },
  { id: 19007, vendorName: ORDINARY_VENDOR, category: "material", itemKey: "MAT_SAND_MT", itemLabel: "SAND", unit: "MT", rate: 325, notes: null },
];

function storageJson<T>(key: string, fallback: T): T {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function saveStorage(key: string, value: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* fixture storage is advisory */ }
}

const scenario = () => new URLSearchParams(window.location.search).get("scenario") || "vb19";
const isOrdinary = () => scenario() === "vb19-ordinary";
const activeVendor = () => isOrdinary() ? ORDINARY_VENDOR : VENDOR;
const activeAutoItems = () => isOrdinary() ? ordinaryItems : soilItems;

const fixtureState = {
  requests: [] as Array<{ method: string; path: string; body?: any }>,
  createdPayloads: [] as any[],
  updatedPayloads: [] as any[],
  rateCardUpserts: [] as any[],
  rateCardDeletes: [] as number[],
  duplicateChecks: [] as any[],
  confirmations: [] as Array<{ message: string; answer: boolean }>,
  toastMessages: [] as any[],
};

declare global {
  interface Window {
    __VB19Fixture?: typeof fixtureState;
  }
}

window.__VB19Fixture = fixtureState;
let bills: FixtureBill[] = storageJson("vb19-bills", []);
let rateCards: FixtureItem[] = storageJson("vb19-rate-cards", initialRateCards);
let nextBillId = Math.max(19100, ...bills.map(bill => Number(bill.id) || 0)) + 1;
let nextRateCardId = Math.max(19100, ...rateCards.map(card => Number(card.id) || 0)) + 1;

window.confirm = (message: string) => {
  const queue = (window as Window & { __VB19_CONFIRM_QUEUE?: boolean[] }).__VB19_CONFIRM_QUEUE || [];
  const answer = queue.length ? Boolean(queue.shift()) : true;
  (window as Window & { __VB19_CONFIRM_QUEUE?: boolean[] }).__VB19_CONFIRM_QUEUE = queue;
  fixtureState.confirmations.push({ message, answer });
  return answer;
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

function requestDetails(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method || "GET" : "GET";
  return { url: new URL(raw, window.location.origin), inputMethod: inputMethod.toUpperCase() };
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const details = requestDetails(input);
  const method = String(init?.method || details.inputMethod).toUpperCase();
  const pathname = details.url.pathname;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fixtureState.requests.push({ method, path: `${pathname}${details.url.search}`, body });

  if (pathname === "/api/vendor-bills" && method === "GET") return json(bills);
  if (pathname === "/api/vendor-bills/summary" && method === "GET") {
    const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.totalAmount || 0), 0);
    return json({
      total: bills.length, totalAmount, draft: bills.filter(b => b.status === "draft").length,
      draftAmount: totalAmount, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0,
      paid: 0, paidAmount: 0, gstByCategory: { equipment: 0, material: 0, transport: 0, labour: 0, other: 0 }, totalGst: 0,
    });
  }
  if (pathname === "/api/vendor-bills/vendor-names" && method === "GET") return json([VENDOR, ORDINARY_VENDOR]);
  if (pathname === "/api/vendor-aliases" && method === "GET") return json([]);
  if (pathname === "/api/vendor-bills/company-accounts" && method === "GET") return json([]);

  if (pathname === "/api/vendor-rate-cards/discover" && method === "GET") {
    const vendor = details.url.searchParams.get("vendorName") || "";
    return json(vendor === VENDOR ? discoveredItems : []);
  }
  if (pathname === "/api/vendor-rate-cards" && method === "GET") {
    const vendor = details.url.searchParams.get("vendorName") || "";
    return json(rateCards.filter(card => card.vendorName === vendor));
  }
  if (pathname === "/api/equipment-master/canonical-types" && method === "GET") return json(["EXCAVATOR", "LOADER", "HAULER"]);
  if (pathname === "/api/plant-materials" && method === "GET") return json([{ name: "SOIL" }, { name: "SAND" }, { name: "STONE" }]);

  if (pathname === "/api/vendor-bills/discover-vendors" && method === "GET") {
    const vendor = activeVendor();
    return json([{ vendorName: vendor, recordCount: activeAutoItems().length, categories: ["material"], existingBill: null }]);
  }
  if (pathname === "/api/vendor-bills/auto-items" && method === "GET") return json(activeAutoItems());
  if (pathname === "/api/vendor-bills/hire-activities" && method === "GET") return json([]);
  if (pathname === "/api/reports/equipment-performance" && method === "GET") return json({
    filterOptions: { projects: [], ownership: [], owners: [], equipmentTypes: [], equipment: [], scopes: [] },
    totals: { eventCount: 0, linkedCount: 0, confirmedLegacyCount: 0, unclassifiedCount: 0, runtimeHours: 0, totalKm: 0, trips: 0, dieselActual: 0, dieselExpected: 0, dieselVariance: 0, activeDays: 0, efficiencyPercent: null, dieselBasis: "unavailable", dieselComparedActual: 0, dieselComparisonIncomplete: true },
    reviewRows: [], events: [], fleet: [], projects: [],
  });
  if (pathname === "/api/vendor-bills/check-duplicates" && method === "POST") {
    fixtureState.duplicateChecks.push(body);
    return json([]);
  }

  if (pathname === "/api/vendor-rate-cards/bulk-upsert" && method === "POST") {
    fixtureState.rateCardUpserts.push(body);
    for (const item of body?.items || []) {
      const existing = rateCards.find(card => card.vendorName === item.vendorName && card.category === item.category && card.itemKey === item.itemKey);
      if (existing) Object.assign(existing, item);
      else rateCards.push({ ...item, id: nextRateCardId++ });
    }
    saveStorage("vb19-rate-cards", rateCards);
    return json(rateCards);
  }
  const cardDelete = pathname.match(/^\/api\/vendor-rate-cards\/(\d+)$/);
  if (cardDelete && method === "DELETE") {
    const id = Number(cardDelete[1]);
    fixtureState.rateCardDeletes.push(id);
    rateCards = rateCards.filter(card => Number(card.id) !== id);
    saveStorage("vb19-rate-cards", rateCards);
    return json({});
  }

  const detail = pathname.match(/^\/api\/vendor-bills\/(\d+)$/);
  if (detail && method === "GET") {
    const bill = bills.find(candidate => Number(candidate.id) === Number(detail[1]));
    return bill ? json(bill) : json({ message: "Not found" }, 404);
  }
  if (pathname === "/api/vendor-bills" && method === "POST") {
    fixtureState.createdPayloads.push(body);
    const id = nextBillId++;
    const created = {
      ...body, id, status: "draft", billNo: body.billNo || `VB19-${id}`,
      items: (body.items || []).map((item: any, index: number) => ({ ...item, id: id * 100 + index, billId: id })),
      netPayableAmount: Number(body.totalAmount || 0), createdAt: new Date().toISOString(),
    };
    bills = [created, ...bills];
    saveStorage("vb19-bills", bills);
    return json(created, 201);
  }
  if (detail && method === "PUT") {
    fixtureState.updatedPayloads.push({ id: Number(detail[1]), payload: body });
    bills = bills.map(candidate => Number(candidate.id) === Number(detail[1])
      ? { ...candidate, ...body, items: (body.items || []).map((item: any, index: number) => ({ ...item, id: Number(detail[1]) * 100 + index, billId: Number(detail[1]) })) }
      : candidate);
    saveStorage("vb19-bills", bills);
    return json(bills.find(candidate => Number(candidate.id) === Number(detail[1])));
  }
  if (pathname.startsWith("/api/")) return json({});
  return originalFetch(input, init);
};

function FixtureRoute() {
  const [location] = useLocation();
  const [key, setKey] = useState(location);
  useEffect(() => setKey(location), [location]);
  return <React.Fragment key={key.split("?")[0]}>{location.startsWith("/plant/rate-cards") ? <RateCards /> : <VendorBills />}</React.Fragment>;
}

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <FixtureRoute />
  </QueryClientProvider>,
);