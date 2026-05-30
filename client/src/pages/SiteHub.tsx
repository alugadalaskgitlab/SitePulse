import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  FileText, Package, ShoppingCart, Fuel, ClipboardList, TrendingUp,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");

function KpiCard({ label, value, sub, highlight }: {
  label: string; value?: string | number; sub?: string; highlight?: "amber" | "green";
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 shadow-sm ${
      highlight === "amber" ? "border-amber-200" :
      highlight === "green" ? "border-green-200" :
      "border-slate-200"
    }`}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${
        highlight === "amber" ? "text-amber-700" :
        highlight === "green" ? "text-green-700" :
        "text-slate-800"
      }`}>
        {value !== undefined ? value : <span className="text-slate-300">—</span>}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
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

  const { data: indents = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents", TODAY],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-indents?dateFrom=${TODAY}&dateTo=${TODAY}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: sectionVisible("site_procurement"),
  });

  const activeSites = new Set(dprs.map((d: any) => d.site).filter(Boolean)).size || (dprs.length > 0 ? 1 : 0);
  const pendingIndents = indents.filter((i: any) => i.status === "pending").length;
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
            label="Pending Indents"
            value={sectionVisible("site_procurement") ? pendingIndents : undefined}
            sub="awaiting approval"
            highlight={pendingIndents > 0 ? "amber" : undefined}
          />
        </div>

        {/* Action tiles */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Operations & Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/site/new"
              icon={FileText}
              title="New Daily Progress Report"
              description="Record today's site progress, labour & equipment"
              accent="amber"
              iconBg="bg-amber-100"
              badge={dprs.length === 0 && sectionVisible("site_dprs") ? "Today" : undefined}
              enabled={sectionVisible("site_dprs")}
            />
            <HubActionTile
              href="/site/dashboard"
              icon={ClipboardList}
              title="DPR History"
              description="View, edit & track all submitted daily progress reports"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={sectionVisible("site_dprs")}
            />
            <HubActionTile
              href="/site/material-trips"
              icon={Package}
              title="Material Entry"
              description="Log incoming material receipts & deliveries to site"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href="/site/materials-received"
              icon={Package}
              title="Materials Received Report"
              description="Summary of all material receipts across date ranges"
              accent="green"
              iconBg="bg-green-100"
              enabled={sectionVisible("site_materials")}
            />
            <HubActionTile
              href="/plant/purchase-indents"
              icon={ShoppingCart}
              title="Purchase Indents"
              description="Raise material purchase requests & track approvals"
              accent="violet"
              iconBg="bg-violet-100"
              badge={pendingIndents > 0 ? `${pendingIndents} pending` : undefined}
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href="/plant/diesel-requirements"
              icon={Fuel}
              title="Diesel Requirement"
              description="Submit daily diesel order for site equipment"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_diesel")}
            />
            <HubActionTile
              href="/site/purchases"
              icon={TrendingUp}
              title="Site Purchases Report"
              description="Purchases, expenses & procurement analysis for the site"
              accent="rose"
              iconBg="bg-rose-100"
              enabled={sectionVisible("site_procurement")}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
