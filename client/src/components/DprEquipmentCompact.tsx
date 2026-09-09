import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Check, CircleAlert, Droplets, Fuel, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";
import { calculateEquipmentClockDuration, computeEquipmentFuelSummary, formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { EquipmentActivityAllocationEditor, type EquipmentActivitySegment } from "@/components/EquipmentActivityAllocationEditor";
import { groupLegacyEquipmentActivityAllocations, resolveEquipmentAllocationParentDuration } from "@shared/equipmentActivityAllocations";

export type DprEquipmentFields = {
  machine?: string; vehicleNo?: string; operator?: string; task?: string; entryType?: string; startTime?: string; endTime?: string;
  openingReading?: number | null; closingReading?: number | null; numberOfTrips?: number | null;
  tripDistance?: number | null; diesel?: number | null; openingDiesel?: number | null;
  dieselBalanceInTank?: number | null; dieselBalanceConfirmed?: boolean | null; dieselNorm?: number | null;
  expectedDiesel?: number | null; hoursWorked?: number | null; totalKm?: number | null;
  equipmentId?: number | null; dieselSource?: string | null; breakdowns?: Array<{ description?: string }>;
  activitySegments?: EquipmentActivitySegment[];
  activityAllocations?: Array<{ boqItemId: number; programmeBarId?: number | null; startTime: string; endTime: string; hoursWorked?: number }>;
};
export type DprEquipmentTankPatch = Pick<
  DprEquipmentFields,
  "openingDiesel" | "dieselBalanceInTank" | "dieselBalanceConfirmed"
> & { activitySegments?: EquipmentActivitySegment[] };

const dash = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
const number = (value: number | null | undefined, decimals = 2) => value == null || !Number.isFinite(Number(value)) ? "—" : Number(value).toFixed(decimals);

function Detail({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0">
    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</div>
    <div className={`text-sm tabular-nums sm:text-[15px] ${emphasis ? "font-bold text-slate-950 dark:text-slate-50" : "font-medium text-slate-700 dark:text-slate-200"}`}>{value}</div>
  </div>;
}


function SectionHeading({ children }: { children: ReactNode }) {
  return <div className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">{children}</div>;
}

export function DprEquipmentCompact({ row, equipment, onChange, onWorkAssignmentChange, editable = true, index = 0, beforeDate, site, boqItems, programmeBars }: {
  row: DprEquipmentFields;
  equipment?: { meterType?: string | null; consumptionNorm?: number | null } | null;
  onChange?: (patch: Partial<DprEquipmentFields>) => void;
  onWorkAssignmentChange?: (activitySegments: EquipmentActivitySegment[]) => void;
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
  const clockHours = useMemo(() => calculateEquipmentClockDuration(row.startTime, row.endTime), [row.startTime, row.endTime]);
  const allocationParent = useMemo(() => resolveEquipmentAllocationParentDuration({
    startTime: row.startTime,
    endTime: row.endTime,
  }), [row.startTime, row.endTime]);
  const usingLegacyActivityAssignment = !row.activitySegments?.length && !!row.activityAllocations?.length;
  const activitySegments = useMemo<EquipmentActivitySegment[]>(() => {
    if (Array.isArray(row.activitySegments) && (row.activitySegments.length > 0 || !row.activityAllocations?.length)) return row.activitySegments;
    return groupLegacyEquipmentActivityAllocations(row.activityAllocations);
  }, [row.activitySegments, row.activityAllocations]);

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
    onChange?.({ [key]: value === "" ? null : Number(value) } as Partial<DprEquipmentFields>);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/90 shadow-[0_8px_20px_rgba(15,23,42,.055)] dark:border-slate-700 dark:bg-slate-900/50" data-testid={`equipment-compact-${index}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-amber-500/15 text-amber-700 dark:text-amber-400"><Gauge className="h-4 w-4" /></span>
           <div className="min-w-0"><div className="truncate text-base font-bold text-slate-950 dark:text-slate-50">{dash(row.machine)}</div><div className="text-xs font-medium text-slate-500">{dash(row.vehicleNo)} · Machine day {index + 1}</div></div>
        </div>
        <div className="flex items-center gap-1.5">
           {row.breakdowns?.length ? <Badge variant="destructive" className="text-xs">{row.breakdowns.length} breakdown{row.breakdowns.length > 1 ? "s" : ""}</Badge> : <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Operating</Badge>}
          {preview.warning && <span title={preview.warning} className="text-amber-700 dark:text-amber-400"><CircleAlert className="h-4 w-4" /></span>}
        </div>
      </header>

      {!editable && <div className="grid divide-y divide-slate-200 dark:divide-slate-700 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <section className="p-4"><SectionHeading>Equipment</SectionHeading><div className="grid grid-cols-2 gap-4"><Detail label="Machine" value={dash(row.machine)} emphasis /><Detail label="Registration / equipment no." value={dash(row.vehicleNo)} /><Detail label="Operator" value={dash(row.operator)} /><Detail label="Entry / Hire Type" value={dash(row.entryType).replaceAll("_", " ")} /></div></section>
        <section className="p-4"><SectionHeading>Usage Start</SectionHeading><div className="grid grid-cols-2 gap-4"><Detail label="Opening Meter" value={dash(row.openingReading)} /><Detail label="Start Time" value={formatEquipmentTime(row.startTime)} emphasis /></div></section>
        <section className="p-4"><SectionHeading>Usage End</SectionHeading><div className="grid grid-cols-2 gap-4"><Detail label={equipment?.meterType === "odometer" ? "Closing Odometer" : "Closing Meter"} value={dash(row.closingReading)} /><Detail label="End Time" value={formatEquipmentTime(row.endTime)} emphasis /><Detail label={equipment?.meterType === "odometer" || preview.totalKm != null ? "Distance" : "Meter Working Hours"} value={equipment?.meterType === "odometer" || preview.totalKm != null ? (preview.totalKm == null ? "—" : `${number(preview.totalKm, 2)} km`) : (preview.basis === "hour_meter" && preview.hoursWorked != null ? `${number(preview.hoursWorked)} h` : "—")} emphasis /><Detail label="Clock Duration" value={formatEquipmentDuration(clockHours)} emphasis /></div></section>
      </div>}

      {!editable && <section className="border-t border-slate-200 bg-blue-50/40 p-4 dark:border-slate-700 dark:bg-blue-950/10">
        <SectionHeading>Usage Summary</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label={equipment?.meterType === "odometer" ? "Distance" : "Meter Working Hours"} value={equipment?.meterType === "odometer" ? (preview.totalKm == null ? "—" : `${number(preview.totalKm, 2)} km`) : (preview.basis === "hour_meter" && preview.hoursWorked != null ? `${number(preview.hoursWorked)} h` : "—")} emphasis />
          <Detail label="Clock Duration" value={formatEquipmentDuration(clockHours)} emphasis />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
          {equipment?.meterType === "odometer"
            ? "Distance comes from the odometer or trip calculation. Clock duration is shown separately."
            : preview.basis === "hour_meter"
              ? "Meter Working Hours come from the opening and closing meter difference. Clock duration is shown separately."
              : "No hour-meter difference is available. Clock duration is shown separately and is not labelled as meter working time."}
        </p>
      </section>}

      <section className="border-t border-slate-200 p-4 dark:border-slate-700">
        <SectionHeading><span className="flex items-center gap-2"><Fuel className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Fuel</span></SectionHeading>
        {editable && onChange ? <><div className="mb-4 grid grid-cols-2 gap-4"><Detail label="Diesel Issued / Added" value={`${number(row.diesel)} L`} emphasis /><Detail label="Diesel Source" value={dash(row.dieselSource).replaceAll("_", " ")} /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Opening Tank (L)</Label><Input className="mt-1 h-11 bg-white text-base tabular-nums dark:bg-slate-950/50" type="number" step="0.1" value={row.openingDiesel ?? ""} onChange={e => setNumber("openingDiesel", e.target.value)} placeholder="Not recorded" /></div>
          <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Closing Tank / Physical Dip (L)</Label><Input className="mt-1 h-11 bg-white text-base tabular-nums dark:bg-slate-950/50" type="number" step="0.1" value={row.dieselBalanceInTank ?? ""} onChange={e => setNumber("dieselBalanceInTank", e.target.value)} placeholder="Not recorded" /></div>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2"><Checkbox checked={!!row.dieselBalanceConfirmed} onCheckedChange={checked => onChange({ dieselBalanceConfirmed: checked === true })} /><span className="text-sm font-medium text-slate-700 dark:text-slate-200">{row.dieselBalanceConfirmed && <Check className="mr-1 inline h-4 w-4 text-emerald-600" />}Physical Tank Balance Confirmed</span></label>
        </div></> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Opening Tank (L)" value={`${number(row.openingDiesel)} L`} /><Detail label="Diesel Issued / Added" value={`${number(row.diesel)} L`} /><Detail label="Diesel Source" value={dash(row.dieselSource).replace("_", " ")} /><Detail label="Closing Tank / Physical Dip (L)" value={`${number(row.dieselBalanceInTank)} L`} /><Detail label="Physical Tank Balance" value={row.dieselBalanceConfirmed ? "Confirmed" : tankKnown ? "Pending confirmation" : "—"} emphasis /></div>}
      </section>

      {!editable && <section className="border-t border-slate-200 bg-amber-50/40 p-4 dark:border-slate-700 dark:bg-amber-950/10">
        <SectionHeading><span className="flex items-center gap-2"><Droplets className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Fuel Performance</span></SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Detail label="Actual Consumed" value={fuel.actualConsumed == null ? "Awaiting tank dip" : `${number(fuel.actualConsumed)} L`} emphasis />
          <Detail label="Expected" value={fuel.expectedDiesel == null ? "—" : `${number(fuel.expectedDiesel)} L`} />
          <Detail label="Variance" value={fuel.variance == null ? "—" : `${fuel.variance > 0 ? "+" : ""}${number(fuel.variance)} L`} emphasis />
          <Detail label="Actual Consumption Rate" value={fuel.actualRate == null ? "—" : `${number(fuel.actualRate)} ${fuel.actualRateUnit}`} emphasis />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Variance is actual consumed minus expected; a positive value means more fuel was consumed than expected.</p>
      </section>}
      {!editable && tankKnown && !row.dieselBalanceConfirmed && <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-300">Physical tank balance has not been confirmed.</div>}
      <EquipmentActivityAllocationEditor value={activitySegments} onChange={editable && (onWorkAssignmentChange || onChange) ? activitySegments => onWorkAssignmentChange ? onWorkAssignmentChange(activitySegments) : onChange?.({ activitySegments, activityAllocations: undefined }) : undefined} parentHours={allocationParent.hours} parentStartTime={row.startTime} parentEndTime={row.endTime} boqItems={boqItems} programmeBars={programmeBars} editable={editable} preserveInitialValueUntilChange={usingLegacyActivityAssignment} />
    </article>
  );
}