import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Flame, ClipboardList, Truck, Droplets, Gauge, FileSearch,
  Fuel, TrendingUp, ShoppingCart, HardHat,
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
const HUB = "/plant/hub";

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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}

export default function HmpHub() {
  const { sectionVisible } = useAuth();

  const canShift    = sectionVisible("plant_shift_logs");
  const canHeating  = sectionVisible("plant_heating");
  const canProd     = sectionVisible("plant_production");
  const canStock    = sectionVisible("plant_stock");
  const canBitumen  = sectionVisible("plant_bitumen");
  const canLdo      = sectionVisible("plant_ldo");
  const canProcure  = sectionVisible("site_procurement");
  const canDieselReq = sectionVisible("site_diesel");

  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const canEquipment = sectionVisible("plant_equipment");

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

  const { data: equipmentUsageToday = [], isLoading: equipLoading } = useQuery<any[]>({
    queryKey: ["/api/plant-module/equipment-usage", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/equipment-usage?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: canEquipment,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  type PlantBucket = { count: number; hireAmount: number; hoursRun: number; sites: Set<string> };
  const equipByPlant = equipmentUsageToday.reduce<Record<string, PlantBucket>>((acc, entry) => {
    const site: string = entry.siteName || "HMP PLANT";
    const bucket: string =
      site === "HMP PLANT" ? "HMP PLANT"
      : site === "RMC PLANT" ? "RMC PLANT"
      : "Other Sites";
    if (!acc[bucket]) acc[bucket] = { count: 0, hireAmount: 0, hoursRun: 0, sites: new Set() };
    acc[bucket].count += 1;
    acc[bucket].hireAmount += parseFloat(entry.hireAmount ?? "0") || 0;
    acc[bucket].hoursRun += parseFloat(entry.hoursOrKmRun ?? "0") || 0;
    if (bucket === "Other Sites" && site) acc[bucket].sites.add(site);
    return acc;
  }, {});

  const PLANT_ORDER = ["HMP PLANT", "RMC PLANT", "Other Sites"] as const;
  const PLANT_COLORS: Record<string, { border: string; bg: string; label: string; dot: string }> = {
    "HMP PLANT":   { border: "border-orange-200", bg: "bg-orange-50",  label: "text-orange-700", dot: "bg-orange-400" },
    "RMC PLANT":   { border: "border-blue-200",   bg: "bg-blue-50",    label: "text-blue-700",   dot: "bg-blue-400"   },
    "Other Sites": { border: "border-slate-200",  bg: "bg-slate-50",   label: "text-slate-700",  dot: "bg-slate-400"  },
  };

  const totalMT = dispatches.reduce((s: number, d: any) => s + (parseFloat(d.weight ?? d.tonnage ?? d.quantity ?? "0") || 0), 0);
  const totalLdoL = shiftLogs.reduce((s: number, l: any) => s + (parseFloat(l.ldoConsumed ?? "0") || 0), 0);

  const maxTonnes = Math.max(...dispatchTrend.map(d => d.tonnes), 0);
  const hasAnyProd = dispatchTrend.some(d => d.tonnes > 0);

  return (
    <HubShell
      title="HMP Operations"
      subtitle="Hot-mix plant — shift logs, fuel tracking & procurement"
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
            sub="metric tonnes"
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

        {/* Equipment cost breakdown by plant */}
        {canEquipment && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <HardHat className="w-4 h-4 text-orange-500" />
                Equipment Usage — Today by Location
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {equipLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[0, 1, 2].map(i => (
                    <Skeleton key={i} className="h-20 rounded-lg" />
                  ))}
                </div>
              ) : equipmentUsageToday.length === 0 ? (
                <p className="text-sm text-slate-400 py-2">No equipment entries logged today</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {PLANT_ORDER.map(plantKey => {
                    const bucket = equipByPlant[plantKey];
                    const c = PLANT_COLORS[plantKey];
                    if (!bucket) {
                      return (
                        <div key={plantKey} className={`rounded-lg border p-3 ${c.border} ${c.bg} opacity-40`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                            <span className={`text-xs font-semibold ${c.label}`}>{plantKey}</span>
                          </div>
                          <p className="text-xs text-slate-400">No entries</p>
                        </div>
                      );
                    }
                    return (
                      <div key={plantKey} className={`rounded-lg border p-3 ${c.border} ${c.bg}`} data-testid={`equip-cost-${plantKey.toLowerCase().replace(/\s+/g, "-")}`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                          <span className={`text-xs font-semibold ${c.label}`}>{plantKey}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Entries</span>
                            <span className={`text-sm font-bold ${c.label}`}>{bucket.count}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Hrs / KM</span>
                            <span className="text-xs font-semibold text-slate-600">
                              {bucket.hoursRun > 0 ? bucket.hoursRun.toFixed(1) : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Hire Cost</span>
                            <span className="text-xs font-semibold text-slate-600">
                              {bucket.hireAmount > 0 ? `₹${bucket.hireAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                            </span>
                          </div>
                          {plantKey === "Other Sites" && bucket.sites.size > 0 && (
                            <p className="text-[10px] text-slate-400 pt-0.5 truncate" title={[...bucket.sites].join(", ")}>
                              {[...bucket.sites].slice(0, 2).join(", ")}{bucket.sites.size > 2 ? ` +${bucket.sites.size - 2}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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

        {/* Operations & Actions */}
        <div>
          <SectionHeading>Operations & Actions</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/heating-sessions?returnTo=${HUB}`}
              icon={Flame}
              title="Bitumen Heating Sessions"
              description="Log boiler runs & track hot-oil temperatures"
              accent="orange"
              iconBg="bg-orange-100"
              enabled={canHeating}
            />
            <HubActionTile
              href={`/plant/shift-log?returnTo=${HUB}`}
              icon={ClipboardList}
              title="Plant Shift Log"
              description="Record shift details, personnel & production"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={canShift}
            />
            <HubActionTile
              href={`/plant/dispatches?returnTo=${HUB}`}
              icon={Truck}
              title="Production & Dispatches"
              description="Log truck loads with mix data & tonnage"
              accent="orange"
              iconBg="bg-orange-100"
              enabled={canProd}
            />
          </div>
        </div>

        {/* Fuel & Bitumen Tracking */}
        {(canBitumen || canLdo || canStock) && (
          <div>
            <SectionHeading>Fuel & Bitumen Tracking</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/bitumen-stock?returnTo=${HUB}`}
                icon={Droplets}
                title="Bitumen Stock Tracker"
                description="Dip readings, tank levels & bitumen stock balance"
                accent="yellow"
                iconBg="bg-yellow-100"
                enabled={canBitumen}
              />
              <HubActionTile
                href={`/plant/ldo-flow-meter?returnTo=${HUB}`}
                icon={Gauge}
                title="LDO Flow Meter"
                description="LDO meter readings, dip logs & fuel consumption"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canLdo}
              />
              <HubActionTile
                href={`/plant/ldo-reconciliation?returnTo=${HUB}`}
                icon={FileSearch}
                title="LDO Book vs Physical"
                description="Reconcile book stock against physical dip readings"
                accent="slate"
                iconBg="bg-slate-100"
                enabled={canStock}
              />
            </div>
          </div>
        )}

        {/* Procurement */}
        {(canProcure || canDieselReq) && (
          <div>
            <SectionHeading>Procurement</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/purchase-indents?returnTo=${HUB}`}
                icon={ShoppingCart}
                title="Purchase Indent"
                description="Raise and track purchase indents for HMP materials & spares"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canProcure}
              />
              <HubActionTile
                href={`/plant/diesel-requirements?returnTo=${HUB}`}
                icon={Fuel}
                title="Daily Diesel Requirement"
                description="Plan & approve diesel allocation for HMP plant operations"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canDieselReq}
              />
            </div>
          </div>
        )}

      </div>
    </HubShell>
  );
}
