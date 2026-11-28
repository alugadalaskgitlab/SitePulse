import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EquipmentTankDipSettings } from "@shared/equipmentTankDip";

export function DieselTankDipSettings({ value, onChange }: {
  value: EquipmentTankDipSettings;
  onChange: (value: EquipmentTankDipSettings) => void;
}) {
  return <fieldset className="space-y-2 rounded border p-3">
    <legend className="px-1 text-sm font-medium">Diesel tank dip</legend>
    {([
      ["dipLitersPerCm", "Litres per cm of dip"],
      ["deadStockDepthCm", "Outlet height from tank bottom (cm)"],
      ["tankCapacityLiters", "Tank capacity (L)"],
    ] as const).map(([key, label]) => <div key={key}>
      <Label htmlFor={`equipment-${key}`}>{label}</Label>
      <Input id={`equipment-${key}`} type="number" min="0" step="any"
        value={value[key] ?? ""} onChange={e => onChange({
          ...value, [key]: e.target.value === "" ? null : Number(e.target.value),
        })} />
      {key === "deadStockDepthCm" && <p className="text-xs text-muted-foreground">Diesel below the outlet cannot be used</p>}
    </div>)}
  </fieldset>;
}
