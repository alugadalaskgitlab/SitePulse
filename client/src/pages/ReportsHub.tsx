import { Link } from "wouter";
import {
  FileText, History, TrendingUp, Scale, AlertTriangle,
  Fuel, Droplets, Gauge, Receipt, BarChart3,
  ChevronRight, Building2,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";

function GroupHeading({ label }: { label: string }) {
  return (
    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 mt-6 first:mt-0">
      {label}
    </h3>
  );
}

function ReportTile({
  href, icon: Icon, title, description, enabled = true,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  enabled?: boolean;
}) {
  if (!enabled) return null;
  return (
    <Link href={href}>
      <a
        className="group flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
        data-testid={`tile-${title.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <div className="p-2.5 bg-purple-50 rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
          <Icon className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-slate-800 text-sm group-hover:text-purple-700 transition-colors">
            {title}
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 group-hover:translate-x-0.5 transition-all" />
      </a>
    </Link>
  );
}

export default function ReportsHub() {
  const { sectionVisible } = useAuth();
  const { rmcEnabled } = useFeatureFlags();

  return (
    <HubShell
      title="Reports & Analysis"
      subtitle="Production reports, stock ledgers & finance"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-4xl mx-auto space-y-2">

        {/* Production Reports */}
        <GroupHeading label="Production Reports" />
        <div className="space-y-3">
          <ReportTile
            href="/plant/daily-report"
            icon={FileText}
            title="Today's Plant Report"
            description="Full summary of today's plant activities, production & LDO"
            enabled={sectionVisible("plant_daily_reports")}
          />
          <ReportTile
            href="/plant/daily-reports"
            icon={History}
            title="Plant Daily Reports History"
            description="Browse & export previous daily plant reports as PDF"
            enabled={sectionVisible("plant_daily_reports")}
          />
          <ReportTile
            href="/plant/heating-trends"
            icon={TrendingUp}
            title="Heating Trends"
            description="Analyse bitumen heating patterns & hot-oil temperature trends"
            enabled={sectionVisible("plant_heating")}
          />
          <ReportTile
            href="/plant/rmc/daily-report"
            icon={Building2}
            title="RMC Daily Report"
            description="Ready-mix concrete production summary & delivery statistics"
            enabled={rmcEnabled && sectionVisible("plant_daily_reports")}
          />
        </div>

        {/* Stock & Ledgers */}
        <GroupHeading label="Stock & Ledgers" />
        <div className="space-y-3">
          <ReportTile
            href="/plant/stock"
            icon={Scale}
            title="Stock Balances & Ledger"
            description="Current material stock levels, receipts & issue history"
            enabled={sectionVisible("plant_stock")}
          />
          <ReportTile
            href="/plant/variance-report"
            icon={AlertTriangle}
            title="Variance Report"
            description="Book vs physical stock variance analysis"
            enabled={sectionVisible("plant_variance")}
          />
          <ReportTile
            href="/plant/audit-report"
            icon={BarChart3}
            title="Audit Report"
            description="Full audit trail of stock movements & adjustments"
            enabled={sectionVisible("plant_audit")}
          />
          <ReportTile
            href="/plant/bitumen-stock"
            icon={Droplets}
            title="Bitumen Stock"
            description="Bitumen dip readings, stock reconciliation & usage"
            enabled={sectionVisible("plant_bitumen")}
          />
          <ReportTile
            href="/plant/ldo-flow-meter"
            icon={Gauge}
            title="LDO Flow Meter"
            description="LDO meter readings, consumption vs book reconciliation"
            enabled={sectionVisible("plant_ldo")}
          />
          <ReportTile
            href="/plant/ldo-reconciliation"
            icon={Scale}
            title="LDO Book vs Physical Reconciliation"
            description="Compare book stock against physical dip measurements"
            enabled={sectionVisible("plant_stock")}
          />
        </div>

        {/* Finance & Procurement */}
        <GroupHeading label="Finance & Procurement" />
        <div className="space-y-3">
          <ReportTile
            href="/plant/vendor-bills"
            icon={Receipt}
            title="Vendor Bills"
            description="Equipment, material & labour bills with duplicate detection"
            enabled={sectionVisible("vendor_bills")}
          />
          <ReportTile
            href="/plant/diesel-procurement"
            icon={Fuel}
            title="Diesel Procurement Report"
            description="Diesel purchase history, rates & procurement analysis"
            enabled={sectionVisible("plant_diesel_proc")}
          />
          <ReportTile
            href="/admin/reports"
            icon={BarChart3}
            title="Admin Reports"
            description="Materials received, site purchases & cross-site summaries"
            enabled={sectionVisible("reports")}
          />
          <ReportTile
            href="/admin/management-report"
            icon={TrendingUp}
            title="Management Report"
            description="Cross-site command centre — aggregated KPIs, fuel, labour & finance"
            enabled={sectionVisible("reports") || sectionVisible("admin_settings")}
          />
        </div>

      </div>
    </HubShell>
  );
}
