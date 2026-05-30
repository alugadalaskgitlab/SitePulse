import {
  BarChart3, Package, TrendingUp, FileText,
  Fuel, ClipboardList, Layers,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

const HUB = "/reports/hub";

export default function ReportsHub() {
  const { sectionVisible, isAdmin, isManager } = useAuth();
  const canReports = isAdmin || isManager || sectionVisible("reports");

  return (
    <HubShell
      title="Reports & Analysis"
      subtitle="Production, stock & management reports"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Production Reports
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/daily-report?returnTo=${HUB}`}
              icon={BarChart3}
              title="Daily Plant Report"
              description="Complete production summary for any given day"
              accent="orange"
              iconBg="bg-orange-100"
              enabled={sectionVisible("plant_daily_reports")}
            />
            <HubActionTile
              href={`/plant/heating-trends?returnTo=${HUB}`}
              icon={TrendingUp}
              title="Heating Trends"
              description="Boiler efficiency & hot-oil temperature trend analysis"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("plant_heating")}
            />
            <HubActionTile
              href={`/plant/dispatches?returnTo=${HUB}`}
              icon={ClipboardList}
              title="Dispatch Log"
              description="All truck dispatches with mix type, tonnage & destination"
              accent="emerald"
              iconBg="bg-emerald-100"
              enabled={sectionVisible("plant_production")}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Stock & Ledgers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/plant/stock?returnTo=${HUB}`}
              icon={Package}
              title="Material Stock"
              description="Current stock levels, receipts & consumption ledger"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={sectionVisible("plant_materials")}
            />
            <HubActionTile
              href={`/plant/ldo-reconciliation?returnTo=${HUB}`}
              icon={Fuel}
              title="LDO Book Reconciliation"
              description="LDO book-vs-physical reconciliation & audit"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("plant_stock")}
            />
            <HubActionTile
              href={`/plant/variance-report?returnTo=${HUB}`}
              icon={Layers}
              title="Stock Variance Report"
              description="Physical stock audit comparison & variance report"
              accent="violet"
              iconBg="bg-violet-100"
              enabled={sectionVisible("plant_variance")}
            />
            <HubActionTile
              href={`/site/materials-received?returnTo=${HUB}`}
              icon={Package}
              title="Materials Received"
              description="Site material receipts summary across date ranges"
              accent="green"
              iconBg="bg-green-100"
              enabled={sectionVisible("site_materials")}
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Management Reports
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href={`/admin/management-report?returnTo=${HUB}`}
              icon={FileText}
              title="Management Report"
              description="Cross-site summary for project management & stakeholders"
              accent="slate"
              iconBg="bg-slate-100"
              enabled={canReports}
            />
            <HubActionTile
              href={`/site/purchases?returnTo=${HUB}`}
              icon={TrendingUp}
              title="Site Purchases Report"
              description="Purchases & expenses analysis across the site"
              accent="purple"
              iconBg="bg-purple-100"
              enabled={sectionVisible("site_procurement")}
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
