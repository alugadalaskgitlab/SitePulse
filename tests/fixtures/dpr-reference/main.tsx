import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch } from "wouter";
import SiteDashboard from "../../../client/src/pages/SiteDashboard";
import SiteReport from "../../../client/src/pages/SiteReport";
import DprDetails from "../../../client/src/pages/DprDetails";
import { ChainageOverlapWarning } from "../../../client/src/components/ChainageOverlapGuard";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

const sites = [
  { id: 82, name: "REFERENCE NORTH", location: "Fixture", isActive: 1 },
  { id: 83, name: "REFERENCE SOUTH", location: "Fixture", isActive: 1 },
];

const progress = (id: number, activity: string) => ({
  id,
  entryKey: `fixture-${id}`,
  activity,
  side: "LHS",
  chainageFrom: "1+000",
  chainageTo: "1+100",
  chainageFromKm: 1,
  chainageToKm: 1.1,
  length: 100,
  width: 7,
  thickness: 0.2,
  quantity: 140,
  uom: "CUM",
  boqItemId: null,
  programmeBarId: null,
  earthworkArrangementId: null,
  quantitySource: "measured",
  quantitySourceNote: "",
  chainageOverrideReason: "",
  personnelIds: [],
});

const record = (id: number, site: string, status: string, activity: string, extra = {}) => ({
  id,
  date: id === 338 ? "2026-08-01" : id === 349 ? "2026-08-02" : "2026-08-03",
  site,
  engineer: "Reference Fixture Engineer",
  role: "engineer",
  submittedAt: status === "draft" ? null : "2026-08-02T17:00:00.000Z",
  createdAt: "2026-08-01T08:00:00.000Z",
  dprStatus: status,
  workType: "road",
  isSuperseded: false,
  isCancelled: false,
  isDeleted: false,
  lockStatus: status === "draft" ? "unlocked" : "locked",
  boqProjectId: null,
  progress: [progress(id * 10, activity)],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  structureItems: [],
  remarks: `Isolated DPR reference fixture record ${id}.`,
  ...extra,
});

const records: Record<number, any> = {
  338: record(338, sites[0].name, "draft", "Draft excavation"),
  349: record(349, sites[0].name, "submitted", "Corrected excavation", {
    originalDprId: 338,
    versionOfId: 338,
    correctionReason: "Fixture correction",
  }),
  350: record(350, sites[1].name, "submitted", "South embankment"),
};

const fixtureState = {
  requests: [] as Array<{ method: string; path: string }>,
  writes: [] as Array<{ method: string; path: string }>,
};

declare global {
  interface Window {
    __DprReferenceFixture?: typeof fixtureState;
  }
}
window.__DprReferenceFixture = fixtureState;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const requestMethod = typeof input === "object" && "method" in input ? input.method : "GET";
  const method = (init?.method || requestMethod || "GET").toUpperCase();
  const url = new URL(raw, window.location.origin);
  const path = `${url.pathname}${url.search}`;
  fixtureState.requests.push({ method, path });
  if (method !== "GET") fixtureState.writes.push({ method, path });

  if (url.pathname === "/api/config") return json({
    rmcEnabled: true,
    companyName: "DPR Reference Fixture",
    companyShortName: "DPR",
    appTagline: "Isolated browser evidence",
    logoFile: "",
    licensedModules: [],
  });
  if (url.pathname === "/api/dprs/with-details") return json(Object.values(records));
  if (url.pathname === "/api/sites") return json(sites);
  if (url.pathname === "/api/personnel") return json([]);
  if (url.pathname === "/api/materials/suppliers") return json([]);
  if (url.pathname === "/api/plant-module/equipment") return json([]);
  if (url.pathname === "/api/attachments" || url.pathname === "/api/attachments/counts") return json(url.pathname.endsWith("counts") ? {} : []);
  if (url.pathname === "/api/audit-logs") return json([]);
  if (url.pathname === "/api/maintenance/logs") return json([]);
  if (url.pathname === "/api/equipment-usage/lifecycle") return json([]);
  if (url.pathname === "/api/site-material-trips") return json([]);
  if (url.pathname === "/api/boq/projects") return json([]);
  if (/^\/api\/boq\/projects\/\d+\//.test(url.pathname)) return json([]);
  const match = url.pathname.match(/^\/api\/dprs\/(\d+)$/);
  if (match && method === "GET") {
    const item = records[Number(match[1])];
    return item ? json(JSON.parse(JSON.stringify(item))) : json({ message: "Not found" }, 404);
  }
  if (url.pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

function FixtureNotice() {
  return (
    <header className="mx-auto mb-5 max-w-6xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" data-testid="fixture-host">
      <strong>DPR reference isolated browser fixture</strong>
      <p className="text-sm">Real production components; synthetic fetch responses; no database writes.</p>
    </header>
  );
}

function OverlapHarness() {
  return (
    <section className="mx-auto max-w-3xl rounded-lg border bg-white p-4" data-testid="overlap-host">
      <h1 className="mb-3 text-xl font-semibold">Live entry host remains mounted</h1>
      <input defaultValue="Host value retained" data-testid="host-retained-value" className="mb-3 w-full rounded border p-2" />
      <ChainageOverlapWarning
        hits={[{
          source: "prior_dpr",
          kind: "exact",
          withDprId: 349,
          withEntryId: 3490,
          withDprDate: "2026-08-02",
          withSide: "LHS",
          withFromKm: 1,
          withToKm: 1.1,
          withQuantity: 140,
          withUom: "CUM",
          segmentFromKm: 1,
          segmentToKm: 1.1,
        } as any]}
        overrideReason=""
        onOverrideReason={() => undefined}
        testidPrefix="reference-fixture"
      />
    </section>
  );
}

function FixtureApp() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-5 text-slate-900 sm:px-6">
      <FixtureNotice />
      <Switch>
        <Route path="/site/reports" component={SiteDashboard} />
        <Route path="/site/report/:id" component={SiteReport} />
        <Route path="/dpr/:id" component={DprDetails} />
        <Route path="/overlap" component={OverlapHarness} />
        <Route><SiteDashboard /></Route>
      </Switch>
    </main>
  );
}

queryClient.clear();
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <FixtureApp />
  </QueryClientProvider>,
);