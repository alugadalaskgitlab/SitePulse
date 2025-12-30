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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <main className="min-h-screen">
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
            <Route path="/plant/:id" component={PlantDetails} />
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
