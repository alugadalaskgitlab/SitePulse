import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Download, Flame, Loader2, ArrowRight } from "lucide-react";
import { format, subDays } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from "recharts";

type Bucket = {
  count: number; hours: number; ldoT1L: number; dgDieselL: number;
  lPerHour: number | null; lPerMT: number | null;
};
type Row = {
  date: string;
  productionMT: number;
  night: Bucket;
  day: Bucket;
  total: Bucket;
};
type TrendsResponse = {
  dateFrom: string;
  dateTo: string;
  plantName: string;
  targetLPerMT: number;
  rows: Row[];
  summary: {
    days: number;
    sessionCount: number;
    totalHours: number;
    totalLdoT1L: number;
    dgDieselL: number;
    totalProductionMT: number;
    lPerHour: number | null;
    lPerMT: number | null;
  };
};

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || isNaN(n as number)) return "—";
  return Number(n).toFixed(digits);
}

export default function PlantHeatingTrends() {
  const { appendOrigin, getPlantBackLink, appendPlantContext } = useOrigin();
  const today = format(new Date(), "yyyy-MM-dd");
  const defaultFrom = format(subDays(new Date(), 29), "yyyy-MM-dd");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [plant] = useState("Main Plant");

  const queryKey = ["/api/plant-module/heating-trends", dateFrom, dateTo, plant] as const;
  const { data, isLoading } = useQuery<TrendsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/plant-module/heating-trends?dateFrom=${dateFrom}&dateTo=${dateTo}&plant=${encodeURIComponent(plant)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const chartRows = useMemo(() => {
    if (!data) return [];
    return data.rows.map(r => ({
      date: r.date.slice(5),
      fullDate: r.date,
      lPerMT: r.total.lPerMT,
      nightLPerMT: r.night.lPerMT,
      dayLPerMT: r.day.lPerMT,
      productionMT: r.productionMT,
    }));
  }, [data]);

  const exportExcel = () => {
    window.open(
      `/api/plant-module/heating-trends/excel?dateFrom=${dateFrom}&dateTo=${dateTo}&plant=${encodeURIComponent(plant)}`,
      "_blank"
    );
  };

  const setRange = (days: number) => {
    setDateTo(today);
    setDateFrom(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
  };

  const target = data?.targetLPerMT ?? 1.5;
  const backLink = getPlantBackLink({ defaultTab: "reports" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-600" />
              Boiler Heating Efficiency Trends
            </h1>
            <p className="text-sm text-muted-foreground">
              Daily L/Hour and L/MT for the Boiler Meter, split by night pre-heat vs daytime maintenance
            </p>
          </div>
        </div>
        <Button onClick={exportExcel} variant="outline" data-testid="button-export-excel">
          <Download className="w-4 h-4 mr-2" />Export Excel
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-40" data-testid="input-date-from" />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-40" data-testid="input-date-to" />
          </div>
          <div className="flex items-center gap-2 ml-2">
            <Button variant="secondary" size="sm" onClick={() => setRange(7)} data-testid="button-range-7">Last 7 days</Button>
            <Button variant="secondary" size="sm" onClick={() => setRange(30)} data-testid="button-range-30">Last 30 days</Button>
            <Button variant="secondary" size="sm" onClick={() => setRange(90)} data-testid="button-range-90">Last 90 days</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Sessions</div>
              <div className="text-2xl font-bold" data-testid="kpi-sessions">{data.summary.sessionCount}</div>
              <div className="text-xs text-muted-foreground">{data.summary.days} days</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Heating Hours</div>
              <div className="text-2xl font-bold" data-testid="kpi-hours">{fmt(data.summary.totalHours, 1)}</div>
              <div className="text-xs text-muted-foreground">L/Hour: {fmt(data.summary.lPerHour)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">LDO Boiler Meter</div>
              <div className="text-2xl font-bold" data-testid="kpi-ldo">{fmt(data.summary.totalLdoT1L, 1)} L</div>
              <div className="text-xs text-muted-foreground">DG Diesel: {fmt(data.summary.dgDieselL, 1)} L</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">L / MT (vs target {target})</div>
              <div className={`text-2xl font-bold ${data.summary.lPerMT != null && data.summary.lPerMT > target ? "text-red-600" : "text-green-700"}`} data-testid="kpi-lpermt">
                {fmt(data.summary.lPerMT, 3)}
              </div>
              <div className="text-xs text-muted-foreground">Production: {fmt(data.summary.totalProductionMT, 1)} MT</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>L/MT Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="w-full h-80" data-testid="chart-lpermt">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                      formatter={(value: any) => value == null ? "—" : Number(value).toFixed(3)}
                    />
                    <Legend />
                    <ReferenceLine y={target} stroke="#dc2626" strokeDasharray="4 4" label={{ value: `Target ${target}`, fill: "#dc2626", fontSize: 11 }} />
                    <Line type="monotone" dataKey="lPerMT" name="Total L/MT" stroke="#ea580c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="nightLPerMT" name="Night Pre-heat" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                    <Line type="monotone" dataKey="dayLPerMT" name="Day Maintenance" stroke="#0891b2" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Daily Breakdown</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3 text-right">Prod (MT)</th>
                    <th className="py-2 pr-3 text-right">Night Hrs</th>
                    <th className="py-2 pr-3 text-right">Night LDO L</th>
                    <th className="py-2 pr-3 text-right">Day Hrs</th>
                    <th className="py-2 pr-3 text-right">Day LDO L</th>
                    <th className="py-2 pr-3 text-right">Total Hrs</th>
                    <th className="py-2 pr-3 text-right">Total LDO L</th>
                    <th className="py-2 pr-3 text-right">L/Hour</th>
                    <th className="py-2 pr-3 text-right">L/MT</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={11} className="py-4 text-center text-muted-foreground">No data in range.</td></tr>
                  )}
                  {data.rows.map(r => {
                    const overTarget = r.total.lPerMT != null && r.total.lPerMT > target;
                    return (
                      <tr key={r.date} className="border-b hover:bg-muted/30" data-testid={`row-trend-${r.date}`}>
                        <td className="py-2 pr-3 font-medium">{r.date}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.productionMT, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.night.hours, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.night.ldoT1L, 1)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.day.hours, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.day.ldoT1L, 1)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.total.hours, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.total.ldoT1L, 1)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.total.lPerHour, 2)}</td>
                        <td className="py-2 pr-3 text-right">
                          {r.total.lPerMT == null
                            ? <span className="text-muted-foreground">—</span>
                            : <Badge variant={overTarget ? "destructive" : "secondary"}>{fmt(r.total.lPerMT, 3)}</Badge>}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Link href={appendPlantContext(`/plant/heating-sessions/${r.date}`, { defaultTab: "reports" })}>
                            <Button variant="ghost" size="sm" data-testid={`link-day-${r.date}`}>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
