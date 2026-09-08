import { useEffect, useMemo } from "react";
import { AlertTriangle, Clock3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateEquipmentAllocationHours, formatEquipmentAllocationDuration, validateEquipmentActivityAllocations, type EquipmentActivityAllocationInput, type EquipmentAllocationParentBasis } from "@shared/equipmentActivityAllocations";
import { formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";

export type EquipmentActivityAllocation = EquipmentActivityAllocationInput;
type BoqItem = { id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null };
type ProgrammeBar = { id: number; boqItemId: number; reachLabel?: string | null; side?: string | null };

export function EquipmentActivityAllocationEditor({ value = [], onChange, boqItems = [], programmeBars = [], parentHours, parentBasis = "none", parentStartTime, parentEndTime, editable = true }: {
  value?: EquipmentActivityAllocation[]; onChange?: (value: EquipmentActivityAllocation[]) => void; boqItems?: BoqItem[]; programmeBars?: ProgrammeBar[];
  parentHours?: number | null; parentBasis?: EquipmentAllocationParentBasis; parentStartTime?: string | null; parentEndTime?: string | null; editable?: boolean;
}) {
  const itemName = (id: number) => dprBoqItemDisplayName(boqItems.find(item => item.id === id));
  const barsFor = (id: number) => programmeBars.filter(bar => bar.boqItemId === id);
  const result = useMemo(() => { try { return validateEquipmentActivityAllocations(value, parentHours); } catch { return null; } }, [value, parentHours]);
  const errors = useMemo(() => {
    const list: string[] = [];
    value.forEach((row, i) => {
      const activity = itemName(row.boqItemId) || `Activity ${i + 1}`;
      if (!row.boqItemId) list.push(`Activity ${i + 1}: select a BOQ Activity.`);
      if (!row.startTime) list.push(`${activity}: enter Start Time.`);
      if (!row.endTime) list.push(`${activity}: enter End Time.`);
      if (row.startTime && row.endTime && calculateEquipmentAllocationHours(row.startTime, row.endTime) == null) list.push(`${activity}: End Time must be later than Start Time.`);
    });
    const chronological = value.map((row, i) => ({ ...row, i })).filter(row => row.startTime && row.endTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
    chronological.slice(1).forEach((row, i) => {
      const activity = itemName(row.boqItemId) || `Activity ${row.i + 1}`;
      if (row.startTime === chronological[i].startTime && row.endTime === chronological[i].endTime) list.push(`${activity} duplicates another equipment activity time segment.`);
      else if (row.startTime < chronological[i].endTime) list.push(`${activity} overlaps another equipment activity.`);
    });
    if (result == null && value.length && parentHours != null && value.reduce((sum, row) => sum + (calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0), 0) > parentHours) list.push(`Allocated time exceeds the ${parentBasis === "meter_working_hours" ? "Meter Working Hours" : "Clock Duration"} limit.`);
    return Array.from(new Set(list));
  }, [value, parentHours, parentBasis, result, boqItems]);
  const patch = (index: number, next: Partial<EquipmentActivityAllocation>) => onChange?.(value.map((row, i) => i === index ? { ...row, ...next } : row));
  const add = () => {
    const previous = value[value.length - 1];
    onChange?.([...value, { boqItemId: 0, programmeBarId: null, startTime: previous?.endTime || (value.length === 0 ? parentStartTime ?? "" : ""), endTime: value.length === 0 ? parentEndTime ?? "" : "" }]);
  };
  const remove = (index: number) => onChange?.(value.filter((_, i) => i !== index));
  const workReachName = (bar: ProgrammeBar, index: number) => {
    const reach = bar.reachLabel?.replace(/#\d+/g, "").replace(/^[\s·\-–—]+|[\s·\-–—]+$/g, "").trim();
    const side = bar.side?.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
    return [reach || `Reach ${index + 1}`, side].filter(Boolean).join(" · ");
  };
  const totals = result ?? { allocatedHours: value.reduce((sum, row) => sum + (calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0), 0), unallocatedHours: parentHours == null ? null : Math.max(0, parentHours - value.reduce((sum, row) => sum + (calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0), 0)) };

  useEffect(() => {
    if (!editable || !onChange || !value.length) return;
    let changed = false;
    const next = value.map((row, index) => {
      const patch: Partial<EquipmentActivityAllocation> = {};
      if (index === 0 && !row.startTime && parentStartTime) patch.startTime = parentStartTime;
      if (value.length === 1 && !row.endTime && parentEndTime) patch.endTime = parentEndTime;
      const bars = barsFor(row.boqItemId);
      if (row.boqItemId > 0 && row.programmeBarId == null && bars.length === 1) patch.programmeBarId = bars[0].id;
      if (!Object.keys(patch).length) return row;
      changed = true;
      return { ...row, ...patch };
    });
    if (changed) onChange(next);
  }, [editable, onChange, value, parentStartTime, parentEndTime, programmeBars]);

  if (!editable) {
    return <section className="border-t border-slate-200 p-4 dark:border-slate-700"><div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200"><Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Work Allocation</div>{value.length ? <div className="grid gap-3 sm:grid-cols-2">{value.map((row, i) => {
      const bars = barsFor(row.boqItemId);
      const selectedBar = row.programmeBarId == null ? null : bars.find(bar => bar.id === row.programmeBarId) ?? null;
      return <div key={i} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/25"><div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{itemName(row.boqItemId) || "BOQ activity unavailable"}</div>{selectedBar && <div className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">{workReachName(selectedBar, bars.indexOf(selectedBar))}</div>}<div className="mt-2 text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatEquipmentTime(row.startTime)} → {formatEquipmentTime(row.endTime)}</div><div className="mt-1 text-base font-bold tabular-nums">{formatEquipmentDuration(row.hoursWorked ?? calculateEquipmentAllocationHours(row.startTime, row.endTime))}</div></div>;
    })}</div> : <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20">No BOQ work allocated.</div>}<AllocationTotals allocated={totals.allocatedHours} unallocated={totals.unallocatedHours} parentHours={parentHours} parentBasis={parentBasis} /></section>;
  }
  return <section className="border-t border-slate-200 p-4 dark:border-slate-700" data-testid="equipment-activity-allocations">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200"><Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Work Allocation</div><div className="mt-1 text-sm text-muted-foreground">Split the machine day across BOQ work. Partial allocation is allowed.</div></div><Button type="button" size="sm" variant="outline" className="min-h-10 gap-2 border-amber-300 bg-amber-50 px-3 text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" onClick={add}><Plus className="h-4 w-4" /> Add another activity</Button></div>
    <div className="space-y-3">{value.map((row, i) => {
      const bars = barsFor(row.boqItemId); const needsBarPicker = bars.length > 1;
      return <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/25">
        <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">BOQ Activity</Label><Select value={row.boqItemId ? String(row.boqItemId) : ""} onValueChange={v => { const boqItemId = Number(v); const matches = barsFor(boqItemId); patch(i, { boqItemId, programmeBarId: matches.length === 1 ? matches[0].id : null }); }}><SelectTrigger className="mt-1 h-11 bg-white text-sm dark:bg-slate-900"><SelectValue placeholder="Select BOQ item / activity" /></SelectTrigger><SelectContent>{boqItems.map(item => <SelectItem key={item.id} value={String(item.id)}>{dprBoqItemDisplayName(item)}</SelectItem>)}</SelectContent></Select></div>
        {needsBarPicker && <div className="mt-3"><Label className="text-xs font-semibold text-amber-800 dark:text-amber-300">Which work reach?</Label><Select value={row.programmeBarId ? String(row.programmeBarId) : ""} onValueChange={v => patch(i, { programmeBarId: Number(v) })}><SelectTrigger className="mt-1 h-11 bg-amber-50 text-sm dark:bg-amber-950/30"><SelectValue placeholder="Choose the work reach" /></SelectTrigger><SelectContent>{bars.map((bar, barIndex) => <SelectItem key={bar.id} value={String(bar.id)}>{workReachName(bar, barIndex)}</SelectItem>)}</SelectContent></Select></div>}
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Start Time</Label><div className="relative"><Input className="mt-1 h-12 min-w-0 bg-white px-3 pr-10 text-base tabular-nums dark:bg-slate-900 [&::-webkit-calendar-picker-indicator]:opacity-0" type="time" value={row.startTime} onChange={e => patch(i, { startTime: e.target.value })} /><Clock3 className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-500" aria-hidden="true" /></div></div>
          <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">End Time</Label><div className="relative"><Input className="mt-1 h-12 min-w-0 bg-white px-3 pr-10 text-base tabular-nums dark:bg-slate-900 [&::-webkit-calendar-picker-indicator]:opacity-0" type="time" value={row.endTime} onChange={e => patch(i, { endTime: e.target.value })} /><Clock3 className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-500" aria-hidden="true" /></div></div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3"><div><div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Duration</div><div className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatEquipmentAllocationDuration(row.startTime, row.endTime)}</div></div>
        <Button type="button" variant="ghost" className="min-h-10 gap-2 px-3 text-sm text-slate-600 hover:text-destructive" onClick={() => remove(i)} aria-label={`Remove ${itemName(row.boqItemId) || "activity"}`}><Trash2 className="h-4 w-4" /> Remove</Button></div>
      </div>;
    })}</div>
    {!value.length && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20">No BOQ work allocated. Add an activity to split this machine day.</div>}
    <AllocationTotals allocated={totals.allocatedHours} unallocated={totals.unallocatedHours} parentHours={parentHours} parentBasis={parentBasis} />
    {errors.length > 0 && <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/25 dark:text-amber-300">{errors.map(error => <div key={error} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>)}</div>}
  </section>;
}

function AllocationTotals({ allocated, unallocated, parentHours, parentBasis }: { allocated: number; unallocated: number | null; parentHours?: number | null; parentBasis: EquipmentAllocationParentBasis }) {
  const basisLabel = parentBasis === "meter_working_hours" ? "Meter Working Hours" : "Clock Duration";
  return <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700"><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm tabular-nums"><span className="font-bold text-slate-900 dark:text-slate-100">Allocated: {formatEquipmentDuration(allocated)}</span>{parentHours != null && <><span className={unallocated === 0 ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}>Unallocated: {formatEquipmentDuration(unallocated ?? 0)}</span><span className="text-slate-700 dark:text-slate-300">Machine Day: {formatEquipmentDuration(parentHours)}</span></>}</div>{parentHours != null && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Allocation validation limit uses {basisLabel} ({formatEquipmentDuration(parentHours)}). Activity segments are clock times; partial time is allowed, but their total cannot exceed this limit.</p>}</div>;
}