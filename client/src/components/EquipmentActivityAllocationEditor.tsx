import { useMemo } from "react";
import { AlertTriangle, Clock3, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  calculateEquipmentAllocationHours,
  validateEquipmentActivityAllocations,
  type EquipmentActivityAllocationInput,
} from "@shared/equipmentActivityAllocations";
import { dprBoqItemDisplayName } from "@shared/dprBoqSelection";

export type EquipmentActivityAllocation = EquipmentActivityAllocationInput;
type BoqItem = { id: number; description?: string | null; itemCode?: string | null; itemName?: string | null; displayName?: string | null; unit?: string | null };
type ProgrammeBar = { id: number; boqItemId: number; reachLabel?: string | null; side?: string | null };

export function EquipmentActivityAllocationEditor({
  value = [], onChange, boqItems = [], programmeBars = [], parentHours, editable = true,
}: {
  value?: EquipmentActivityAllocation[];
  onChange?: (value: EquipmentActivityAllocation[]) => void;
  boqItems?: BoqItem[];
  programmeBars?: ProgrammeBar[];
  parentHours?: number | null;
  editable?: boolean;
}) {
  const result = useMemo(() => {
    try { return validateEquipmentActivityAllocations(value, parentHours); } catch { return null; }
  }, [value, parentHours]);
  const errors = useMemo(() => {
    const list: string[] = [];
    value.forEach((row, i) => {
      if (!row.boqItemId) list.push(`Allocation ${i + 1}: select a BOQ item.`);
      if (!row.startTime) list.push(`Allocation ${i + 1}: enter Start Time.`);
      if (!row.endTime) list.push(`Allocation ${i + 1}: enter End Time.`);
      if (row.startTime && row.endTime && calculateEquipmentAllocationHours(row.startTime, row.endTime) == null) list.push(`Allocation ${i + 1}: End Time must be later than Start Time.`);
    });
    const sorted = value.map((row, i) => ({ ...row, i })).filter(row => row.startTime && row.endTime).sort((a, b) => a.startTime.localeCompare(b.startTime));
    sorted.slice(1).forEach((row, i) => { if (row.startTime < sorted[i].endTime) list.push(`Allocation ${row.i + 1}: time overlaps another segment.`); });
    if (result == null && value.length) {
      const total = value.reduce((sum, row) => sum + (calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0), 0);
      if (parentHours != null && total > parentHours) list.push("Allocated time exceeds parent operating time.");
    }
    return Array.from(new Set(list));
  }, [value, parentHours, result]);
  const patch = (index: number, next: Partial<EquipmentActivityAllocation>) =>
    onChange?.(value.map((row, i) => i === index ? { ...row, ...next } : row));
  const add = () => onChange?.([...value, { boqItemId: 0, programmeBarId: null, startTime: "", endTime: "" }]);
  const remove = (index: number) => onChange?.(value.filter((_, i) => i !== index));
  const itemName = (id: number) => dprBoqItemDisplayName(boqItems.find(item => item.id === id));
  const barsFor = (id: number) => programmeBars.filter(bar => bar.boqItemId === id);

  if (!editable) {
    if (!value.length) return null;
    return <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/60 p-2 text-xs dark:border-slate-700 dark:bg-slate-900/30">
      <div className="mb-1 flex items-center gap-2 font-semibold"><Clock3 className="h-3.5 w-3.5" /> Work Allocation</div>
      <div className="space-y-1">{value.map((row, i) => <div key={i} className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="font-medium">{itemName(row.boqItemId) || `BOQ #${row.boqItemId}`}</span>
        <span>{row.startTime}–{row.endTime}</span><span>{Number(row.hoursWorked ?? calculateEquipmentAllocationHours(row.startTime, row.endTime) ?? 0).toFixed(2)} h</span>
        {row.programmeBarId != null && <Badge variant="outline" className="text-[10px]">Bar #{row.programmeBarId}</Badge>}
      </div>)}</div>
      <div className="mt-1 text-muted-foreground">Allocated {result?.allocatedHours.toFixed(2) ?? "—"} h{parentHours != null ? ` · Unallocated ${(result?.unallocatedHours ?? 0).toFixed(2)} h` : ""}</div>
    </div>;
  }
  return <div className="mt-2 rounded-md border border-slate-200 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-950/30" data-testid="equipment-activity-allocations">
    <div className="mb-2 flex items-center justify-between gap-2">
      <div><div className="flex items-center gap-1.5 text-xs font-semibold"><Clock3 className="h-3.5 w-3.5 text-primary" />Work Allocation</div>
        <div className="text-[11px] text-muted-foreground">One equipment row can cover multiple BOQ items.</div></div>
      <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={add}><Plus className="h-3 w-3" /> Add another activity</Button>
    </div>
    {value.map((row, i) => {
      const bars = barsFor(row.boqItemId);
      const hours = calculateEquipmentAllocationHours(row.startTime, row.endTime);
      return <div key={i} className="mb-2 grid grid-cols-2 gap-2 rounded border border-slate-200 p-2 last:mb-0 sm:grid-cols-[minmax(150px,1.5fr)_minmax(130px,1fr)_100px_100px_64px_28px] dark:border-slate-700">
        <div className="col-span-2 sm:col-span-1"><Label className="text-[10px] text-muted-foreground">BOQ item</Label>
          <Select
            value={row.boqItemId ? String(row.boqItemId) : ""}
            onValueChange={v => {
              const boqItemId = Number(v);
              const exactBars = barsFor(boqItemId);
              patch(i, {
                boqItemId,
                programmeBarId: exactBars.length === 1 ? exactBars[0].id : null,
              });
            }}
          ><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select BOQ item" /></SelectTrigger><SelectContent>{boqItems.map(item => <SelectItem key={item.id} value={String(item.id)}>{dprBoqItemDisplayName(item)}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label className="text-[10px] text-muted-foreground">Programme bar <span className="font-normal">(optional)</span></Label>
          <Select value={row.programmeBarId ? String(row.programmeBarId) : "none"} onValueChange={v => patch(i, { programmeBarId: v === "none" ? null : Number(v) })} disabled={!bars.length}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder={bars.length ? "Optional bar" : "No exact bar"} /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{bars.map(bar => <SelectItem key={bar.id} value={String(bar.id)}>#{bar.id}{bar.reachLabel ? ` · ${bar.reachLabel}` : ""}{bar.side ? ` · ${bar.side}` : ""}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label className="text-[10px] text-muted-foreground">Start</Label><Input className="h-8 text-xs" type="time" value={row.startTime} onChange={e => patch(i, { startTime: e.target.value })} /></div>
        <div><Label className="text-[10px] text-muted-foreground">End</Label><Input className="h-8 text-xs" type="time" value={row.endTime} onChange={e => patch(i, { endTime: e.target.value })} /></div>
        <div><Label className="text-[10px] text-muted-foreground">Hours</Label><div className="flex h-8 items-center px-2 text-xs font-semibold">{hours != null ? `${hours.toFixed(2)} h` : "—"}</div></div>
        <Button type="button" variant="ghost" size="icon" className="mt-3 h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(i)} aria-label="Remove allocation"><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>;
    })}
    {!value.length && <div className="rounded border border-dashed p-2 text-center text-[11px] text-muted-foreground">No activity time allocated yet.</div>}
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="font-medium">Allocated: {result?.allocatedHours.toFixed(2) ?? "0.00"} h</span>
      {parentHours != null && <span className="text-muted-foreground">Unallocated: {(result?.unallocatedHours ?? Math.max(0, parentHours)).toFixed(2)} h of {parentHours.toFixed(2)} h</span>}
    </div>
    {errors.length > 0 && <div className="mt-2 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">{errors.map(error => <div key={error} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{error}</div>)}</div>}
  </div>;
}