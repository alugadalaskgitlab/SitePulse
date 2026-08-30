import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

/** Draft-only shape. It deliberately has no source id: callers retain this
 * alongside an operational row until that row has been persisted. */
export type StagedBreakdown = {
  clientKey: string;
  maintenanceLogId?: number;
  fromTime: string;
  toTime: string;
  description: string;
  responsibility: "vendor" | "hlc" | "";
  repairScope: "vendor" | "hlc" | "";
  debitableToVendor: boolean;
  remarks: string;
  file?: File;
  attachment?: { fileName: string; objectPath: string; mimeType?: string; fileSize?: number };
};

export const newStagedBreakdown = (): StagedBreakdown => ({
  clientKey: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `breakdown-${Date.now()}-${Math.random()}`,
  fromTime: "", toTime: "", description: "", responsibility: "", repairScope: "",
  debitableToVendor: false, remarks: "",
});

export function breakdownDurationHours(fromTime: string, toTime: string): number | null {
  const parse = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  const a = parse(fromTime); const b = parse(toTime);
  if (!a || !b) return null;
  const minutes = (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
  return minutes > 0 ? Math.round((minutes / 60) * 1000) / 1000 : null;
}

export function BreakdownStoppageEditor({ value, onChange, disabled = false, testId = "breakdown" }: {
  value: StagedBreakdown[];
  onChange: (next: StagedBreakdown[]) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const patch = (index: number, patchValue: Partial<StagedBreakdown>) =>
    onChange(value.map((row, i) => i === index ? { ...row, ...patchValue } : row));
  return <section className="mt-3 rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-3" data-testid={`${testId}-editor`}>
    <div className="flex items-center justify-between">
      <div><p className="font-medium text-sm">Breakdown / Stoppage</p><p className="text-xs text-muted-foreground">Saved against this exact equipment usage row.</p></div>
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...value, newStagedBreakdown()])} data-testid={`${testId}-add`}><Plus className="w-4 h-4 mr-1" />Add stoppage</Button>
    </div>
    {value.map((row, index) => {
      const duration = breakdownDurationHours(row.fromTime, row.toTime);
      return <div key={row.clientKey} className="grid grid-cols-1 md:grid-cols-4 gap-2 border-t pt-3">
        <div><Label>From time</Label><Input type="time" value={row.fromTime} disabled={disabled} onChange={e => patch(index, { fromTime: e.target.value })} data-testid={`${testId}-from-${index}`} /></div>
        <div><Label>To time</Label><Input type="time" value={row.toTime} disabled={disabled} onChange={e => patch(index, { toTime: e.target.value })} data-testid={`${testId}-to-${index}`} /></div>
        <div><Label>Duration</Label><div className="h-10 flex items-center text-sm">{duration == null ? "Enter valid times" : `${duration.toFixed(3)} h`}</div></div>
        <div className="flex items-end"><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 className="w-4 h-4" />Remove</Button></div>
        <div><Label>Reason</Label><Input value={row.description} disabled={disabled} onChange={e => patch(index, { description: e.target.value })} /></div>
        <div><Label>Responsibility</Label><Select value={row.responsibility || "__none__"} disabled={disabled} onValueChange={v => patch(index, { responsibility: v === "__none__" ? "" : v as "vendor" | "hlc" })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="__none__">Not specified</SelectItem><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="hlc">HLC</SelectItem></SelectContent></Select></div>
        <div><Label>Repair/payment scope</Label><Select value={row.repairScope || "__none__"} disabled={disabled} onValueChange={v => patch(index, { repairScope: v === "__none__" ? "" : v as "vendor" | "hlc" })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="__none__">Not specified</SelectItem><SelectItem value="vendor">Vendor's scope</SelectItem><SelectItem value="hlc">HLC's scope</SelectItem></SelectContent></Select></div>
        <div><Label>Photo/document</Label><Input type="file" disabled={disabled} onChange={e => patch(index, { file: e.target.files?.[0] })} /></div>
        <div className="md:col-span-4"><Label>Remarks</Label><Textarea value={row.remarks} disabled={disabled} onChange={e => patch(index, { remarks: e.target.value })} /></div>
      </div>;
    })}
  </section>;
}