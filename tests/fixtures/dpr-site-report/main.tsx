import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import SiteReport from "../../../client/src/pages/SiteReport";
import SiteEdit from "../../../client/src/pages/SiteEdit";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

/*
 * DPR-01 browser evidence fixture
 *
 * The identifiers, dates, site/project relationship, assignment item IDs,
 * and time windows below are copied from the verified production observation
 * supplied with DPR-01.  This is not an authenticated live record.  Names for
 * personnel/operator fields are fixture-only values, and every response and
 * write is held in this browser's memory.
 */
const DECORATED_SITE =
  "TAKKADPALLY-SIRUR – Edited by Admin – 2026-09-14 20:50:27";
const BASE_SITE = "TAKKADPALLY-SIRUR";

const site = {
  id: 18,
  name: BASE_SITE,
  location: "Fixture location",
  isActive: 1,
};

const boqItems = [
  {
    id: 1,
    itemCode: "1",
    itemName: "clearing and grubbing",
    description: "clearing and grubbing",
    displayName: "clearing and grubbing",
    unit: "Ha",
    canonicalUnit: "Ha",
    includeInDpr: true,
    sortOrder: 1,
    planningWorkType: "road",
    dprMeasurementMethod: "SQM_LW",
  },
  {
    id: 3,
    itemCode: "3",
    itemName: "roadway excavation",
    description: "roadway excavation",
    displayName: "roadway excavation",
    unit: "CUM",
    canonicalUnit: "CUM",
    includeInDpr: true,
    sortOrder: 2,
    planningWorkType: "road",
    dprMeasurementMethod: "geometry",
  },
  {
    id: 4,
    itemCode: "4",
    itemName: "embankment - excavated earth",
    description: "embankment - excavated earth",
    displayName: "embankment - excavated earth",
    unit: "CUM",
    canonicalUnit: "CUM",
    includeInDpr: true,
    sortOrder: 3,
    planningWorkType: "road",
    dprMeasurementMethod: "geometry",
  },
];

const project = {
  id: 1,
  name: "TAKKADPALLY-SIRUR BOQ",
  siteId: site.id,
  status: "active",
  barCount: boqItems.length,
  itemCount: boqItems.length,
};

const equipmentMaster = {
  id: 913,
  name: "JCB",
  registrationNumber: "FIX-JCB-913",
  equipmentType: "Excavator",
  ownership: "owned",
  meterType: "hour_meter",
  consumptionNorm: 5,
  isActive: 1,
  fuelType: "Diesel",
};

type AssignmentItem = { boqItemId: number; programmeBarId: number | null };
type AssignmentSegment = {
  startTime: string;
  endTime: string;
  hoursWorked?: number;
  boqItems: AssignmentItem[];
};

const segment = (
  startTime: string,
  endTime: string,
  boqItemIds: number[],
): AssignmentSegment => ({
  startTime,
  endTime,
  hoursWorked: undefined,
  boqItems: boqItemIds.map((boqItemId) => ({ boqItemId, programmeBarId: null })),
});

const progressRow = (
  id: number,
  entryKey: string,
  activity: string,
  boqItemId: number,
  chainageFrom: string,
  chainageTo: string,
  quantity: number,
) => ({
  id,
  entryKey,
  activity,
  side: "LHS",
  chainageFrom,
  chainageTo,
  length: 100,
  width: 7,
  thickness: 0.2,
  quantity,
  uom: "CUM",
  noSiteWork: false,
  noSiteWorkDescription: "",
  personnelIds: [],
  boqItemId,
  programmeBarId: null,
  earthworkArrangementId: null,
  quantitySource: "measured",
  quantitySourceNote: "",
  chainageOverrideReason: "",
  executedBy: "hlc",
  layerNo: null,
  isIncidental: false,
  incidentalDescription: "",
  materialOutcome: null,
  reusableQty: null,
});

const equipmentRow = (
  id: number,
  startTime: string,
  endTime: string,
  activitySegments: AssignmentSegment[],
) => ({
  id,
  machine: "JCB",
  vehicleNo: "FIX-JCB-913",
  operator: "Fixture Operator",
  task: "Earthwork",
  entryType: "time_meter",
  startTime,
  endTime,
  openingReading: 900,
  closingReading: 938,
  hoursWorked: 7.7,
  diesel: 38.5,
  dieselNorm: 5,
  expectedDiesel: 38.5,
  equipmentId: equipmentMaster.id,
  plantUsageId: null,
  dieselSource: "contractor",
  openingDiesel: null,
  dieselBalanceInTank: null,
  dieselBalanceConfirmed: null,
  fuelStation: "",
  billNumber: "",
  amountPaid: null,
  numberOfTrips: null,
  tripDistance: null,
  totalKm: null,
  waterQuantity: null,
  boqItemId: null,
  structureId: null,
  breakdowns: [],
  activitySegments,
  activityAllocations: [],
});

