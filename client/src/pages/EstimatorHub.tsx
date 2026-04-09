import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Building2, LogOut, ChevronRight, BarChart3, TrendingUp, GitCompare } from "lucide-react";
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

  if (!role) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <img src={companyLogo} alt="HLC" className="h-16 w-16 rounded-lg object-cover mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Estimate Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">High Lane Constructions Pvt Ltd</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className={role === "admin" ? "border-amber-400 text-amber-700 bg-amber-50" : "border-blue-400 text-blue-700 bg-blue-50"}>
              {role === "admin" ? "Admin" : "Manager"} Access
            </Badge>
          </div>
        </div>

        {/* Calculator tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Bituminous Mix Calculator */}
          <a href="/mix-calculator" data-testid="card-bitmix-calculator">
            <Card className="hover:border-amber-400 border-2 cursor-pointer transition-all hover:shadow-md">
              <CardContent className="p-7 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <Flame className="w-7 h-7 text-amber-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">Bituminous Mix</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Hot-mix rate calculator with fuel, laying, compaction &amp; transport costs
                </p>
                <div className="flex flex-col gap-1 w-full">
                  <a
                    href="/mix-calculator"
                    className="flex items-center justify-between text-sm px-3 py-2 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium transition-colors"
                    data-testid="link-bitmix-open"
                  >
                    <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Open Calculator</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                  <a
                    href="/admin/mix-estimates"
                    className="flex items-center justify-between text-sm px-3 py-2 rounded bg-muted/50 hover:bg-muted text-foreground/70 transition-colors"
                    data-testid="link-bitmix-estimates"
                  >
                    <span className="flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Saved Estimates</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                  <a
                    href="/admin/mix-comparison"
                    className="flex items-center justify-between text-sm px-3 py-2 rounded bg-muted/50 hover:bg-muted text-foreground/70 transition-colors"
                    data-testid="link-bitmix-comparison"
                  >
                    <span className="flex items-center gap-2"><GitCompare className="w-4 h-4" /> Contractor Comparison</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </a>

          {/* Concrete Rate Calculator */}
          <a href="/concrete-calculator" data-testid="card-concrete-calculator">
            <Card className="hover:border-blue-400 border-2 cursor-pointer transition-all hover:shadow-md">
              <CardContent className="p-7 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <Building2 className="w-7 h-7 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">Concrete Rate</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Comprehensive BOQ analysis for drains, box culverts, bridges &amp; retaining walls
                </p>
                <div className="flex flex-col gap-1 w-full">
                  <a
                    href="/concrete-calculator"
                    className="flex items-center justify-between text-sm px-3 py-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 font-medium transition-colors"
                    data-testid="link-concrete-open"
                  >
                    <span className="flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Open Calculator</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                  <a
                    href="/admin/concrete-estimates"
                    className="flex items-center justify-between text-sm px-3 py-2 rounded bg-muted/50 hover:bg-muted text-foreground/70 transition-colors"
                    data-testid="link-concrete-estimates"
                  >
                    <span className="flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Saved Estimates</span>
                    <ChevronRight className="w-4 h-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </a>
        </div>

        {/* Footer actions */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            data-testid="button-estimator-logout"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
