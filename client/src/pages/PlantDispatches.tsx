import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { ChevronLeft, Plus, Truck, Loader2, Lock, Trash2, Edit, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { Party, MixTemplate, TruckDispatch } from "@shared/schema";

const MIX_TYPES = ["BC", "DBM"];

export default function PlantDispatches() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState<TruckDispatch | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  // Filter state
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("all");
  const [filterMixType, setFilterMixType] = useState("all");
  const [filterVehicle, setFilterVehicle] = useState("all");
  
  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; dispatchId?: number } | null>(null);
  
  // Form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [mixTemplateId, setMixTemplateId] = useState<string>("");
  const [truckNumber, setTruckNumber] = useState("");
  const [loadWeight, setLoadWeight] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [actualBitumenPercent, setActualBitumenPercent] = useState("");

  interface DispatchFormData {
    date: string;
    time: string;
    partyId: string;
    mixTemplateId: string;
    truckNumber: string;
    loadWeight: string;
    deliveryLocation: string;
    actualBitumenPercent: string;
  }

  const formData = useMemo<DispatchFormData>(() => ({
    date, time, partyId, mixTemplateId, truckNumber, loadWeight, deliveryLocation, actualBitumenPercent
  }), [date, time, partyId, mixTemplateId, truckNumber, loadWeight, deliveryLocation, actualBitumenPercent]);

  const handleRestoreDraft = useCallback((data: DispatchFormData) => {
    setDate(data.date);
    setTime(data.time);
    setPartyId(data.partyId);
    setMixTemplateId(data.mixTemplateId);
    setTruckNumber(data.truckNumber);
    setLoadWeight(data.loadWeight);
    setDeliveryLocation(data.deliveryLocation);
    setActualBitumenPercent(data.actualBitumenPercent);
  }, []);

  const { hasDraft, draftAge, restoreDraft, discardDraft, clearDraft } = useAutosave<DispatchFormData>({
    formKey: "plant-dispatch-new",
    data: formData,
    enabled: dialogOpen && !editingDispatch,
    onRestore: handleRestoreDraft,
  });

  const { data: dispatches, isLoading } = useQuery<TruckDispatch[]>({
    queryKey: ["/api/plant-module/dispatches"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: templates } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/dispatches", data),
    onSuccess: async () => {
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Dispatch recorded successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/dispatches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      setEditingDispatch(null);
      resetForm();
      toast({ title: "Dispatch updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/dispatches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDeleteConfirmId(null);
      toast({ title: "Dispatch deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setMixTemplateId("");
    setTruckNumber("");
    setLoadWeight("");
    setDeliveryLocation("");
    setActualBitumenPercent("");
    setEditingDispatch(null);
  };

  const openEditDialog = (dispatch: TruckDispatch) => {
    setEditingDispatch(dispatch);
    setDate(dispatch.date);
    setTime(dispatch.time || "");
    setPartyId(String(dispatch.partyId));
    setMixTemplateId(String(dispatch.mixTemplateId));
    setTruckNumber(dispatch.truckNumber);
    setLoadWeight(String(dispatch.loadWeight));
    setDeliveryLocation(dispatch.deliveryLocation || "");
    setActualBitumenPercent(dispatch.actualBitumenPercent ? String(dispatch.actualBitumenPercent) : "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!partyId || !mixTemplateId || !truckNumber || !loadWeight) return;
    
    if (editingDispatch) {
      updateMutation.mutate({
        id: editingDispatch.id,
        data: {
          date,
          time,
          partyId: parseInt(partyId),
          mixTemplateId: parseInt(mixTemplateId),
          truckNumber: truckNumber.toUpperCase(),
          loadWeight: parseFloat(loadWeight),
          deliveryLocation: deliveryLocation.toUpperCase(),
          actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
        }
      });
    } else {
      createMutation.mutate({
        date,
        time,
        partyId: parseInt(partyId),
        mixTemplateId: parseInt(mixTemplateId),
        truckNumber: truckNumber.toUpperCase(),
        loadWeight: parseFloat(loadWeight),
        deliveryLocation: deliveryLocation.toUpperCase(),
        actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
      });
    }
  };

  // Per-action PIN authentication handlers
  const requestPinAuth = (action: typeof pendingAction) => {
    setPendingAction(action);
    setPinAuthTarget("admin");
    setShowPinAuth(true);
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    if (!pendingAction) return;

    switch (pendingAction.type) {
      case "edit":
        if (pendingAction.dispatchId) {
          const dispatch = dispatches?.find(d => d.id === pendingAction.dispatchId);
          if (dispatch) openEditDialog(dispatch);
        }
        break;
      case "delete":
        if (pendingAction.dispatchId) {
          setDeleteConfirmId(pendingAction.dispatchId);
        }
        break;
      case "export-excel":
        exportToExcel();
        break;
      case "export-pdf":
        exportToPDF();
        break;
      case "print":
        handlePrint();
        break;
    }
    setPendingAction(null);
  };

  const handleEditClick = (dispatch: TruckDispatch) => {
    requestPinAuth({ type: "edit", dispatchId: dispatch.id });
  };

  const handleDeleteClick = (dispatchId: number) => {
    requestPinAuth({ type: "delete", dispatchId });
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

  const selectedTemplate = templates?.find(t => t.id === parseInt(mixTemplateId));
  const uniqueVehicles = Array.from(new Set(dispatches?.map(d => d.truckNumber) || [])).sort();

  // Filter dispatches
  const filteredDispatches = dispatches?.filter(d => {
    if (filterDateFrom && d.date < filterDateFrom) return false;
    if (filterDateTo && d.date > filterDateTo) return false;
    if (filterPartyId !== "all" && d.partyId !== parseInt(filterPartyId)) return false;
    if (filterMixType !== "all") {
      const template = templates?.find(t => t.id === d.mixTemplateId);
      if (template?.mixType?.toUpperCase() !== filterMixType) return false;
    }
    if (filterVehicle !== "all" && d.truckNumber !== filterVehicle) return false;
    return true;
  }) || [];

  // Group filtered dispatches by date
  const groupedDispatches = filteredDispatches.reduce((acc, dispatch) => {
    const dateKey = dispatch.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(dispatch);
    return acc;
  }, {} as Record<string, TruckDispatch[]>);

  // Sort dates descending, and entries within each date by time descending
  const sortedDates = Object.keys(groupedDispatches).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || "Unknown" : "Unknown";
  const getTemplateName = (id: number | null) => id ? templates?.find(t => t.id === id)?.name || "Unknown" : "Unknown";

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = filterDateFrom || "All";
    const toDate = filterDateTo || "All";
    const partyFilter = filterPartyId !== "all" 
      ? parties?.find(p => p.id === parseInt(filterPartyId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const mixTypeFilter = filterMixType !== "all" ? filterMixType : "";
    const vehicleFilter = filterVehicle !== "all" ? filterVehicle.replace(/\s+/g, '') : "";
    const filters = [partyFilter, mixTypeFilter, vehicleFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_Dispatches_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
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

  // Export functions
  const exportToExcel = async () => {
    try {
      const data = filteredDispatches.map(d => {
        const template = templates?.find(t => t.id === d.mixTemplateId);
        return {
          Date: d.date,
          Time: d.time || "",
          Party: getPartyName(d.partyId),
          Site: d.deliveryLocation || "",
          "Mix Type": template?.mixType || "",
          "Load (MT)": d.loadWeight,
          Vehicle: d.truckNumber,
          "Bitumen (MT)": d.theoreticalBitumenQty?.toFixed(2) || "0",
          "LDO (L)": d.theoreticalLdoQty?.toFixed(1) || "0",
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dispatches");
      
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

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(16);
      doc.text("Plant Production and Dispatches Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
      if (filterDateFrom || filterDateTo) {
        doc.text(`Date Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}`, 14, 28);
      }
      
      const tableData = filteredDispatches.map(d => {
        const template = templates?.find(t => t.id === d.mixTemplateId);
        return [
          d.date,
          d.time || "-",
          getPartyName(d.partyId),
          d.deliveryLocation || "-",
          template?.mixType || "-",
          `${d.loadWeight}`,
          d.truckNumber,
          d.theoreticalBitumenQty?.toFixed(2) || "0",
          d.theoreticalLdoQty?.toFixed(1) || "0",
        ];
      });
      
      (doc as any).autoTable({
        startY: filterDateFrom || filterDateTo ? 34 : 28,
        head: [["Date", "Time", "Party", "Site", "Mix", "Load", "Vehicle", "Bitumen", "LDO"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
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
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Plant Production and Dispatches Report</title>
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
            <h1>Plant Production and Dispatches Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${filterDateFrom || filterDateTo ? ` | Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}` : ""}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Party</th>
                <th>Site</th>
                <th>Mix</th>
                <th>Load (MT)</th>
                <th>Vehicle</th>
                <th>Bitumen</th>
                <th>LDO</th>
              </tr>
            </thead>
            <tbody>
              ${filteredDispatches.map(d => {
                const template = templates?.find(t => t.id === d.mixTemplateId);
                return `
                <tr>
                  <td>${d.date}</td>
                  <td>${d.time || '-'}</td>
                  <td>${getPartyName(d.partyId)}</td>
                  <td>${d.deliveryLocation || '-'}</td>
                  <td>${template?.mixType || '-'}</td>
                  <td>${d.loadWeight}</td>
                  <td>${d.truckNumber}</td>
                  <td>${d.theoreticalBitumenQty?.toFixed(2) || '0'}</td>
                  <td>${d.theoreticalLdoQty?.toFixed(1) || '0'}</td>
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Plant Production and Dispatches</h1>
            <p className="text-muted-foreground">Record outgoing mix loads by party/job</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-dispatch">
              <Plus className="w-4 h-4" /> New Dispatch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingDispatch ? "Edit Dispatch" : "Record Production Dispatch"}</DialogTitle>
            </DialogHeader>
            {hasDraft && !editingDispatch && (
              <DraftRestoreBanner
                draftAge={draftAge}
                onRestore={restoreDraft}
                onDiscard={discardDraft}
              />
            )}
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-dispatch-date" />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-dispatch-time" />
                </div>
              </div>

              <div>
                <Label>Party/Job</Label>
                <Select value={partyId} onValueChange={setPartyId}>
                  <SelectTrigger data-testid="select-dispatch-party">
                    <SelectValue placeholder="Select party" />
                  </SelectTrigger>
                  <SelectContent>
                    {parties?.map((party) => (
                      <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Mix Template</Label>
                <Select value={mixTemplateId} onValueChange={setMixTemplateId}>
                  <SelectTrigger data-testid="select-mix-template">
                    <SelectValue placeholder="Select mix template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name} ({template.mixType} - {template.bitumenPercent}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Theoretical Bitumen: {selectedTemplate.bitumenPercent}%
                  </p>
                )}
              </div>

              <div>
                <Label>Truck Number</Label>
                <Input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value.toUpperCase())} placeholder="e.g., KA-01-XX-1234" data-testid="input-truck-number" />
              </div>

              <div>
                <Label>Load Weight (MT)</Label>
                <Input type="number" step="0.1" value={loadWeight} onChange={(e) => setLoadWeight(e.target.value)} placeholder="e.g., 20.5" data-testid="input-load-weight" />
              </div>

              <div>
                <Label>Delivery Location (optional)</Label>
                <Input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value.toUpperCase())} placeholder="Site/chainage" data-testid="input-delivery-location" />
              </div>

              {editingDispatch && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Manager/Admin Only</span>
                  </div>
                  <Label>Actual Bitumen % (for analysis)</Label>
                  <Input type="number" step="0.1" value={actualBitumenPercent} onChange={(e) => setActualBitumenPercent(e.target.value)} placeholder="Leave blank to use theoretical" data-testid="input-actual-bitumen" />
                  <p className="text-xs text-muted-foreground mt-1">Stock deduction always uses theoretical values. This is for savings analysis only.</p>
                </div>
              )}

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !partyId || !mixTemplateId || !truckNumber || !loadWeight} data-testid="button-save-dispatch">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingDispatch ? "Update Dispatch" : "Save Dispatch"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Export/Print Actions */}
      <div className="flex flex-wrap items-center gap-2 p-4 rounded-lg bg-muted/50">
        <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!filteredDispatches.length} data-testid="button-export-excel">
          <Download className="w-4 h-4" /> Export Excel
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!filteredDispatches.length} data-testid="button-export-pdf">
          <Download className="w-4 h-4" /> Export PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">PARTY</Label>
              <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((party) => (
                    <SelectItem key={party.id} value={String(party.id)}>{party.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">MIX TYPE</Label>
              <Select value={filterMixType} onValueChange={setFilterMixType}>
                <SelectTrigger data-testid="select-filter-mix-type">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {MIX_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">VEHICLE NO</Label>
              <Select value={filterVehicle} onValueChange={setFilterVehicle}>
                <SelectTrigger data-testid="select-filter-vehicle">
                  <SelectValue placeholder="All Vehicles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {uniqueVehicles.map(vehicle => (
                    <SelectItem key={vehicle} value={vehicle}>{vehicle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this dispatch? This will reverse the stock ledger entries.</p>
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
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Dispatch Log
            {filteredDispatches.length > 0 && (
              <Badge variant="secondary">{filteredDispatches.length} records</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredDispatches.length ? (
            <p className="text-muted-foreground text-center py-8">
              {dispatches?.length ? "No dispatches match the current filters." : "No dispatches recorded yet."}
            </p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayDispatches = groupedDispatches[dateKey].sort((a, b) => (b.time || "").localeCompare(a.time || ""));
                return (
                  <div key={dateKey}>
                    <h3 className="font-semibold text-lg mb-3 border-b pb-2">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    <div className="space-y-2">
                      {dayDispatches.map((dispatch) => {
                        const template = templates?.find(t => t.id === dispatch.mixTemplateId);
                        return (
                          <div key={dispatch.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground text-xs block">Time</span>
                                <span className="font-medium">{dispatch.time || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Truck</span>
                                <span className="font-medium">{dispatch.truckNumber}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Load</span>
                                <span className="font-medium">{dispatch.loadWeight} MT</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Mix</span>
                                <Badge variant="outline" className="text-xs">{template?.mixType || "-"}</Badge>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Party</span>
                                <span className="font-medium">{getPartyName(dispatch.partyId)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Site</span>
                                <span className="font-medium">{dispatch.deliveryLocation || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Bitumen (MT)</span>
                                <span className="font-medium">{dispatch.theoreticalBitumenQty?.toFixed(2) || "0"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">LDO (L)</span>
                                <span className="font-medium">{dispatch.theoreticalLdoQty?.toFixed(1) || "0"}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-4">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditClick(dispatch)}
                                data-testid={`button-edit-dispatch-${dispatch.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteClick(dispatch.id)}
                                data-testid={`button-delete-dispatch-${dispatch.id}`}
                              >
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
    </div>
  );
}
