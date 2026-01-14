import { useState, useRef, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useDprs } from "@/hooks/use-dprs";
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
  MapPin, 
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  HardHat,
  Printer,
  Filter,
  X,
  Package,
  FileSpreadsheet,
  FileText,
  ChevronsUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays, parseISO } from "date-fns";

// Helper to strip "Edited by..." suffix from site names
function getBaseSiteName(site: string): string {
  // Pattern: "Site Name – Edited by Role – YYYY-MM-DD HH:MM:SS"
  const editedPattern = / – Edited by .+$/;
  return site.replace(editedPattern, "").trim();
}

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

interface DateGroupedMaterials {
  date: string;
  formattedDate: string;
  materials: { material: string; trips: number; quantity: number; uom: string }[];
  totalTrips: number;
  totalQuantity: number;
  logs: SiteMaterialLog[];
}

interface EquipmentLogEntry {
  id: number;
  dprId: number;
  date: string;
  site: string;
  machine: string;
  operator: string | null;
  startTime: string | null;
  endTime: string | null;
  diesel: number | null;
  task: string | null;
}

export default function SiteDashboard() {
  const { toast } = useToast();
  const { isAdmin, setAccess } = useAccess();
  const [activeTab, setActiveTab] = useState("reports");
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingAction, setPendingAction] = useState<"excel" | "pdf" | "print" | "reports-excel" | "reports-pdf" | "reports-print" | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
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
  
  const [materialFilters, setMaterialFilters] = useState({
    site: "",
    material: "",
    engineer: "",
    activity: "",
    equipment: "",
    hasDiesel: false,
    dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
  });
  
  const printRef = useRef<HTMLDivElement>(null);
  const materialPrintRef = useRef<HTMLDivElement>(null);
  
  const { getBackLink, appendOrigin } = useOrigin();
  const backLink = getBackLink("/site");
  
  // Use detailed DPR data for advanced filtering
  // Only send date filters to server; site/engineer/activity/equipment/diesel are filtered client-side
  const dateFilters = useMemo(() => ({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }), [filters.dateFrom, filters.dateTo]);
  
  // Date filters for Dashboard tab - needs to use materialFilters dates for cross-reference
  const materialDateFilters = useMemo(() => ({
    dateFrom: materialFilters.dateFrom,
    dateTo: materialFilters.dateTo,
  }), [materialFilters.dateFrom, materialFilters.dateTo]);
  
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
  
  // Separate query for DPRs with materialFilters dates - used for Dashboard tab cross-reference filtering
  const { data: dprsForMaterialTab } = useQuery<any[]>({
    queryKey: ["/api/dprs/with-details", materialDateFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (materialDateFilters.dateFrom) params.set("dateFrom", materialDateFilters.dateFrom);
      if (materialDateFilters.dateTo) params.set("dateTo", materialDateFilters.dateTo);
      const queryString = params.toString();
      const url = queryString ? `/api/dprs/with-details?${queryString}` : "/api/dprs/with-details";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch DPRs");
      return res.json();
    },
    enabled: activeTab === "materials",
  });
  
  // Client-side filtering for all filters (site, engineer, activity, equipment, diesel)
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
  // Also clean site names by stripping "Edited by..." suffix
  // Filter by engineer, activity, equipment, and diesel usage using dprsForMaterialTab (which uses materialFilters dates)
  const materialLogs = useMemo(() => {
    if (!allMaterialLogs) return undefined;
    const cleanedLogs = allMaterialLogs.map(log => ({
      ...log,
      site: getBaseSiteName(log.site),
    }));
    
    // Apply material filter
    let filtered = cleanedLogs;
    if (materialFilters.material) {
      filtered = filtered.filter(log => log.material === materialFilters.material);
    }
    
    // Apply filters based on matching DPR records (engineer, activity, equipment, diesel)
    // Use dprsForMaterialTab which fetches DPRs with the same date range as material logs
    if (dprsForMaterialTab && (materialFilters.engineer || materialFilters.activity || materialFilters.equipment || materialFilters.hasDiesel)) {
      // Create a set of valid (date, site) combinations from filtered DPRs
      const validDprKeys = new Set<string>();
      dprsForMaterialTab.forEach((dpr: any) => {
        const baseSite = getBaseSiteName(dpr.site);
        const dprDate = dpr.date;
        
        // Check engineer filter
        if (materialFilters.engineer && dpr.engineer !== materialFilters.engineer) return;
        
        // Check activity filter
        if (materialFilters.activity) {
          const hasActivity = dpr.progress?.some((p: any) => p.activity === materialFilters.activity);
          if (!hasActivity) return;
        }
        
        // Check equipment filter
        if (materialFilters.equipment) {
          const hasEquipment = dpr.equipment?.some((e: any) => e.machine === materialFilters.equipment);
          if (!hasEquipment) return;
        }
        
        // Check diesel filter
        if (materialFilters.hasDiesel) {
          const hasDieselUsage = dpr.equipment?.some((e: any) => e.diesel && e.diesel > 0);
          if (!hasDieselUsage) return;
        }
        
        validDprKeys.add(`${dprDate}|${baseSite}`);
      });
      
      // Filter material logs to only those matching valid DPR records
      filtered = filtered.filter(log => validDprKeys.has(`${log.date}|${log.site}`));
    }
    
    return filtered;
  }, [allMaterialLogs, materialFilters.material, materialFilters.engineer, materialFilters.activity, materialFilters.equipment, materialFilters.hasDiesel, dprsForMaterialTab]);
  
  const uniqueMaterialsForDashboard = useMemo(() => {
    if (!allMaterialLogs) return [];
    const materials = Array.from(new Set(allMaterialLogs.map((log) => log.material).filter(Boolean)));
    return materials.sort();
  }, [allMaterialLogs]);

  // Extract equipment logs from DPRs for Dashboard tab display
  const equipmentLogs = useMemo((): EquipmentLogEntry[] => {
    if (!dprsForMaterialTab) return [];
    
    const logs: EquipmentLogEntry[] = [];
    
    dprsForMaterialTab.forEach((dpr: any) => {
      const baseSite = getBaseSiteName(dpr.site);
      const dprDate = dpr.date;
      
      // Apply site filter
      if (materialFilters.site && baseSite !== materialFilters.site) return;
      
      // Apply engineer filter
      if (materialFilters.engineer && dpr.engineer !== materialFilters.engineer) return;
      
      // Apply activity filter
      if (materialFilters.activity) {
        const hasActivity = dpr.progress?.some((p: any) => p.activity === materialFilters.activity);
        if (!hasActivity) return;
      }
      
      // Apply diesel filter (at DPR level)
      if (materialFilters.hasDiesel) {
        const hasDieselUsage = dpr.equipment?.some((e: any) => e.diesel && e.diesel > 0);
        if (!hasDieselUsage) return;
      }
      
      // Add equipment logs from this DPR
      dpr.equipment?.forEach((equip: any) => {
        // Apply equipment filter if specified
        if (materialFilters.equipment && equip.machine !== materialFilters.equipment) return;
        
        logs.push({
          id: equip.id,
          dprId: dpr.id,
          date: dprDate,
          site: baseSite,
          machine: equip.machine,
          operator: equip.operator,
          startTime: equip.startTime,
          endTime: equip.endTime,
          diesel: equip.diesel,
          task: equip.task,
        });
      });
    });
    
    // Sort by date descending, then by machine
    return logs.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.machine.localeCompare(b.machine);
    });
  }, [dprsForMaterialTab, materialFilters.site, materialFilters.engineer, materialFilters.activity, materialFilters.equipment, materialFilters.hasDiesel]);

  // Calculate equipment summary totals
  const equipmentTotals = useMemo(() => {
    const totals = new Map<string, { count: number; totalDiesel: number }>();
    
    for (const log of equipmentLogs) {
      const existing = totals.get(log.machine) || { count: 0, totalDiesel: 0 };
      existing.count += 1;
      existing.totalDiesel += log.diesel || 0;
      totals.set(log.machine, existing);
    }
    
    return totals;
  }, [equipmentLogs]);

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

  // Unique lists for Dashboard tab - uses dprsForMaterialTab (same date range as material logs)
  const uniqueSitesForMaterials = useMemo(() => {
    if (!dprsForMaterialTab) return [];
    const sites = new Set<string>();
    dprsForMaterialTab.forEach((dpr: any) => {
      sites.add(getBaseSiteName(dpr.site));
    });
    return Array.from(sites).sort();
  }, [dprsForMaterialTab]);

  const uniqueEngineersForMaterials = useMemo(() => {
    if (!dprsForMaterialTab) return [];
    const engineers = new Set<string>();
    dprsForMaterialTab.forEach((dpr: any) => {
      if (dpr.engineer) engineers.add(dpr.engineer);
    });
    return Array.from(engineers).sort();
  }, [dprsForMaterialTab]);

  const uniqueActivitiesForMaterials = useMemo(() => {
    if (!dprsForMaterialTab) return [];
    const activities = new Set<string>();
    dprsForMaterialTab.forEach((dpr: any) => {
      dpr.progress?.forEach((p: any) => {
        if (p.activity) activities.add(p.activity);
      });
    });
    return Array.from(activities).sort();
  }, [dprsForMaterialTab]);

  const uniqueEquipmentForMaterials = useMemo(() => {
    if (!dprsForMaterialTab) return [];
    const equipment = new Set<string>();
    dprsForMaterialTab.forEach((dpr: any) => {
      dpr.equipment?.forEach((e: any) => {
        if (e.machine) equipment.add(e.machine);
      });
    });
    return Array.from(equipment).sort();
  }, [dprsForMaterialTab]);

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

  const clearMaterialFilters = () => {
    setMaterialFilters({
      site: "",
      material: "",
      engineer: "",
      activity: "",
      equipment: "",
      hasDiesel: false,
      dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      dateTo: format(new Date(), "yyyy-MM-dd"),
    });
  };

  const hasActiveFilters = filters.site || filters.engineer || filters.dateFrom || filters.dateTo || filters.activity || filters.equipment || filters.hasDiesel || filters.material;
  const hasMaterialFilters = materialFilters.site || materialFilters.material || materialFilters.engineer || materialFilters.activity || materialFilters.equipment || materialFilters.hasDiesel || materialFilters.dateFrom || materialFilters.dateTo;
  
  // Check if any non-date filter is applied (determines whether to show data)
  const hasNonDateFilters = materialFilters.site || materialFilters.material || materialFilters.engineer || materialFilters.activity || materialFilters.equipment || materialFilters.hasDiesel;
  
  // Determine what type of data to show based on which filter is applied
  // Priority: Equipment/Diesel filters → Equipment only; Material filter → Materials only; Site/Engineer/Activity → Full report
  const showEquipmentOnly = (materialFilters.equipment || materialFilters.hasDiesel) && !materialFilters.material && !materialFilters.site && !materialFilters.engineer && !materialFilters.activity;
  const showMaterialsOnly = materialFilters.material && !materialFilters.equipment && !materialFilters.hasDiesel && !materialFilters.site && !materialFilters.engineer && !materialFilters.activity;
  const showFullReport = materialFilters.site || materialFilters.engineer || materialFilters.activity;

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

  // Group material logs by date with totals
  const dateGroupedMaterials = useMemo((): DateGroupedMaterials[] => {
    if (!materialLogs) return [];
    
    const grouped: Record<string, DateGroupedMaterials> = {};
    
    for (const log of materialLogs) {
      const dateKey = log.date;
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: dateKey,
          formattedDate: format(parseISO(dateKey), "dd MMM yyyy"),
          materials: [],
          totalTrips: 0,
          totalQuantity: 0,
          logs: [],
        };
      }
      
      grouped[dateKey].logs.push(log);
      grouped[dateKey].totalTrips += 1;
      grouped[dateKey].totalQuantity += log.quantity || 0;
      
      // Aggregate by material
      const existingMaterial = grouped[dateKey].materials.find(m => m.material === log.material && m.uom === (log.uom || ""));
      if (existingMaterial) {
        existingMaterial.trips += 1;
        existingMaterial.quantity += log.quantity || 0;
      } else {
        grouped[dateKey].materials.push({
          material: log.material,
          trips: 1,
          quantity: log.quantity || 0,
          uom: log.uom || "",
        });
      }
    }
    
    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
  }, [materialLogs]);

  const toggleDateExpand = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const expandAll = () => {
    setExpandedDates(new Set(dateGroupedMaterials.map(g => g.date)));
  };

  const collapseAll = () => {
    setExpandedDates(new Set());
  };

  // Admin action handlers
  const handleAdminAction = (action: "excel" | "pdf" | "print" | "reports-excel" | "reports-pdf" | "reports-print") => {
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

  const executeAction = (action: "excel" | "pdf" | "print" | "reports-excel" | "reports-pdf" | "reports-print") => {
    switch (action) {
      case "excel":
        exportMaterialsToExcel();
        break;
      case "pdf":
        exportMaterialsToPDF();
        break;
      case "print":
        handleMaterialPrint();
        break;
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

  const exportMaterialsToExcel = () => {
    if (!materialLogs) return;
    
    const wb = XLSX.utils.book_new();
    
    // Summary sheet - grouped by date
    const summaryData = dateGroupedMaterials.map(group => ({
      Date: group.formattedDate,
      'Total Trips': group.totalTrips,
      'Total Quantity': group.totalQuantity.toFixed(2),
      'Materials': group.materials.map(m => `${m.material} (${m.trips} trips, ${m.quantity.toFixed(2)} ${m.uom})`).join("; "),
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary by Date");
    
    // Detailed logs sheet
    const detailedData = materialLogs.map(log => ({
      Date: format(parseISO(log.date), "dd/MM/yyyy"),
      Site: log.site,
      Type: log.type,
      Material: log.material,
      Quantity: log.quantity?.toFixed(2) || "",
      UOM: log.uom || "",
      Supplier: log.supplier || "",
      Vehicle: log.vehicleNumber || "",
    }));
    const detailedSheet = XLSX.utils.json_to_sheet(detailedData);
    XLSX.utils.book_append_sheet(wb, detailedSheet, "Detailed Logs");
    
    // Material totals sheet
    const totalsData: any[] = [];
    materialTotals.received.forEach((value, key) => {
      const [material] = key.split("-");
      totalsData.push({ Type: "Received", Material: material, Quantity: value.quantity.toFixed(2), UOM: value.uom });
    });
    materialTotals.issued.forEach((value, key) => {
      const [material] = key.split("-");
      totalsData.push({ Type: "Issued", Material: material, Quantity: value.quantity.toFixed(2), UOM: value.uom });
    });
    if (totalsData.length > 0) {
      const totalsSheet = XLSX.utils.json_to_sheet(totalsData);
      XLSX.utils.book_append_sheet(wb, totalsSheet, "Material Totals");
    }
    
    const fileName = `MaterialLogs_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast({ title: "Export Complete", description: `Downloaded ${fileName}` });
  };

  const exportMaterialsToPDF = () => {
    if (!materialLogs) return;
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(16);
    doc.text("High Lane Constructions Pvt Ltd", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(12);
    doc.text("Material Log Summary", pageWidth / 2, 22, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, pageWidth / 2, 28, { align: "center" });
    
    // Filters info
    const filterLines = [];
    if (materialFilters.dateFrom) filterLines.push(`From: ${format(parseISO(materialFilters.dateFrom), "dd MMM yyyy")}`);
    if (materialFilters.dateTo) filterLines.push(`To: ${format(parseISO(materialFilters.dateTo), "dd MMM yyyy")}`);
    if (materialFilters.site) filterLines.push(`Site: ${materialFilters.site}`);
    if (materialFilters.material) filterLines.push(`Material: ${materialFilters.material}`);
    if (materialFilters.engineer) filterLines.push(`Engineer: ${materialFilters.engineer}`);
    if (materialFilters.activity) filterLines.push(`Activity: ${materialFilters.activity}`);
    if (materialFilters.equipment) filterLines.push(`Equipment: ${materialFilters.equipment}`);
    if (materialFilters.hasDiesel) filterLines.push(`Diesel Usage: Yes`);
    if (filterLines.length > 0) {
      doc.text(`Filters: ${filterLines.join(" | ")}`, 14, 36);
    }
    
    // Summary table by date
    const summaryRows = dateGroupedMaterials.map(group => [
      group.formattedDate,
      group.totalTrips.toString(),
      group.totalQuantity.toFixed(2),
      group.materials.map(m => m.material).join(", "),
    ]);
    
    autoTable(doc, {
      startY: 42,
      head: [["Date", "Trips", "Total Qty", "Materials"]],
      body: summaryRows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [245, 158, 11] },
    });
    
    const fileName = `MaterialLogs_${format(new Date(), "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
    toast({ title: "Export Complete", description: `Downloaded ${fileName}` });
  };

  const handleMaterialPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Error", description: "Please allow pop-ups to print", variant: "destructive" });
      return;
    }
    
    const styles = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .header h1 { font-size: 18px; margin-bottom: 5px; }
        .header p { font-size: 11px; color: #666; }
        .filters { background: #f5f5f5; padding: 8px; margin-bottom: 15px; border-radius: 4px; }
        .date-group { margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; }
        .date-header { background: #f59e0b; color: white; padding: 8px 12px; font-weight: bold; display: flex; justify-content: space-between; }
        .date-content { padding: 10px; }
        .material-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; }
        .material-row:last-child { border-bottom: none; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background: #f5f5f5; }
        @media print { body { padding: 10px; } }
      </style>
    `;
    
    const filterLines = [];
    if (materialFilters.dateFrom) filterLines.push(`From: ${format(parseISO(materialFilters.dateFrom), "dd MMM yyyy")}`);
    if (materialFilters.dateTo) filterLines.push(`To: ${format(parseISO(materialFilters.dateTo), "dd MMM yyyy")}`);
    if (materialFilters.site) filterLines.push(`Site: ${materialFilters.site}`);
    if (materialFilters.material) filterLines.push(`Material: ${materialFilters.material}`);
    if (materialFilters.engineer) filterLines.push(`Engineer: ${materialFilters.engineer}`);
    if (materialFilters.activity) filterLines.push(`Activity: ${materialFilters.activity}`);
    if (materialFilters.equipment) filterLines.push(`Equipment: ${materialFilters.equipment}`);
    if (materialFilters.hasDiesel) filterLines.push(`Diesel Usage: Yes`);
    
    const groupsHtml = dateGroupedMaterials.map(group => `
      <div class="date-group">
        <div class="date-header">
          <span>${group.formattedDate}</span>
          <span>${group.totalTrips} trips | ${group.totalQuantity.toFixed(2)} qty</span>
        </div>
        <div class="date-content">
          ${group.materials.map(m => `
            <div class="material-row">
              <span>${m.material}</span>
              <span>${m.trips} trips | ${m.quantity.toFixed(2)} ${m.uom}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Material Logs - High Lane Constructions Pvt Ltd</title>
          ${styles}
        </head>
        <body>
          <div class="header">
            <h1>High Lane Constructions Pvt Ltd</h1>
            <p>Material Log Summary</p>
            <p>Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}</p>
          </div>
          ${filterLines.length > 0 ? `<div class="filters"><strong>Filters:</strong> ${filterLines.join(' | ')}</div>` : ''}
          ${groupsHtml}
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
          {activeTab === "reports" && (
            <>
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
            Dashboard
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
                      {uniqueSitesForMaterials.map((site) => (
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
                      {uniqueMaterialsForDashboard.map((material) => (
                        <SelectItem key={material} value={material}>{material}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Engineer</Label>
                  <Select 
                    value={materialFilters.engineer || "all"} 
                    onValueChange={(value) => setMaterialFilters({ ...materialFilters, engineer: value === "all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-dashboard-engineer">
                      <SelectValue placeholder="All Engineers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Engineers</SelectItem>
                      {uniqueEngineersForMaterials.map((engineer) => (
                        <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Activity</Label>
                  <Select 
                    value={materialFilters.activity || "all"} 
                    onValueChange={(value) => setMaterialFilters({ ...materialFilters, activity: value === "all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-dashboard-activity">
                      <SelectValue placeholder="All Activities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Activities</SelectItem>
                      {uniqueActivitiesForMaterials.map((activity) => (
                        <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Equipment</Label>
                  <Select 
                    value={materialFilters.equipment || "all"} 
                    onValueChange={(value) => setMaterialFilters({ ...materialFilters, equipment: value === "all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-dashboard-equipment">
                      <SelectValue placeholder="All Equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Equipment</SelectItem>
                      {uniqueEquipmentForMaterials.map((equip) => (
                        <SelectItem key={equip} value={equip}>{equip}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Diesel Usage</Label>
                  <Select 
                    value={materialFilters.hasDiesel ? "yes" : "all"} 
                    onValueChange={(value) => setMaterialFilters({ ...materialFilters, hasDiesel: value === "yes" })}
                  >
                    <SelectTrigger data-testid="select-dashboard-diesel">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Reports</SelectItem>
                      <SelectItem value="yes">With Diesel Usage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Admin Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleAdminAction("excel")} 
              className="gap-1"
              data-testid="button-export-excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Excel
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleAdminAction("pdf")} 
              className="gap-1"
              data-testid="button-export-pdf"
            >
              <FileText className="w-4 h-4" />
              PDF
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleAdminAction("print")} 
              className="gap-1"
              data-testid="button-print-materials"
            >
              <Printer className="w-4 h-4" />
              Print
            </Button>
            {hasNonDateFilters && dateGroupedMaterials.length > 0 && (
              <>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={expandAll} className="gap-1" data-testid="button-expand-all">
                  <ChevronsUpDown className="w-4 h-4" />
                  Expand All
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} className="gap-1" data-testid="button-collapse-all">
                  Collapse All
                </Button>
              </>
            )}
          </div>

          {!hasNonDateFilters ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Filter className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Select a Filter</h3>
                <p className="text-muted-foreground">
                  Please apply a filter (Site, Material, Engineer, Activity, Equipment, or Diesel Usage) to view data.
                </p>
              </CardContent>
            </Card>
          ) : materialsLoading ? (
            <div className="flex justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (!materialLogs || materialLogs.length === 0) && equipmentLogs.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Data Found</h3>
                <p className="text-muted-foreground">
                  No materials or equipment were recorded matching your filters.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6" ref={materialPrintRef}>
              {/* Material Summary Cards - show only when NOT equipment-only filter */}
              {!showEquipmentOnly && (materialLogs && materialLogs.length > 0) && (
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
              )}

              {/* Equipment Usage Summary - show only when NOT materials-only filter */}
              {!showMaterialsOnly && equipmentLogs.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-3">Equipment Usage</h3>
                    <div className="space-y-2 mb-4">
                      {Array.from(equipmentTotals.entries()).map(([machine, totals]) => (
                        <div key={machine} className="flex justify-between items-center text-sm">
                          <span>{machine}</span>
                          <div className="flex gap-2">
                            <Badge variant="secondary">{totals.count} entries</Badge>
                            {totals.totalDiesel > 0 && (
                              <Badge variant="outline">{totals.totalDiesel.toFixed(1)} L diesel</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Equipment Log Details</p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Site</TableHead>
                              <TableHead>Equipment</TableHead>
                              <TableHead>Operator</TableHead>
                              <TableHead>Start</TableHead>
                              <TableHead>End</TableHead>
                              <TableHead>Diesel (L)</TableHead>
                              <TableHead>Task</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {equipmentLogs.map((log) => (
                              <TableRow key={`${log.dprId}-${log.id}`} data-testid={`equipment-row-${log.id}`}>
                                <TableCell className="whitespace-nowrap">{format(parseISO(log.date), "dd MMM")}</TableCell>
                                <TableCell>{log.site}</TableCell>
                                <TableCell className="font-medium">{log.machine}</TableCell>
                                <TableCell>{log.operator || "-"}</TableCell>
                                <TableCell>{log.startTime || "-"}</TableCell>
                                <TableCell>{log.endTime || "-"}</TableCell>
                                <TableCell>{log.diesel ? log.diesel.toFixed(1) : "-"}</TableCell>
                                <TableCell className="max-w-[200px] truncate">{log.task || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Collapsible Date Groups - only show if NOT equipment-only filter and there are material logs */}
              {!showEquipmentOnly && materialLogs && materialLogs.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground px-1">
                  {dateGroupedMaterials.length} day{dateGroupedMaterials.length !== 1 ? 's' : ''} with {materialLogs?.length || 0} material log{(materialLogs?.length || 0) !== 1 ? 's' : ''}
                </div>
                {dateGroupedMaterials.map((group) => (
                  <Collapsible 
                    key={group.date} 
                    open={expandedDates.has(group.date)}
                    onOpenChange={() => toggleDateExpand(group.date)}
                  >
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardContent className="p-4 cursor-pointer hover-elevate" data-testid={`date-group-${group.date}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Calendar className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="font-semibold">{group.formattedDate}</h3>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                  <span>{group.totalTrips} trip{group.totalTrips !== 1 ? 's' : ''}</span>
                                  <span>{group.totalQuantity.toFixed(2)} total qty</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="hidden sm:flex flex-wrap gap-1 max-w-xs">
                                {group.materials.slice(0, 3).map((m, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {m.material}: {m.trips}
                                  </Badge>
                                ))}
                                {group.materials.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{group.materials.length - 3} more
                                  </Badge>
                                )}
                              </div>
                              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${expandedDates.has(group.date) ? 'rotate-180' : ''}`} />
                            </div>
                          </div>
                        </CardContent>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t px-4 pb-4">
                          {/* Material Summary for this date */}
                          <div className="py-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Material Breakdown</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                              {group.materials.map((m, idx) => (
                                <div key={idx} className="p-2 bg-muted/50 rounded-md">
                                  <p className="font-medium text-sm truncate">{m.material}</p>
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{m.trips} trip{m.trips !== 1 ? 's' : ''}</span>
                                    <span>{m.quantity.toFixed(2)} {m.uom}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Detailed logs table */}
                          <div className="overflow-x-auto mt-2">
                            <Table>
                              <TableHeader>
                                <TableRow>
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
                                {group.logs.map((log) => (
                                  <TableRow key={log.id} data-testid={`row-material-${log.id}`}>
                                    <TableCell className="max-w-32 truncate">{log.site}</TableCell>
                                    <TableCell>
                                      <Badge variant={log.type === "Received" ? "default" : "secondary"} className="text-xs">
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
                        </div>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                ))}
              </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