type DprRecord = Record<string, any>;

/*
 * A — DPR 364 / log 913: the observed two-item assignment on segment 22.
 * B — DPR 362 / log 911: the observed single-item assignment.
 * C — DPR 363 / log 912: a fixture variation of the observed time window
 *     with two physical segments, intentionally distinct from an additional
 *     BOQ item on one segment.
 */
const dpr364: DprRecord = {
  id: 364,
  date: "2026-06-05",
  site: DECORATED_SITE,
  engineer: "DPR-01 Fixture Engineer",
  role: "engineer",
  submittedAt: "2026-06-05 18:00:00",
  createdAt: "2026-06-05T18:00:00.000Z",
  isSuperseded: false,
  lockStatus: "unlocked",
  dprStatus: "submitted",
  workType: "road",
  boqProjectId: 1,
  progress: [
    {
      ...progressRow(
        3641,
        "dpr01-364-progress-1",
        "roadway excavation",
        3,
        "22+000",
        "22+100",
        700,
      ),
      // SiteEdit's final-save readiness also asks for an excavation outcome.
      // This fixture-only completeness field is not part of the assignment
      // evidence and is never sent outside the in-memory adapter.
      materialOutcome: "fully_reusable",
      reusableQty: 700,
    },
  ],
  equipment: [equipmentRow(913, "09:00", "16:42", [segment("09:00", "16:42", [3, 4])])],
  labour: [],
  materials: [],
  sitePurchases: [],
  structureItems: [],
  remarks: "DPR-01 browser evidence fixture; not a customer record.",
};

const dpr362: DprRecord = {
  ...dpr364,
  id: 362,
  date: "2026-06-03",
  progress: [
    progressRow(
      3621,
      "dpr01-362-progress-1",
      "clearing and grubbing",
      1,
      "0+000",
      "0+100",
      700,
    ),
  ],
  equipment: [equipmentRow(911, "08:45", "16:45", [segment("08:45", "16:45", [1])])],
};

const dpr363: DprRecord = {
  ...dpr364,
  id: 363,
  date: "2026-06-04",
  progress: [
    progressRow(
      3631,
      "dpr01-363-progress-1",
      "roadway excavation",
      3,
      "22+000",
      "22+050",
      350,
    ),
    progressRow(
      3632,
      "dpr01-363-progress-2",
      "embankment - excavated earth",
      4,
      "22+050",
      "22+100",
      350,
    ),
  ],
  equipment: [
    equipmentRow(912, "08:50", "15:50", [
      segment("08:50", "12:00", [3]),
      segment("12:00", "15:50", [4]),
    ]),
  ],
};

const records: Record<number, DprRecord> = {
  362: dpr362,
  363: dpr363,
  364: dpr364,
};

type RequestRecord = {
  method: string;
  path: string;
  body?: unknown;
};

type FixtureState = {
  requests: RequestRecord[];
  boqProjectRequests: Array<{ siteId: string | null; path: string }>;
  boqItemsRequests: Array<{ projectId: string; path: string }>;
  normalizedSiteRequests: Array<{
    decoratedSite: string;
    normalizedSite: string;
    siteId: string;
  }>;
  versionPayloads: Array<{ id: number; payload: any }>;
  versionResponses: any[];
  toasts: unknown[];
  expectedDecoratedSite: string;
  expectedBaseSite: string;
};

const fixtureState: FixtureState = {
  requests: [],
  boqProjectRequests: [],
  boqItemsRequests: [],
  normalizedSiteRequests: [],
  versionPayloads: [],
  versionResponses: [],
  toasts: [],
  expectedDecoratedSite: DECORATED_SITE,
  expectedBaseSite: BASE_SITE,
};

declare global {
  interface Window {
    __DprSiteReportFixture?: FixtureState;
  }
}

window.__DprSiteReportFixture = fixtureState;

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const parseBody = (init?: RequestInit): any => {
  if (!init?.body || typeof init.body !== "string") return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return undefined;
  }
};

