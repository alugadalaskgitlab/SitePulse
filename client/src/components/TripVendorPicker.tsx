import { useId } from "react";
import { TripMasterCombobox } from "./TripMasterCombobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchTripVendors, tripVendorLabel, type ExistingTripVendor } from "./trip-role-utils";

export function TripVendorPicker({ label, name, vendorId, vendors, onChange, disabled, testId, manual, onManualChange }: {
  label: string; name: string; vendorId?: number | null; vendors: ExistingTripVendor[];
  onChange: (name: string, id: number | null) => void; disabled?: boolean; testId?: string;
  manual?: boolean; onManualChange?: (manual: boolean) => void;
}) {
  const id = useId();
  const matches = searchTripVendors(vendors, name);
  const selected = vendors.find(v => v.id === vendorId);
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {onManualChange && <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={!!manual} onChange={e => onManualChange(e.target.checked)} />
      Other / Not in Master
    </label>}
    {manual ? <Input id={id} value={name} placeholder="Enter the recorded party name" data-testid={testId}
      onChange={e => onChange(e.target.value.toUpperCase(), null)} /> :
      <TripMasterCombobox id={id} value={selected ? tripVendorLabel(selected) : name} selectedId={vendorId}
        disabled={disabled} placeholder="Search Vendor Master (2+ characters)" testId={testId}
        searchable={name.trim().length >= 2}
        options={matches.map(v => ({ id: v.id, label: tripVendorLabel(v) }))}
        onChange={text => onChange(text.toUpperCase(), null)}
        onSelect={selectedId => {
          const vendor = matches.find(v => v.id === selectedId);
          if (vendor) onChange(vendor.name, vendor.id);
        }} />}
  </div>;
}
