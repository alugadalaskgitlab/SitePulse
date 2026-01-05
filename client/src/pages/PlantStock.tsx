import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChevronLeft, Layers, Package, Users, Loader2, Search, Calendar, Download, Printer, Unlock } from "lucide-react";
import { format, subDays } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { useAccess } from "@/lib/access-context";
import { useToast } from "@/hooks/use-toast";
import type { Party, PlantMaterial, StockLedgerEntry } from "@shared/schema";

export default function PlantStock() {
  const { toast } = useToast();
  const { isAdmin, access, requestAdminAccess } = useAccess();
  const [adminPin, setAdminPin] = useState("");
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedPartyId, setSelectedPartyId] = useState<string>("all");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("all");

  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: materials } = useQuery<PlantMaterial[]>({ queryKey: ["/api/plant-module/materials"] });
  const { data: stockBalances, isLoading: balancesLoading } = useQuery<any[]>({ 
    queryKey: ["/api/plant-module/stock-balances"] 
  });

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
  const getPartyName = (id: number | null) => id ? parties?.find((p) => p.id === id)?.name || `Party ${id}` : "Plant Common";

  const computeStockSummary = () => {
    if (!ledger || !materials) return [];

    const summaryMap: Record<string, {
      materialId: number;
      materialName: string;
      partyId: number | null;
      partyName: string;
      uom: string;
      opening: number;
      received: number;
      consumed: number;
      closing: number;
    }> = {};

    ledger.forEach((entry) => {
      const key = `${entry.materialId}-${entry.partyId ?? "common"}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          materialId: entry.materialId,
          materialName: getMaterialName(entry.materialId),
          partyId: entry.partyId,
          partyName: getPartyName(entry.partyId),
          uom: entry.uom || "Ton",
          opening: 0,
          received: 0,
          consumed: 0,
          closing: 0,
        };
      }

      if (entry.transactionType === "receipt") {
        summaryMap[key].received += entry.quantityIn || 0;
      } else if (entry.transactionType === "dispatch") {
        summaryMap[key].consumed += Math.abs(entry.quantityOut || 0);
      }
    });

    Object.values(summaryMap).forEach((item) => {
      const materialBalances = stockBalances?.filter(
        (b) => b.materialId === item.materialId && b.partyId === item.partyId
      ) || [];
      const currentBalance = materialBalances.reduce((sum, b) => sum + (b.balance || 0), 0);
      item.closing = currentBalance;
      item.opening = currentBalance - item.received + item.consumed;
    });

    return Object.values(summaryMap);
  };

  const stockSummary = computeStockSummary();

  const filteredBalances = stockBalances?.filter((b) => {
    if (selectedPartyId !== "all" && String(b.partyId ?? "") !== selectedPartyId && selectedPartyId !== "common") return false;
    if (selectedPartyId === "common" && b.partyId !== null) return false;
    if (selectedMaterialId !== "all" && b.materialId !== Number(selectedMaterialId)) return false;
    return true;
  });

  const handleUnlockAdmin = () => {
    const success = requestAdminAccess(adminPin);
    if (success) {
      toast({ title: "Admin access granted" });
      setAdminPin("");
    } else {
      toast({ title: "Invalid PIN", variant: "destructive" });
    }
  };

  const exportToExcel = () => {
    const summaryData = stockSummary.map(item => ({
      Material: item.materialName,
      "Stock Owner": item.partyName,
      Opening: item.opening.toFixed(2),
      Received: item.received.toFixed(2),
      Consumed: item.consumed.toFixed(2),
      Closing: item.closing.toFixed(2),
      UOM: item.uom,
    }));
    
    const ledgerData = (ledger || []).map(entry => ({
      Date: entry.date,
      Material: getMaterialName(entry.materialId),
      "Stock Owner": getPartyName(entry.partyId),
      Type: entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : 'Equip Issue',
      In: entry.quantityIn?.toFixed(2) || "-",
      Out: entry.quantityOut?.toFixed(2) || "-",
      Balance: entry.balanceAfter?.toFixed(2) || "-",
      UOM: entry.uom,
    }));
    
    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    const wsLedger = XLSX.utils.json_to_sheet(ledgerData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Stock Summary");
    XLSX.utils.book_append_sheet(wb, wsLedger, "Stock Ledger");
    XLSX.writeFile(wb, `stock_report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Stock Balances & Ledger Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 22);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 28);
    
    const summaryTableData = stockSummary.map(item => [
      item.materialName,
      item.partyName,
      item.opening.toFixed(2),
      item.received.toFixed(2),
      item.consumed.toFixed(2),
      item.closing.toFixed(2),
      item.uom,
    ]);
    
    (doc as any).autoTable({
      startY: 34,
      head: [["Material", "Stock Owner", "Opening", "Received", "Consumed", "Closing", "UOM"]],
      body: summaryTableData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
    });
    
    doc.save(`stock_report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "Exported to PDF" });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/plant">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Stock Balances & Ledger</h1>
            <p className="text-muted-foreground">View party-wise and plant-common stock</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Access Level:</span>
          <Badge variant={isAdmin ? "default" : "secondary"}>
            {access.charAt(0).toUpperCase() + access.slice(1)}
          </Badge>
        </div>
        {!isAdmin && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              placeholder="Enter PIN (1234)"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlockAdmin()}
              className="w-36"
              maxLength={4}
              data-testid="input-admin-pin"
            />
            <Button size="sm" onClick={handleUnlockAdmin} className="gap-1" data-testid="button-unlock-admin">
              <Unlock className="w-4 h-4" /> Unlock
            </Button>
          </div>
        )}
        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={exportToExcel} disabled={!stockSummary.length} data-testid="button-export-excel">
              <Download className="w-4 h-4" /> Export Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={exportToPDF} disabled={!stockSummary.length} data-testid="button-export-pdf">
              <Download className="w-4 h-4" /> Export PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        )}
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
                  <SelectItem value="common">Plant Common (HLC)</SelectItem>
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
                          <td className="py-3 px-2 text-right">{item.opening.toFixed(2)}</td>
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
              {balancesLoading ? (
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
                        <p className="font-medium">{getMaterialName(b.materialId)}</p>
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
                          {getPartyName(b.partyId)}
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
              ) : !ledger?.length ? (
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
                        <th className="text-right p-3 font-semibold text-green-600 dark:text-green-400">In</th>
                        <th className="text-right p-3 font-semibold text-red-600 dark:text-red-400">Out</th>
                        <th className="text-right p-3 font-semibold">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.slice(0, 100).map((entry) => (
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
                              entry.transactionType === 'receipt' 
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' 
                                : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            }`}>
                              {entry.transactionType === 'receipt' ? 'Receipt' : entry.transactionType === 'dispatch' ? 'Dispatch' : 'Equip Issue'}
                            </span>
                          </td>
                          <td className="p-3 text-right text-green-600 dark:text-green-400 font-medium">
                            {(entry.quantityIn ?? 0) > 0 ? `${entry.quantityIn?.toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right text-red-600 dark:text-red-400 font-medium">
                            {(entry.quantityOut ?? 0) > 0 ? `${entry.quantityOut?.toFixed(2)}` : '-'}
                          </td>
                          <td className="p-3 text-right font-bold">{entry.balanceAfter?.toFixed(2)} {entry.uom}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ledger.length > 100 && (
                    <p className="text-center text-muted-foreground text-sm py-4">
                      Showing first 100 of {ledger.length} transactions
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
