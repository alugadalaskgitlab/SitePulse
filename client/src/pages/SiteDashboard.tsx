import { useState, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrigin } from "@/hooks/use-origin";
import { useAccess } from "@/lib/access-context";
import { PinAuth } from "@/components/PinAuth";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Plus, 
  ChevronLeft, 
  Calendar, 
  ChevronRight,
  Loader2,
  HardHat,
  Printer,
  Filter,
  X,
  FileSpreadsheet,
  FileText,
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

// Helper to strip "Edited by..." suffix from site names
function getBaseSiteName(site: string): string {
  // Pattern: "Site Name – Edited by Role – YYYY-MM-DD HH:MM:SS"
  const editedPattern = / – Edited by .+$/;
  return site.replace(editedPattern, "").trim();
}

export default function SiteDashboard() {
  const { toast } = useToast();
  const { isAdmin, setAccess } = useAccess();
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<"reports-excel" | "reports-pdf" | "reports-print" | null>(null);
  const [filters, setFilters] = useState({
    site: "",
    engineer: "",
    dateFrom: "",
    dateTo: "",
    activity: "",
    equipment: "",
    hasDiesel: false,
    material: "",
  });
  
  const printRef = useRef<HTMLDivElement>(null);
  
  const { getBackLink, appendOrigin } = useOrigin();
  const backLink = getBackLink("/site");
  
  // Use detailed DPR data for advanced filtering
  // Only send date filters to server; site/engineer/activity/equipment/diesel are filtered client-side
  const dateFilters = useMemo(() => ({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }), [filters.dateFrom, filters.dateTo]);
  
  const { data: dprsWithDetails, isLoading } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", dateFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFilters.dateFrom) params.set("dateFrom", dateFilters.dateFrom);
      if (dateFilters.dateTo) params.set("dateTo", dateFilters.dateTo);
      const queryString = params.toString();
      const url = queryString ? `/api/dprs/with-details?${queryString}` : "/api/dprs/with-details";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch DPRs");
      return res.json();
    },
  });
  
  // Client-side filtering for all filters (site, engineer, activity, equipment, diesel, material)
  // Date filters are applied server-side
  const dprs = useMemo(() => {
    if (!dprsWithDetails) return [];
    
    return dprsWithDetails.filter((dpr: any) => {
      // Site filter - compare using base site name
      if (filters.site) {
        const dprBaseSite = getBaseSiteName(dpr.site);
        if (dprBaseSite !== filters.site) return false;
      }
      
      // Engineer filter
      if (filters.engineer && dpr.engineer !== filters.engineer) return false;
      
      // Activity filter
      if (filters.activity) {
        const hasActivity = dpr.progress?.some((p: any) => p.activity === filters.activity);
        if (!hasActivity) return false;
      }
      
      // Equipment filter
      if (filters.equipment) {
        const hasEquipment = dpr.equipment?.some((e: any) => e.machine === filters.equipment);
        if (!hasEquipment) return false;
      }
      
      // Diesel filter
      if (filters.hasDiesel) {
        const hasDieselUsage = dpr.equipment?.some((e: any) => e.diesel && e.diesel > 0);
        if (!hasDieselUsage) return false;
      }
      
      // Material filter
      if (filters.material) {
        const hasMaterial = dpr.materials?.some((m: any) => m.material === filters.material);
        if (!hasMaterial) return false;
      }
      
      return true;
    });
  }, [dprsWithDetails, filters]);

  // Build unique site names from detailed DPRs (using base site names)
  const uniqueSites = useMemo(() => {
    if (!dprsWithDetails) return [];
    const sites = new Set<string>();
    dprsWithDetails.forEach((dpr: any) => {
      sites.add(getBaseSiteName(dpr.site));
    });
    return Array.from(sites).sort();
  }, [dprsWithDetails]);

  const uniqueEngineers = useMemo(() => {
    if (!dprsWithDetails) return [];
    const engineers = new Set<string>();
    dprsWithDetails.forEach((dpr: any) => {
      if (dpr.engineer) engineers.add(dpr.engineer);
    });
    return Array.from(engineers).sort();
  }, [dprsWithDetails]);

  const uniqueActivities = useMemo(() => {
    if (!dprsWithDetails) return [];
    const activities = new Set<string>();
    dprsWithDetails.forEach((dpr: any) => {
      dpr.progress?.forEach((p: any) => {
        if (p.activity) activities.add(p.activity);
      });
    });
    return Array.from(activities).sort();
  }, [dprsWithDetails]);

  const uniqueEquipmentList = useMemo(() => {
    if (!dprsWithDetails) return [];
    const equipment = new Set<string>();
    dprsWithDetails.forEach((dpr: any) => {
      dpr.equipment?.forEach((e: any) => {
        if (e.machine) equipment.add(e.machine);
      });
    });
    return Array.from(equipment).sort();
  }, [dprsWithDetails]);

  const uniqueMaterials = useMemo(() => {
    if (!dprsWithDetails) return [];
    const materials = new Set<string>();
    dprsWithDetails.forEach((dpr: any) => {
      dpr.materials?.forEach((m: any) => {
        if (m.material) materials.add(m.material);
      });
    });
    return Array.from(materials).sort();
  }, [dprsWithDetails]);

  const clearFilters = () => {
    setFilters({
      site: "",
      engineer: "",
      dateFrom: "",
      dateTo: "",
      activity: "",
      equipment: "",
      hasDiesel: false,
      material: "",
    });
  };

  const hasActiveFilters = filters.site || filters.engineer || filters.dateFrom || filters.dateTo || filters.activity || filters.equipment || filters.hasDiesel || filters.material;

  // Admin action handlers
  const handleAdminAction = (action: "reports-excel" | "reports-pdf" | "reports-print") => {
    if (isAdmin) {
      executeAction(action);
    } else {
      setPendingAction(action);
      setShowPinAuth(true);
    }
  };

  const handlePinSuccess = (role: "manager" | "admin", _pin: string) => {
    setAccess(role);
    setShowPinAuth(false);
    if (pendingAction && role === "admin") {
      executeAction(pendingAction);
    } else if (pendingAction && role === "manager") {
      toast({ title: "Access Denied", description: "Export/Print requires Admin access", variant: "destructive" });
    }
    setPendingAction(null);
  };

  const executeAction = (action: "reports-excel" | "reports-pdf" | "reports-print") => {
    switch (action) {
      case "reports-excel":
        exportReportsToExcel();
        break;
      case "reports-pdf":
        exportReportsToPDF();
        break;
      case "reports-print":
        handlePrint();
        break;
    }
  };

  const exportReportsToExcel = () => {
    if (!dprs || dprs.length === 0) return;
    
    const wb = XLSX.utils.book_new();
    
    // Reports sheet
    const reportsData = dprs.map((dpr: any) => ({
      Date: format(new Date(dpr.date), "dd/MM/yyyy"),
      Site: getBaseSiteName(dpr.site),
      Engineer: dpr.engineer,
      Role: dpr.role || "",
    }));
    const reportsSheet = XLSX.utils.json_to_sheet(reportsData);
    XLSX.utils.book_append_sheet(wb, reportsSheet, "Site Reports");
    
    const fileName = `SiteReports_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({ title: "Export Complete", description: `Downloaded ${fileName}` });
  };

  const exportReportsToPDF = () => {
    if (!dprs || dprs.length === 0) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(16);
    doc.text("High Lane Constructions Pvt Ltd", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(12);
    doc.text("Site Reports Summary", pageWidth / 2, 22, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, pageWidth / 2, 28, { align: "center" });
    
    // Filters info
    const filterLines = [];
    if (filters.dateFrom) filterLines.push(`From: ${format(new Date(filters.dateFrom), "dd MMM yyyy")}`);
    if (filters.dateTo) filterLines.push(`To: ${format(new Date(filters.dateTo), "dd MMM yyyy")}`);
    if (filters.site) filterLines.push(`Site: ${filters.site}`);
    if (filters.engineer) filterLines.push(`Engineer: ${filters.engineer}`);
    if (filters.activity) filterLines.push(`Activity: ${filters.activity}`);
    if (filters.equipment) filterLines.push(`Equipment: ${filters.equipment}`);
    if (filters.hasDiesel) filterLines.push(`With Diesel Usage`);
    if (filterLines.length > 0) {
      doc.text(`Filters: ${filterLines.join(" | ")}`, 14, 36);
    }
    
    // Reports table
    const reportsRows = dprs.map((dpr: any) => [
      format(new Date(dpr.date), "dd MMM yyyy"),
      getBaseSiteName(dpr.site),
      dpr.engineer,
      dpr.role || "",
    ]);
    
    autoTable(doc, {
      startY: 42,
      head: [["Date", "Site", "Engineer", "Role"]],
      body: reportsRows,
      theme: 'grid',
      headStyles: { fillColor: [80, 80, 80] },
      styles: { fontSize: 9 },
    });
    
    const fileName = `SiteReports_${format(new Date(), "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
    toast({ title: "Export Complete", description: `Downloaded ${fileName}` });
  };

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
    if (filters.activity) filtersText.push(`Activity: ${filters.activity}`);
    if (filters.equipment) filtersText.push(`Equipment: ${filters.equipment}`);
    if (filters.hasDiesel) filtersText.push(`With Diesel Usage`);

    const reportsHtml = dprs?.map((dpr: any) => `
      <div class="report-item">
        <div>
          <div class="report-site">${getBaseSiteName(dpr.site)}</div>
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
    // Use setTimeout to ensure content is fully rendered before printing
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 250);
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
          <Button variant="outline" size="sm" onClick={() => handleAdminAction("reports-excel")} className="gap-1" data-testid="button-reports-excel">
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAdminAction("reports-pdf")} className="gap-1" data-testid="button-reports-pdf">
            <FileText className="w-4 h-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAdminAction("reports-print")} className="gap-1" data-testid="button-reports-print">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Link href={appendOrigin("/site/new")}>
            <Button className="gap-2" data-testid="button-new-report">
              <Plus className="w-4 h-4" />
              New Report
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-6 mt-6">
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
                  <Select value={filters.site || "all"} onValueChange={(value) => setFilters({ ...filters, site: value === "all" ? "" : value })}>
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
                  <Select value={filters.engineer || "all"} onValueChange={(value) => setFilters({ ...filters, engineer: value === "all" ? "" : value })}>
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
                <div className="space-y-2">
                  <Label className="text-xs">Activity</Label>
                  <Select value={filters.activity || "all"} onValueChange={(value) => setFilters({ ...filters, activity: value === "all" ? "" : value })}>
                    <SelectTrigger data-testid="select-activity">
                      <SelectValue placeholder="All Activities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Activities</SelectItem>
                      {uniqueActivities.map((activity) => (
                        <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Equipment</Label>
                  <Select value={filters.equipment || "all"} onValueChange={(value) => setFilters({ ...filters, equipment: value === "all" ? "" : value })}>
                    <SelectTrigger data-testid="select-equipment">
                      <SelectValue placeholder="All Equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Equipment</SelectItem>
                      {uniqueEquipmentList.map((equip) => (
                        <SelectItem key={equip} value={equip}>{equip}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Diesel Usage</Label>
                  <Select value={filters.hasDiesel ? "yes" : "all"} onValueChange={(value) => setFilters({ ...filters, hasDiesel: value === "yes" })}>
                    <SelectTrigger data-testid="select-diesel">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reports</SelectItem>
                      <SelectItem value="yes">With Diesel Usage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Material</Label>
                  <Select value={filters.material || "all"} onValueChange={(value) => setFilters({ ...filters, material: value === "all" ? "" : value })}>
                    <SelectTrigger data-testid="select-material">
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
      </div>

      {/* PIN Auth Modal */}
      {showPinAuth && (
        <PinAuth
          targetRole="admin"
          onSuccess={handlePinSuccess}
          onClose={() => {
            setShowPinAuth(false);
            setPendingAction(null);
          }}
        />
      )}
    </div>
  );
}
