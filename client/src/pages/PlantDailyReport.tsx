import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Edit, Loader2, History } from "lucide-react";
import { format, addDays, subDays, parseISO } from "date-fns";
import { heatingSessionTypeLabel } from "@shared/schema";
import type { PlantShiftLogWithDetails } from "@shared/schema";
import { getVolumeAtDepth, getUsableVolume, BITUMEN_DENSITY_KG_PER_LITER } from "@shared/bitumen-dip-chart";
import DryerSourceFixDialog, { type DryerSourceFixTarget } from "@/components/DryerSourceFixDialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DailyPlantSummary = {
  date: string;
  plantName: string;
  shift?: PlantShiftLogWithDetails;
  production: {
    totalLoads: number;
    totalProductionMT: number;
    theoreticalBitumenMT: number;
    actualBitumenMT: number;
    bitumenVarianceMT: number;
    theoreticalLdoL: number;
    actualLdoL: number;
    byMix: Array<{ mixName: string; mixType: string; loads: number; mt: number; theoreticalBitumenMT: number; theoreticalLdoL: number }>;
  };
  dispatches: Array<{ id: number; truckNumber: string; partyName?: string; mixName?: string; loadWeight: number; deliveryLocation?: string; time?: string }>;
  receipts: { byMaterial: Array<{ materialName: string; quantity: number; uom: string; lines: number }>; totalLines: number };
  runningHours: number | null;
  productiveHours: number | null;
  ldo: { consumedT1L: number | null; consumedT2L: number | null; consumedTotalL: number | null; lPerHour: number | null; lPerMT: number | null; dryerLPerMT: number | null; boilerLPerMT: number | null; source: string; primarySourceT1?: "sessions" | "shift_meter" | "dip_fallback"; reconciliationT1ShiftL?: number | null; dryerFedFrom?: "TANK_1" | "TANK_2"; tank1DeductedL?: number | null; tank2DeductedL?: number | null; dipDeltaT1L?: number | null; dipDeltaT2L?: number | null };
  bitumenDips: unknown[];
  ldoFlows: unknown[];
  ldoDips: unknown[];
  equipment: Array<{
    id: number;
    equipmentId: number;
    equipmentName: string | null;
    hours: number | null;
    opening: number | null;
    closing: number | null;
    issued: number;
    consumed: number | null;
    lPerHr: number | null;
    expected: number | null;
    variance: number | null;
    variancePct: number | null;
    balanceConfirmed: boolean;
    operator: string | null;
    remarks: string | null;
  }>;
  totalDieselIssued: number;
  generators: { items: Array<{ id: number; generatorName: string; hoursRun: number | null; opening: number | null; issued: number; closing: number | null; consumed: number | null; lPerHr: number | null; derivedSource: string; efficiency: number | null; sourceHeatingSessionId: number | null }>; totalDieselConsumedL: number };
  manpower: Array<{ name: string; role: string | null; contractorName?: string | null; category?: string | null; gender?: string | null }>;
  manpowerByContractor: Array<{ contractor: string; category: string; gender: string; count: number }>;
  idle: { events: Array<{ startTime: string; endTime: string | null; reason: string; remarks: string | null; minutes: number }>; byReason: Record<string, number>; totalMinutes: number };
  boilerHeating?: {
    sessionCount: number;
    totalHours: number;
    sessionsLdoT1L: number;
    boilerDuringProductionL: number;
    totalBoilerLdoL: number;
    boilerRunsDuringProduction: boolean;
    lPerHour: number | null;
    lPerMT: number | null;
    dgDieselL: number;
    shiftLogT1L: number | null;
    mismatchL: number | null;
    sessionsLdoT1LToday: number | null;
    ledgerSessionsT1L: number | null;
    ledgerShiftT1L: number | null;
    reconciliation: {
      thresholdL: number;
      sessionsVsShiftL: number | null;
      sessionsVsLedgerL: number | null;
      shiftVsLedgerL: number | null;
      anyMismatch: boolean;
      mismatches: Array<{ kind: "sessions_vs_shift" | "sessions_vs_ledger" | "shift_vs_ledger"; deltaL: number }>;
    };
    primarySource: "sessions" | "shift_meter";
    attributionFromDate: string | null;
    attributionToDate: string;
    sessions?: Array<{
      id: number;
      date: string;
      sessionType: string;
      startTime: string | null;
      endTime: string | null;
      durationHours: number | null;
      ldoTank1Consumed: number | null;
      dgDieselConsumed: number | null;
      staffName: string | null;
      isFinalized: number;
    }>;
  };
};

type DryerMismatchRow = {
  date: string;
  plantName: string;
  shiftLogId: number | null;
  shiftLogValue: "TANK_1" | "TANK_2" | null;
  conflictingSessions: Array<{ id: number; dryerFedFrom: "TANK_1" | "TANK_2"; sessionType: string; startTime: string | null }>;
  hasMismatch: boolean;
};

