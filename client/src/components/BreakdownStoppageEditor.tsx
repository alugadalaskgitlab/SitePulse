import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";

/** Staged DPR shape. Preserve clientKey and any existing maintenanceLogId
 * across draft saves; draft storage does not itself post maintenance events. */
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

export function BreakdownStoppageEditor({ value, onChange, disabled = false, draftOnly = false, testId = "breakdown", usageStatus }: {
  value: StagedBreakdown[];
  onChange: (next: StagedBreakdown[]) => void;
  disabled?: boolean;
  draftOnly?: boolean;
  testId?: string;
  usageStatus?: string | null;
}) {
  const patch = (index: number, patchValue: Partial<StagedBreakdown>) =>
    onChange(value.map((row, i) => i === index ? { ...row, ...patchValue } : row));
  return <section className={`${value.length || usageStatus === "breakdown" ? "rounded-md border border-amber-200 bg-amber-50/40 p-3" : ""} space-y-3 [&_label]:text-xs [&_label]:text-slate-700 dark:[&_label]:text-slate-200`} data-draft-only={draftOnly} data-testid={`${testId}-editor`}>
    <div className="flex items-center justify-between">
      <Button type="button" size="sm" variant={usageStatus === "breakdown" && !value.length ? "default" : "ghost"} className={`h-auto min-h-10 whitespace-normal text-left ${usageStatus === "breakdown" && !value.length ? "px-3" : "px-0 text-primary"}`} disabled={disabled} onClick={() => onChange([...value, newStagedBreakdown()])} data-testid={`${testId}-add`}><Plus className="w-4 h-4 mr-1 shrink-0" />{usageStatus === "breakdown" && !value.length ? "Add breakdown details (time, whose cost, photo)" : value.length ? "Add another stoppage" : "Add breakdown / stoppage"}</Button>
    </div>
    {value.map((row, index) => {
      const duration = breakdownDurationHours(row.fromTime, row.toTime);
      return <div key={row.clientKey} className="grid grid-cols-1 md:grid-cols-4 gap-2 border-t pt-3">
        <div><Label>From</Label><Input type="time" value={row.fromTime} disabled={disabled} onChange={e => patch(index, { fromTime: e.target.value })} data-testid={`${testId}-from-${index}`} /></div>
        <div><Label>To</Label><Input type="time" value={row.toTime} disabled={disabled} onChange={e => patch(index, { toTime: e.target.value })} data-testid={`${testId}-to-${index}`} /></div>
        <div><Label>Hours</Label><div className="h-10 flex items-center text-sm">{duration == null ? "—" : `${duration.toFixed(1)} h`}</div></div>
        <div><Label>Reason</Label><Input value={row.description} disabled={disabled} onChange={e => patch(index, { description: e.target.value })} data-testid={`${testId}-reason-${index}`} /></div>
        <div><Label>Responsibility</Label><Select value={row.responsibility || "__none__"} disabled={disabled} onValueChange={v => patch(index, { responsibility: v === "__none__" ? "" : v as "vendor" | "hlc" })}><SelectTrigger data-testid={`${testId}-responsibility-${index}`}><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="__none__">Not specified</SelectItem><SelectItem value="vendor">Vendor</SelectItem><SelectItem value="hlc">HLC</SelectItem></SelectContent></Select></div>
        <div><Label>Repair cost by</Label><Select value={row.repairScope || "__none__"} disabled={disabled} onValueChange={v => patch(index, { repairScope: v === "__none__" ? "" : v as "vendor" | "hlc" })}><SelectTrigger data-testid={`${testId}-scope-${index}`}><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="__none__">Not specified</SelectItem><SelectItem value="vendor">Vendor's scope</SelectItem><SelectItem value="hlc">HLC's scope</SelectItem></SelectContent></Select></div>
        <div><Label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={row.debitableToVendor} disabled={disabled} onChange={e => patch(index, { debitableToVendor: e.target.checked })} data-testid={`${testId}-debitable-${index}`} />Deduct from hire bill?</Label></div>
        <div><Label>Photo</Label><Input type="file" disabled={disabled} onChange={e => {
          const file = e.target.files?.[0];
          // A replacement must upload anew. Cancelling the picker must not
          // discard an already saved attachment or an unsaved selected file.
          if (file) patch(index, { file, attachment: undefined });
        }} data-testid={`${testId}-file-${index}`} />
          {(row.file || row.attachment) && <p className="text-xs break-all" data-testid={`${testId}-attachment-${index}`}>{row.file ? `Selected: ${row.file.name} (not uploaded)` : `Saved attachment: ${row.attachment!.fileName}`}</p>}
        </div>
        <details className="md:col-span-4"><summary className="cursor-pointer text-xs">More</summary><Label>Remarks</Label><Textarea value={row.remarks} disabled={disabled} onChange={e => patch(index, { remarks: e.target.value })} data-testid={`${testId}-remarks-${index}`} /></details>
        <div className="md:col-span-4 flex justify-end"><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 className="w-4 h-4" />Remove</Button></div>
      </div>;
    })}
  </section>;
}