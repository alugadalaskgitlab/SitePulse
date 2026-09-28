import { Droplets, Fuel, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Static example of the read-only DprEquipmentCompact view, not computed usage.
const row = {
  machine: "Vibratory Roller",
  vehicleNo: "MH 12 AB 4821",
  operator: "R. Patil",
  entryType: "owned",
  usageStatus: "working",
  openingReading: 1284.5,
  closingReading: 1292.5,
  startTime: "09:00",
  endTime: "18:00",
  hoursWorked: 8,
  diesel: 24,
  dieselSource: "plant_stock",
  openingDiesel: 50,
  dieselBalanceInTank: 26,
  dieselBalanceConfirmed: true,
  expectedDiesel: 22.4,
  task: "Shoulder repair outside BOQ scope",
};

const dash = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
const number = (value: number | null | undefined, decimals = 2) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(decimals);

function Detail({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0">
    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</div>
    <div className={`text-sm tabular-nums sm:text-[15px] ${emphasis ? "font-bold text-slate-950 dark:text-slate-50" : "font-medium text-slate-700 dark:text-slate-200"}`}>{value}</div>
  </div>;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">{children}</div>;
}

export function EquipmentViewSource() {
  const clockHours = 9;
  const meterHours = row.closingReading - row.openingReading;
  // These are explicitly sample display values; production computes rates from usage and norms.
  const fuel = { actualConsumed: 48, expectedDiesel: row.expectedDiesel, variance: 25.6, actualRate: 6 };
  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,.055)] dark:border-slate-700 dark:bg-slate-900/50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400"><Gauge className="h-4 w-4" /></span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-[0.03em] text-slate-950 dark:text-slate-50 sm:text-base">{dash(row.machine)}</div>
            <div className="truncate text-xs font-medium text-slate-500">{dash(row.vehicleNo)} · {row.operator} · Machine day 1</div>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">Working</Badge>
      </header>
      <div className="grid divide-y divide-slate-200 dark:divide-slate-700 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <section className="p-4"><SectionHeading>Equipment</SectionHeading><div className="grid grid-cols-2 gap-4">
          <Detail label="Machine" value={dash(row.machine)} emphasis />
          <Detail label="Registration / equipment no." value={dash(row.vehicleNo)} />
          <Detail label="Operator" value={dash(row.operator)} />
          <Detail label="Entry / Hire Type" value={dash(row.entryType).replaceAll("_", " ")} />
          <Detail label="Daily Status" value={row.usageStatus.replaceAll("_", " ")} emphasis />
        </div></section>
        <section className="p-4"><SectionHeading>Usage Start</SectionHeading><div className="grid grid-cols-2 gap-4">
          <Detail label="Opening Meter" value={dash(row.openingReading)} />
          <Detail label="Start Time" value={row.startTime} emphasis />
        </div></section>
        <section className="p-4"><SectionHeading>Usage End</SectionHeading><div className="grid grid-cols-2 gap-4">
          <Detail label="Closing Meter" value={dash(row.closingReading)} />
          <Detail label="End Time" value={row.endTime} emphasis />
          <Detail label="Meter Working Hours" value={`${number(meterHours)} h`} emphasis />
          <Detail label="Clock Duration" value={`${number(clockHours)} h`} emphasis />
        </div></section>
      </div>
      <section className="border-t border-slate-200 bg-blue-50/40 p-4 dark:border-slate-700 dark:bg-blue-950/10">
        <SectionHeading>Usage Summary</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Meter Working Hours" value={`${number(row.hoursWorked)} h`} emphasis />
          <Detail label="Clock Duration" value={`${number(clockHours)} h`} emphasis />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Meter Working Hours come from the opening and closing meter difference. Clock duration is shown separately.</p>
      </section>
      <section className="border-t border-slate-200 px-3 py-3 sm:px-4 dark:border-slate-700">
        <SectionHeading><span className="flex items-center gap-2"><Fuel className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Fuel</span></SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Diesel Issued / Added" value={`${number(row.diesel)} L`} />
          <Detail label="Diesel Source" value={dash(row.dieselSource).replace("_", " ")} />
          <Detail label="Opening Tank (L)" value={`${number(row.openingDiesel)} L`} />
          <Detail label="Closing Tank / Physical Dip (L)" value={`${number(row.dieselBalanceInTank)} L`} />
          <Detail label="Physical Tank Balance" value={row.dieselBalanceConfirmed ? "Confirmed" : "Pending confirmation"} emphasis />
        </div>
      </section>
      <section className="border-t border-slate-200 bg-amber-50/40 p-4 dark:border-slate-700 dark:bg-amber-950/10">
        <SectionHeading><span className="flex items-center gap-2"><Droplets className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Fuel Performance</span></SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Detail label="Actual Consumed" value={`${number(fuel.actualConsumed)} L`} emphasis />
          <Detail label="Expected" value={`${number(fuel.expectedDiesel)} L`} />
          <Detail label="Variance" value={`+${number(fuel.variance)} L`} emphasis />
          <Detail label="Actual Consumption Rate · from confirmed tank dip" value={`${number(fuel.actualRate)} L/hr`} emphasis />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Variance is actual consumed minus expected; a positive value means more fuel was consumed than expected.</p>
      </section>
      <section className="border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/20">
        <SectionHeading>Non-BOQ / Incidental Work</SectionHeading>
        <p className="whitespace-pre-wrap text-sm font-medium text-slate-800 dark:text-slate-100">{row.task}</p>
        <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Not a BOQ item — not payable progress.</p>
      </section>
    </article>
  );
}