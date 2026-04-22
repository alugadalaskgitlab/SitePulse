import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, Download, Edit, Loader2 } from "lucide-react";
import { format } from "date-fns";
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
  ldo: { consumedT1L: number | null; consumedT2L: number | null; consumedTotalL: number | null; lPerHour: number | null; lPerMT: number | null; source: string };
  bitumenDips: unknown[];
  ldoFlows: unknown[];
  ldoDips: unknown[];
  equipment: Array<{ equipmentId: number; equipmentName: string | null; hours: number; dieselIssued: number; dieselConsumed: number | null; lPerHr: number | null }>;
  totalDieselIssued: number;
  generators: { items: Array<{ id: number; generatorName: string; hoursRun: number | null; opening: number | null; issued: number; closing: number | null; consumed: number | null; lPerHr: number | null; derivedSource: string; efficiency: number | null }>; totalDieselConsumedL: number };
  manpower: Array<{ name: string; role: string | null }>;
  idle: { events: Array<{ startTime: string; endTime: string | null; reason: string; remarks: string | null; minutes: number }>; byReason: Record<string, number>; totalMinutes: number };
};

export default function PlantDailyReport() {
  const { appendOrigin } = useOrigin();
  const [, params] = useRoute("/plant/daily-report/:date");
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
          <Link href={appendOrigin("/plant/dashboard")}>
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
          <Link href={appendOrigin(`/plant/shift-log/${date}`)}>
            <Button variant="outline" size="sm" data-testid="button-edit-shift-log"><Edit className="w-4 h-4 mr-1" />Shift Log</Button>
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
                        <TableCell>{g.generatorName}</TableCell>
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
            <CardHeader><CardTitle>LDO Consumption {data.ldo.source && data.ldo.source !== "shift_meter" ? <Badge variant="secondary" className="ml-2">Source: {data.ldo.source}</Badge> : null}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <KV label="Tank 1 Boiler L" value={fmt(data.ldo.consumedT1L, 1)} />
              <KV label="Tank 2 Dryer L" value={fmt(data.ldo.consumedT2L, 1)} />
              <KV label="Total L" value={fmt(data.ldo.consumedTotalL, 1)} />
              <KV label="L / Hour" value={fmt(data.ldo.lPerHour, 2)} />
              <KV label="L / MT Mix" value={fmt(data.ldo.lPerMT, 3)} />
            </CardContent>
          </Card>

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
                      <TableHead className="text-right">Close</TableHead>
                      <TableHead className="text-right">Diesel Issued L</TableHead>
                      <TableHead className="text-right">Consumed L</TableHead>
                      <TableHead className="text-right">L/hr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.equipment.map((e, i) => (
                      <TableRow key={i} data-testid={`row-equipment-${i}`}>
                        <TableCell>{e.equipmentName || `#${e.equipmentId}`}</TableCell>
                        <TableCell>{e.operator || "—"}</TableCell>
                        <TableCell className="text-right">{fmt(e.hours)}</TableCell>
                        <TableCell className="text-right">{fmt(e.opening)}</TableCell>
                        <TableCell className="text-right">{fmt(e.closing)}</TableCell>
                        <TableCell className="text-right">{fmt(e.issued)}</TableCell>
                        <TableCell className="text-right">{fmt(e.consumed)}</TableCell>
                        <TableCell className="text-right">{fmt(e.lPerHr)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

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
