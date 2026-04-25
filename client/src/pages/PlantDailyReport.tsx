import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, Edit, Loader2, History } from "lucide-react";
import { format } from "date-fns";
import { heatingSessionTypeLabel } from "@shared/schema";
import type { PlantShiftLogWithDetails } from "@shared/schema";

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
  ldo: { consumedT1L: number | null; consumedT2L: number | null; consumedTotalL: number | null; lPerHour: number | null; lPerMT: number | null; dryerLPerMT: number | null; boilerLPerMT: number | null; source: string; primarySourceT1?: "sessions" | "shift_meter" | "dip_fallback"; reconciliationT1ShiftL?: number | null; dryerFedFrom?: "TANK_1" | "TANK_2"; tank1DeductedL?: number | null; tank2DeductedL?: number | null };
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

export default function PlantDailyReport() {
  const { appendOrigin, getPlantBackLink, appendPlantContext } = useOrigin();
  const [, params] = useRoute("/plant/daily-report/:date");
  const backHref = getPlantBackLink({ defaultTab: "reports" });
  const [date, setDate] = useState(params?.date || format(new Date(), "yyyy-MM-dd"));
  const [plantName, setPlantName] = useState("Main Plant");
  const [showAllDispatches, setShowAllDispatches] = useState(false);

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
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" data-testid="input-date" />
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

      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {!isLoading && data && (
        <>
          <Card>
            <CardHeader><CardTitle>Shift Header</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><div className="text-muted-foreground">Shift</div><div className="font-medium">{data.shift?.shiftCode || "—"}</div></div>
              <div><div className="text-muted-foreground">Operator</div><div className="font-medium">{data.shift?.operatorName || "—"}</div></div>
              <div><div className="text-muted-foreground">Supervisor</div><div className="font-medium">{data.shift?.supervisorName || "—"}</div></div>
              <div><div className="text-muted-foreground">Status</div>
                {data.shift?.isFinalized ? <Badge className="bg-green-600">Finalized</Badge> : data.shift ? <Badge variant="secondary">Draft</Badge> : <Badge variant="outline">No log</Badge>}
              </div>
              <div><div className="text-muted-foreground">Plant Start</div><div className="font-medium">{data.shift?.plantStartTime || "—"}</div></div>
              <div><div className="text-muted-foreground">Plant Stop</div><div className="font-medium">{data.shift?.plantStopTime || "—"}</div></div>
              <div><div className="text-muted-foreground">Running Hrs</div><div className="font-medium" data-testid="text-running-hours">{fmt(data.runningHours)}</div></div>
              <div><div className="text-muted-foreground">Productive Hrs</div><div className="font-medium" data-testid="text-productive-hours">{fmt(data.productiveHours)}</div></div>
              <div><div className="text-muted-foreground">Weather</div><div className="font-medium">{data.shift?.weather || "—"}</div></div>
              <div><div className="text-muted-foreground">Ambient Temp °C</div><div className="font-medium">{fmt(data.shift?.ambientTemp, 1)}</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Bitumen Tank Status (from Shift Log)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><div className="text-muted-foreground">Tank-1 Temp °C</div><div className="font-medium" data-testid="text-bitumen-tank1-temp">{fmt(data.shift?.bitumenTank1Temp, 1)}</div></div>
              <div><div className="text-muted-foreground">Tank-2 Temp °C</div><div className="font-medium" data-testid="text-bitumen-tank2-temp">{fmt(data.shift?.bitumenTank2Temp, 1)}</div></div>
              <div><div className="text-muted-foreground">Tank-1 Approx Stock MT</div><div className="font-medium" data-testid="text-bitumen-tank1-stock">{fmt(data.shift?.bitumenTank1StockApproxMt, 2)}</div></div>
              <div><div className="text-muted-foreground">Tank-2 Approx Stock MT</div><div className="font-medium" data-testid="text-bitumen-tank2-stock">{fmt(data.shift?.bitumenTank2StockApproxMt, 2)}</div></div>
              <div><div className="text-muted-foreground">Tank-1 Opening Dip cm</div><div className="font-medium">{fmt(data.shift?.bitumenTank1OpeningDip, 1)}</div></div>
              <div><div className="text-muted-foreground">Tank-1 Closing Dip cm</div><div className="font-medium">{fmt(data.shift?.bitumenTank1ClosingDip, 1)}</div></div>
              <div><div className="text-muted-foreground">Tank-2 Opening Dip cm</div><div className="font-medium">{fmt(data.shift?.bitumenTank2OpeningDip, 1)}</div></div>
              <div><div className="text-muted-foreground">Tank-2 Closing Dip cm</div><div className="font-medium">{fmt(data.shift?.bitumenTank2ClosingDip, 1)}</div></div>
            </CardContent>
          </Card>

          {data.production.byMix?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Production by Mix</CardTitle></CardHeader>
              <CardContent>
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
            </Card>
          )}

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
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-generator-session-${g.id}`}>
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
            <CardHeader><CardTitle>Production</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <KV label="Loads" value={data.production.totalLoads} testId="text-loads" />
              <KV label="Total MT" value={fmt(data.production.totalProductionMT)} testId="text-mt" />
              <KV label="Theoretical Bitumen MT" value={fmt(data.production.theoreticalBitumenMT, 3)} />
              <KV label="Theoretical LDO L" value={fmt(data.production.theoreticalLdoL, 1)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                LDO Consumption
                {data.ldo.source && data.ldo.source !== "shift_meter" ? <Badge variant="secondary" className="ml-2">Source: {data.ldo.source}</Badge> : null}
                {data.ldo.primarySourceT1 === "sessions" ? <Badge variant="default" className="ml-2" data-testid="badge-t1-source">Boiler Meter from Heating Sessions</Badge> : null}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Both meters draw from the main LDO tank.</p>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
              <KV label={`Boiler Meter L${data.ldo.primarySourceT1 === "sessions" ? " (sessions)" : ""}`} value={fmt(data.ldo.consumedT1L, 1)} />
              <KV label="Dryer Meter L" value={fmt(data.ldo.consumedT2L, 1)} />
              <KV label="Total L" value={fmt(data.ldo.consumedTotalL, 1)} />
              <KV label="L / Hour (combined)" value={fmt(data.ldo.lPerHour, 2)} />
              <KV label="Dryer L / MT" value={fmt(data.ldo.dryerLPerMT, 3)} />
              <KV label="Boiler L / MT" value={fmt(data.ldo.boilerLPerMT, 3)} />
              {data.ldo.primarySourceT1 === "sessions" && data.ldo.reconciliationT1ShiftL != null && (
                <KV label="Boiler Meter Shift (recon)" value={fmt(data.ldo.reconciliationT1ShiftL, 1)} />
              )}
            </CardContent>
            <CardContent className="border-t pt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="md:col-span-4 text-xs text-muted-foreground">
                Tank stock deducted today (dryer meter is routed to{" "}
                <span className="font-medium" data-testid="text-dryer-fed-from-summary">
                  {data.ldo.dryerFedFrom === "TANK_1" ? "Tank 1" : "Tank 2"}
                </span>
                )
              </div>
              <KV label="Tank 1 stock used (L)" value={fmt(data.ldo.tank1DeductedL ?? null, 1)} />
              <KV label="Tank 2 stock used (L)" value={fmt(data.ldo.tank2DeductedL ?? null, 1)} />
            </CardContent>
          </Card>

          {data.boilerHeating && (
            <Card>
              <CardHeader>
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
                {/* Task #254 — surface attribution range so the user can see
                    why pre-heating from earlier dates is rolled into today. */}
                <p className="text-xs text-muted-foreground" data-testid="text-heating-attribution-range">
                  {data.boilerHeating.attributionFromDate
                    ? <>Sessions attributed: <span className="font-medium">after {data.boilerHeating.attributionFromDate}</span> through <span className="font-medium">{data.boilerHeating.attributionToDate}</span> (rolls overnight pre-heating into this production day).</>
                    : <>Sessions attributed: on or before <span className="font-medium">{data.boilerHeating.attributionToDate}</span> (no prior production day on record for this plant).</>
                  }
                </p>
                {/* Task #219 — Three-way Boiler Meter reconciliation panel.
                    Surfaces every disagreement (sessions vs shift, sessions vs
                    ledger, shift vs ledger) beyond the 5L tolerance so the
                    operator knows which source needs correction. */}
                {data.boilerHeating.reconciliation.anyMismatch && (
                  <div
                    className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs space-y-1"
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
                              <Badge variant="outline" className="ml-1 text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">prior</Badge>
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
      )}
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
