import { useId, type ReactNode } from "react";
import type { TripTransportRole } from "@shared/tripTransportRoles";
import type { EquipmentMasterType } from "@shared/schema";
import { TripMasterVehicleField } from "./TripMasterVehicleField";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TRIP_ROLE_OPTIONS, type ExistingTripVendor } from "./trip-role-utils";
import { TripVendorPicker } from "./TripVendorPicker";

export type TripRoleDraft = {
  materialSourceType?: "vendor" | "own_source" | null;
  materialSourceLabel?: string | null;
  materialSourceSupplier: string;
  supplier: string;
  vehicleNumber: string;
  internalEquipmentId: number | null;
  materialSourceVendorId?: number | null;
  supplierVendorId?: number | null;
  materialSourceManual?: boolean;
  supplierManual?: boolean;
  equipmentId?: number | null;
  vehicleManual?: boolean;
};

type Props = {
  choice: TripTransportRole | null;
  onChoice: (choice: TripTransportRole) => void;
  value: TripRoleDraft;
  onChange: (value: TripRoleDraft) => void;
  vendors: ExistingTripVendor[];
  equipment: EquipmentMasterType[];
  sourceSuggestions?: string[];
  supplierSuggestions?: string[];
  vehicleSuggestions?: string[];
  suggestionError?: unknown;
  vendorsLoading?: boolean;
  vendorsDisabled?: boolean;
  vendorsError?: boolean;
  onRetryVendors: () => void;
  onVehicleSelected?: (vehicle: string) => void;
  vehicleNotice?: ReactNode;
  vehiclePicker?: ReactNode;
  allowManualParties?: boolean;
  testIdPrefix?: string;
};

export function TripTransportRoleFields({
  choice, onChoice, value, onChange, vendors, vendorsLoading, vendorsDisabled,
  vendorsError, onRetryVendors, allowManualParties = false, testIdPrefix = "trip",
}: Props) {
  const radioName = useId();
  const sourceRadioName = useId();
  const sourceId = useId();
  const ownSource = value.materialSourceType === "own_source";
  const needsVendors = !ownSource || choice === "different_parties";
  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-4" data-testid={`${testIdPrefix}-role-fields`}>
      <div className="max-w-xl">
        <fieldset className="mb-2">
          <legend className="mb-2 text-sm font-medium">Material Source *</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={sourceRadioName} checked={value.materialSourceType === "vendor"} onChange={() => onChange({ ...value, materialSourceType: "vendor", materialSourceLabel: null })} data-testid={`${testIdPrefix}-source-vendor`} />
              Vendor Supply
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={sourceRadioName} checked={ownSource} onChange={() => {
                onChange({ ...value, materialSourceType: "own_source", materialSourceSupplier: "", materialSourceVendorId: null });
                if (choice === "same_party") onChoice("different_parties");
              }} data-testid={`${testIdPrefix}-source-own-source`} />
              Own Source
            </label>
          </div>
        </fieldset>
        {ownSource ? <>
          <Label htmlFor={sourceId}>Borrow area / source description *</Label>
          <Input id={sourceId} value={value.materialSourceLabel ?? ""} onChange={(event) => onChange({ ...value, materialSourceLabel: event.target.value })} placeholder="e.g. Borrow area near Thakadpally, survey no. 212" data-testid={`input-${testIdPrefix}-material-source-label`} />
        </> : <>
        <TripVendorPicker
          label="Material Supplier *"
          name={value.materialSourceSupplier}
          vendorId={value.materialSourceVendorId}
          manual={value.materialSourceManual}
          onManualChange={allowManualParties ? manual => onChange({ ...value, materialSourceManual: manual, materialSourceVendorId: null }) : undefined}
          vendors={vendors}
          onChange={(name, id) => onChange({ ...value, materialSourceSupplier: name.toUpperCase(), materialSourceVendorId: id })}
          disabled={vendorsDisabled || vendorsLoading || vendorsError}
          testId={`input-${testIdPrefix}-material-source-supplier`}
        />
        </>}
      </div>
      {needsVendors && vendorsLoading && <div className="h-5 max-w-sm animate-pulse rounded bg-muted" role="status" aria-label="Loading existing vendors" />}
      {needsVendors && vendorsError && <p role="alert" className="text-sm text-destructive">Existing vendors could not be loaded. <button type="button" className="underline" onClick={onRetryVendors}>Retry</button></p>}
      {needsVendors && !vendorsDisabled && !vendorsLoading && !vendorsError && vendors.length === 0 && <p className="text-sm text-muted-foreground">No existing vendors are available. Contact the office before logging this trip.</p>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who brought it? *</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
          {TRIP_ROLE_OPTIONS.filter((option) => !ownSource || option.value !== "same_party").map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={radioName} value={option.value} checked={choice === option.value} onChange={() => {
                if ((option.value === "in_house") !== (choice === "in_house")) onChange({ ...value, equipmentId: null, internalEquipmentId: null });
                onChoice(option.value);
              }} data-testid={`${testIdPrefix}-role-${option.value}`} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "different_parties" && (
        <div className="max-w-xl">
          <TripVendorPicker label="Transporter *" name={value.supplier} vendorId={value.supplierVendorId} vendors={vendors} onChange={(supplier, id) => onChange({ ...value, supplier: supplier.toUpperCase(), supplierVendorId: id })} disabled={vendorsDisabled || vendorsLoading || vendorsError} testId={`input-${testIdPrefix}-supplier`}
            manual={value.supplierManual} onManualChange={allowManualParties ? manual => onChange({ ...value, supplierManual: manual, supplierVendorId: null }) : undefined} />
        </div>
      )}
      <div className="max-w-xl"><TripMasterVehicleField value={value} onChange={onChange} onChoice={onChoice} choice={choice} vendors={vendors} allowOutside={allowManualParties} testIdPrefix={testIdPrefix} /></div>
    </section>
  );
}
