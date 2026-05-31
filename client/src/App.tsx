import { Switch, Route } from "wouter";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { SplashScreen } from "@/components/SplashScreen";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import { useFeatureFlags } from "@/lib/featureFlags";
import type { SectionKey } from "@shared/permissions";
import Login from "@/pages/Login";
import UserManagement from "@/pages/UserManagement";
import DeviceApproval from "@/pages/DeviceApproval";
import Home from "@/pages/Home";
import SiteHome from "@/pages/SiteHome";
import SiteDashboard from "@/pages/SiteDashboard";
import SiteEntry from "@/pages/SiteEntry";
import SiteEdit from "@/pages/SiteEdit";
import SiteSuccess from "@/pages/SiteSuccess";
import SiteReport from "@/pages/SiteReport";
import SiteMaterialTrips from "@/pages/SiteMaterialTrips";
import SiteMaterialsReceived from "@/pages/SiteMaterialsReceived";
import SitePurchasesReport from "@/pages/SitePurchasesReport";
import Plant from "@/pages/Plant";
import PlantHome from "@/pages/PlantHome";
import PlantNew from "@/pages/PlantNew";
import PlantDetails from "@/pages/PlantDetails";
import PlantMaterialReceipts from "@/pages/PlantMaterialReceipts";
import PlantMaterialIssues from "@/pages/PlantMaterialIssues";
import PlantMaterialReturns from "@/pages/PlantMaterialReturns";
import PlantDispatches from "@/pages/PlantDispatches";
import PlantEquipmentUsage from "@/pages/PlantEquipmentUsage";
import PlantGeneratorLogs from "@/pages/PlantGeneratorLogs";
import PlantLdoLogs from "@/pages/PlantLdoLogs";
import PlantStock from "@/pages/PlantStock";
import PlantVarianceReport from "@/pages/PlantVarianceReport";
import PlantAuditReport from "@/pages/PlantAuditReport";
import PlantDieselProcurementReport from "@/pages/PlantDieselProcurementReport";
import PlantBitumenStock from "@/pages/PlantBitumenStock";
import PlantLdoFlowMeter from "@/pages/PlantLdoFlowMeter";
import PlantLdoBackfill from "@/pages/PlantLdoBackfill";
import PlantLdoDipBackfill from "@/pages/PlantLdoDipBackfill";
import PlantStockReassign from "@/pages/PlantStockReassign";
import PlantStockTransfer from "@/pages/PlantStockTransfer";
import PlantLedgerRebuild from "@/pages/PlantLedgerRebuild";
import PlantShiftLogManpowerReview from "@/pages/PlantShiftLogManpowerReview";
import PlantShiftLog from "@/pages/PlantShiftLog";
import PlantDailyReport from "@/pages/PlantDailyReport";
import PlantDailyReports from "@/pages/PlantDailyReports";
import PlantHeatingSessions from "@/pages/PlantHeatingSessions";
import PlantHeatingTrends from "@/pages/PlantHeatingTrends";
import PlantHeatingMismatch from "@/pages/PlantHeatingMismatch";
import PlantLdoMismatch from "@/pages/PlantLdoMismatch";
import PlantLdoReconciliation from "@/pages/PlantLdoReconciliation";
import PurchaseIndents from "@/pages/PurchaseIndents";
import DieselRequirements from "@/pages/DieselRequirements";
import VendorBills from "@/pages/VendorBills";
import RateCards from "@/pages/RateCards";
import DataSync from "@/pages/DataSync";
import AdminSettings from "@/pages/AdminSettings";
import AdminReports from "@/pages/AdminReports";
import ManagementReport from "@/pages/ManagementReport";
import EstimatorLogin from "@/pages/EstimatorLogin";
import EstimatorHub from "@/pages/EstimatorHub";
import MixEstimates from "@/pages/MixEstimates";
import MixImpact from "@/pages/MixImpact";
import MixComparativeReport from "@/pages/MixComparativeReport";
import ScenarioComparison from "@/pages/ScenarioComparison";
import ConcreteEstimates from "@/pages/ConcreteEstimates";
import ConcreteCalculator from "@/pages/ConcreteCalculator";
import ConcreteCalculatorV2 from "@/pages/ConcreteCalculatorV2";
import StoresHome from "@/pages/StoresHome";
import StoresItems from "@/pages/StoresItems";
import StoresGrn from "@/pages/StoresGrn";
import StoresIssue from "@/pages/StoresIssue";
import StoresLedger from "@/pages/StoresLedger";
import PlantMaintenance from "@/pages/PlantMaintenance";
import RmcMixDesigns from "@/pages/RmcMixDesigns";
import RmcBatchRecords from "@/pages/RmcBatchRecords";
import RmcRawMaterials from "@/pages/RmcRawMaterials";
import RmcCubeTests from "@/pages/RmcCubeTests";
import RmcDailyReport from "@/pages/RmcDailyReport";
import RmcDeliveryChallans from "@/pages/RmcDeliveryChallans";
import RmcHub from "@/pages/RmcHub";
import { HubShell } from "@/components/HubShell";
import HmpHub from "@/pages/HmpHub";
import EquipmentHub from "@/pages/EquipmentHub";
import ReportsHub from "@/pages/ReportsHub";
import SiteHub from "@/pages/SiteHub";
import MastersHub from "@/pages/MastersHub";
import SiteBackfill from "@/pages/SiteBackfill";
import StoresHub from "@/pages/StoresHub";
import FinanceHub from "@/pages/FinanceHub";
import AdminMastersHub from "@/pages/AdminMastersHub";
import NotFound from "@/pages/not-found";
function Watermark() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none flex items-center justify-center z-0"
      aria-hidden="true"
    >
      <img 
        src="/sitepulse-logo.png"
        alt="" 
        className="w-64 h-64 md:w-80 md:h-80 object-contain opacity-[0.04]"
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes — login & estimator portal stay outside the auth shell. */}
      <Route path="/login" component={Login} />
      <Route path="/estimator-login" component={EstimatorLogin} />
      <Route path="/estimator-hub" component={EstimatorHub} />
      <Route path="/concrete-calculator" component={ConcreteCalculator} />
      <Route path="/concrete-calculator-v2" component={ConcreteCalculatorV2} />

      {/* Home and hub pages use HubShell (sidebar layout) — no AppHeader wrapper. */}
      <Route path="/">
        <RequireAuth>
          <Home />
        </RequireAuth>
      </Route>
      <Route path="/plant/hub">
        <RequireAuth>
          <HmpHub />
        </RequireAuth>
      </Route>
      <Route path="/equipment/hub">
        <RequireAuth>
          <EquipmentHub />
        </RequireAuth>
      </Route>
      <Route path="/reports/hub">
        <RequireAuth>
          <ReportsHub />
        </RequireAuth>
      </Route>
      <Route path="/site/hub">
        <RequireAuth>
          <SiteHub />
        </RequireAuth>
      </Route>
      <Route path="/admin/hub">
        <RequireAuth>
          <MastersHub />
        </RequireAuth>
      </Route>
      <Route path="/masters/hub">
        <RequireAuth>
          <AdminMastersHub />
        </RequireAuth>
      </Route>
      <Route path="/stores/hub">
        <RequireAuth>
          <StoresHub />
        </RequireAuth>
      </Route>
      <Route path="/finance/hub">
        <RequireAuth>
          <FinanceHub />
        </RequireAuth>
      </Route>
      <Route path="/rmc/hub">
        <RequireAuth>
          <RmcHub />
        </RequireAuth>
      </Route>

      {/* All other authenticated routes get the full shell with AppHeader. */}
      <Route>
        <RequireAuth>
          <AuthedShell />
        </RequireAuth>
      </Route>
    </Switch>
  );
}

