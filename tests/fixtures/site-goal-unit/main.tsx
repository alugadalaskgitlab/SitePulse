import { createRoot } from "react-dom/client";
import { buildSiteGoalRows, SiteGoalRows } from "../../../client/src/pages/FieldHome";
import type { PlanVsActualRow } from "../../../shared/schema";
import "../../../client/src/index.css";

const base: PlanVsActualRow = {
  boqItemId: 1481,
  itemCode: "1.01",
  description: "Clearing and grubbing",
  unit: "Sqm",
  categoryName: "Site clearance",
  currentQty: 10_000,
  totalPlanned: 4_000,
  totalActual: 4_800,
  percentComplete: 48,
  lastActivityDate: "2026-03-18",
  clientRate: 4.04,
  boqAmount: 40_400,
  plannedAmount: 16_160,
  actualAmount: 19_392,
  actualIncomplete: false,
  conversionWarnings: [],
};

const rows = buildSiteGoalRows([
  base,
  {
    ...base,
    boqItemId: 1482,
    description: "Genuine hectare contract item",
    unit: "Ha",
    currentQty: 1,
    totalPlanned: 0.4,
    totalActual: 0.48,
    percentComplete: 48,
    boqAmount: 4.04,
    plannedAmount: 1.616,
    actualAmount: 1.9392,
  },
  {
    ...base,
    boqItemId: 1483,
    description: "Valid same-unit warning",
    conversionWarnings: ["Ignored stale conversion factor 0.0001"],
  },
  {
    ...base,
    boqItemId: 1484,
    description: "Unresolved physical evidence",
    unit: "MT",
    totalPlanned: 0,
    totalActual: null,
    percentComplete: null,
    plannedAmount: 0,
    actualAmount: null,
    actualIncomplete: true,
    conversionWarnings: ["CUM→MT requires an explicit conversion profile factor"],
  },
]);

function Fixture() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <section className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <header className="border-b border-gray-100 px-4 py-3">
          <h1 className="text-sm font-bold text-gray-900">Today's Site Goal</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            Cumulative programme plan through the current month vs completed to date
          </p>
        </header>
        <SiteGoalRows rows={rows} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);