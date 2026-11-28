import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LDO_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import { requiredDipTanks, tankBookStock, tankStockAtDip, type TankDipRow, type TankPlantSettings, type TankPositionRow } from "@shared/tankBookStock";

export type OpeningTankDips = Partial<Record<"bitumen1" | "bitumen2" | "ldo1" | "ldo2", number>>;
export function ConfirmTankStock({ date, plantName, onComplete }: {
  date: string; plantName: string; onComplete(values: OpeningTankDips): void;
}) {
  const { featureCan } = useAuth();
  const canEnter = featureCan("plant_receipts", "add");
  const [values, setValues] = useState<Record<string, string>>({});
  const saved = useRef<OpeningTankDips>({});
  const dismissed = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const json = async (url: string) => {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error("Could not load tank stock.");
    return response.json();
  };
  const settings = useQuery<TankPlantSettings>({
    queryKey: ["/api/plant-module/plant-settings", plantName],
    queryFn: () => json(`/api/plant-module/plant-settings/${encodeURIComponent(plantName)}`),
  });
  const positions = useQuery<{ rows: TankPositionRow[] }>({
    queryKey: ["/api/plant-module/packed-stock-positions"], queryFn: () => json("/api/plant-module/packed-stock-positions"),
  });
  const bitumen = useQuery<TankDipRow[]>({
    queryKey: ["/api/plant-module/bitumen-dip-readings", { plantName, date }],
    queryFn: () => json(`/api/plant-module/bitumen-dip-readings?plantName=${encodeURIComponent(plantName)}&dateFrom=${date}&dateTo=${date}`),
  });
  const ldo = useQuery<TankDipRow[]>({
    queryKey: ["/api/plant-module/ldo-dip-readings", { plantName, date }],
    queryFn: () => json(`/api/plant-module/ldo-dip-readings?plant=${encodeURIComponent(plantName)}&dateFrom=${date}&dateTo=${date}`),
  });
  const specs = requiredDipTanks(settings.data);
  const current: OpeningTankDips = {};
  for (const spec of specs) {
    const reading = (spec.kind === "bitumen" ? bitumen.data : ldo.data)?.find(row => row.tankNumber === spec.tank && row.date === date && row.readingType === "opening");
    if (reading) current[`${spec.kind}${spec.tank}`] = reading.depthCm;
  }
  const finish = () => {
    if (dismissed.current) return;
    dismissed.current = true; onComplete({ ...current, ...saved.current });
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      for (const spec of specs) {
        const key = `${spec.kind}${spec.tank}` as keyof OpeningTankDips;
        if (current[key] != null || saved.current[key] != null || !values[key]?.trim()) continue;
        const cm = Number(values[key]);
        const stock = tankStockAtDip(settings.data, spec.kind, spec.tank, cm);
        if (stock == null) throw new Error(`${spec.kind === "bitumen" ? "Bitumen" : "LDO"} tank ${spec.tank}: enter a dip within its configured calibration.`);
        const volumeLiters = spec.kind === "bitumen" ? stock * 1000 / settings.data!.bitumenDensityKgPerL! : stock;
        await apiRequest("POST", `/api/plant-module/${spec.kind}-dip-readings`, {
          date, time: format(new Date(), "HH:mm"), plantName, tankNumber: spec.tank, depthCm: cm,
          volumeLiters, weightKg: spec.kind === "bitumen" ? stock * 1000 : stock * LDO_DENSITY_KG_PER_LITER,
          readingType: "opening", notes: "Opening dip confirmed at plant log start",
        });
        saved.current[key] = cm;
        queryClient.invalidateQueries({ queryKey: [`/api/plant-module/${spec.kind}-dip-readings`] });
      }
      finish();
    } catch (failure: any) { setError(failure.message || "Could not save opening dips. You can skip for now."); }
    finally { setBusy(false); }
  };
  const loading = settings.isLoading || positions.isLoading || bitumen.isLoading || ldo.isLoading;
  const loadError = settings.isError || positions.isError || bitumen.isError || ldo.isError;
  return <Dialog open onOpenChange={open => { if (!open) finish(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Confirm tank stock</DialogTitle></DialogHeader>
      <p className="text-sm">{plantName} · {date}. Enter actual dip readings; previous closing values are not confirmations.</p>
      {loading && <p>Loading tank stock…</p>}
      {loadError && <p role="alert">Could not load all tank details. You can skip for now.</p>}
      {!canEnter && <p>You do not have permission to enter dip readings. You can skip and continue the log.</p>}
      {specs.map(spec => {
        const key = `${spec.kind}${spec.tank}` as keyof OpeningTankDips;
        const row = tankBookStock({ ...spec, settings: settings.data, positions: positions.data?.rows, plantName, defaultPlantName: plantName });
        const cm = values[key]?.trim() ? Number(values[key]) : null;
        const stock = cm == null ? null : tankStockAtDip(settings.data, spec.kind, spec.tank, cm);
        const difference = stock != null && row.book != null ? stock - row.book : null;
        const unit = spec.kind === "bitumen" ? "MT" : "L";
        return <section key={key} className="space-y-1 rounded-md border p-2 text-sm">
          <h3 className="font-semibold">{spec.kind === "bitumen" ? "Bitumen" : "LDO"} tank {spec.tank}</h3>
          <p>Expected dip: {row.calibrationNeeded ? "Calibration needed" : row.expectedDip == null ? "Unavailable for this book stock" : `${row.expectedDip.toFixed(1)} cm`}</p>
          {current[key] != null || saved.current[key] != null ? <p>Opening dip already saved: {current[key] ?? saved.current[key]} cm</p> :
            <Input aria-label={`${spec.kind === "bitumen" ? "Bitumen" : "LDO"} tank ${spec.tank} actual dip (cm)`} type="number" min="0" step="0.1"
              value={values[key] ?? ""} disabled={busy || !canEnter || row.calibrationNeeded || loading || loadError}
              onChange={event => setValues({ ...values, [key]: event.target.value })} />}
          {stock != null && <p>Stock: {stock.toFixed(spec.kind === "bitumen" ? 3 : 1)} {unit}{difference != null ? ` · ${Math.abs(difference).toFixed(spec.kind === "bitumen" ? 3 : 1)} ${unit} ${difference >= 0 ? "more" : "less"} than book` : ""}</p>}
        </section>;
      })}
      {error && <p role="alert">{error} You can skip for now.</p>}
      <DialogFooter>
        <Button variant="outline" onClick={finish}>Skip for now</Button>
        <Button disabled={busy || loading || loadError || !canEnter} onClick={() => void save()}>{busy ? "Saving…" : "Save opening dips"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
