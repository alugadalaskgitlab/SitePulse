import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Layers, Package, Loader2, Search, Calendar, Download, Printer } from "lucide-react";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import type { Party, PlantMaterial, StockLedgerEntry } from "@shared/schema";

export default function PlantStock() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedPartyId, setSelectedPartyId] = useState<string>("all");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("all");

  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "export-excel" | "export-pdf" | "print" } | null>(null);

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: materials } = useQuery<PlantMaterial[]>({ queryKey: ["/api/plant-module/materials"] });
  // Note: stock-balances API removed - Current Balances now derives from ledger entries via stockSummary
  // This ensures consistency between Stock Summary and Current Balances tabs

  const buildLedgerUrl = () => {
    const params = new URLSearchParams();
    if (selectedPartyId !== "all") params.set("partyId", selectedPartyId);
    if (selectedMaterialId !== "all") params.set("materialId", selectedMaterialId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/api/plant-module/stock-ledger?${params.toString()}`;
  };

  const { data: ledger, isLoading: ledgerLoading } = useQuery<StockLedgerEntry[]>({ 
    queryKey: [buildLedgerUrl()] 
  });

  const getMaterialName = (id: number) => materials?.find((m) => m.id === id)?.name || `Material ${id}`;
  const getPartyName = (id: number | null) => id ? parties?.find((p) => p.id === id)?.name || `Party ${id}` : "Unknown";

  // Filter out old equipment_issue entries (legacy - no longer created) and calculate running balances
  const processedLedger = useMemo(() => {
    if (!ledger) return [];
    
    // Exclude old equipment_issue entries - they are legacy and should not affect calculations
    const validEntries = ledger.filter(e => e.transactionType !== 'equipment_issue');
    
    // Transaction type priority: opening/receipt first, then issues/dispatches
    const getTypePriority = (type: string) => {
      switch (type) {
        case 'opening': return 1;
        case 'receipt': return 2;
        case 'adjustment': return 3;
        case 'equipment_usage': return 4;
        case 'issue': return 5;
        case 'dispatch': return 6;
        default: return 7;
      }
    };
    
    // Sort chronologically (oldest first) for running balance calculation
    const sorted = [...validEntries].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // Within same date, sort by transaction type priority (receipts before issues)
      const typePriorityA = getTypePriority(a.transactionType);
      const typePriorityB = getTypePriority(b.transactionType);
      if (typePriorityA !== typePriorityB) return typePriorityA - typePriorityB;
      // Then by creation time
      const aCreated = a.createdAt ? String(a.createdAt) : '';
      const bCreated = b.createdAt ? String(b.createdAt) : '';
      return aCreated.localeCompare(bCreated);
    });
    
    // Group by material + party for per-group running balance
    const groupBalances: Record<string, number> = {};
    
    return sorted.map(entry => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      if (groupBalances[key] === undefined) groupBalances[key] = 0;
      
      groupBalances[key] += (entry.quantityIn || 0) - (entry.quantityOut || 0);
      
      return {
        ...entry,
        calculatedBalance: groupBalances[key]
      };
    });
  }, [ledger]);

  // For display, reverse to show most recent first
  const ledgerForDisplay = useMemo(() => {
    return [...processedLedger].reverse();
  }, [processedLedger]);

  // Calculate totals for filtered ledger data
  const ledgerTotals = useMemo(() => {
    if (!ledgerForDisplay?.length) return { totalIn: 0, totalOut: 0, netChange: 0 };
    return ledgerForDisplay.reduce((acc, entry) => ({
      totalIn: acc.totalIn + (entry.quantityIn || 0),
      totalOut: acc.totalOut + (entry.quantityOut || 0),
      netChange: acc.netChange + (entry.quantityIn || 0) - (entry.quantityOut || 0)
    }), { totalIn: 0, totalOut: 0, netChange: 0 });
  }, [ledgerForDisplay]);

  const computeStockSummary = () => {
    if (!ledger || !materials) return [];

    const summaryMap: Record<string, {
      materialId: number;
      materialName: string;
      partyId: number | null;
      partyName: string;
      uom: string;
      openingStock: number;
      received: number;
      consumed: number;
      closing: number;
    }> = {};

    // Use processedLedger which excludes equipment_issue entries
    processedLedger.forEach((entry) => {
      const key = `${entry.materialId}-${entry.partyId ?? 0}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          materialId: entry.materialId,
          materialName: getMaterialName(entry.materialId),
          partyId: entry.partyId,
          partyName: getPartyName(entry.partyId),
          uom: entry.uom || "Ton",
          openingStock: 0,
          received: 0,
          consumed: 0,
          closing: 0,
        };
      }

      // Opening stock entries (from Masters -> Opening Stock)
      if (entry.transactionType === "opening") {
        summaryMap[key].openingStock += entry.quantityIn || 0;
      }
      // Receipts (from Material Receipts) and adjustments
      else if (entry.transactionType === "receipt" || entry.transactionType === "adjustment") {
        summaryMap[key].received += entry.quantityIn || 0;
      }
      // Consumed: dispatch, issue, equipment_usage (equipment_issue excluded from processedLedger)
      else if (entry.transactionType === "dispatch" || entry.transactionType === "issue" || entry.transactionType === "equipment_usage") {
        summaryMap[key].consumed += Math.abs(entry.quantityOut || 0);
      }
    });

    // Calculate closing balance from the ledger transactions (not from stockBalances API)
    Object.values(summaryMap).forEach((item) => {
      item.closing = item.openingStock + item.received - item.consumed;
    });

    return Object.values(summaryMap);
  };

  const stockSummary = computeStockSummary();

  // Derive current balances from Stock Summary (which is computed from ledger entries, excluding legacy equipment_issue)
  // This ensures Current Balances and Stock Summary are always consistent
  const computedBalances = useMemo(() => {
    return stockSummary.map(item => ({
      materialId: item.materialId,
      partyId: item.partyId,
      balance: item.closing,
      uom: item.uom,
      materialName: item.materialName,
      partyName: item.partyName,
    }));
  }, [stockSummary]);

  const filteredBalances = computedBalances?.filter((b) => {
    if (selectedPartyId !== "all" && String(b.partyId ?? "") !== selectedPartyId && selectedPartyId !== "common") return false;
    if (selectedPartyId === "common" && b.partyId !== null) return false;
    if (selectedMaterialId !== "all" && b.materialId !== Number(selectedMaterialId)) return false;
    return true;
  });

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = dateFrom || "All";
    const toDate = dateTo || "All";
    const partyFilter = selectedPartyId !== "all" 
      ? (selectedPartyId === "common" ? "PlantCommon" : parties?.find(p => p.id === parseInt(selectedPartyId))?.name?.replace(/\s+/g, '') || "")
      : "";
    const materialFilter = selectedMaterialId !== "all" 
      ? materials?.find(m => m.id === parseInt(selectedMaterialId))?.name?.replace(/\s+/g, '') || ""
      : "";
    const filters = [partyFilter, materialFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_Stock_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
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

  const exportToExcel = async () => {
    try {
      const summaryData = stockSummary.map(item => ({
        Material: item.materialName,
        "Stock Owner": item.partyName,
        Opening: item.openingStock.toFixed(2),
        Received: item.received.toFixed(2),
        Consumed: item.consumed.toFixed(2),
        Closing: item.closing.toFixed(2),
        UOM: item.uom,
      }));
      
      const ledgerData = processedLedger.map(entry => ({
        Date: entry.date,
        Material: getMaterialName(entry.materialId),
        "Stock Owner": getPartyName(entry.partyId),
        Type: entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : entry.transactionType === 'issue' ? 'Issue' : entry.transactionType === 'opening' ? 'Opening' : entry.transactionType === 'adjustment' ? 'Adjustment' : entry.transactionType === 'equipment_usage' ? 'Equip. Usage' : entry.transactionType,
        "Issued To": entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
          ? entry.notes.replace('Diesel issued to ', '')
          : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
          ? entry.notes.replace('Issue to ', '').split(' - ')[0]
          : entry.notes || '-',
        In: entry.quantityIn?.toFixed(2) || "-",
        Out: entry.quantityOut?.toFixed(2) || "-",
        Balance: entry.calculatedBalance?.toFixed(2) || "-",
        UOM: entry.uom,
      }));
      
      const wb = XLSX.utils.book_new();
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      const wsLedger = XLSX.utils.json_to_sheet(ledgerData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Stock Summary");
      XLSX.utils.book_append_sheet(wb, wsLedger, "Stock Ledger");
      
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
      doc.text("Stock Balances & Ledger Report", 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 22);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 28);
      
      const summaryTableData = stockSummary.map(item => [
        item.materialName,
        item.partyName,
        item.openingStock.toFixed(2),
        item.received.toFixed(2),
        item.consumed.toFixed(2),
        item.closing.toFixed(2),
        item.uom,
      ]);
      
      autoTable(doc, {
        startY: 34,
        head: [["Material", "Stock Owner", "Opening", "Received", "Consumed", "Closing", "UOM"]],
        body: summaryTableData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      
      const filename = buildFilename("pdf");
      
      // Standard download - works reliably across all browsers
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
          <title>Stock Balances Report</title>
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
            .text-right { text-align: right; }
            .text-green { color: #16a34a; }
            .text-red { color: #dc2626; }
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
            <h1>Stock Balances Report</h1>
            <p class="date">Period: ${dateFrom} to ${dateTo} | Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Material</th>
                <th>Stock Owner</th>
                <th class="text-right">Opening</th>
                <th class="text-right">Received</th>
                <th class="text-right">Consumed</th>
                <th class="text-right">Closing</th>
                <th>UOM</th>
              </tr>
            </thead>
            <tbody>
              ${stockSummary.map(item => `
                <tr>
                  <td>${item.materialName}</td>
                  <td>${item.partyName}</td>
                  <td class="text-right">${item.openingStock.toFixed(2)}</td>
                  <td class="text-right text-green">+${item.received.toFixed(2)}</td>
                  <td class="text-right text-red">-${item.consumed.toFixed(2)}</td>
                  <td class="text-right"><strong>${item.closing.toFixed(2)}</strong></td>
                  <td>${item.uom}</td>
                </tr>
              `).join('')}
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

  const handleExportExcelClick = () => {
    requestPinAuth({ type: "export-excel" });
  };

  const handleExportPdfClick = () => {
    requestPinAuth({ type: "export-pdf" });
  };

  const handlePrintClick = () => {
    requestPinAuth({ type: "print" });
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
            <h1 className="text-2xl font-bold">Stock Balances & Ledger</h1>
            <p className="text-muted-foreground">View party-wise and plant-common stock</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcelClick} disabled={!stockSummary.length} data-testid="button-export-excel">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdfClick} disabled={!stockSummary.length} data-testid="button-export-pdf">
            <Download className="w-4 h-4" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handlePrintClick} data-testid="button-print">
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label>Party / Stock Owner</Label>
              <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                <SelectTrigger data-testid="select-filter-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Material</Label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger data-testid="select-filter-material">
                  <SelectValue placeholder="All Materials" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {materials?.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-date-from" />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-date-to" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary" className="gap-2">
            <Layers className="w-4 h-4" />
            Stock Summary
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-2">
            <Package className="w-4 h-4" />
            Current Balances
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2">
            <Calendar className="w-4 h-4" />
            Ledger Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Stock Summary (Period: {dateFrom} to {dateTo})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : stockSummary.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No stock movements found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">Material</th>
                        <th className="text-left py-3 px-2">Stock Owner</th>
                        <th className="text-right py-3 px-2">Opening</th>
                        <th className="text-right py-3 px-2">Received</th>
                        <th className="text-right py-3 px-2">Consumed</th>
                        <th className="text-right py-3 px-2">Closing</th>
                        <th className="text-left py-3 px-2">UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockSummary.map((item, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-3 px-2 font-medium">{item.materialName}</td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              item.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                              'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                            }`}>
                              {item.partyName}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right">{item.openingStock.toFixed(2)}</td>
                          <td className="py-3 px-2 text-right text-green-600 dark:text-green-400">+{item.received.toFixed(2)}</td>
                          <td className="py-3 px-2 text-right text-red-600 dark:text-red-400">-{item.consumed.toFixed(2)}</td>
                          <td className="py-3 px-2 text-right font-bold">{item.closing.toFixed(2)}</td>
                          <td className="py-3 px-2">{item.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Current Stock Balances
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !filteredBalances?.length ? (
                <p className="text-muted-foreground text-center py-8">No stock balances found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredBalances.map((b, idx) => (
                    <div key={idx} className={`p-4 rounded-lg border ${
                      b.balance < 10 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'bg-muted/50'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium">{b.materialName}</p>
                        {b.balance < 10 && (
                          <span className="px-2 py-0.5 text-xs rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                            LOW
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-bold">{b.balance?.toFixed(2)} {b.uom}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          b.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                          'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                        }`}>
                          {b.partyName}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Transaction Ledger
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : !ledgerForDisplay?.length ? (
                <p className="text-muted-foreground text-center py-8">No transactions found for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-semibold">Date</th>
                        <th className="text-left p-3 font-semibold">Material</th>
                        <th className="text-left p-3 font-semibold">Stock Owner</th>
                        <th className="text-left p-3 font-semibold">Type</th>
                        <th className="text-left p-3 font-semibold">Issued To</th>
                        <th className="text-right p-3 font-semibold text-green-600 dark:text-green-400">In</th>
                        <th className="text-right p-3 font-semibold text-red-600 dark:text-red-400">Out</th>
                        <th className="text-right p-3 font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerForDisplay.slice(0, 100).map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">{entry.date}</td>
                          <td className="p-3 font-medium">{getMaterialName(entry.materialId)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              entry.partyId ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 
                              'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                            }`}>
                              {getPartyName(entry.partyId)}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 text-xs rounded ${
                              entry.transactionType === 'receipt' || entry.transactionType === 'opening' || entry.transactionType === 'adjustment'
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' 
                                : entry.transactionType === 'issue'
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                : entry.transactionType === 'equipment_usage'
                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            }`}>
                              {entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : entry.transactionType === 'issue' ? 'Issue' : entry.transactionType === 'opening' ? 'Opening' : entry.transactionType === 'adjustment' ? 'Adjustment' : entry.transactionType === 'equipment_usage' ? 'Equip. Usage' : entry.transactionType}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-sm">
                            {entry.transactionType === 'equipment_usage' && entry.notes?.startsWith('Diesel issued to ') 
                              ? entry.notes.replace('Diesel issued to ', '')
                              : entry.transactionType === 'issue' && entry.notes?.startsWith('Issue to ')
                              ? entry.notes.replace('Issue to ', '').split(' - ')[0]
                              : entry.notes || '-'}
                          </td>
                          <td className="p-3 text-right text-green-600 dark:text-green-400 font-medium">
                            {(entry.quantityIn ?? 0) > 0 ? `${entry.quantityIn?.toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right text-red-600 dark:text-red-400 font-medium">
                            {(entry.quantityOut ?? 0) > 0 ? `${entry.quantityOut?.toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right font-bold">{entry.calculatedBalance?.toFixed(2)} {entry.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/70 border-t-2">
                      <tr>
                        <td colSpan={5} className="p-3 font-bold text-right">Filtered Totals:</td>
                        <td className="p-3 text-right text-green-600 dark:text-green-400 font-bold">
                          {ledgerTotals.totalIn.toFixed(2)}
                        </td>
                        <td className="p-3 text-right text-red-600 dark:text-red-400 font-bold">
                          {ledgerTotals.totalOut.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-bold">
                          Net: {ledgerTotals.netChange >= 0 ? '+' : ''}{ledgerTotals.netChange.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {ledgerForDisplay.length > 100 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      Showing first 100 of {ledgerForDisplay.length} transactions
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
