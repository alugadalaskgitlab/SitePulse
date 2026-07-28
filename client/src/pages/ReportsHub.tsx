import {
  BarChart3, Package, TrendingUp, FileText,
  Fuel, ClipboardList, Scale, Truck,
  Users, ShoppingCart, Receipt, FlaskConical,
} from "lucide-react";
import { HubShell } from "@/components/HubShell";
import { HubActionTile } from "@/components/HubActionTile";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";

const HUB = "/reports/hub";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
      {children}
    </h2>
  );
}

export default function ReportsHub() {
  const { sectionVisible, isAdmin, isManager } = useAuth();
  const { rmcEnabled } = useFeatureFlags();

  const canReports    = isAdmin || isManager || sectionVisible("reports");
  const canDailyRep   = sectionVisible("plant_daily_reports");
  const canSiteDprs   = sectionVisible("site_dprs");
  const canHeating    = sectionVisible("plant_heating");
  const canProd       = sectionVisible("plant_production");
  const canDieselProc = sectionVisible("plant_diesel_proc");
  const canShift      = sectionVisible("plant_shift_logs");
  const canSiteMat    = sectionVisible("site_materials");
  const canSiteProcure = sectionVisible("site_procurement") || sectionVisible("purchase_indents_view") || sectionVisible("purchase_indents_raise") || sectionVisible("purchase_indents_approve");
  const canMaterials  = sectionVisible("plant_materials");
  const canStock      = sectionVisible("plant_stock");
  const canVariance   = sectionVisible("plant_variance");
  const canAudit      = sectionVisible("plant_audit");
  const canDieselReq  = sectionVisible("site_diesel") || sectionVisible("diesel_req_view") || sectionVisible("diesel_req_raise") || sectionVisible("diesel_req_approve");
  const canBills      = sectionVisible("vendor_bills") || sectionVisible("vendor_bills_view") || sectionVisible("vendor_bills_raise") || sectionVisible("vendor_bills_verify") || sectionVisible("vendor_bills_approve");

  const hasSiteReports  = canSiteDprs || canSiteMat || canSiteProcure || canReports;
  const hasHmpReports   = canDailyRep || canHeating || canProd || canDieselProc || canShift;
  const hasRmcReports   = rmcEnabled && canProd;
  const hasStockReports = canMaterials || canStock || canVariance || canAudit;
  const hasProcReports  = canSiteProcure || canDieselReq || canBills;

  return (
    <HubShell
      title="Reports & Analysis"
      subtitle="Site, HMP, RMC, stock & procurement reports"
      backHref="/"
      backLabel="Dashboard"
    >
      <div className="p-6 max-w-5xl mx-auto space-y-8">

        {/* Site Reports */}
        {hasSiteReports && (
          <div>
            <SectionHeading>Site Reports</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href="/site/dashboard?returnTo=/reports/hub"
                icon={BarChart3}
                title="Daily DPR"
                description="Complete production summary for any given day"
                accent="orange"
                iconBg="bg-orange-100"
                enabled={canSiteDprs}
              />
              <HubActionTile
                href={`/site/materials-received?returnTo=${HUB}`}
                icon={Package}
                title="Materials Received"
                description="Site material receipts summary across date ranges"
                accent="green"
                iconBg="bg-green-100"
                enabled={canSiteMat}
              />
              <HubActionTile
                href={`/site/purchases?returnTo=${HUB}`}
                icon={TrendingUp}
                title="Site Purchases Report"
                description="Purchases & expenses analysis across the site"
                accent="purple"
                iconBg="bg-purple-100"
                enabled={canSiteProcure}
              />
              <HubActionTile
                href={`/admin/management-report?returnTo=${HUB}`}
                icon={FileText}
                title="Management Report"
                description="Cross-site summary for project management & stakeholders"
                accent="slate"
                iconBg="bg-slate-100"
                enabled={canReports}
              />
            </div>
          </div>
        )}

        {/* HMP Reports */}
        {hasHmpReports && (
          <div>
            <SectionHeading>HMP Reports</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/daily-reports?returnTo=${HUB}`}
                icon={BarChart3}
                title="Daily Plant Reports"
                description="Production summaries with mix-wise breakdowns and PDF export"
                accent="orange"
                iconBg="bg-orange-100"
                enabled={canDailyRep}
              />
              <HubActionTile
                href={`/plant/heating-trends?returnTo=${HUB}`}
                icon={TrendingUp}
                title="Heating Trends"
                description="Boiler efficiency & hot-oil temperature trend analysis"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canHeating}
              />
              <HubActionTile
                href={`/plant/dispatches?returnTo=${HUB}`}
                icon={Truck}
                title="Dispatch Log"
                description="All truck dispatches with mix type, tonnage & destination"
                accent="emerald"
                iconBg="bg-emerald-100"
                enabled={canProd}
              />
              <HubActionTile
                href={`/plant/diesel-procurement?returnTo=${HUB}`}
                icon={Fuel}
                title="Diesel Procurement"
                description="Diesel purchase and consumption summary report"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canDieselProc}
              />
              <HubActionTile
                href={`/plant/shift-log-manpower-review?returnTo=${HUB}`}
                icon={Users}
                title="Manpower Review"
                description="Contractor-wise manpower review across shift logs"
                accent="slate"
                iconBg="bg-slate-100"
                enabled={canShift}
              />
            </div>
          </div>
        )}

        {/* RMC Reports — only shown when rmcEnabled and user has plant_production access */}
        {hasRmcReports && (
          <div>
            <SectionHeading>RMC Reports</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/rmc/daily-report?returnTo=${HUB}`}
                icon={FileText}
                title="RMC Daily Report"
                description="Day-wise RMC production summary with grades, materials & cube tests"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canProd}
              />
              <HubActionTile
                href={`/plant/rmc/batch-records?returnTo=${HUB}`}
                icon={FlaskConical}
                title="RMC Batch Records"
                description="Concrete batch dispatches — grades, volumes & delivery challans"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canProd}
              />
            </div>
          </div>
        )}

        {/* Stock & Ledgers */}
        {hasStockReports && (
          <div>
            <SectionHeading>Stock & Ledgers</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/stock?returnTo=${HUB}`}
                icon={Package}
                title="Material Stock"
                description="Current HMP stock levels, receipts & consumption ledger"
                accent="teal"
                iconBg="bg-teal-100"
                enabled={canMaterials}
              />
              <HubActionTile
                href={`/plant/ldo-reconciliation?returnTo=${HUB}`}
                icon={Fuel}
                title="LDO Book Reconciliation"
                description="LDO book-vs-physical reconciliation & audit"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canStock}
              />
              <HubActionTile
                href={`/plant/variance-report?returnTo=${HUB}`}
                icon={Scale}
                title="Stock Variance Report"
                description="Theoretical vs actual material consumption variance"
                accent="violet"
                iconBg="bg-violet-100"
                enabled={canVariance}
              />
              <HubActionTile
                href={`/plant/audit-report?returnTo=${HUB}`}
                icon={BarChart3}
                title="Audit Report"
                description="Stock audit trails and adjustment history"
                accent="purple"
                iconBg="bg-purple-100"
                enabled={canAudit}
              />
            </div>
          </div>
        )}

        {/* Procurement & Billing */}
        {hasProcReports && (
          <div>
            <SectionHeading>Procurement & Billing</SectionHeading>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <HubActionTile
                href={`/plant/purchase-indents?returnTo=${HUB}&context=reports`}
                icon={ShoppingCart}
                title="Purchase Indents"
                description="View and approve purchase indents across all sites"
                accent="blue"
                iconBg="bg-blue-100"
                enabled={canSiteProcure}
              />
              <HubActionTile
                href={`/plant/diesel-requirements?returnTo=${HUB}`}
                icon={Fuel}
                title="Daily Diesel Requirements"
                description="View and approve daily diesel requirement requests"
                accent="amber"
                iconBg="bg-amber-100"
                enabled={canDieselReq}
              />
              <HubActionTile
                href={`/finance/vendor-bills?returnTo=${HUB}`}
                icon={Receipt}
                title="Vendor Bills"
                description="Equipment, material, transport & labour bills — review and approve"
                accent="rose"
                iconBg="bg-rose-100"
                enabled={canBills}
              />
            </div>
          </div>
        )}

      </div>
    </HubShell>
  );
}
