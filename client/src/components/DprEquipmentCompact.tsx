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
  equipmentId?: number | null; breakdowns?: Array<{
    description?: string; fromTime?: string | null; toTime?: string | null;
    startTime?: string | null; endTime?: string | null;
  }>;
};
export type DprEquipmentTankPatch = Pick<
  DprEquipmentFields,
  "openingDiesel" | "dieselBalanceInTank" | "dieselBalanceConfirmed"
>;
const dash = (value: unknown) => value === null || value === undefined || value === "" ? "—" : String(value);
const basisLabel = {
  hour_meter: "Hour meter",
  odometer: "Odometer",
  trip_based: "Trips",
  time_fallback: "Time fallback",
  none: "Unavailable",
} as const;
const litres = (value: number | null | undefined, signed = false) =>
  value == null ? "—" : `${signed && value > 0 ? "+" : ""}${Number(value).toFixed(2)} L`;

export function DprEquipmentCompact({ row, equipment, onChange, editable = true, index = 0, beforeDate, site }: {
  row: DprEquipmentFields;
  equipment?: { meterType?: string | null; consumptionNorm?: number | null } | null;
  onChange?: (patch: Partial<DprEquipmentTankPatch>) => void;
  editable?: boolean; index?: number; beforeDate?: string; site?: string;
}) {
  const [suggestedTank, setSuggestedTank] = useState<{ value: number; date?: string } | null>(null);
  const preview = useMemo(() => computeEquipmentUsage(
    !editable
      ? {
          meterType: row.totalKm != null && row.hoursWorked == null ? "odometer" : "hour_meter",
          consumptionNorm: row.dieselNorm ?? equipment?.consumptionNorm ?? null,
        }
      : equipment,
    row,
  ), [editable, equipment, row]);
  const tankKnown = row.openingDiesel != null || row.dieselBalanceInTank != null;
  const expected = !editable && row.expectedDiesel != null ? Number(row.expectedDiesel) : preview.expectedDiesel;
  const actual = preview.actualDiesel;
  const variance = actual != null && expected != null ? actual - expected : null;
  const norm = !editable
    ? row.dieselNorm ?? preview.efficiencyValue
    : equipment?.consumptionNorm ?? row.dieselNorm ?? preview.efficiencyValue;
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
        <span>{!editable ? (row.hoursWorked != null ? `${Number(row.hoursWorked).toFixed(2)} h` : row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : "Time —") : row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : preview.hoursWorked != null ? `${preview.hoursWorked.toFixed(2)} h` : "Time —"}</span>
        <span>{!editable ? (row.totalKm != null ? `${Number(row.totalKm).toFixed(1)} km` : "KM —") : preview.totalKm != null ? `${preview.totalKm.toFixed(1)} km` : "KM —"}</span>
        <span>Meter {dash(row.openingReading)} → {dash(row.closingReading)}</span>
        <Badge variant={row.breakdowns?.length ? "destructive" : "outline"} className="text-[10px]">{row.breakdowns?.length ? `${row.breakdowns.length} breakdown${row.breakdowns.length > 1 ? "s" : ""}` : "No breakdown"}</Badge>
        {preview.warning && <span className="inline-flex items-center gap-1 font-medium text-amber-700"><CircleAlert className="h-3.5 w-3.5" />{preview.warning}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600 sm:grid-cols-3 lg:grid-cols-6 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
        <span><b className="block text-slate-900 dark:text-slate-100">Basis</b>{basisLabel[preview.basis]}</span>
        <span><b className="block text-slate-900 dark:text-slate-100">Norm</b>{norm != null ? `${Number(norm).toFixed(2)} ${preview.efficiencyUnit}` : "—"}</span>
        <span><b className="block text-slate-900 dark:text-slate-100">Expected</b>{litres(expected)}</span>
        <span><b className="block text-slate-900 dark:text-slate-100">Actual</b>{litres(actual)}{preview.actualDieselBasis === "tank_derived" ? " (tank)" : preview.actualDieselBasis === "issued_only" ? " (issued)" : ""}</span>
        <span className={variance != null && variance > 0 ? "text-amber-700" : variance != null ? "text-emerald-700" : ""}><b className="block text-slate-900 dark:text-slate-100">Variance</b>{litres(variance, true)}</span>
        <span><b className="block text-slate-900 dark:text-slate-100">Downtime</b>{preview.downtimeHours > 0 ? `${preview.downtimeHours.toFixed(2)} h` : "0.00 h"}</span>
        {preview.actualDieselBasis === "tank_derived" && (
          <span><b className="block text-slate-900 dark:text-slate-100">Tank vs entered</b>{litres(preview.discrepancy, true)}</span>
        )}
        <span className="col-span-2 sm:col-span-3 lg:col-span-6"><b className="mr-1 text-slate-900 dark:text-slate-100">Tank inputs:</b>Opening {litres(row.openingDiesel)} + issued {litres(row.diesel)} − closing {litres(row.dieselBalanceInTank)}</span>
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