import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  dipWatchSettings, tankBookStock, type DipWatchSettings, type TankDipRow,
  type TankKind, type TankPlantSettings, type TankPositionRow,
} from "@shared/tankBookStock";

export function TankBookStock({ kind, plantName, defaultPlantName, positions, readings, settingsOnly = false }: {
  kind: TankKind; plantName: string; defaultPlantName: string; positions?: TankPositionRow[]; readings?: TankDipRow[];
  settingsOnly?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: settings, isError } = useQuery<TankPlantSettings>({
    queryKey: ["/api/plant-module/plant-settings", plantName],
    queryFn: async () => {
      const response = await fetch(`/api/plant-module/plant-settings/${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load tank settings.");
      return response.json();
    },
  });
  const [draft, setDraft] = useState<DipWatchSettings | null>(null);
  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/plant-module/plant-settings/${encodeURIComponent(plantName)}/dip-watch`, draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/plant-settings"] });
      setDraft(null); toast({ title: "Tank dip settings saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save tank settings", description: error.message, variant: "destructive" }),
  });
  const unit = kind === "bitumen" ? "MT" : "L";
  const number = (value: number | null, suffix = unit) => value == null ? "—" : `${value.toLocaleString("en-IN", { maximumFractionDigits: kind === "bitumen" ? 3 : 1 })} ${suffix}`;
  const settingsForm = draft && user?.isOwner && <form className="space-y-2 border-t pt-3" onSubmit={event => { event.preventDefault(); save.mutate(); }} aria-label="Tank dip settings">
    {([
      ["bitumenAllowedDifferenceMt", "Allowed bitumen difference (MT)", "number", "0.001"],
      ["ldoAllowedDifferenceL", "Allowed LDO difference (L)", "number", "0.1"],
      ["firstReminder", "First reminder (India time)", "time", undefined],
      ["repeatHours", "Repeat every (hours)", "number", "1"],
      ["lastReminder", "Last reminder (India time)", "time", undefined],
    ] as const).map(([key, label, type, step]) =>
      <Label className="block" key={key}>{label}<Input aria-label={label} type={type} step={step} min={key === "repeatHours" ? 1 : type === "number" ? 0 : undefined} required value={draft[key]}
        onChange={event => setDraft({ ...draft, [key]: type === "number" ? Number(event.target.value) : event.target.value })} /></Label>)}
    <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>Save settings</Button><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setDraft(null)}>Cancel</Button></div>
  </form>;
  if (settingsOnly) return user?.isOwner ? <>
    <Button size="sm" variant="outline" disabled={isError || !settings} onClick={() => setDraft(dipWatchSettings(settings))}>Dip settings</Button>
    <Dialog open={draft != null} onOpenChange={open => { if (!open && !save.isPending) setDraft(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Dip settings</DialogTitle></DialogHeader>{settingsForm}</DialogContent>
    </Dialog>
  </> : null;
  return <Card data-testid={`tank-book-stock-${kind}`}>
    <CardHeader className="pb-2">
      <CardTitle className="text-base flex items-center justify-between gap-2">
        {kind === "bitumen" ? "Bitumen" : "LDO"} tank book stock
        {user?.isOwner && <Button size="sm" variant="outline" onClick={() => setDraft(dipWatchSettings(settings))}>Dip settings</Button>}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      {isError && <p role="alert">Could not load tank settings.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{([1, 2] as const).map(tank => {
        const row = tankBookStock({ kind, tank, positions, readings, settings, plantName, defaultPlantName });
        return <section className="rounded-md border p-3 space-y-1 text-sm" key={tank} data-testid={`tank-book-${kind}-${tank}`}>
          <h3 className="font-semibold">Tank {tank}</h3>
          <p>Book stock: <strong>{number(row.book)}</strong></p>
          <p>Usable: {row.calibrationNeeded ? "Calibration needed" : number(row.usable)} · Dead stock: {row.calibrationNeeded ? "Calibration needed" : number(row.deadStock)}</p>
          {row.parties.map((party, index) => <p className="text-muted-foreground" key={`${party.partyId}:${index}`}>{party.partyName}: {number(party.stock)}</p>)}
          <p>Expected dip: {row.calibrationNeeded ? "Calibration needed" : row.book == null ? "Book stock unavailable" : row.expectedDip == null ? "Book stock outside calibration range" : `${row.expectedDip.toFixed(1)} cm`}</p>
          {row.latest ? <>
            <p>Last actual dip: {row.latest.date} {row.latest.time || "—"} · {row.latest.depthCm} cm · {number(row.actualStock)}</p>
            <p className={row.overLimit ? "font-bold" : ""} data-testid={`tank-difference-${kind}-${tank}`}>
              {row.difference == null ? "Difference unavailable" : Math.abs(row.difference) < 1e-9 ? "Matches book" :
                `${number(Math.abs(row.difference))} ${row.difference > 0 ? "more" : "less"} than book`}
            </p>
          </> : <p className="text-muted-foreground">No actual dip recorded</p>}
        </section>;
      })}</div>
      {settingsForm}
    </CardContent>
  </Card>;
}