export default function PlantDailyReport() {
  const { appendOrigin, getPlantBackLink, appendPlantContext } = useOrigin();
  const { toast } = useToast();
  const [, params] = useRoute("/plant/daily-report/:date");
  const backHref = appendPlantContext("/plant/daily-reports", { defaultTab: "reports" });
  const [date, setDate] = useState(params?.date || format(new Date(), "yyyy-MM-dd"));
  const [plantName, setPlantName] = useState("Main Plant");
  const [showAllDispatches, setShowAllDispatches] = useState(false);
  const [fixDialog, setFixDialog] = useState<{ open: boolean; target: DryerSourceFixTarget | null }>({ open: false, target: null });

  const { data: plantsList } = useQuery<string[]>({
    queryKey: ["/api/plant-module/shift-logs/plants"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/shift-logs/plants", { credentials: "include" });
      if (!res.ok) return ["Main Plant"];
      return res.json();
    },
  });

  const { data, isLoading } = useQuery<DailyPlantSummary>({
    queryKey: ["/api/plant-module/daily-reports", date, plantName],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/daily-reports/${date}?plant=${encodeURIComponent(plantName)}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const fmt = (n: number | null | undefined, dp = 2) =>
    n === null || n === undefined || isNaN(n) ? "—" : n.toFixed(dp);

  const fmtMt = (mt: number | null) => (mt === null ? "—" : mt.toFixed(2));

  const { data: dryerMismatchRows } = useQuery<DryerMismatchRow[]>({
    queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches", date, date, plantName],
    queryFn: async () => {
      const qs = new URLSearchParams({ dateFrom: date, dateTo: date, plant: plantName });
      const res = await fetch(`/api/plant-module/heating-sessions/dryer-source-mismatches?${qs}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!date && !!plantName,
  });
  const mismatch = (dryerMismatchRows || []).find(r => r.hasMismatch) ?? null;

  const alignSessionsMutation = useMutation({
    mutationFn: ({ sessionIds, targetValue }: { sessionIds: number[]; targetValue: "TANK_1" | "TANK_2" }) =>
      apiRequest("PATCH", "/api/plant-module/heating-sessions/align-dryer-source", { sessionIds, targetValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/heating-sessions/dryer-source-mismatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/daily-reports"] });
      toast({ title: "Sessions updated — dryer source corrected" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update sessions", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Daily Plant Report</h1>
            <p className="text-sm text-muted-foreground">Consolidated view: shift, production, fuel, idle, manpower</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden h-9">
            <Button variant="ghost" size="icon" className="h-9 w-8 rounded-none border-r shrink-0" data-testid="button-prev-date"
              onClick={() => setDate(format(subDays(parseISO(date), 1), "yyyy-MM-dd"))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40 rounded-none border-0 h-9 text-center focus-visible:ring-0 focus-visible:ring-offset-0" data-testid="input-date" />
            <Button variant="ghost" size="icon" className="h-9 w-8 rounded-none border-l shrink-0" data-testid="button-next-date"
              onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <select value={plantName} onChange={e => setPlantName(e.target.value)} className="border rounded px-2 py-1 text-sm" data-testid="select-plant">
            {(plantsList && plantsList.length ? plantsList : ["Main Plant"]).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <Link href={appendPlantContext(`/plant/shift-log/${date}`, { defaultTab: "reports" })}>
            <Button variant="outline" size="sm" data-testid="button-edit-shift-log"><Edit className="w-4 h-4 mr-1" />Shift Log</Button>
          </Link>
          <Link href={appendPlantContext("/plant/daily-reports", { defaultTab: "reports" })}>
            <Button variant="outline" size="sm" data-testid="button-browse-all-dates"><History className="w-4 h-4 mr-1" />Browse all dates</Button>
          </Link>
          <a href={`/api/plant-module/daily-reports/${date}/pdf?plant=${encodeURIComponent(plantName)}`} target="_blank" rel="noreferrer">
            <Button variant="default" size="sm" data-testid="button-download-pdf"><Download className="w-4 h-4 mr-1" />PDF</Button>
          </a>
        </div>
      </div>

      {mismatch && mismatch.shiftLogValue && (() => {
        const slValue = mismatch.shiftLogValue;
        const slLabel = slValue === "TANK_1" ? "Boiler tank" : "Dryer tank";
        const oppValue = slValue === "TANK_1" ? "TANK_2" : "TANK_1";
        const oppLabel = slValue === "TANK_1" ? "Dryer tank" : "Boiler tank";
        const sessionIds = mismatch.conflictingSessions.map(s => s.id);
        const n = sessionIds.length;
        return (
          <div
            className="rounded-md border border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20 px-4 py-3 text-sm space-y-2"
            data-testid="panel-dryer-mismatch"
          >
            <p className="text-red-700 dark:text-red-300 leading-snug font-medium">
              <AlertTriangle className="inline w-4 h-4 mr-1 -mt-0.5" />
              <strong>Dryer-source conflict:</strong> The shift log says <strong>{slLabel}</strong>, but {n} heating session{n !== 1 ? "s" : ""} {n !== 1 ? "say" : "says"} <strong>{oppLabel}</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {mismatch.shiftLogId != null && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setFixDialog({
                    open: true,
                    target: {
                      mode: "shift-log",
                      recordId: mismatch.shiftLogId!,
                      date,
                      currentValue: slValue,
                      suggestedValue: oppValue,
                    },
                  })}
                  data-testid="button-fix-shiftlog"
                >
                  Fix shift log → {oppLabel}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={alignSessionsMutation.isPending}
                onClick={() => alignSessionsMutation.mutate({ sessionIds, targetValue: slValue })}
                data-testid="button-fix-sessions"
              >
                {alignSessionsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Fix {n} session{n !== 1 ? "s" : ""} → match shift log ({slLabel})
              </Button>
            </div>
          </div>
        );
      })()}

      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {!isLoading && data && (() => {
        const dipToMtLocal = (dip: number | null | undefined): number => {
          if (dip == null || dip <= 0) return 0;
          return getVolumeAtDepth(dip) * BITUMEN_DENSITY_KG_PER_LITER / 1000;
        };
        const bitT1Consumed = (data.shift?.bitumenTank1OpeningDip != null && data.shift?.bitumenTank1ClosingDip != null)
          ? Math.max(0, dipToMtLocal(data.shift.bitumenTank1OpeningDip) - dipToMtLocal(data.shift.bitumenTank1ClosingDip)) : null;
        const bitT2Consumed = (data.shift?.bitumenTank2OpeningDip != null && data.shift?.bitumenTank2ClosingDip != null)
          ? Math.max(0, dipToMtLocal(data.shift.bitumenTank2OpeningDip) - dipToMtLocal(data.shift.bitumenTank2ClosingDip)) : null;
        const bitConsumedMt = (bitT1Consumed != null || bitT2Consumed != null) ? (bitT1Consumed ?? 0) + (bitT2Consumed ?? 0) : null;

        return (
          <>

            <Card>
              <CardHeader><CardTitle>Shift Detail</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><div className="text-muted-foreground">Shift</div><div className="font-medium">{data.shift?.shiftCode || "—"}</div></div>
                <div><div className="text-muted-foreground">Operator</div><div className="font-medium">{data.shift?.operatorName || "—"}</div></div>
                <div><div className="text-muted-foreground">Supervisor</div><div className="font-medium">{data.shift?.supervisorName || "—"}</div></div>
                <div><div className="text-muted-foreground">Status</div>
                  <div className="flex flex-wrap items-center gap-1">
                    {data.shift?.isFinalized ? <Badge className="bg-green-600">Finalized</Badge> : data.shift ? <Badge variant="secondary">Draft</Badge> : <Badge variant="outline">No log</Badge>}
                    {data.shift?.noMainPlantOps && <Badge variant="destructive" data-testid="badge-no-plant-ops">No Plant Operations</Badge>}
                    {mismatch && mismatch.shiftLogId != null && mismatch.shiftLogValue != null && (
                      <button
                        type="button"
                        onClick={() => setFixDialog({
                          open: true,
                          target: {
                            mode: "shift-log",
                            recordId: mismatch.shiftLogId!,
                            date,
                            currentValue: mismatch.shiftLogValue!,
                            suggestedValue: mismatch.conflictingSessions[0]?.dryerFedFrom ?? (mismatch.shiftLogValue === "TANK_1" ? "TANK_2" : "TANK_1"),
                          },
                        })}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0 text-sm font-medium bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-700 dark:hover:bg-orange-900/50 cursor-pointer"
                        data-testid="badge-dryer-mismatch"
                      >
                        ⚠ Dryer source conflict
                      </button>
                    )}
                  </div>
                </div>
                <div><div className="text-muted-foreground">{data.shift?.noMainPlantOps ? "Shift Start" : "Plant Start"}</div><div className="font-medium">{data.shift?.plantStartTime || "—"}</div></div>
                <div><div className="text-muted-foreground">{data.shift?.noMainPlantOps ? "Shift End" : "Plant Stop"}</div><div className="font-medium">{data.shift?.plantStopTime || "—"}</div></div>
                <div><div className="text-muted-foreground">Running Hrs</div><div className="font-medium" data-testid="text-running-hours">{fmt(data.runningHours)}</div></div>
                <div><div className="text-muted-foreground">Productive Hrs</div><div className="font-medium" data-testid="text-productive-hours">{fmt(data.productiveHours)}</div></div>
                <div><div className="text-muted-foreground">Weather</div><div className="font-medium">{data.shift?.weather || "—"}</div></div>
                <div><div className="text-muted-foreground">Ambient Temp °C</div><div className="font-medium">{fmt(data.shift?.ambientTemp, 1)}</div></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Production</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <KV label="Loads" value={data.production.totalLoads} testId="text-loads" />
                <KV label="Total MT" value={fmt(data.production.totalProductionMT)} testId="text-mt" />
                <KV label="Theoretical Bitumen MT" value={fmt(data.production.theoreticalBitumenMT, 3)} />
                <KV label="Theoretical LDO L" value={fmt(data.production.theoreticalLdoL, 1)} />
                {bitConsumedMt != null && (
                  <KV label="Actual Bitumen MT (dip)" value={fmtMt(bitConsumedMt)} />
                )}
              </CardContent>

              {data.production.byMix?.length > 0 && (
                <CardContent className="border-t pt-4 pb-3">
                  <p className="text-sm font-semibold mb-2">By Mix</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Mix</TableHead><TableHead>Type</TableHead>
                      <TableHead className="text-right">Loads</TableHead><TableHead className="text-right">MT</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.production.byMix.map((m, i) => (
                        <TableRow key={i} data-testid={`row-mix-${i}`}>
                          <TableCell>{m.mixName}</TableCell>
                          <TableCell><Badge variant="outline">{m.mixType}</Badge></TableCell>
                          <TableCell className="text-right">{m.loads}</TableCell>
                          <TableCell className="text-right font-semibold">{m.mt.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}

              {!data.shift?.noMainPlantOps && (data.ldo.consumedT1L != null || data.ldo.consumedT2L != null) && (() => {
                const totalL = data.ldo.consumedTotalL ?? 0;
                const shiftHrs = (totalL > 0 && data.ldo.lPerHour && data.ldo.lPerHour > 0)
                  ? totalL / data.ldo.lPerHour : null;
                const dryerL = data.ldo.consumedT2L;
                const boilerL = data.ldo.consumedT1L;
                const dryerLHr = (shiftHrs && dryerL != null) ? dryerL / shiftHrs : null;
                const boilerLHr = (shiftHrs && boilerL != null) ? boilerL / shiftHrs : null;
                const totalLMT = (data.ldo.dryerLPerMT != null && data.ldo.boilerLPerMT != null)
                  ? data.ldo.dryerLPerMT + data.ldo.boilerLPerMT : null;
                return (
                  <CardContent className="border-t pt-4 pb-3" data-testid="section-ldo-production-stats">
                    <p className="text-sm font-semibold mb-3">LDO Consumption</p>
                    <div className="grid grid-cols-[5rem_1fr_1fr_1fr] gap-x-4 gap-y-2 text-sm items-baseline">
                      <div />
                      <div className="text-sm font-medium text-muted-foreground">Consumed (L)</div>
                      <div className="text-sm font-medium text-muted-foreground">L / hr</div>
                      <div className="text-sm font-medium text-muted-foreground">L / MT</div>

                      <div className="text-sm font-medium">Dryer</div>
                      <div className="font-semibold" data-testid="text-prod-dryer-l">{fmt(dryerL, 1)}</div>
                      <div className="font-semibold" data-testid="text-prod-dryer-lhr">{dryerLHr != null ? dryerLHr.toFixed(1) : "—"}</div>
                      <div className="font-semibold" data-testid="text-prod-dryer-lmt">{fmt(data.ldo.dryerLPerMT, 2)}</div>

                      <div className="text-sm font-medium">Boiler</div>
                      <div className="font-semibold" data-testid="text-prod-boiler-l">{fmt(boilerL, 1)}</div>
                      <div className="font-semibold" data-testid="text-prod-boiler-lhr">{boilerLHr != null ? boilerLHr.toFixed(1) : "—"}</div>
                      <div className="font-semibold" data-testid="text-prod-boiler-lmt">{fmt(data.ldo.boilerLPerMT, 2)}</div>

                      <div className="text-sm font-bold">Total</div>
                      <div className="font-bold" data-testid="text-prod-total-l">{fmt(data.ldo.consumedTotalL, 1)}</div>
                      <div className="font-bold" data-testid="text-prod-total-lhr">{fmt(data.ldo.lPerHour, 1)}</div>
                      <div className="font-bold" data-testid="text-prod-total-lmt">{totalLMT != null ? totalLMT.toFixed(2) : "—"}</div>
                    </div>
                  </CardContent>
                );
              })()}
            </Card>
            {data.dispatches?.length > 0 && (
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>Dispatch List ({data.dispatches.length})</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowAllDispatches(s => !s)} data-testid="button-toggle-dispatches">
                    {showAllDispatches ? "Hide" : "Show"}
                  </Button>
                </CardHeader>
                {showAllDispatches && (
                <CardContent>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Time</TableHead><TableHead>Truck</TableHead><TableHead>Party</TableHead>
                      <TableHead>Mix</TableHead><TableHead className="text-right">MT</TableHead><TableHead>Location</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.dispatches.map((d) => (
                        <TableRow key={d.id} data-testid={`row-dispatch-${d.id}`}>
                          <TableCell>{d.time || "—"}</TableCell>
                          <TableCell>{d.truckNumber}</TableCell>
                          <TableCell>{d.partyName}</TableCell>
                          <TableCell>{d.mixName}</TableCell>
                          <TableCell className="text-right">{d.loadWeight?.toFixed(2)}</TableCell>
                          <TableCell>{d.deliveryLocation || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
                )}
              </Card>
            )}
            {!data.shift?.noMainPlantOps && (
            <Card>
              <CardHeader><CardTitle>Bitumen Tank Status (from Shift Log)</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <KV label="Tank 1 Temp (°C)" value={fmt(data.shift?.bitumenTank1Temp, 1)} testId="text-bitumen-tank1-temp" />
                  <KV label="Tank 2 Temp (°C)" value={fmt(data.shift?.bitumenTank2Temp, 1)} testId="text-bitumen-tank2-temp" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {([
                    { label: "Tank 1 — Opening", dip: data.shift?.bitumenTank1OpeningDip, testId: "text-bitumen-tank1-open-mt" },
                    { label: "Tank 1 — Closing",  dip: data.shift?.bitumenTank1ClosingDip,  testId: "text-bitumen-tank1-close-mt" },
                    { label: "Tank 2 — Opening", dip: data.shift?.bitumenTank2OpeningDip, testId: "text-bitumen-tank2-open-mt" },
                    { label: "Tank 2 — Closing",  dip: data.shift?.bitumenTank2ClosingDip,  testId: "text-bitumen-tank2-close-mt" },
                  ] as const).map(({ label, dip, testId }) => {
                    const totalVol = dip != null ? getVolumeAtDepth(dip) : null;
                    const usableVol = dip != null ? getUsableVolume(dip) : null;
                    const totalMt = totalVol != null ? totalVol * BITUMEN_DENSITY_KG_PER_LITER / 1000 : null;
                    const usableMt = usableVol != null ? usableVol * BITUMEN_DENSITY_KG_PER_LITER / 1000 : null;
                    const deadVol = totalVol != null && usableVol != null ? Math.round(totalVol - usableVol) : null;
                    return (
                      <div key={label}>
                        <div className="text-muted-foreground mb-0.5">{label}</div>
                        <div className="font-semibold" data-testid={testId}>{dip != null ? `${dip.toFixed(1)} cm` : "—"}</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                          {fmtMt(totalMt)} MT total · {totalVol != null ? `${Math.round(totalVol).toLocaleString()} L` : "—"}
                        </div>
                        <div className="text-sm text-green-700 dark:text-green-400">
                          {fmtMt(usableMt)} MT usable
                        </div>
                        {deadVol != null && (
                          <div className="text-sm text-amber-700 dark:text-amber-400">
                            {deadVol.toLocaleString()} L dead stock
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {bitConsumedMt != null && (
                  <div className="border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="md:col-span-4 text-sm font-medium text-muted-foreground">Consumed today (opening − closing dip)</div>
                    {bitT1Consumed != null && <KV label="Tank 1 Consumed MT" value={fmtMt(bitT1Consumed)} />}
                    {bitT2Consumed != null && <KV label="Tank 2 Consumed MT" value={fmtMt(bitT2Consumed)} />}
                    <KV label="Total Consumed MT" value={fmtMt(bitConsumedMt)} />
                  </div>
                )}
              </CardContent>
            </Card>
            )}
            {!data.shift?.noMainPlantOps && (
            <Card>
              <CardHeader>
                <CardTitle>
                  LDO Detail
                  {data.ldo.source && data.ldo.source !== "shift_meter" ? <Badge variant="secondary" className="ml-2">Source: {data.ldo.source}</Badge> : null}
                  {data.ldo.primarySourceT1 === "sessions" ? <Badge variant="default" className="ml-2" data-testid="badge-t1-source">Boiler Meter from Heating Sessions</Badge> : null}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Dip-stick cross-check and tank stock deduction.</p>
              </CardHeader>
              {(data.ldo.dipDeltaT1L != null || data.ldo.dipDeltaT2L != null) && (() => {
                const DIP_THRESHOLD_L = 200;
                const t1Var = (data.ldo.consumedT1L != null && data.ldo.dipDeltaT1L != null)
                  ? Math.round((data.ldo.consumedT1L - data.ldo.dipDeltaT1L) * 10) / 10
                  : null;
                const t2Var = (data.ldo.consumedT2L != null && data.ldo.dipDeltaT2L != null)
                  ? Math.round((data.ldo.consumedT2L - data.ldo.dipDeltaT2L) * 10) / 10
                  : null;
                const anyHighVar = (t1Var != null && Math.abs(t1Var) > DIP_THRESHOLD_L)
                  || (t2Var != null && Math.abs(t2Var) > DIP_THRESHOLD_L);
                return (
                  <CardContent className="border-t pt-4 pb-3" data-testid="section-ldo-dip-crosscheck">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-medium">Dip-stick cross-check</span>
                      <span className="text-sm text-muted-foreground">(shift log opening − closing, depth → volume)</span>
                      {anyHighVar && (
                        <span className="text-sm font-semibold text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Meter vs dip gap &gt; {DIP_THRESHOLD_L} L
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {data.ldo.dipDeltaT1L != null && (
                        <KV label="Boiler Dip Δ (L)" value={fmt(data.ldo.dipDeltaT1L, 1)} testId="text-ldo-dip-t1" />
                      )}
                      {t1Var != null && (
                        <div data-testid="text-ldo-dip-var-t1">
                          <div className="text-sm text-muted-foreground mb-0.5">Meter vs Dip T1</div>
                          <div className={`font-medium ${Math.abs(t1Var) > DIP_THRESHOLD_L ? "text-destructive" : "text-green-600"}`}>
                            {t1Var > 0 ? "+" : ""}{t1Var} L
                          </div>
                        </div>
                      )}
                      {data.ldo.dipDeltaT2L != null && (
                        <KV label="Dryer Dip Δ (L)" value={fmt(data.ldo.dipDeltaT2L, 1)} testId="text-ldo-dip-t2" />
                      )}
                      {t2Var != null && (
                        <div data-testid="text-ldo-dip-var-t2">
                          <div className="text-sm text-muted-foreground mb-0.5">Meter vs Dip T2</div>
                          <div className={`font-medium ${Math.abs(t2Var) > DIP_THRESHOLD_L ? "text-destructive" : "text-green-600"}`}>
                            {t2Var > 0 ? "+" : ""}{t2Var} L
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                );
              })()}
              {!data.ldo.dryerFedFrom && (
                <CardContent className="border-t pt-4 pb-3" data-testid="warning-dryer-fed-from-unset">
                  <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-semibold">Dryer routing not set.</span>{" "}
                      No feed tank has been selected for the dryer meter today — stock deduction calculations may be incorrect.{" "}
                      <Link
                        href={appendPlantContext(`/plant/shift-log/${date}`, { defaultTab: "reports" }) + "&focus=dryerFedFrom"}
                        className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200"
                        data-testid="link-fix-dryer-fed-from"
                      >
                        Fix in Shift Log
                      </Link>
                    </span>
                  </div>
                </CardContent>
              )}
              <CardContent className="border-t pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="md:col-span-4 text-sm text-muted-foreground">
                  Tank stock deducted today (dryer meter is routed to{" "}
                  <span className="font-medium" data-testid="text-dryer-fed-from-summary">
                    {data.ldo.dryerFedFrom === "TANK_1" ? "Boiler tank" : data.ldo.dryerFedFrom === "TANK_2" ? "Dryer tank" : "Not set"}
                  </span>
                  )
                </div>
                <KV label="Boiler tank stock used (L)" value={fmt(data.ldo.tank1DeductedL ?? null, 1)} />
                <KV label="Dryer tank stock used (L)" value={fmt(data.ldo.tank2DeductedL ?? null, 1)} />
              </CardContent>

              {/* Separator between LDO Detail and Heating Sessions */}
              {data.boilerHeating && (
                <>
                  <div className="border-t mx-0" />
                  <CardHeader className="pt-5">
                    <CardTitle>
                      Boiler / Heating Sessions ({data.boilerHeating.sessionCount})
                      {data.boilerHeating.reconciliation.anyMismatch && (
                        <Badge variant="destructive" className="ml-2" data-testid="badge-boiler-meter-mismatch">
                          ⚠ Boiler Meter mismatch ({data.boilerHeating.reconciliation.mismatches.length})
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground" data-testid="text-heating-attribution-range">
                      {data.boilerHeating.attributionFromDate
                        ? <>Sessions attributed: <span className="font-medium">after {data.boilerHeating.attributionFromDate}</span> through <span className="font-medium">{data.boilerHeating.attributionToDate}</span> (rolls overnight pre-heating into this production day).</>
                        : <>Sessions attributed: on or before <span className="font-medium">{data.boilerHeating.attributionToDate}</span> (no prior production day on record for this plant).</>
                      }
                    </p>
                    {data.boilerHeating.reconciliation.anyMismatch && (
                      <div
                        className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm space-y-1"
                        data-testid="panel-boiler-meter-reconciliation"
                      >
                        <div className="font-semibold text-destructive">
                          Boiler Meter (Tank-1) sources disagree by more than {data.boilerHeating.reconciliation.thresholdL}L
                        </div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {data.boilerHeating.reconciliation.mismatches.map(m => {
                            const sign = m.deltaL > 0 ? "+" : "";
                            const sessTodayL = data.boilerHeating!.sessionsLdoT1LToday;
                            const label =
                              m.kind === "sessions_vs_shift"
                                ? `Heating sessions (${fmt(sessTodayL, 1)}L) vs shift log meter (${fmt(data.boilerHeating!.shiftLogT1L, 1)}L)`
                                : m.kind === "sessions_vs_ledger"
                                ? `Heating sessions (${fmt(sessTodayL, 1)}L) vs LDO Flow ledger session rows (${fmt(data.boilerHeating!.ledgerSessionsT1L, 1)}L)`
                                : `Shift log meter (${fmt(data.boilerHeating!.shiftLogT1L, 1)}L) vs LDO Flow ledger shift rows (${fmt(data.boilerHeating!.ledgerShiftT1L, 1)}L)`;
                            return (
                              <li key={m.kind} data-testid={`text-mismatch-${m.kind}`}>
                                {label} — Δ {sign}{m.deltaL}L
                              </li>
                            );
                          })}
                        </ul>
                        <div className="text-muted-foreground pt-1">
                          Re-save the affected shift log or heating session to re-sync the LDO Flow Meter ledger.
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
                      <KV label="Total Heating Hrs" value={fmt(data.boilerHeating.totalHours, 2)} />
                      <KV label="Sessions LDO L" value={fmt(data.boilerHeating.sessionsLdoT1L, 1)} />
                      <KV
                        label={data.boilerHeating.boilerRunsDuringProduction ? "Boiler-during-production L" : "Boiler-during-production L (off)"}
                        value={data.boilerHeating.boilerRunsDuringProduction ? fmt(data.boilerHeating.boilerDuringProductionL, 1) : "—"}
                      />
                      <KV label="Total Boiler LDO L" value={fmt(data.boilerHeating.totalBoilerLdoL, 1)} />
                      <KV label="L / Hour" value={fmt(data.boilerHeating.lPerHour, 2)} />
                      <KV label="L / MT (Boiler)" value={fmt(data.boilerHeating.lPerMT, 3)} />
                      <KV label="DG Diesel L" value={fmt(data.boilerHeating.dgDieselL, 1)} />
                    </div>
                    {data.boilerHeating.sessions && data.boilerHeating.sessions.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead className="text-right">Hours</TableHead>
                            <TableHead>Staff</TableHead>
                            <TableHead className="text-right">Boiler Meter L</TableHead>
                            <TableHead className="text-right">DG Diesel L</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.boilerHeating.sessions.map(s => (
                            <TableRow key={s.id} data-testid={`row-heating-session-${s.id}`}>
                              <TableCell>
                                {s.date}
                                {s.date !== data.boilerHeating!.attributionToDate && (
                                  <Badge variant="outline" className="ml-1 text-[12px] border-amber-400 text-amber-700 dark:text-amber-400">prior</Badge>
                                )}
                              </TableCell>
                              <TableCell>{heatingSessionTypeLabel(s.sessionType)}</TableCell>
                              <TableCell>{s.startTime || "—"} → {s.endTime || "—"}</TableCell>
                              <TableCell className="text-right">{fmt(s.durationHours, 2)}</TableCell>
                              <TableCell>{s.staffName || "—"}</TableCell>
                              <TableCell className="text-right">{fmt(s.ldoTank1Consumed, 1)}</TableCell>
                              <TableCell className="text-right">{fmt(s.dgDieselConsumed, 1)}</TableCell>
                              <TableCell>{s.isFinalized ? <Badge className="bg-green-600">Finalized</Badge> : <Badge variant="outline">Draft</Badge>}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </>
              )}
            </Card>
            )}
            {data.receipts?.byMaterial?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Material Receipts ({data.receipts.totalLines} lines)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Material</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>UoM</TableHead><TableHead className="text-right">Lines</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.receipts.byMaterial.map((r, i) => (
                        <TableRow key={i} data-testid={`row-receipt-${i}`}>
                          <TableCell>{r.materialName}</TableCell>
                          <TableCell className="text-right font-semibold">{r.quantity.toFixed(2)}</TableCell>
                          <TableCell>{r.uom}</TableCell>
                          <TableCell className="text-right">{r.lines}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            {data.generators?.items?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Generator Logs (Total Diesel: {data.generators.totalDieselConsumedL?.toFixed(1)} L)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Generator</TableHead><TableHead className="text-right">Hrs</TableHead>
                      <TableHead className="text-right">Open</TableHead><TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Close</TableHead>
                      <TableHead className="text-right">Consumed L</TableHead>
                      <TableHead className="text-right">L/hr (Derived)</TableHead>
                      <TableHead className="text-right">L/hr (Recorded)</TableHead>
                      <TableHead className="text-right">Δ%</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.generators.items.map((g) => {
                        const variance = (g.lPerHr != null && g.efficiency != null && g.efficiency > 0)
                          ? Math.round(((g.lPerHr - g.efficiency) / g.efficiency) * 1000) / 10
                          : null;
                        return (
                        <TableRow key={g.id} data-testid={`row-generator-${g.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{g.generatorName}</span>
                              {g.sourceHeatingSessionId != null && (
                                <Badge variant="secondary" className="text-sm" data-testid={`badge-generator-session-${g.id}`}>
                                  🔥 Session #{g.sourceHeatingSessionId}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{fmt(g.hoursRun)}</TableCell>
                          <TableCell className="text-right">{fmt(g.opening)}</TableCell>
                          <TableCell className="text-right">{fmt(g.issued)}</TableCell>
                          <TableCell className="text-right">{fmt(g.closing)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(g.consumed)}</TableCell>
                          <TableCell className="text-right">{fmt(g.lPerHr)}</TableCell>
                          <TableCell className="text-right">{fmt(g.efficiency)}</TableCell>
                          <TableCell className={`text-right ${variance != null && Math.abs(variance) > 10 ? "text-red-600 font-semibold" : ""}`}>{variance != null ? `${variance > 0 ? "+" : ""}${variance}%` : "—"}</TableCell>
                        </TableRow>
                      );})}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Equipment Usage (Total Diesel Issued: {fmt(data.totalDieselIssued, 1)} L)</CardTitle></CardHeader>
              <CardContent>
                {data.equipment.length === 0 ? <p className="text-sm text-muted-foreground">No equipment logged.</p> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Equipment</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                        <TableHead className="text-right">Diesel Issued L</TableHead>
                        <TableHead className="text-right">Tank Balance (L)</TableHead>
                        <TableHead className="text-right">Actual Consumed (L)</TableHead>
                        <TableHead className="text-right">L/Hr</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.equipment.map((e, i) => (
                        <TableRow key={i} data-testid={`row-equipment-${i}`}>
                          <TableCell>{e.equipmentName || `#${e.equipmentId}`}</TableCell>
                          <TableCell>{e.operator || "—"}</TableCell>
                          <TableCell className="text-right">{fmt(e.hours)}</TableCell>
                          <TableCell className="text-right">{fmt(e.opening)}</TableCell>
                          <TableCell className="text-right">{fmt(e.issued)}</TableCell>
                          <TableCell className="text-right" data-testid={`text-tank-balance-${i}`}>{fmt(e.closing)}</TableCell>
                          <TableCell className="text-right" data-testid={`text-actual-consumed-${i}`}>{fmt(e.consumed)}</TableCell>
                          <TableCell className="text-right" data-testid={`text-l-per-hr-${i}`}>{fmt(e.lPerHr)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            {data.manpowerByContractor?.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Manpower by Contractor / Category</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Contractor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead className="text-right">Head Count</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.manpowerByContractor.map((g, i) => (
                        <TableRow key={i} data-testid={`row-manpower-group-${i}`}>
                          <TableCell>{g.contractor}</TableCell>
                          <TableCell><Badge variant="outline">{g.category}</Badge></TableCell>
                          <TableCell>{g.gender}</TableCell>
                          <TableCell className="text-right font-semibold" data-testid={`text-manpower-count-${i}`}>{g.count}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                        <TableCell className="text-right font-semibold" data-testid="text-manpower-total">
                          {data.manpowerByContractor.reduce((s, g) => s + g.count, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Manpower ({data.manpower.length})</CardTitle></CardHeader>
              <CardContent>
                {data.manpower.length === 0 ? <p className="text-sm text-muted-foreground">No manpower entries.</p> : (
                  <ul className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                    {data.manpower.map((m, i) => (
                      <li key={i} className="px-3 py-1.5 rounded bg-muted" data-testid={`item-manpower-${i}`}>
                        {m.name}{m.role ? <span className="text-muted-foreground"> — {m.role}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Idle Events ({data.idle.totalMinutes} min)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.idle.events.length === 0 ? <p className="text-sm text-muted-foreground">No idle events.</p> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Reason</TableHead><TableHead>Remarks</TableHead><TableHead className="text-right">Min</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.idle.events.map((ev, i) => (
                        <TableRow key={i} data-testid={`row-idle-${i}`}>
                          <TableCell>{ev.startTime}</TableCell>
                          <TableCell>{ev.endTime || "—"}</TableCell>
                          <TableCell><Badge variant="outline">{ev.reason}</Badge></TableCell>
                          <TableCell>{ev.remarks || "—"}</TableCell>
                          <TableCell className="text-right">{ev.minutes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {Object.keys(data.idle.byReason).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {Object.entries(data.idle.byReason).map(([reason, mins]) => (
                      <Badge key={reason} variant="secondary" data-testid={`badge-idle-${reason}`}>{reason}: {String(mins)} min</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {data.shift?.remarks && (
              <Card>
                <CardHeader><CardTitle>Remarks</CardTitle></CardHeader>
                <CardContent><p className="text-sm whitespace-pre-wrap">{data.shift.remarks}</p></CardContent>
              </Card>
            )}
          </>
        );
      })()}

      <DryerSourceFixDialog
        open={fixDialog.open}
        onOpenChange={(v) => setFixDialog(f => ({ ...f, open: v }))}
        target={fixDialog.target}
      />
    </div>
  );
}

function KV({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold" data-testid={testId}>{value ?? "—"}</div>
    </div>
  );
}
