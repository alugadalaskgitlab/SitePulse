import { Switch, Route } from "wouter";
import { useState, lazy, Suspense } from "react";
import type { ComponentType, ReactNode } from "react";
import { SplashScreen } from "@/components/SplashScreen";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import RequireAuth from "@/components/RequireAuth";
import { useFeatureFlags } from "@/lib/featureFlags";
import type { SectionKey } from "@shared/permissions";
import { HubShell } from "@/components/HubShell";

// ── Core pages (kept eager: always needed on first render) ───────────────────
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

// ── Lazy page imports ────────────────────────────────────────────────────────

// Auth / account
const UserManagement    = lazy(() => import("@/pages/UserManagement"));
const DeviceApproval    = lazy(() => import("@/pages/DeviceApproval"));
const Account           = lazy(() => import("@/pages/Account"));
const NotificationPreferences = lazy(() => import("@/pages/NotificationPreferences"));
const EditRequestsPage  = lazy(() => import("@/pages/EditRequestsPage"));

// Home / hubs
const Home              = lazy(() => import("@/pages/Home"));
const HmpHub            = lazy(() => import("@/pages/HmpHub"));
const EquipmentHub      = lazy(() => import("@/pages/EquipmentHub"));
const ReportsHub        = lazy(() => import("@/pages/ReportsHub"));
const SiteHub           = lazy(() => import("@/pages/SiteHub"));
const MastersHub        = lazy(() => import("@/pages/MastersHub"));
const AdminMastersHub   = lazy(() => import("@/pages/AdminMastersHub"));
const StoresHub         = lazy(() => import("@/pages/StoresHub"));
const FinanceHub        = lazy(() => import("@/pages/FinanceHub"));
const RmcHub            = lazy(() => import("@/pages/RmcHub"));

// Site pages
const SiteHome              = lazy(() => import("@/pages/SiteHome"));
const SiteDashboard         = lazy(() => import("@/pages/SiteDashboard"));
const SiteEntry             = lazy(() => import("@/pages/SiteEntry"));
const SiteEdit              = lazy(() => import("@/pages/SiteEdit"));
const SiteMaterialStock     = lazy(() => import("@/pages/SiteMaterialStock"));
const SiteSuccess           = lazy(() => import("@/pages/SiteSuccess"));
const SiteReport            = lazy(() => import("@/pages/SiteReport"));
const SiteMaterialTrips     = lazy(() => import("@/pages/SiteMaterialTrips"));
const SiteMaterialsReceived = lazy(() => import("@/pages/SiteMaterialsReceived"));
const SitePurchasesReport   = lazy(() => import("@/pages/SitePurchasesReport"));
const SiteRequirementNew    = lazy(() => import("@/pages/SiteRequirementNew"));
const SiteRequirementsList  = lazy(() => import("@/pages/SiteRequirementsList"));
const MyPlans               = lazy(() => import("@/pages/MyPlans"));
const SiteBackfill          = lazy(() => import("@/pages/SiteBackfill"));

// Plant pages
const Plant                         = lazy(() => import("@/pages/Plant"));
const PlantHome                     = lazy(() => import("@/pages/PlantHome"));
const PlantNew                      = lazy(() => import("@/pages/PlantNew"));
const PlantDetails                  = lazy(() => import("@/pages/PlantDetails"));
const PlantMaterialReceipts         = lazy(() => import("@/pages/PlantMaterialReceipts"));
const PlantMaterialIssues           = lazy(() => import("@/pages/PlantMaterialIssues"));
const PlantMaterialReturns          = lazy(() => import("@/pages/PlantMaterialReturns"));
const PlantDispatches               = lazy(() => import("@/pages/PlantDispatches"));
const PlantEquipmentUsage           = lazy(() => import("@/pages/PlantEquipmentUsage"));
const PlantGeneratorLogs            = lazy(() => import("@/pages/PlantGeneratorLogs"));
const PlantStock                    = lazy(() => import("@/pages/PlantStock"));
const PlantVarianceReport           = lazy(() => import("@/pages/PlantVarianceReport"));
const PlantAuditReport              = lazy(() => import("@/pages/PlantAuditReport"));
const PlantDieselProcurementReport  = lazy(() => import("@/pages/PlantDieselProcurementReport"));
const PlantBitumenStock             = lazy(() => import("@/pages/PlantBitumenStock"));
const PlantLdoFlowMeter             = lazy(() => import("@/pages/PlantLdoFlowMeter"));
const PlantLdoBackfill              = lazy(() => import("@/pages/PlantLdoBackfill"));
const PlantLdoDipBackfill           = lazy(() => import("@/pages/PlantLdoDipBackfill"));
const PlantStockReassign            = lazy(() => import("@/pages/PlantStockReassign"));
const PlantStockTransfer            = lazy(() => import("@/pages/PlantStockTransfer"));
const PlantLedgerRebuild            = lazy(() => import("@/pages/PlantLedgerRebuild"));
const PlantShiftLogManpowerReview   = lazy(() => import("@/pages/PlantShiftLogManpowerReview"));
const PlantShiftLog                 = lazy(() => import("@/pages/PlantShiftLog"));
const PlantDailyReport              = lazy(() => import("@/pages/PlantDailyReport"));
const PlantDailyReports             = lazy(() => import("@/pages/PlantDailyReports"));
const PlantHeatingSessions          = lazy(() => import("@/pages/PlantHeatingSessions"));
const PlantHeatingTrends            = lazy(() => import("@/pages/PlantHeatingTrends"));
const PlantProjectReport            = lazy(() => import("@/pages/PlantProjectReport"));
const PlantHeatingMismatch          = lazy(() => import("@/pages/PlantHeatingMismatch"));
const PlantLdoMismatch              = lazy(() => import("@/pages/PlantLdoMismatch"));
const PlantLdoReconciliation        = lazy(() => import("@/pages/PlantLdoReconciliation"));
const PlantMaintenance              = lazy(() => import("@/pages/PlantMaintenance"));
const PlantMasters                  = lazy(() => import("@/pages/PlantMasters"));

