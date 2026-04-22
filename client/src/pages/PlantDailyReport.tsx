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

export default function PlantDailyReport() {
  const { appendOrigin } = useOrigin();
  const [, params] = useRoute("/plant/daily-report/:date");
  const [date, setDate] = useState(params?.date || format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/plant-module/daily-reports", date],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/daily-reports/${date}`, { credentials: "include" });
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
          <Link href={appendOrigin(`/plant/shift-log/${date}`)}>
            <Button variant="outline" size="sm" data-testid="button-edit-shift-log"><Edit className="w-4 h-4 mr-1" />Shift Log</Button>
          </Link>
          <a href={`/api/plant-module/daily-reports/${date}/pdf`} target="_blank" rel="noreferrer">
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
              <div><div className="text-muted-foreground">Weather</div><div className="font-medium">{data.shift?.weather || "—"}</div></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Production</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <KV label="Loads" value={data.production.totalLoads} testId="text-loads" />
              <KV label="Total MT" value={fmt(data.production.totalProductionMT)} testId="text-mt" />
              <KV label="Theoretical Bitumen MT" value={fmt(data.production.theoreticalBitumenMT, 3)} />
              <KV label="Actual Bitumen MT" value={fmt(data.production.actualBitumenMT, 3)} />
              <KV label="Bitumen Variance MT" value={fmt(data.production.bitumenVarianceMT, 3)} />
              <KV label="Theoretical LDO L" value={fmt(data.production.theoreticalLdoL, 1)} />
              <KV label="Actual LDO via dispatches L" value={fmt(data.production.actualLdoL, 1)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>LDO Consumption (Shift Meters)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <KV label="Tank 1 Boiler L" value={fmt(data.ldo.consumedT1L, 1)} />
              <KV label="Tank 2 Dryer L" value={fmt(data.ldo.consumedT2L, 1)} />
              <KV label="Total L" value={fmt(data.ldo.consumedTotalL, 1)} />
              <KV label="L / Hour" value={fmt(data.ldo.lPerHour, 2)} />
              <KV label="L / MT Mix" value={fmt(data.ldo.lPerMT, 3)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Equipment Usage</CardTitle></CardHeader>
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
                    {data.equipment.map((e: any, i: number) => (
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
                  {data.manpower.map((m: any, i: number) => (
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
                    {data.idle.events.map((ev: any, i: number) => (
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

function KV({ label, value, testId }: { label: string; value: any; testId?: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold" data-testid={testId}>{value ?? "—"}</div>
    </div>
  );
}
