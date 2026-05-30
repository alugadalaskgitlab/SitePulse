import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  FileText, Package, ShoppingCart, Fuel,
  ClipboardList, TrendingUp, ChevronRight,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";

const TODAY = format(new Date(), "yyyy-MM-dd");

function KpiCard({ label, value, sub, highlight }: {
  label: string;
  value?: string | number;
  sub?: string;
  highlight?: "amber" | "green";
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

function ActionTile({
  href, icon: Icon, title, description, accentColor, iconBg, badge, enabled = true,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  accentColor: string;
  iconBg: string;
  badge?: string;
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
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-slate-800 group-hover:text-${accentColor}-600 transition-colors`}>
              {title}
            </h3>
            {badge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-${accentColor}-50 text-${accentColor}-700`}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-all" />
      </a>
    </Link>
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

  const todayDprFiled = dprs.length > 0;
  const pendingIndents = indents.filter((i: any) => i.status === "pending").length;

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
            label="Today's DPR"
            value={!sectionVisible("site_dprs") ? undefined : todayDprFiled ? "Filed" : "Pending"}
            sub={todayDprFiled ? "submitted" : "action needed"}
            highlight={todayDprFiled ? "green" : "amber"}
          />
          <KpiCard
            label="DPRs Today"
            value={sectionVisible("site_dprs") ? dprs.length : undefined}
            sub="submitted"
          />
          <KpiCard
            label="Pending Indents"
            value={sectionVisible("site_procurement") ? pendingIndents : undefined}
            sub="awaiting approval"
            highlight={pendingIndents > 0 ? "amber" : undefined}
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
              href="/site/new"
              icon={FileText}
              title="New Daily Progress Report"
              description="Record today's site progress, labour & equipment"
              accentColor="amber"
              iconBg="bg-amber-100"
              badge={todayDprFiled ? undefined : "Today"}
              enabled={sectionVisible("site_dprs")}
            />
            <ActionTile
              href="/site/dashboard"
              icon={ClipboardList}
              title="DPR History"
              description="View, edit & track all submitted daily progress reports"
              accentColor="teal"
              iconBg="bg-teal-100"
              enabled={sectionVisible("site_dprs")}
            />
            <ActionTile
              href="/site/material-trips"
              icon={Package}
              title="Material Entry"
              description="Log incoming material receipts & deliveries to site"
              accentColor="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("site_materials")}
            />
            <ActionTile
              href="/site/materials-received"
              icon={Package}
              title="Materials Received Report"
              description="Summary of all material receipts across date ranges"
              accentColor="green"
              iconBg="bg-green-100"
              enabled={sectionVisible("site_materials")}
            />
            <ActionTile
              href="/plant/purchase-indents"
              icon={ShoppingCart}
              title="Purchase Indents"
              description="Raise material purchase requests & track approvals"
              accentColor="violet"
              iconBg="bg-violet-100"
              badge={pendingIndents > 0 ? `${pendingIndents} pending` : undefined}
              enabled={sectionVisible("site_procurement")}
            />
            <ActionTile
              href="/plant/diesel-requirements"
              icon={Fuel}
              title="Diesel Requirement"
              description="Submit daily diesel order for site equipment"
              accentColor="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("site_diesel")}
            />
            <ActionTile
              href="/site/purchases"
              icon={TrendingUp}
              title="Site Purchases Report"
              description="Purchases, expenses & procurement analysis for the site"
              accentColor="rose"
              iconBg="bg-rose-100"
              enabled={sectionVisible("site_procurement")}
            />
          </div>
        </div>
      </div>
    </HubShell>
  );
}
