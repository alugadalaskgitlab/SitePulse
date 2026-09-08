import { useEffect, useMemo, useRef } from "react";
import { Check, CircleAlert, Droplets, Fuel, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";
import { computeEquipmentFuelSummary } from "@shared/equipmentUsage";
import { EquipmentActivityAllocationEditor, type EquipmentActivityAllocation } from "@/components/EquipmentActivityAllocationEditor";
import { resolveEquipmentAllocationParentHours } from "@shared/equipmentActivityAllocations";

export type DprEquipmentFields = {
  machine?: string; vehicleNo?: string; operator?: string; task?: string; entryType?: string; startTime?: string; endTime?: string;
  openingReading?: number | null; closingReading?: number | null; numberOfTrips?: number | null;
  tripDistance?: number | null; diesel?: number | null; openingDiesel?: number | null;
  dieselBalanceInTank?: number | null; dieselBalanceConfirmed?: boolean | null; dieselNorm?: number | null;
  expectedDiesel?: number | null; hoursWorked?: number | null; totalKm?: number | null;
  equipmentId?: number | null; dieselSource?: string | null; breakdowns?: Array<{ description?: string }>;
  activityAllocations?: EquipmentActivityAllocation[];
};
export type DprEquipmentTankPatch = Pick<
  DprEquipmentFields,
  "openingDiesel" | "dieselBalanceInTank" | "dieselBalanceConfirmed"
> & { activityAllocations?: EquipmentActivityAllocation[] };

const dash = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
const number = (value: number | null | undefined, decimals = 2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(decimals);

function Detail({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0">
    <div className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">{label}</div>
    <div className={`truncate text-xs tabular-nums ${emphasis ? "font-semibold text-slate-950 dark:text-slate-50" : "text-slate-700 dark:text-slate-200"}`}>{value}</div>
  </div>;
}

export function DprEquipmentCompact({ row, equipment, onChange, editable = true, index = 0, beforeDate, site, boqItems, programmeBars }: {
  row: DprEquipmentFields;
  equipment?: { meterType?: string | null; consumptionNorm?: number | null } | null;
  onChange?: (patch: Partial<DprEquipmentTankPatch>) => void;
  editable?: boolean; index?: number; beforeDate?: string; site?: string;
  boqItems?: Array<{ id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null }>;
  programmeBars?: Array<{ id: number; boqItemId: number; reachLabel?: string | null; side?: string | null }>;
}) {
  const continuityAppliedFor = useRef<string | null>(null);
  const preview = useMemo(() => computeEquipmentUsage(equipment, row), [equipment, row]);
  const summaryUsage = useMemo(() => ({
    ...preview,
    runtime: preview.runtime > 0 ? preview.runtime : Number(row.totalKm ?? row.hoursWorked ?? 0),
    efficiencyUnit: row.totalKm != null ? "L/km" as const : preview.efficiencyUnit,
  }), [preview, row.totalKm, row.hoursWorked]);
  const fuel = useMemo(() => computeEquipmentFuelSummary(summaryUsage, {
    openingTank: row.openingDiesel,
    dieselIssued: row.diesel,
    closingTank: row.dieselBalanceInTank,
    expectedDiesel: row.expectedDiesel,
  }), [summaryUsage, row.openingDiesel, row.diesel, row.dieselBalanceInTank, row.expectedDiesel]);
  const tankKnown = row.openingDiesel != null || row.dieselBalanceInTank != null;

  useEffect(() => {
    let cancelled = false;
    if (!editable || !onChange || row.openingDiesel != null || row.equipmentId == null || !beforeDate || !site) return;
    const requestKey = `${row.equipmentId}:${beforeDate}:${site}`;
    fetch(`/api/equipment/${row.equipmentId}/latest-confirmed-diesel-tank?beforeDate=${encodeURIComponent(beforeDate)}&site=${encodeURIComponent(site)}`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || row.openingDiesel != null || data?.dieselBalanceInTank == null || continuityAppliedFor.current === requestKey) return;
        continuityAppliedFor.current = requestKey;
        onChange({ openingDiesel: Number(data.dieselBalanceInTank) });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [editable, onChange, row.equipmentId, row.openingDiesel, beforeDate, site]);

  const setNumber = (key: keyof DprEquipmentFields, value: string) =>
    onChange?.({ [key]: value === "" ? null : Number(value) } as Partial<DprEquipmentTankPatch>);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/90 shadow-[0_8px_20px_rgba(15,23,42,.055)] dark:border-slate-700 dark:bg-slate-900/50" data-testid={`equipment-compact-${index}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-amber-500/15 text-amber-700 dark:text-amber-400"><Gauge className="h-4 w-4" /></span>
          <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-950 dark:text-slate-50">{dash(row.machine)}</div><div className="text-[10px] font-medium uppercase tracking-[.1em] text-slate-500">{dash(row.vehicleNo)} · machine day {index + 1}</div></div>
        </div>
        <div className="flex items-center gap-1.5">
          {row.breakdowns?.length ? <Badge variant="destructive" className="text-[10px]">{row.breakdowns.length} breakdown{row.breakdowns.length > 1 ? "s" : ""}</Badge> : <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Operating</Badge>}
          {preview.warning && <span title={preview.warning} className="text-amber-700 dark:text-amber-400"><CircleAlert className="h-4 w-4" /></span>}
        </div>
      </header>

      <div className="grid divide-y divide-slate-200 dark:divide-slate-700 md:grid-cols-3 md:divide-x md:divide-y-0">
        <section className="p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Equipment</div><div className="grid grid-cols-2 gap-x-3 gap-y-2"><Detail label="Operator" value={dash(row.operator)} /><Detail label="Entry type" value={dash(row.entryType).replace("_", " ")} /><Detail label="Usage basis" value={preview.basis.replace("_", " ")} /><Detail label="Meter" value={equipment?.meterType === "odometer" ? "Odometer" : "Hour meter"} /></div></section>
        <section className="p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Usage start</div><div className="grid grid-cols-2 gap-x-3 gap-y-2"><Detail label="Start time" value={dash(row.startTime)} emphasis /><Detail label="Opening meter" value={dash(row.openingReading)} /></div></section>
        <section className="p-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">Usage end</div><div className="grid grid-cols-2 gap-x-3 gap-y-2"><Detail label="End time" value={dash(row.endTime)} emphasis /><Detail label="Closing meter" value={dash(row.closingReading)} /></div></section>
      </div>

      <section className="border-t border-slate-200 px-3 py-2.5 dark:border-slate-700">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500"><Fuel className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /> Fuel</div>
        {editable && onChange ? <><div className="mb-2 grid grid-cols-2 gap-3"><Detail label="Diesel issued / added" value={`${number(row.diesel)} L`} emphasis /><Detail label="Diesel source" value={dash(row.dieselSource).replace("_", " ")} /></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div><Label className="text-[10px] text-slate-500">Opening tank (L)</Label><Input className="mt-0.5 h-8 bg-white text-sm tabular-nums dark:bg-slate-950/50" type="number" step="0.1" value={row.openingDiesel ?? ""} onChange={e => setNumber("openingDiesel", e.target.value)} placeholder="Not recorded" /></div>
          <div><Label className="text-[10px] text-slate-500">Physical closing dip (L)</Label><Input className="mt-0.5 h-8 bg-white text-sm tabular-nums dark:bg-slate-950/50" type="number" step="0.1" value={row.dieselBalanceInTank ?? ""} onChange={e => setNumber("dieselBalanceInTank", e.target.value)} placeholder="Not recorded" /></div>
          <label className="col-span-2 flex min-h-8 items-center gap-2 sm:col-span-1 sm:mt-5"><Checkbox checked={!!row.dieselBalanceConfirmed} onCheckedChange={checked => onChange({ dieselBalanceConfirmed: checked === true })} /><span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{row.dieselBalanceConfirmed && <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />}Physical tank balance confirmed</span></label>
        </div></> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><Detail label="Opening tank" value={`${number(row.openingDiesel)} L`} /><Detail label="Fuel issued" value={`${number(row.diesel)} L`} /><Detail label="Fuel source" value={dash(row.dieselSource).replace("_", " ")} /><Detail label="Physical closing dip" value={`${number(row.dieselBalanceInTank)} L`} /><Detail label="Physical confirmation" value={row.dieselBalanceConfirmed ? "Confirmed" : tankKnown ? "Pending" : "—"} emphasis /></div>}
      </section>

      <section className="border-t border-slate-200 bg-slate-950/[.025] px-3 py-2.5 dark:border-slate-700 dark:bg-black/10">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500"><Droplets className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /> Calculated summary</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
          <Detail label="Actual consumed" value={fuel.actualConsumed == null ? "Awaiting tank dip" : `${number(fuel.actualConsumed)} L`} emphasis />
          <Detail label="Expected" value={fuel.expectedDiesel == null ? "—" : `${number(fuel.expectedDiesel)} L`} />
          <Detail label="Variance" value={fuel.variance == null ? "—" : `${fuel.variance > 0 ? "+" : ""}${number(fuel.variance)} L`} emphasis />
          <Detail label={preview.totalKm != null ? "Distance" : "Operating time"} value={preview.totalKm != null ? `${number(preview.totalKm, 1)} km` : preview.hoursWorked != null ? `${number(preview.hoursWorked)} h` : "—"} />
          <Detail label="Actual rate" value={fuel.actualRate == null ? "—" : `${number(fuel.actualRate)} ${fuel.actualRateUnit}`} emphasis />
        </div>
      </section>
      {!editable && tankKnown && !row.dieselBalanceConfirmed && <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-300">Physical tank balance has not been confirmed.</div>}
      <EquipmentActivityAllocationEditor value={row.activityAllocations ?? []} onChange={editable && onChange ? activityAllocations => onChange({ activityAllocations }) : undefined} parentHours={resolveEquipmentAllocationParentHours({ hoursWorked: row.hoursWorked ?? preview.hoursWorked ?? null, startTime: row.startTime, endTime: row.endTime })} parentStartTime={row.startTime} parentEndTime={row.endTime} boqItems={boqItems} programmeBars={programmeBars} editable={editable} />
    </article>
  );
}