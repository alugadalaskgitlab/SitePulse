import {
  BarChart3, Package, TrendingUp, FileText,
  Receipt, Fuel, ClipboardList, Layers,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";

export default function ReportsHub() {
  const { sectionVisible, isAdmin, isManager } = useAuth();
  const canReports = isAdmin || isManager || sectionVisible("reports");

  return (
    <HubShell
      title="Reports & Analysis"
      subtitle="Production, stock, finance & procurement reports"
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
              href="/plant/daily-report"
              icon={BarChart3}
              title="Daily Plant Report"
              description="Complete production summary for any given day"
              accent="orange"
              iconBg="bg-orange-100"
              enabled={sectionVisible("plant_daily_reports")}
            />
            <HubActionTile
              href="/plant/heating-trends"
              icon={TrendingUp}
              title="Heating Trends"
              description="Boiler efficiency & hot-oil temperature trend analysis"
              accent="amber"
              iconBg="bg-amber-100"
              enabled={sectionVisible("plant_heating")}
            />
            <HubActionTile
              href="/plant/dispatches"
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
              href="/plant/stock"
              icon={Package}
              title="Material Stock"
              description="Current stock levels, receipts & consumption ledger"
              accent="teal"
              iconBg="bg-teal-100"
              enabled={sectionVisible("plant_materials")}
            />
            <HubActionTile
              href="/plant/ldo-reconciliation"
              icon={Fuel}
              title="LDO Book Reconciliation"
              description="LDO book-vs-physical reconciliation & audit"
              accent="blue"
              iconBg="bg-blue-100"
              enabled={sectionVisible("plant_stock")}
            />
            <HubActionTile
              href="/plant/variance-report"
              icon={Layers}
              title="Stock Variance Report"
              description="Physical stock audit comparison & variance report"
              accent="violet"
              iconBg="bg-violet-100"
              enabled={sectionVisible("plant_variance")}
            />
            <HubActionTile
              href="/site/materials-received"
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
            Finance & Procurement
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HubActionTile
              href="/plant/vendor-bills"
              icon={Receipt}
              title="Vendor Bills"
              description="All vendor billing records with approval status"
              accent="rose"
              iconBg="bg-rose-100"
              enabled={sectionVisible("plant_finance")}
            />
            <HubActionTile
              href="/site/purchases"
              icon={TrendingUp}
              title="Site Purchases Report"
              description="Purchases & expenses analysis across the site"
              accent="purple"
              iconBg="bg-purple-100"
              enabled={sectionVisible("site_procurement")}
            />
            <HubActionTile
              href="/admin/management-report"
              icon={FileText}
              title="Management Report"
              description="High-level summary for project management & stakeholders"
              accent="slate"
              iconBg="bg-slate-100"
              enabled={canReports}
            />
          </div>
        </div>

      </div>
    </HubShell>
  );
}
