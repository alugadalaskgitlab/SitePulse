import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "wouter";
import type { ExistingTripVendor } from "@/components/trip-role-utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TripMasterCombobox } from "@/components/TripMasterCombobox";

const isActiveVendor = (vendor: ExistingTripVendor) =>
  vendor.isActive == null || vendor.isActive === true || Number(vendor.isActive) === 1;

export function VendorMasterNamePicker({
  label, value, vendors, loading, error, testId,
  onSelect,
}: {
  label: string;
  value: string;
  vendors: ExistingTripVendor[];
  loading: boolean;
  error: boolean;
  testId: string;
  onSelect: (vendorName: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState(value);
  useEffect(() => setQuery(value), [value]);
  const options = useMemo(() => {
    const search = query.trim().toLowerCase();
    return vendors.filter(vendor => isActiveVendor(vendor) && (
      !search || vendor.name.toLowerCase().includes(search) || (vendor.businessName || "").toLowerCase().includes(search)
    )).map(vendor => ({ id: vendor.id, label: vendor.businessName && vendor.businessName !== vendor.name
      ? `${vendor.name} · ${vendor.businessName}` : vendor.name }));
  }, [query, vendors]);
  const selectedVendor = vendors.find(vendor => vendor.name.trim().toUpperCase() === value.trim().toUpperCase());
  return <div className="space-y-1.5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Link href="/masters/vendors" target="_blank" className="text-xs text-primary underline" data-testid={`${testId}-add-vendor`}>
        Add vendor
      </Link>
    </div>
    {loading ? <p role="status" className="text-xs text-muted-foreground">Loading Vendor Master…</p> : null}
    {error ? <p role="alert" className="text-xs text-destructive">Vendor Master options could not be loaded. Retry before selecting a supplier.</p> : null}
    <TripMasterCombobox
      id={id}
      value={query}
      selectedId={selectedVendor?.id}
      options={options}
      onChange={setQuery}
      onSelect={(vendorId) => {
        const vendor = vendors.find(candidate => candidate.id === vendorId);
        if (!vendor) return;
        setQuery(vendor.name);
        onSelect(vendor.name);
      }}
      onDismiss={() => setQuery(value)}
      disabled={loading || error}
      searchable={!loading && !error}
      placeholder="Search Vendor Master (2+ characters)"
      testId={testId}
    />
    {!loading && !error && !vendors.some(isActiveVendor) && (
      <p className="text-xs text-muted-foreground">No active vendors are available. Add a vendor before recording an HLC-stock receipt.</p>
    )}
  </div>;
}
