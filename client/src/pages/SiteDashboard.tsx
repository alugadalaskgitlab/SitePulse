import { useState, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useDprs } from "@/hooks/use-dprs";
import { useOrigin } from "@/hooks/use-origin";
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
  X,
  Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays } from "date-fns";

interface SiteMaterialLog {
  id: number;
  dprId: number;
  date: string;
  site: string;
  type: string;
  material: string;
  quantity: number | null;
  uom: string | null;
  supplier: string | null;
  vehicleNumber: string | null;
  location: string | null;
  receiptNumber: string | null;
}

export default function SiteDashboard() {
  const [activeTab, setActiveTab] = useState("reports");
  const [filters, setFilters] = useState({
    site: "",
    engineer: "",
    dateFrom: "",
    dateTo: "",
  });
  
  const [materialFilters, setMaterialFilters] = useState({
    site: "",
    material: "",
    dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  });
  
  const printRef = useRef<HTMLDivElement>(null);
  
  const { getBackLink, appendOrigin } = useOrigin();
  const backLink = getBackLink("/site");
  
  const { data: allDprs } = useDprs({});
  const { data: dprs, isLoading } = useDprs(filters);

  // Fetch all material logs for the date range and site (without material filter) to get the unique materials list
  const baseFilters = useMemo(() => ({
    site: materialFilters.site,
    dateFrom: materialFilters.dateFrom,
    dateTo: materialFilters.dateTo,
  }), [materialFilters.site, materialFilters.dateFrom, materialFilters.dateTo]);

  const { data: allMaterialLogs, isLoading: materialsLoading } = useQuery<SiteMaterialLog[]>({
    queryKey: ["/api/dprs/material-summary", baseFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (baseFilters.site) params.set("site", baseFilters.site);
      if (baseFilters.dateFrom) params.set("dateFrom", baseFilters.dateFrom);
      if (baseFilters.dateTo) params.set("dateTo", baseFilters.dateTo);
      const res = await fetch(`/api/dprs/material-summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch material summary");
      return res.json();
    },
    enabled: activeTab === "materials",
  });
  
  // Derive filtered logs and unique materials from the single query
  const materialLogs = useMemo(() => {
    if (!allMaterialLogs) return undefined;
    if (!materialFilters.material) return allMaterialLogs;
    return allMaterialLogs.filter(log => log.material === materialFilters.material);
  }, [allMaterialLogs, materialFilters.material]);
  
  const uniqueMaterials = useMemo(() => {
    if (!allMaterialLogs) return [];
    const materials = Array.from(new Set(allMaterialLogs.map((log) => log.material).filter(Boolean)));
    return materials.sort();
  }, [allMaterialLogs]);

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

  const clearMaterialFilters = () => {
    setMaterialFilters({
      site: "",
      material: "",
      dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      dateTo: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const hasActiveFilters = filters.site || filters.engineer || filters.dateFrom || filters.dateTo;
  const hasMaterialFilters = materialFilters.site || materialFilters.material || materialFilters.dateFrom || materialFilters.dateTo;

  const materialTotals = useMemo(() => {
    if (!materialLogs) return { received: new Map(), issued: new Map() };
    
    const received = new Map<string, { quantity: number; uom: string }>();
    const issued = new Map<string, { quantity: number; uom: string }>();
    
    for (const log of materialLogs) {
      const map = log.type === "Received" ? received : issued;
      const key = `${log.material}-${log.uom}`;
      const existing = map.get(key) || { quantity: 0, uom: log.uom || "" };
      existing.quantity += log.quantity || 0;
      map.set(key, existing);
    }
    
    return { received, issued };
  }, [materialLogs]);

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
          <Link href={backLink}>
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
          {activeTab === "reports" && (
            <>
              <Button variant="outline" onClick={handlePrint} className="gap-2" data-testid="button-print">
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Link href={appendOrigin("/site/new")}>
                <Button className="gap-2" data-testid="button-new-report">
                  <Plus className="w-4 h-4" />
                  New Report
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="reports" className="gap-2" data-testid="tab-reports">
            <Calendar className="w-4 h-4" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="materials" className="gap-2" data-testid="tab-materials">
            <Package className="w-4 h-4" />
            Material Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-6 mt-6">
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
                    <Link href={appendOrigin("/site/new")}>
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
                  <Link key={dpr.id} href={appendOrigin(`/site/report/${dpr.id}`)}>
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
        </TabsContent>

        <TabsContent value="materials" className="space-y-6 mt-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters</span>
                {hasMaterialFilters && (
                  <Button variant="ghost" size="sm" onClick={clearMaterialFilters} className="ml-auto gap-1" data-testid="button-clear-material-filters">
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
                    value={materialFilters.dateFrom}
                    onChange={(e) => setMaterialFilters({ ...materialFilters, dateFrom: e.target.value })}
                    data-testid="input-material-date-from"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Date To</Label>
                  <Input
                    type="date"
                    value={materialFilters.dateTo}
                    onChange={(e) => setMaterialFilters({ ...materialFilters, dateTo: e.target.value })}
                    data-testid="input-material-date-to"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Site</Label>
                  <Select 
                    value={materialFilters.site} 
                    onValueChange={(value) => setMaterialFilters({ ...materialFilters, site: value === "all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-material-site">
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
                  <Label className="text-xs">Material</Label>
                  <Select 
                    value={materialFilters.material} 
                    onValueChange={(value) => setMaterialFilters({ ...materialFilters, material: value === "all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-material-type">
                      <SelectValue placeholder="All Materials" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Materials</SelectItem>
                      {uniqueMaterials.map((material) => (
                        <SelectItem key={material} value={material}>{material}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {materialsLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !materialLogs || materialLogs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Material Logs Found</h3>
                <p className="text-muted-foreground">
                  No materials were recorded in the selected date range.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-green-600 dark:text-green-400 mb-3">Materials Received</h3>
                    <div className="space-y-2">
                      {Array.from(materialTotals.received.entries()).map(([key, value]) => {
                        const [material] = key.split("-");
                        return (
                          <div key={key} className="flex justify-between items-center text-sm">
                            <span>{material}</span>
                            <Badge variant="secondary">{value.quantity.toFixed(2)} {value.uom}</Badge>
                          </div>
                        );
                      })}
                      {materialTotals.received.size === 0 && (
                        <p className="text-sm text-muted-foreground">No materials received</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-orange-600 dark:text-orange-400 mb-3">Materials Issued</h3>
                    <div className="space-y-2">
                      {Array.from(materialTotals.issued.entries()).map(([key, value]) => {
                        const [material] = key.split("-");
                        return (
                          <div key={key} className="flex justify-between items-center text-sm">
                            <span>{material}</span>
                            <Badge variant="secondary">{value.quantity.toFixed(2)} {value.uom}</Badge>
                          </div>
                        );
                      })}
                      {materialTotals.issued.size === 0 && (
                        <p className="text-sm text-muted-foreground">No materials issued</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground mb-4">
                    Showing {materialLogs.length} material log{materialLogs.length !== 1 ? 's' : ''}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Vehicle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materialLogs.map((log) => (
                          <TableRow key={log.id} data-testid={`row-material-${log.id}`}>
                            <TableCell className="whitespace-nowrap">{format(new Date(log.date), "dd MMM")}</TableCell>
                            <TableCell className="max-w-32 truncate">{log.site}</TableCell>
                            <TableCell>
                              <Badge variant={log.type === "Received" ? "default" : "secondary"}>
                                {log.type}
                              </Badge>
                            </TableCell>
                            <TableCell>{log.material}</TableCell>
                            <TableCell className="text-right">{log.quantity?.toFixed(2) || "-"}</TableCell>
                            <TableCell>{log.uom || "-"}</TableCell>
                            <TableCell className="max-w-24 truncate">{log.supplier || "-"}</TableCell>
                            <TableCell>{log.vehicleNumber || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
