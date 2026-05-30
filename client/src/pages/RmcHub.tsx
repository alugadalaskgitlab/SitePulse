import { useState } from "react";
import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Truck, FileText, Package,
  TestTube, FlaskConical, BarChart3, Layers, AlertTriangle, TrendingUp,
} from "lucide-react";
import { parseISO } from "date-fns";

type RmcSummary = {
  date: string;
  totalVolumeM3: number;
  totalBatches: number;
  byGrade: { grade: string; volumeM3: number; batchesCount: number }[];
};

type DaySummary = {
  date: string;
  totalVolumeM3: number;
  totalBatches: number;
};

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayLabel(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    return DAY_ABBR[d.getDay()];
  } catch {
    return dateStr.slice(5);
  }
}

export default function RmcHub() {
  const _search = useSearch();
  const _backHref = new URLSearchParams(_search).get("returnTo") || "/";
  const { sectionVisible } = useAuth();
  const [activeTab, setActiveTab] = useState("operations");

  const canProduction = sectionVisible("plant_production");
  const canMaterials = sectionVisible("plant_materials");
  const canReports = sectionVisible("plant_daily_reports");

  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: rmcSummary, isLoading: summaryLoading } = useQuery<RmcSummary>({
    queryKey: ["/api/rmc/today-summary", todayStr],
    queryFn: async () => {
      const params = new URLSearchParams({ date: todayStr });
      const r = await fetch(`/api/rmc/today-summary?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: canProduction,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: cubeTestStats, isLoading: cubeStatsLoading } = useQuery<{ failCount: number }>({
    queryKey: ["/api/rmc/cube-tests/stats", thirtyDaysAgo],
    queryFn: () => apiRequest("GET", `/api/rmc/cube-tests/stats?dateFrom=${thirtyDaysAgo}`).then(r => r.json()),
    enabled: canProduction,
    staleTime: 5 * 60 * 1000,
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<DaySummary[]>({
    queryKey: ["/api/rmc/summary-range", sevenDaysAgo, todayStr],
    queryFn: async () => {
      const params = new URLSearchParams({ dateFrom: sevenDaysAgo, dateTo: todayStr });
      const r = await fetch(`/api/rmc/summary-range?${params}`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: canProduction,
    staleTime: 5 * 60 * 1000,
  });

  const cubeFailCount = cubeTestStats?.failCount ?? 0;

  const chartData = (trendData ?? []).map(d => ({
    day: formatDayLabel(d.date),
    date: d.date,
    volume: Number(d.totalVolumeM3.toFixed(2)),
    batches: d.totalBatches,
    isToday: d.date === todayStr,
  }));

  const maxVolume = Math.max(...chartData.map(d => d.volume), 0);
  const hasAnyProduction = chartData.some(d => d.volume > 0);

  const operationsTiles = [
    canProduction && {
      href: "/plant/rmc/batch-records",
      icon: Truck,
      title: "Batch Records",
      desc: "Log concrete batches and generate delivery challans",
      color: "teal",
      testId: "tile-rmc-hub-batch-records",
    },
    canProduction && {
      href: "/plant/rmc/delivery-challans",
      icon: FileText,
      title: "Delivery Challans",
      desc: "View and print DCs generated from batch records",
      color: "teal",
      testId: "tile-rmc-hub-delivery-challans",
    },
    canMaterials && {
      href: "/plant/rmc/raw-materials",
      icon: Package,
      title: "Raw Material Receipts",
      desc: "Track incoming cement, aggregates & admixtures",
      color: "teal",
      testId: "tile-rmc-hub-raw-materials",
    },
    canProduction && {
      href: "/plant/rmc/cube-tests",
      icon: TestTube,
      title: "Cube Tests QC",
      desc: "Record and track concrete cube test results",
      color: "teal",
      testId: "tile-rmc-hub-cube-tests",
    },
    canProduction && {
      href: "/plant/rmc/mix-designs",
      icon: FlaskConical,
      title: "Mix Designs",
      desc: "Manage concrete mix design templates and grades",
      color: "teal",
      testId: "tile-rmc-hub-mix-designs",
    },
  ].filter(Boolean) as {
    href: string; icon: typeof Truck; title: string; desc: string;
    color: string; testId: string;
  }[];

  const reportsTiles = [
    canReports && {
      href: "/plant/rmc/daily-report",
      icon: BarChart3,
      title: "RMC Daily Report",
      desc: "Production summary with grade-wise breakdowns",
      color: "teal",
      testId: "tile-rmc-hub-daily-report",
    },
  ].filter(Boolean) as {
    href: string; icon: typeof Truck; title: string; desc: string;
    color: string; testId: string;
  }[];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href={_backHref}>
          <Button variant="ghost" size="icon" data-testid="button-back-rmc-hub">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">RMC Module</h1>
          <p className="text-muted-foreground mt-1">Ready-mix concrete plant operations and quality control</p>
        </div>
      </div>

      {/* Today's Summary Cards */}
      {canProduction && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="section-rmc-summary">
          {/* Total Volume */}
          <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-total-volume">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <Layers className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Today's Volume</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-24 mt-1" data-testid="skeleton-rmc-volume" />
                ) : (
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight" data-testid="text-rmc-total-volume">
                    {(rmcSummary?.totalVolumeM3 ?? 0).toFixed(2)} m³
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Batches */}
          <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-total-batches">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <Truck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Today's Batches</p>
                {summaryLoading ? (
                  <Skeleton className="h-7 w-16 mt-1" data-testid="skeleton-rmc-batches" />
                ) : (
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight" data-testid="text-rmc-total-batches">
                    {rmcSummary?.totalBatches ?? 0}
                  </p>
                )}
                {!summaryLoading && (rmcSummary?.byGrade?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid="text-rmc-grades">
                    {rmcSummary!.byGrade.map(g => g.grade).join(", ")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cube Test Failures */}
          <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-cube-failures">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                <TestTube className="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cube Failures (30d)</p>
                {cubeStatsLoading ? (
                  <Skeleton className="h-7 w-12 mt-1" data-testid="skeleton-rmc-cube-failures" />
                ) : (
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 leading-tight" data-testid="text-rmc-cube-fail-count">
                      {cubeFailCount}
                    </p>
                    {cubeFailCount > 0 && (
                      <Badge variant="destructive" className="gap-1 text-xs" data-testid="badge-rmc-cube-failures">
                        <AlertTriangle className="w-3 h-3" />
                        {cubeFailCount} {cubeFailCount === 1 ? "failure" : "failures"}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grade Breakdown */}
      {canProduction && !summaryLoading && (rmcSummary?.byGrade?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="section-rmc-grade-breakdown">
          <span className="text-xs text-muted-foreground self-center font-medium">Grade breakdown:</span>
          {rmcSummary!.byGrade.map((g) => (
            <Badge
              key={g.grade}
              variant="outline"
              className="border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 gap-1"
              data-testid={`badge-grade-${g.grade}`}
            >
              <span className="font-semibold">{g.grade}</span>
              <span className="text-muted-foreground">— {g.volumeM3.toFixed(1)} m³ / {g.batchesCount} batch{g.batchesCount !== 1 ? "es" : ""}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* 7-Day Production Trend */}
      {canProduction && (
        <Card className="border-teal-200 dark:border-teal-800" data-testid="card-rmc-7day-trend">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-500" />
              7-Day Production Trend (m³)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {trendLoading ? (
              <div className="h-36 flex items-end gap-2" data-testid="skeleton-rmc-trend">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${30 + Math.random() * 60}%` }} />
                ))}
              </div>
            ) : !hasAnyProduction ? (
              <div className="h-36 flex items-center justify-center text-sm text-muted-foreground" data-testid="text-rmc-trend-empty">
                No production data in the last 7 days
              </div>
            ) : (
              <div className="h-36" data-testid="chart-rmc-7day-trend">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted)/0.15)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs space-y-0.5">
                            <p className="font-semibold text-foreground">{d.date}</p>
                            <p className="text-teal-600 dark:text-teal-400">{d.volume.toFixed(2)} m³</p>
                            <p className="text-muted-foreground">{d.batches} batch{d.batches !== 1 ? "es" : ""}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="volume" radius={[3, 3, 0, 0]} maxBarSize={40}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.isToday
                            ? "hsl(var(--chart-2, 168 84% 35%))"
                            : entry.volume === maxVolume && maxVolume > 0
                              ? "hsl(var(--chart-1, 168 60% 45%))"
                              : "hsl(168 60% 60%)"}
                          fillOpacity={entry.volume === 0 ? 0.25 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="operations" className="gap-2" data-testid="tab-rmc-operations">
            <Truck className="w-4 h-4" />
            <span className="hidden sm:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2" data-testid="tab-rmc-reports">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-6">
          {operationsTiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No operations sections available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {operationsTiles.map((tile) => (
                <Link href={tile.href} key={tile.testId}>
                  <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid={tile.testId}>
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                        <tile.icon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{tile.title}</h3>
                        <p className="text-sm text-muted-foreground">{tile.desc}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          {reportsTiles.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No report sections available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reportsTiles.map((tile) => (
                <Link href={tile.href} key={tile.testId}>
                  <Card className="hover-elevate cursor-pointer h-full border-teal-200 dark:border-teal-800" data-testid={tile.testId}>
                    <CardContent className="p-6 flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
                        <tile.icon className="w-7 h-7 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{tile.title}</h3>
                        <p className="text-sm text-muted-foreground">{tile.desc}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
