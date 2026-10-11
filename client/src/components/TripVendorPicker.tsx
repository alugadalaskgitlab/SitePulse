import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExistingTripVendor } from "./trip-role-utils";

export function TripVendorPicker({ label, name, vendorId, vendors, onChange, disabled, testId, manual, onManualChange }: {
  label: string; name: string; vendorId?: number | null; vendors: ExistingTripVendor[];
  onChange: (name: string, id: number | null) => void; disabled?: boolean; testId?: string;
  manual?: boolean; onManualChange?: (manual: boolean) => void;
}) {
  const id = useId();
  const selectedId = vendorId;
  const matches = vendors.filter(v => v.id === selectedId || v.name.toUpperCase().includes(name.trim().toUpperCase()));
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {onManualChange && <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={!!manual} onChange={e => onManualChange(e.target.checked)} />
      Outside / one-time party · record name without a Vendor Master link
    </label>}
    <Input id={id} value={name} disabled={disabled && !manual} placeholder={manual ? "Enter the recorded party name" : "Search Vendor Master by name"} data-testid={testId}
      onChange={e => onChange(e.target.value.toUpperCase(), null)} />
    {!manual && <select aria-label={`${label} · Vendor Master`} className="w-full rounded-md border bg-background p-2 text-sm" value={selectedId ?? ""} disabled={disabled}
      onChange={e => { const vendor = vendors.find(v => v.id === Number(e.target.value)); onChange(vendor?.name || name, vendor?.id ?? null); }}>
      <option value="">Select a Vendor Master match</option>
      {matches.map(v => <option key={v.id} value={v.id}>{v.name} · #{v.id}</option>)}
    </select>}
    {!manual && !matches.length && name && <p className="text-xs text-muted-foreground">No master match. Clear the search to review available vendors.</p>}
    {manual && <p className="text-xs text-muted-foreground">Recorded text only. No vendor is created or confirmed.</p>}
  </div>;
}
