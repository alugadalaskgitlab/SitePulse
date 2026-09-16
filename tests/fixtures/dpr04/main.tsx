import * as React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "wouter";
import GuidedDpr from "../../../client/src/pages/GuidedDpr";
import SiteEdit from "../../../client/src/pages/SiteEdit";
import SiteReport from "../../../client/src/pages/SiteReport";
import SiteSuccess from "../../../client/src/pages/SiteSuccess";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type RequestRecord = {
  method: string;
  path: string;
  route: string;
  body?: unknown;
};

/*
 * DPR-04 browser evidence deliberately uses a decorated-but-exact site value
 * and two projects in the API order. Project B is first to make accidental
 * "first row" selection visible; a draft's persisted project A must win.
 * Every value here is synthetic fixture data, not a customer record.
 */
const site = {
  id: 8400,
  name: "TAKKADPALLY-SIRUR",
  location: "DPR-04 isolated browser evidence",
  isActive: 1,
};

const engineer = {
  id: 8401,
  name: "DPR-04 FIXTURE ENGINEER",
  role: "engineer",
  isActive: 1,
};

const projectA = {
  id: 8410,
  name: "DPR-04 PROJECT A — BODAPALLY DRAIN",
  siteId: site.id,
  status: "active",
  barCount: 1,
  itemCount: 1,
};

const projectB = {
  id: 8420,
  name: "DPR-04 PROJECT B — PREFERRED-LIST DISTRACTOR",
  siteId: site.id,
  status: "active",
  // B is an active project with programme work and is deliberately first in
  // the response. A local preference must therefore be observable: without
  // the restored A preference this route would load B.
  barCount: 1,
  itemCount: 1,
};

const projectAItem = {
  id: 8430,
  itemCode: "A-01",
  itemName: "SIDE DRAIN RESTORATION AT BODAPALLY VILLAGE",
  description: "SIDE DRAIN RESTORATION AT BODAPALLY VILLAGE",
  displayName: "SIDE DRAIN RESTORATION AT BODAPALLY VILLAGE",
  unit: "RMT",
  canonicalUnit: "RMT",
  includeInDpr: true,
  sortOrder: 1,
  planningWorkType: "road",
  dprMeasurementMethod: "RMT",
};

const projectBItem = {
  id: 8440,
  itemCode: "B-01",
  itemName: "PROJECT B DISTRACTOR ITEM",
  description: "PROJECT B DISTRACTOR ITEM",
  displayName: "PROJECT B DISTRACTOR ITEM",
  unit: "RMT",
  canonicalUnit: "RMT",
  includeInDpr: true,
  sortOrder: 1,
  planningWorkType: "road",
  dprMeasurementMethod: "RMT",
};

const noSiteWorkProgress = (
  activity: string,
  description: string,
  entryKey: string,
) => ({
  id: 8450,
  entryKey,
  activity,
  side: "",
  chainageFrom: "",
  chainageTo: "",
  length: null,
  width: null,
  thickness: null,
  quantity: null,
  uom: "RMT",
  noSiteWork: true,
  noSiteWorkDescription: description,
  personnelIds: [],
  boqItemId: null,
  programmeBarId: null,
  earthworkArrangementId: null,
  quantitySource: null,
  quantitySourceNote: null,
  chainageOverrideReason: null,
  executedBy: null,
  isIncidental: false,
  incidentalDescription: "",
});

const baseRecord = (
  id: number,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  date: "2026-09-15",
  site: site.name,
  engineer: `${engineer.name.toUpperCase()} - ${engineer.role.toUpperCase()}`,
  role: "engineer",
  workType: "road",
  boqProjectId: projectA.id,
  dprStatus: "draft",
  isSuperseded: false,
  lockStatus: "unlocked",
  progress: [],
  equipment: [],
  labour: [],
  materials: [],
  sitePurchases: [],
  structureItems: [],
  remarks: "DPR-04 isolated browser fixture. Not customer data.",
  ...overrides,
});

const records: Record<number, any> = {
  // A: a server draft whose persisted project is A. The browser will also
  // restore a local Guided blob for this same draft.
  8460: baseRecord(8460, {
    progress: [noSiteWorkProgress(
      "SERVER DRAFT A",
      "Server-side draft baseline; local autosave should replace this row.",
      "server-a",
    )],
    remarks: "SERVER DRAFT A — fixture baseline",
  }),
  // D: a separate draft used only by the Detailed editor save proof.
  8461: baseRecord(8461, {
    progress: [noSiteWorkProgress(
      "EDIT DRAFT ACTIVITY",
      "EDIT DRAFT BASELINE",
      "edit-draft",
    )],
    remarks: "D EDIT DRAFT fixture baseline",
  }),
  // B: an existing server draft. The verifier submits this exact id through
  // POST /api/dprs/:id/submit (never the new-DPR create route).
  8463: baseRecord(8463, {
    progress: [],
    remarks: "B EXISTING DRAFT fixture baseline",
  }),
  // E: same site/project relationship, with the response narrowed to one
  // project by the fixture's ?scenario=single-project query.
  8462: baseRecord(8462, {
    dprStatus: "submitted",
    lockStatus: "locked",
    progress: [noSiteWorkProgress(
      "SINGLE PROJECT REPORT",
      "Single-project fallback fixture.",
      "single-project",
    )],
    remarks: "E SINGLE PROJECT fixture row",
  }),
};

