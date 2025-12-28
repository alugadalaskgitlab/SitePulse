import { useState } from "react";
import { useDprs, useExportDprs } from "@/hooks/use-dprs";
import { Link } from "wouter";
import { 
  Plus, 
  Download, 
  Search, 
  Calendar, 
  MapPin, 
  HardHat,
  ChevronRight,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

export default function Dashboard() {
  const [filters, setFilters] = useState({
    site: "",
    engineer: "",
  });
  
  const { data: dprs, isLoading } = useDprs(filters);
  const handleExport = useExportDprs();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of daily progress reports across all sites.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Link href="/dpr/new">
            <Button className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4" /> New Report
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Filter by Site..." 
            className="pl-9"
            value={filters.site}
            onChange={(e) => setFilters(prev => ({ ...prev, site: e.target.value }))}
          />
        </div>
        <div className="relative">
          <HardHat className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Filter by Engineer..." 
            className="pl-9"
            value={filters.engineer}
            onChange={(e) => setFilters(prev => ({ ...prev, engineer: e.target.value }))}
          />
        </div>
        <Button variant="ghost" onClick={() => setFilters({ site: "", engineer: "" })}>
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

      {/* DPR List */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : dprs?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="bg-muted/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 opacity-50" />
              </div>
              <p>No reports found matching your criteria.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dprs?.map((dpr) => (
                <div 
                  key={dpr.id} 
                  className="group flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-lg border bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <span className="font-bold font-display text-lg">
                        {format(new Date(dpr.date), "dd")}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{dpr.site}</h3>
                      <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <HardHat className="w-3 h-3" /> {dpr.engineer}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {format(new Date(dpr.date), "MMM yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <Link href={`/dpr/${dpr.id}`} className="mt-4 md:mt-0">
                    <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-primary">
                      View Details <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Icon helper
function FileText(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}
