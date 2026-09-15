import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import GuidedDpr from "../../../client/src/pages/GuidedDpr";
import SiteEdit from "../../../client/src/pages/SiteEdit";
import SiteEntry from "../../../client/src/pages/SiteEntry";
import SiteReport from "../../../client/src/pages/SiteReport";
import { DprEquipmentCompact } from "../../../client/src/components/DprEquipmentCompact";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type RequestRecord = { method: string; path: string; body?: unknown };

const site = {
  id: 6200,
  name: "DPR-02 FIXTURE SITE",
  location: "Isolated browser evidence",
  isActive: 1,
};

const equipment = [
  {
    id: 6201,
    name: "MONTHLY HOUR METER",
    registrationNumber: "DPR02-MON-01",
    equipmentType: "Compactor",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 4,
    isActive: 1,
    fuelType: "Diesel",
  },
  {
    id: 6202,
    name: "DAILY HOUR METER",
    registrationNumber: "DPR02-DAY-01",
    equipmentType: "Loader",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 3,
    isActive: 1,
    fuelType: "Diesel",
  },
  {
    id: 6203,
    name: "TRIP ODOMETER",
    registrationNumber: "DPR02-TRIP-01",
    equipmentType: "Tipper",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "odometer",
    consumptionNorm: 0.2,
    isActive: 1,
    fuelType: "Diesel",
  },
  {
    id: 6204,
    name: "DAILY CLOCK ONLY",
    registrationNumber: "DPR02-CLOCK-01",
    equipmentType: "Roller",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 3,
    isActive: 1,
    fuelType: "Diesel",
  },
  {
    id: 6205,
    name: "MONTHLY CLOCK ONLY",
    registrationNumber: "DPR02-CLOCK-02",
    equipmentType: "Generator",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 2,
    isActive: 1,
    fuelType: "Diesel",
  },
  {
    id: 6206,
    name: "HISTORICAL TRIP EQUIPMENT",
    registrationNumber: "DPR02-OLD-TRIP",
    equipmentType: "Tipper",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 0.5,
    isActive: 1,
    fuelType: "Diesel",
  },
  {
    id: 6207,
    name: "WATER TANKER",
    registrationNumber: "DPR02-WATER-01",
    equipmentType: "Water Tanker",
    ownership: "hired",
    vendorName: "FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 3,
    isActive: 1,
    fuelType: "Diesel",
  },
];

