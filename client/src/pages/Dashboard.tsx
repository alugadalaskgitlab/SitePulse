import { useState } from "react";
import { useDprs, useExportDprs } from "@/hooks/use-dprs";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { 
  Plus, 
  Download, 
  Calendar, 
  MapPin, 
  HardHat,
  ChevronRight,
  Loader2,
  Shield,
  ShieldCheck,
  Lock,
  Factory
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PinAuth } from "@/components/PinAuth";
import { LockBadge } from "@/components/LockBadge";
import { useAccess } from "@/lib/access-context";
import { format } from "date-fns";

export default function Dashboard() {
  const [filters, setFilters] = useState({
    site: "",
    engineer: "",
  });
  const { access, setAccess } = useAccess();
  const { appendOrigin } = useOrigin();
  const [showPinModal, setShowPinModal] = useState<"manager" | "admin" | null>(null);
  
  const { data: dprs, isLoading } = useDprs(filters);
  const handleExport = useExportDprs();

  const handlePinSuccess = (role: "manager" | "admin", _pin: string) => {
    setAccess(role);
    setShowPinModal(null);
  };

  const getAccessBadge = () => {
    if (access === "admin") {
      return (
        <div className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-200 text-xs font-semibold flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" />
          Admin Access
        </div>
      );
    } else if (access === "manager") {
      return (
        <div className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 text-xs font-semibold flex items-center gap-1">
          <Shield className="w-3 h-3" />
          Manager Access
        </div>
      );
    }
    return (
      <div className="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 text-xs font-semibold flex items-center gap-1">
        <HardHat className="w-3 h-3" />
        Site Engineer
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* PIN Modal */}
      {showPinModal && (
        <PinAuth
          targetRole={showPinModal}
          onSuccess={handlePinSuccess}
          onClose={() => setShowPinModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard</h1>
            {getAccessBadge()}
          </div>
          <p className="text-muted-foreground mt-1">Overview of daily progress reports across all sites.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Link href="/dpr/new">
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4" /> New Report
            </Button>
          </Link>
          <Link href={appendOrigin("/plant/dashboard")}>
            <Button variant="outline" className="gap-2">
              <Factory className="w-4 h-4" /> Plant Module
            </Button>
          </Link>
        </div>
      </div>

      {/* Role Access Buttons */}
      <div className="flex gap-3 p-4 bg-card border rounded-xl shadow-sm items-center flex-wrap">
        <span className="text-sm text-muted-foreground font-medium">Access Level:</span>
        
        {access === "engineer" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPinModal("manager")}
              className="gap-2"
              data-testid="button-manager-access"
            >
              <Shield className="w-4 h-4" />
              Manager Access
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPinModal("admin")}
              className="gap-2"
              data-testid="button-admin-access"
            >
              <ShieldCheck className="w-4 h-4" />
              Admin Access
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAccess("engineer")}
            className="gap-2"
            data-testid="button-lock"
          >
            <Lock className="w-4 h-4" />
            Lock (Return to Engineer View)
          </Button>
        )}
        
        {access !== "engineer" && (
          <span className="text-xs text-muted-foreground ml-auto">
            {access === "admin" ? "Full control: Edit & Delete" : "Can edit reports"}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Filter by Site..." 
            className="pl-9"
            value={filters.site}
            onChange={(e) => setFilters(prev => ({ ...prev, site: e.target.value.toUpperCase() }))}
            data-testid="input-filter-site"
          />
        </div>
        <div className="relative">
          <HardHat className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Filter by Engineer..." 
            className="pl-9"
            value={filters.engineer}
            onChange={(e) => setFilters(prev => ({ ...prev, engineer: e.target.value.toUpperCase() }))}
            data-testid="input-filter-engineer"
          />
        </div>
        <Button variant="ghost" onClick={() => setFilters({ site: "", engineer: "" })} data-testid="button-clear-filters">
          Clear Filters
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{dprs?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Submitted in total</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {dprs ? new Set(dprs.map(d => d.site)).size : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sites with reports</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Engineers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {dprs ? new Set(dprs.map(d => d.engineer)).size : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Contributing staff</p>
          </CardContent>
        </Card>
      </div>

      {/* Reports List */}
      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Recent Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !dprs?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              <p>No reports found. Create your first report to get started.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {dprs.map((dpr) => (
                <li key={dpr.id}>
                  <div className="flex items-center justify-between p-4 hover-elevate group">
                    <Link href={`/dpr/${dpr.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-4 cursor-pointer">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {dpr.site.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{dpr.site}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(dpr.date), "MMM d, yyyy")} - {dpr.engineer}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 ml-3">
                      <LockBadge
                        record={dpr}
                        resourceType="dpr"
                        resourceId={dpr.id}
                        compact
                      />
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
