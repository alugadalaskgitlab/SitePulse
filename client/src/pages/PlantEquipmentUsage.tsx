import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, Plus, Gauge, Loader2, Edit, Trash2, Download, Printer } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EquipmentMasterType, EquipmentUsage } from "@shared/schema";

export default function PlantEquipmentUsage() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<EquipmentUsage | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [openingReading, setOpeningReading] = useState("");
  const [closingReading, setClosingReading] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [openingDiesel, setOpeningDiesel] = useState("");
  const [dieselIssued, setDieselIssued] = useState("");
  const [dieselIncluded, setDieselIncluded] = useState(false);
  const [numberOfTrips, setNumberOfTrips] = useState("");
  const [tripDistance, setTripDistance] = useState("");
  const [tripBasedEntry, setTripBasedEntry] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [previousDieselBalance, setPreviousDieselBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [userModifiedOpening, setUserModifiedOpening] = useState(false);

  interface EquipmentFormData {
    date: string;
    equipmentId: string;
    openingReading: string;
    closingReading: string;
    startTime: string;
    endTime: string;
    openingDiesel: string;
    dieselIssued: string;
    dieselIncluded: boolean;
    numberOfTrips: string;
    tripDistance: string;
    tripBasedEntry: boolean;
    remarks: string;
  }

  const formData = useMemo<EquipmentFormData>(() => ({
    date, equipmentId, openingReading, closingReading, startTime, endTime, openingDiesel, dieselIssued, dieselIncluded, numberOfTrips, tripDistance, tripBasedEntry, remarks
  }), [date, equipmentId, openingReading, closingReading, startTime, endTime, openingDiesel, dieselIssued, dieselIncluded, numberOfTrips, tripDistance, tripBasedEntry, remarks]);

  const handleRestoreDraft = useCallback((data: EquipmentFormData) => {
    setDate(data.date);
    setEquipmentId(data.equipmentId);
    setOpeningReading(data.openingReading);
    setClosingReading(data.closingReading);
    setStartTime(data.startTime);
    setEndTime(data.endTime);
    setOpeningDiesel(data.openingDiesel);
    setDieselIssued(data.dieselIssued);
    setDieselIncluded(data.dieselIncluded || false);
    setNumberOfTrips(data.numberOfTrips || "");
    setTripDistance(data.tripDistance || "");
    setTripBasedEntry(data.tripBasedEntry || false);
    setRemarks(data.remarks);
  }, []);

  const { hasDraft, draftAge, restoreDraft, discardDraft, clearDraft } = useAutosave<EquipmentFormData>({
    formKey: "plant-equipment-usage-new",
    data: formData,
    enabled: dialogOpen && !editingUsage,
    onRestore: handleRestoreDraft,
  });

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterEquipmentId, setFilterEquipmentId] = useState("all");

  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; usageId?: number } | null>(null);

  const { data: usage, isLoading } = useQuery<EquipmentUsage[]>({
    queryKey: ["/api/plant-module/equipment-usage"],
  });

  const { data: equipment } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/equipment-usage", data),
    onSuccess: async () => {
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Equipment usage recorded successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/equipment-usage/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDialogOpen(false);
      setEditingUsage(null);
      resetForm();
      toast({ title: "Equipment usage updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/equipment-usage/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDeleteConfirmId(null);
      toast({ title: "Equipment usage deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setEquipmentId("");
    setOpeningReading("");
    setClosingReading("");
    setStartTime("");
    setEndTime("");
    setOpeningDiesel("");
    setDieselIssued("");
    setDieselIncluded(false);
    setNumberOfTrips("");
    setTripDistance("");
    setTripBasedEntry(false);
    setRemarks("");
    setEditingUsage(null);
    setPreviousDieselBalance(null);
    setIsLoadingBalance(false);
    setUserModifiedOpening(false);
  };

  const openEditDialog = (entry: EquipmentUsage) => {
    setEditingUsage(entry);
    setDate(entry.date);
    setEquipmentId(String(entry.equipmentId));
    setOpeningReading(entry.openingReading ? String(entry.openingReading) : "");
    setClosingReading(entry.closingReading ? String(entry.closingReading) : "");
    setStartTime((entry as any).startTime || "");
    setEndTime((entry as any).endTime || "");
    setOpeningDiesel((entry as any).openingDiesel ? String((entry as any).openingDiesel) : "0");
    setDieselIssued(entry.dieselIssued ? String(entry.dieselIssued) : "");
    setDieselIncluded((entry as any).dieselIncluded || false);
    setNumberOfTrips((entry as any).numberOfTrips ? String((entry as any).numberOfTrips) : "");
    setTripDistance((entry as any).tripDistance ? String((entry as any).tripDistance) : "");
    // Use persisted tripBasedEntry flag from database
    setTripBasedEntry((entry as any).tripBasedEntry === true);
    setRemarks(entry.remarks || "");
    setPreviousDieselBalance((entry as any).openingDiesel || 0);
    setUserModifiedOpening(true);
    setDialogOpen(true);
  };

  const handleEquipmentChange = async (value: string) => {
    setEquipmentId(value);
    setUserModifiedOpening(false);
    
    if (value && !editingUsage) {
      setIsLoadingBalance(true);
      try {
        const res = await fetch(`/api/plant-module/equipment-usage/previous-balance/${value}`);
        if (res.ok) {
          const data = await res.json();
          setPreviousDieselBalance(data.previousBalance);
          setOpeningDiesel(String(data.previousBalance));
          // Auto-populate opening reading from previous closing reading
          if (data.previousClosingReading) {
            setOpeningReading(String(data.previousClosingReading));
          }
        } else {
          setPreviousDieselBalance(0);
          setOpeningDiesel("0");
        }
      } catch {
        setPreviousDieselBalance(0);
        setOpeningDiesel("0");
      }
      setIsLoadingBalance(false);
    }
  };
  
  const handleOpeningDieselChange = (value: string) => {
    setOpeningDiesel(value);
    setUserModifiedOpening(true);
  };

  const handleSubmit = () => {
    // Either meter readings OR time entry OR trip-based (when checked) must be provided
    const hasMeterReading = openingReading && closingReading;
    const hasTimeEntry = startTime && endTime;
    const hasTripEntry = tripBasedEntry && numberOfTrips && tripDistance;
    
    if (!equipmentId || (!hasMeterReading && !hasTimeEntry && !hasTripEntry)) {
      toast({ title: "Please provide meter readings, time entry, or trip details (with Trip Based Entry checked)", variant: "destructive" });
      return;
    }
    
    const data = {
      date,
      equipmentId: parseInt(equipmentId),
      openingReading: openingReading ? parseFloat(openingReading) : null,
      closingReading: closingReading ? parseFloat(closingReading) : null,
      startTime: startTime || null,
      endTime: endTime || null,
      numberOfTrips: tripBasedEntry && numberOfTrips ? parseInt(numberOfTrips) : null,
      tripDistance: tripBasedEntry && tripDistance ? parseFloat(tripDistance) : null,
      tripBasedEntry, // Send flag to server
      openingDiesel: dieselIncluded ? null : (openingDiesel ? parseFloat(openingDiesel) : 0),
      dieselIssued: dieselIncluded ? null : (dieselIssued ? parseFloat(dieselIssued) : 0),
      dieselIncluded,
      remarks: remarks.toUpperCase(),
    };

    if (editingUsage) {
      updateMutation.mutate({ id: editingUsage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Per-action PIN authentication handlers
  const requestPinAuth = (action: typeof pendingAction) => {
    setPendingAction(action);
    setPinAuthTarget("admin"); // All plant module actions require admin PIN
    setShowPinAuth(true);
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    if (!pendingAction) return;

    switch (pendingAction.type) {
      case "edit":
        if (pendingAction.usageId) {
          const entry = usage?.find(u => u.id === pendingAction.usageId);
          if (entry) openEditDialog(entry);
        }
        break;
      case "delete":
        if (pendingAction.usageId) {
          setDeleteConfirmId(pendingAction.usageId);
        }
        break;
      case "export-excel":
        exportToExcel();
        break;
      case "export-pdf":
        exportToPdf();
        break;
      case "print":
        handlePrint();
        break;
    }
    setPendingAction(null);
  };

  const handleEditClick = (entry: EquipmentUsage) => {
    requestPinAuth({ type: "edit", usageId: entry.id });
  };

  const handleDeleteClick = (usageId: number) => {
    requestPinAuth({ type: "delete", usageId });
  };

  const handleExportExcelClick = () => {
    requestPinAuth({ type: "export-excel" });
  };

  const handleExportPdfClick = () => {
    requestPinAuth({ type: "export-pdf" });
  };

  const handlePrintClick = () => {
    requestPinAuth({ type: "print" });
  };

  const selectedEquipment = equipment?.find(e => e.id === parseInt(equipmentId));
  
  // Calculate runtime from meter readings or time entry (meter takes priority)
  const calculateTimeHours = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    try {
      const [startHour, startMin] = start.split(':').map(Number);
      const [endHour, endMin] = end.split(':').map(Number);
      const startMins = startHour * 60 + startMin;
      const endMins = endHour * 60 + endMin;
      const diff = endMins - startMins;
      return diff > 0 ? diff / 60 : 0;
    } catch {
      return 0;
    }
  };
  
  const meterRuntime = openingReading && closingReading ? parseFloat(closingReading) - parseFloat(openingReading) : 0;
  const timeRuntime = calculateTimeHours(startTime, endTime);
  const tripTotalKm = numberOfTrips && tripDistance ? parseInt(numberOfTrips) * parseFloat(tripDistance) * 2 : 0;
  const runtime = meterRuntime > 0 ? meterRuntime : timeRuntime;
  
  // Average speed assumption for converting L/hr to L/km (for trip-based calculation)
  const AVERAGE_SPEED_KMPH = 25; // km/hr typical for heavy vehicles/tankers
  
  // Expected diesel calculation:
  // If tripBasedEntry is checked, ALWAYS use trip-based calculation (even if meter/time exists)
  // For trip-based: convert L/hr norm to L/km using average speed
  // L/km = L/hr ÷ km/hr
  const norm = selectedEquipment?.consumptionNorm || 0;
  const isHourMeter = selectedEquipment?.meterType === "hour_meter";
  
  let expectedDiesel = 0;
  if (tripBasedEntry && tripTotalKm > 0) {
    // Trip-based: convert L/hr to L/km if equipment has hour-based norm
    const normPerKm = isHourMeter ? norm / AVERAGE_SPEED_KMPH : norm;
    expectedDiesel = tripTotalKm * normPerKm;
  } else if (runtime > 0) {
    // Meter/time based
    expectedDiesel = runtime * norm;
  }

  const filteredUsage = usage?.filter(u => {
    if (filterDateFrom && u.date < filterDateFrom) return false;
    if (filterDateTo && u.date > filterDateTo) return false;
    if (filterEquipmentId !== "all" && u.equipmentId !== parseInt(filterEquipmentId)) return false;
    return true;
  }) || [];

  // Calculate totals for filtered data
  const dieselTotals = useMemo(() => {
    return filteredUsage.reduce((acc, entry) => ({
      totalIssued: acc.totalIssued + (entry.dieselIssued || 0),
      totalExpected: acc.totalExpected + (entry.expectedDiesel || 0),
      entriesCount: acc.entriesCount + 1,
    }), { totalIssued: 0, totalExpected: 0, entriesCount: 0 });
  }, [filteredUsage]);

  const groupedUsage = filteredUsage.reduce((acc, entry) => {
    const dateKey = entry.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, EquipmentUsage[]>);

  const sortedDates = Object.keys(groupedUsage).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = filterDateFrom || "All";
    const toDate = filterDateTo || "All";
    const equipFilter = filterEquipmentId !== "all" 
      ? equipment?.find(e => e.id === parseInt(filterEquipmentId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const filters = equipFilter ? `_${equipFilter}` : "";
    return `SiteLog_Plant_EquipmentUsage_${fromDate}_to_${toDate}${filters}_${timestamp}.${extension}`;
  };

  // Universal download function that works on all devices including iPad
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const getExportData = () => {
    return filteredUsage.map(entry => {
      const equip = equipment?.find(e => e.id === entry.equipmentId);
      const openingDieselVal = (entry as any).openingDiesel ?? 0;
      const dieselIssuedVal = entry.dieselIssued ?? 0;
      const consumed = entry.expectedDiesel ?? 0;
      const closingDieselVal = (entry as any).closingDiesel ?? (openingDieselVal + dieselIssuedVal - consumed);
      const isTripBased = !entry.hoursOrKmRun && (entry as any).totalKm > 0;
      return {
        Date: entry.date,
        Equipment: equip?.name || "Unknown",
        "Opening Reading": entry.openingReading,
        "Closing Reading": entry.closingReading,
        "Hours/KM Run": entry.hoursOrKmRun?.toFixed(1) || (isTripBased ? "-" : "0"),
        "Trips": (entry as any).numberOfTrips || "-",
        "Trip Dist (km)": (entry as any).tripDistance || "-",
        "Total KM": (entry as any).totalKm?.toFixed(1) || "-",
        "Opening Diesel": openingDieselVal.toFixed(1),
        "Diesel Issued": dieselIssuedVal.toFixed(1),
        "Closing Diesel": closingDieselVal.toFixed(1),
        "Expected Diesel": consumed.toFixed(1),
      };
    });
  };

  const exportToExcel = async () => {
    try {
      const data = getExportData();
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Equipment Usage");
      
      const filename = buildFilename("xlsx");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Excel Files',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          const writable = await handle.createWritable();
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          await writable.write(buffer);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerDownload(blob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const exportToPdf = async () => {
    try {
      const data = getExportData();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Equipment Usage Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
      if (filterDateFrom || filterDateTo) {
        doc.text(`Date Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}`, 14, 28);
      }
      
      autoTable(doc, {
        startY: filterDateFrom || filterDateTo ? 34 : 28,
        head: [["Date", "Equipment", "Rdg/Trips", "Hrs/KM", "Open Diesel", "Issued", "Close Diesel", "Expected"]],
        body: data.map(row => {
          // Combine readings/trips into one column
          const rdgOrTrips = row["Trips"] !== "-" 
            ? `${row["Trips"]} trips × ${row["Trip Dist (km)"]} km`
            : `${row["Opening Reading"] || "-"} - ${row["Closing Reading"] || "-"}`;
          const hrsOrKm = row["Total KM"] !== "-" ? `${row["Total KM"]} km` : row["Hours/KM Run"];
          return [
            row.Date,
            row.Equipment,
            rdgOrTrips,
            hrsOrKm,
            row["Opening Diesel"],
            row["Diesel Issued"],
            row["Closing Diesel"],
            row["Expected Diesel"],
          ];
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] },
        margin: { left: 10, right: 10 },
      });
      
      const filename = buildFilename("pdf");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'PDF Files',
              accept: { 'application/pdf': ['.pdf'] }
            }]
          });
          const writable = await handle.createWritable();
          const pdfBlob = doc.output('blob');
          await writable.write(pdfBlob);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          // Fall through to standard download
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const pdfBlob = doc.output('blob');
      triggerDownload(pdfBlob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    const data = getExportData();
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Equipment Usage Report</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 11px; }
            .header { margin-bottom: 15px; }
            h1 { color: #333; margin: 0 0 5px 0; font-size: 18px; }
            .date { color: #666; margin: 0; font-size: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 6px 4px; text-align: left; font-size: 9px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px;">
            <img src="${window.location.origin}/hlc-logo.jpg" style="height: 50px; margin-bottom: 5px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 14px; font-weight: bold;">High Lane Constructions Pvt Ltd</h2>
          </div>
          <div class="header">
            <h1>Equipment Usage Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${filterDateFrom || filterDateTo ? ` | Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}` : ""}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Equipment</th>
                <th>Rdg/Trips</th>
                <th>Hrs/KM</th>
                <th>Open Diesel</th>
                <th>Issued</th>
                <th>Close Diesel</th>
                <th>Expected</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(row => {
                const rdgOrTrips = row["Trips"] !== "-" 
                  ? `${row["Trips"]} trips × ${row["Trip Dist (km)"]} km`
                  : `${row["Opening Reading"] || "-"} - ${row["Closing Reading"] || "-"}`;
                const hrsOrKm = row["Total KM"] !== "-" ? `${row["Total KM"]} km` : row["Hours/KM Run"];
                return `
                <tr>
                  <td>${row.Date}</td>
                  <td>${row.Equipment}</td>
                  <td>${rdgOrTrips}</td>
                  <td>${hrsOrKm}</td>
                  <td>${row["Opening Diesel"]}</td>
                  <td>${row["Diesel Issued"]}</td>
                  <td>${row["Closing Diesel"]}</td>
                  <td>${row["Expected Diesel"]}</td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    // Use iframe with srcdoc - attach onload BEFORE setting srcdoc for Safari compatibility
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';
    
    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        window.print();
      }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };
    
    // Attach onload BEFORE adding to DOM and setting srcdoc
    iframe.onload = () => setTimeout(doPrint, 100);
    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    
    // Fallback timeout in case onload doesn't fire
    setTimeout(() => {
      if (!printed) doPrint();
    }, 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Equipment Usage</h1>
            <p className="text-muted-foreground">Track meter readings and fuel consumption</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-usage">
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingUsage ? "Edit Equipment Usage" : "Record Equipment Usage"}</DialogTitle>
            </DialogHeader>
            {hasDraft && !editingUsage && (
              <DraftRestoreBanner
                draftAge={draftAge}
                onRestore={restoreDraft}
                onDiscard={discardDraft}
              />
            )}
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-usage-date" />
              </div>

              <div>
                <Label>Equipment</Label>
                <Select value={equipmentId} onValueChange={handleEquipmentChange}>
                  <SelectTrigger data-testid="select-equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment?.map((equip) => (
                      <SelectItem key={equip.id} value={String(equip.id)}>
                        {equip.name} {(equip as any).registrationNumber ? `(${(equip as any).registrationNumber})` : ""} - {equip.meterType === "hour_meter" ? "hrs" : "km"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedEquipment && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Norm: {selectedEquipment.consumptionNorm} {selectedEquipment.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground italic">Enter meter readings OR time. Check "Trip Based Entry" for trip-based calculation.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening {selectedEquipment?.meterType === "hour_meter" ? "Hrs" : "KM"}</Label>
                  <Input type="number" step="0.1" value={openingReading} onChange={(e) => setOpeningReading(e.target.value)} placeholder="0.0" data-testid="input-opening-reading" />
                </div>
                <div>
                  <Label>Closing {selectedEquipment?.meterType === "hour_meter" ? "Hrs" : "KM"}</Label>
                  <Input type="number" step="0.1" value={closingReading} onChange={(e) => setClosingReading(e.target.value)} placeholder="0.0" data-testid="input-closing-reading" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="input-start-time" />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid="input-end-time" />
                </div>
              </div>

              <div className="flex items-center gap-2 py-2 px-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
                <Checkbox 
                  id="trip-based-entry" 
                  checked={tripBasedEntry} 
                  onCheckedChange={(checked) => setTripBasedEntry(checked === true)}
                  data-testid="checkbox-trip-based"
                />
                <Label htmlFor="trip-based-entry" className="text-sm font-medium cursor-pointer">
                  Trip Based Entry
                </Label>
              </div>

              {tripBasedEntry && (
                <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-200/50 dark:border-blue-800/50 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">No. of Trips</Label>
                      <Input 
                        type="number" 
                        min="0" 
                        step="1" 
                        value={numberOfTrips} 
                        onChange={(e) => setNumberOfTrips(e.target.value)} 
                        placeholder="e.g., 3" 
                        data-testid="input-number-of-trips" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Distance to Source (km)</Label>
                      <Input 
                        type="number" 
                        min="0" 
                        step="0.1" 
                        value={tripDistance} 
                        onChange={(e) => setTripDistance(e.target.value)} 
                        placeholder="e.g., 6" 
                        data-testid="input-trip-distance" 
                      />
                    </div>
                  </div>
                  {numberOfTrips && tripDistance && (
                    <p className="text-xs text-muted-foreground">
                      Total: {(parseInt(numberOfTrips) * parseFloat(tripDistance) * 2).toFixed(1)} km ({numberOfTrips} trips × {tripDistance} km × 2)
                    </p>
                  )}
                </div>
              )}

              {(runtime > 0 || (tripBasedEntry && tripTotalKm > 0)) && selectedEquipment && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  {runtime > 0 ? (
                    <p>Runtime: <strong>{runtime.toFixed(1)} {selectedEquipment.meterType === "hour_meter" ? "hrs" : "hrs"}</strong> {meterRuntime > 0 ? "(from meter)" : "(from time)"}</p>
                  ) : tripTotalKm > 0 ? (
                    <p>Distance: <strong>{tripTotalKm.toFixed(1)} km</strong> (from trips)</p>
                  ) : null}
                  {!dieselIncluded && <p>Expected Diesel: <strong>{expectedDiesel.toFixed(1)} L</strong></p>}
                </div>
              )}

              <div className="flex items-center gap-2 py-2 px-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                <Checkbox 
                  id="diesel-included" 
                  checked={dieselIncluded} 
                  onCheckedChange={(checked) => setDieselIncluded(checked === true)}
                  data-testid="checkbox-diesel-included"
                />
                <Label htmlFor="diesel-included" className="text-sm font-medium cursor-pointer">
                  Diesel provided by contractor (tracking only - no stock impact)
                </Label>
              </div>

              {!dieselIncluded && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Opening Diesel Tank (L)</Label>
                      <div className="relative">
                        <Input 
                          type="number" 
                          step="0.1" 
                          value={openingDiesel} 
                          onChange={(e) => handleOpeningDieselChange(e.target.value)} 
                          placeholder="Previous balance" 
                          data-testid="input-opening-diesel"
                          disabled={isLoadingBalance}
                        />
                        {isLoadingBalance && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      {previousDieselBalance !== null && !editingUsage && (
                        <p className="text-xs text-muted-foreground mt-1">Auto-filled from previous: {previousDieselBalance.toFixed(1)} L</p>
                      )}
                    </div>
                    <div>
                      <Label>Diesel Issued (L)</Label>
                      <Input type="number" step="0.1" value={dieselIssued} onChange={(e) => setDieselIssued(e.target.value)} placeholder="0" data-testid="input-diesel-issued" />
                    </div>
                  </div>

                  {openingDiesel && dieselIssued !== undefined && expectedDiesel > 0 && (
                    <div className="p-3 bg-primary/10 rounded-md text-sm">
                      <p>Closing Tank Balance: <strong>{(parseFloat(openingDiesel || "0") + parseFloat(dieselIssued || "0") - expectedDiesel).toFixed(1)} L</strong></p>
                    </div>
                  )}
                </>
              )}

              <div>
                <Label>Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value.toUpperCase())} placeholder="Optional notes" data-testid="input-usage-remarks" />
              </div>

              <Button 
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !equipmentId || ((!openingReading || !closingReading) && (!startTime || !endTime) && !(tripBasedEntry && numberOfTrips && tripDistance))} 
                data-testid="button-save-usage"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingUsage ? "Update Entry" : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!filteredUsage.length} data-testid="button-export-excel">
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!filteredUsage.length} data-testid="button-export-pdf">
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">EQUIPMENT</Label>
              <Select value={filterEquipmentId} onValueChange={setFilterEquipmentId}>
                <SelectTrigger data-testid="select-filter-equipment">
                  <SelectValue placeholder="All Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {equipment?.map((equip) => (
                    <SelectItem key={equip.id} value={String(equip.id)}>
                      {equip.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterEquipmentId("all");
              }}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this equipment usage entry?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Gauge className="w-5 h-5" />
            Usage Log
            {filteredUsage.length > 0 && (
              <Badge variant="secondary" className="ml-2">{filteredUsage.length} entries</Badge>
            )}
          </CardTitle>
          {dieselTotals.totalIssued > 0 && (
            <div className="flex flex-wrap gap-4 mt-2 text-sm" data-testid="diesel-totals-container">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20" data-testid="diesel-total-issued">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Total Diesel Issued:</span>
                <span className="font-bold text-blue-700 dark:text-blue-300">{dieselTotals.totalIssued.toFixed(1)} L</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-orange-50 dark:bg-orange-900/20" data-testid="diesel-total-expected">
                <span className="text-orange-600 dark:text-orange-400 font-medium">Expected Consumption:</span>
                <span className="font-bold text-orange-700 dark:text-orange-300">{dieselTotals.totalExpected.toFixed(1)} L</span>
              </div>
              {dieselTotals.totalIssued >= dieselTotals.totalExpected && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/20" data-testid="diesel-total-surplus">
                  <span className="text-green-600 dark:text-green-400 font-medium">Balance in Tanks:</span>
                  <span className="font-bold text-green-700 dark:text-green-300">{(dieselTotals.totalIssued - dieselTotals.totalExpected).toFixed(1)} L</span>
                </div>
              )}
              {dieselTotals.totalExpected > dieselTotals.totalIssued && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/20" data-testid="diesel-total-deficit">
                  <span className="text-red-600 dark:text-red-400 font-medium">Over-Consumed:</span>
                  <span className="font-bold text-red-700 dark:text-red-300">{(dieselTotals.totalExpected - dieselTotals.totalIssued).toFixed(1)} L</span>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredUsage.length ? (
            <p className="text-muted-foreground text-center py-8">No usage recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayUsage = groupedUsage[dateKey];
                return (
                  <div key={dateKey}>
                    <h3 className="font-semibold text-lg mb-3 border-b pb-2">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    <div className="space-y-2">
                      {dayUsage.map((entry) => {
                        const equip = equipment?.find(e => e.id === entry.equipmentId);
                        const isDieselIncluded = (entry as any).dieselIncluded === true;
                        const openingDieselVal = (entry as any).openingDiesel ?? 0;
                        const dieselIssuedVal = entry.dieselIssued ?? 0;
                        const closingDieselEntry = (entry as any).closingDiesel;
                        // Actual consumed = opening + issued - closing; fallback to expected if closing not tracked
                        const consumed = closingDieselEntry != null 
                          ? Math.max(0, openingDieselVal + dieselIssuedVal - closingDieselEntry)
                          : (entry.expectedDiesel ?? 0);
                        const closingDieselVal = closingDieselEntry ?? (openingDieselVal + dieselIssuedVal - (entry.expectedDiesel ?? 0));
                        return (
                          <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground text-xs block">Equipment</span>
                                <span className="font-medium">{equip?.name || "Unknown"}</span>
                                {(equip as any)?.registrationNumber && (
                                  <span className="text-xs text-muted-foreground block">{(equip as any).registrationNumber}</span>
                                )}
                                {isDieselIncluded && (
                                  <Badge variant="outline" className="mt-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700">Diesel by Contractor</Badge>
                                )}
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">
                                  {(entry as any).totalKm > 0 && !entry.hoursOrKmRun 
                                    ? "Distance" 
                                    : (equip?.meterType === "hour_meter" ? "Hours Run" : "KM Run")}
                                </span>
                                {(entry as any).totalKm > 0 && !entry.hoursOrKmRun ? (
                                  <>
                                    <span className="font-medium">{((entry as any).totalKm || 0).toFixed(1)} km</span>
                                    <span className="text-xs text-muted-foreground block">
                                      {(entry as any).numberOfTrips} trips × {(entry as any).tripDistance} km × 2
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="font-medium">{entry.hoursOrKmRun?.toFixed(1)} {equip?.meterType === "hour_meter" ? "hrs" : "km"}</span>
                                    {entry.openingReading != null && entry.closingReading != null ? (
                                      <span className="text-xs text-muted-foreground block">Meter: {entry.openingReading} - {entry.closingReading}</span>
                                    ) : entry.startTime && entry.endTime ? (
                                      <span className="text-xs text-muted-foreground block">Time: {entry.startTime} - {entry.endTime}</span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground block">-</span>
                                    )}
                                  </>
                                )}
                              </div>
                              {isDieselIncluded ? (
                                <>
                                  <div className="col-span-4 flex items-center">
                                    <span className="text-sm text-amber-600 dark:text-amber-400 italic">Diesel provided by contractor - tracking only</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Diesel Issued</span>
                                    <span className="font-medium">{dieselIssuedVal.toFixed(1)} L</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Consumed</span>
                                    <span className="font-medium">{consumed.toFixed(1)} L</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Efficiency</span>
                                    {(() => {
                                      // Use hoursOrKmRun, or totalKm for trip-based entries
                                      const runtime = entry.hoursOrKmRun || (entry as any).totalKm || 0;
                                      const isTripBased = !entry.hoursOrKmRun && (entry as any).totalKm > 0;
                                      if (runtime <= 0 || consumed <= 0) {
                                        return <span className="font-medium text-muted-foreground">-</span>;
                                      }
                                      const efficiencyValue = consumed / runtime;
                                      const norm = equip?.consumptionNorm || 0;
                                      const isGood = norm > 0 ? efficiencyValue <= norm : true;
                                      const unit = isTripBased ? "L/km" : (equip?.meterType === "hour_meter" ? "L/hr" : "L/km");
                                      return (
                                        <span className={`font-medium ${isGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                          {efficiencyValue.toFixed(2)} {unit}
                                        </span>
                                      );
                                    })()}
                                    {equip?.consumptionNorm && (
                                      <span className="text-xs text-muted-foreground block">Norm: {equip.consumptionNorm} {equip.meterType === "hour_meter" ? "L/hr" : "L/km"}</span>
                                    )}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Tank Balance</span>
                                    <span className="font-medium">{closingDieselVal.toFixed(1)} L</span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              <Button size="icon" variant="ghost" onClick={() => handleEditClick(entry)} data-testid={`button-edit-usage-${entry.id}`}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(entry.id)} data-testid={`button-delete-usage-${entry.id}`}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showPinAuth && (
        <PinAuth
          targetRole={pinAuthTarget}
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
