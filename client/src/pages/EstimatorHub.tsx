import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Building2, LogOut, Home, ChevronRight, BarChart3, Plus, GitCompare, FileDown } from "lucide-react";
import { readEstimatorRole, signOutEstimator } from "@/lib/estimatorAuth";
import companyLogo from "@assets/1B61665A-8ECB-443A-98A5-FB3676935BB8_1_102_a_1767081845854.jpeg";

export default function EstimatorHub() {
  const [, setLocation] = useLocation();
  const role = readEstimatorRole();

  useEffect(() => {
    if (!role) setLocation("/estimator-login");
  }, [role]);

  async function handleLogout() {
    await signOutEstimator();
    setLocation("/estimator-login");
  }

  async function handleBackToDashboard() {
    await signOutEstimator();
    setLocation("/");
  }

  if (!role) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-12">
          <img src={companyLogo} alt="HLC" className="h-20 w-20 rounded-xl object-cover mx-auto mb-5" />
          <h1 className="text-4xl font-bold text-foreground mb-2">Estimate Manager</h1>
          <p className="text-muted-foreground text-lg">High Lane Constructions Pvt Ltd</p>
        </div>

        {/* Calculator tiles */}
        <div className={`grid grid-cols-1 ${role !== "manager" ? "md:grid-cols-2" : ""} gap-8 mb-10`}>
          {/* Bituminous Mix Calculator */}
          <Card className="border-2 hover:border-amber-400 transition-all hover:shadow-md">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-5">
                <Flame className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Bituminous Mix</h2>
              <p className="text-base text-muted-foreground mb-6">
                Hot-mix rate calculator with fuel, laying, compaction &amp; transport costs
              </p>
              <div className="flex flex-col gap-2 w-full text-left">
                <a
                  href="/admin/mix-estimates"
                  className="flex items-center justify-between text-base font-semibold px-4 py-3 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 transition-colors"
                  data-testid="link-bitmix-estimates"
                >
                  <span className="flex items-center gap-2.5"><BarChart3 className="w-5 h-5" /> Saved Estimates</span>
                  <ChevronRight className="w-5 h-5" />
                </a>
                <a
                  href="/mix-calculator"
                  className="flex items-center justify-between text-base font-medium px-4 py-3 rounded-lg bg-muted/60 hover:bg-muted text-foreground transition-colors"
                  data-testid="link-bitmix-open"
                >
                  <span className="flex items-center gap-2.5"><Plus className="w-5 h-5" /> New Estimate</span>
                  <ChevronRight className="w-5 h-5" />
                </a>
                <a
                  href="/admin/mix-comparison"
                  className="flex items-center justify-between text-base font-medium px-4 py-3 rounded-lg bg-muted/60 hover:bg-muted text-foreground transition-colors"
                  data-testid="link-bitmix-comparison"
                >
                  <span className="flex items-center gap-2.5"><GitCompare className="w-5 h-5" /> Contractor Comparison</span>
                  <ChevronRight className="w-5 h-5" />
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Concrete Rate Calculator v2 — admin only */}
          {role !== "manager" && <Card className="border-2 hover:border-blue-400 transition-all hover:shadow-md">
            <CardContent className="p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-5">
                <Building2 className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Concrete Rate</h2>
              <p className="text-base text-muted-foreground mb-4">
                Location-centric drain &amp; box culvert rate analysis with auto rebar design and per-location aggregate sourcing
              </p>
              <div className="flex flex-col gap-2 w-full text-left">
                <a
                  href="/concrete-calculator-v2"
                  className="flex items-center justify-between text-base font-semibold px-4 py-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 transition-colors"
                  data-testid="link-concrete-v2-open"
                >
                  <span className="flex items-center gap-2.5"><Plus className="w-5 h-5" /> New Estimate (v2)</span>
                  <ChevronRight className="w-5 h-5" />
                </a>
                <a
                  href="/admin/concrete-estimates"
                  className="flex items-center justify-between text-base font-medium px-4 py-3 rounded-lg bg-muted/60 hover:bg-muted text-foreground transition-colors"
                  data-testid="link-concrete-estimates"
                >
                  <span className="flex items-center gap-2.5"><BarChart3 className="w-5 h-5" /> v1 Saved Estimates</span>
                  <ChevronRight className="w-5 h-5" />
                </a>
                <a
                  href="/concrete-calculator"
                  className="flex items-center justify-between text-base font-medium px-4 py-3 rounded-lg bg-muted/60 hover:bg-muted text-foreground transition-colors"
                  data-testid="link-concrete-open"
                >
                  <span className="flex items-center gap-2.5"><Plus className="w-5 h-5" /> v1 Calculator (legacy)</span>
                  <ChevronRight className="w-5 h-5" />
                </a>
              </div>
            </CardContent>
          </Card>}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-center gap-4">
          {role === "admin" && (
            <Button
              variant="outline"
              size="lg"
              className="gap-2 text-base"
              onClick={() => window.open('/api/admin/estimator-guide.pdf', '_blank')}
              data-testid="button-estimator-guide-pdf"
            >
              <FileDown className="w-5 h-5" />
              Estimator Guide (PDF)
            </Button>
          )}
          <Button
            variant="ghost"
            size="lg"
            className="gap-2 text-base text-muted-foreground hover:text-foreground"
            onClick={handleBackToDashboard}
            data-testid="button-back-to-dashboard"
          >
            <Home className="w-5 h-5" />
            Back to HLC Dashboard
          </Button>
          <Button
            variant="ghost"
            size="lg"
            className="gap-2 text-base text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            data-testid="button-estimator-logout"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
