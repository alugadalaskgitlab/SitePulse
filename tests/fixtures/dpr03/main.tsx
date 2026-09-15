import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import GuidedDpr from "../../../client/src/pages/GuidedDpr";
import SiteEntry from "../../../client/src/pages/SiteEntry";
import SiteReport from "../../../client/src/pages/SiteReport";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type RequestRecord = { method: string; path: string; body?: unknown };

const site = {
  id: 7300,
  name: "DPR-03 FIXTURE SITE",
  location: "Isolated browser evidence",
  isActive: 1,
};

const engineer = {
  id: 7301,
  name: "DPR-03 FIXTURE ENGINEER",
  role: "engineer",
  isActive: 1,
};

const equipment = [
  {
    id: 7302,
    name: "DPR03 INCIDENTAL JCB",
    registrationNumber: "DPR03-JCB-01",
    equipmentType: "JCB",
    ownership: "hired",
    vendorName: "DPR-03 FIXTURE CONTRACTOR",
    meterType: "hour_meter",
    consumptionNorm: 4,
    isActive: 1,
    fuelType: "Diesel",
  },
];

const boqItem = {
  id: 7303,
  itemCode: "BOQ-03-01",
  description: "Roadway excavation",
  displayName: "Roadway excavation",
  unit: "CUM",
};

const taskText = "CUT TRENCH / TOE DRAIN ALONG SITE ROAD — EXISTING IRRIGATION DRAIN COVERED";

const emptyEquipmentRow = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  machine: "DPR03 INCIDENTAL JCB",
  vehicleNo: "DPR03-JCB-01",
  operator: "DPR-03 FIXTURE OPERATOR",
  entryType: "daily",
  startTime: "",
  endTime: "",
  openingReading: null,
  closingReading: null,
  hoursWorked: null,
  diesel: 0,
  dieselNorm: 4,
  expectedDiesel: null,
  equipmentId: 7302,
  plantUsageId: null,
  dieselSource: "contractor",
  openingDiesel: null,
  dieselBalanceInTank: null,
  dieselBalanceConfirmed: null,
  numberOfTrips: null,
  tripDistance: null,
  totalKm: null,
  breakdowns: [],
  activitySegments: [],
  activityAllocations: [],
  ...overrides,
});

const boqSegment = {
  startTime: "08:00",
  endTime: "12:00",
  hoursWorked: 4,
  boqItems: [{ boqItemId: boqItem.id, programmeBarId: null }],
};

const baseRecord = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  date: "2026-09-15",
  site: site.name,
  engineer: engineer.name,
  role: "engineer",
  workType: "road",
  boqProjectId: 7304,
  dprStatus: "draft",
  isSuperseded: false,
  lockStatus: "unlocked",
  progress: [],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  structureItems: [],
  remarks: "DPR-03 isolated browser fixture. Not customer data.",
  ...overrides,
});

