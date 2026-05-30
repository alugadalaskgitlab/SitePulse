import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Flame, ClipboardList, Truck, ShoppingCart,
  Fuel, BarChart3, ChevronRight,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");

interface KpiCardProps {
  label: string;
  value: string | number | undefined;
  sub?: string;
}

function KpiCard({ label, value, sub }: KpiCardProps) {
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

interface ActionTileProps {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accentColor: string;
  iconBg: string;
  enabled?: boolean;
}

function ActionTile({ href, icon: Icon, title, description, accentColor, iconBg, enabled = true }: ActionTileProps) {
  if (!enabled) return null;
  return (
    <Link href={href}>
      <a className={`group flex items-start gap-4 bg-white border border-slate-200 rounded-xl p-5 hover:border-${accentColor}-300 hover:shadow-md transition-all cursor-pointer`}
        data-testid={`tile-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className={`p-3 ${iconBg} rounded-lg group-hover:scale-110 transition-transform flex-shrink-0`}>
          <Icon className={`w-5 h-5 text-${accentColor}-600`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-slate-800 group-hover:text-${accentColor}-600 transition-colors`}>
            {title}
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-all" />
      </a>
    </Link>
  );
}

export default function HmpHub() {
  const { sectionVisible } = useAuth();

  const { data: shiftLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/shift-log", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant/shift-log?date=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
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

  const { data: heatingSessions = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/heating-sessions", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant/heating-sessions?date=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("plant_heating"),
  });

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
            label="Dispatched"
            value={sectionVisible("plant_production") && totalMT > 0 ? `${totalMT.toFixed(1)} MT` : undefined}
            sub="today"
          />
          <KpiCard
            label="Heating Sessions"
            value={sectionVisible("plant_heating") ? heatingSessions.length : undefined}
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
            <ActionTile
              href="/plant/heating-sessions"
              icon={Flame}
              title="Bitumen Heating Sessions"
              description="Log boiler runs & track hot-oil temperatures"
              accentColor="orange"
              iconBg="bg-orange-100"
              enabled={sectionVisible("plant_heating")}
            />
            <ActionTile
              href="/plant/shift-log"
              icon={ClipboardList}
              title="Plant Shift Log"
              description="Record shift details, personnel & production"
              accentColor="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("plant_shift_logs")}
            />
            <ActionTile
              href="/plant/dispatches"
              icon={Truck}
              title="Production & Dispatches"
              description="Log truck loads with mix data & tonnage"
              accentColor="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("plant_production")}
            />
            <ActionTile
              href="/plant/purchase-indents"
              icon={ShoppingCart}
              title="Purchase Indents"
              description="Raise & track material purchase requests"
              accentColor="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_procurement")}
            />
            <ActionTile
              href="/plant/diesel-requirements"
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan diesel allocation per equipment for today"
              accentColor="yellow"
              iconBg="bg-yellow-100"
              enabled={sectionVisible("site_diesel")}
            />
            <ActionTile
              href="/plant/daily-report"
              icon={BarChart3}
              title="Today's Plant Report"
              description="Quick summary of all plant activities today"
              accentColor="purple"
              iconBg="bg-purple-100"
              enabled={sectionVisible("plant_daily_reports")}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
