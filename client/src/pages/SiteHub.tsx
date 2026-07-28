import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText, Package, ClipboardList, TrendingUp, Fuel, ShoppingCart, Boxes,
  Route, Building2, CalendarCheck,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");
const HUB = "/site/hub";

function KpiCard({ label, value, sub, highlight }: {
  label: string; value?: string | number; sub?: string; highlight?: "amber" | "green";
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${
      highlight === "amber" ? "border-amber-200" :
      highlight === "green" ? "border-green-200" :
      "border-slate-200"
    }`}>
      <p className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${
        highlight === "amber" ? "text-amber-700" :
        highlight === "green" ? "text-green-700" :
        "text-slate-800"
      }`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-sm text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function SiteHub() {
  const { sectionVisible } = useAuth();

  const { data: dprs = [] } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/dprs/with-details?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("site_dprs"),
  });

  const activeSites = new Set(dprs.map((d: any) => d.site).filter(Boolean)).size || (dprs.length > 0 ? 1 : 0);
  const totalWorkforce = dprs.reduce((sum: number, d: any) =>
    sum + (parseInt(d.totalWorkers ?? d.manpowerCount ?? d.workforce ?? "0") || 0), 0
  );

  return (
    <HubShell
      title="Site Operations"
      subtitle="Daily progress reports & site activities"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* KPI ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Active Sites"
            value={sectionVisible("site_dprs") ? activeSites : undefined}
            sub="with DPR today"
          />
          <KpiCard
            label="DPRs Filed"
            value={sectionVisible("site_dprs") ? dprs.length : undefined}
            sub="today"
            highlight={dprs.length > 0 ? "green" : "amber"}
          />
          <KpiCard
            label="Workforce"
            value={sectionVisible("site_dprs") ? (totalWorkforce > 0 ? totalWorkforce : "—") : undefined}
            sub="workers on site"
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
              href={`/site/new?type=road&returnTo=${HUB}`}
              icon={Route}
              title="Road Works DPR"
              description="Daily progress for road activities (BOQ-linked)"
              accent="amber"
              iconBg="bg-amber-100"
              badge={dprs.length === 0 && sectionVisible("site_dprs") ? "Today" : undefined}
              enabled={sectionVisible("site_dprs")}
            />
            <HubActionTile
              href={`/site/new?type=structure&returnTo=${HUB}`}
              icon={Building2}
              title="Structure DPR"
              description="Daily progress for bridges, culverts & structures"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_dprs")}
            />
            <HubActionTile
              href={`/site/dashboard?returnTo=${HUB}`}
              icon={ClipboardList}
              title="DPR History"
              description="View, edit & track all submitted daily progress reports"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={sectionVisible("site_dprs")}
            />
            <HubActionTile
              href={`/site/material-trips?returnTo=${HUB}`}
              icon={Package}
              title="Material Entry"
              description="Log incoming material receipts & deliveries to site"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href={`/site/materials-received?returnTo=${HUB}`}
              icon={Package}
              title="Materials Received Report"
              description="Summary of all material receipts across date ranges"
              accent="green"
              iconBg="bg-green-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href={`/site/material-stock?returnTo=${HUB}`}
              icon={Boxes}
              title="Site Material Stock"
              description="Ordered vs delivered vs consumed — and what's lying at each site"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href={`/site/purchases?returnTo=${HUB}`}
              icon={TrendingUp}
              title="Site Purchases Report"
              description="Purchases, expenses & procurement analysis for the site"
              accent="rose"
              iconBg="bg-rose-100"
              enabled={
                sectionVisible("site_procurement") ||
                sectionVisible("purchase_indents_view") ||
                sectionVisible("purchase_indents_raise") ||
                sectionVisible("purchase_indents_approve")
              }
            />
            <HubActionTile
              href="/plant/purchase-indents?returnTo=/site/hub&from=site&context=site"
              icon={ShoppingCart}
              title="Purchase Indent"
              description="Raise and track purchase indents for site materials & requirements"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={
                sectionVisible("site_procurement") ||
                sectionVisible("purchase_indents_view") ||
                sectionVisible("purchase_indents_raise") ||
                sectionVisible("purchase_indents_approve")
              }
            />
            <HubActionTile
              href="/plant/diesel-requirements?returnTo=/site/hub"
              icon={Fuel}
              title="Daily Diesel Requirement"
              description="Plan & approve diesel allocation for site equipment"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={
                sectionVisible("site_diesel") ||
                sectionVisible("diesel_req_view") ||
                sectionVisible("diesel_req_raise") ||
                sectionVisible("diesel_req_approve")
              }
            />
            <HubActionTile
              href="/irn/new?from=site&returnTo=/site/hub"
              icon={ClipboardList}
              title="Raise Requisition (IRN)"
              description="Request materials from stores for site operations"
              accent="indigo"
              iconBg="bg-indigo-100"
              enabled={sectionVisible("irn_raise")}
            />
          </div>
        </div>

        {/* Tomorrow's Plans & Site Requirements Queue */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Tomorrow's Plans & Requirements
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/site/requirements?returnTo=/site/hub"
              icon={CalendarCheck}
              title="Site Requirements Queue"
              description="Review all tomorrow's plans, immediate requirements, material & equipment needs — update allocation and arrangement status"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={
                sectionVisible("site_dprs") || sectionVisible("stores_inventory") ||
                sectionVisible("plant_equipment") || sectionVisible("labour_management")
              }
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