const requestDetails = (input: RequestInfo | URL): { method: string; url: URL } => {
  const request = typeof input === "object" && "method" in input
    ? input as Request
    : null;
  const rawUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  return {
    method: (request?.method || "GET").toUpperCase(),
    url: new URL(rawUrl, window.location.origin),
  };
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const recordFor = (id: number): DprRecord | undefined => records[id];

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const body = parseBody(init);
  const pathname = url.pathname;
  fixtureState.requests.push({ method, path: `${pathname}${url.search}`, body });

  if (pathname === "/api/config" && method === "GET") {
    return json({
      rmcEnabled: true,
      companyName: "DPR-01 browser fixture",
      companyShortName: "DPR",
      appTagline: "Isolated browser evidence",
      logoFile: "",
      licensedModules: [],
    });
  }
  if (pathname === "/api/sites" && method === "GET") return json([site]);
  if (pathname === "/api/personnel" && method === "GET") return json([]);
  if (pathname === "/api/plant-module/equipment" && method === "GET") {
    return json([equipmentMaster]);
  }
  if (pathname === "/api/attachments" && method === "GET") return json([]);
  if (pathname === "/api/audit-logs" && method === "GET") return json([]);
  if (pathname === "/api/equipment-usage/lifecycle" && method === "GET") return json([]);
  if (pathname === "/api/maintenance/logs" && method === "GET") return json([]);
  if (pathname === "/api/site-material-trips" && method === "GET") return json([]);
  if (pathname === "/api/dprs/with-details" && method === "GET") return json([]);
  if (pathname === "/api/dprs/chainage-overlap-context" && method === "GET") {
    return json({ entries: [] });
  }

  const dprMatch = pathname.match(/^\/api\/dprs\/(\d+)$/);
  if (dprMatch && method === "GET") {
    const record = recordFor(Number(dprMatch[1]));
    return record ? json(clone(record)) : json({ message: "DPR not found" }, 404);
  }

  if (pathname === "/api/boq/projects" && method === "GET") {
    const siteId = url.searchParams.get("siteId");
    fixtureState.boqProjectRequests.push({ siteId, path: `${pathname}${url.search}` });
    if (siteId === String(site.id)) {
      fixtureState.normalizedSiteRequests.push({
        decoratedSite: DECORATED_SITE,
        normalizedSite: BASE_SITE,
        siteId,
      });
    }
    // Deliberately do not return a project for null/wrong site IDs.  This
    // makes the screenshot and request assertions fail if the decorated DPR
    // site ever reaches the exact-match hook unchanged.
    return siteId === String(site.id) ? json([project]) : json([]);
  }

  const projectItemsMatch = pathname.match(/^\/api\/boq\/projects\/(\d+)\/items$/);
  if (projectItemsMatch && method === "GET") {
    fixtureState.boqItemsRequests.push({
      projectId: projectItemsMatch[1],
      path: `${pathname}${url.search}`,
    });
    return projectItemsMatch[1] === String(project.id) ? json(boqItems) : json([]);
  }

  const earthworkMatch = pathname.match(
    /^\/api\/boq\/projects\/(\d+)\/earthwork-arrangements$/,
  );
  if (earthworkMatch && method === "GET") return json([]);

  const versionMatch = pathname.match(/^\/api\/dprs\/(\d+)\/version$/);
  if (versionMatch && method === "POST") {
    const sourceId = Number(versionMatch[1]);
    const source = recordFor(sourceId);
    const payload = body || {};
    fixtureState.versionPayloads.push({ id: sourceId, payload: clone(payload) });
    const data = payload.data || payload;
    const sourceEquipment = source?.equipment || [];
    const equipment = (data.equipment || []).map((row: any, index: number) => ({
      ...(sourceEquipment[index] || {}),
      ...row,
      // The real version path preserves untouched assignments server-side
      // when SiteEdit intentionally omits them from an unchanged payload.
      activitySegments: row.activitySegments ?? sourceEquipment[index]?.activitySegments,
      activityAllocations: row.activityAllocations ?? sourceEquipment[index]?.activityAllocations,
    }));
    const version = {
      ...(source || {}),
      ...data,
      id: 1364,
      equipment,
      dprStatus: "submitted",
    };
    fixtureState.versionResponses.push(clone(version));
    return json(version, 201);
  }

  // The fixture must never issue a production write.  The version branch
  // above is the only mutation route used by the D edit evidence and it is
  // entirely in-memory.
  if (pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

function FixtureNotice() {
  const scenario = new URLSearchParams(window.location.search).get("scenario");
  const route = window.location.pathname.startsWith("/site/edit/")
    ? "SiteEdit"
    : "SiteReport";
  return (
    <header
      className="mx-auto mb-6 max-w-6xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="fixture-evidence-notice"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-01 isolated browser evidence · {route}
      </div>
      <h1 className="mt-1 text-xl font-semibold">BOQ Work Assignment display fixture</h1>
      <p className="mt-1 text-sm">
        Real production SiteReport/SiteEdit components are mounted with fixture-only
        API responses. Data is derived from the verified DPR shape; this is not an
        authenticated live record and it performs no customer or production writes.
      </p>
      {scenario === "second-physical-segment" && (
        <p className="mt-2 text-xs font-semibold">
          Derived fixture variation: two physical time segments (not an additional
          BOQ item on one segment).
        </p>
      )}
    </header>
  );
}

function FixtureApp() {
  const isEdit = window.location.pathname.startsWith("/site/edit/");
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 sm:px-6">
      <FixtureNotice />
      <div className="mx-auto max-w-6xl">
        {isEdit ? <SiteEdit /> : <SiteReport />}
      </div>
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