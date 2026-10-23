import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TripMasterCombobox } from "./TripMasterCombobox";
import { Label } from "@/components/ui/label";
import { searchTripVendors, tripVendorLabel, tripVendorNameMatches, type ExistingTripVendor, type ExistingVendorAlias } from "./trip-role-utils";

export function TripVendorPicker({ label, name, vendorId, vendors, onChange, disabled, testId, manual, onManualChange, preserveRecordedName = false, requireRecordedNameMatch = false, required = false }: {
  label: string; name: string; vendorId?: number | null; vendors: ExistingTripVendor[];
  onChange: (name: string, id: number | null) => void; disabled?: boolean; testId?: string;
  manual?: boolean; onManualChange?: (manual: boolean, name: string) => void;
  preserveRecordedName?: boolean;
  requireRecordedNameMatch?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const aliasesQuery = useQuery<ExistingVendorAlias[]>({
    queryKey: ["/api/vendor-aliases"],
    queryFn: async () => {
      const response = await fetch("/api/vendor-aliases", { credentials: "include" });
      if (!response.ok) throw new Error("Vendor aliases could not be loaded.");
      return response.json();
    },
    staleTime: 30_000,
  });
  const aliases = aliasesQuery.data ?? [];
  const selected = vendors.find(v => v.id === vendorId);
  const savedValue = name || selected?.name || "";
  const [query, setQuery] = useState(savedValue);
  useEffect(() => setQuery(savedValue), [savedValue]);
  const searchedMatches = searchTripVendors(vendors, query, aliases);
  const matches = requireRecordedNameMatch && name.trim()
    ? searchedMatches.filter(vendor => tripVendorNameMatches(vendor, name, aliases))
    : searchedMatches;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}</Label>
    <TripMasterCombobox id={id} value={query} selectedId={vendorId}
      disabled={disabled} placeholder="Search Vendor Master (2+ characters)" testId={testId}
      searchable={query.trim().length >= 2}
      options={matches.map(v => ({ id: v.id, label: tripVendorLabel(v) }))}
      otherOptionLabel={onManualChange ? "Other / Not in Master — keep as typed" : undefined}
      otherSelected={!!manual}
      onChange={text => {
        setQuery(text);
        if (manual) onChange(text, null);
      }}
      onSelect={selectedId => {
        const vendor = matches.find(v => v.id === selectedId);
        if (!vendor) return;
        const nextName = preserveRecordedName && name
          ? name
          : tripVendorNameMatches(vendor, query, aliases) ? query : vendor.name;
        onChange(nextName, vendor.id);
      }}
      onSelectOther={() => onManualChange?.(true, query)}
      onDismiss={() => setQuery(savedValue)} />
    {vendorId != null && selected && (
      <p className="text-xs text-muted-foreground">Linked to Vendor Master: {tripVendorLabel(selected)}</p>
    )}
    {aliasesQuery.isError && (
      <p role="status" className="text-xs text-muted-foreground">Alias search is unavailable; search by the Vendor Master name or business name.</p>
    )}
  </div>;
}
