import { useEffect, useMemo } from "react";
import { AlertTriangle, Clock3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateEquipmentAllocationHours, formatEquipmentAllocationDuration } from "@shared/equipmentActivityAllocations";
import { formatEquipmentDuration, formatEquipmentTime } from "@shared/equipmentUsage";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";

export type EquipmentActivitySegmentBoqItem = {
  boqItemId: number;
  programmeBarId?: number | null;
};

export type EquipmentActivitySegment = {
  startTime: string;
  endTime: string;
  hoursWorked?: number;
  boqItems: EquipmentActivitySegmentBoqItem[];
};

type BoqItem = { id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null };
type ProgrammeBar = { id: number; boqItemId: number; reachLabel?: string | null; side?: string | null };

export function EquipmentActivityAllocationEditor({ value = [], onChange, boqItems = [], programmeBars = [], parentHours, parentStartTime, parentEndTime, editable = true, preserveInitialValueUntilChange = false }: {
  value?: EquipmentActivitySegment[]; onChange?: (value: EquipmentActivitySegment[]) => void; boqItems?: BoqItem[]; programmeBars?: ProgrammeBar[];
  parentHours?: number | null; parentStartTime?: string | null; parentEndTime?: string | null; editable?: boolean;
  preserveInitialValueUntilChange?: boolean;
}) {
  const itemName = (id: number) => {
    const item = boqItems.find(candidate => candidate.id === id);
    return dprBoqItemDisplayName(item);
  };
  const barsFor = (id: number) => Array.from(
    new Map(programmeBars.filter(bar => bar.boqItemId === id).map(bar => [bar.id, bar])).values(),
  );
  const duration = (segment: EquipmentActivitySegment) =>
    calculateEquipmentAllocationHours(segment.startTime, segment.endTime);
  const allocatedHours = value.reduce((sum, segment) => sum + (duration(segment) ?? 0), 0);
  const unallocatedHours = parentHours == null ? null : Math.max(0, parentHours - allocatedHours);

  const warnings = useMemo(() => value.map((segment, index) => {
    const list: string[] = [];
    if (!segment.startTime) list.push("Enter Start Time.");
    if (!segment.endTime) list.push("Enter End Time.");
    if (segment.startTime && segment.endTime && duration(segment) == null) list.push("End Time must be later than Start Time.");
    if (parentStartTime && segment.startTime && segment.startTime < parentStartTime) list.push("Start Time cannot be before the machine-day Start Time.");
    if (parentEndTime && segment.endTime && segment.endTime > parentEndTime) list.push("End Time cannot be after the machine-day End Time.");
    segment.boqItems.forEach((item, itemIndex) => {
      if (!item.boqItemId) list.push(`BOQ Item ${itemIndex + 1}: select a BOQ Item.`);
    });
    value.forEach((other, otherIndex) => {
      if (otherIndex === index || !segment.startTime || !segment.endTime || !other.startTime || !other.endTime) return;
      if (segment.startTime === other.startTime && segment.endTime === other.endTime) list.push("This time segment duplicates another segment.");
      else if (segment.startTime < other.endTime && segment.endTime > other.startTime) list.push("This time segment overlaps another segment.");
    });
    const selected = segment.boqItems.map(item => item.boqItemId).filter(Boolean);
    if (new Set(selected).size !== selected.length) list.push("The same BOQ Item is assigned more than once in this segment.");
    if (parentHours != null && allocatedHours > parentHours) list.push("Assigned time exceeds the machine-day Clock Duration.");
    return Array.from(new Set(list));
  }), [value, parentHours, parentStartTime, parentEndTime]);

  const patchSegment = (index: number, patch: Partial<EquipmentActivitySegment>) =>
    onChange?.(value.map((segment, i) => i === index ? { ...segment, ...patch } : segment));
  const patchBoqItem = (segmentIndex: number, itemIndex: number, boqItemId: number) => {
    const bars = barsFor(boqItemId);
    patchSegment(segmentIndex, {
      boqItems: value[segmentIndex].boqItems.map((item, i) => i === itemIndex
        ? { boqItemId, programmeBarId: bars.length === 1 ? bars[0].id : null }
        : item),
    });
  };
  const addBoqItem = (segmentIndex: number) =>
    patchSegment(segmentIndex, { boqItems: [...value[segmentIndex].boqItems, { boqItemId: 0, programmeBarId: null }] });
  const removeBoqItem = (segmentIndex: number, itemIndex: number) => {
    const remaining = value[segmentIndex].boqItems.filter((_, i) => i !== itemIndex);
    if (remaining.length) patchSegment(segmentIndex, { boqItems: remaining });
    else onChange?.(value.filter((_, i) => i !== segmentIndex));
  };
  const addSegment = () => {
    const previous = value[value.length - 1];
    onChange?.([...value, {
      startTime: previous?.endTime || (value.length === 0 ? parentStartTime ?? "" : ""),
      endTime: value.length === 0 ? parentEndTime ?? "" : "",
      boqItems: [{ boqItemId: 0, programmeBarId: null }],
    }]);
  };
  const removeSegment = (index: number) => onChange?.(value.filter((_, i) => i !== index));

  useEffect(() => {
    if (!editable || !onChange || !value.length || preserveInitialValueUntilChange) return;
    let changed = false;
    const next = value.map((segment, index) => {
      const nextSegment = { ...segment, boqItems: segment.boqItems.map(item => {
        const bars = barsFor(item.boqItemId);
        if (item.boqItemId > 0 && item.programmeBarId == null && bars.length === 1) {
          changed = true;
          return { ...item, programmeBarId: bars[0].id };
        }
        return item;
      }) };
      if (index === 0 && !nextSegment.startTime && parentStartTime) {
        nextSegment.startTime = parentStartTime;
        changed = true;
      }
      if (value.length === 1 && !nextSegment.endTime && parentEndTime) {
        nextSegment.endTime = parentEndTime;
        changed = true;
      }
      return nextSegment;
    });
    if (changed) onChange(next);
  }, [editable, onChange, value, parentStartTime, parentEndTime, programmeBars, preserveInitialValueUntilChange]);

  if (!editable) {
    return <section className="border-t border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200"><Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Work Assignment</div>
      {value.length ? <div className="grid gap-3 sm:grid-cols-2">{value.map((segment, i) => (
        <div key={i} className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/25">
          <div className="space-y-1">{segment.boqItems.map((item, itemIndex) => <div key={itemIndex} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{itemName(item.boqItemId) || "BOQ activity unavailable"}</div>)}</div>
          <div className="mt-2 text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatEquipmentTime(segment.startTime)} → {formatEquipmentTime(segment.endTime)}</div>
          <div className="mt-1 text-base font-bold tabular-nums">{formatEquipmentDuration(segment.hoursWorked ?? duration(segment))}</div>
        </div>
      ))}</div> : <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20">No BOQ item assigned to this machine day.</div>}
      <AssignmentTotals assigned={allocatedHours} unassigned={unallocatedHours} parentHours={parentHours} />
    </section>;
  }

  return <section className="border-t border-slate-200 px-3 py-3 sm:px-4 dark:border-slate-700" data-testid="equipment-activity-allocations">
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200"><Clock3 className="h-4 w-4 text-amber-700 dark:text-amber-400" /> Work Assignment</div><div className="mt-0.5 text-xs text-muted-foreground">Physical work segments · BOQ only</div></div><AssignmentTotals assigned={allocatedHours} unassigned={unallocatedHours} parentHours={parentHours} compact /></div>
    <div className="space-y-2">{value.map((segment, segmentIndex) => (
      <div key={segmentIndex} className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-950/25" data-testid={`equipment-activity-segment-${segmentIndex}`}>
        <div className="relative grid grid-cols-2 items-end gap-2 sm:flex">
          <div className="col-span-2 min-w-0 pr-12 sm:flex-1 sm:pr-0"><Label className="text-xs font-bold uppercase tracking-wide text-slate-500">BOQ Item</Label><Select value={segment.boqItems[0]?.boqItemId ? String(segment.boqItems[0].boqItemId) : ""} onValueChange={v => patchBoqItem(segmentIndex, 0, Number(v))}><SelectTrigger className="mt-1 h-11 bg-white text-sm sm:h-9 dark:bg-slate-900"><SelectValue placeholder="Select BOQ Item" /></SelectTrigger><SelectContent>{boqItems.map(option => <SelectItem key={option.id} value={String(option.id)}>{dprBoqItemDisplayName(option)}</SelectItem>)}</SelectContent></Select></div>
          <div className="sm:w-[140px] sm:flex-none"><Label className="text-xs font-bold uppercase tracking-wide text-slate-500">Start Time</Label><Input className="mt-1 h-11 min-w-0 bg-white px-2 text-sm tabular-nums sm:h-9 dark:bg-slate-900" type="time" value={segment.startTime} onChange={e => patchSegment(segmentIndex, { startTime: e.target.value, hoursWorked: undefined })} /></div>
          <div className="sm:w-[140px] sm:flex-none"><Label className="text-xs font-bold uppercase tracking-wide text-slate-500">End Time</Label><Input className="mt-1 h-11 min-w-0 bg-white px-2 text-sm tabular-nums sm:h-9 dark:bg-slate-900" type="time" value={segment.endTime} onChange={e => patchSegment(segmentIndex, { endTime: e.target.value, hoursWorked: undefined })} /></div>
          <div className="sm:w-[78px] sm:flex-none"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Segment Duration</div><div className="mt-2 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatEquipmentAllocationDuration(segment.startTime, segment.endTime)}</div></div>
          <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-[18px] h-11 w-11 text-slate-600 hover:text-destructive sm:static sm:h-9 sm:w-9 sm:flex-none" onClick={() => removeSegment(segmentIndex)} aria-label={`Remove segment ${segmentIndex + 1}`}><Trash2 className="h-4 w-4" /></Button>
        </div>
        {segment.boqItems.slice(1).map((item, additionalIndex) => {
          const itemIndex = additionalIndex + 1;
          return <div key={itemIndex} className="mt-2 flex items-end gap-2">
            <div className="min-w-0 flex-1"><Label className="text-xs font-bold uppercase tracking-wide text-slate-500">Additional BOQ Item</Label><Select value={item.boqItemId ? String(item.boqItemId) : ""} onValueChange={v => patchBoqItem(segmentIndex, itemIndex, Number(v))}><SelectTrigger className="mt-1 h-11 bg-white text-sm sm:h-9 dark:bg-slate-900"><SelectValue placeholder="Select BOQ Item" /></SelectTrigger><SelectContent>{boqItems.map(option => <SelectItem key={option.id} value={String(option.id)}>{dprBoqItemDisplayName(option)}</SelectItem>)}</SelectContent></Select></div>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-slate-600 hover:text-destructive sm:h-9 sm:w-9" onClick={() => removeBoqItem(segmentIndex, itemIndex)} aria-label={`Remove ${itemName(item.boqItemId) || "BOQ item"}`}><Trash2 className="h-4 w-4" /></Button>
          </div>;
        })}
        <Button type="button" size="sm" variant="ghost" className="mt-2 min-h-9 gap-2 text-amber-800 dark:text-amber-300" onClick={() => addBoqItem(segmentIndex)}><Plus className="h-4 w-4" /> Add BOQ Item</Button>
        {warnings[segmentIndex]?.length > 0 && <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/25 dark:text-amber-300">{warnings[segmentIndex].map(warning => <div key={warning} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{warning}</div>)}</div>}
      </div>
    ))}</div>
    {value.length > 0 && <Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 gap-2 border-amber-300 bg-amber-50 px-3 text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" onClick={addSegment}><Plus className="h-4 w-4" /> Add Item</Button>}
    {!value.length && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-4 py-4 text-center text-sm text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20"><p>No BOQ item assigned to this machine day.</p><Button type="button" size="sm" variant="outline" className="mt-3 min-h-10 border-amber-300 bg-amber-50 px-4 text-sm text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" onClick={addSegment}>Assign Item</Button></div>}
  </section>;
}


function AssignmentTotals({ assigned, unassigned, parentHours, compact = false }: { assigned: number; unassigned: number | null; parentHours?: number | null; compact?: boolean }) {
  if (compact) return <div className="rounded bg-slate-100 px-2 py-1 text-[11px] tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300"><strong className="text-slate-800 dark:text-slate-100">{formatEquipmentDuration(assigned)}</strong> assigned{parentHours != null ? ` / ${formatEquipmentDuration(parentHours)}` : ""}{unassigned != null && unassigned > 0 ? <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300">· {formatEquipmentDuration(unassigned)} unassigned</span> : null}</div>;
  return <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700"><div className="flex flex-wrap gap-x-5 gap-y-2 text-sm tabular-nums"><span className="font-bold text-slate-900 dark:text-slate-100">Assigned: {formatEquipmentDuration(assigned)}</span>{parentHours != null && <><span className={unassigned === 0 ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}>Unassigned: {formatEquipmentDuration(unassigned ?? 0)}</span><span className="text-slate-700 dark:text-slate-300">Machine Day: {formatEquipmentDuration(parentHours)}</span></>}</div>{parentHours != null && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Assignment validation uses the machine-day Clock Duration ({formatEquipmentDuration(parentHours)}). Assignment segments are clock times; gaps and partial assignment are allowed.</p>}</div>;
}