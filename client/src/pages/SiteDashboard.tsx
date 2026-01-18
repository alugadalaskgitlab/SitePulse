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
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Loader2,
  HardHat,
  Printer,
  Filter,
  X,
  FileSpreadsheet,
  FileText,
  Wrench,
  Users,
  Package,
  ExternalLink,
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
  const [expandedReports, setExpandedReports] = useState<Set<number>>(new Set());
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
    
    // Summary sheet
    const reportsData = dprs.map((dpr: any) => ({
      Date: format(new Date(dpr.date), "dd/MM/yyyy"),
      Site: getBaseSiteName(dpr.site),
      Engineer: dpr.engineer,
      Role: dpr.role || "",
      "Progress Entries": dpr.progress?.length || 0,
      "Equipment Logs": dpr.equipment?.length || 0,
      "Labour Count": dpr.labour?.reduce((sum: number, l: any) => sum + (l.count || 0), 0) || 0,
      "Material Entries": dpr.materials?.length || 0,
    }));
    const reportsSheet = XLSX.utils.json_to_sheet(reportsData);
    XLSX.utils.book_append_sheet(wb, reportsSheet, "Summary");
    
    // Progress Details sheet
    const progressData: any[] = [];
    dprs.forEach((dpr: any) => {
      dpr.progress?.forEach((p: any) => {
        progressData.push({
          Date: format(new Date(dpr.date), "dd/MM/yyyy"),
          Site: getBaseSiteName(dpr.site),
          Activity: p.activity || "",
          Side: p.side || "",
          "Chainage From": p.chainageFrom || "",
          "Chainage To": p.chainageTo || "",
          "Length (m)": p.length || 0,
          "Width (m)": p.width || 0,
          "Thickness (mm)": p.thickness || 0,
          Quantity: p.quantity || 0,
          UOM: p.uom || "",
        });
      });
    });
    if (progressData.length > 0) {
      const progressSheet = XLSX.utils.json_to_sheet(progressData);
      XLSX.utils.book_append_sheet(wb, progressSheet, "Progress");
    }
    
    // Equipment Details sheet
    const equipmentData: any[] = [];
    dprs.forEach((dpr: any) => {
      dpr.equipment?.forEach((e: any) => {
        const hours = e.hoursWorked || (e.closingReading && e.openingReading ? (e.closingReading - e.openingReading) : null);
        equipmentData.push({
          Date: format(new Date(dpr.date), "dd/MM/yyyy"),
          Site: getBaseSiteName(dpr.site),
          Machine: e.machine || "",
          Operator: e.operator || "",
          Task: e.task || "",
          "Start Time": e.startTime || "",
          "End Time": e.endTime || "",
          "Opening Reading": e.openingReading ?? "",
          "Closing Reading": e.closingReading ?? "",
          "Hours Worked": hours?.toFixed(1) || "",
          "Diesel (L)": e.diesel || 0,
        });
      });
    });
    if (equipmentData.length > 0) {
      const equipmentSheet = XLSX.utils.json_to_sheet(equipmentData);
      XLSX.utils.book_append_sheet(wb, equipmentSheet, "Equipment");
    }
    
    // Labour Details sheet
    const labourData: any[] = [];
    dprs.forEach((dpr: any) => {
      dpr.labour?.forEach((l: any) => {
        labourData.push({
          Date: format(new Date(dpr.date), "dd/MM/yyyy"),
          Site: getBaseSiteName(dpr.site),
          Category: l.category || "",
          Gender: l.gender || "",
          Count: l.count || 0,
        });
      });
    });
    if (labourData.length > 0) {
      const labourSheet = XLSX.utils.json_to_sheet(labourData);
      XLSX.utils.book_append_sheet(wb, labourSheet, "Labour");
    }
    
    // Materials Details sheet
    const materialsData: any[] = [];
    dprs.forEach((dpr: any) => {
      dpr.materials?.forEach((m: any) => {
        materialsData.push({
          Date: format(new Date(dpr.date), "dd/MM/yyyy"),
          Site: getBaseSiteName(dpr.site),
          Type: m.type || "",
          Material: m.material || "",
          Quantity: m.quantity || 0,
          UOM: m.uom || "",
          "Vehicle Number": m.vehicleNumber || "",
          Supplier: m.supplier || "",
        });
      });
    });
    if (materialsData.length > 0) {
      const materialsSheet = XLSX.utils.json_to_sheet(materialsData);
      XLSX.utils.book_append_sheet(wb, materialsSheet, "Materials");
    }
    
    const fileName = `SiteReports_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({ title: "Export Complete", description: `Downloaded ${fileName} with ${dprs.length} reports` });
  };

  const exportReportsToPDF = () => {
    if (!dprs || dprs.length === 0) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let yPos = 15;
    
    // Header
    doc.setFontSize(16);
    doc.text("High Lane Constructions Pvt Ltd", pageWidth / 2, yPos, { align: "center" });
    yPos += 7;
    doc.setFontSize(12);
    doc.text("Daily Progress Reports - Detailed", pageWidth / 2, yPos, { align: "center" });
    yPos += 6;
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, pageWidth / 2, yPos, { align: "center" });
    yPos += 8;
    
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
      doc.setFontSize(9);
      doc.text(`Filters: ${filterLines.join(" | ")}`, 14, yPos);
      yPos += 6;
    }
    
    // Iterate through each DPR with full details
    dprs.forEach((dpr: any, index: number) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 15;
      }
      
      // DPR Header
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${index + 1}. ${getBaseSiteName(dpr.site)}`, 14, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Date: ${format(new Date(dpr.date), "dd MMM yyyy")} | Engineer: ${dpr.engineer} | Role: ${dpr.role || "N/A"}`, 14, yPos);
      yPos += 6;
      
      // Progress Entries
      if (dpr.progress?.length > 0) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Progress Entries:", 14, yPos);
        yPos += 4;
        doc.setFont("helvetica", "normal");
        
        const progressRows = dpr.progress.map((p: any) => [
          p.activity || "",
          p.side || "",
          `${p.chainageFrom || ""} - ${p.chainageTo || ""}`,
          `${p.length || 0} x ${p.width || 0} x ${p.thickness || 0}`,
          `${p.quantity || 0} ${p.uom || ""}`,
        ]);
        
        autoTable(doc, {
          startY: yPos,
          head: [["Activity", "Side", "Chainage", "L x W x T", "Quantity"]],
          body: progressRows,
          theme: 'grid',
          headStyles: { fillColor: [100, 100, 100], fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 4;
      }
      
      // Equipment Logs
      if (dpr.equipment?.length > 0) {
        if (yPos > 250) { doc.addPage(); yPos = 15; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Equipment Log:", 14, yPos);
        yPos += 4;
        doc.setFont("helvetica", "normal");
        
        const equipRows = dpr.equipment.map((e: any) => {
          const hours = e.hoursWorked || (e.closingReading && e.openingReading ? (e.closingReading - e.openingReading) : null);
          const readingSource = e.openingReading != null && e.closingReading != null 
            ? `Meter: ${e.openingReading}-${e.closingReading}`
            : (e.startTime && e.endTime ? `Time: ${e.startTime}-${e.endTime}` : "-");
          return [
            e.machine || "",
            e.operator || "",
            readingSource,
            hours?.toFixed(1) || "-",
            `${e.diesel || 0} L`,
          ];
        });
        
        autoTable(doc, {
          startY: yPos,
          head: [["Machine", "Operator", "Reading", "Hours", "Diesel"]],
          body: equipRows,
          theme: 'grid',
          headStyles: { fillColor: [100, 100, 100], fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 4;
      }
      
      // Labour
      if (dpr.labour?.length > 0) {
        if (yPos > 250) { doc.addPage(); yPos = 15; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Labour Strength:", 14, yPos);
        yPos += 4;
        doc.setFont("helvetica", "normal");
        
        const labourRows = dpr.labour.map((l: any) => [
          l.category || "",
          l.gender || "",
          l.count || 0,
          l.task || "",
        ]);
        
        autoTable(doc, {
          startY: yPos,
          head: [["Category", "Gender", "Count", "Task/Work"]],
          body: labourRows,
          theme: 'grid',
          headStyles: { fillColor: [100, 100, 100], fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 4;
      }
      
      // Materials
      if (dpr.materials?.length > 0) {
        if (yPos > 250) { doc.addPage(); yPos = 15; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Materials:", 14, yPos);
        yPos += 4;
        doc.setFont("helvetica", "normal");
        
        const matRows = dpr.materials.map((m: any) => [
          m.material || "",
          `${m.quantity || 0} ${m.uom || ""}`,
          m.vehicleNumber || "",
          m.supplier || "",
        ]);
        
        autoTable(doc, {
          startY: yPos,
          head: [["Material", "Quantity", "Vehicle", "Supplier"]],
          body: matRows,
          theme: 'grid',
          headStyles: { fillColor: [100, 100, 100], fontSize: 7 },
          styles: { fontSize: 7, cellPadding: 1 },
          margin: { left: 14, right: 14 },
        });
        yPos = (doc as any).lastAutoTable.finalY + 4;
      }
      
      // Add separator line between reports
      if (index < dprs.length - 1) {
        yPos += 2;
        doc.setDrawColor(200, 200, 200);
        doc.line(14, yPos, pageWidth - 14, yPos);
        yPos += 6;
      }
    });
    
    const fileName = `SiteReports_Detailed_${format(new Date(), "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
    toast({ title: "Export Complete", description: `Downloaded ${fileName} with ${dprs.length} detailed reports` });
  };

  const handlePrint = () => {
    if (!dprs || dprs.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow pop-ups to print the report');
      return;
    }

    const styles = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; font-size: 11px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { font-size: 18px; margin-bottom: 5px; }
        .header p { font-size: 11px; color: #666; }
        .filters-info { background: #f5f5f5; padding: 8px; margin-bottom: 15px; border-radius: 4px; font-size: 10px; }
        .report-card { border: 1px solid #ddd; margin-bottom: 15px; border-radius: 4px; page-break-inside: avoid; }
        .report-header { background: #f8f8f8; padding: 10px; border-bottom: 1px solid #ddd; }
        .report-site { font-weight: 600; font-size: 13px; }
        .report-meta { font-size: 10px; color: #666; margin-top: 3px; }
        .report-body { padding: 10px; }
        .section { margin-bottom: 10px; }
        .section-title { font-weight: 600; font-size: 10px; margin-bottom: 5px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 2px; }
        table { width: 100%; border-collapse: collapse; font-size: 9px; }
        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
        th { background: #f0f0f0; font-weight: 600; }
        .summary { margin-top: 20px; padding-top: 15px; border-top: 2px solid #333; text-align: center; font-size: 11px; }
        @media print { 
          body { padding: 10px; } 
          .report-card { page-break-inside: avoid; }
        }
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

    const reportsHtml = dprs?.map((dpr: any, index: number) => {
      // Progress table
      let progressHtml = "";
      if (dpr.progress?.length > 0) {
        progressHtml = `
          <div class="section">
            <div class="section-title">Progress Entries</div>
            <table>
              <tr><th>Activity</th><th>Side</th><th>Chainage</th><th>L x W x T</th><th>Quantity</th></tr>
              ${dpr.progress.map((p: any) => `
                <tr>
                  <td>${p.activity || ""}</td>
                  <td>${p.side || ""}</td>
                  <td>${p.chainageFrom || ""} - ${p.chainageTo || ""}</td>
                  <td>${p.length || 0} x ${p.width || 0} x ${p.thickness || 0}</td>
                  <td>${p.quantity || 0} ${p.uom || ""}</td>
                </tr>
              `).join("")}
            </table>
          </div>
        `;
      }

      // Equipment table
      let equipmentHtml = "";
      if (dpr.equipment?.length > 0) {
        equipmentHtml = `
          <div class="section">
            <div class="section-title">Equipment Log</div>
            <table>
              <tr><th>Machine</th><th>Operator</th><th>Reading</th><th>Hours</th><th>Diesel</th></tr>
              ${dpr.equipment.map((e: any) => {
                const hours = e.hoursWorked || (e.closingReading && e.openingReading ? (e.closingReading - e.openingReading) : null);
                const readingSource = e.openingReading != null && e.closingReading != null 
                  ? `Meter: ${e.openingReading}-${e.closingReading}`
                  : (e.startTime && e.endTime ? `Time: ${e.startTime}-${e.endTime}` : "-");
                return `
                  <tr>
                    <td>${e.machine || ""}</td>
                    <td>${e.operator || ""}</td>
                    <td>${readingSource}</td>
                    <td>${hours?.toFixed(1) || "-"}</td>
                    <td>${e.diesel || 0} L</td>
                  </tr>
                `;
              }).join("")}
            </table>
          </div>
        `;
      }

      // Labour table
      let labourHtml = "";
      if (dpr.labour?.length > 0) {
        labourHtml = `
          <div class="section">
            <div class="section-title">Labour Strength</div>
            <table>
              <tr><th>Category</th><th>Gender</th><th>Count</th><th>Task/Work</th></tr>
              ${dpr.labour.map((l: any) => `
                <tr>
                  <td>${l.category || ""}</td>
                  <td>${l.gender || ""}</td>
                  <td>${l.count || 0}</td>
                  <td>${l.task || ""}</td>
                </tr>
              `).join("")}
            </table>
          </div>
        `;
      }

      // Materials table
      let materialsHtml = "";
      if (dpr.materials?.length > 0) {
        materialsHtml = `
          <div class="section">
            <div class="section-title">Materials</div>
            <table>
              <tr><th>Material</th><th>Quantity</th><th>Vehicle</th><th>Supplier</th></tr>
              ${dpr.materials.map((m: any) => `
                <tr>
                  <td>${m.material || ""}</td>
                  <td>${m.quantity || 0} ${m.uom || ""}</td>
                  <td>${m.vehicleNumber || ""}</td>
                  <td>${m.supplier || ""}</td>
                </tr>
              `).join("")}
            </table>
          </div>
        `;
      }

      return `
        <div class="report-card">
          <div class="report-header">
            <div class="report-site">${index + 1}. ${getBaseSiteName(dpr.site)}</div>
            <div class="report-meta">Date: ${format(new Date(dpr.date), "dd MMM yyyy")} | Engineer: ${dpr.engineer} | Role: ${dpr.role || "N/A"}</div>
          </div>
          <div class="report-body">
            ${progressHtml}
            ${equipmentHtml}
            ${labourHtml}
            ${materialsHtml}
            ${!progressHtml && !equipmentHtml && !labourHtml && !materialsHtml ? '<p style="color:#999;font-style:italic;">No entries recorded</p>' : ''}
          </div>
        </div>
      `;
    }).join('') || '';

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
            <p>Daily Progress Reports - Detailed</p>
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
                <div className="flex items-center justify-between px-1">
                  <div className="text-sm text-muted-foreground">
                    Showing {dprs.length} report{dprs.length !== 1 ? 's' : ''}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setExpandedReports(new Set(dprs.map((d: any) => d.id)))}
                      disabled={expandedReports.size === dprs.length}
                      data-testid="button-expand-all"
                    >
                      <ChevronsDown className="w-4 h-4 mr-1" />
                      Expand All
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setExpandedReports(new Set())}
                      disabled={expandedReports.size === 0}
                      data-testid="button-collapse-all"
                    >
                      <ChevronsUp className="w-4 h-4 mr-1" />
                      Collapse All
                    </Button>
                  </div>
                </div>
                {dprs.map((dpr: any) => {
                  const isExpanded = expandedReports.has(dpr.id);
                  const toggleExpand = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpandedReports(prev => {
                      const next = new Set(prev);
                      if (next.has(dpr.id)) {
                        next.delete(dpr.id);
                      } else {
                        next.add(dpr.id);
                      }
                      return next;
                    });
                  };
                  
                  return (
                    <Card key={dpr.id} className="transition-all" data-testid={`card-report-${dpr.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
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
                          <div className="flex items-center gap-2">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={toggleExpand}
                              data-testid={`button-expand-${dpr.id}`}
                            >
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                            <Link href={appendOrigin(`/site/report/${dpr.id}`)}>
                              <Button size="sm" variant="outline" className="gap-1" data-testid={`button-view-${dpr.id}`}>
                                <ExternalLink className="w-3 h-3" />
                                View
                              </Button>
                            </Link>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t space-y-4">
                            {/* Progress Entries */}
                            {dpr.progress && dpr.progress.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                  <Calendar className="w-4 h-4" /> Progress Entries
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-muted/50">
                                        <th className="text-left p-2 border">Activity</th>
                                        <th className="text-left p-2 border">Side</th>
                                        <th className="text-left p-2 border">Chainage</th>
                                        <th className="text-right p-2 border">L×W×T</th>
                                        <th className="text-right p-2 border">Qty</th>
                                        <th className="text-left p-2 border">UOM</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dpr.progress.map((p: any, i: number) => (
                                        <tr key={i} className="border-b">
                                          <td className="p-2 border">{p.activity || "-"}</td>
                                          <td className="p-2 border">{p.side || "-"}</td>
                                          <td className="p-2 border">{p.chainageFrom} - {p.chainageTo}</td>
                                          <td className="p-2 border text-right">{p.length || 0}×{p.width || 0}×{p.thickness || 0}</td>
                                          <td className="p-2 border text-right">{p.quantity?.toFixed(2) || "-"}</td>
                                          <td className="p-2 border">{p.uom || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            {/* Equipment Log */}
                            {dpr.equipment && dpr.equipment.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                  <Wrench className="w-4 h-4" /> Equipment Log
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-muted/50">
                                        <th className="text-left p-2 border">Machine</th>
                                        <th className="text-left p-2 border">Vehicle No</th>
                                        <th className="text-left p-2 border">Operator</th>
                                        <th className="text-left p-2 border">Task</th>
                                        <th className="text-left p-2 border">Time/Meter</th>
                                        <th className="text-right p-2 border">Hours</th>
                                        <th className="text-right p-2 border">Diesel (L)</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dpr.equipment.map((e: any, i: number) => {
                                        const hasMeter = e.openingReading != null && e.closingReading != null;
                                        const hasTime = e.startTime && e.endTime;
                                        const meterHours = hasMeter ? e.closingReading - e.openingReading : null;
                                        // Calculate hours from time if not stored and time entries exist
                                        let timeHours: number | null = null;
                                        if (hasTime && !e.hoursWorked && !hasMeter) {
                                          const [startH, startM] = e.startTime.split(':').map(Number);
                                          const [endH, endM] = e.endTime.split(':').map(Number);
                                          const startMins = startH * 60 + startM;
                                          const endMins = endH * 60 + endM;
                                          timeHours = (endMins - startMins) / 60;
                                          if (timeHours < 0) timeHours += 24; // Handle overnight
                                        }
                                        const hours = e.hoursWorked || meterHours || timeHours;
                                        const sourceLabel = hasMeter 
                                          ? `Meter: ${e.openingReading} - ${e.closingReading}`
                                          : hasTime
                                            ? `Time: ${e.startTime} - ${e.endTime}`
                                            : "-";
                                        return (
                                          <tr key={i} className="border-b">
                                            <td className="p-2 border">{e.machine || "-"}</td>
                                            <td className="p-2 border">{e.vehicleNo || "-"}</td>
                                            <td className="p-2 border">{e.operator || "-"}</td>
                                            <td className="p-2 border">{e.task || "-"}</td>
                                            <td className="p-2 border">{sourceLabel}</td>
                                            <td className="p-2 border text-right">{hours != null ? hours.toFixed(1) : "-"}</td>
                                            <td className="p-2 border text-right">{e.diesel?.toFixed(1) || "-"}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            {/* Labour Strength */}
                            {dpr.labour && dpr.labour.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                  <Users className="w-4 h-4" /> Labour Strength
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-muted/50">
                                        <th className="text-left p-2 border">Category</th>
                                        <th className="text-left p-2 border">Gender</th>
                                        <th className="text-right p-2 border">Count</th>
                                        <th className="text-left p-2 border">Task/Work</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dpr.labour.map((l: any, i: number) => (
                                        <tr key={i} className="border-b">
                                          <td className="p-2 border">{l.category || "-"}</td>
                                          <td className="p-2 border">{l.gender || "-"}</td>
                                          <td className="p-2 border text-right">{l.count || 0}</td>
                                          <td className="p-2 border">{l.task || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            {/* Materials */}
                            {dpr.materials && dpr.materials.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                  <Package className="w-4 h-4" /> Materials
                                </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-muted/50">
                                        <th className="text-left p-2 border">Type</th>
                                        <th className="text-left p-2 border">Material</th>
                                        <th className="text-right p-2 border">Quantity</th>
                                        <th className="text-left p-2 border">UOM</th>
                                        <th className="text-left p-2 border">Vehicle</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dpr.materials.map((m: any, i: number) => (
                                        <tr key={i} className="border-b">
                                          <td className="p-2 border">{m.type || "-"}</td>
                                          <td className="p-2 border">{m.material || "-"}</td>
                                          <td className="p-2 border text-right">{m.quantity?.toFixed(2) || "-"}</td>
                                          <td className="p-2 border">{m.uom || "-"}</td>
                                          <td className="p-2 border">{m.vehicleNumber || "-"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
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
