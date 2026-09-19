import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ScheduleRevisionActions } from "../../../client/src/pages/WorkProgramme";
import { PlanVsActualTable } from "../../../client/src/components/PlanVsActualTable";
import { queryClient } from "../../../client/src/lib/queryClient";
import "../../../client/src/index.css";

type RevisionPayload = {
  barId: number;
  payload: Record<string, unknown>;
};

type FixtureState = {
  previewPayloads: RevisionPayload[];
  commitPayloads: RevisionPayload[];
  previewTokens: string[];
};

const fixtureState: FixtureState = {
  previewPayloads: [],
  commitPayloads: [],
  previewTokens: [],
};

(window as Window & { __ScheduleRevisionFixture: FixtureState }).__ScheduleRevisionFixture = fixtureState;

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

const dateDiff = (start: string, end: string) => {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86400000);
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const parsed = new URL(url, window.location.origin);
  const match = parsed.pathname.match(/^\/api\/boq\/programme\/bars\/(\d+)\/(revision-preview|revise-schedule)$/);

  if (parsed.pathname === "/api/boq/projects/501/plan-vs-actual") {
    return json([{
      boqItemId: 1479,
      itemCode: "1.1",
      description: "Clearing and grubbing — two submitted 2400 Sqm DPR rows",
      unit: "Sqm",
      categoryName: "Site clearance",
      currentQty: 10000,
      totalPlanned: 4800,
      totalActual: 4800,
      percentComplete: 48,
      lastActivityDate: "2026-09-14",
      clientRate: 4.04,
      boqAmount: 40400,
      plannedAmount: 19392,
      actualAmount: 19392,
      actualIncomplete: false,
      conversionWarnings: ["Ignored stale conversion factor 0.0001: physical and contractual UOM are both Sqm"],
    }, {
      boqItemId: 1480,
      itemCode: "1.2",
      description: "Unresolved legacy physical UOM — review required",
      unit: "MT",
      categoryName: "Site clearance",
      currentQty: 100,
      totalPlanned: 25,
      // Server values are deliberately present to prove the UI does not show
      // a misleading partial zero/derived balance when credit is unresolved.
      totalActual: 0,
      percentComplete: 0,
      lastActivityDate: "2026-09-14",
      clientRate: 10,
      boqAmount: 1000,
      plannedAmount: 250,
      actualAmount: 0,
      actualIncomplete: true,
      conversionWarnings: ["BOQ credit requires an explicit Nos→MT conversion profile factor"],
    }]);
  }

  if (match) {
    const barId = Number(match[1]);
    const operation = match[2];
    const payload = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};

    if (operation === "revision-preview") {
      fixtureState.previewPayloads.push({ barId, payload });
      const token = `fixture-preview-${barId}-${fixtureState.previewPayloads.length}`;
      fixtureState.previewTokens.push(token);
      const beforeStart = barId === 105 ? "2026-01-01" : "2026-01-01";
      const beforeEnd = "2026-01-03";
      const afterStart = typeof payload.startDate === "string" ? payload.startDate : "2026-01-05";
      const afterEnd = typeof payload.endDate === "string" ? payload.endDate : beforeEnd;
      return json({
        previewToken: token,
        source: {
          before: { barId, startDate: beforeStart, endDate: beforeEnd },
          after: { barId, startDate: afterStart, endDate: afterEnd },
          executionState: barId === 105 ? "started" : "not_started",
          actualStartDate: barId === 105 ? "2026-01-05" : null,
        },
        deltaDays: dateDiff(beforeEnd, afterEnd),
        cascade: payload.cascade === true,
        shifted: [],
        notShifted: [],
      });
    }

    fixtureState.commitPayloads.push({ barId, payload });
    return json({ ok: true });
  }

  // The fixture never calls production APIs or writes customer data.
  if (parsed.pathname.startsWith("/api/")) return json([]);
  return originalFetch(input, init);
};

const makeBar = (id: number, executionState: "not_started" | "started", actualStartDate?: string) => ({
  id,
  itemCode: `WP01-${id}`,
  description: "Schedule revision fixture activity",
  reachLabel: "Fixture Reach",
  chainageFrom: 1,
  chainageTo: 2,
  side: "lhs",
  plannedQty: 3,
  unit: "days",
  startDate: "2026-01-01",
  endDate: "2026-01-03",
  executionState,
  ...(actualStartDate ? { actualStartDate } : {}),
  revisionHistory: [],
}) as any;

const scenarios = [
  {
    id: "a",
    title: "A · Start suggests finish",
    note: "Not started · Jan 1 → Jan 3 (3 calendar days)",
    bar: makeBar(101, "not_started"),
  },
  {
    id: "b",
    title: "B · Finish override remains editable",
    note: "Not started · change start to Jan 10, then override finish to Jan 15",
    bar: makeBar(102, "not_started"),
  },
  {
    id: "c",
    title: "C · Direct finish edit leaves start unchanged",
    note: "Not started · edit finish directly without changing start",
    bar: makeBar(103, "not_started"),
  },
  {
    id: "d",
    title: "D · Preview and commit payloads",
    note: "Not started · override Jan 15 with cascade enabled",
    bar: makeBar(104, "not_started"),
  },
  {
    id: "e",
    title: "E · Started bar locks actual start",
    note: "Started · actual start Jan 5; only finish may move",
    bar: makeBar(105, "started", "2026-01-05"),
  },
] as const;

function Fixture() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-6 text-slate-900">
      <header className="mx-auto mb-5 max-w-6xl rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">WP-01 isolated browser evidence</div>
        <h1 className="mt-1 text-xl font-semibold">Schedule revision actions</h1>
        <p className="mt-1 text-sm text-slate-600">
          Production ScheduleRevisionActions mounted directly. API responses and mutation payloads are held in this fixture only.
        </p>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-2">
        {scenarios.map((scenario) => (
          <section key={scenario.id} data-scenario={scenario.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{scenario.title}</h2>
                <p className="mt-1 text-xs text-slate-500">{scenario.note}</p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fixture</span>
            </div>
            <ScheduleRevisionActions bar={scenario.bar} projectId={501} />
          </section>
        ))}
      </div>
      <section className="mx-auto mt-5 max-w-6xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="task1479-work-programme-plan-actual">
        <h2 className="font-semibold">Work Programme · Plan vs Actual</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500">Two synthetic submitted DPR records: 2,400 Sqm + 2,400 Sqm at ₹4.04/Sqm.</p>
        <PlanVsActualTable projectId={501} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Fixture />
  </QueryClientProvider>,
);