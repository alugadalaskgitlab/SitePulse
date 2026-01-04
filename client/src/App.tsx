import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { AccessProvider } from "@/lib/access-context";
import Home from "@/pages/Home";
import SiteDashboard from "@/pages/SiteDashboard";
import SiteEntry from "@/pages/SiteEntry";
import SiteEdit from "@/pages/SiteEdit";
import SiteSuccess from "@/pages/SiteSuccess";
import SiteReport from "@/pages/SiteReport";
import Plant from "@/pages/Plant";
import PlantNew from "@/pages/PlantNew";
import PlantDetails from "@/pages/PlantDetails";
import PlantMaterialReceipts from "@/pages/PlantMaterialReceipts";
import PlantDispatches from "@/pages/PlantDispatches";
import PlantEquipmentUsage from "@/pages/PlantEquipmentUsage";
import PlantGeneratorLogs from "@/pages/PlantGeneratorLogs";
import PlantLdoLogs from "@/pages/PlantLdoLogs";
import PlantStock from "@/pages/PlantStock";
import AdminSettings from "@/pages/AdminSettings";
import AdminReports from "@/pages/AdminReports";
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

function Router() {
  return (
    <div className="min-h-screen bg-background relative">
      <Watermark />
      <main className="min-h-screen relative z-10">
        <div className="container mx-auto p-4 md:p-8 pt-6 max-w-7xl">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/site" component={SiteDashboard} />
            <Route path="/site/new" component={SiteEntry} />
            <Route path="/site/edit/:id" component={SiteEdit} />
            <Route path="/site/success/:id" component={SiteSuccess} />
            <Route path="/site/report/:id" component={SiteReport} />
            <Route path="/plant" component={Plant} />
            <Route path="/plant/new" component={PlantNew} />
            <Route path="/plant/material-receipts" component={PlantMaterialReceipts} />
            <Route path="/plant/dispatches" component={PlantDispatches} />
            <Route path="/plant/equipment-usage" component={PlantEquipmentUsage} />
            <Route path="/plant/generator-logs" component={PlantGeneratorLogs} />
            <Route path="/plant/ldo-logs" component={PlantLdoLogs} />
            <Route path="/plant/stock" component={PlantStock} />
            <Route path="/plant/:id" component={PlantDetails} />
            <Route path="/admin/settings" component={AdminSettings} />
            <Route path="/admin/reports" component={AdminReports} />
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
