import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Truck, FileText,
  TestTube, FlaskConical, BarChart3, Layers, AlertTriangle, TrendingUp,
  Fuel, ShoppingCart,
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

function KpiCard({ label, value, sub, icon: Icon, highlight = "teal" }: {
  label: string;
  value?: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: "teal" | "red";
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm flex items-center gap-4 ${
      highlight === "red" ? "border-red-200" : "border-teal-200"
    }`} data-testid={`card-rmc-kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
        highlight === "red" ? "bg-red-50" : "bg-teal-50"
      }`}>
        <Icon className={`w-5 h-5 ${highlight === "red" ? "text-red-500" : "text-teal-600"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-2xl font-bold tracking-tight ${
          highlight === "red" ? "text-red-700" : "text-teal-700"
        }`}>
          {value !== undefined ? value : <span className="text-slate-300">—</span>}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function RmcHub() {
  const { sectionVisible } = useAuth();
  const [activeTab, setActiveTab] = useState<"operations" | "reports">("operations");

  const canProduction = sectionVisible("plant_production");
  const canReports = sectionVisible("plant_daily_reports");
  const canProcure = sectionVisible("site_procurement");
  const canDieselReq = sectionVisible("site_diesel");

  const todayStr = new Date().toISOString().slice(0, 10);
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

  const { data: cubeTestsToday, isLoading: cubeStatsLoading } = useQuery<{ testDate: string }[]>({
    queryKey: ["/api/rmc/cube-tests", todayStr],
    queryFn: () =>
      apiRequest("GET", `/api/rmc/cube-tests?dateFrom=${todayStr}&dateTo=${todayStr}`).then(r => r.json()),
    enabled: canProduction,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
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

  const cubeTestsLoggedToday = cubeTestsToday?.length ?? 0;

  const chartData = (trendData ?? []).map(d => ({
    day: formatDayLabel(d.date),
    date: d.date,
    volume: Number(d.totalVolumeM3.toFixed(2)),
    batches: d.totalBatches,
    isToday: d.date === todayStr,
  }));

  const maxVolume = Math.max(...chartData.map(d => d.volume), 0);
  const hasAnyProduction = chartData.some(d => d.volume > 0);

  return (
    <HubShell
      title="RMC Operations"
      subtitle="Ready-mix concrete plant — batching, quality & delivery"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        {canProduction && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="section-rmc-summary">
            <div className="relative">
              {summaryLoading ? (
                <div className="bg-white rounded-xl border border-teal-200 p-5 shadow-sm">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-20" />
                </div>
              ) : (
                <KpiCard
                  label="m³ Dispatched"
                  value={`${(rmcSummary?.totalVolumeM3 ?? 0).toFixed(2)} m³`}
                  sub={
                    (rmcSummary?.byGrade?.length ?? 0) > 0
                      ? rmcSummary!.byGrade.map(g => g.grade).join(", ")
                      : undefined
                  }
                  icon={Layers}
                />
              )}
            </div>

            <div>
              {summaryLoading ? (
                <div className="bg-white rounded-xl border border-teal-200 p-5 shadow-sm">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-12" />
                </div>
              ) : (
                <KpiCard
                  label="Today's Batches"
                  value={rmcSummary?.totalBatches ?? 0}
                  icon={Truck}
                />
              )}
            </div>

            <div>
              {cubeStatsLoading ? (
                <div className="bg-white rounded-xl border border-teal-200 p-5 shadow-sm">
                  <Skeleton className="h-4 w-28 mb-2" />
                  <Skeleton className="h-8 w-10" />
                </div>
              ) : (
                <KpiCard
                  label="Cube Tests Logged"
                  value={cubeTestsLoggedToday}
                  sub="today"
                  icon={TestTube}
                />
              )}
            </div>
          </div>
        )}

        {/* Grade breakdown pills */}
        {canProduction && !summaryLoading && (rmcSummary?.byGrade?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="section-rmc-grade-breakdown">
            <span className="text-xs text-slate-500 self-center font-medium">Grade breakdown:</span>
            {rmcSummary!.byGrade.map((g) => (
              <Badge
                key={g.grade}
                variant="outline"
                className="border-teal-300 text-teal-700 gap-1"
                data-testid={`badge-grade-${g.grade}`}
              >
                <span className="font-semibold">{g.grade}</span>
                <span className="text-slate-500">— {g.volumeM3.toFixed(1)} m³ / {g.batchesCount} batch{g.batchesCount !== 1 ? "es" : ""}</span>
              </Badge>
            ))}
          </div>
        )}

        {/* 7-day production trend */}
        {canProduction && (
          <Card className="border-slate-200 shadow-sm" data-testid="card-rmc-7day-trend">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
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
                <div className="h-36 flex items-center justify-center text-sm text-slate-400" data-testid="text-rmc-trend-empty">
                  No production data in the last 7 days
                </div>
              ) : (
                <div className="h-36" data-testid="chart-rmc-7day-trend">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 rounded-md shadow-md px-3 py-2 text-xs space-y-0.5">
                              <p className="font-semibold text-slate-700">{d.date}</p>
                              <p className="text-teal-600">{d.volume.toFixed(2)} m³</p>
                              <p className="text-slate-400">{d.batches} batch{d.batches !== 1 ? "es" : ""}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="volume" radius={[3, 3, 0, 0]} maxBarSize={40}>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.isToday
                              ? "#0d9488"
                              : entry.volume === maxVolume && maxVolume > 0
                                ? "#14b8a6"
                                : "#5eead4"}
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

        {/* Action tiles */}
        <div>
          <div className="flex gap-4 mb-6 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("operations")}
              className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === "operations"
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              data-testid="tab-rmc-operations"
            >
              Operations
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                activeTab === "reports"
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
              data-testid="tab-rmc-reports"
            >
              Reports
            </button>
          </div>

          {activeTab === "operations" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/plant/rmc/batch-records"
                icon={Truck}
                title="Batch Records"
                description="Log concrete batches and generate delivery challans"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canProduction}
              />
              <HubActionTile
                href="/plant/rmc/delivery-challans"
                icon={FileText}
                title="Delivery Challans"
                description="View and print DCs generated from batch records"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canProduction}
              />
              <HubActionTile
                href="/plant/rmc/cube-tests"
                icon={TestTube}
                title="Cube Tests QC"
                description="Record and track concrete cube test results"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canProduction}
              />
              <HubActionTile
                href="/plant/rmc/mix-designs"
                icon={FlaskConical}
                title="Mix Designs"
                description="Manage concrete mix design templates and grades"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canProduction}
              />
              <HubActionTile
                href="/plant/purchase-indents?returnTo=/rmc/hub"
                icon={ShoppingCart}
                title="Purchase Indent"
                description="Raise and track purchase indents for RMC materials & consumables"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canProcure}
              />
              <HubActionTile
                href="/plant/diesel-requirements?returnTo=/rmc/hub"
                icon={Fuel}
                title="Daily Diesel Requirement"
                description="Plan & approve diesel allocation for RMC plant operations"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canDieselReq}
              />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/plant/rmc/daily-report"
                icon={BarChart3}
                title="RMC Daily Report"
                description="Production summary with grade-wise breakdowns"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canReports}
              />
            </div>
          )}
        </div>

      </div>
    </HubShell>
  );
}
