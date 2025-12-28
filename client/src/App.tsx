import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Sidebar } from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import NewDpr from "@/pages/NewDpr";
import DprDetails from "@/pages/DprDetails";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64 min-h-screen">
        <div className="container mx-auto p-4 md:p-8 pt-6 max-w-7xl">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dpr/new" component={NewDpr} />
            <Route path="/dpr/:id" component={DprDetails} />
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
      <Toaster />
      <Router />
    </QueryClientProvider>
  );
}

export default App;
