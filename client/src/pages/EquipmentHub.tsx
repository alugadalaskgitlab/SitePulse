import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Activity, AlertTriangle, Fuel, Truck,
  Zap, ChevronRight,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
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

function ActionTile({
  href, icon: Icon, title, description, accentColor, iconBg, enabled = true,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accentColor: string;
  iconBg: string;
  enabled?: boolean;
}) {
  if (!enabled) return null;
  return (
    <Link href={href}>
      <a
        className={`group flex items-start gap-4 bg-white border border-slate-200 rounded-xl p-5 hover:border-${accentColor}-300 hover:shadow-md transition-all cursor-pointer`}
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

export default function EquipmentHub() {
  const { sectionVisible } = useAuth();

  const { data: equipmentUsage = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/equipment-usage", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant/equipment-usage?date=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("plant_equipment"),
  });

  const { data: maintenance = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/maintenance", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant/maintenance`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: sectionVisible("plant_equipment"),
  });

  const activeCount = equipmentUsage.length;
  const breakdownCount = maintenance.filter((m: any) =>
    m.status === "breakdown" || m.status === "pending"
  ).length;

  return (
    <HubShell
      title="Equipment & Fleet"
      subtitle="Usage logs, breakdowns & diesel tracking"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Active Today"
            value={sectionVisible("plant_equipment") ? activeCount : undefined}
            sub="equipment logged"
          />
          <KpiCard
            label="Breakdowns"
            value={sectionVisible("plant_equipment") ? breakdownCount : undefined}
            sub="open items"
          />
          <KpiCard
            label="Date"
            value={format(new Date(), "dd MMM")}
            sub={format(new Date(), "yyyy")}
          />
          <KpiCard
            label="Diesel Req"
            value={undefined}
            sub="see reports"
          />
        </div>

        {/* Action tiles */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Operations & Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ActionTile
              href="/plant/equipment-usage"
              icon={Activity}
              title="Equipment Usage Log"
              description="Record daily equipment hours, fuel usage & operator details"
              accentColor="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("plant_equipment")}
            />
            <ActionTile
              href="/plant/maintenance"
              icon={AlertTriangle}
              title="Maintenance & Breakdowns"
              description="Log breakdowns, track repairs & service history"
              accentColor="red"
              iconBg="bg-red-100"
              enabled={sectionVisible("plant_equipment")}
            />
            <ActionTile
              href="/plant/generator-logs"
              icon={Zap}
              title="Generator / DG Logs"
              description="Record diesel generator run logs & fuel consumption"
              accentColor="yellow"
              iconBg="bg-yellow-100"
              enabled={sectionVisible("plant_equipment")}
            />
            <ActionTile
              href="/plant/diesel-requirements"
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan & approve diesel allocation for fleet equipment"
              accentColor="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("site_diesel")}
            />
            <ActionTile
              href="/admin/settings"
              icon={Truck}
              title="Equipment Master"
              description="Manage equipment list, categories & specifications"
              accentColor="slate"
              iconBg="bg-slate-100"
              enabled={sectionVisible("admin_settings")}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
