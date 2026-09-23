import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import DprDetails from "@/pages/DprDetails";
import EquipmentStatus from "@/pages/EquipmentStatus";
import { DprEquipmentCompact, type DprEquipmentFields } from "@/components/DprEquipmentCompact";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";
import "@/index.css";

const SITE = "DPR12 GAP TEST SITE";
const EQUIPMENT_ID = 1201;
const storageKey = "dpr12-synthetic-saved-row";
const requestLog: Array<{ method: string; path: string }> = [];

declare global {
  interface Window {
    __DPR12_FIXTURE__: {
      requests: typeof requestLog;
      writes: typeof requestLog;
      latestClosingRequests: string[];
      savedPayloads: DprEquipmentFields[];
    };
  }
}

window.__DPR12_FIXTURE__ = {
  requests: requestLog,
  writes: [],
  latestClosingRequests: [],
  savedPayloads: [],
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

const progress = [
  { id: 12001, activity: "Emergency diversion repair", isIncidental: true, boqItemId: null, side: "LHS", chainageFrom: "1+000", chainageTo: "1+050", length: 50, width: 3, thickness: .15, quantity: 22.5, uom: "CUM" },
  { id: 12002, activity: "Granular sub-base", isIncidental: false, boqItemId: null, side: "RHS", chainageFrom: "1+050", chainageTo: "1+150", length: 100, width: 3.5, thickness: .2, quantity: 70, uom: "CUM" },
  { id: 12003, activity: "No Site Work — rain", isIncidental: false, noSiteWork: true, boqItemId: null, side: "", chainageFrom: "", chainageTo: "", quantity: 0, uom: "CUM" },
];

const dpr = {
  id: 120, date: "2026-12-12", site: SITE, engineer: "Fixture Engineer",
  role: "engineer", dprStatus: "submitted", workType: "road", submittedAt: "2026-12-12T17:00:00Z",
  createdAt: "2026-12-12T08:00:00Z", isSuperseded: false, isCancelled: false, isDeleted: false,
  lockStatus: "locked", progress, equipment: [], labour: [], materials: [], sitePurchases: [],
  structureItems: [], remarks: "DPR-12 isolated synthetic evidence.",
};

const statusReport = {
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  equipment: [{
    equipmentId: EQUIPMENT_ID,
    name: "HIRED EXCAVATOR — AUGUST 2026",
    ownership: "hired",
    vendorName: "Synthetic Plant Hire",
    meterType: "hour_meter",
    summary: { working: 0, idleNoWork: 0, idleNoOperator: 0, breakdown: 0, loggedUnspecified: 4, notLogged: 27 },
    days: Array.from({ length: 31 }, (_, index) => {
      const day = index + 1;
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      if ([26, 28, 29, 30].includes(day)) {
        return { date, status: "logged_unspecified", reason: null, legacyLogged: true };
      }
      return { date, status: "not_logged", reason: null };
    }),
  }],
};

const explicitStatusReport = {
  ...statusReport,
  equipment: statusReport.equipment.map(item => ({
    ...item,
    summary: { ...item.summary, working: 1, notLogged: 26 },
    days: item.days.map(day => day.date === "2026-08-31"
      ? { date: day.date, status: "working", reason: null }
      : day),
  })),
};

window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const inputMethod = typeof input === "object" && "method" in input ? input.method : "GET";
  const method = (init?.method || inputMethod || "GET").toUpperCase();
  const url = new URL(raw, window.location.origin);
  const path = `${url.pathname}${url.search}`;
  requestLog.push({ method, path });
  if (method !== "GET") window.__DPR12_FIXTURE__.writes.push({ method, path });

  if (url.pathname === "/api/dprs/120") return json(dpr);
  if (url.pathname === "/api/sites") return json([{ id: 12, name: SITE, isActive: 1 }]);
  if (url.pathname === "/api/plant-module/equipment") return json([]);
  if (url.pathname === "/api/boq/projects") return json([]);
  if (url.pathname === `/api/equipment/${EQUIPMENT_ID}/latest-closing`) {
    window.__DPR12_FIXTURE__.latestClosingRequests.push(path);
    return json({ closingReading: 418.6, sourceDate: "2026-12-07", source: "dpr_log" });
  }
  if (url.pathname === `/api/equipment/${EQUIPMENT_ID}/latest-confirmed-diesel-tank`) {
    return json({ dieselBalanceInTank: 76 });
  }
  if (url.pathname === "/api/reports/equipment-status") {
    return json(location.search.includes("scenario=explicit") ? explicitStatusReport : statusReport);
  }
  if (url.pathname.startsWith("/api/")) return json([]);
  return json({ message: `Unmocked fixture request: ${path}` }, 404);
};

const baseRow: DprEquipmentFields = {
  machine: "DPR12 EXCAVATOR",
  vehicleNo: "DPR12-EQ-01",
  operator: "Synthetic Operator",
  equipmentId: EQUIPMENT_ID,
  entryType: "time_meter",
  dieselSource: "plant_stock",
  diesel: 0,
  openingDiesel: null,
  dieselBalanceInTank: null,
  dieselBalanceConfirmed: true,
  startTime: "08:00",
  endTime: "17:00",
  openingReading: null,
  closingReading: null,
  activitySegments: [],
};

function CompactFixture() {
  const scenario = new URLSearchParams(location.search).get("scenario") || "continuity";
  const saved = localStorage.getItem(storageKey);
  const initial = scenario === "legacy"
    ? { ...baseRow, openingReading: 400, closingReading: 405, openingDiesel: 80, dieselBalanceInTank: 75, usageStatus: null }
    : scenario === "manual"
      ? { ...baseRow, openingReading: 777.7, closingReading: 779 }
      : scenario === "reload" && saved
        ? JSON.parse(saved)
        : baseRow;
  const [row, setRow] = useState<DprEquipmentFields>(initial as DprEquipmentFields);

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify(row));
    window.__DPR12_FIXTURE__.savedPayloads.push(row);
  };

  return <main className="mx-auto max-w-6xl space-y-4 p-6">
    <header className="flex items-center justify-between rounded-lg border bg-slate-50 p-4">
      <div><h1 className="text-xl font-bold">DPR-12 Synthetic Equipment Entry</h1><p className="text-sm text-slate-600">Scenario: {scenario} · no production API mutation</p></div>
      <Button onClick={save} data-testid="save-synthetic">Save synthetic DPR</Button>
    </header>
    <DprEquipmentCompact
      row={row}
      equipment={{ meterType: "hour_meter", consumptionNorm: 4, ownership: "owned" }}
      onChange={patch => setRow(current => ({ ...current, ...patch }))}
      beforeDate="2026-12-12"
      site={SITE}
      index={0}
      boqItems={[]}
      editable
    />
    <output data-testid="fixture-row-json" className="sr-only">{JSON.stringify(row)}</output>
  </main>;
}

function App() {
  return <QueryClientProvider client={queryClient}><Switch>
    <Route path="/dpr/:id"><DprDetails /></Route>
    <Route path="/compact"><CompactFixture /></Route>
    <Route path="/equipment-status"><main className="min-h-screen bg-slate-50 p-6"><EquipmentStatus /></main></Route>
    <Route><div>Use /dpr/120, /compact, or /equipment-status</div></Route>
  </Switch></QueryClientProvider>;
}

createRoot(document.getElementById("root")!).render(<App />);