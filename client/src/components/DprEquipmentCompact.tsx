import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert, Droplets, Fuel, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";
import { fetchLatestPriorClosing } from "@/lib/equipmentContinuity";
import { calculateEquipmentClockDuration, computeEquipmentFuelSummary, formatEquipmentDuration, formatEquipmentTime, resolveEquipmentConsumptionNormRate } from "@shared/equipmentUsage";
import { isVisibleEquipmentRow } from "@shared/equipmentUsage";
import { EquipmentActivityAllocationEditor, type EquipmentActivitySegment } from "@/components/EquipmentActivityAllocationEditor";
import { groupLegacyEquipmentActivityAllocations, resolveEquipmentAllocationParentDuration } from "@shared/equipmentActivityAllocations";

export type DprEquipmentFields = {
  machine?: string; vehicleNo?: string; operator?: string; task?: string; entryType?: string; startTime?: string; endTime?: string;
  openingReading?: number | null; closingReading?: number | null; numberOfTrips?: number | null;
  tripDistance?: number | null; diesel?: number | null; openingDiesel?: number | null;
  dieselBalanceInTank?: number | null; dieselBalanceConfirmed?: boolean | null; dieselNorm?: number | null;
  expectedDiesel?: number | null; hoursWorked?: number | null; totalKm?: number | null;
  equipmentId?: number | null; plantUsageId?: number | null; dieselSource?: string | null; breakdowns?: Array<{ description?: string }>;
  usageStatus?: "working" | "idle_no_work" | "idle_no_operator" | "breakdown" | null;
  usageStatusReason?: string | null;
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
  return <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">{children}</div>;
}

