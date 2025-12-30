import { useState } from "react";
import { Link } from "wouter";
import { useDprs } from "@/hooks/use-dprs";
import { 
  Plus, 
  ChevronLeft, 
  Calendar, 
  MapPin, 
  ChevronRight,
  Loader2,
  Search,
  HardHat
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";

export default function SiteDashboard() {
  const [filters, setFilters] = useState({
    site: "",
    engineer: "",
  });
  
  const { data: dprs, isLoading } = useDprs(filters);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-home">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display">Site Reports</h1>
            <p className="text-muted-foreground text-sm">View and manage daily progress reports</p>
          </div>
        </div>
        <Link href="/site/new">
          <Button className="gap-2" data-testid="button-new-report">
            <Plus className="w-4 h-4" />
            New Report
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by site name..."
                value={filters.site}
                onChange={(e) => setFilters({ ...filters, site: e.target.value })}
                className="pl-9"
                data-testid="input-filter-site"
              />
            </div>
            <div className="flex-1 relative">
              <HardHat className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by engineer..."
                value={filters.engineer}
                onChange={(e) => setFilters({ ...filters, engineer: e.target.value })}
                className="pl-9"
                data-testid="input-filter-engineer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !dprs || dprs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Reports Found</h3>
            <p className="text-muted-foreground mb-6">
              {filters.site || filters.engineer 
                ? "No reports match your search criteria." 
                : "Get started by creating your first site report."}
            </p>
            <Link href="/site/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Create Report
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dprs.map((dpr: any) => (
            <Link key={dpr.id} href={`/site/report/${dpr.id}`}>
              <Card className="hover-elevate cursor-pointer transition-all" data-testid={`card-report-${dpr.id}`}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{dpr.site}</h3>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(dpr.date), "MMM d, yyyy")}
                        </span>
                        <span className="flex items-center gap-1">
                          <HardHat className="w-3 h-3" />
                          {dpr.engineer}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