const persistedSavedPayload = (() => {
  try {
    const raw = sessionStorage.getItem("__dpr03-saved-payload");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const records: Record<number, any> = {
  // C: normal BOQ assignment, with no task text. This is an explicit
  // pre-seeded fixture row, not a customer DPR.
  7305: baseRecord(7305, {
    dprStatus: "submitted",
    lockStatus: "locked",
    remarks: "DPR-03 C BOQ-only fixture row. Not customer data.",
    equipment: [emptyEquipmentRow(7315, { activitySegments: [boqSegment], activityAllocations: undefined })],
  }),
  // D: BOQ assignment and incidental documentation are independent fields.
  7306: baseRecord(7306, {
    dprStatus: "submitted",
    lockStatus: "locked",
    remarks: "DPR-03 D combined fixture row. Not customer data.",
    equipment: [emptyEquipmentRow(7316, {
      task: taskText,
      activitySegments: [boqSegment],
      activityAllocations: undefined,
    })],
  }),
  // F: explicit legacy-shaped fixture sample used only to prove that a
  // previously stored equipmentLogs.task value is rendered. Its DRESSING
  // task literal matches the existing dpr-site-entry fixture's storedDpr
  // sample; this isolated record is still synthetic, not customer history.
  7307: baseRecord(7307, {
    date: "2026-08-05",
    dprStatus: "submitted",
    lockStatus: "locked",
    remarks: "DPR-03 explicit legacy task fixture row. Not existing customer data.",
    equipment: [emptyEquipmentRow(7317, {
      task: "DRESSING",
      activitySegments: undefined,
      activityAllocations: undefined,
    })],
  }),
};

const fixtureState = {
  requests: [] as RequestRecord[],
  writes: persistedSavedPayload ? [{
    method: "POST",
    path: "/api/dprs",
    body: persistedSavedPayload,
  }] as RequestRecord[] : [] as RequestRecord[],
  savedPayload: persistedSavedPayload as any,
};

if (persistedSavedPayload) {
  records[7308] = baseRecord(7308, {
    ...persistedSavedPayload,
    id: 7308,
    dprStatus: "draft",
    lockStatus: "unlocked",
    remarks: persistedSavedPayload.remarks || "DPR-03 saved task-only fixture row. Not customer data.",
  });
}

declare global {
  interface Window {
    __Dpr03Fixture?: typeof fixtureState;
  }
}

window.__Dpr03Fixture = fixtureState;

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

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

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
    companyName: "DPR-03 browser fixture",
    companyShortName: "DPR",
    appTagline: "Isolated incidental equipment evidence",
    logoFile: "",
    licensedModules: [],
  });
  if (path === "/api/sites") return json([site]);
  if (path === "/api/personnel") return json([engineer]);
  if (path === "/api/plant-module/equipment") return json(equipment);
  if (path === "/api/attachments") return json([]);
  if (path === "/api/maintenance/logs") return json([]);
  if (path === "/api/equipment-usage/lifecycle") return json([]);
  if (path === "/api/plant-module/equipment-usage/open-today") return json([]);
  if (path === "/api/dprs/with-details") return json([]);
  if (/^\/api\/equipment\/\d+\/latest-(closing|confirmed-diesel-tank)$/.test(path)) {
    return json({ closingReading: null, dieselBalanceInTank: null, sourceDate: null, source: null });
  }

  if (path === "/api/boq/projects") {
    return json([{ id: 7304, name: "DPR-03 FIXTURE BOQ", siteId: site.id, itemCount: 1 }]);
  }
  if (path === "/api/boq/projects/7304/items") return json([boqItem]);
  if (path === "/api/boq/projects/7304/programme") return json([]);
  if (path === "/api/boq/projects/7304/earthwork-arrangements") return json([]);
  if (path === "/api/boq/projects/7304/plan-vs-actual") return json([]);

  // The browser proof intentionally has exactly one non-GET request: the
  // fresh Guided Save Draft. Its response is immediately report-readable.
  if (path === "/api/dprs" && method === "POST") {
    const payload = clone(body ?? {});
    fixtureState.savedPayload = payload;
    try {
      sessionStorage.setItem("__dpr03-saved-payload", JSON.stringify(payload));
    } catch {
      // The in-memory request remains authoritative if session storage is unavailable.
    }
    const saved = baseRecord(7308, {
      ...payload,
      id: 7308,
      dprStatus: "draft",
      lockStatus: "unlocked",
      remarks: payload.remarks || "DPR-03 saved task-only fixture row. Not customer data.",
    });
    records[7308] = saved;
    return json({ id: saved.id, ...clone(saved) });
  }

  const dprMatch = path.match(/^\/api\/dprs\/(\d+)$/);
  if (dprMatch && method === "GET") {
    const dpr = records[Number(dprMatch[1])];
    return dpr ? json(clone(dpr)) : json({ message: "DPR not found" }, 404);
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
        DPR-03 isolated browser evidence
      </div>
      <h1 className="mt-1 text-xl font-semibold">Incidental equipment task fixture</h1>
      <p className="mt-1 text-sm">
        Production DPR components use fixture-only API responses. This is not
        customer data and performs no customer or production writes.
      </p>
    </header>
  );
}

function FixtureApp() {
  const path = window.location.pathname;
  const content = path.startsWith("/guided")
    ? <GuidedDpr />
    : path.startsWith("/site/report/")
      ? <SiteReport />
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