const guidedEquipment = [
  {
    id: 6211,
    machine: "MONTHLY HOUR METER",
    vehicleNo: "DPR02-MON-01",
    operator: "MONTHLY OPERATOR",
    entryType: "monthly",
    startTime: "",
    endTime: "",
    openingReading: 100,
    closingReading: 106,
    hoursWorked: null,
    diesel: 0,
    dieselNorm: 4,
    expectedDiesel: null,
    equipmentId: 6201,
    plantUsageId: null,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
    numberOfTrips: null,
    tripDistance: null,
    totalKm: null,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6212,
    machine: "DAILY HOUR METER",
    vehicleNo: "DPR02-DAY-01",
    operator: "DAILY OPERATOR",
    entryType: "daily",
    startTime: "",
    endTime: "",
    openingReading: 200,
    closingReading: 205,
    hoursWorked: null,
    diesel: 0,
    dieselNorm: 3,
    expectedDiesel: null,
    equipmentId: 6202,
    plantUsageId: null,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
    numberOfTrips: null,
    tripDistance: null,
    totalKm: null,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6213,
    machine: "TRIP ODOMETER",
    vehicleNo: "DPR02-TRIP-01",
    operator: "TRIP OPERATOR",
    entryType: "trip_based",
    startTime: "",
    endTime: "",
    openingReading: 1000,
    closingReading: 1025,
    hoursWorked: null,
    diesel: 0,
    dieselNorm: 0.2,
    expectedDiesel: null,
    equipmentId: 6203,
    plantUsageId: null,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
    numberOfTrips: 2,
    tripDistance: 10,
    totalKm: 40,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6214,
    machine: "DAILY CLOCK ONLY",
    vehicleNo: "DPR02-CLOCK-01",
    operator: "CLOCK DAILY",
    entryType: "daily",
    startTime: "08:00",
    endTime: "11:00",
    openingReading: null,
    closingReading: null,
    hoursWorked: null,
    diesel: 0,
    dieselNorm: 3,
    expectedDiesel: null,
    equipmentId: 6204,
    plantUsageId: null,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
    numberOfTrips: null,
    tripDistance: null,
    totalKm: null,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6215,
    machine: "MONTHLY CLOCK ONLY",
    vehicleNo: "DPR02-CLOCK-02",
    operator: "CLOCK MONTHLY",
    entryType: "monthly",
    startTime: "08:00",
    endTime: "14:00",
    openingReading: null,
    closingReading: null,
    hoursWorked: null,
    diesel: 0,
    dieselNorm: 2,
    expectedDiesel: null,
    equipmentId: 6205,
    plantUsageId: null,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
    numberOfTrips: null,
    tripDistance: null,
    totalKm: null,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6216,
    machine: "WATER TANKER",
    vehicleNo: "DPR02-WATER-01",
    operator: "WATER OPERATOR",
    entryType: "daily",
    startTime: "",
    endTime: "",
    openingReading: null,
    closingReading: null,
    hoursWorked: null,
    diesel: 0,
    dieselNorm: 3,
    expectedDiesel: null,
    equipmentId: 6207,
    plantUsageId: null,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: false,
    numberOfTrips: null,
    tripDistance: null,
    totalKm: null,
    waterQuantity: 0,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
];

const guidedRecord = {
  id: 6250,
  date: "2026-09-15",
  site: site.name,
  engineer: "DPR-02 FIXTURE ENGINEER",
  role: "engineer",
  workType: "road",
  boqProjectId: 6251,
  dprStatus: "draft",
  isSuperseded: false,
  lockStatus: "unlocked",
  progress: [],
  equipment: guidedEquipment,
  labour: [],
  materials: [],
  sitePurchases: [],
  structureItems: [],
  remarks: "DPR-02 browser fixture. Not a customer DPR.",
};

const historicalRows = [
  {
    id: 6311,
    machine: "HISTORICAL MONTHLY",
    vehicleNo: "DPR02-OLD-MON",
    operator: "OLDER MONTHLY OPERATOR",
    entryType: "monthly",
    startTime: "",
    endTime: "",
    openingReading: 900,
    closingReading: 906,
    hoursWorked: 6,
    diesel: 0,
    dieselNorm: 4,
    expectedDiesel: 24,
    equipmentId: 6201,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: null,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6312,
    machine: "HISTORICAL DAILY",
    vehicleNo: "DPR02-OLD-DAY",
    operator: "OLDER DAILY OPERATOR",
    entryType: "daily",
    startTime: "",
    endTime: "",
    openingReading: 200,
    closingReading: 204,
    hoursWorked: 4,
    diesel: 0,
    dieselNorm: 3,
    expectedDiesel: 12,
    equipmentId: 6202,
    dieselSource: "contractor",
    openingDiesel: null,
    dieselBalanceInTank: null,
    dieselBalanceConfirmed: null,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6313,
    machine: "CONFIRMED PLANT STOCK",
    vehicleNo: "DPR02-ACTUAL",
    operator: "CONFIRMED OPERATOR",
    entryType: "daily",
    startTime: "",
    endTime: "",
    openingReading: 300,
    closingReading: 305,
    hoursWorked: 5,
    diesel: 10,
    dieselNorm: 3,
    expectedDiesel: 15,
    equipmentId: 6202,
    dieselSource: "plant_stock",
    openingDiesel: 100,
    dieselBalanceInTank: 95,
    dieselBalanceConfirmed: true,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
  {
    id: 6314,
    machine: "HISTORICAL TRIP",
    vehicleNo: "DPR02-OLD-TRIP",
    operator: "OLDER TRIP OPERATOR",
    entryType: "trip_based",
    startTime: "",
    endTime: "",
    openingReading: 100,
    closingReading: 106,
    hoursWorked: 6,
    diesel: 20,
    dieselNorm: 0.5,
    expectedDiesel: 20,
    equipmentId: 6206,
    dieselSource: "plant_stock",
    openingDiesel: 100,
    dieselBalanceInTank: 100,
    dieselBalanceConfirmed: true,
    numberOfTrips: 2,
    tripDistance: 20,
    totalKm: 40,
    breakdowns: [],
    activitySegments: [],
    activityAllocations: [],
  },
];

const historicalRecord = {
  id: 6301,
  date: "2026-08-05",
  site: site.name,
  engineer: "OLDER FIXTURE ENGINEER",
  role: "engineer",
  workType: "road",
  boqProjectId: 6251,
  dprStatus: "submitted",
  isSuperseded: false,
  lockStatus: "locked",
  progress: [],
  equipment: historicalRows,
  labour: [],
  materials: [],
  sitePurchases: [],
  structureItems: [],
  remarks: "Historical pre-existing DPR-02 fixture record. Not customer data.",
};

const siteEditRecord = {
  ...guidedRecord,
  id: 6252,
  dprStatus: "draft",
  remarks: "DPR-02 SiteEdit fixture. Not a customer DPR.",
};

const records: Record<number, any> = {
  [guidedRecord.id]: guidedRecord,
  [siteEditRecord.id]: siteEditRecord,
  [historicalRecord.id]: historicalRecord,
};

const fixtureState = {
  requests: [] as RequestRecord[],
  writes: [] as RequestRecord[],
};

declare global {
  interface Window {
    __Dpr02Fixture?: typeof fixtureState;
  }
}

window.__Dpr02Fixture = fixtureState;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

function requestDetails(input: RequestInfo | URL) {
  const request = typeof input === "object" && "method" in input ? input as Request : null;
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return {
    method: (request?.method || "GET").toUpperCase(),
    url: new URL(rawUrl, window.location.origin),
  };
}

function parseBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== "string") return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return undefined;
  }
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const body = parseBody(init);
  const path = url.pathname;
  const record = { method, path: `${path}${url.search}`, body };
  fixtureState.requests.push(record);
  if (method !== "GET") fixtureState.writes.push(record);

  if (path === "/api/config") return json({
    rmcEnabled: true,
    companyName: "DPR-02 browser fixture",
    companyShortName: "DPR",
    appTagline: "Isolated render evidence",
    logoFile: "",
    licensedModules: [],
  });
  if (path === "/api/sites") return json([site]);
  if (path === "/api/personnel") return json([]);
  if (path === "/api/plant-module/equipment") return json(equipment);
  if (path === "/api/attachments") return json([]);
  if (path === "/api/maintenance/logs") return json([]);
  if (path === "/api/equipment-usage/lifecycle") return json([]);
  if (path === "/api/plant-module/equipment-usage/open-today") return json([]);
  if (path === "/api/dprs/with-details") return json([]);
  if (/^\/api\/equipment\/\d+\/latest-(closing|confirmed-diesel-tank)$/.test(path)) {
    return json({ closingReading: null, dieselBalanceInTank: null, sourceDate: null, source: null });
  }

  const dprMatch = path.match(/^\/api\/dprs\/(\d+)$/);
  if (dprMatch && method === "GET") {
    const dpr = records[Number(dprMatch[1])];
    return dpr ? json(JSON.parse(JSON.stringify(dpr))) : json({ message: "DPR not found" }, 404);
  }

  if (path === "/api/boq/projects") {
    return json([{ id: 6251, name: "DPR-02 FIXTURE BOQ", siteId: site.id, itemCount: 0 }]);
  }
  if (/^\/api\/boq\/projects\/\d+\/(items|programme|earthwork-arrangements|bom|plan-vs-actual)$/.test(path)) {
    return json([]);
  }
  if (path.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

function FixtureNotice() {
  return (
    <header
      className="mx-auto mb-6 max-w-6xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="fixture-evidence-notice"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-02 isolated browser evidence
      </div>
      <h1 className="mt-1 text-xl font-semibold">Equipment log field and report fixture</h1>
      <p className="mt-1 text-sm">
        Real production DPR components use fixture-only API responses. This is not a
        customer DPR and performs no customer or production writes.
      </p>
    </header>
  );
}

function CalculationHarness() {
  const [rows, setRows] = React.useState([
    { ...guidedEquipment[0], id: 6411 },
    { ...guidedEquipment[1], id: 6412, openingReading: null, closingReading: null, startTime: "08:00", endTime: "11:00" },
    { ...guidedEquipment[2], id: 6413 },
    { ...guidedEquipment[3], id: 6414 },
    { ...guidedEquipment[4], id: 6415 },
  ]);
  return (
    <main className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-lg border bg-white p-4 shadow-sm" data-testid="dpr02-calculation-harness">
        <h2 className="text-lg font-semibold">DPR-02 meter/clock calculation harness</h2>
        <p className="text-sm text-muted-foreground">
          The rows below are the production DprEquipmentCompact component. Changes are
          local to this browser fixture.
        </p>
      </section>
      {rows.map((row, index) => (
        <section key={row.id} data-testid={`dpr02-harness-row-${index}`}>
          <DprEquipmentCompact
            row={row}
            equipment={equipment.find((master) => master.id === row.equipmentId)}
            index={index}
            onChange={(patch) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))}
          />
        </section>
      ))}
    </main>
  );
}

function FixtureApp() {
  const path = window.location.pathname;
  const content = path.startsWith("/guided")
    ? <GuidedDpr />
    : path.startsWith("/site/edit/")
      ? <SiteEdit />
      : path.startsWith("/site/report/")
        ? <SiteReport />
        : path.startsWith("/harness")
          ? <CalculationHarness />
          : <SiteEntry />;
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <FixtureNotice />
      <div className="mx-auto max-w-6xl">{content}</div>
    </main>
  );
}

let root: ReturnType<typeof createRoot> | null = null;
const mount = () => {
  queryClient.clear();
  root?.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(
    <QueryClientProvider client={queryClient}>
      <FixtureApp />
    </QueryClientProvider>,
  );
};

window.addEventListener("popstate", mount);
mount();