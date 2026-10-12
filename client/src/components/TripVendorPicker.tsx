import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchTripVendors, tripVendorLabel, type ExistingTripVendor } from "./trip-role-utils";

export function TripVendorPicker({ label, name, vendorId, vendors, onChange, disabled, testId, manual, onManualChange }: {
  label: string; name: string; vendorId?: number | null; vendors: ExistingTripVendor[];
  onChange: (name: string, id: number | null) => void; disabled?: boolean; testId?: string;
  manual?: boolean; onManualChange?: (manual: boolean) => void;
}) {
  const id = useId();
  const selectedId = vendorId;
  const matches = searchTripVendors(vendors, name);
  const selected = vendors.find(v => v.id === selectedId);
  const visible = selected && !matches.some(v => v.id === selected.id) ? [selected, ...matches] : matches;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {onManualChange && <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={!!manual} onChange={e => onManualChange(e.target.checked)} />
      Other / Not in Master
    </label>}
    <Input id={id} value={selected && !manual ? tripVendorLabel(selected) : name} disabled={disabled && !manual} placeholder={manual ? "Enter the recorded party name" : "Search Vendor Master (2+ characters)"} data-testid={testId}
      onChange={e => onChange(e.target.value.toUpperCase(), null)} />
    {!manual && <select aria-label={`${label} · Vendor Master`} className="w-full rounded-md border bg-background p-2 text-sm" value={selectedId ?? ""} disabled={disabled}
      onChange={e => { const vendor = vendors.find(v => v.id === Number(e.target.value)); onChange(vendor?.name || name, vendor?.id ?? null); }}>
      <option value="">Select a Vendor Master match</option>
      {visible.map(v => <option key={v.id} value={v.id} disabled={!v.isActive}>{tripVendorLabel(v)}{v.businessName && v.businessName !== v.name ? ` — ${v.name}` : ""}{!v.isActive ? " — Inactive" : ""}</option>)}
    </select>}
    {!manual && !selectedId && name && <p className="text-xs text-muted-foreground">Recorded / unselected value: {name}. Select a Master match to link it.</p>}
    {!manual && !selectedId && <p className="text-xs text-muted-foreground">{name.trim().length < 2 ? "Enter two or more characters to search." : matches.length ? "Select a matching Master party." : "No active Master match."}</p>}
    {manual && <p className="text-xs text-muted-foreground">Recorded text only. No vendor is created or confirmed.</p>}
  </div>;
}
