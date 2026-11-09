import { useId, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { TripMasterCombobox } from "@/components/TripMasterCombobox";
import {
  buildDieselSupplierSuggestions,
  type DieselSupplierAlias,
  type DieselSupplierVendor,
} from "@shared/dieselSupplier";

export function DieselSupplierPicker({
  value,
  vendorId,
  vendors,
  aliases,
  previousNames,
  vendorsLoading,
  vendorsError,
  testId,
  onChange,
}: {
  value: string;
  vendorId: number | null;
  vendors: DieselSupplierVendor[];
  aliases: DieselSupplierAlias[];
  previousNames: string[];
  vendorsLoading: boolean;
  vendorsError: boolean;
  testId: string;
  onChange: (name: string, vendorId: number | null) => void;
}) {
  const inputId = useId();
  const suggestions = useMemo(
    () => buildDieselSupplierSuggestions(value, vendors, aliases, previousNames),
    [value, vendors, aliases, previousNames],
  );
  const selectedVendor = vendorId == null ? null : vendors.find((vendor) => vendor.id === vendorId);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>Fuel station / vendor</Label>
      <TripMasterCombobox
        id={inputId}
        value={value}
        selectedId={vendorId}
        options={suggestions.map((suggestion) => ({
          id: suggestion.id,
          label: suggestion.kind === "master"
            ? `${suggestion.name}${suggestion.businessName && suggestion.businessName !== suggestion.name ? ` · ${suggestion.businessName}` : ""} · Master`
            : `${suggestion.name} · Previous purchase`,
        }))}
        onChange={(name) => onChange(name, null)}
        onSelect={(id) => {
          const suggestion = suggestions.find((item) => item.id === id);
          if (suggestion) onChange(suggestion.name, suggestion.vendorId);
        }}
        searchable={value.trim().length >= 2}
        placeholder="Search or type a fuel station / vendor"
        emptyMessage="No matching names. You can keep the typed name."
        testId={testId}
      />
      {vendorsLoading && <p role="status" className="text-xs text-muted-foreground">Loading Vendor Master…</p>}
      {vendorsError && <p role="status" className="text-xs text-muted-foreground">Some suggestions are unavailable. You can still type a name.</p>}
      {value.trim().length < 2 && <p className="text-xs text-muted-foreground">Type two letters to see matches.</p>}
      {selectedVendor && <p className="text-xs text-muted-foreground"><Badge variant="outline">Master</Badge> Linked to {selectedVendor.name}</p>}
    </div>
  );
}
