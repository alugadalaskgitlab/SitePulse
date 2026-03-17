import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Filter, Loader2, Fuel, Clock, Package, Activity, MapPin, Calendar, Download, Printer, ChevronDown, ChevronRight, FileSpreadsheet, Truck, Calculator } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format, parseISO, eachDayOfInterval, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { PinAuth } from "@/components/PinAuth";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import type { DprWithDetails } from "@shared/schema";

function getCleanSiteName(site: string): string {
  const editMarkerIndex = site.indexOf(' – Edited by');
  return editMarkerIndex > -1 ? site.substring(0, editMarkerIndex).trim() : site;
}

interface DateGroupedData {
  date: string;
  formattedDate: string;
  dprs: DprWithDetails[];
  activities: Array<{
    activity: string;
    uom: string;
    quantity: number;
    site: string;
    chainage: string;
    date: string;
  }>;
  materials: Array<{
    material: string;
    supplier: string;
    receiptNo: string;
    quantity: number;
    uom: string;
    trips: number;
    site: string;
    date: string;
  }>;
  equipment: Array<{
    machine: string;
    operator: string;
    startTime: string;
    endTime: string;
    hours: number;
    diesel: number;
    site: string;
    date: string;
  }>;
  totalDiesel: number;
  totalHours: number;
}

