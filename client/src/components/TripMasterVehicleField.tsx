import { useId } from "react";
import { TripMasterCombobox } from "./TripMasterCombobox";
import type { TripTransportRole } from "@shared/tripTransportRoles";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTripEquipmentMasters } from "@/hooks/use-trip-masters";
import { selectTripEquipment, equipmentOwnershipLabel } from "./trip-master-selection";
import type { TripRoleDraft } from "./TripTransportRoleFields";
import type { ExistingTripVendor } from "./trip-role-utils";

export function TripMasterVehicleField({ value, onChange, onChoice, vendors, choice, allowOutside, testIdPrefix }: {
  value: TripRoleDraft; onChange: (value: TripRoleDraft) => void; onChoice: (choice: TripTransportRole) => void;
  choice: TripTransportRole | null; vendors: ExistingTripVendor[]; allowOutside: boolean; testIdPrefix: string;
}) {
  const id = useId();
  const { master, owners } = useTripEquipmentMasters();
  const selectedId = value.equipmentId ?? value.internalEquipmentId;
  const selected = master.data?.find(e => e.id === selectedId);
  const owner = owners.data?.find(e => e.id === selectedId);
  const needle = value.vehicleNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matches = (master.data || []).filter(e => !!e.isActive && (!needle || (e.registrationNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, "").includes(needle)));
  const equipmentLabel = (e: NonNullable<typeof master.data>[number]) => {
    const reviewedOwner = owners.data?.find(item => item.id === e.id);
    const vendor = vendors.find(item => item.id === reviewedOwner?.vendorId);
    return `${e.equipmentType || e.name} · ${e.registrationNumber || "Registration missing"} · ${equipmentOwnershipLabel(e, vendor?.businessName?.trim() || reviewedOwner?.linkedVendorName || vendor?.name)}`;
  };
  const transporterId = choice === "same_party" ? value.materialSourceVendorId : value.supplierVendorId;
  return <div className="space-y-2">
    <Label htmlFor={id}>Vehicle / Tipper *</Label>
    {allowOutside && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!value.vehicleManual} onChange={e => {
      onChange({ ...value, vehicleManual: e.target.checked, equipmentId: null, internalEquipmentId: null });
      if (e.target.checked && choice === "in_house") onChoice("different_parties");
    }} />Other / Not in Master</label>}
    {value.vehicleManual ? <Input id={id} value={value.vehicleNumber} onChange={e => onChange({ ...value, vehicleNumber: e.target.value.toUpperCase() })} placeholder="Outside vehicle registration" data-testid={`input-${testIdPrefix}-vehicle`} /> : <>
      {master.isLoading && <div className="h-10 animate-pulse rounded bg-muted" role="status" aria-label="Loading Equipment Master" />}
      {master.isError ? <p role="alert" className="text-sm text-destructive">Equipment Master unavailable. <button type="button" className="underline" onClick={() => master.refetch()}>Retry</button></p> :
      <TripMasterCombobox id={id} value={selected ? equipmentLabel(selected) : value.vehicleNumber}
        selectedId={selectedId} disabled={master.isLoading} placeholder="Search registration, including last four digits"
        testId={`input-${testIdPrefix}-vehicle-search`} options={matches.map(e => ({ id: e.id, label: equipmentLabel(e) }))}
        onChange={text => onChange({ ...value, vehicleNumber: text.toUpperCase(), equipmentId: null, internalEquipmentId: null })}
        onSelect={id => {
        const equipment = master.data?.find(item => item.id === id && !!item.isActive);
        if (!equipment) { onChange({ ...value, equipmentId: null, internalEquipmentId: null }); return; }
        const reviewedOwner = owners.data?.find(item => item.id === equipment.id);
        const hasSameParty = choice === "same_party" && !!value.materialSourceSupplier.trim();
        const next = selectTripEquipment(hasSameParty ? { ...value, supplier: value.materialSourceSupplier, supplierVendorId: value.materialSourceVendorId } : value, equipment, reviewedOwner, vendors);
        onChange(next);
        onChoice(equipment.ownership === "owned" ? "in_house" : choice === "in_house" || !choice || (choice === "same_party" && !hasSameParty) ? "different_parties" : choice);
      }} />}
      {owners.isError && <p className="text-xs text-destructive">Confirmed owner unavailable. <button type="button" className="underline" onClick={() => owners.refetch()}>Retry</button></p>}
    </>}
    {selected?.ownership === "hired" && owner?.vendorId && owner.linkedVendorName && transporterId != null && transporterId !== owner.vendorId && <p role="status" className="text-sm text-amber-700">Transporter differs from the confirmed vehicle owner. Authorised review may be required.</p>}
  </div>;
}
