import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity, AlertTriangle, Fuel, Truck, Zap,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");

function KpiCard({ label, value, sub, warn }: {
  label: string; value?: string | number; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${warn ? "border-amber-200" : "border-slate-200"}`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${warn ? "text-amber-700" : "text-slate-800"}`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
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
    queryKey: ["/api/plant/maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/plant/maintenance`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: sectionVisible("plant_equipment"),
  });

  const { data: dieselReqs = [] } = useQuery<any[]>({
    queryKey: ["/api/diesel-requirements", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/diesel-requirements?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: sectionVisible("site_diesel"),
  });

  const activeCount = equipmentUsage.length;
  const breakdownCount = maintenance.filter((m: any) =>
    m.status === "breakdown" || m.status === "pending" || m.status === "open"
  ).length;
  const totalDieselL = dieselReqs.reduce((s: number, r: any) => {
    const itemsSum = (r.items || []).reduce(
      (is: number, i: any) => is + (parseFloat(i.quantityApproved ?? i.quantity ?? "0") || 0), 0
    );
    return s + itemsSum;
  }, 0);

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
            warn={breakdownCount > 0}
          />
          <KpiCard
            label="Diesel Issued"
            value={sectionVisible("site_diesel") ? (totalDieselL > 0 ? `${totalDieselL.toFixed(0)} L` : "—") : undefined}
            sub="planned today"
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
              href="/plant/equipment-usage"
              icon={Activity}
              title="Equipment Usage Log"
              description="Record daily equipment hours, fuel usage & operator details"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("plant_equipment")}
            />
            <HubActionTile
              href="/plant/maintenance"
              icon={AlertTriangle}
              title="Maintenance & Breakdowns"
              description="Log breakdowns, track repairs & service history"
              accent="red"
              iconBg="bg-red-100"
              badge={breakdownCount > 0 ? `${breakdownCount} open` : undefined}
              enabled={sectionVisible("plant_equipment")}
            />
            <HubActionTile
              href="/plant/generator-logs"
              icon={Zap}
              title="Generator / DG Logs"
              description="Record diesel generator run logs & fuel consumption"
              accent="yellow"
              iconBg="bg-yellow-100"
              enabled={sectionVisible("plant_equipment")}
            />
            <HubActionTile
              href="/plant/diesel-requirements"
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan & approve diesel allocation for fleet equipment"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("site_diesel")}
            />
            <HubActionTile
              href="/admin/settings"
              icon={Truck}
              title="Equipment Master"
              description="Manage equipment list, categories & specifications"
              accent="slate"
              iconBg="bg-slate-100"
              enabled={sectionVisible("admin_settings")}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