export function DprEquipmentCompact({ row, equipment, onChange, onWorkAssignmentChange, editable = true, index = 0, beforeDate, site, boqItems, programmeBars, showTankBalance = true, enableTankContinuity = true, hideIdentity = false, allowLinkedSourceEdit = false }: {
  row: DprEquipmentFields;
  equipment?: { meterType?: string | null; consumptionNorm?: number | null; ownership?: string | null; vendorName?: string | null } | null;
  onChange?: (patch: Partial<DprEquipmentFields>) => void;
  onWorkAssignmentChange?: (activitySegments: EquipmentActivitySegment[]) => void;
  editable?: boolean; index?: number; beforeDate?: string; site?: string;
  boqItems?: Array<{ id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null }>;
  programmeBars?: Array<{ id: number; boqItemId: number; reachLabel?: string | null; side?: string | null }>;
  /** Legacy callers can suppress the complete compact fuel section. */
  showTankBalance?: boolean;
  /**
   * Whether this form row may suggest a prior confirmed tank balance. The
   * default keeps the existing behavior for report/legacy callers; source-
   * aware DPR forms disable it for direct-purchase and contractor rows so a
   * hidden control cannot receive an invisible value.
   */
  enableTankContinuity?: boolean;
  /**
   * The surrounding entry form may already render the machine identity. Keep
   * the compact header's status and expand/collapse controls, while allowing
   * those callers to avoid showing the same identity twice.
   */
  hideIdentity?: boolean;
  /**
   * Linked canonical usage rows are immutable for ordinary editors. Admin
   * corrections still pass through the version transaction; lifecycle IDs
   * remain immutable in the parent editor.
   */
  allowLinkedSourceEdit?: boolean;
}) {
  const visibleRow = isVisibleEquipmentRow(row);
  const continuityAppliedFor = useRef<string | null>(null);
  const readingContinuityAppliedFor = useRef<string | null>(null);
  const closingReadingEdited = useRef(false);
  const dieselIssuedEdited = useRef(false);
  const closingTankEdited = useRef(false);
  const preview = useMemo(() => computeEquipmentUsage(equipment, row), [equipment, row]);
  const isPlantStock = row.dieselSource === "plant_stock";
  const linkedSourceLocked = row.plantUsageId != null && !allowLinkedSourceEdit;
  const hiredVendorLabel = equipment?.ownership === "hired" ? `Hired: ${equipment.vendorName?.trim() || "Vendor not recorded"}` : null;
  const tankNeedsConfirmation = isPlantStock && (row.openingDiesel != null || row.dieselBalanceInTank != null) && !row.dieselBalanceConfirmed;
  const isIdle = row.usageStatus === "idle_no_work" || row.usageStatus === "idle_no_operator";
  const visibleWarning = isIdle ? null : preview.warning;
  const statusReasonRequired = row.usageStatus != null && row.usageStatus !== "working";
  const rowLooksComplete = !!row.machine && !!row.endTime && row.closingReading != null && !row.breakdowns?.length && !visibleWarning && !tankNeedsConfirmation && (!statusReasonRequired || !!row.usageStatusReason?.trim());
  const [expanded, setExpanded] = useState(index === 0 || !rowLooksComplete);
  const summaryUsage = useMemo(() => ({
    ...preview,
    runtime: preview.runtime,
    efficiencyUnit: preview.efficiencyUnit,
  }), [preview]);
  const historicalSummaryUsage = useMemo(() => {
    const storedTotalKm = row.totalKm == null ? null : Number(row.totalKm);
    const storedHours = row.hoursWorked == null ? null : Number(row.hoursWorked);
    const hasStoredTotalKm = storedTotalKm != null && Number.isFinite(storedTotalKm) && storedTotalKm >= 0;
    const hasStoredHours = storedHours != null && Number.isFinite(storedHours) && storedHours >= 0;

    if (!editable) {
      if (hasStoredTotalKm) return { ...preview, runtime: storedTotalKm!, efficiencyUnit: "L/km" as const };
      if (hasStoredHours) return { ...preview, runtime: storedHours!, efficiencyUnit: "L/hr" as const };
      return summaryUsage;
    }
    if (preview.runtime > 0) return summaryUsage;
    if (preview.efficiencyUnit === "L/km" && hasStoredTotalKm) {
      return { ...preview, runtime: storedTotalKm!, efficiencyUnit: "L/km" as const };
    }
    if (preview.efficiencyUnit === "L/hr" && hasStoredHours) {
      return { ...preview, runtime: storedHours!, efficiencyUnit: "L/hr" as const };
    }
    return summaryUsage;
  }, [editable, preview, row.totalKm, row.hoursWorked, summaryUsage]);
  // Direct-purchase and contractor diesel never represent the machine's
  // physical tank movement. Legacy rows can still carry stale observations,
  // but they must not manufacture an actual-consumption/variance result.
  const fuel = useMemo(() => computeEquipmentFuelSummary(historicalSummaryUsage, {
    openingTank: isPlantStock ? row.openingDiesel : null,
    dieselIssued: row.diesel,
    closingTank: isPlantStock ? row.dieselBalanceInTank : null,
    expectedDiesel: row.expectedDiesel,
  }), [historicalSummaryUsage, isPlantStock, row.openingDiesel, row.diesel, row.dieselBalanceInTank, row.expectedDiesel]);
  const tankKnown = isPlantStock && (row.openingDiesel != null || row.dieselBalanceInTank != null);
  const clockHours = useMemo(() => calculateEquipmentClockDuration(row.startTime, row.endTime), [row.startTime, row.endTime]);
  const usageQuantity = preview.totalKm != null
    ? { label: "Distance", value: `${number(preview.totalKm, 2)} km` }
    : { label: "Working Hours", value: preview.hoursWorked == null ? "—" : `${number(preview.hoursWorked, 3)} h` };
  const { value: consumptionNorm, unit: consumptionNormUnit } = resolveEquipmentConsumptionNormRate(equipment, historicalSummaryUsage);
  const hasConfirmedActualRate = row.dieselBalanceConfirmed === true && fuel.actualRate != null;
  const allocationParent = useMemo(() => resolveEquipmentAllocationParentDuration({
    startTime: row.startTime,
    endTime: row.endTime,
  }), [row.startTime, row.endTime]);
  const usingLegacyActivityAssignment = !row.activitySegments?.length && !!row.activityAllocations?.length;
  const activitySegments = useMemo<EquipmentActivitySegment[]>(() => {
    if (Array.isArray(row.activitySegments) && (row.activitySegments.length > 0 || !row.activityAllocations?.length)) return row.activitySegments;
    return groupLegacyEquipmentActivityAllocations(row.activityAllocations);
  }, [row.activitySegments, row.activityAllocations]);
  const incidentalTask = typeof row.task === "string" ? row.task.trim() : "";

  useEffect(() => {
    closingReadingEdited.current = false;
    dieselIssuedEdited.current = false;
    closingTankEdited.current = false;
    readingContinuityAppliedFor.current = null;
  }, [row.equipmentId]);

  useEffect(() => {
    let cancelled = false;
    if (!editable || !onChange || row.plantUsageId != null || row.openingReading != null || row.equipmentId == null || !beforeDate || !site) return;
    const equipmentId = row.equipmentId;
    const requestKey = `${equipmentId}:${beforeDate}:${site}`;
    fetchLatestPriorClosing(equipmentId, beforeDate, site).then(data => {
      if (cancelled || data.closingReading == null || readingContinuityAppliedFor.current === requestKey) return;
      readingContinuityAppliedFor.current = requestKey;
      const patch: Partial<DprEquipmentFields> = { openingReading: Number(data.closingReading) };
      if (isIdle && row.closingReading == null && !closingReadingEdited.current) {
        patch.closingReading = Number(data.closingReading);
      }
      onChange(patch);
    });
    return () => { cancelled = true; };
  }, [editable, onChange, row.plantUsageId, row.openingReading, row.closingReading, row.equipmentId, beforeDate, site, isIdle]);

  useEffect(() => {
    let cancelled = false;
    if (!editable || !onChange || !isPlantStock || !enableTankContinuity || row.openingDiesel != null || row.equipmentId == null || !beforeDate || !site) return;
    const requestKey = `${row.equipmentId}:${beforeDate}:${site}`;
    fetch(`/api/equipment/${row.equipmentId}/latest-confirmed-diesel-tank?beforeDate=${encodeURIComponent(beforeDate)}&site=${encodeURIComponent(site)}`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || row.openingDiesel != null || data?.dieselBalanceInTank == null || continuityAppliedFor.current === requestKey) return;
        continuityAppliedFor.current = requestKey;
        const openingDiesel = Number(data.dieselBalanceInTank);
        onChange({
          openingDiesel,
          ...(isIdle && row.dieselBalanceInTank == null && !closingTankEdited.current
            ? { dieselBalanceInTank: openingDiesel }
            : {}),
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [editable, onChange, isPlantStock, enableTankContinuity, row.equipmentId, row.openingDiesel, row.dieselBalanceInTank, beforeDate, site, isIdle]);

  const setNumber = (key: keyof DprEquipmentFields, value: string) =>
    onChange?.({ [key]: value === "" ? null : Number(value) } as Partial<DprEquipmentFields>);

  if (!visibleRow) {
    return editable ? (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300" data-testid={`equipment-empty-${index}`}>
        Select equipment above to add or correct a machine day. Default-only rows are not displayed as Operating.
      </div>
    ) : null;
  }

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_20px_rgba(15,23,42,.055)] dark:border-slate-700 dark:bg-slate-900/50" data-testid={`equipment-compact-${index}`}>
      <header className={`flex flex-wrap items-center justify-between gap-2 bg-slate-100/80 px-3 py-2.5 dark:bg-slate-800/60 ${expanded || !editable ? "border-b border-slate-200 dark:border-slate-700" : ""}`}>
         {!hideIdentity && <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400"><Gauge className="h-4 w-4" /></span>
           <div className="min-w-0"><div className="truncate text-sm font-bold tracking-[0.03em] text-slate-950 dark:text-slate-50 sm:text-base">{dash(row.machine)}</div><div className="truncate text-xs font-medium text-slate-500">{dash(row.vehicleNo)}{row.operator ? ` · ${row.operator}` : ""} · Machine day {index + 1}</div>{hiredVendorLabel && <div className="truncate text-xs font-semibold text-amber-800 dark:text-amber-300" data-testid={`equipment-owner-${index}`}>{hiredVendorLabel}</div>}</div>
         </div>}
        <div className="flex items-center gap-1.5">
            {row.breakdowns?.length ? <Badge variant="destructive" className="text-xs">{row.breakdowns.length} breakdown{row.breakdowns.length > 1 ? "s" : ""}</Badge> : row.usageStatus ? <Badge variant="outline" className="text-xs">{row.usageStatus === "working" ? "Working" : row.usageStatus === "idle_no_work" ? "Idle · No Work" : row.usageStatus === "idle_no_operator" ? "Idle · No Operator" : "Breakdown"}</Badge> : <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Operating</Badge>}
           {visibleWarning && <span title={visibleWarning} className="text-amber-700 dark:text-amber-400"><CircleAlert className="h-4 w-4" /></span>}
          {editable && <button type="button" onClick={() => setExpanded(value => !value)} className="grid h-11 w-11 place-items-center rounded-md text-slate-600 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:h-9 sm:w-9 dark:text-slate-300 dark:hover:bg-slate-700" aria-expanded={expanded} aria-label={expanded ? `Collapse ${dash(row.machine)}` : `Expand ${dash(row.machine)}`}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>}
        </div>
      </header>

      {editable && !expanded && <button type="button" onClick={() => setExpanded(true)} className="grid min-h-11 w-full grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50 sm:grid-cols-4 dark:text-slate-300 dark:hover:bg-slate-800/40">
        <span><strong className="text-slate-900 dark:text-slate-100">{formatEquipmentTime(row.startTime)}–{formatEquipmentTime(row.endTime)}</strong></span>
        <span>Clock <strong className="text-slate-900 dark:text-slate-100">{formatEquipmentDuration(clockHours)}</strong></span>
        <span>Fuel <strong className="text-slate-900 dark:text-slate-100">{number(row.diesel)} L</strong></span>
        <span className="text-right font-semibold text-amber-700 dark:text-amber-300">Open details</span>
      </button>}

       {(!editable || expanded) && <>
         {editable && <section className="grid gap-3 border-b border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-700 dark:bg-slate-950/20 sm:grid-cols-2">
           <div>
             <Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Daily Status</Label>
             <Select value={row.usageStatus ?? "unspecified"} onValueChange={(value) => {
               const usageStatus = value === "unspecified" ? null : value as DprEquipmentFields["usageStatus"];
               const idle = usageStatus === "idle_no_work" || usageStatus === "idle_no_operator";
               const patch: Partial<DprEquipmentFields> = { usageStatus };
               if (idle) {
                 if (row.closingReading == null && row.openingReading != null && !closingReadingEdited.current) patch.closingReading = row.openingReading;
                 if (row.diesel == null && !dieselIssuedEdited.current && !linkedSourceLocked) patch.diesel = 0;
                 if (isPlantStock && row.dieselBalanceInTank == null && row.openingDiesel != null && !closingTankEdited.current) patch.dieselBalanceInTank = row.openingDiesel;
               }
               onChange?.(patch);
             }}>
               <SelectTrigger className="mt-1 h-11 bg-white sm:h-9 dark:bg-slate-900" data-testid={`equipment-compact-usage-status-${index}`}>
                 <SelectValue />
               </SelectTrigger>
               <SelectContent>
                 <SelectItem value="unspecified">Not specified (legacy behavior)</SelectItem>
                 <SelectItem value="working">Working</SelectItem>
                 <SelectItem value="idle_no_work">Idle — No Work Available</SelectItem>
                 <SelectItem value="idle_no_operator">Idle — Operator Unavailable</SelectItem>
                 <SelectItem value="breakdown">Breakdown</SelectItem>
               </SelectContent>
             </Select>
           </div>
           <div>
             <Label htmlFor={`equipment-compact-usage-reason-${index}`} className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Reason {statusReasonRequired ? "(required)" : "(optional)"}</Label>
             <Textarea id={`equipment-compact-usage-reason-${index}`} className="mt-1 min-h-11 bg-white py-2 text-sm dark:bg-slate-900" value={row.usageStatusReason ?? ""} onChange={event => onChange?.({ usageStatusReason: event.target.value })} required={statusReasonRequired} aria-invalid={statusReasonRequired && !row.usageStatusReason?.trim()} placeholder={statusReasonRequired ? "Explain today's idle or breakdown status" : "Optional note"} data-testid={`equipment-compact-usage-reason-${index}`} />
             {statusReasonRequired && !row.usageStatusReason?.trim() && <p className="mt-1 text-xs font-medium text-red-600">A reason is required for this status.</p>}
           </div>
         </section>}
        {editable && <section className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 text-xs dark:border-slate-700 dark:bg-slate-950/20 sm:grid-cols-6">
           <div className="border-b border-r border-slate-200 px-3 py-2 sm:border-b-0 dark:border-slate-700"><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{equipment?.meterType === "odometer" ? "Opening Odometer" : "Opening Meter"}</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-900" type="number" step="0.1" value={row.openingReading ?? ""} disabled={linkedSourceLocked} onChange={event => setNumber("openingReading", event.target.value)} placeholder="Not recorded" data-testid={`equipment-compact-opening-meter-${index}`} /></div>
           <div className="border-b border-slate-200 px-3 py-2 sm:border-b-0 sm:border-r dark:border-slate-700"><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{equipment?.meterType === "odometer" ? "Closing Odometer" : "Closing Meter"}</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-900" type="number" step="0.1" value={row.closingReading ?? ""} onChange={event => { closingReadingEdited.current = true; setNumber("closingReading", event.target.value); }} placeholder="Not recorded" data-testid={`equipment-compact-closing-meter-${index}`} /></div>
         <div className="border-r border-slate-200 px-3 py-2 dark:border-slate-700"><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Start</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-900" type="time" value={row.startTime ?? ""} disabled={linkedSourceLocked} onChange={event => onChange?.({ startTime: event.target.value })} data-testid={`equipment-compact-start-${index}`} /></div>
         <div className="border-r border-slate-200 px-3 py-2 dark:border-slate-700"><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">End</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-900" type="time" value={row.endTime ?? ""} onChange={event => onChange?.({ endTime: event.target.value })} data-testid={`equipment-compact-end-${index}`} /></div>
        <div className="col-span-2 px-3 py-2 sm:col-span-1"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Clock Duration</div><div className="mt-2 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatEquipmentDuration(clockHours)}</div></div>
         <div className="col-span-2 px-3 py-2 sm:col-span-1"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{usageQuantity.label}</div><div className="mt-2 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100" data-testid={`equipment-compact-working-hours-${index}`}>{usageQuantity.value}</div></div>
      </section>}

      {!editable && <div className="grid divide-y divide-slate-200 dark:divide-slate-700 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
         <section className="p-4"><SectionHeading>Equipment</SectionHeading><div className="grid grid-cols-2 gap-4"><Detail label="Machine" value={dash(row.machine)} emphasis /><Detail label="Registration / equipment no." value={dash(row.vehicleNo)} /><Detail label="Operator" value={dash(row.operator)} />{hiredVendorLabel && <Detail label="Owner / vendor" value={hiredVendorLabel} />}<Detail label="Entry / Hire Type" value={dash(row.entryType).replaceAll("_", " ")} /><Detail label="Daily Status" value={row.usageStatus ? row.usageStatus.replaceAll("_", " ") : "Not specified"} emphasis />{row.usageStatusReason && <Detail label="Status Reason" value={row.usageStatusReason} />}</div></section>
         <section className="p-4"><SectionHeading>Usage Start</SectionHeading><div className="grid grid-cols-2 gap-4"><Detail label={equipment?.meterType === "odometer" ? "Opening Odometer" : "Opening Meter"} value={dash(row.openingReading)} /><Detail label="Start Time" value={formatEquipmentTime(row.startTime)} emphasis /></div></section>
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

       {showTankBalance && <section className="border-t border-slate-200 px-3 py-3 sm:px-4 dark:border-slate-700" data-testid={`equipment-compact-fuel-${index}`}>
        <SectionHeading><span className="flex items-center gap-2"><Fuel className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Fuel</span></SectionHeading>
         {editable && onChange ? <><div className="mb-2 text-[11px] text-slate-500">Diesel source: <strong className="text-slate-700 dark:text-slate-200">{dash(row.dieselSource).replaceAll("_", " ")}</strong></div><div className={`grid grid-cols-2 gap-2 ${isPlantStock ? "lg:grid-cols-[140px_160px_140px_minmax(190px,1fr)]" : "lg:grid-cols-[140px]"} lg:items-end`}>
           {isPlantStock && <><div><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Opening Tank (L)</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-950/50" type="number" step="0.1" value={row.openingDiesel ?? ""} onChange={e => setNumber("openingDiesel", e.target.value)} placeholder="Not recorded" data-testid={`equipment-compact-opening-tank-${index}`} /></div>
            <div><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Closing / Physical Dip (L)</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-950/50" type="number" step="0.1" value={row.dieselBalanceInTank ?? ""} onChange={e => { closingTankEdited.current = true; setNumber("dieselBalanceInTank", e.target.value); }} placeholder="Not recorded" data-testid={`equipment-compact-closing-tank-${index}`} /></div></>}
             <div><Label className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Diesel Issued / Added (L)</Label><Input className="mt-1 h-11 bg-white px-2 text-sm font-semibold tabular-nums sm:h-9 dark:bg-slate-950/50" type="number" step="0.1" value={row.diesel ?? ""} disabled={row.plantUsageId != null && isPlantStock && !allowLinkedSourceEdit} onChange={e => { dieselIssuedEdited.current = true; setNumber("diesel", e.target.value); }} placeholder="0" data-testid={`equipment-compact-diesel-${index}`} /></div>
           {isPlantStock && <label className={`col-span-2 flex h-11 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold sm:h-9 lg:col-span-1 ${row.dieselBalanceConfirmed ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"}`}><Checkbox checked={!!row.dieselBalanceConfirmed} onCheckedChange={checked => onChange({ dieselBalanceConfirmed: checked === true })} data-testid={`equipment-compact-tank-confirmed-${index}`} /><span>{row.dieselBalanceConfirmed && <Check className="mr-1 inline h-4 w-4 text-emerald-600" />}Physical Tank Balance Confirmed</span></label>}
         </div></> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Diesel Issued / Added" value={`${number(row.diesel)} L`} /><Detail label="Diesel Source" value={dash(row.dieselSource).replace("_", " ")} />{isPlantStock && <><Detail label="Opening Tank (L)" value={`${number(row.openingDiesel)} L`} /><Detail label="Closing Tank / Physical Dip (L)" value={`${number(row.dieselBalanceInTank)} L`} /><Detail label="Physical Tank Balance" value={row.dieselBalanceConfirmed ? "Confirmed" : tankKnown ? "Pending confirmation" : "—"} emphasis /></>}</div>}
       </section>}

      {!editable && isPlantStock && <section className="border-t border-slate-200 bg-amber-50/40 p-4 dark:border-slate-700 dark:bg-amber-950/10">
        <SectionHeading><span className="flex items-center gap-2"><Droplets className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Fuel Performance</span></SectionHeading>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Detail label="Actual Consumed" value={fuel.actualConsumed == null ? "Awaiting tank dip" : `${number(fuel.actualConsumed)} L`} emphasis />
          <Detail label="Expected" value={fuel.expectedDiesel == null ? "—" : `${number(fuel.expectedDiesel)} L`} />
          <Detail label="Variance" value={fuel.variance == null ? "—" : `${fuel.variance > 0 ? "+" : ""}${number(fuel.variance)} L`} emphasis />
           <Detail label={hasConfirmedActualRate ? "Actual Consumption Rate · from confirmed tank dip" : "Expected Consumption Rate · from norm, actual unavailable"} value={hasConfirmedActualRate ? `${number(fuel.actualRate)} ${fuel.actualRateUnit}` : consumptionNorm == null ? "—" : `${number(consumptionNorm)} ${consumptionNormUnit}`} emphasis />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">Variance is actual consumed minus expected; a positive value means more fuel was consumed than expected.</p>
      </section>}
      {!editable && tankKnown && !row.dieselBalanceConfirmed && <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-300">Physical tank balance has not been confirmed.</div>}
      </>}
      <div className={editable && !expanded ? "hidden" : undefined}>
       {editable ? <section className="border-t border-slate-200 px-3 py-3 sm:px-4 dark:border-slate-700" data-testid={`equipment-compact-incidental-work-${index}`}>
         <div>
           <Label htmlFor={`equipment-compact-incidental-task-${index}`} className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">Non-BOQ / Incidental Work (optional)</Label>
           <Textarea
             id={`equipment-compact-incidental-task-${index}`}
             className="mt-1.5 min-h-20 bg-white text-sm dark:bg-slate-950/50"
             value={row.task ?? ""}
             onChange={event => onChange?.({ task: event.target.value })}
             placeholder="Describe work with no BOQ item"
             aria-describedby={`equipment-compact-incidental-task-help-${index}`}
             data-testid={`equipment-compact-incidental-task-${index}`}
           />
           <p id={`equipment-compact-incidental-task-help-${index}`} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Use this only for work that has no BOQ item and is not payable progress — e.g. an incidental repair or diversion.</p>
         </div>
       </section> : incidentalTask ? <section className="border-t border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/20" data-testid={`equipment-compact-incidental-work-${index}`}>
         <SectionHeading>Non-BOQ / Incidental Work</SectionHeading>
         <p className="whitespace-pre-wrap text-sm font-medium text-slate-800 dark:text-slate-100" data-testid={`equipment-compact-incidental-task-value-${index}`}>{incidentalTask}</p>
         <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">Not a BOQ item — not payable progress.</p>
       </section> : null}
      <EquipmentActivityAllocationEditor value={activitySegments} onChange={editable && (onWorkAssignmentChange || onChange) ? activitySegments => onWorkAssignmentChange ? onWorkAssignmentChange(activitySegments) : onChange?.({ activitySegments, activityAllocations: undefined }) : undefined} parentHours={allocationParent.hours} parentStartTime={row.startTime} parentEndTime={row.endTime} boqItems={boqItems} programmeBars={programmeBars} editable={editable} preserveInitialValueUntilChange={usingLegacyActivityAssignment} />
      </div>
    </article>
  );
}