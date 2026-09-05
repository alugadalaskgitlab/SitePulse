import { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { computeEquipmentUsage } from "@/lib/equipmentUsage";

export type DprEquipmentFields = {
  machine?: string; vehicleNo?: string; entryType?: string; startTime?: string; endTime?: string;
  openingReading?: number | null; closingReading?: number | null; numberOfTrips?: number | null;
  tripDistance?: number | null; diesel?: number | null; openingDiesel?: number | null;
  dieselBalanceInTank?: number | null; dieselBalanceConfirmed?: boolean | null; dieselNorm?: number | null;
  expectedDiesel?: number | null; hoursWorked?: number | null; totalKm?: number | null;
  equipmentId?: number | null; breakdowns?: Array<{ description?: string }>;
};
export type DprEquipmentTankPatch = Pick<
  DprEquipmentFields,
  "openingDiesel" | "dieselBalanceInTank" | "dieselBalanceConfirmed"
>;
const dash = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);

export function DprEquipmentCompact({ row, equipment, onChange, editable = true, index = 0, beforeDate, site }: {
  row: DprEquipmentFields;
  equipment?: { meterType?: string | null; consumptionNorm?: number | null } | null;
  onChange?: (patch: Partial<DprEquipmentTankPatch>) => void;
  editable?: boolean; index?: number; beforeDate?: string; site?: string;
}) {
  const [suggestedTank, setSuggestedTank] = useState<{ value: number; date?: string } | null>(null);
  const preview = useMemo(
    () => editable ? computeEquipmentUsage(equipment, row) : null,
    [editable, equipment, row],
  );
  const tankKnown = row.openingDiesel != null || row.dieselBalanceInTank != null;
  useEffect(() => {
    let cancelled = false;
    if (!editable || row.openingDiesel != null || row.equipmentId == null || !beforeDate || !site) { setSuggestedTank(null); return; }
    fetch(`/api/equipment/${row.equipmentId}/latest-confirmed-diesel-tank?beforeDate=${encodeURIComponent(beforeDate)}&site=${encodeURIComponent(site ?? "")}`, { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (!cancelled && data?.dieselBalanceInTank != null) setSuggestedTank({ value: Number(data.dieselBalanceInTank), date: data.sourceDate }); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [editable, row.equipmentId, row.openingDiesel, beforeDate, site]);
  const setNumber = (key: keyof DprEquipmentFields, value: string) =>
    onChange?.({ [key]: value === "" ? null : Number(value) } as Partial<DprEquipmentTankPatch>);
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/40" data-testid={`equipment-compact-${index}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100"><Gauge className="h-3.5 w-3.5" />{dash(row.machine)} <span className="font-normal">· {dash(row.vehicleNo)}</span></span>
        <span>{!editable ? (row.hoursWorked != null ? `${Number(row.hoursWorked).toFixed(2)} h` : row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : "Time —") : row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : preview?.hoursWorked != null ? `${preview.hoursWorked.toFixed(2)} h` : "Time —"}</span>
        <span>{!editable ? (row.totalKm != null ? `${Number(row.totalKm).toFixed(1)} km` : "KM —") : preview?.totalKm != null ? `${preview.totalKm.toFixed(1)} km` : "KM —"}</span>
        <span>Meter {dash(row.openingReading)} → {dash(row.closingReading)}</span>
        <span>Diesel <b>{row.diesel != null ? `${row.diesel} L` : "—"}</b> / {!editable ? (row.expectedDiesel != null ? `${Number(row.expectedDiesel).toFixed(2)} L exp.` : "expected —") : preview?.expectedDiesel != null ? `${preview.expectedDiesel.toFixed(2)} L exp.` : "expected —"}</span>
        {!editable && row.dieselNorm != null && <span>Norm {Number(row.dieselNorm).toFixed(2)} {row.totalKm != null ? "L/km" : row.hoursWorked != null ? "L/hr" : ""}</span>}
        <span>Tank {dash(row.openingDiesel)} → {dash(row.dieselBalanceInTank)}</span>
        <Badge variant={row.breakdowns?.length ? "destructive" : "outline"} className="text-[10px]">{row.breakdowns?.length ? `${row.breakdowns.length} breakdown${row.breakdowns.length > 1 ? "s" : ""}` : "No breakdown"}</Badge>
        {preview?.warning && <span className="inline-flex items-center gap-1 text-amber-700"><CircleAlert className="h-3.5 w-3.5" />{preview.warning}</span>}
      </div>
      {editable && onChange && <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3 dark:border-slate-700">
        <div><Label className="text-[11px] text-slate-500">Opening Tank (L)</Label><Input className="h-8 text-sm" type="number" step="0.1" value={row.openingDiesel ?? ""} onChange={(e) => setNumber("openingDiesel", e.target.value)} placeholder="Not recorded" /></div>
        <div><Label className="text-[11px] text-slate-500">Closing Tank / physical dip (L)</Label><Input className="h-8 text-sm" type="number" step="0.1" value={row.dieselBalanceInTank ?? ""} onChange={(e) => setNumber("dieselBalanceInTank", e.target.value)} placeholder="Not recorded" /></div>
        <label className="flex items-end gap-2 pb-1 text-xs text-slate-600 dark:text-slate-300"><Checkbox checked={!!row.dieselBalanceConfirmed} onCheckedChange={(checked) => onChange({ dieselBalanceConfirmed: checked === true })} /><span>{row.dieselBalanceConfirmed ? <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" /> : null}Balance confirmed</span></label>
      </div>}
      {suggestedTank && row.openingDiesel == null && <button type="button" className="mt-1 text-left text-[11px] text-primary underline underline-offset-2" onClick={() => { if (row.openingDiesel == null) onChange?.({ openingDiesel: suggestedTank.value }); setSuggestedTank(null); }}>Use last confirmed tank: {suggestedTank.value.toFixed(2)} L{suggestedTank.date ? ` · ${suggestedTank.date}` : ""}</button>}
      {!editable && tankKnown && !row.dieselBalanceConfirmed && <span className="mt-1 block text-[11px] text-amber-700">Physical balance not confirmed</span>}
    </div>
  );
}