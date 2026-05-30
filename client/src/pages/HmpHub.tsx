import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Flame, ClipboardList, Truck, ShoppingCart, Fuel, BarChart3,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");

function KpiCard({ label, value, sub }: { label: string; value?: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-3xl font-bold text-slate-800 tracking-tight">
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function HmpHub() {
  const { sectionVisible } = useAuth();

  const { data: shiftLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/plant-module/shift-logs", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant-module/shift-logs?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: sectionVisible("plant_shift_logs"),
  });

  const { data: dispatches = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/dispatches", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant/dispatches?date=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("plant_production"),
  });

  const totalMT = dispatches.reduce((sum: number, d: any) => sum + (parseFloat(d.tonnage ?? d.quantity ?? "0") || 0), 0);
  const totalLdoL = shiftLogs.reduce((sum: number, l: any) => sum + (parseFloat(l.ldoConsumed ?? "0") || 0), 0);

  return (
    <HubShell
      title="HMP Operations"
      subtitle="Shift logs, heating sessions & production dispatches"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Shifts Today"
            value={sectionVisible("plant_shift_logs") ? shiftLogs.length : undefined}
            sub="logged"
          />
          <KpiCard
            label="MT Dispatched"
            value={sectionVisible("plant_production") ? (totalMT > 0 ? `${totalMT.toFixed(1)}` : "0") : undefined}
            sub="metric tonnes"
          />
          <KpiCard
            label="LDO Consumed"
            value={sectionVisible("plant_shift_logs") ? (totalLdoL > 0 ? `${totalLdoL.toFixed(0)} L` : "—") : undefined}
            sub="today"
          />
          <KpiCard
            label="Date"
            value={format(new Date(), "dd MMM")}
            sub={format(new Date(), "yyyy")}
          />
        </div>

        {/* Action tiles */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Operations & Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/plant/heating-sessions"
              icon={Flame}
              title="Bitumen Heating Sessions"
              description="Log boiler runs & track hot-oil temperatures"
              accent="orange"
              iconBg="bg-orange-100"
              enabled={sectionVisible("plant_heating")}
            />
            <HubActionTile
              href="/plant/shift-log"
              icon={ClipboardList}
              title="Plant Shift Log"
              description="Record shift details, personnel & production"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("plant_shift_logs")}
            />
            <HubActionTile
              href="/plant/dispatches"
              icon={Truck}
              title="Production & Dispatches"
              description="Log truck loads with mix data & tonnage"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("plant_production")}
            />
            <HubActionTile
              href="/plant/purchase-indents"
              icon={ShoppingCart}
              title="Purchase Indents"
              description="Raise & track material purchase requests"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href="/plant/diesel-requirements"
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan diesel allocation per equipment for today"
              accent="yellow"
              iconBg="bg-yellow-100"
              enabled={sectionVisible("site_diesel")}
            />
            <HubActionTile
              href="/plant/daily-report"
              icon={BarChart3}
              title="Today's Plant Report"
              description="Quick summary of all plant activities today"
              accent="purple"
              iconBg="bg-purple-100"
              enabled={sectionVisible("plant_daily_reports")}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
