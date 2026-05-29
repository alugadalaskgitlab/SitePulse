import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useOrigin } from "@/hooks/use-origin";
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import { ChevronLeft, ChevronRight, Plus, Package, Loader2, Edit, Trash2, Download, Printer, AlertTriangle, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import type { Party, PlantMaterial, MaterialReceipt } from "@shared/schema";
import { UOM_OPTIONS } from "@shared/schema";

export default function PlantMaterialReceipts() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const { sectionCan } = useAuth();
  const canCreate = sectionCan("plant_stock", "create");
  const canEdit = sectionCan("plant_stock", "edit");
  const canExport = sectionCan("plant_stock", "view_reports");
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<MaterialReceipt | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Deep-link highlight support: ?highlight=<receiptId>
  // Deep-link edit support: ?edit=<receiptId>
  const searchString = useSearch();
  const highlightId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("highlight");
    return v ? parseInt(v, 10) : null;
  }, [searchString]);
  const editId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("edit");
    return v ? parseInt(v, 10) : null;
  }, [searchString]);
  const highlightRowRef = useRef<HTMLDivElement | null>(null);
  const [localHighlightId, setLocalHighlightId] = useState<number | null>(null);
  const [autoEditDone, setAutoEditDone] = useState(false);
  useEffect(() => {
    if (highlightId != null) {
      setLocalHighlightId(highlightId);
      setExpandedIds(prev => { const s = new Set(prev); s.add(highlightId); return s; });
    }
  }, [highlightId]);
  // Filter state
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("all");
  const [filterMaterialId, setFilterMaterialId] = useState("all");
  const [filterUnapprovedIndent, setFilterUnapprovedIndent] = useState(false);
  
  // Form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState("Ton");
  const [supplier, setSupplier] = useState("");
  const [transporter, setTransporter] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [tankNumber, setTankNumber] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [indentRef, setIndentRef] = useState("");
  const [indentComboSearch, setIndentComboSearch] = useState("");
  const [indentComboOpen, setIndentComboOpen] = useState(false);
  const indentComboRef = useRef<HTMLDivElement>(null);
  const [indentOverride, setIndentOverride] = useState(false);

  interface ReceiptFormData {
    date: string;
    time: string;
    partyId: string;
    materialId: string;
    quantity: string;
    uom: string;
    supplier: string;
    transporter: string;
    vehicleNumber: string;
    challanNumber: string;
    tankNumber: string;
    invoiceNo: string;
    invoiceDate: string;
    indentRef: string;
  }

  const formData = useMemo<ReceiptFormData>(() => ({
    date, time, partyId, materialId, quantity, uom, supplier, transporter, vehicleNumber, challanNumber, tankNumber, invoiceNo, invoiceDate, indentRef
  }), [date, time, partyId, materialId, quantity, uom, supplier, transporter, vehicleNumber, challanNumber, tankNumber, invoiceNo, invoiceDate, indentRef]);

  const handleRestoreDraft = useCallback((data: ReceiptFormData) => {
    setDate(data.date);
    setTime(data.time);
    setPartyId(data.partyId);
    setMaterialId(data.materialId);
    setQuantity(data.quantity);
    setUom(data.uom);
    setSupplier(data.supplier);
    setTransporter(data.transporter || "");
    setVehicleNumber(data.vehicleNumber);
    setChallanNumber(data.challanNumber);
    setTankNumber(data.tankNumber || "");
    setInvoiceNo(data.invoiceNo || "");
    setInvoiceDate(data.invoiceDate || "");
    setIndentRef(data.indentRef || "");
  }, []);

  const { hasDraft, draftAge, lastSavedAt, isDirty, restoreDraft, discardDraft, clearDraft } = useAutosave<ReceiptFormData>({
    formKey: "plant-material-receipt-new",
    data: formData,
    enabled: dialogOpen && !editingReceipt,
    onRestore: handleRestoreDraft,
  });

  const [, setLocation] = useLocation();
  const { confirmLeave } = useBeforeUnload(isDirty);

  const { data: receipts, isLoading } = useQuery<MaterialReceipt[]>({
    queryKey: ["/api/plant-module/material-receipts"],
  });

  // Fetch all purchase indents to resolve indentRef → status in the list view
  const { data: allIndents = [] } = useQuery<{ id: number; indentNo: string; status: string }[]>({
    queryKey: ["/api/purchase-indents"],
  });
  const indentStatusMap = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    allIndents.forEach(pi => { m[pi.indentNo] = pi.status; });
    return m;
  }, [allIndents]);

  useEffect(() => {
    if (localHighlightId != null && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("highlight");
        history.replaceState(null, "", url.toString());
        setLocalHighlightId(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [localHighlightId, receipts]);

  // Auto-open edit dialog from ?edit=<id> deep link
  useEffect(() => {
    if (editId != null && receipts && !autoEditDone) {
      const target = receipts.find(r => r.id === editId);
      if (target) {
        setAutoEditDone(true);
        openEditDialog(target);
        const url = new URL(window.location.href);
        url.searchParams.delete("edit");
        history.replaceState(null, "", url.toString());
      }
    }
  }, [editId, receipts, autoEditDone]);

  // When the page was opened via a deep-link ?edit= (e.g. from the stock ledger),
  // navigate back to the origin page once the user closes the dialog.
  useEffect(() => {
    if (autoEditDone && !dialogOpen) {
      setLocation(backLink);
    }
  }, [autoEditDone, dialogOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (indentComboRef.current && !indentComboRef.current.contains(e.target as Node)) {
        setIndentComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const selectedMaterialName = useMemo(() => {
    const m = materials?.find(m => m.id === parseInt(materialId || "0"));
    return m?.name || "";
  }, [materials, materialId]);

  const { data: allPurchaseIndents = [] } = useQuery<{id: number; indentNo: string; status: string; date?: string; raisedBy?: string; items: {description: string; qty: number; uom: string}[]}[]>({
    queryKey: ["/api/purchase-indents/for-material", selectedMaterialName],
    queryFn: () => {
      const url = selectedMaterialName
        ? `/api/purchase-indents/for-material?name=${encodeURIComponent(selectedMaterialName)}`
        : "/api/purchase-indents/for-material";
      return fetch(url).then(r => r.json());
    },
    select: (data: any[]) => data.map(d => ({
      id: d.id,
      indentNo: d.indentNo,
      status: d.status,
      date: d.date,
      raisedBy: d.raisedBy,
      items: (d.items || []).map((it: any) => ({ description: it.description || "", qty: it.qty, uom: it.uom })),
    })),
  });

  const { data: nextReceiptNoData } = useQuery<{ number: string }>({
    queryKey: ["/api/plant-module/next-receipt-number", materialId],
    queryFn: () => fetch(`/api/plant-module/next-receipt-number?materialId=${materialId}`).then(r => r.json()),
    enabled: dialogOpen && !editingReceipt && !!materialId,
    staleTime: 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/material-receipts", data),
    onSuccess: async () => {
      await clearDraft();
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/material-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Material receipt recorded successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/material-receipts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/material-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDialogOpen(false);
      setEditingReceipt(null);
      resetForm();
      toast({ title: "Receipt updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/material-receipts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/material-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-balances"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/stock-ledger"] });
      setDeleteConfirmId(null);
      toast({ title: "Receipt deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setMaterialId("");
    setQuantity("");
    setUom("Ton");
    setSupplier("");
    setTransporter("");
    setVehicleNumber("");
    setChallanNumber("");
    setTankNumber("");
    setInvoiceNo("");
    setInvoiceDate("");
    setIndentRef("");
    setIndentComboSearch("");
    setIndentOverride(false);
  };

  const openEditDialog = (receipt: MaterialReceipt) => {
    setEditingReceipt(receipt);
    setDate(receipt.date);
    setTime(receipt.time || "");
    setPartyId(receipt.partyId ? String(receipt.partyId) : "");
    setMaterialId(String(receipt.materialId));
    setQuantity(String(receipt.quantity));
    setUom(receipt.uom);
    setSupplier(receipt.supplier || "");
    setTransporter(receipt.transporter || "");
    setVehicleNumber(receipt.vehicleNumber || "");
    setChallanNumber(receipt.challanNumber || "");
    setTankNumber(receipt.tankNumber ? String(receipt.tankNumber) : "");
    setInvoiceNo((receipt as any).invoiceNo || "");
    setInvoiceDate((receipt as any).invoiceDate || "");
    setIndentRef((receipt as any).indentRef || "");
    setIndentComboSearch("");
    setIndentOverride(false);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!materialId || !quantity || !partyId || !challanNumber.trim()) {
      if (!challanNumber.trim()) {
        toast({ title: "Error", description: "Challan / DN No. is required", variant: "destructive" });
      }
      return;
    }
    const selectedPI = indentRef ? allPurchaseIndents.find(pi => pi.indentNo === indentRef) : null;
    if (selectedPI && selectedPI.status !== "approved" && !indentOverride) {
      toast({ title: "Indent not approved", description: "Tick the override checkbox to proceed.", variant: "destructive" });
      return;
    }
    
    const selectedMaterial = materials?.find(m => m.id === parseInt(materialId));
    const isTankMaterial = selectedMaterial && (
      selectedMaterial.category === "Bitumen" ||
      selectedMaterial.category === "LDO" ||
      (selectedMaterial.name || "").toUpperCase() === "LDO" ||
      selectedMaterial.category === "Utility" ||
      (selectedMaterial.name || "").toUpperCase() === "DIESEL" ||
      (selectedMaterial.name || "").toUpperCase() === "HSD"
    );
    
    if (editingReceipt) {
      const updateData = {
        date,
        time,
        partyId: parseInt(partyId),
        isPlantCommon: 0,
        materialId: parseInt(materialId),
        quantity: parseFloat(quantity),
        uom,
        supplier,
        transporter,
        vehicleNumber,
        challanNumber,
        invoiceNo: invoiceNo || null,
        invoiceDate: invoiceDate || null,
        indentRef: indentRef || null,
        tankNumber: (isTankMaterial && tankNumber && tankNumber !== "none") ? parseInt(tankNumber) : null,
      };
      updateMutation.mutate({ id: editingReceipt.id, data: updateData });
    } else {
      const data = {
        date,
        time,
        partyId: parseInt(partyId),
        isPlantCommon: 0,
        materialId: parseInt(materialId),
        quantity: parseFloat(quantity),
        uom,
        supplier,
        transporter,
        vehicleNumber,
        challanNumber,
        invoiceNo: invoiceNo || null,
        invoiceDate: invoiceDate || null,
        indentRef: indentRef || null,
        tankNumber: (isTankMaterial && tankNumber && tankNumber !== "none") ? parseInt(tankNumber) : null,
      };
      createMutation.mutate(data);
    }
  };

  const handleEditClick = (receipt: MaterialReceipt) => {
    openEditDialog(receipt);
  };

  const handleDeleteClick = (receiptId: number) => {
    setDeleteConfirmId(receiptId);
  };

  const handleExportExcelClick = () => exportToExcel();
  const handleExportPdfClick = () => exportToPDF();
  const handlePrintClick = () => handlePrint();

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || "Unknown";
  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || "Unknown" : "Unknown";

  // Filter receipts
  const filteredReceipts = receipts?.filter(r => {
    if (filterDateFrom && r.date < filterDateFrom) return false;
    if (filterDateTo && r.date > filterDateTo) return false;
    if (filterPartyId !== "all") {
      if (r.partyId !== parseInt(filterPartyId)) return false;
    }
    if (filterMaterialId !== "all" && r.materialId !== parseInt(filterMaterialId)) return false;
    if (filterUnapprovedIndent) {
      const ref = (r as any).indentRef;
      if (!ref) return false;
      const status = indentStatusMap[ref];
      if (status === "approved") return false;
    }
    return true;
  }) || [];

  // Group filtered receipts by date
  const groupedReceipts = filteredReceipts.reduce((acc, receipt) => {
    const dateKey = receipt.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(receipt);
    return acc;
  }, {} as Record<string, MaterialReceipt[]>);

  // Sort dates descending
  const sortedDates = Object.keys(groupedReceipts).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  // Calculate totals for filtered receipts (grouped by material)
  const filteredTotals = useMemo(() => {
    if (!filteredReceipts.length) return [];
    const totalsMap: Record<string, { materialId: number; materialName: string; uom: string; total: number }> = {};
    filteredReceipts.forEach(r => {
      const key = `${r.materialId}-${r.uom}`;
      if (!totalsMap[key]) {
        totalsMap[key] = { materialId: r.materialId, materialName: getMaterialName(r.materialId), uom: r.uom, total: 0 };
      }
      totalsMap[key].total += r.quantity;
    });
    return Object.values(totalsMap);
  }, [filteredReceipts, materials]);

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = filterDateFrom || "All";
    const toDate = filterDateTo || "All";
    const partyFilter = filterPartyId !== "all" 
      ? (parties?.find(p => p.id === parseInt(filterPartyId))?.name?.replace(/\s+/g, '') || "")
      : "";
    const materialFilter = filterMaterialId !== "all" 
      ? materials?.find(m => m.id === parseInt(filterMaterialId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const filters = [partyFilter, materialFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_MaterialReceipts_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
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
      const data = filteredReceipts.map(r => ({
        Date: r.date,
        Time: r.time || "",
        Material: getMaterialName(r.materialId),
        "RECV No": (r as any).receiptNo || "",
        Quantity: r.quantity,
        UOM: r.uom,
        "Vehicle No": r.vehicleNumber || "",
        "Challan No": r.challanNumber || "",
        "Invoice No": (r as any).invoiceNo || "",
        "Invoice Date": (r as any).invoiceDate || "",
        "Indent Ref": (r as any).indentRef || "",
        Supplier: r.supplier || "",
        Transporter: r.transporter || "",
        "Party/Job": getPartyName(r.partyId),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Material Receipts");
      
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
      doc.text("Material Receipts Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
      if (filterDateFrom || filterDateTo) {
        doc.text(`Date Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}`, 14, 28);
      }
      
      const tableData = filteredReceipts.map(r => [
        (r as any).receiptNo || "-",
        r.date,
        r.time || "-",
        getMaterialName(r.materialId),
        `${r.quantity} ${r.uom}`,
        r.vehicleNumber || "-",
        r.challanNumber || "-",
        (r as any).invoiceNo || "-",
        (r as any).invoiceDate || "-",
        r.supplier || "-",
        r.transporter || "-",
        getPartyName(r.partyId),
        (r as any).indentRef || "-",
      ]);
      
      autoTable(doc, {
        startY: filterDateFrom || filterDateTo ? 34 : 28,
        head: [["RECV No", "Date", "Time", "Material", "Quantity", "Vehicle No", "Challan", "Invoice No", "Inv Date", "Supplier", "Transporter", "Party/Job", "Indent Ref"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 6 },
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
    // Create a printable version formatted for A4 portrait
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Material Receipts Report</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 15px; margin: 0; font-size: 11px; }
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
            <h1>Material Receipts Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}${filterDateFrom || filterDateTo ? ` | Range: ${filterDateFrom || "Start"} to ${filterDateTo || "End"}` : ""}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>RECV No.</th>
                <th>Date</th>
                <th>Time</th>
                <th>Material</th>
                <th>Qty</th>
                <th>UOM</th>
                <th>Vehicle</th>
                <th>Challan</th>
                <th>Invoice No</th>
                <th>Invoice Date</th>
                <th>Indent Ref</th>
                <th>Supplier</th>
                <th>Transporter</th>
                <th>Party/Job</th>
              </tr>
            </thead>
            <tbody>
              ${filteredReceipts.map(r => `
                <tr>
                  <td>${(r as any).receiptNo || '-'}</td>
                  <td>${r.date}</td>
                  <td>${r.time || '-'}</td>
                  <td>${getMaterialName(r.materialId)}</td>
                  <td>${r.quantity}</td>
                  <td>${r.uom}</td>
                  <td>${r.vehicleNumber || '-'}</td>
                  <td>${r.challanNumber || '-'}</td>
                  <td>${(r as any).invoiceNo || '-'}</td>
                  <td>${(r as any).invoiceDate || '-'}</td>
                  <td>${(r as any).indentRef || '-'}</td>
                  <td>${r.supplier || '-'}</td>
                  <td>${r.transporter || '-'}</td>
                  <td>${getPartyName(r.partyId)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        <script>window.onload=function(){setTimeout(function(){window.print();},300);}</script>
        </body>
      </html>
    `;
    
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';

    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 30000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => confirmLeave(() => setLocation(backLink))} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Material Receipts</h1>
            <p className="text-muted-foreground">Record incoming materials at plant</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingReceipt(null); resetForm(); } }}>
          {canCreate && (
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-receipt">
                <Plus className="w-4 h-4" /> New Receipt
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {editingReceipt ? "Edit Receipt" : "Record Material Receipt"}
                {!editingReceipt && nextReceiptNoData?.number && (
                  <span className="text-xs font-mono font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded" data-testid="text-recv-preview-number">
                    {nextReceiptNoData.number}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            {hasDraft && !editingReceipt && (
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
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-receipt-date" />
                </div>
                <div>
                  <Label>Time</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-receipt-time" />
                </div>
              </div>

              <div>
                <Label>Party/Job</Label>
                <Select value={partyId} onValueChange={setPartyId}>
                  <SelectTrigger data-testid="select-party">
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
                <Label>Material</Label>
                <Select value={materialId} onValueChange={(v) => { setMaterialId(v); setTankNumber(""); const m = materials?.find(x => x.id === parseInt(v)); if (m) setUom(m.defaultUom || "Ton"); }}>
                  <SelectTrigger data-testid="select-material">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials?.map((material) => (
                      <SelectItem key={material.id} value={String(material.id)}>{material.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(() => {
                const selectedMat = materials?.find(m => m.id === parseInt(materialId));
                const isLdo = selectedMat && (selectedMat.category === "LDO" || (selectedMat.name || "").toUpperCase() === "LDO");
                const isDiesel = selectedMat && (
                  selectedMat.category === "Utility" ||
                  (selectedMat.name || "").toUpperCase() === "DIESEL" ||
                  (selectedMat.name || "").toUpperCase() === "HSD"
                );
                const isFuel = isLdo || isDiesel;
                const showTank = selectedMat && (selectedMat.category === "Bitumen" || isFuel);
                if (!showTank) return null;
                return (
                  <div>
                    <Label>Receiving Tank</Label>
                    <Select value={tankNumber} onValueChange={setTankNumber}>
                      <SelectTrigger data-testid="select-tank-number">
                        <SelectValue placeholder={isFuel ? "Select tank or keep as stock" : "Select tank"} />
                      </SelectTrigger>
                      <SelectContent>
                        {isFuel && <SelectItem value="none">Keep as Stock — barrel / no tank</SelectItem>}
                        <SelectItem value="1">Tank 1{isFuel ? " — Boiler" : ""}</SelectItem>
                        <SelectItem value="2">Tank 2{isFuel ? " — Dryer" : ""}</SelectItem>
                      </SelectContent>
                    </Select>
                    {isFuel && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Choose a tank to log this receipt in the LDO flow tracker, or select "Keep as Stock" if storing in barrels to issue later.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" data-testid="input-quantity" />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Select value={uom} onValueChange={setUom}>
                    <SelectTrigger data-testid="select-uom">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UOM_OPTIONS.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Supplier</Label>
                  <Input value={supplier} onChange={(e) => setSupplier(e.target.value.toUpperCase())} placeholder="Who sold it" data-testid="input-supplier" />
                </div>
                <div>
                  <Label>Transporter <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={transporter} onChange={(e) => setTransporter(e.target.value.toUpperCase())} placeholder="Who carried it" data-testid="input-transporter" />
                </div>
              </div>

              {!editingReceipt && (
                <div>
                  <Label className="text-xs text-muted-foreground">System Receipt No. (auto-assigned)</Label>
                  <div className="flex items-center h-9 px-3 border rounded-md bg-muted/50 text-sm font-mono text-muted-foreground" data-testid="text-system-recv-no">
                    {nextReceiptNoData?.number || (materialId ? "…" : "Select material first")}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle No</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g., KA-01-XX-1234" data-testid="input-vehicle" />
                </div>
                <div>
                  <Label>Challan / DN No. <span className="text-destructive">*</span></Label>
                  <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value.toUpperCase())} placeholder="Supplier challan / delivery note no. (Required)" data-testid="input-challan" className={!challanNumber.trim() ? "border-destructive/50" : ""} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Invoice No. <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value.toUpperCase())} placeholder="e.g. INV-2024-001" data-testid="input-invoice-no" />
                </div>
                <div>
                  <Label>Invoice Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} data-testid="input-invoice-date" />
                </div>
              </div>

              {/* Indent Ref — searchable combobox + status card */}
              {(() => {
                const selectedPI = indentRef ? allPurchaseIndents.find(pi => pi.indentNo === indentRef) : null;
                const isNotApproved = selectedPI && selectedPI.status !== "approved";
                const filteredPIs = allPurchaseIndents.filter(pi =>
                  !indentComboSearch || pi.indentNo.toLowerCase().includes(indentComboSearch.toLowerCase())
                );
                const getStatusBadge = (status: string) => {
                  switch (status) {
                    case "approved": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-[10px] px-1.5 py-0">APPROVED</Badge>;
                    case "pending": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0">PENDING</Badge>;
                    case "completed": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700 text-[10px] px-1.5 py-0">COMPLETED</Badge>;
                    case "rejected": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 text-[10px] px-1.5 py-0">REJECTED</Badge>;
                    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status.toUpperCase()}</Badge>;
                  }
                };
                return (
                  <div className="space-y-1.5">
                    <Label>Indent Ref. <span className="text-muted-foreground text-xs">(optional — link to purchase indent)</span></Label>
                    <div ref={indentComboRef} className="relative">
                      <div className="flex items-center gap-1">
                        <Input
                          value={indentRef || indentComboSearch}
                          onChange={e => {
                            const v = e.target.value;
                            if (indentRef) {
                              setIndentRef("");
                              setIndentComboSearch(v);
                            } else {
                              setIndentComboSearch(v);
                            }
                            setIndentComboOpen(true);
                            setIndentOverride(false);
                          }}
                          onFocus={() => setIndentComboOpen(true)}
                          placeholder="Type PI number to search…"
                          data-testid="input-indent-ref"
                          autoComplete="off"
                        />
                        {indentRef && (
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0"
                            onClick={() => { setIndentRef(""); setIndentComboSearch(""); setIndentOverride(false); }}
                          >
                            <span className="sr-only">Clear</span>✕
                          </Button>
                        )}
                      </div>
                      {indentComboOpen && !indentRef && filteredPIs.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                          {filteredPIs.map(pi => (
                            <div
                              key={pi.id}
                              className="px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-between gap-2"
                              onMouseDown={e => {
                                e.preventDefault();
                                setIndentRef(pi.indentNo);
                                setIndentComboSearch("");
                                setIndentComboOpen(false);
                              }}
                              data-testid={`option-indent-${pi.indentNo}`}
                            >
                              <span className="font-semibold text-sm">{pi.indentNo}</span>
                              {getStatusBadge(pi.status)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedPI && (
                      <div className={`rounded-md border p-2.5 space-y-1 text-xs ${isNotApproved ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{selectedPI.indentNo}</span>
                          {getStatusBadge(selectedPI.status)}
                          <span className="text-muted-foreground">{selectedPI.items.length} item{selectedPI.items.length !== 1 ? "s" : ""}</span>
                          {selectedPI.date && <span className="text-muted-foreground">· {selectedPI.date}</span>}
                          {selectedPI.raisedBy && <span className="text-muted-foreground">by {selectedPI.raisedBy}</span>}
                        </div>
                        {selectedPI.items.slice(0, 3).map((it, i) => (
                          <div key={i} className="text-muted-foreground">{it.description} — {it.qty} {it.uom}</div>
                        ))}
                        {selectedPI.items.length > 3 && <div className="text-muted-foreground">+{selectedPI.items.length - 3} more</div>}
                      </div>
                    )}
                    {isNotApproved && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            This indent is <strong>{selectedPI.status.toUpperCase()}</strong> — not yet approved.
                          </p>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={indentOverride}
                              onChange={e => setIndentOverride(e.target.checked)}
                              data-testid="checkbox-indent-override"
                            />
                            <span className="text-amber-700 dark:text-amber-300">Override — proceed with unapproved indent</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !materialId || !quantity || !challanNumber.trim()} data-testid="button-save-receipt">
                  {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingReceipt ? "Update Receipt" : "Save Receipt"}
                </Button>
                {!editingReceipt && <AutoSaveIndicator lastSavedAt={lastSavedAt} className="justify-center w-full" />}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Export/Print Actions */}
      {canExport && (
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!filteredReceipts.length} data-testid="button-export-excel">
              <Download className="w-4 h-4" /> Export Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!filteredReceipts.length} data-testid="button-export-pdf">
              <Download className="w-4 h-4" /> Export PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              <Label className="text-xs text-muted-foreground">MATERIAL</Label>
              <Select value={filterMaterialId} onValueChange={setFilterMaterialId}>
                <SelectTrigger data-testid="select-filter-material">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {materials?.map((material) => (
                    <SelectItem key={material.id} value={String(material.id)}>{material.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant={filterUnapprovedIndent ? "default" : "outline"}
              className={filterUnapprovedIndent ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600" : ""}
              onClick={() => setFilterUnapprovedIndent(v => !v)}
              data-testid="btn-filter-unapproved-indent"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
              Unapproved Indent Only
            </Button>
            {filterUnapprovedIndent && (
              <span className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-unapproved-filter-active">
                Showing receipts linked to pending or rejected indents
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this receipt? This will also reverse the stock balance.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Totals Summary */}
      {filteredTotals.length > 0 && (
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-green-700 dark:text-green-300">Filtered Totals:</span>
              {filteredTotals.map((t, i) => (
                <Badge key={i} variant="outline" className="text-green-700 dark:text-green-300 border-green-400 dark:border-green-600 text-sm px-3 py-1">
                  {t.materialName}: {t.total.toFixed(3)} {t.uom}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Receipt Log
            {filteredReceipts.length > 0 && (
              <Badge variant="secondary">{filteredReceipts.length} records</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredReceipts.length ? (
            <p className="text-muted-foreground text-center py-8">
              {receipts?.length ? "No receipts match the current filters." : "No receipts recorded yet."}
            </p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayReceipts = groupedReceipts[dateKey].sort((a, b) => (b.time || "").localeCompare(a.time || ""));
                const dayTotal = filterMaterialId !== "all"
                  ? dayReceipts.reduce((sum, r) => sum + r.quantity, 0)
                  : null;
                const dayUom = dayTotal !== null && dayReceipts.length > 0 ? dayReceipts[0].uom : null;
                return (
                  <div key={dateKey}>
                    <div className="sticky top-14 z-10 bg-background border-b pb-2 mb-3 pt-1">
                      <h3 className="font-semibold text-lg flex items-center justify-between gap-2">
                        <span>{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</span>
                        {dayTotal !== null && (
                          <span className="text-sm font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                            Total: {dayTotal.toFixed(3)} {dayUom}
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="space-y-2">
                      {dayReceipts.map((receipt) => {
                        const isExpanded = expandedIds.has(receipt.id);
                        return (
                          <div
                            key={receipt.id}
                            ref={receipt.id === localHighlightId ? highlightRowRef : null}
                            className={`rounded-lg overflow-hidden transition-all duration-500 ${receipt.id === localHighlightId ? "bg-yellow-100 dark:bg-yellow-900/40 ring-2 ring-yellow-400 dark:ring-yellow-600" : "bg-muted/50"}`}
                          >
                            <div
                              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                              onClick={() => setExpandedIds(prev => { const s = new Set(prev); s.has(receipt.id) ? s.delete(receipt.id) : s.add(receipt.id); return s; })}
                            >
                              <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
                              <div className="flex-1 flex items-center gap-x-4 gap-y-1 flex-wrap text-sm min-w-0">
                                {(receipt as any).receiptNo && (
                                  <span className="text-[10px] font-mono font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 px-1.5 py-0.5 rounded" data-testid={`text-recv-no-${receipt.id}`}>
                                    {(receipt as any).receiptNo}
                                  </span>
                                )}
                                {receipt.time && <span className="text-xs text-muted-foreground">{receipt.time}</span>}
                                <span className="font-semibold">{getMaterialName(receipt.materialId)}</span>
                                <span className="font-medium">{receipt.quantity} {receipt.uom}</span>
                                {receipt.vehicleNumber && <span className="text-xs text-muted-foreground">{receipt.vehicleNumber}</span>}
                                {receipt.supplier && <span className="text-xs text-muted-foreground">{receipt.supplier}</span>}
                              </div>
                              {canEdit && (
                                <div className="flex gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                  <Button size="icon" variant="ghost" onClick={() => handleEditClick(receipt)} data-testid={`button-edit-receipt-${receipt.id}`}>
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(receipt.id)} data-testid={`button-delete-receipt-${receipt.id}`}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {isExpanded && (
                              <div className="px-4 pb-4 pt-3 border-t border-border/50">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground text-xs block">RECV No.</span>
                                    <span className="font-medium font-mono text-xs">{(receipt as any).receiptNo || "—"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Time</span>
                                    <span className="font-medium">{receipt.time || "-"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Material</span>
                                    <span className="font-medium">{getMaterialName(receipt.materialId)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Quantity</span>
                                    <span className="font-medium">{receipt.quantity} {receipt.uom}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Vehicle</span>
                                    <span className="font-medium">{receipt.vehicleNumber || "-"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Challan</span>
                                    <span className="font-medium">{receipt.challanNumber || "-"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Supplier</span>
                                    <span className="font-medium">{receipt.supplier || "-"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Transporter</span>
                                    <span className="font-medium">{receipt.transporter || "-"}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs block">Party/Job</span>
                                    <span className="font-medium">{getPartyName(receipt.partyId)}</span>
                                  </div>
                                  {(receipt as any).invoiceNo && (
                                    <div>
                                      <span className="text-muted-foreground text-xs block">Invoice No</span>
                                      <span className="font-medium">{(receipt as any).invoiceNo}</span>
                                    </div>
                                  )}
                                  {(receipt as any).invoiceDate && (
                                    <div>
                                      <span className="text-muted-foreground text-xs block">Invoice Date</span>
                                      <span className="font-medium">{(receipt as any).invoiceDate}</span>
                                    </div>
                                  )}
                                  {(receipt as any).indentRef && (
                                    <div>
                                      <span className="text-muted-foreground text-xs block">Indent Ref</span>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="outline" className="text-xs border-violet-400 text-violet-700 dark:text-violet-400" data-testid={`badge-indent-ref-${receipt.id}`}>{(receipt as any).indentRef}</Badge>
                                        {(() => {
                                          const status = indentStatusMap[(receipt as any).indentRef];
                                          if (!status) return null;
                                          switch (status) {
                                            case "approved": return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" data-testid={`badge-indent-status-${receipt.id}`}>APPROVED</Badge>;
                                            case "pending": return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid={`badge-indent-status-${receipt.id}`}>PENDING</Badge>;
                                            case "rejected": return <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" data-testid={`badge-indent-status-${receipt.id}`}>REJECTED</Badge>;
                                            default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0" data-testid={`badge-indent-status-${receipt.id}`}>{status.toUpperCase()}</Badge>;
                                          }
                                        })()}
                                      </div>
                                    </div>
                                  )}
                                  {receipt.tankNumber && (
                                    <div>
                                      <span className="text-muted-foreground text-xs block">Tank</span>
                                      <Badge variant="outline">T{receipt.tankNumber}</Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
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
