import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, ChevronLeft, Download, Flame, Loader2, ArrowRight, Thermometer, GitCompare } from "lucide-react";
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
  hotOilEndAvgC: number | null;
  hotOilEndMinC: number | null;
  hotOilEndMaxC: number | null;
  hotOilEndSampleCount: number;
  hotOilEndBelowThreshold: boolean;
  hotOilSupplyAvgC: number | null;
  hotOilReturnAvgC: number | null;
  hotOilDeltaAvgC: number | null;
  hotOilDeltaSampleCount: number;
  hotOilDeltaBelowThreshold: boolean;
  shiftMeterT1L: number | null;
  shiftMeterLPerMT: number | null;
  mismatchL: number | null;
  mismatchFlag: boolean;
};
type TrendsResponse = {
  dateFrom: string;
  dateTo: string;
  plantName: string;
  targetLPerMT: number;
  hotOilEndTempMinC: number;
  hotOilDeltaMinC: number;
  mismatchThresholdL: number;
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
    hotOilEndAvgC: number | null;
    hotOilEndMinC: number | null;
    hotOilEndMaxC: number | null;
    hotOilFlaggedDays: number;
    hotOilSupplyAvgC: number | null;
    hotOilReturnAvgC: number | null;
    hotOilDeltaAvgC: number | null;
    hotOilDeltaMinObservedC: number | null;
    hotOilDeltaFlaggedDays: number;
    totalShiftMeterT1L: number;
    shiftMeterLPerMT: number | null;
    mismatchDays: number;
    daysWithShiftMeter: number;
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
  const [useShiftMeter, setUseShiftMeter] = useState(false);

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
      shiftLPerMT: r.shiftMeterLPerMT,
      nightLPerMT: r.night.lPerMT,
      dayLPerMT: r.day.lPerMT,
      productionMT: r.productionMT,
      hotOilEndAvgC: r.hotOilEndAvgC,
      hotOilEndMinC: r.hotOilEndMinC,
      hotOilEndMaxC: r.hotOilEndMaxC,
      hotOilSupplyAvgC: r.hotOilSupplyAvgC,
      hotOilReturnAvgC: r.hotOilReturnAvgC,
      hotOilDeltaAvgC: r.hotOilDeltaAvgC,
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
  const hotOilThreshold = data?.hotOilEndTempMinC ?? 240;
  const hotOilDeltaFloor = data?.hotOilDeltaMinC ?? 15;
  const mismatchThreshold = data?.mismatchThresholdL ?? 5;
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Thermometer className="w-3 h-3" />Hot-oil End (avg)
              </div>
              <div
                className={`text-2xl font-bold ${data.summary.hotOilEndAvgC != null && data.summary.hotOilEndAvgC < hotOilThreshold ? "text-red-600" : ""}`}
                data-testid="kpi-hotoil-avg"
              >
                {fmt(data.summary.hotOilEndAvgC, 1)} {data.summary.hotOilEndAvgC != null && "°C"}
              </div>
              <div className="text-xs text-muted-foreground" data-testid="kpi-hotoil-flagged">
                {data.summary.hotOilFlaggedDays > 0
                  ? <span className="text-red-600 font-medium">{data.summary.hotOilFlaggedDays} day{data.summary.hotOilFlaggedDays === 1 ? "" : "s"} &lt; {hotOilThreshold}°C</span>
                  : <span>Min/Max: {fmt(data.summary.hotOilEndMinC, 0)} / {fmt(data.summary.hotOilEndMaxC, 0)}°C</span>}
              </div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <GitCompare className="w-3 h-3" />Shift-meter L
              </div>
              <div className="text-2xl font-bold" data-testid="kpi-shift-meter">
                {fmt(data.summary.totalShiftMeterT1L, 1)} L
              </div>
              <div className="text-xs text-muted-foreground" data-testid="kpi-mismatch-days">
                {data.summary.mismatchDays > 0
                  ? <span className="text-red-600 font-medium">{data.summary.mismatchDays} mismatch day{data.summary.mismatchDays === 1 ? "" : "s"} (&gt;±{mismatchThreshold} L)</span>
                  : <span>{data.summary.daysWithShiftMeter} day{data.summary.daysWithShiftMeter === 1 ? "" : "s"} logged</span>}
              </div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <CardTitle>L/MT Trend</CardTitle>
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    id="toggle-shift-meter"
                    checked={useShiftMeter}
                    onCheckedChange={setUseShiftMeter}
                    data-testid="toggle-shift-meter"
                  />
                  <Label htmlFor="toggle-shift-meter" className="cursor-pointer">
                    Use shift-meter L
                  </Label>
                </div>
              </div>
            </CardHeader>
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
                    {useShiftMeter ? (
                      <Line type="monotone" dataKey="shiftLPerMT" name="Shift-meter L/MT" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ) : (
                      <Line type="monotone" dataKey="lPerMT" name="Sessions L/MT" stroke="#ea580c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    )}
                    <Line type="monotone" dataKey="nightLPerMT" name="Pre-heating" stroke="#6366f1" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                    <Line type="monotone" dataKey="dayLPerMT" name="Production heating" stroke="#0891b2" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Sessions L/MT comes from heating-session LDO Tank-1 totals. Shift-meter L/MT uses the daily shift-log Tank-1 closing − opening reading. Days with a mismatch &gt; ±{mismatchThreshold} L are flagged in the table below.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-amber-600" />
                Hot-oil End Temperature (°C)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-64" data-testid="chart-hotoil">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                      formatter={(value: any) => value == null ? "—" : `${Number(value).toFixed(1)} °C`}
                    />
                    <Legend />
                    <ReferenceLine y={hotOilThreshold} stroke="#dc2626" strokeDasharray="4 4" label={{ value: `Floor ${hotOilThreshold}°C`, fill: "#dc2626", fontSize: 11 }} />
                    <Line type="monotone" dataKey="hotOilEndAvgC" name="Avg End Temp" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="hotOilEndMinC" name="Min" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls />
                    <Line type="monotone" dataKey="hotOilEndMaxC" name="Max" stroke="#10b981" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Days where the daily average hot-oil end temperature drops below {hotOilThreshold}°C are flagged in the table below. Adjust the floor in Admin → Plant Alert Thresholds.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-rose-600" />
                Hot-oil Supply vs Return (Δ)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm mb-3">
                <div data-testid="kpi-hotoil-supply">
                  <div className="text-xs text-muted-foreground">Supply Avg</div>
                  <div className="text-lg font-semibold">
                    {fmt(data.summary.hotOilSupplyAvgC, 1)}{data.summary.hotOilSupplyAvgC != null && " °C"}
                  </div>
                </div>
                <div data-testid="kpi-hotoil-return">
                  <div className="text-xs text-muted-foreground">Return Avg</div>
                  <div className="text-lg font-semibold">
                    {fmt(data.summary.hotOilReturnAvgC, 1)}{data.summary.hotOilReturnAvgC != null && " °C"}
                  </div>
                </div>
                <div data-testid="kpi-hotoil-delta">
                  <div className="text-xs text-muted-foreground">Δ Avg (Supply − Return)</div>
                  <div
                    className={`text-lg font-semibold ${
                      data.summary.hotOilDeltaAvgC != null && data.summary.hotOilDeltaAvgC < hotOilDeltaFloor
                        ? "text-red-600"
                        : ""
                    }`}
                  >
                    {fmt(data.summary.hotOilDeltaAvgC, 1)}{data.summary.hotOilDeltaAvgC != null && " °C"}
                  </div>
                  <div className="text-xs text-muted-foreground" data-testid="kpi-hotoil-delta-flagged">
                    {data.summary.hotOilDeltaFlaggedDays > 0
                      ? <span className="text-red-600 font-medium">{data.summary.hotOilDeltaFlaggedDays} day{data.summary.hotOilDeltaFlaggedDays === 1 ? "" : "s"} &lt; {hotOilDeltaFloor}°C floor</span>
                      : <span>Lowest day avg: {fmt(data.summary.hotOilDeltaMinObservedC, 1)} °C</span>}
                  </div>
                </div>
              </div>
              <div className="w-full h-64" data-testid="chart-hotoil-delta">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis yAxisId="temp" stroke="hsl(var(--muted-foreground))" fontSize={11} domain={["auto", "auto"]} />
                    <YAxis yAxisId="delta" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} domain={[0, "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6 }}
                      formatter={(value: any) => value == null ? "—" : `${Number(value).toFixed(1)} °C`}
                    />
                    <Legend />
                    <ReferenceLine
                      yAxisId="delta"
                      y={hotOilDeltaFloor}
                      stroke="#dc2626"
                      strokeDasharray="4 4"
                      label={{ value: `Δ floor ${hotOilDeltaFloor}°C`, fill: "#dc2626", fontSize: 11 }}
                    />
                    <Line yAxisId="temp" type="monotone" dataKey="hotOilSupplyAvgC" name="Supply" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line yAxisId="temp" type="monotone" dataKey="hotOilReturnAvgC" name="Return" stroke="#0891b2" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line yAxisId="delta" type="monotone" dataKey="hotOilDeltaAvgC" name="Δ (Supply − Return)" stroke="#9333ea" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Δ is the daily average of supply minus return temperature on each heating session. A shrinking Δ over time is an early sign of heat-exchanger fouling. Days whose average Δ drops below {hotOilDeltaFloor}°C are flagged. Adjust the floor in Admin → Plant Alert Thresholds.
              </p>
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
                    <th className="py-2 pr-3 text-right">Sessions L</th>
                    <th className="py-2 pr-3 text-right">Shift-meter L</th>
                    <th className="py-2 pr-3 text-right">Δ (L)</th>
                    <th className="py-2 pr-3 text-right">L/Hour</th>
                    <th className="py-2 pr-3 text-right">L/MT</th>
                    <th className="py-2 pr-3 text-right">Hot-oil End °C (avg)</th>
                    <th className="py-2 pr-3 text-right">Min / Max</th>
                    <th className="py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={15} className="py-4 text-center text-muted-foreground">No data in range.</td></tr>
                  )}
                  {data.rows.map(r => {
                    const activeLPerMT = useShiftMeter ? r.shiftMeterLPerMT : r.total.lPerMT;
                    const overTarget = activeLPerMT != null && activeLPerMT > target;
                    const hotOilFlagged = r.hotOilEndBelowThreshold;
                    return (
                      <tr
                        key={r.date}
                        className={`border-b hover:bg-muted/30 ${hotOilFlagged ? "bg-red-50 dark:bg-red-950/30" : ""}`}
                        data-testid={`row-trend-${r.date}`}
                      >
                        <td className="py-2 pr-3 font-medium">{r.date}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.productionMT, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.night.hours, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.night.ldoT1L, 1)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.day.hours, 2)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.day.ldoT1L, 1)}</td>
                        <td className="py-2 pr-3 text-right">{fmt(r.total.hours, 2)}</td>
                        <td className="py-2 pr-3 text-right" data-testid={`cell-sessions-l-${r.date}`}>{fmt(r.total.ldoT1L, 1)}</td>
                        <td className="py-2 pr-3 text-right" data-testid={`cell-shift-meter-l-${r.date}`}>
                          {r.shiftMeterT1L == null
                            ? <span className="text-muted-foreground">—</span>
                            : fmt(r.shiftMeterT1L, 1)}
                        </td>
                        <td className="py-2 pr-3 text-right" data-testid={`cell-mismatch-${r.date}`}>
                          {r.mismatchL == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : r.mismatchFlag ? (
                            <Link
                              href={appendPlantContext(
                                `/plant/heating-mismatch/${r.date}?plant=${encodeURIComponent(plant)}`,
                                { defaultTab: "reports" },
                              )}
                              data-testid={`link-mismatch-${r.date}`}
                            >
                              <Badge
                                variant="destructive"
                                className="gap-1 cursor-pointer hover-elevate"
                                title={r.total.count === 0
                                  ? `No heating sessions logged but shift-meter shows ${(r.shiftMeterT1L ?? 0).toFixed(1)} L (Δ ${r.mismatchL.toFixed(1)} L > ±${mismatchThreshold} L) — click to drill into this date`
                                  : `Sessions ${r.total.ldoT1L.toFixed(1)} L vs shift-meter ${(r.shiftMeterT1L ?? 0).toFixed(1)} L (Δ ${r.mismatchL > 0 ? "+" : ""}${r.mismatchL.toFixed(1)} L > ±${mismatchThreshold} L) — click to drill into this date`}
                                data-testid={`badge-mismatch-${r.date}`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {r.mismatchL > 0 ? "+" : ""}{fmt(r.mismatchL, 1)}
                              </Badge>
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{r.mismatchL > 0 ? "+" : ""}{fmt(r.mismatchL, 1)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">{fmt(r.total.lPerHour, 2)}</td>
                        <td className="py-2 pr-3 text-right">
                          {activeLPerMT == null
                            ? <span className="text-muted-foreground">—</span>
                            : <Badge variant={overTarget ? "destructive" : "secondary"}>{fmt(activeLPerMT, 3)}</Badge>}
                        </td>
                        <td className="py-2 pr-3 text-right" data-testid={`cell-hotoil-avg-${r.date}`}>
                          {r.hotOilEndAvgC == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : hotOilFlagged ? (
                            <Badge
                              variant="destructive"
                              className="gap-1"
                              title={`Avg ${r.hotOilEndAvgC.toFixed(1)}°C is below the ${hotOilThreshold}°C floor`}
                              data-testid={`badge-hotoil-flag-${r.date}`}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {fmt(r.hotOilEndAvgC, 1)}
                            </Badge>
                          ) : (
                            <span>{fmt(r.hotOilEndAvgC, 1)}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-xs text-muted-foreground" data-testid={`cell-hotoil-range-${r.date}`}>
                          {r.hotOilEndMinC == null
                            ? "—"
                            : `${fmt(r.hotOilEndMinC, 0)} / ${fmt(r.hotOilEndMaxC, 0)}`}
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
