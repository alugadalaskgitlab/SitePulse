import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Fuel, TrendingUp, Package, MapPin, Loader2, Download, Printer } from "lucide-react";
import { format } from "date-fns";
import type { StockLedgerEntry, PlantMaterial, MaterialReceipt, Party } from "@shared/schema";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DieselProcurementData {
  receipts: Array<{
    date: string;
    quantity: number;
    source: string;
    notes?: string;
  }>;
  directPurchases: Array<{
    date: string;
    quantity: number;
    fuelStation?: string;
    billNumber?: string;
    amountPaid?: number;
    siteName?: string;
    equipmentName?: string;
  }>;
}

export default function PlantDieselProcurementReport() {
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");
  
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const dieselMaterial = materials?.find(m => m.name.toLowerCase() === "diesel");
  const dieselMaterialId = dieselMaterial?.id;

  const { data: ledgerEntries, isLoading: isLoadingLedger } = useQuery<StockLedgerEntry[]>({
    queryKey: ["/api/plant-module/stock-ledger", dieselMaterialId, filterDateFrom, filterDateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dieselMaterialId) params.append("materialId", String(dieselMaterialId));
      if (filterDateFrom) params.append("dateFrom", filterDateFrom);
      if (filterDateTo) params.append("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/stock-ledger?${params}`);
      return res.json();
    },
    enabled: !!dieselMaterialId,
  });

  const { data: receipts, isLoading: isLoadingReceipts } = useQuery<MaterialReceipt[]>({
    queryKey: ["/api/plant-module/material-receipts", filterDateFrom, filterDateTo, dieselMaterialId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterDateFrom) params.append("dateFrom", filterDateFrom);
      if (filterDateTo) params.append("dateTo", filterDateTo);
      const res = await fetch(`/api/plant-module/material-receipts?${params}`);
      return res.json();
    },
    enabled: !!dieselMaterialId,
  });

  const isLoading = isLoadingLedger || isLoadingReceipts;

  const getPartyName = (id: number | null) => {
    if (!id) return "Unknown";
    return parties?.find(p => p.id === id)?.name || "Unknown";
  };

  const plantStockReceipts = (receipts || []).filter(r => r.materialId === dieselMaterialId);
  
  const directPurchaseEntries = (ledgerEntries || []).filter(
    entry => entry.transactionType === "direct_purchase" && entry.quantityIn && entry.quantityIn > 0
  );

  const equipmentUsageEntries = (ledgerEntries || []).filter(
    entry => entry.transactionType === "equipment_usage"
  );

  const totalPlantReceipts = plantStockReceipts.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const totalDirectPurchases = directPurchaseEntries.reduce((sum, e) => sum + (e.quantityIn || 0), 0);
  const totalProcured = totalPlantReceipts + totalDirectPurchases;
  const totalIssued = equipmentUsageEntries.reduce((sum, e) => sum + (e.quantityOut || 0), 0) + totalDirectPurchases;

  const totalAmountPaid = directPurchaseEntries.reduce((sum, entry) => {
    const match = entry.notes?.match(/Rs\.\s*([\d.]+)/);
    return sum + (match ? parseFloat(match[1]) : 0);
  }, 0);

  const handleExportExcel = () => {
    const plantReceiptsSheet = plantStockReceipts.map(r => ({
      Date: r.date,
      "Quantity (L)": r.quantity,
      Party: getPartyName(r.partyId),
      Supplier: r.supplier || "-",
      "Vehicle No": r.vehicleNumber || "-",
      Notes: r.notes || "-"
    }));

    const directPurchasesSheet = directPurchaseEntries.map(e => ({
      Date: e.date,
      "Quantity (L)": e.quantityIn,
      Notes: e.notes || "-"
    }));

    const summarySheet = [{
      "Total Plant Receipts (L)": totalPlantReceipts.toFixed(1),
      "Total Direct Purchases (L)": totalDirectPurchases.toFixed(1),
      "Total Procured (L)": totalProcured.toFixed(1),
      "Total Issued (L)": totalIssued.toFixed(1),
      "Direct Purchase Amount (Rs)": totalAmountPaid.toFixed(2)
    }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plantReceiptsSheet), "Plant Receipts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(directPurchasesSheet), "Direct Purchases");
    XLSX.writeFile(wb, `diesel-procurement-report-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Diesel Procurement Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 30);
    if (filterDateFrom || filterDateTo) {
      doc.text(`Period: ${filterDateFrom || "Start"} to ${filterDateTo || "Now"}`, 14, 36);
    }

    doc.setFontSize(12);
    doc.text("Summary", 14, 48);
    autoTable(doc, {
      startY: 52,
      head: [["Metric", "Value"]],
      body: [
        ["Total Plant Receipts", `${totalPlantReceipts.toFixed(1)} L`],
        ["Total Direct Purchases", `${totalDirectPurchases.toFixed(1)} L`],
        ["Total Procured", `${totalProcured.toFixed(1)} L`],
        ["Total Issued to Equipment", `${totalIssued.toFixed(1)} L`],
        ["Direct Purchase Amount", `Rs. ${totalAmountPaid.toFixed(2)}`],
      ],
    });

    if (plantStockReceipts.length > 0) {
      doc.addPage();
      doc.text("Plant Stock Receipts", 14, 20);
      autoTable(doc, {
        startY: 26,
        head: [["Date", "Qty (L)", "Party", "Supplier"]],
        body: plantStockReceipts.map(r => [
          r.date,
          r.quantity?.toFixed(1) || "0",
          getPartyName(r.partyId),
          r.supplier || "-"
        ]),
      });
    }

    if (directPurchaseEntries.length > 0) {
      doc.addPage();
      doc.text("Direct Purchases", 14, 20);
      autoTable(doc, {
        startY: 26,
        head: [["Date", "Qty (L)", "Details"]],
        body: directPurchaseEntries.map(e => [
          e.date,
          e.quantityIn?.toFixed(1) || "0",
          e.notes || "-"
        ]),
      });
    }

    doc.save(`diesel-procurement-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-6xl mx-auto space-y-6 pb-20 print:p-0 print:space-y-4">
      <div className="flex items-center gap-4 print:hidden">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-display">Diesel Procurement Report</h1>
          <p className="text-muted-foreground text-sm">Track all diesel sourcing: plant receipts + direct purchases</p>
        </div>
      </div>

      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold">Diesel Procurement Report</h1>
        <p className="text-sm text-muted-foreground">
          {filterDateFrom || filterDateTo ? `${filterDateFrom || "Start"} - ${filterDateTo || "Today"}` : "All Time"}
        </p>
      </div>

      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportExcel} data-testid="button-export-excel">
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleExportPdf} data-testid="button-export-pdf">
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>
          <div>
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Plant Receipts</span>
            </div>
            <p className="text-2xl font-bold text-primary">{totalPlantReceipts.toFixed(1)} L</p>
            <p className="text-xs text-muted-foreground">{plantStockReceipts.length} entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Direct Purchases</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalDirectPurchases.toFixed(1)} L</p>
            <p className="text-xs text-muted-foreground">{directPurchaseEntries.length} entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Fuel className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Procured</span>
            </div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{totalProcured.toFixed(1)} L</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Direct Purchase Cost</span>
            </div>
            <p className="text-2xl font-bold">Rs. {totalAmountPaid.toFixed(0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4" />
            Plant Stock Receipts (Diesel from Suppliers)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : plantStockReceipts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No plant diesel receipts in selected period</p>
          ) : (
            <div className="space-y-2">
              {plantStockReceipts.map((receipt, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="font-medium">{format(new Date(receipt.date), "dd MMM yyyy")}</p>
                    <p className="text-sm text-muted-foreground">
                      {receipt.supplier || "Unknown Supplier"} | {getPartyName(receipt.partyId)}
                    </p>
                  </div>
                  <Badge variant="outline" className="font-bold">{(receipt.quantity || 0).toFixed(1)} L</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Direct Purchases (Commercial Fuel Pumps)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : directPurchaseEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No direct purchases recorded in selected period</p>
          ) : (
            <div className="space-y-2">
              {directPurchaseEntries.map((entry, idx) => {
                const fuelStationMatch = entry.notes?.match(/at ([^,]+)/);
                const billMatch = entry.notes?.match(/Bill: ([^,]+)/);
                const amountMatch = entry.notes?.match(/Rs\.\s*([\d.]+)/);
                const equipMatch = entry.notes?.match(/ - ([^-]+) at /);
                
                return (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex-1">
                      <p className="font-medium">{format(new Date(entry.date), "dd MMM yyyy")}</p>
                      <p className="text-sm text-muted-foreground">
                        {fuelStationMatch ? fuelStationMatch[1] : "Commercial Pump"}
                        {billMatch && <span className="ml-2">Bill: {billMatch[1]}</span>}
                        {equipMatch && <span className="ml-2">| {equipMatch[1]}</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary" className="font-bold">{(entry.quantityIn || 0).toFixed(1)} L</Badge>
                      {amountMatch && (
                        <p className="text-xs text-muted-foreground mt-1">Rs. {parseFloat(amountMatch[1]).toFixed(0)}</p>
                      )}
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