export default function AdminReports() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("reports");
  const printRef = useRef<HTMLDivElement>(null);
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [selectedActivity, setSelectedActivity] = useState<string>("all");
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all");
  const [selectedEquipment, setSelectedEquipment] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const { data: dprs = [], isLoading } = useQuery<DprWithDetails[]>({
    queryKey: ["/api/dprs/with-details"],
    enabled: authenticated,
  });

  const handlePinAuthSuccess = (role: "manager" | "admin") => {
    if (role === "admin") {
      setAuthenticated(true);
      setShowPinAuth(false);
    } else {
      toast({
        title: "Access Denied",
        description: "Admin PIN required to access reports.",
        variant: "destructive",
      });
    }
  };

  const uniqueSites = useMemo(() => {
    const sites = new Set<string>();
    dprs.forEach(d => sites.add(getCleanSiteName(d.site)));
    return Array.from(sites).sort();
  }, [dprs]);

  const uniqueActivities = useMemo(() => {
    const activities = new Set<string>();
    dprs.forEach(d => d.progress?.forEach(p => p.activity && activities.add(p.activity)));
    return Array.from(activities).sort();
  }, [dprs]);

  const uniqueMaterials = useMemo(() => {
    const materials = new Set<string>();
    dprs.forEach(d => d.materials?.forEach(m => m.material && materials.add(m.material)));
    return Array.from(materials).sort();
  }, [dprs]);

  const uniqueEquipment = useMemo(() => {
    const equipment = new Set<string>();
    dprs.forEach(d => d.equipment?.forEach(e => e.machine && equipment.add(e.machine)));
    return Array.from(equipment).sort();
  }, [dprs]);

  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Set<string>();
    dprs.forEach(d => d.materials?.forEach(m => m.supplier && suppliers.add(m.supplier)));
    return Array.from(suppliers).sort();
  }, [dprs]);

  const filteredDprs = useMemo(() => {
    return dprs.filter(dpr => {
      if (dateFrom && dpr.date < dateFrom) return false;
      if (dateTo && dpr.date > dateTo) return false;
      if (selectedSite !== "all" && getCleanSiteName(dpr.site) !== selectedSite) return false;
      
      if (selectedActivity !== "all") {
        const hasMatchingActivity = dpr.progress?.some(p => p.activity === selectedActivity);
        if (!hasMatchingActivity) return false;
      }
      
      if (selectedEquipment !== "all") {
        const hasMatchingEquipment = dpr.equipment?.some(e => e.machine === selectedEquipment);
        if (!hasMatchingEquipment) return false;
      }
      
      const hasMaterialFilter = selectedMaterial !== "all";
      const hasSupplierFilter = selectedSupplier !== "all";
      
      if (hasMaterialFilter || hasSupplierFilter) {
        const hasMatchingMaterial = dpr.materials?.some(m => {
          const materialMatch = !hasMaterialFilter || m.material === selectedMaterial;
          const supplierMatch = !hasSupplierFilter || m.supplier === selectedSupplier;
          return materialMatch && supplierMatch;
        });
        if (!hasMatchingMaterial) return false;
      }
      
      return true;
    });
  }, [dprs, dateFrom, dateTo, selectedSite, selectedActivity, selectedMaterial, selectedEquipment, selectedSupplier]);

  const showActivities = selectedActivity !== "all" || (selectedMaterial === "all" && selectedSupplier === "all" && selectedEquipment === "all");
  const showMaterials = selectedMaterial !== "all" || selectedSupplier !== "all" || (selectedActivity === "all" && selectedEquipment === "all");
  const showEquipment = selectedEquipment !== "all" || (selectedActivity === "all" && selectedMaterial === "all" && selectedSupplier === "all");

  const dateGroupedData = useMemo(() => {
    const groupedByDate: Record<string, DateGroupedData> = {};
    
    filteredDprs.forEach(dpr => {
      const dateKey = dpr.date;
      
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = {
          date: dateKey,
          formattedDate: format(parseISO(dateKey), "EEEE, dd MMMM yyyy"),
          dprs: [],
          activities: [],
          materials: [],
          equipment: [],
          totalDiesel: 0,
          totalHours: 0,
        };
      }
      
      const group = groupedByDate[dateKey];
      group.dprs.push(dpr);
      
      const cleanSite = getCleanSiteName(dpr.site);
      const formattedRowDate = format(parseISO(dpr.date), "dd MMM");
      
      if (showActivities) {
        dpr.progress?.forEach(p => {
          if (selectedSite !== "all" && cleanSite !== selectedSite) return;
          if (selectedActivity !== "all" && p.activity !== selectedActivity) return;
          if (p.activity) {
            group.activities.push({
              activity: p.activity,
              uom: p.uom || '',
              quantity: p.quantity || 0,
              site: cleanSite,
              chainage: p.chainageFrom && p.chainageTo ? `${p.chainageFrom} - ${p.chainageTo}` : (p.chainageFrom || p.chainageTo || ''),
              date: formattedRowDate,
            });
          }
        });
      }
      
      if (showMaterials) {
        dpr.materials?.forEach(m => {
          if (selectedSite !== "all" && cleanSite !== selectedSite) return;
          if (selectedMaterial !== "all" && m.material !== selectedMaterial) return;
          if (selectedSupplier !== "all" && m.supplier !== selectedSupplier) return;
          if (m.material) {
            group.materials.push({
              material: m.material,
              supplier: m.supplier || '-',
              receiptNo: m.receiptNumber || '-',
              quantity: m.quantity || 0,
              uom: m.uom || '',
              trips: 1,
              site: cleanSite,
              date: formattedRowDate,
            });
          }
        });
      }
      
      if (showEquipment) {
        dpr.equipment?.forEach(e => {
          if (selectedSite !== "all" && cleanSite !== selectedSite) return;
          if (selectedEquipment !== "all" && e.machine !== selectedEquipment) return;
          const diesel = e.diesel || 0;
          group.totalDiesel += diesel;
          
          let hours = 0;
          if (e.startTime && e.endTime) {
            try {
              const [startHour, startMin] = e.startTime.split(':').map(Number);
              const [endHour, endMin] = e.endTime.split(':').map(Number);
              hours = ((endHour * 60 + endMin) - (startHour * 60 + startMin)) / 60;
              if (hours < 0) hours = 0;
            } catch { hours = 0; }
          }
          group.totalHours += hours;
          
          if (e.machine) {
            group.equipment.push({
              machine: e.machine,
              operator: e.operator || '-',
              startTime: e.startTime || '-',
              endTime: e.endTime || '-',
              hours,
              diesel,
              site: cleanSite,
              date: formattedRowDate,
            });
          }
        });
      }
    });
    
    const result = Object.values(groupedByDate).filter(group => 
      group.activities.length > 0 || group.materials.length > 0 || group.equipment.length > 0
    );
    
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredDprs, selectedSite, selectedActivity, selectedMaterial, selectedEquipment, selectedSupplier, showActivities, showMaterials, showEquipment]);

  const overallTotals = useMemo(() => {
    let totalDiesel = 0;
    let totalHours = 0;
    let totalActivities = 0;
    let totalMaterialTrips = 0;
    
    dateGroupedData.forEach(group => {
      totalDiesel += group.totalDiesel;
      totalHours += group.totalHours;
      totalActivities += group.activities.length;
      totalMaterialTrips += group.materials.length;
    });
    
    return { totalDiesel, totalHours, totalActivities, totalMaterialTrips };
  }, [dateGroupedData]);

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
    setExpandedDates(new Set(dateGroupedData.map(g => g.date)));
  };

  const collapseAll = () => {
    setExpandedDates(new Set());
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSelectedSite("all");
    setSelectedActivity("all");
    setSelectedMaterial("all");
    setSelectedEquipment("all");
    setSelectedSupplier("all");
  };

  const exportToExcel = async () => {
    const wb = XLSX.utils.book_new();
    
    const summaryData = dateGroupedData.map(group => ({
      Date: group.formattedDate,
      'Reports': group.dprs.length,
      'Activities': group.activities.length,
      'Material Trips': group.materials.length,
      'Equipment Uses': group.equipment.length,
      'Total Diesel (L)': group.totalDiesel.toFixed(3),
      'Total Hours': group.totalHours.toFixed(3),
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    
    const activitiesData: any[] = [];
    dateGroupedData.forEach(group => {
      group.activities.forEach(a => {
        activitiesData.push({
          Date: format(parseISO(group.date), "dd/MM/yyyy"),
          Site: a.site,
          Activity: a.activity,
          Chainage: a.chainage,
          Quantity: a.quantity,
          UOM: a.uom,
        });
      });
    });
    if (activitiesData.length > 0) {
      const activitiesSheet = XLSX.utils.json_to_sheet(activitiesData);
      XLSX.utils.book_append_sheet(wb, activitiesSheet, "Activities");
    }
    
    const materialsData: any[] = [];
    const materialsSummary: Record<string, { material: string; supplier: string; totalQty: number; trips: number; uom: string }> = {};
    dateGroupedData.forEach(group => {
      group.materials.forEach(m => {
        materialsData.push({
          Date: format(parseISO(group.date), "dd/MM/yyyy"),
          Site: m.site,
          Material: m.material,
          Supplier: m.supplier,
          'Receipt No': m.receiptNo,
          Quantity: m.quantity,
          UOM: m.uom,
          Trip: 1,
        });
        
        const key = `${m.material}|${m.supplier}|${m.uom}`;
        if (!materialsSummary[key]) {
          materialsSummary[key] = { material: m.material, supplier: m.supplier, totalQty: 0, trips: 0, uom: m.uom };
        }
        materialsSummary[key].totalQty += m.quantity;
        materialsSummary[key].trips += 1;
      });
    });
    if (materialsData.length > 0) {
      const materialsSheet = XLSX.utils.json_to_sheet(materialsData);
      XLSX.utils.book_append_sheet(wb, materialsSheet, "Materials");
      
      const materialsSummaryData = Object.values(materialsSummary).map(s => ({
        Material: s.material,
        Supplier: s.supplier,
        'Total Quantity': s.totalQty,
        UOM: s.uom,
        'Total Trips': s.trips,
      }));
      if (materialsSummaryData.length > 0) {
        const summarySheet = XLSX.utils.json_to_sheet(materialsSummaryData);
        XLSX.utils.book_append_sheet(wb, summarySheet, "Materials Summary");
      }
    }
    
    const equipmentData: any[] = [];
    dateGroupedData.forEach(group => {
      group.equipment.forEach(e => {
        equipmentData.push({
          Date: format(parseISO(group.date), "dd/MM/yyyy"),
          Site: e.site,
          Machine: e.machine,
          Operator: e.operator,
          'Start Time': e.startTime,
          'End Time': e.endTime,
          Hours: e.hours.toFixed(3),
          'Diesel (L)': e.diesel,
        });
      });
    });
    if (equipmentData.length > 0) {
      const equipmentSheet = XLSX.utils.json_to_sheet(equipmentData);
      XLSX.utils.book_append_sheet(wb, equipmentSheet, "Equipment");
    }
    
    const dateStr = dateFrom && dateTo 
      ? `${format(parseISO(dateFrom), "ddMMMyyyy")}_to_${format(parseISO(dateTo), "ddMMMyyyy")}`
      : format(new Date(), "ddMMMyyyy");
    const defaultFileName = `AdminReport_${dateStr}.xlsx`;
    
    // Generate Excel file as array buffer
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Try File System Access API for save-as dialog (desktop Chrome/Edge)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [{
            description: 'Excel Spreadsheet',
            accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        toast({
          title: "File Saved",
          description: `Report has been saved successfully.`,
        });
        return;
      } catch (err: any) {
        // User cancelled or API failed - fall through to standard download
        if (err.name === 'AbortError') {
          return; // User cancelled
        }
      }
    }
    
    // Fallback: standard download for mobile and unsupported browsers
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "File Downloaded",
      description: `"${defaultFileName}" has been exported to your Downloads folder.`,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (showPinAuth && !authenticated) {
    return (
      <PinAuth
        targetRole="admin"
        onSuccess={handlePinAuthSuccess}
        onClose={() => window.history.back()}
      />
    );
  }

  const getActiveFiltersText = () => {
    const filters: string[] = [];
    if (dateFrom) filters.push(`From: ${format(parseISO(dateFrom), "dd MMM yyyy")}`);
    if (dateTo) filters.push(`To: ${format(parseISO(dateTo), "dd MMM yyyy")}`);
    if (selectedSite !== "all") filters.push(`Site: ${selectedSite}`);
    if (selectedActivity !== "all") filters.push(`Activity: ${selectedActivity}`);
    if (selectedMaterial !== "all") filters.push(`Material: ${selectedMaterial}`);
    if (selectedSupplier !== "all") filters.push(`Supplier: ${selectedSupplier}`);
    if (selectedEquipment !== "all") filters.push(`Equipment: ${selectedEquipment}`);
    return filters.length > 0 ? filters.join(" | ") : "All Data (No Filters Applied)";
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display">Admin Reports</h1>
            <p className="text-muted-foreground text-sm">Generate filtered date-wise reports</p>
          </div>
        </div>
        
        {activeTab === "reports" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel} className="gap-2" data-testid="button-export-excel">
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </Button>
            <Button variant="outline" onClick={handlePrint} className="gap-2" data-testid="button-print">
              <Printer className="w-4 h-4" />
              Print
            </Button>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="print:hidden">
          <TabsTrigger value="reports" data-testid="tab-site-reports">Site Reports</TabsTrigger>
          <TabsTrigger value="mix-calculator" data-testid="tab-mix-calculator">
            <Calculator className="w-4 h-4 mr-1" />
            Mix Rate Calculator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mix-calculator" className="mt-4">
          <div className="flex justify-end mb-2">
            <a href="/admin/mix-estimates" data-testid="link-mix-estimates">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors">
                📂 Saved Estimates
              </button>
            </a>
          </div>
          <iframe
            src="/mix-calculator?v=3"
            style={{ width: '100%', height: 'calc(100vh - 200px)', border: 'none', borderRadius: '8px' }}
            title="Mix Rate Calculator"
            data-testid="iframe-mix-calculator"
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-4 space-y-6">

      <div className="hidden print:block mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold mb-2">High Lane Constructions Pvt Ltd - Admin Report</h1>
        <p className="text-sm text-muted-foreground">Generated: {format(new Date(), "dd MMMM yyyy, hh:mm a")}</p>
        <p className="text-sm mt-2"><strong>Filters:</strong> {getActiveFiltersText()}</p>
        <p className="text-sm mt-1">
          <strong>Summary:</strong> {dateGroupedData.length} day(s) | {overallTotals.totalActivities} activities | {overallTotals.totalMaterialTrips} material trips | {overallTotals.totalHours.toFixed(3)} equipment hours
        </p>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger data-testid="select-site">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {uniqueSites.map(site => (
                    <SelectItem key={site} value={site}>{site}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Activity</Label>
              <Select value={selectedActivity} onValueChange={setSelectedActivity}>
                <SelectTrigger data-testid="select-activity">
                  <SelectValue placeholder="All Activities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  {uniqueActivities.map(activity => (
                    <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Material</Label>
              <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                <SelectTrigger data-testid="select-material">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {uniqueMaterials.map(material => (
                    <SelectItem key={material} value={material}>{material}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {uniqueSuppliers.map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Equipment</Label>
              <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
                <SelectTrigger data-testid="select-equipment">
                  <SelectValue placeholder="All Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {uniqueEquipment.map(eq => (
                    <SelectItem key={eq} value={eq}>{eq}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={clearFilters} className="w-full" data-testid="button-clear-filters">
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div ref={printRef}>
          <div className="print:block hidden mb-6">
            <h1 className="text-2xl font-bold text-center">High Lane Constructions Pvt Ltd - Admin Report</h1>
            <p className="text-center text-muted-foreground">
              {dateFrom && dateTo 
                ? `Period: ${format(parseISO(dateFrom), "dd MMM yyyy")} to ${format(parseISO(dateTo), "dd MMM yyyy")}`
                : `Generated: ${format(new Date(), "dd MMM yyyy")}`
              }
            </p>
            {selectedSite !== "all" && <p className="text-center">Site: {selectedSite}</p>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  <p className="text-2xl font-bold text-blue-500" data-testid="text-total-days">{dateGroupedData.length}</p>
                </div>
                <p className="text-sm text-muted-foreground">Days with Reports</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Fuel className="w-5 h-5 text-primary" />
                  <p className="text-2xl font-bold text-primary" data-testid="text-total-diesel">{overallTotals.totalDiesel.toFixed(3)} L</p>
                </div>
                <p className="text-sm text-muted-foreground">Total Diesel</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-green-500" />
                  <p className="text-2xl font-bold text-green-500" data-testid="text-total-hours">{overallTotals.totalHours.toFixed(3)} hrs</p>
                </div>
                <p className="text-sm text-muted-foreground">Equipment Hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Truck className="w-5 h-5 text-orange-500" />
                  <p className="text-2xl font-bold text-orange-500" data-testid="text-total-trips">{overallTotals.totalMaterialTrips}</p>
                </div>
                <p className="text-sm text-muted-foreground">Material Trips</p>
              </CardContent>
            </Card>
          </div>

          {dateGroupedData.length > 0 && (
            <div className="flex gap-2 justify-end print:hidden">
              <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>Collapse All</Button>
            </div>
          )}

          <div className="space-y-4">
            {dateGroupedData.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No reports match the selected filters.</p>
                </CardContent>
              </Card>
            ) : (
              dateGroupedData.map((group) => (
                <Card key={group.date} className="print:break-inside-avoid">
                  <Collapsible 
                    open={expandedDates.has(group.date)} 
                    onOpenChange={() => toggleDateExpand(group.date)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover-elevate" data-testid={`header-date-${group.date}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            {expandedDates.has(group.date) ? (
                              <ChevronDown className="w-5 h-5 print:hidden" />
                            ) : (
                              <ChevronRight className="w-5 h-5 print:hidden" />
                            )}
                            <div>
                              <CardTitle className="text-lg">{group.formattedDate}</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {group.dprs.length} report{group.dprs.length !== 1 ? 's' : ''} from {Array.from(new Set(group.dprs.map(d => d.site))).join(', ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            {group.activities.length > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                <Activity className="w-3 h-3" /> {group.activities.length}
                              </Badge>
                            )}
                            {group.materials.length > 0 && (
                              <Badge variant="secondary" className="gap-1">
                                <Package className="w-3 h-3" /> {group.materials.length}
                              </Badge>
                            )}
                            {group.equipment.length > 0 && (
                              <Badge variant="outline" className="gap-1">
                                <Fuel className="w-3 h-3" /> {group.totalDiesel.toFixed(3)}L
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent className="print:block">
                      <CardContent className="space-y-6 pt-0">
                        {group.activities.length > 0 && (
                          <div>
                            <h4 className="font-semibold flex items-center gap-2 mb-3">
                              <Activity className="w-4 h-4" /> Activities
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Site</TableHead>
                                  <TableHead>Activity</TableHead>
                                  <TableHead>Chainage</TableHead>
                                  <TableHead className="text-right">Quantity</TableHead>
                                  <TableHead>UOM</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.activities.map((a, i) => (
                                  <TableRow key={i} data-testid={`row-activity-${group.date}-${i}`}>
                                    <TableCell>{a.date}</TableCell>
                                    <TableCell>{a.site}</TableCell>
                                    <TableCell className="font-medium">{a.activity}</TableCell>
                                    <TableCell>{a.chainage || '-'}</TableCell>
                                    <TableCell className="text-right">{a.quantity}</TableCell>
                                    <TableCell>{a.uom}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        
                        {group.materials.length > 0 && (
                          <div>
                            <h4 className="font-semibold flex items-center gap-2 mb-3">
                              <Package className="w-4 h-4" /> Materials ({group.materials.length} trip{group.materials.length !== 1 ? 's' : ''})
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Site</TableHead>
                                  <TableHead>Material</TableHead>
                                  <TableHead>Supplier</TableHead>
                                  <TableHead>Receipt No</TableHead>
                                  <TableHead className="text-right">Quantity</TableHead>
                                  <TableHead>UOM</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.materials.map((m, i) => (
                                  <TableRow key={i} data-testid={`row-material-${group.date}-${i}`}>
                                    <TableCell>{m.date}</TableCell>
                                    <TableCell>{m.site}</TableCell>
                                    <TableCell className="font-medium">{m.material}</TableCell>
                                    <TableCell>{m.supplier}</TableCell>
                                    <TableCell>{m.receiptNo}</TableCell>
                                    <TableCell className="text-right">{m.quantity}</TableCell>
                                    <TableCell>{m.uom}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/50 font-semibold">
                                  <TableCell colSpan={5}>Day Total</TableCell>
                                  <TableCell className="text-right">
                                    {group.materials.reduce((sum, m) => sum + m.quantity, 0).toFixed(3)}
                                  </TableCell>
                                  <TableCell>{group.materials.length} trip{group.materials.length !== 1 ? 's' : ''}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        )}
                        
                        {group.equipment.length > 0 && (
                          <div>
                            <h4 className="font-semibold flex items-center gap-2 mb-3">
                              <Fuel className="w-4 h-4" /> Equipment
                            </h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Site</TableHead>
                                  <TableHead>Machine</TableHead>
                                  <TableHead>Operator</TableHead>
                                  <TableHead>Start</TableHead>
                                  <TableHead>End</TableHead>
                                  <TableHead className="text-right">Hours</TableHead>
                                  <TableHead className="text-right">Diesel (L)</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.equipment.map((e, i) => (
                                  <TableRow key={i} data-testid={`row-equipment-${group.date}-${i}`}>
                                    <TableCell>{e.date}</TableCell>
                                    <TableCell>{e.site}</TableCell>
                                    <TableCell className="font-medium">{e.machine}</TableCell>
                                    <TableCell>{e.operator}</TableCell>
                                    <TableCell>{e.startTime}</TableCell>
                                    <TableCell>{e.endTime}</TableCell>
                                    <TableCell className="text-right">{e.hours.toFixed(3)}</TableCell>
                                    <TableCell className="text-right font-semibold">{e.diesel}</TableCell>
                                  </TableRow>
                                ))}
                                <TableRow className="bg-muted/50 font-semibold">
                                  <TableCell colSpan={6}>Day Total</TableCell>
                                  <TableCell className="text-right">{group.totalHours.toFixed(3)}</TableCell>
                                  <TableCell className="text-right">{group.totalDiesel.toFixed(3)}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
      `}</style>

        </TabsContent>
      </Tabs>
    </div>
  );
}
