import { useEffect, useMemo } from "react";
import { AlertTriangle, Clock3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { calculateEquipmentAllocationHours, validateEquipmentActivityAllocations, type EquipmentActivityAllocationInput } from "@shared/equipmentActivityAllocations";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";

export type EquipmentActivityAllocation = EquipmentActivityAllocationInput;
type BoqItem = { id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null };
type ProgrammeBar = { id: number; boqItemId: number; reachLabel?: string | null; side?: string | null };

export function EquipmentActivityAllocationEditor({ value = [], onChange, boqItems = [], programmeBars = [], parentHours, parentStartTime, parentEndTime, editable = true }: {
  value?: EquipmentActivityAllocation[]; onChange?: (value: EquipmentActivityAllocation[]) => void; boqItems?: BoqItem[]; programmeBars?: ProgrammeBar[];
  parentHours?: number | null; parentStartTime?: string | null; parentEndTime?: string | null; editable?: boolean;
}) {
  const result = useMemo(() => { try { return validateEquipmentActivityAllocations(value, parentHours); } catch { return null; } }, [value, parentHours]);
  const errors = useMemo(() => {
    const list: string[] = [];
    value.forEach((row, i) => {
      if (!row.boqItemId) list.push(`Allocation ${i + 1}: select a BOQ item.`);
      if (!row.startTime) list.push(`Allocation ${i + 1}: enter Start.`);
      if (!row.endTime) list.push(`Allocation ${i + 1}: enter End.`);
      if (row.startTime && row.endTime && calculateEquipmentAllocationHours(row.startTime, row.endTime) == null) list.push(`Allocation ${i + 1}: End must be later than Start.`);
    });
    const chronological = value.map((row, i) => ({ ...row, i })).filter(row => row.startTime && row.endTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
    chronological.slice(1).forEach((row, i) => { if (row.startTime < chronological[i].endTime) list.push(`Allocation ${row.i + 1}: time overlaps another segment.`); });
    if (result == null && value.length && parentHours != null && value.reduce((sum, row) => sum + (calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0), 0) > parentHours) list.push("Allocated time exceeds parent operating time.");
    return Array.from(new Set(list));
  }, [value, parentHours, result]);
  const patch = (index: number, next: Partial<EquipmentActivityAllocation>) => onChange?.(value.map((row, i) => i === index ? { ...row, ...next } : row));
  const add = () => {
    const previous = value[value.length - 1];
    onChange?.([...value, { boqItemId: 0, programmeBarId: null, startTime: previous?.endTime || (value.length === 0 ? parentStartTime ?? "" : ""), endTime: value.length === 0 ? parentEndTime ?? "" : "" }]);
  };
  const remove = (index: number) => onChange?.(value.filter((_, i) => i !== index));
  const itemName = (id: number) => dprBoqItemDisplayName(boqItems.find(item => item.id === id));
  const barsFor = (id: number) => programmeBars.filter(bar => bar.boqItemId === id);
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
    if (!value.length) return null;
    return <section className="border-t border-slate-200 px-3 py-2.5 dark:border-slate-700"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500"><Clock3 className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /> Work allocation</div><div className="space-y-1">{value.map((row, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 text-xs"><span className="truncate font-medium">{itemName(row.boqItemId) || `BOQ #${row.boqItemId}`}</span><span className="tabular-nums">{row.startTime}–{row.endTime}</span><span className="font-semibold tabular-nums">{Number(row.hoursWorked ?? calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0).toFixed(2)} h</span></div>)}</div><AllocationTotals allocated={totals.allocatedHours} unallocated={totals.unallocatedHours} parentHours={parentHours} /></section>;
  }
  return <section className="border-t border-slate-200 px-3 py-2.5 dark:border-slate-700" data-testid="equipment-activity-allocations">
    <div className="mb-2 flex items-center justify-between gap-2"><div><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500"><Clock3 className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" /> Work allocation</div><div className="text-[11px] text-muted-foreground">Split the machine day across BOQ work.</div></div><Button type="button" size="sm" variant="outline" className="h-7 gap-1 border-amber-300 bg-amber-50 px-2 text-xs text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" onClick={add}><Plus className="h-3 w-3" /> Add allocation</Button></div>
    <div className="space-y-1.5">{value.map((row, i) => {
      const bars = barsFor(row.boqItemId); const hours = calculateEquipmentAllocationHours(row.startTime, row.endTime); const needsBarPicker = bars.length > 1;
      return <div key={i} className="grid grid-cols-2 gap-1.5 rounded-md border border-slate-200 bg-slate-50/80 p-2 sm:grid-cols-[minmax(170px,1.7fr)_88px_88px_64px_28px] dark:border-slate-700 dark:bg-slate-950/25">
        <div className={needsBarPicker ? "col-span-2 sm:col-span-1" : "col-span-2 sm:col-span-1"}><Label className="text-[9px] font-bold uppercase tracking-wide text-slate-500">BOQ item</Label><Select value={row.boqItemId ? String(row.boqItemId) : ""} onValueChange={v => { const boqItemId = Number(v); const matches = barsFor(boqItemId); patch(i, { boqItemId, programmeBarId: matches.length === 1 ? matches[0].id : null }); }}><SelectTrigger className="mt-0.5 h-8 bg-white text-xs dark:bg-slate-900"><SelectValue placeholder="Select BOQ item" /></SelectTrigger><SelectContent>{boqItems.map(item => <SelectItem key={item.id} value={String(item.id)}>{dprBoqItemDisplayName(item)}</SelectItem>)}</SelectContent></Select></div>
        {needsBarPicker && <div className="col-span-2 sm:col-span-1"><Label className="text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Programme distinction</Label><Select value={row.programmeBarId ? String(row.programmeBarId) : ""} onValueChange={v => patch(i, { programmeBarId: Number(v) })}><SelectTrigger className="mt-0.5 h-8 bg-amber-50 text-xs dark:bg-amber-950/30"><SelectValue placeholder="Choose reach / side" /></SelectTrigger><SelectContent>{bars.map(bar => <SelectItem key={bar.id} value={String(bar.id)}>{bar.reachLabel || "Reach unspecified"}{bar.side ? ` · ${bar.side}` : ""}</SelectItem>)}</SelectContent></Select></div>}
        <div><Label className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Start</Label><Input className="mt-0.5 h-8 bg-white text-xs tabular-nums dark:bg-slate-900" type="time" value={row.startTime} onChange={e => patch(i, { startTime: e.target.value })} /></div>
        <div><Label className="text-[9px] font-bold uppercase tracking-wide text-slate-500">End</Label><Input className="mt-0.5 h-8 bg-white text-xs tabular-nums dark:bg-slate-900" type="time" value={row.endTime} onChange={e => patch(i, { endTime: e.target.value })} /></div>
        <div><Label className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Auto hours</Label><div className="mt-0.5 flex h-8 items-center rounded border border-transparent px-2 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{hours == null ? "—" : `${hours.toFixed(2)} h`}</div></div>
        <Button type="button" variant="ghost" size="icon" className="mt-3 h-8 w-8 self-start text-slate-500 hover:text-destructive" onClick={() => remove(i)} aria-label="Remove allocation"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>;
    })}</div>
    {!value.length && <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 px-3 py-2 text-center text-[11px] text-muted-foreground dark:border-slate-700 dark:bg-slate-950/20">No BOQ work allocated. Add a segment to split this machine day.</div>}
    <AllocationTotals allocated={totals.allocatedHours} unallocated={totals.unallocatedHours} parentHours={parentHours} />
    {errors.length > 0 && <div className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/25 dark:text-amber-300">{errors.map(error => <div key={error} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</div>)}</div>}
  </section>;
}

function AllocationTotals({ allocated, unallocated, parentHours }: { allocated: number; unallocated: number | null; parentHours?: number | null }) {
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 pt-2 text-[11px] tabular-nums dark:border-slate-700"><span className="font-bold text-slate-800 dark:text-slate-100">Allocated {allocated.toFixed(2)} h</span>{parentHours != null && <span className={unallocated === 0 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}>Unallocated {(unallocated ?? 0).toFixed(2)} h of {parentHours.toFixed(2)} h</span>}</div>;
}