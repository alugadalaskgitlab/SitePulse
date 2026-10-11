import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { equipmentIdentityLabel, filterEquipmentByRegistration, uniqueRegistrationMatch, type TripEquipmentOption } from "./trip-link-utils";

export function TripEquipmentPicker({ options, value, onChange, registration, allowOutside = false }: {
  options: TripEquipmentOption[]; value: string; onChange: (id: string) => void;
  registration: string; allowOutside?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const suggested = uniqueRegistrationMatch(options, registration);
  const filtered = filterEquipmentByRegistration(options, search);
  const selected = options.find(e => String(e.id) === value);
  const visible = selected && !filtered.some(e => e.id === selected.id) ? [selected, ...filtered] : filtered;
  return <section className="space-y-2">
    <Label htmlFor={`${id}-search`}>Equipment Master · search registration</Label>
    <Input id={`${id}-search`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search e.g. TS15UE4470" />
    <select aria-label="Equipment Master vehicle" className="w-full rounded-md border bg-background p-2 text-sm" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{allowOutside ? "Outside / unregistered vehicle — enter registration below" : "Select an existing hired vehicle"}</option>
      {visible.map(e => <option key={e.id} value={e.id}>{equipmentIdentityLabel(e)}</option>)}
    </select>
    {selected && <p className="rounded-md border bg-muted/20 p-2 text-xs">{equipmentIdentityLabel(selected)}</p>}
    {!filtered.length && <p className="text-xs text-muted-foreground">No matching registration. {allowOutside ? "Keep manual registration for an outside vehicle; no master is created." : "Clear the search to review other vehicles."}</p>}
    {!value && suggested && <p className="text-xs text-muted-foreground">Unique registration match: {equipmentIdentityLabel(suggested)}. Review and select it explicitly.</p>}
    {!value && registration && !suggested && <p className="text-xs text-muted-foreground">No unique registration match. Review manually; no vehicle is selected automatically.</p>}
  </section>;
}
