import { useId, useState } from "react";
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
  const [search, setSearch] = useState("");
  const { master, owners } = useTripEquipmentMasters();
  const selectedId = value.equipmentId ?? value.internalEquipmentId;
  const selected = master.data?.find(e => e.id === selectedId);
  const owner = owners.data?.find(e => e.id === selectedId);
  const needle = search.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matches = (master.data || []).filter(e => !!e.isActive && (!needle || (e.registrationNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, "").includes(needle)));
  const visible = selected && !matches.some(e => e.id === selected.id) ? [selected, ...matches] : matches;
  const transporterId = choice === "same_party" ? value.materialSourceVendorId : value.supplierVendorId;
  return <div className="space-y-2">
    <Label htmlFor={id}>Vehicle / Tipper *</Label>
    {allowOutside && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!value.vehicleManual} onChange={e => {
      onChange({ ...value, vehicleManual: e.target.checked, equipmentId: null, internalEquipmentId: null });
      if (e.target.checked && choice === "in_house") onChoice("different_parties");
    }} />Other / Not in Master</label>}
    {value.vehicleManual ? <><Input id={id} value={value.vehicleNumber} onChange={e => onChange({ ...value, vehicleNumber: e.target.value.toUpperCase() })} placeholder="Outside vehicle registration" data-testid={`input-${testIdPrefix}-vehicle`} /><p className="text-xs text-muted-foreground">Recorded text only; no confirmed equipment hire link.</p></> : <>
      <Input id={id} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search registration, including last four digits" data-testid={`input-${testIdPrefix}-vehicle-search`} />
      {master.isLoading && <div className="h-10 animate-pulse rounded bg-muted" role="status" aria-label="Loading Equipment Master" />}
      {master.isError ? <p role="alert" className="text-sm text-destructive">Equipment Master unavailable. <button type="button" className="underline" onClick={() => master.refetch()}>Retry</button></p> :
      <select aria-label="Vehicle / Tipper · Equipment Master" value={selectedId ?? ""} disabled={master.isLoading} className="w-full rounded-md border bg-background p-2 text-sm" onChange={e => {
        const equipment = master.data?.find(item => item.id === Number(e.target.value) && !!item.isActive);
        if (!equipment) { onChange({ ...value, equipmentId: null, internalEquipmentId: null }); return; }
        const reviewedOwner = owners.data?.find(item => item.id === equipment.id);
        const hasSameParty = choice === "same_party" && !!value.materialSourceSupplier.trim();
        const next = selectTripEquipment(hasSameParty ? { ...value, supplier: value.materialSourceSupplier, supplierVendorId: value.materialSourceVendorId } : value, equipment, reviewedOwner, vendors);
        onChange(next);
        onChoice(equipment.ownership === "owned" ? "in_house" : choice === "in_house" || !choice || (choice === "same_party" && !hasSameParty) ? "different_parties" : choice);
      }}>
        <option value="">Select an Equipment Master vehicle</option>
        {visible.map(e => { const o = owners.data?.find(item => item.id === e.id); return <option key={e.id} value={e.id} disabled={!e.isActive}>{e.equipmentType || e.name} · {e.registrationNumber || "Registration missing"} · {equipmentOwnershipLabel(e, o?.linkedVendorName)}{!e.isActive ? " · Inactive" : ""}</option>; })}
      </select>}
      {!selectedId && value.vehicleNumber && <p className="text-xs text-muted-foreground">Legacy / unselected registration: {value.vehicleNumber}</p>}
      {!master.isLoading && !master.isError && !matches.length && <p className="text-xs text-muted-foreground">No active Equipment Master match.</p>}
      {owners.isError && <p className="text-xs text-destructive">Confirmed owner unavailable. <button type="button" className="underline" onClick={() => owners.refetch()}>Retry</button></p>}
    </>}
    {selected?.ownership === "hired" && owner?.vendorId && owner.linkedVendorName && transporterId != null && transporterId !== owner.vendorId && <p role="status" className="text-sm text-amber-700">Transporter differs from the confirmed vehicle owner. Authorised review may be required.</p>}
  </div>;
}
