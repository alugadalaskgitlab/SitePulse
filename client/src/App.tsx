import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AccessProvider } from "@/lib/access-context";
import Home from "@/pages/Home";
import SiteHome from "@/pages/SiteHome";
import SiteDashboard from "@/pages/SiteDashboard";
import SiteEntry from "@/pages/SiteEntry";
import SiteEdit from "@/pages/SiteEdit";
import SiteSuccess from "@/pages/SiteSuccess";
import SiteReport from "@/pages/SiteReport";
import SiteMaterialTrips from "@/pages/SiteMaterialTrips";
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
import PlantStockReassign from "@/pages/PlantStockReassign";
import PlantShiftLog from "@/pages/PlantShiftLog";
import PlantDailyReport from "@/pages/PlantDailyReport";
import PlantHeatingSessions from "@/pages/PlantHeatingSessions";
import PurchaseIndents from "@/pages/PurchaseIndents";
import DieselRequirements from "@/pages/DieselRequirements";
import VendorBills from "@/pages/VendorBills";
import RateCards from "@/pages/RateCards";
import DataSync from "@/pages/DataSync";
import AdminSettings from "@/pages/AdminSettings";
import AdminReports from "@/pages/AdminReports";
import EstimatorLogin from "@/pages/EstimatorLogin";
import EstimatorHub from "@/pages/EstimatorHub";
import MixEstimates from "@/pages/MixEstimates";
import MixImpact from "@/pages/MixImpact";
import MixComparativeReport from "@/pages/MixComparativeReport";
import ScenarioComparison from "@/pages/ScenarioComparison";
import ConcreteEstimates from "@/pages/ConcreteEstimates";
import ConcreteCalculator from "@/pages/ConcreteCalculator";
import ConcreteCalculatorV2 from "@/pages/ConcreteCalculatorV2";
import NotFound from "@/pages/not-found";
import companyLogo from "@assets/1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg";

function Watermark() {
  return (
    <div 
      className="fixed inset-0 pointer-events-none flex items-center justify-center z-0"
      aria-hidden="true"
    >
      <img 
        src={companyLogo} 
        alt="" 
        className="w-64 h-64 md:w-80 md:h-80 object-contain opacity-[0.06]"
      />
    </div>
  );
}

function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-center px-4 md:px-8 max-w-7xl">
        <div className="flex items-center gap-2">
          <img src={companyLogo} alt="HLC" className="h-8 w-8 rounded object-cover" />
          <span className="font-semibold text-lg hidden sm:inline">High Lane Constructions Pvt Ltd</span>
        </div>
      </div>
    </header>
  );
}

function Router() {
  return (
    <div className="min-h-screen bg-background relative">
      <Watermark />
      <AppHeader />
      <main className="min-h-screen relative z-10">
        <div className="container mx-auto p-4 md:p-8 pt-6 max-w-7xl">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/site" component={SiteHome} />
            <Route path="/site/dashboard" component={SiteDashboard} />
            <Route path="/site/new" component={SiteEntry} />
            <Route path="/site/edit/:id" component={SiteEdit} />
            <Route path="/site/success/:id" component={SiteSuccess} />
            <Route path="/site/report/:id" component={SiteReport} />
            <Route path="/site/material-trips" component={SiteMaterialTrips} />
            <Route path="/site/purchases" component={SitePurchasesReport} />
            <Route path="/plant" component={PlantHome} />
            <Route path="/plant/dashboard" component={Plant} />
            <Route path="/plant/new" component={PlantNew} />
            <Route path="/plant/material-receipts" component={PlantMaterialReceipts} />
            <Route path="/plant/material-issues" component={PlantMaterialIssues} />
            <Route path="/plant/material-returns" component={PlantMaterialReturns} />
            <Route path="/plant/dispatches" component={PlantDispatches} />
            <Route path="/plant/equipment-usage" component={PlantEquipmentUsage} />
            <Route path="/plant/generator-logs" component={PlantGeneratorLogs} />
            <Route path="/plant/ldo-logs" component={PlantLdoLogs} />
            <Route path="/plant/stock" component={PlantStock} />
            <Route path="/plant/variance-report" component={PlantVarianceReport} />
            <Route path="/plant/audit-report" component={PlantAuditReport} />
            <Route path="/plant/diesel-procurement" component={PlantDieselProcurementReport} />
            <Route path="/plant/bitumen-stock" component={PlantBitumenStock} />
            <Route path="/plant/ldo-flow-meter" component={PlantLdoFlowMeter} />
            <Route path="/plant/stock-reassign" component={PlantStockReassign} />
            <Route path="/plant/shift-log" component={PlantShiftLog} />
            <Route path="/plant/shift-log/:date" component={PlantShiftLog} />
            <Route path="/plant/daily-report" component={PlantDailyReport} />
            <Route path="/plant/daily-report/:date" component={PlantDailyReport} />
            <Route path="/plant/heating-sessions" component={PlantHeatingSessions} />
            <Route path="/plant/heating-sessions/:date" component={PlantHeatingSessions} />
            <Route path="/plant/purchase-indents" component={PurchaseIndents} />
            <Route path="/plant/diesel-requirements" component={DieselRequirements} />
            <Route path="/plant/vendor-bills" component={VendorBills} />
            <Route path="/plant/rate-cards" component={RateCards} />
            <Route path="/plant/data-sync" component={DataSync} />
            <Route path="/plant/:id" component={PlantDetails} />
            <Route path="/admin/settings" component={AdminSettings} />
            <Route path="/estimator-login" component={EstimatorLogin} />
            <Route path="/estimator-hub" component={EstimatorHub} />
            <Route path="/admin/reports" component={AdminReports} />
            <Route path="/admin/mix-estimates" component={MixEstimates} />
            <Route path="/admin/mix-impact" component={MixImpact} />
            <Route path="/admin/mix-comparison" component={MixComparativeReport} />
            <Route path="/admin/scenario-comparison" component={ScenarioComparison} />
            <Route path="/admin/concrete-estimates" component={ConcreteEstimates} />
            <Route path="/concrete-calculator" component={ConcreteCalculator} />
            <Route path="/concrete-calculator-v2" component={ConcreteCalculatorV2} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AccessProvider>
        <Toaster />
        <Router />
      </AccessProvider>
    </QueryClientProvider>
  );
}

export default App;
