import { useId, type ReactNode } from "react";
import type { TripTransportRole } from "@shared/tripTransportRoles";
import type { EquipmentMasterType } from "@shared/schema";
import { FreeTextSuggestionInput } from "@/components/FreeTextSuggestionInput";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRIP_ROLE_OPTIONS, existingTripVendorSuggestions, type ExistingTripVendor } from "./trip-role-utils";

export type TripRoleDraft = {
  materialSourceType?: "vendor" | "own_source" | null;
  materialSourceLabel?: string | null;
  materialSourceSupplier: string;
  supplier: string;
  vehicleNumber: string;
  internalEquipmentId: number | null;
};

type Props = {
  choice: TripTransportRole | null;
  onChoice: (choice: TripTransportRole) => void;
  value: TripRoleDraft;
  onChange: (value: TripRoleDraft) => void;
  vendors: ExistingTripVendor[];
  equipment: EquipmentMasterType[];
  sourceSuggestions: string[];
  supplierSuggestions: string[];
  vehicleSuggestions: string[];
  suggestionError?: unknown;
  vendorsLoading?: boolean;
  vendorsError?: boolean;
  onRetryVendors: () => void;
  onVehicleSelected?: (vehicle: string) => void;
  vehicleNotice?: ReactNode;
  testIdPrefix?: string;
};

export function TripTransportRoleFields({
  choice, onChoice, value, onChange, vendors, equipment, sourceSuggestions,
  supplierSuggestions, vehicleSuggestions, suggestionError, vendorsLoading,
  vendorsError, onRetryVendors, onVehicleSelected, vehicleNotice, testIdPrefix = "trip",
}: Props) {
  const radioName = useId();
  const sourceRadioName = useId();
  const sourceId = useId();
  const transporterId = useId();
  const vehicleId = useId();
  const ownSource = value.materialSourceType === "own_source";
  const needsVendors = !ownSource || choice === "different_parties";
  return (
    <section className="space-y-3 rounded-lg border bg-muted/20 p-4" data-testid={`${testIdPrefix}-role-fields`}>
      <div className="max-w-xl">
        <fieldset className="mb-2">
          <legend className="mb-2 text-sm font-medium">Material from *</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={sourceRadioName} checked={value.materialSourceType === "vendor"} onChange={() => onChange({ ...value, materialSourceType: "vendor", materialSourceLabel: null })} data-testid={`${testIdPrefix}-source-vendor`} />
              A vendor
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={sourceRadioName} checked={ownSource} onChange={() => {
                onChange({ ...value, materialSourceType: "own_source", materialSourceSupplier: "" });
                if (choice === "same_party") onChoice("different_parties");
              }} data-testid={`${testIdPrefix}-source-own-source`} />
              Our own source
            </label>
          </div>
        </fieldset>
        {ownSource ? <>
          <Label htmlFor={sourceId}>Borrow area / source description *</Label>
          <Input id={sourceId} value={value.materialSourceLabel ?? ""} onChange={(event) => onChange({ ...value, materialSourceLabel: event.target.value })} placeholder="e.g. Borrow area near Thakadpally, survey no. 212" data-testid={`input-${testIdPrefix}-material-source-label`} />
          <p className="mt-1 text-xs text-muted-foreground">HLC's own material source — no material vendor is recorded.</p>
        </> : <>
        <Label htmlFor={sourceId}>Material vendor *</Label>
        <FreeTextSuggestionInput
          id={sourceId}
          value={value.materialSourceSupplier}
          onChange={(name) => onChange({ ...value, materialSourceSupplier: name.toUpperCase() })}
          suggestions={existingTripVendorSuggestions([...sourceSuggestions, ...supplierSuggestions], vendors)}
          disabled={vendorsLoading || vendorsError}
          placeholder="Choose an existing material vendor"
          data-testid={`input-${testIdPrefix}-material-source-supplier`}
        />
        <p className="mt-1 text-xs text-muted-foreground">Who sold the material. Only existing vendors can be saved.</p>
        </>}
      </div>
      {needsVendors && vendorsLoading && <div className="h-5 max-w-sm animate-pulse rounded bg-muted" role="status" aria-label="Loading existing vendors" />}
      {needsVendors && vendorsError && <p role="alert" className="text-sm text-destructive">Existing vendors could not be loaded. <button type="button" className="underline" onClick={onRetryVendors}>Retry</button></p>}
      {needsVendors && !vendorsLoading && !vendorsError && vendors.length === 0 && <p className="text-sm text-muted-foreground">No existing vendors are available. Contact the office before logging this trip.</p>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who brought it? *</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
          {TRIP_ROLE_OPTIONS.filter((option) => !ownSource || option.value !== "same_party").map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name={radioName} value={option.value} checked={choice === option.value} onChange={() => onChoice(option.value)} data-testid={`${testIdPrefix}-role-${option.value}`} />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      {choice === "same_party" && <p className="text-xs text-muted-foreground">The material vendor is also recorded explicitly as the transporter.</p>}
      {choice === "different_parties" && (
        <div className="max-w-xl">
          <Label htmlFor={transporterId}>Transporter *</Label>
          <FreeTextSuggestionInput id={transporterId} value={value.supplier} onChange={(supplier) => onChange({ ...value, supplier: supplier.toUpperCase() })} suggestions={existingTripVendorSuggestions(supplierSuggestions, vendors)} disabled={vendorsLoading || vendorsError} placeholder="Choose an existing transporter" data-testid={`input-${testIdPrefix}-supplier`} />
        </div>
      )}
      {(choice === "same_party" || choice === "different_parties") && (
        <div className="max-w-xl">
          <Label htmlFor={vehicleId}>Vehicle number *</Label>
          <FreeTextSuggestionInput id={vehicleId} value={value.vehicleNumber} onChange={(vehicleNumber) => onChange({ ...value, vehicleNumber: vehicleNumber.toUpperCase() })} onSuggestionSelected={onVehicleSelected} suggestions={vehicleSuggestions} match="vehicle" suggestionsError={suggestionError} placeholder="e.g. TS15UF4308" data-testid={`input-${testIdPrefix}-vehicle`} />
          {vehicleNotice}
        </div>
      )}
      {choice === "in_house" && (
        <div className="max-w-xl">
          <Label>Our own vehicle *</Label>
          <Select value={value.internalEquipmentId?.toString() ?? ""} onValueChange={(id) => {
            const selected = equipment.find((item) => item.id === Number(id));
            onChange({ ...value, internalEquipmentId: selected?.id ?? null, vehicleNumber: selected?.registrationNumber || selected?.name || "" });
          }}>
            <SelectTrigger data-testid={`select-${testIdPrefix}-internal-equipment`}><SelectValue placeholder="Choose from equipment master" /></SelectTrigger>
            <SelectContent>
              {equipment.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.registrationNumber ? `${item.registrationNumber} — ` : ""}{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {equipment.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No owned vehicles available in the equipment master.</p>}
          {value.internalEquipmentId != null && <p className="mt-1 text-xs text-muted-foreground">Vehicle number from master: {equipment.find((item) => item.id === value.internalEquipmentId)?.registrationNumber || equipment.find((item) => item.id === value.internalEquipmentId)?.name || "Not recorded"}</p>}
        </div>
      )}
    </section>
  );
}