// RMC pages
const RmcMixDesigns       = lazy(() => import("@/pages/RmcMixDesigns"));
const RmcBatchRecords     = lazy(() => import("@/pages/RmcBatchRecords"));
const RmcRawMaterials     = lazy(() => import("@/pages/RmcRawMaterials"));
const RmcCubeTests        = lazy(() => import("@/pages/RmcCubeTests"));
const RmcDailyReport      = lazy(() => import("@/pages/RmcDailyReport"));
const RmcDeliveryChallans = lazy(() => import("@/pages/RmcDeliveryChallans"));

// Stores pages
const StoresHome   = lazy(() => import("@/pages/StoresHome"));
const StoresItems  = lazy(() => import("@/pages/StoresItems"));
const StoresGrn    = lazy(() => import("@/pages/StoresGrn"));
const StoresIssue  = lazy(() => import("@/pages/StoresIssue"));
const StoresLedger = lazy(() => import("@/pages/StoresLedger"));

// Finance / procurement pages
const PurchaseIndents    = lazy(() => import("@/pages/PurchaseIndents"));
const DieselRequirements = lazy(() => import("@/pages/DieselRequirements"));
const VendorBills        = lazy(() => import("@/pages/VendorBills"));
const RateCards          = lazy(() => import("@/pages/RateCards"));

// Admin pages
const AdminSettings    = lazy(() => import("@/pages/AdminSettings"));
const AdminReports     = lazy(() => import("@/pages/AdminReports"));
const ManagementReport = lazy(() => import("@/pages/ManagementReport"));
const DataSync         = lazy(() => import("@/pages/DataSync"));

// IRN pages
const IrnListPage   = lazy(() => import("@/pages/irn/IrnListPage"));
const IrnRaisePage  = lazy(() => import("@/pages/irn/IrnRaisePage"));
const IrnDetailPage = lazy(() => import("@/pages/irn/IrnDetailPage"));

// BOQ / Work Programme pages
const BoqProjects        = lazy(() => import("@/pages/BoqProjects"));
const BoqProjectDetail   = lazy(() => import("@/pages/BoqProjectDetail"));
const BoqProgramSettings = lazy(() => import("@/pages/BoqProgramSettings"));
const WorkProgramme      = lazy(() => import("@/pages/WorkProgramme"));
const WorkDemand         = lazy(() => import("@/pages/WorkDemand"));
const ResourceReview     = lazy(() => import("@/pages/ResourceReview"));
const PlanningMasters    = lazy(() => import("@/pages/PlanningMasters"));
const BoqItemReview      = lazy(() => import("@/pages/BoqItemReview"));
const NormsLibrary       = lazy(() => import("@/pages/NormsLibrary"));

// Estimator / calculator pages
const EstimatorLogin         = lazy(() => import("@/pages/EstimatorLogin"));
const EstimatorHub           = lazy(() => import("@/pages/EstimatorHub"));
const MixEstimates           = lazy(() => import("@/pages/MixEstimates"));
const MixImpact              = lazy(() => import("@/pages/MixImpact"));
const MixComparativeReport   = lazy(() => import("@/pages/MixComparativeReport"));
const ScenarioComparison     = lazy(() => import("@/pages/ScenarioComparison"));
const ConcreteEstimates      = lazy(() => import("@/pages/ConcreteEstimates"));
const ConcreteCalculator     = lazy(() => import("@/pages/ConcreteCalculator"));
const ConcreteCalculatorV2   = lazy(() => import("@/pages/ConcreteCalculatorV2"));

