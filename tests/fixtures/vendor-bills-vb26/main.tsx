import { createRoot } from "react-dom/client";
import {
  buildBillingDailyRows,
  buildEquipmentHirePeriodTotals,
  EquipmentHireDailyTable,
} from "../../../client/src/components/vendor-bills/EquipmentHireBillOutput";
import type { EquipmentPerformanceDailyRow, EquipmentPerformanceEvent } from "@shared/equipmentPerformance";
import "../../../client/src/index.css";

const event = (task: string, trips = 0) => ({ task, trips } as EquipmentPerformanceEvent);
const row = (
  key: string,
  date: string,
  unit: "L/hr" | "L/km",
  expectedDiesel: number,
  confirmed: boolean,
  tasks: string[],
): EquipmentPerformanceDailyRow => ({
  key,
  date,
  projectSite: unit === "L/hr" ? "Synthetic North Works" : "Synthetic Haul Road",
  openingMeter: unit === "L/hr" ? 100 : 2000,
  closingMeter: unit === "L/hr" ? 108 : 2040,
  workingHours: unit === "L/hr" ? 8 : null,
  workingHoursIncomplete: false,
  startTime: "08:00",
  endTime: "16:00",
  multipleTimeSegments: tasks.length > 1,
  clockDuration: 8,
  clockDurationIncomplete: false,
  dieselIssued: confirmed ? 20 : 8.5,
  openingTank: confirmed ? 30 : 0,
  closingTank: confirmed ? 25 : 8.5,
  dieselConsumed: confirmed ? 25 : null,
  expectedDiesel,
  difference: confirmed ? 25 - expectedDiesel : null,
  consumptionRate: confirmed ? (unit === "L/hr" ? 3.125 : 0.625) : null,
  consumptionRateUnit: unit,
  consumptionIncomplete: !confirmed,
  events: tasks.map(task => event(task)),
});

const owned = buildBillingDailyRows([
  row("owned-unconfirmed", "2026-10-01", "L/hr", 24, false, ["Earth cutting", "Shoulder grading", "Earth cutting"]),
  row("owned-confirmed", "2026-10-02", "L/hr", 24, true, ["Drain excavation"]),
], "2026-10-01", "2026-10-03");
const hired = buildBillingDailyRows([
  row("hired-unconfirmed", "2026-10-01", "L/km", 8, false, ["Aggregate haulage", "Return material"]),
  row("hired-confirmed", "2026-10-02", "L/km", 8, true, ["Aggregate haulage"]),
], "2026-10-01", "2026-10-03");

function FixtureSection({ title, rows, norm, meterType }: { title: string; rows: typeof owned; norm: number; meterType: string }) {
  const totals = buildEquipmentHirePeriodTotals(rows);
  return <section className="space-y-2 rounded-lg border bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="rounded bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-900" data-testid="period-expected">
        Period Expected: {totals.expectedDiesel} L
      </div>
    </div>
    <EquipmentHireDailyTable rows={rows} dieselResponsibility="hlc" consumptionNorm={norm} meterType={meterType} />
  </section>;
}

createRoot(document.getElementById("root")!).render(
  <main className="min-h-screen space-y-4 bg-slate-100 p-4">
    <div className="rounded border-2 border-fuchsia-500 bg-fuchsia-50 px-4 py-2 text-sm font-bold text-fuchsia-900" data-testid="fixture-label">
      VB-26 SYNTHETIC ACCEPTANCE FIXTURE — OWNED + HIRED / HR + KM / NO LIVE DATA OR WRITES
    </div>
    <FixtureSection title="OWNED · Hour meter · Norm 3 L/Hr · SYNTHETIC DATA" rows={owned} norm={3} meterType="hour_meter" />
    <FixtureSection title="HIRED · Odometer · Norm 0.2 L/Km · SYNTHETIC DATA" rows={hired} norm={0.2} meterType="odometer" />
  </main>,
);