// Wrap a page component in a section gate so direct URLs hit the "No access"
// fallback when the user lacks `view` on that section.
function gated(Component: ComponentType<any>, section?: SectionKey) {
  return function GatedRoute(params: any): ReactNode {
    return (
      <RequireAuth section={section}>
        <Component {...params} />
      </RequireAuth>
    );
  };
}

// Grants access when the user has view permission on ANY of the listed sections.
// Used for pages accessible to multiple distinct roles (e.g. reports OR admin_settings).
function gatedEither(Component: ComponentType<any>, ...sections: SectionKey[]) {
  return function GatedEitherRoute(params: any): ReactNode {
    const { sectionVisible, isAdmin } = useAuth();
    const canAccess = isAdmin || sections.some((s) => sectionVisible(s));
    if (!canAccess) {
      return (
        <div className="mx-auto max-w-md text-center py-20 space-y-3">
          <h2 className="text-xl font-semibold">No access</h2>
          <p className="text-sm text-muted-foreground">
            You don't have permission to view this section. Contact an
            administrator if you think this is wrong.
          </p>
        </div>
      );
    }
    return (
      <RequireAuth>
        <Component {...params} />
      </RequireAuth>
    );
  };
}

function AuthedShell() {
  const { rmcEnabled } = useFeatureFlags();
  return (
    <HubShell>
      <Watermark />
      <div className="container mx-auto p-4 md:p-8 pt-6 max-w-7xl">
          <Switch>
            <Route path="/site" component={SiteHome} />
            <Route path="/site/dashboard" component={gated(SiteDashboard, "site_dprs")} />
            <Route path="/site/new" component={gated(SiteEntry, "site_dprs")} />
            <Route path="/site/edit/:id" component={gated(SiteEdit, "site_dprs")} />
            <Route path="/site/success/:id" component={gated(SiteSuccess, "site_dprs")} />
            <Route path="/site/report/:id" component={gated(SiteReport, "site_dprs")} />
            <Route path="/site/material-trips" component={gated(SiteMaterialTrips, "site_materials")} />
            <Route path="/site/materials-received" component={gated(SiteMaterialsReceived, "site_materials")} />
            <Route path="/site/purchases" component={gated(SitePurchasesReport, "site_procurement")} />
            <Route path="/plant" component={PlantHome} />
            <Route path="/plant/dashboard" component={Plant} />
            <Route path="/plant/new" component={gated(PlantNew, "admin_settings")} />
            <Route path="/plant/material-receipts" component={gated(PlantMaterialReceipts, "plant_materials")} />
            <Route path="/plant/material-issues" component={gated(PlantMaterialIssues, "plant_materials")} />
            <Route path="/plant/material-returns" component={gated(PlantMaterialReturns, "plant_materials")} />
            <Route path="/plant/dispatches" component={gated(PlantDispatches, "plant_production")} />
            <Route path="/plant/equipment-usage" component={gated(PlantEquipmentUsage, "plant_equipment")} />
            <Route path="/plant/generator-logs" component={gated(PlantGeneratorLogs, "plant_equipment")} />
            <Route path="/plant/maintenance" component={gated(PlantMaintenance, "plant_equipment")} />
            {rmcEnabled && <Route path="/plant/rmc" component={gated(RmcHub, "plant_production")} />}
            {rmcEnabled && <Route path="/plant/rmc/mix-designs" component={gated(RmcMixDesigns, "plant_production")} />}
            {rmcEnabled && <Route path="/plant/rmc/batch-records" component={gated(RmcBatchRecords, "plant_production")} />}
            {rmcEnabled && <Route path="/plant/rmc/raw-materials" component={gated(RmcRawMaterials, "plant_materials")} />}
            {rmcEnabled && <Route path="/plant/rmc/cube-tests" component={gated(RmcCubeTests, "plant_production")} />}
            {rmcEnabled && <Route path="/plant/rmc/daily-report" component={gated(RmcDailyReport, "plant_daily_reports")} />}
            {rmcEnabled && <Route path="/plant/rmc/delivery-challans" component={gated(RmcDeliveryChallans, "plant_production")} />}
            <Route path="/plant/ldo-logs" component={gated(PlantLdoLogs, "plant_stock")} />
            <Route path="/plant/stock" component={gated(PlantStock, "plant_stock")} />
            <Route path="/plant/variance-report" component={gated(PlantVarianceReport, "plant_variance")} />
            <Route path="/plant/audit-report" component={gated(PlantAuditReport, "plant_audit")} />
            <Route path="/plant/diesel-procurement" component={gated(PlantDieselProcurementReport, "plant_diesel_proc")} />
            <Route path="/plant/bitumen-stock" component={gated(PlantBitumenStock, "plant_bitumen")} />
            <Route path="/plant/ldo-flow-meter" component={gated(PlantLdoFlowMeter, "plant_ldo")} />
            <Route path="/plant/ldo-backfill" component={gated(PlantLdoBackfill, "admin_settings")} />
            <Route path="/plant/ldo-dip-backfill" component={gated(PlantLdoDipBackfill, "admin_settings")} />
            <Route path="/plant/stock-reassign" component={gated(PlantStockReassign, "plant_stock")} />
            <Route path="/plant/stock-transfer" component={gated(PlantStockTransfer, "plant_stock")} />
            <Route path="/plant/ledger-rebuild" component={gated(PlantLedgerRebuild, "plant_stock")} />
            <Route path="/plant/shift-log-manpower-review" component={gated(PlantShiftLogManpowerReview, "plant_shift_logs")} />
            <Route path="/plant/shift-log" component={gated(PlantShiftLog, "plant_shift_logs")} />
            <Route path="/plant/shift-log/:date" component={gated(PlantShiftLog, "plant_shift_logs")} />
            <Route path="/plant/daily-reports" component={gated(PlantDailyReports, "plant_daily_reports")} />
            <Route path="/plant/daily-report" component={gated(PlantDailyReport, "plant_daily_reports")} />
            <Route path="/plant/daily-report/:date" component={gated(PlantDailyReport, "plant_daily_reports")} />
            <Route path="/plant/heating-sessions" component={gated(PlantHeatingSessions, "plant_heating")} />
            <Route path="/plant/heating-sessions/:date" component={gated(PlantHeatingSessions, "plant_heating")} />
            <Route path="/plant/heating-trends" component={gated(PlantHeatingTrends, "plant_heating")} />
            <Route path="/plant/heating-mismatch/:date" component={gated(PlantHeatingMismatch, "plant_heating")} />
            <Route path="/plant/ldo-mismatch/:date" component={gated(PlantLdoMismatch, "plant_heating")} />
            <Route path="/plant/ldo-reconciliation" component={gated(PlantLdoReconciliation, "plant_stock")} />
            <Route path="/plant/purchase-indents" component={gated(PurchaseIndents, "site_procurement")} />
            <Route path="/plant/diesel-requirements" component={gated(DieselRequirements, "site_diesel")} />
            <Route path="/plant/vendor-bills" component={gated(VendorBills, "vendor_bills")} />
            <Route path="/plant/rate-cards" component={gated(RateCards, "admin_settings")} />
            <Route path="/plant/data-sync" component={gated(DataSync, "admin_settings")} />
            <Route path="/plant/:id" component={gated(PlantDetails, "admin_settings")} />
            <Route path="/stores" component={gated(StoresHome, "stores_inventory")} />
            <Route path="/stores/items" component={gated(StoresItems, "stores_inventory")} />
            <Route path="/stores/grns" component={gated(StoresGrn, "stores_inventory")} />
            <Route path="/stores/grns/new" component={gated(() => <StoresGrn isNew />, "stores_inventory")} />
            <Route path="/stores/grns/:id" component={gated((p: any) => <StoresGrn detailId={parseInt(p.id)} />, "stores_inventory")} />
            <Route path="/stores/issues" component={gated(StoresIssue, "stores_inventory")} />
            <Route path="/stores/issues/new" component={gated(() => <StoresIssue isNew />, "stores_inventory")} />
            <Route path="/stores/issues/:id" component={gated((p: any) => <StoresIssue detailId={parseInt(p.id)} />, "stores_inventory")} />
            <Route path="/stores/ledger/:itemId" component={gated(StoresLedger, "stores_inventory")} />
            <Route path="/admin/site-backfill" component={gated(SiteBackfill, "admin_settings")} />
            <Route path="/admin/settings" component={gated(AdminSettings, "admin_settings")} />
            <Route path="/admin/users" component={gated(UserManagement, "user_management")} />
            <Route path="/admin/devices" component={gated(DeviceApproval, "device_approval")} />
            <Route path="/admin/reports" component={gated(AdminReports, "reports")} />
            <Route path="/admin/management-report" component={gatedEither(ManagementReport, "reports", "admin_settings")} />
            <Route path="/admin/mix-estimates" component={gated(MixEstimates, "reports")} />
            <Route path="/admin/mix-impact" component={gated(MixImpact, "reports")} />
            <Route path="/admin/mix-comparison" component={gated(MixComparativeReport, "reports")} />
            <Route path="/admin/scenario-comparison" component={gated(ScenarioComparison, "reports")} />
            <Route path="/admin/concrete-estimates" component={gated(ConcreteEstimates, "reports")} />
            <Route component={NotFound} />
          </Switch>
        </div>
    </HubShell>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem("sp_splash_shown")) return false;
    sessionStorage.setItem("sp_splash_shown", "1");
    return true;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Toaster />
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        <Router />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
