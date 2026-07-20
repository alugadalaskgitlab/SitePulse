import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Activity, AlertTriangle, Fuel, Zap, ShoppingCart, ClipboardList, CalendarCheck,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");
const HUB = "/equipment/hub";

function KpiCard({ label, value, sub, warn }: {
  label: string; value?: string | number; sub?: string; warn?: boolean;
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${warn ? "border-amber-200" : "border-slate-200"}`}>
      <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${warn ? "text-amber-700" : "text-slate-800"}`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function EquipmentHub() {
  const { sectionVisible } = useAuth();

  // Anyone who can reach the hub (equipment_hub OR plant_equipment) sees core content
  const canSeeEquip = sectionVisible("equipment_hub") || sectionVisible("plant_equipment");

  // Standalone equipment usage logs (plant/HMP source)
  const { data: equipmentUsage = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/equipment-usage", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/plant/equipment-usage?date=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canSeeEquip,
  });

  // Equipment embedded in today's submitted DPRs (site/road source)
  const { data: todayDprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", TODAY],
    queryFn: () =>
      fetch(`/api/dprs/with-details?dateFrom=${TODAY}&dateTo=${TODAY}`)
        .then(r => r.json()),
    enabled: canSeeEquip,
  });

  const { data: maintenance = [] } = useQuery<any[]>({
    queryKey: ["/api/plant/maintenance"],
    queryFn: async () => {
      const res = await fetch(`/api/plant/maintenance`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: canSeeEquip,
  });

  // Combined "Active Today": standalone logs + DPR equipment entries
  const dprEquipmentToday = (todayDprs as any[]).flatMap((d: any) => d.equipment ?? []);
  const standaloneCount  = (equipmentUsage as any[]).length;
  const dprEqCount       = dprEquipmentToday.length;
  const activeCount      = standaloneCount + dprEqCount;
  const activeSub =
    standaloneCount > 0 && dprEqCount > 0
      ? `${standaloneCount} plant · ${dprEqCount} site (DPR)`
      : standaloneCount > 0
        ? `${standaloneCount} plant logs`
        : dprEqCount > 0
          ? `${dprEqCount} from site DPRs`
          : "none logged yet";

  // Breakdowns: only actual open breakdown events, not scheduled service/PM records
  const breakdownCount = (maintenance as any[]).filter(
    (m: any) => m.eventType === "breakdown" && m.status === "open"
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
            value={canSeeEquip ? activeCount : undefined}
            sub={canSeeEquip ? activeSub : undefined}
          />
          <KpiCard
            label="Breakdowns"
            value={canSeeEquip ? breakdownCount : undefined}
            sub="open items"
            warn={breakdownCount > 0}
          />
          <KpiCard
            label="Date"
            value={format(new Date(), "dd MMM")}
            sub={format(new Date(), "yyyy")}
          />
          <KpiCard
            label="Fleet Status"
            value={breakdownCount === 0 ? "OK" : "⚠"}
            sub={breakdownCount === 0 ? "No open issues" : `${breakdownCount} open`}
            warn={breakdownCount > 0}
          />
        </div>

        {/* Action tiles */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Operations & Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/equipment-usage?returnTo=${HUB}&context=equipment`}
              icon={Activity}
              title="Equipment Usage Log"
              description="Record daily equipment hours, fuel usage & operator details"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={canSeeEquip}
            />
            <HubActionTile
              href={`/plant/maintenance?returnTo=${HUB}&context=equipment`}
              icon={AlertTriangle}
              title="Maintenance & Breakdowns"
              description="Log breakdowns, track repairs & service history"
              accent="red"
              iconBg="bg-red-100"
              badge={breakdownCount > 0 ? `${breakdownCount} open` : undefined}
              enabled={canSeeEquip}
            />
            <HubActionTile
              href={`/plant/generator-logs?returnTo=${HUB}&context=equipment`}
              icon={Zap}
              title="Generator / DG Logs"
              description="Record diesel generator run logs & fuel consumption"
              accent="yellow"
              iconBg="bg-yellow-100"
              enabled={canSeeEquip}
            />
            <HubActionTile
              href={`/plant/diesel-requirements?returnTo=${HUB}`}
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan & approve diesel allocation for fleet equipment"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("site_diesel")}
            />
            <HubActionTile
              href="/plant/purchase-indents?returnTo=/equipment/hub&from=equipment"
              icon={ShoppingCart}
              title="Purchase Indent"
              description="Raise indents for spare parts, consumables & fleet requirements"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href="/irn/new?from=equipment&returnTo=/equipment/hub"
              icon={ClipboardList}
              title="Raise Requisition (IRN)"
              description="Request materials from stores for fleet & equipment needs"
              accent="indigo"
              iconBg="bg-indigo-100"
              enabled={sectionVisible("irn_raise")}
            />
            <HubActionTile
              href="/site/requirements?context=equipment&returnTo=/equipment/hub"
              icon={CalendarCheck}
              title="Site Requirements Queue"
              description="View tomorrow's equipment requirements from site — mark as arranged, allocated or sent to plant"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={canSeeEquip}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
