import { useEffect, useMemo } from "react";
import { AlertTriangle, Clock3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateEquipmentAllocationHours, formatEquipmentAllocationDuration, validateEquipmentActivityAllocations, type EquipmentActivityAllocationInput } from "@shared/equipmentActivityAllocations";
import { formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";

export type EquipmentActivityAllocation = EquipmentActivityAllocationInput;
type BoqItem = { id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null };
type ProgrammeBar = { id: number; boqItemId: number; reachLabel?: string | null; side?: string | null };

export function EquipmentActivityAllocationEditor({ value = [], onChange, boqItems = [], programmeBars = [], parentHours, parentStartTime, parentEndTime, editable = true }: {
  value?: EquipmentActivityAllocation[]; onChange?: (value: EquipmentActivityAllocation[]) => void; boqItems?: BoqItem[]; programmeBars?: ProgrammeBar[];
  parentHours?: number | null; parentStartTime?: string | null; parentEndTime?: string | null; editable?: boolean;
}) {
  const itemName = (id: number) => dprBoqItemDisplayName(boqItems.find(item => item.id === id));
  const barsFor = (id: number) => Array.from(
    new Map(programmeBars.filter(bar => bar.boqItemId === id).map(bar => [bar.id, bar])).values(),
  );
  const result = useMemo(() => { try { return validateEquipmentActivityAllocations(value, parentHours, { startTime: parentStartTime, endTime: parentEndTime }); } catch { return null; } }, [value, parentHours, parentStartTime, parentEndTime]);
  const errors = useMemo(() => {
    const list: string[] = [];
    value.forEach((row, i) => {
      const activity = itemName(row.boqItemId) || `Assignment ${i + 1}`;
      if (!row.boqItemId) list.push(`Assignment ${i + 1}: select a BOQ Item.`);
      if (!row.startTime) list.push(`${activity}: enter Start Time.`);
      if (!row.endTime) list.push(`${activity}: enter End Time.`);
      if (row.startTime && row.endTime && calculateEquipmentAllocationHours(row.startTime, row.endTime) == null) list.push(`${activity}: End Time must be later than Start Time.`);
      if (parentStartTime && row.startTime && row.startTime < parentStartTime) list.push(`${activity}: Start Time cannot be before the machine-day Start Time.`);
      if (parentEndTime && row.endTime && row.endTime > parentEndTime) list.push(`${activity}: End Time cannot be after the machine-day End Time.`);
    });
    const chronological = value.map((row, i) => ({ ...row, i })).filter(row => row.startTime && row.endTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
    chronological.slice(1).forEach((row, i) => {
      const activity = itemName(row.boqItemId) || `Assignment ${row.i + 1}`;
      if (row.startTime === chronological[i].startTime && row.endTime === chronological[i].endTime) list.push(`${activity} duplicates another assignment time segment.`);
      else if (row.startTime < chronological[i].endTime) list.push(`${activity} overlaps another assignment.`);
    });
    if (result == null && value.length && parentHours != null && value.reduce((sum, row) => sum + (calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0), 0) > parentHours) list.push("Assigned time exceeds the machine-day Clock Duration.");
    return Array.from(new Set(list));
  }, [value, parentHours, parentStartTime, parentEndTime, result, boqItems]);
  const patch = (index: number, next: Partial<EquipmentActivityAllocation>) => onChange?.(value.map((row, i) => i === index ? { ...row, ...next } : row));
  const add = () => {
    const previous = value[value.length - 1];
    onChange?.([...value, { boqItemId: 0, programmeBarId: null, startTime: previous?.endTime || (value.length === 0 ? parentStartTime ?? "" : ""), endTime: value.length === 0 ? parentEndTime ?? "" : "" }]);
  };
  const remove = (index: number) => onChange?.(value.filter((_, i) => i !== index));
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
    return <section className="border-t border-slate-200 p-4 dark:border-slate-700"><div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200"><Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Work Assignment</div>{value.length ? <div className="grid gap-3 sm:grid-cols-2">{value.map((row, i) => (
      <div key={i} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/25"><div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{itemName(row.boqItemId) || "BOQ activity unavailable"}</div><div className="mt-2 text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatEquipmentTime(row.startTime)} → {formatEquipmentTime(row.endTime)}</div><div className="mt-1 text-base font-bold tabular-nums">{formatEquipmentDuration(row.hoursWorked ?? calculateEquipmentAllocationHours(row.startTime, row.endTime))}</div></div>
    ))}</div> : <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20">No BOQ item assigned to this machine day.</div>}<AssignmentTotals assigned={totals.allocatedHours} unassigned={totals.unallocatedHours} parentHours={parentHours} /></section>;
  }
  return <section className="border-t border-slate-200 p-4 dark:border-slate-700" data-testid="equipment-activity-allocations">
    <div className="mb-4"><div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200"><Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Work Assignment</div><div className="mt-1 text-sm text-muted-foreground">Assign BOQ items to this machine day. Partial assignment is allowed.</div></div>
    <div className="space-y-3">{value.map((row, i) => {
      return <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-950/25">
        <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">BOQ Item</Label><Select value={row.boqItemId ? String(row.boqItemId) : ""} onValueChange={v => { const boqItemId = Number(v); const matches = barsFor(boqItemId); patch(i, { boqItemId, programmeBarId: matches.length === 1 ? matches[0].id : null }); }}><SelectTrigger className="mt-1 h-11 bg-white text-sm dark:bg-slate-900"><SelectValue placeholder="Select BOQ Item" /></SelectTrigger><SelectContent>{boqItems.map(item => <SelectItem key={item.id} value={String(item.id)}>{dprBoqItemDisplayName(item)}</SelectItem>)}</SelectContent></Select></div>
        <div className="mt-3 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Start Time</Label><div className="relative"><Input className="mt-1 h-12 min-w-0 bg-white px-3 pr-10 text-base tabular-nums dark:bg-slate-900 [&::-webkit-calendar-picker-indicator]:opacity-0" type="time" value={row.startTime} onChange={e => patch(i, { startTime: e.target.value })} /><Clock3 className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-500" aria-hidden="true" /></div></div>
          <div><Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">End Time</Label><div className="relative"><Input className="mt-1 h-12 min-w-0 bg-white px-3 pr-10 text-base tabular-nums dark:bg-slate-900 [&::-webkit-calendar-picker-indicator]:opacity-0" type="time" value={row.endTime} onChange={e => patch(i, { endTime: e.target.value })} /><Clock3 className="pointer-events-none absolute right-3 top-4 h-4 w-4 text-slate-500" aria-hidden="true" /></div></div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3"><div><div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Duration</div><div className="mt-1 text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatEquipmentAllocationDuration(row.startTime, row.endTime)}</div></div>
        <Button type="button" variant="ghost" className="min-h-10 gap-2 px-3 text-sm text-slate-600 hover:text-destructive" onClick={() => remove(i)} aria-label={`Remove ${itemName(row.boqItemId) || "assignment"}`}><Trash2 className="h-4 w-4" /> Remove</Button></div>
      </div>;
    })}</div>
    {value.length > 0 && <Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 gap-2 border-amber-300 bg-amber-50 px-3 text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" onClick={add}><Plus className="h-4 w-4" /> Add Item</Button>}
    {!value.length && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-4 py-4 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20"><p>No BOQ item assigned to this machine day.</p><Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 border-amber-300 bg-amber-50 px-4 text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" onClick={add}>Assign Item</Button></div>}
    <AssignmentTotals assigned={totals.allocatedHours} unassigned={totals.unallocatedHours} parentHours={parentHours} />
    {errors.length > 0 && <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/25 dark:text-amber-300">{errors.map(error => <div key={error} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>)}</div>}
  </section>;
}

function AssignmentTotals({ assigned, unassigned, parentHours }: { assigned: number; unassigned: number | null; parentHours?: number | null }) {
  return <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700"><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm tabular-nums"><span className="font-bold text-slate-900 dark:text-slate-100">Assigned: {formatEquipmentDuration(assigned)}</span>{parentHours != null && <><span className={unassigned === 0 ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}>Unassigned: {formatEquipmentDuration(unassigned ?? 0)}</span><span className="text-slate-700 dark:text-slate-300">Machine Day: {formatEquipmentDuration(parentHours)}</span></>}</div>{parentHours != null && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Assignment validation uses the machine-day Clock Duration ({formatEquipmentDuration(parentHours)}). Assignment segments are clock times; gaps and partial assignment are allowed.</p>}</div>;
}