// ── Loading fallback ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] text-sm text-slate-400">
      Loading page…
    </div>
  );
}

// ── Feature flag ─────────────────────────────────────────────────────────────
const WP_ENABLED = import.meta.env.VITE_ENABLE_WORK_PROGRAM === "true";

// ── Permission helpers ───────────────────────────────────────────────────────

function gated(Component: ComponentType<any>, section?: SectionKey) {
  return function GatedRoute(params: any): ReactNode {
    return (
      <RequireAuth section={section}>
        <Component {...params} />
      </RequireAuth>
    );
  };
}

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

// ── Router ───────────────────────────────────────────────────────────────────
function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public routes */}
        <Route path="/login" component={Login} />
        <Route path="/estimator-login" component={EstimatorLogin} />
        <Route path="/estimator-hub" component={EstimatorHub} />
        <Route path="/concrete-calculator" component={ConcreteCalculator} />
        <Route path="/concrete-calculator-v2" component={ConcreteCalculatorV2} />
        <Route path="/admin/mix-estimates" component={MixEstimates} />
        <Route path="/admin/mix-impact" component={MixImpact} />
        <Route path="/admin/mix-comparison" component={MixComparativeReport} />
        <Route path="/admin/scenario-comparison" component={ScenarioComparison} />

        {/* Hub pages (HubShell layout) */}
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
        <Route path="/equipment/hub" component={gatedEither(EquipmentHub, "equipment_hub", "plant_equipment")} />
        <Route path="/reports/hub" component={gated(ReportsHub, "reports_hub")} />
        <Route path="/site/hub" component={gated(SiteHub, "site_hub")} />
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
        <Route path="/stores/hub" component={gatedEither(StoresHub, "stores_hub", "stores_inventory")} />
        <Route path="/finance/hub" component={gated(FinanceHub, "finance_hub")} />
        <Route path="/rmc/hub">
          <RequireAuth>
            <RmcHub />
          </RequireAuth>
        </Route>

        {/* All other authenticated routes */}
        <Route>
          <RequireAuth>
            <AuthedShell />
          </RequireAuth>
        </Route>
      </Switch>
    </Suspense>
  );
}