const persistedLogs = (() => {
  try {
    const raw = sessionStorage.getItem("__dpr04-fixture-log");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

const fixtureState = {
  requests: (persistedLogs?.requests ?? []) as RequestRecord[],
  writes: (persistedLogs?.writes ?? []) as RequestRecord[],
  loadedDrafts: (persistedLogs?.loadedDrafts ?? []) as Array<{
    id: number;
    boqProjectId: number | null;
    site: string;
    progressCount: number;
  }>,
  projectResponses: (persistedLogs?.projectResponses ?? []) as Array<{
    route: string;
    siteId: string | null;
    projectIds: number[];
    scenario: string | null;
  }>,
  itemRequests: (persistedLogs?.itemRequests ?? []) as Array<{
    route: string;
    projectId: number;
    scenario: string | null;
  }>,
  persistedPayloads: (persistedLogs?.persistedPayloads ?? []) as Array<{
    method: string;
    path: string;
    id: number | null;
    body: any;
  }>,
  expectedSite: site,
  projectAId: projectA.id,
  projectBId: projectB.id,
  customerWrites: false,
};

const persistFixtureLogs = () => {
  try {
    sessionStorage.setItem("__dpr04-fixture-log", JSON.stringify({
      requests: fixtureState.requests,
      writes: fixtureState.writes,
      loadedDrafts: fixtureState.loadedDrafts,
      projectResponses: fixtureState.projectResponses,
      itemRequests: fixtureState.itemRequests,
      persistedPayloads: fixtureState.persistedPayloads,
    }));
  } catch {
    // Evidence is still available from the current document if storage is
    // unavailable; the fixture never falls back to a network write.
  }
};

declare global {
  interface Window {
    __Dpr04Fixture?: typeof fixtureState;
    __Dpr04ClearBoqQueries?: () => void;
    __Dpr04ResetLogs?: () => void;
  }
}

window.__Dpr04Fixture = fixtureState;
window.__Dpr04ClearBoqQueries = () => {
  queryClient.removeQueries({ queryKey: ["/api/boq/projects"] });
};
window.__Dpr04ResetLogs = () => {
  fixtureState.requests.length = 0;
  fixtureState.writes.length = 0;
  fixtureState.loadedDrafts.length = 0;
  fixtureState.projectResponses.length = 0;
  fixtureState.itemRequests.length = 0;
  fixtureState.persistedPayloads.length = 0;
  try { sessionStorage.removeItem("__dpr04-fixture-log"); } catch {}
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function requestDetails(input: RequestInfo | URL) {
  const request = typeof input === "object" && "method" in input
    ? input as Request
    : null;
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

function scenario() {
  return new URLSearchParams(window.location.search).get("scenario");
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const { url, method: inputMethod } = requestDetails(input);
  const method = (init?.method || inputMethod).toUpperCase();
  const body = parseBody(init);
  const path = url.pathname;
  const route = `${window.location.pathname}${window.location.search}`;
  const request = { method, path: `${path}${url.search}`, route, body };
  fixtureState.requests.push(request);
  if (method !== "GET") fixtureState.writes.push(request);
  persistFixtureLogs();

  if (path === "/api/config") return json({
    rmcEnabled: true,
    companyName: "DPR-04 browser fixture",
    companyShortName: "DPR",
    appTagline: "Isolated draft/project evidence",
    logoFile: "",
    licensedModules: [],
  });
  if (path === "/api/sites") return json([site]);
  if (path === "/api/personnel") return json([engineer]);
  if (path === "/api/plant-module/equipment") return json([]);
  if (path === "/api/attachments") return json([]);
  if (path === "/api/audit-logs") return json([]);
  if (path === "/api/maintenance/logs") return json([]);
  if (path === "/api/equipment-usage/lifecycle") return json([]);
  if (path === "/api/plant-module/equipment-usage/open-today") return json([]);
  if (path === "/api/dprs/with-details") return json([]);
  if (path === "/api/dpr/programme-bars") return json([]);
  if (/^\/api\/equipment\/\d+\/latest-(closing|confirmed-diesel-tank)$/.test(path)) {
    return json({ closingReading: null, dieselBalanceInTank: null, sourceDate: null, source: null });
  }

  const dprMatch = path.match(/^\/api\/dprs\/(\d+)$/);
  if (dprMatch && method === "GET") {
    const id = Number(dprMatch[1]);
    const dpr = records[id];
    if (dpr) {
      fixtureState.loadedDrafts.push({
        id,
        boqProjectId: dpr.boqProjectId ?? null,
        site: dpr.site,
        progressCount: Array.isArray(dpr.progress) ? dpr.progress.length : 0,
      });
      persistFixtureLogs();
    }
    return dpr ? json(clone(dpr)) : json({ message: "DPR not found" }, 404);
  }

  if (path === "/api/boq/projects" && method === "GET") {
    const siteId = url.searchParams.get("siteId");
    const single = scenario() === "single-project";
    const projects = siteId === String(site.id)
      ? (single ? [projectA] : [projectB, projectA])
      : [];
    fixtureState.projectResponses.push({
      route,
      siteId,
      projectIds: projects.map((project) => project.id),
      scenario: scenario(),
    });
    persistFixtureLogs();
    return json(projects);
  }

  const itemMatch = path.match(/^\/api\/boq\/projects\/(\d+)\/items$/);
  if (itemMatch && method === "GET") {
    const projectId = Number(itemMatch[1]);
    fixtureState.itemRequests.push({ route, projectId, scenario: scenario() });
    persistFixtureLogs();
    if (projectId === projectA.id) return json([projectAItem]);
    if (projectId === projectB.id) return json([projectBItem]);
    return json([]);
  }

  if (/^\/api\/boq\/projects\/\d+\/(programme|earthwork-arrangements|plan-vs-actual)$/.test(path)) {
    return json([]);
  }

  if (path === "/api/dprs" && method === "POST") {
    const payload = clone(body ?? {});
    const id = 8464;
    const submitted = baseRecord(id, {
      ...payload,
      id,
      boqProjectId: payload.boqProjectId ?? projectA.id,
      dprStatus: "submitted",
      lockStatus: "locked",
      submittedAt: "2026-09-15 18:00:00",
      remarks: payload.remarks || "B submitted DPR-04 fixture row",
    });
    records[id] = submitted;
    fixtureState.persistedPayloads.push({ method, path, id, body: payload });
    persistFixtureLogs();
    return json({ id, ...clone(submitted) }, 201);
  }

  const draftMatch = path.match(/^\/api\/dprs\/(\d+)\/draft$/);
  if (draftMatch && method === "PATCH") {
    const id = Number(draftMatch[1]);
    const payload = clone(body ?? {});
    const current = records[id] ?? baseRecord(id);
    records[id] = {
      ...current,
      ...payload,
      id,
      boqProjectId: payload.boqProjectId ?? current.boqProjectId ?? projectA.id,
      dprStatus: "draft",
      lockStatus: "unlocked",
    };
    fixtureState.persistedPayloads.push({ method, path, id, body: payload });
    persistFixtureLogs();
    return json(clone(records[id]));
  }

  const submitMatch = path.match(/^\/api\/dprs\/(\d+)\/submit$/);
  if (submitMatch && method === "POST") {
    const id = Number(submitMatch[1]);
    const payload = clone(body ?? {});
    const current = records[id] ?? baseRecord(id);
    records[id] = {
      ...current,
      ...payload,
      id,
      dprStatus: "submitted",
      lockStatus: "locked",
      boqProjectId: payload.boqProjectId ?? current.boqProjectId ?? projectA.id,
    };
    fixtureState.persistedPayloads.push({ method, path, id, body: payload });
    persistFixtureLogs();
    return json(clone(records[id]));
  }

  // No fixture route may fall through to a production API. Unknown API
  // requests are explicit empty fixture responses, never customer writes.
  if (path.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

function FixtureNotice() {
  const [location] = useLocation();
  const route = location.startsWith("/site/edit/")
    ? "SiteEdit"
    : location.startsWith("/site/report/")
      ? "SiteReport"
      : location.startsWith("/site/success/")
        ? "SiteSuccess"
        : "GuidedDpr";
  return (
    <header
      className="mx-auto mb-6 max-w-6xl rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
      data-testid="fixture-evidence-notice"
    >
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
        DPR-04 isolated browser evidence · {route}
      </div>
      <h1 className="mt-1 text-xl font-semibold">Draft/project resolution fixture</h1>
      <p className="mt-1 text-sm">
        Production DPR components use fixture-only API responses. This is synthetic
        evidence and performs no customer or production writes.
      </p>
    </header>
  );
}

function FixtureApp() {
  const [location] = useLocation();
  const content = location.startsWith("/guided") || location.startsWith("/site/guided")
    ? <GuidedDpr />
    : location.startsWith("/site/edit/")
      ? <SiteEdit />
      : location.startsWith("/site/report/")
        ? <SiteReport />
        : location.startsWith("/site/success/")
          ? <SiteSuccess />
          : <GuidedDpr />;
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