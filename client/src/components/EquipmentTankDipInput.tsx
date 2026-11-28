import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { equipmentDipVolumes, hasDipCalibration, type EquipmentTankDipSettings } from "@shared/equipmentTankDip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Equipment = EquipmentTankDipSettings & { id?: number; name?: string };
export type PriorEquipmentDip = { cm: number; litres: number; date: string } | null;
const n = (value: number) => Number(value.toFixed(3)).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export function EquipmentTankDipInput(props: Parameters<typeof ResolvedEquipmentTankDipInput>[0]) {
  if (props.equipment !== undefined && !hasDipCalibration(props.equipment)) return <>{props.children}</>;
  if (props.equipment === undefined && !props.equipmentId && !props.equipmentName) return <>{props.children}</>;
  return <ResolvedEquipmentTankDipInput {...props} />;
}

function ResolvedEquipmentTankDipInput({ equipment, equipmentId, equipmentName, kind, cm, litres, onChange,
  date, site, plantName, isNew = false, excludeSource, excludeId, openingLitres, issuedLitres = 0, children, testId,
  openingCm, runningHours,
}: {
  equipment?: Equipment | null; equipmentId?: number | null; equipmentName?: string;
  kind: "opening" | "closing"; cm?: number | null; litres?: number | null;
  onChange: (cm: number | null, litres: number | null) => void;
  date?: string; site?: string; plantName?: string; isNew?: boolean;
  excludeSource?: string; excludeId?: number | null;
  openingLitres?: number | null; issuedLitres?: number | null; children: ReactNode; testId?: string;
  openingCm?: number | null; runningHours?: number | null;
}) {
  const id = useId();
  const { data: masters } = useQuery<Equipment[]>({
    queryKey: ["/api/plant-module/equipment"],
    enabled: equipment === undefined && (!!equipmentId || !!equipmentName),
  });
  const matches = masters?.filter(row => equipmentId ? row.id === equipmentId :
    row.name?.trim().toLowerCase() === equipmentName?.trim().toLowerCase());
  const master = equipment ?? (matches?.length === 1 ? matches[0] : undefined);
  const calibrated = hasDipCalibration(master);
  const query = new URLSearchParams({ beforeDate: date ?? "", ...(site ? { site } : {}),
    ...(plantName ? { plant: plantName } : {}), ...(excludeSource ? { excludeSource } : {}),
    ...(excludeId ? { excludeId: String(excludeId) } : {}) });
  const { data: previous } = useQuery<PriorEquipmentDip>({
    queryKey: ["/api/equipment", master?.id, "last-diesel-dip", query.toString()],
    enabled: calibrated && kind === "opening" && !!master?.id && !!date,
    queryFn: async () => {
      const response = await fetch(`/api/equipment/${master?.id}/last-diesel-dip?${query}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load the last closing dip");
      return response.json();
    },
  });
  const changed = useRef(false);
  const [typed, setTyped] = useState<string | null>(null);
  const identity = `${master?.id}:${date}:${excludeSource}:${excludeId}`;
  useEffect(() => { changed.current = false; setTyped(null); }, [identity]);
  useEffect(() => {
    if (calibrated && isNew && previous && cm == null && !changed.current) {
      changed.current = true;
      onChange(previous.cm, previous.cm * master.dipLitersPerCm);
    }
  }, [calibrated, isNew, previous, cm, master, onChange]);
  if (!calibrated) return <>{children}</>;
  const displayedCm = cm ?? (litres != null ? litres / master.dipLitersPerCm : null);
  const volumes = displayedCm == null ? null : equipmentDipVolumes(displayedCm, master);
  return <div className="space-y-1">
    <Label htmlFor={id}>{kind === "opening" ? "Opening dip (cm)" : "Closing dip (cm)"}</Label>
    <Input id={id} type="number" step="any" value={typed ?? displayedCm ?? ""} data-testid={testId}
      onChange={event => {
        changed.current = true;
        setTyped(event.target.value);
        const value = event.target.value === "" ? null : Number(event.target.value);
        onChange(value, value == null ? null : value * master.dipLitersPerCm);
      }} />
    {volumes && <p className="text-sm">Tank {n(volumes.tank)} L · usable {n(volumes.usable)} L</p>}
    {volumes && master.tankCapacityLiters != null && volumes.tank > master.tankCapacityLiters &&
      <p role="status" className="text-sm text-amber-700">Above tank capacity</p>}
    {kind === "closing" && displayedCm != null && displayedCm < (master.deadStockDepthCm ?? 0) &&
      <p role="status" className="text-sm text-amber-700">below outlet — engine may not draw</p>}
    {kind === "closing" && openingLitres != null && litres != null && openingLitres + (issuedLitres ?? 0) - litres < 0 &&
      <p role="status" className="text-sm text-amber-700">Consumption is negative — check the readings and diesel added</p>}
    {kind === "opening" && previous && displayedCm != null && Math.abs(displayedCm - previous.cm) > 0.00001 &&
      <p role="status" className="text-sm text-amber-700">Last closing was {n(previous.cm)} cm ({n(previous.litres)} L) on {previous.date}</p>}
    {kind === "closing" && <EquipmentDipFillingCheck key={identity} equipment={master}
      openingCm={openingCm} closingCm={cm} issuedLitres={issuedLitres} runningHours={runningHours} />}
  </div>;
}

function EquipmentDipFillingCheck({ equipment, openingCm, closingCm, issuedLitres, runningHours }: {
  equipment: Equipment & { dipLitersPerCm: number }; openingCm?: number | null; closingCm?: number | null;
  issuedLitres?: number | null; runningHours?: number | null;
}) {
  const { isOwner } = useAuth();
  const [checked, setChecked] = useState(false);
  const id = useId();
  const delta = openingCm != null && closingCm != null ? closingCm - openingCm : null;
  const ready = issuedLitres != null && issuedLitres > 0 && delta != null && delta > 0;
  const show = ready && (checked || runningHours === 0);
  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/plant-module/equipment/${equipment.id}/dip-calibration`, {
      issuedLitres, openingDipCm: openingCm, closingDipCm: closingCm,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] }),
  });
  return <div className="space-y-2 pt-1 text-sm">
    <div className="flex items-center gap-2"><Checkbox id={id} checked={checked} onCheckedChange={value => setChecked(value === true)} />
      <Label htmlFor={id}>Filling check</Label></div>
    {show && <p>Issued {n(issuedLitres!)} L raised the dip {n(delta!)} cm → {n(issuedLitres! / delta!)} L/cm (master: {n(equipment.dipLitersPerCm)} L/cm)</p>}
    {checked && !ready && <p>Enter diesel issued and an opening/closing dip with a positive rise.</p>}
    {show && isOwner && equipment.id != null &&
      <Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Use this figure</Button>}
    {mutation.isSuccess && <p role="status">Master litres per cm updated</p>}
    {mutation.isError && <p role="alert">Could not update the master: {mutation.error.message}</p>}
  </div>;
}