// ── Authed shell (inner routes) ───────────────────────────────────────────────
function AuthedShell() {
  const { rmcEnabled } = useFeatureFlags();
  return (
    <HubShell>
      <div className="container mx-auto p-4 md:p-8 pt-6 max-w-7xl">
        <Switch>
          {/* Site pages */}
          <Route path="/site" component={SiteHome} />
          <Route path="/site/dashboard" component={gated(SiteDashboard, "site_dprs")} />
          <Route path="/site/new" component={gated(SiteEntry, "site_dprs")} />
          <Route path="/site/edit/:id" component={gated(SiteEdit, "site_dprs")} />
          <Route path="/site/success/:id" component={gated(SiteSuccess, "site_dprs")} />
          <Route path="/site/report/:id" component={gated(SiteReport, "site_dprs")} />
          <Route path="/site/material-trips" component={gated(SiteMaterialTrips, "site_materials")} />
          <Route path="/site/materials-received" component={gated(SiteMaterialsReceived, "site_materials")} />
          <Route path="/site/material-stock" component={gated(SiteMaterialStock, "site_materials")} />
          <Route path="/site/purchases" component={gatedEither(SitePurchasesReport, "report_site_purchases", "site_procurement")} />
          <Route path="/site/requirements/new" component={gated(SiteRequirementNew, "site_dprs")} />
          <Route path="/site/requirements" component={gatedEither(SiteRequirementsList, "site_dprs", "stores_inventory", "plant_equipment", "labour_management")} />
          <Route path="/my-plans" component={gated(MyPlans, "site_dprs")} />

          {/* Plant pages */}
          <Route path="/plant" component={PlantHome} />
          <Route path="/plant/dashboard" component={Plant} />
          <Route path="/plant/new" component={gatedEither(PlantNew, "site_management", "admin_settings")} />
          <Route path="/plant/material-receipts" component={gated(PlantMaterialReceipts, "plant_materials")} />
          <Route path="/plant/material-issues" component={gated(PlantMaterialIssues, "plant_materials")} />
          <Route path="/plant/material-returns" component={gated(PlantMaterialReturns, "plant_materials")} />
          <Route path="/plant/dispatches" component={gated(PlantDispatches, "plant_production")} />
          <Route path="/plant/equipment-usage" component={gated(PlantEquipmentUsage, "plant_equipment")} />
          <Route path="/plant/generator-logs" component={gatedEither(PlantGeneratorLogs, "plant_generator_logs", "plant_equipment")} />
          <Route path="/plant/maintenance" component={gatedEither(PlantMaintenance, "plant_maintenance", "plant_equipment")} />
          {rmcEnabled && <Route path="/plant/rmc" component={gatedEither(RmcHub, "rmc_operations", "rmc_batch_records", "plant_production")} />}
          {rmcEnabled && <Route path="/plant/rmc/mix-designs" component={gatedEither(RmcMixDesigns, "rmc_mix_designs", "rmc_operations", "plant_production")} />}
          {rmcEnabled && <Route path="/plant/rmc/batch-records" component={gatedEither(RmcBatchRecords, "rmc_batch_records", "rmc_operations", "plant_production")} />}
          {rmcEnabled && <Route path="/plant/rmc/raw-materials" component={gatedEither(RmcRawMaterials, "rmc_raw_materials", "rmc_operations", "plant_materials")} />}
          {rmcEnabled && <Route path="/plant/rmc/cube-tests" component={gatedEither(RmcCubeTests, "rmc_cube_tests", "rmc_operations", "plant_production")} />}
          {rmcEnabled && <Route path="/plant/rmc/daily-report" component={gatedEither(RmcDailyReport, "rmc_daily_report", "plant_daily_reports")} />}
          {rmcEnabled && <Route path="/plant/rmc/delivery-challans" component={gatedEither(RmcDeliveryChallans, "rmc_delivery_challans", "rmc_operations", "plant_production")} />}
          <Route path="/plant/stock" component={gatedEither(PlantStock, "plant_stock", "plant_materials")} />
          <Route path="/plant/variance-report" component={gated(PlantVarianceReport, "plant_variance")} />
          <Route path="/plant/audit-report" component={gated(PlantAuditReport, "plant_audit")} />
          <Route path="/plant/diesel-procurement" component={gated(PlantDieselProcurementReport, "plant_diesel_proc")} />
          <Route path="/plant/bitumen-stock" component={gated(PlantBitumenStock, "plant_bitumen")} />
          <Route path="/plant/ldo-flow-meter" component={gated(PlantLdoFlowMeter, "plant_ldo")} />
          <Route path="/plant/ldo-backfill" component={gatedEither(PlantLdoBackfill, "admin_ldo_tools", "admin_settings")} />
          <Route path="/plant/ldo-dip-backfill" component={gatedEither(PlantLdoDipBackfill, "admin_ldo_tools", "admin_settings")} />
          <Route path="/plant/stock-reassign" component={gatedEither(PlantStockReassign, "admin_ledger_tools", "plant_stock")} />
          <Route path="/plant/stock-transfer" component={gatedEither(PlantStockTransfer, "admin_ledger_tools", "plant_stock")} />
          <Route path="/plant/ledger-rebuild" component={gatedEither(PlantLedgerRebuild, "admin_ledger_tools", "plant_stock")} />
          <Route path="/plant/shift-log-manpower-review" component={gatedEither(PlantShiftLogManpowerReview, "plant_manpower_review", "plant_shift_logs")} />
          <Route path="/plant/shift-log" component={gated(PlantShiftLog, "plant_shift_logs")} />
          <Route path="/plant/shift-log/:date" component={gated(PlantShiftLog, "plant_shift_logs")} />
          <Route path="/plant/daily-reports" component={gated(PlantDailyReports, "plant_daily_reports")} />
          <Route path="/plant/daily-report" component={gated(PlantDailyReport, "plant_daily_reports")} />
          <Route path="/plant/daily-report/:date" component={gated(PlantDailyReport, "plant_daily_reports")} />
          <Route path="/plant/heating-sessions" component={gated(PlantHeatingSessions, "plant_heating")} />
          <Route path="/plant/heating-sessions/:date" component={gated(PlantHeatingSessions, "plant_heating")} />
          <Route path="/plant/heating-trends" component={gatedEither(PlantHeatingTrends, "plant_heating_trends", "plant_heating")} />
          <Route path="/plant/dispatch-summary" component={gatedEither(PlantProjectReport, "plant_daily_reports", "plant_production")} />
          <Route path="/plant/heating-mismatch/:date" component={gated(PlantHeatingMismatch, "plant_heating")} />
          <Route path="/plant/ldo-mismatch/:date" component={gated(PlantLdoMismatch, "plant_heating")} />
          <Route path="/plant/ldo-reconciliation" component={gatedEither(PlantLdoReconciliation, "plant_ldo_reconciliation", "plant_stock")} />

          {/* Finance / procurement pages */}
          <Route path="/plant/purchase-indents" component={gatedEither(PurchaseIndents, "purchase_indents_view", "site_procurement")} />
          <Route path="/plant/diesel-requirements" component={gatedEither(DieselRequirements, "diesel_req_view", "site_diesel")} />
          <Route path="/plant/vendor-bills" component={gatedEither(VendorBills, "vendor_bills_view", "vendor_bills")} />
          <Route path="/finance/vendor-bills" component={gatedEither(VendorBills, "vendor_bills_view", "vendor_bills")} />
          <Route path="/plant/rate-cards" component={gatedEither(RateCards, "rate_cards", "admin_settings")} />
          <Route path="/plant/data-sync" component={gatedEither(DataSync, "data_sync", "admin_settings")} />
          <Route path="/plant/:id" component={gatedEither(PlantDetails, "site_management", "admin_settings")} />

          {/* IRN pages */}
          <Route path="/irn" component={gatedEither(IrnListPage, "irn_view", "irn_raise")} />
          <Route path="/irn/new" component={gated(IrnRaisePage, "irn_raise")} />
          <Route path="/irn/:id" component={gatedEither(IrnDetailPage, "irn_view", "irn_raise")} />

          {/* BOQ / Work Programme pages */}
          {WP_ENABLED && <Route path="/work-program" component={gated(BoqProjects, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/planning-masters" component={gated(PlanningMasters, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/:id" component={gated(BoqProjectDetail, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/:id/settings" component={gated(BoqProgramSettings, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/:id/programme" component={gated(WorkProgramme, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/:id/demand" component={gated(WorkDemand, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/:id/resource-review" component={gated(ResourceReview, "qto_boq")} />}
          {WP_ENABLED && <Route path="/work-program/:id/item-review" component={gated(BoqItemReview, "qto_boq")} />}
          {WP_ENABLED && <Route path="/norms" component={gated(NormsLibrary, "qto_boq")} />}

          {/* Stores pages */}
          <Route path="/stores" component={gated(StoresHome, "stores_inventory")} />
          <Route path="/stores/items" component={gated(StoresItems, "stores_inventory")} />
          <Route path="/stores/grns" component={gated(StoresGrn, "stores_inventory")} />
          <Route path="/stores/grns/new" component={gated(() => <StoresGrn isNew />, "stores_inventory")} />
          <Route path="/stores/grns/:id" component={gated((p: any) => <StoresGrn detailId={parseInt(p.id)} />, "stores_inventory")} />
          <Route path="/stores/issues" component={gated(StoresIssue, "stores_inventory")} />
          <Route path="/stores/issues/new" component={gated(() => <StoresIssue isNew />, "stores_inventory")} />
          <Route path="/stores/issues/:id" component={gated((p: any) => <StoresIssue detailId={parseInt(p.id)} />, "stores_inventory")} />
          <Route path="/stores/ledger/:itemId" component={gated(StoresLedger, "stores_inventory")} />

          {/* Admin pages */}
          <Route path="/admin/site-backfill" component={gatedEither(SiteBackfill, "site_management", "admin_settings")} />
          <Route path="/admin/settings" component={gated(AdminSettings, "admin_settings")} />
          <Route path="/admin/users" component={gatedEither(UserManagement, "user_management", "permission_manager")} />
          <Route path="/admin/devices" component={gated(DeviceApproval, "device_approval")} />
          <Route path="/admin/reports" component={gatedEither(AdminReports, "report_management", "reports")} />
          <Route path="/admin/management-report" component={gatedEither(ManagementReport, "report_management", "reports", "admin_settings")} />
          <Route path="/admin/concrete-estimates" component={gatedEither(ConcreteEstimates, "concrete_calculator", "reports")} />

          {/* Masters */}
          <Route path="/masters/section/:section" component={gatedEither(PlantMasters, "master_parties", "master_materials", "master_equipment", "master_personnel")} />

          {/* Edit requests — /edit-requests is the admin review queue; /mine is open to any authenticated user */}
          <Route path="/edit-requests" component={gatedEither(EditRequestsPage, "admin_settings", "user_management")} />
          <Route path="/edit-requests/mine" component={EditRequestsPage} />
          <Route path="/notifications/preferences" component={NotificationPreferences} />
          <Route path="/account" component={Account} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </HubShell>
  );
}

// ── App root ─────────────────────────────────────────────────────────────────
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
