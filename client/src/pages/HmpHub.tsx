import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Flame, ClipboardList, Truck, Droplets, Gauge, FileSearch,
  Fuel, TrendingUp, FileText, ShoppingCart,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const TODAY = format(new Date(), "yyyy-MM-dd");

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatDayLabel(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return DAY_ABBR[d.getDay()];
  } catch { return dateStr.slice(5); }
}

function KpiCard({ label, value, sub, color = "orange" }: {
  label: string; value?: string | number; sub?: string; color?: "orange" | "amber" | "purple";
}) {
  const c = color === "orange"
    ? { border: "border-orange-200", bg: "bg-orange-50", val: "text-orange-700" }
    : color === "amber"
      ? { border: "border-amber-200", bg: "bg-amber-50", val: "text-amber-700" }
      : { border: "border-purple-200", bg: "bg-purple-50", val: "text-purple-700" };
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${c.border}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${c.val}`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

type HmpTab = "operations" | "stock" | "reports";

export default function HmpHub() {
  const { sectionVisible, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<HmpTab>("operations");

  const canShift    = sectionVisible("plant_shift_logs");
  const canHeating  = sectionVisible("plant_heating");
  const canProd     = sectionVisible("plant_production");
  const canStock    = sectionVisible("plant_stock");
  const canReports  = sectionVisible("plant_daily_reports");
  const canVariance = sectionVisible("plant_variance");
  const canAudit    = sectionVisible("plant_audit");
  const canBitumen  = sectionVisible("plant_bitumen");
  const canLdo      = sectionVisible("plant_ldo");
  const canDiesel   = sectionVisible("plant_diesel_proc");
  const canProcure  = sectionVisible("site_procurement");
  const canDieselReq = sectionVisible("site_diesel");

  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: shiftLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-module/shift-logs", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/shift-logs?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: canShift,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: dispatches = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-module/dispatches", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/dispatches?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: canProd,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: dispatchTrend = [], isLoading: trendLoading } = useQuery<any[]>({
    queryKey: ["/api/plant-module/dispatches-trend", sevenDaysAgo, TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/dispatches?dateFrom=${sevenDaysAgo}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      const rows: any[] = await res.json();
      const byDate: Record<string, number> = {};
      rows.forEach(r => {
        const d = r.date || r.dispatchDate;
        if (d) byDate[d] = (byDate[d] || 0) + (parseFloat(r.weight || r.tonnage || r.quantity || "0") || 0);
      });
      const allDates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        allDates.push(d);
      }
      return allDates.map(d => ({ date: d, tonnes: byDate[d] || 0 }));
    },
    enabled: canProd,
    staleTime: 5 * 60 * 1000,
  });

  const totalMT = dispatches.reduce((s: number, d: any) => s + (parseFloat(d.weight ?? d.tonnage ?? d.quantity ?? "0") || 0), 0);
  const totalLdoL = shiftLogs.reduce((s: number, l: any) => s + (parseFloat(l.ldoConsumed ?? "0") || 0), 0);

  const maxTonnes = Math.max(...dispatchTrend.map(d => d.tonnes), 0);
  const hasAnyProd = dispatchTrend.some(d => d.tonnes > 0);

  const tabs: { key: HmpTab; label: string }[] = [
    { key: "operations", label: "Operations" },
    { key: "stock",      label: "Stock & Procurement" },
    { key: "reports",    label: "Reports" },
  ];

  return (
    <HubShell
      title="HMP Plant"
      subtitle="Hot-mix plant — operations, stock & reports"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Shifts Today" value={canShift ? shiftLogs.length : undefined} sub="logged" color="orange" />
          <KpiCard
            label="MT Dispatched"
            value={canProd ? (totalMT > 0 ? totalMT.toFixed(1) : "0") : undefined}
            sub="today"
            color="amber"
          />
          <KpiCard
            label="LDO Consumed"
            value={canShift ? (totalLdoL > 0 ? `${totalLdoL.toFixed(0)} L` : "—") : undefined}
            sub="today"
            color="orange"
          />
          <KpiCard label="Date" value={format(new Date(), "dd MMM")} sub={format(new Date(), "yyyy")} color="purple" />
        </div>

        {/* 7-day dispatch trend — only shown when data exists */}
        {canProd && (trendLoading || hasAnyProd) && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                7-Day Dispatch Trend (Tonnes)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {trendLoading ? (
                <div className="h-36 flex items-end gap-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${30 + Math.random() * 60}%` }} />
                  ))}
                </div>
              ) : !hasAnyProd ? (
                <div className="h-36 flex items-center justify-center text-sm text-slate-400">
                  No production data in the last 7 days
                </div>
              ) : (
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dispatchTrend} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDayLabel}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false}
                        tickFormatter={v => v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(0,0,0,0.04)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white border border-slate-200 rounded-md shadow-md px-3 py-2 text-xs">
                              <p className="font-semibold text-slate-700">{d.date}</p>
                              <p className="text-orange-600">{d.tonnes.toFixed(1)} T</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="tonnes" radius={[3, 3, 0, 0]} maxBarSize={40}>
                        {dispatchTrend.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.date === TODAY ? "#ea580c" : entry.tonnes === maxTonnes && maxTonnes > 0 ? "#f97316" : "#fdba74"}
                            fillOpacity={entry.tonnes === 0 ? 0.25 : 1}
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

        {/* Tabs */}
        <div>
          <div className="flex gap-4 mb-6 border-b border-slate-200 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-semibold transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-orange-500 text-orange-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
                data-testid={`tab-hmp-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "operations" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/plant/heating-sessions"
                icon={Flame}
                title="Heating Sessions"
                description="Boiler / hot-oil heating session logs and DG runs"
                accent="orange"
                iconBg="bg-orange-100"
                enabled={canHeating}
              />
              <HubActionTile
                href="/plant/shift-log"
                icon={ClipboardList}
                title="Plant Shift Log"
                description="Daily shift details — manpower, activities & production"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canShift}
              />
              <HubActionTile
                href="/plant/dispatches"
                icon={Truck}
                title="Mix Dispatches"
                description="Bituminous mix dispatch records and stock deduction"
                accent="orange"
                iconBg="bg-orange-100"
                enabled={canProd}
              />
            </div>
          )}

          {activeTab === "stock" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/plant/bitumen-stock"
                icon={Droplets}
                title="Bitumen Stock"
                description="Bitumen tank levels, receipts and consumption"
                accent="yellow"
                iconBg="bg-yellow-100"
                enabled={canBitumen}
              />
              <HubActionTile
                href="/plant/ldo-flow-meter"
                icon={Gauge}
                title="LDO Stock"
                description="LDO stock levels, flow meter readings and consumption tracking"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canLdo}
              />
              <HubActionTile
                href="/plant/ldo-reconciliation"
                icon={FileSearch}
                title="LDO Book vs Physical"
                description="Reconcile book stock against physical dip readings"
                accent="slate"
                iconBg="bg-slate-100"
                enabled={canStock}
              />
              <HubActionTile
                href="/plant/purchase-indents?returnTo=/plant/hub"
                icon={ShoppingCart}
                title="Purchase Indent"
                description="Raise and track purchase indents for HMP materials & spares"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canProcure}
              />
              <HubActionTile
                href="/plant/diesel-requirements?returnTo=/plant/hub"
                icon={Fuel}
                title="Daily Diesel Requirement"
                description="Plan & approve diesel allocation for HMP plant operations"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canDieselReq}
              />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/plant/daily-reports"
                icon={FileText}
                title="Daily Plant Reports"
                description="Production summaries with mix-wise breakdowns and PDF export"
                accent="orange"
                iconBg="bg-orange-100"
                enabled={canReports}
              />
              <HubActionTile
                href="/plant/heating-trends"
                icon={TrendingUp}
                title="Heating Trends"
                description="Hot-oil supply vs return temperature trend charts"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canHeating}
              />
              <HubActionTile
                href="/plant/diesel-procurement"
                icon={Fuel}
                title="Diesel Procurement"
                description="Diesel purchase and consumption summary report"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canDiesel}
              />
              <HubActionTile
                href="/plant/shift-log-manpower-review"
                icon={ClipboardList}
                title="Manpower Review"
                description="Contractor-wise manpower review across shift logs"
                accent="slate"
                iconBg="bg-slate-100"
                enabled={canShift}
              />
            </div>
          )}
        </div>

      </div>
    </HubShell>
  );
}
