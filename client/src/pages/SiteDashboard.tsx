import { useState, useRef, useMemo } from "react";
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
  HardHat,
  Printer,
  Filter,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

export default function SiteDashboard() {
  const [filters, setFilters] = useState({
    site: "",
    engineer: "",
    dateFrom: "",
    dateTo: "",
  });
  
  const printRef = useRef<HTMLDivElement>(null);
  
  const { data: allDprs } = useDprs({});
  const { data: dprs, isLoading } = useDprs(filters);

  const uniqueSites = useMemo(() => {
    if (!allDprs) return [];
    const sites = Array.from(new Set(allDprs.map((dpr: any) => dpr.site)));
    return sites.sort();
  }, [allDprs]);

  const uniqueEngineers = useMemo(() => {
    if (!allDprs) return [];
    const engineers = Array.from(new Set(allDprs.map((dpr: any) => dpr.engineer)));
    return engineers.sort();
  }, [allDprs]);

  const clearFilters = () => {
    setFilters({
      site: "",
      engineer: "",
      dateFrom: "",
      dateTo: "",
    });
  };

  const hasActiveFilters = filters.site || filters.engineer || filters.dateFrom || filters.dateTo;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print the report');
      return;
    }

    const styles = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { font-size: 20px; margin-bottom: 5px; }
        .header p { font-size: 12px; color: #666; }
        .filters-info { background: #f5f5f5; padding: 10px; margin-bottom: 20px; border-radius: 4px; font-size: 12px; }
        .report-list { }
        .report-item { padding: 12px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; }
        .report-item:last-child { border-bottom: none; }
        .report-site { font-weight: 600; font-size: 14px; }
        .report-meta { font-size: 12px; color: #666; margin-top: 4px; }
        .report-date { text-align: right; font-size: 12px; color: #666; }
        .summary { margin-top: 20px; padding-top: 15px; border-top: 2px solid #333; text-align: center; font-size: 12px; }
        @media print { body { padding: 0; } }
      </style>
    `;

    const filtersText = [];
    if (filters.dateFrom) filtersText.push(`From: ${format(new Date(filters.dateFrom), "dd MMM yyyy")}`);
    if (filters.dateTo) filtersText.push(`To: ${format(new Date(filters.dateTo), "dd MMM yyyy")}`);
    if (filters.site) filtersText.push(`Site: ${filters.site}`);
    if (filters.engineer) filtersText.push(`Engineer: ${filters.engineer}`);

    const reportsHtml = dprs?.map((dpr: any) => `
      <div class="report-item">
        <div>
          <div class="report-site">${dpr.site}</div>
          <div class="report-meta">Engineer: ${dpr.engineer}</div>
        </div>
        <div class="report-date">${format(new Date(dpr.date), "dd MMM yyyy")}</div>
      </div>
    `).join('') || '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Site Reports - High Lane Constructions Pvt Ltd</title>
          ${styles}
        </head>
        <body>
          <div class="header">
            <h1>High Lane Constructions Pvt Ltd</h1>
            <p>Site Reports Summary</p>
            <p>Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}</p>
          </div>
          ${filtersText.length > 0 ? `<div class="filters-info"><strong>Filters:</strong> ${filtersText.join(' | ')}</div>` : ''}
          <div class="report-list">
            ${reportsHtml}
          </div>
          <div class="summary">
            <strong>Total Reports: ${dprs?.length || 0}</strong>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePrint} className="gap-2" data-testid="button-print">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Link href="/site/new">
            <Button className="gap-2" data-testid="button-new-report">
              <Plus className="w-4 h-4" />
              New Report
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto gap-1" data-testid="button-clear-filters">
                <X className="w-3 h-3" />
                Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Date From</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Date To</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Site</Label>
              <Select value={filters.site} onValueChange={(value) => setFilters({ ...filters, site: value === "all" ? "" : value })}>
                <SelectTrigger data-testid="select-site">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {uniqueSites.map((site) => (
                    <SelectItem key={site} value={site}>{site}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Engineer</Label>
              <Select value={filters.engineer} onValueChange={(value) => setFilters({ ...filters, engineer: value === "all" ? "" : value })}>
                <SelectTrigger data-testid="select-engineer">
                  <SelectValue placeholder="All Engineers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Engineers</SelectItem>
                  {uniqueEngineers.map((engineer) => (
                    <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div ref={printRef}>
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
                {hasActiveFilters 
                  ? "No reports match your filter criteria." 
                  : "Get started by creating your first site report."}
              </p>
              {!hasActiveFilters && (
                <Link href="/site/new">
                  <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Report
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground px-1">
              Showing {dprs.length} report{dprs.length !== 1 ? 's' : ''}
            </div>
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
    </div>
  );
}
