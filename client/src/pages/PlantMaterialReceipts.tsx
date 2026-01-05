import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChevronLeft, Plus, Package, Loader2, Edit, Trash2, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { Party, PlantMaterial, MaterialReceipt } from "@shared/schema";
import { UOM_OPTIONS } from "@shared/schema";

export default function PlantMaterialReceipts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<MaterialReceipt | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  // Filter state
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("all");
  const [filterMaterialId, setFilterMaterialId] = useState("all");
  
  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; receiptId?: number } | null>(null);
  
  // Form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [isPlantCommon, setIsPlantCommon] = useState(false);
  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState("Ton");
  const [supplier, setSupplier] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [challanNumber, setChallanNumber] = useState("");

  const { data: receipts, isLoading } = useQuery<MaterialReceipt[]>({
    queryKey: ["/api/plant-module/material-receipts"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/material-receipts", data),
    onSuccess: () => {
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
    setIsPlantCommon(false);
    setMaterialId("");
    setQuantity("");
    setUom("Ton");
    setSupplier("");
    setVehicleNumber("");
    setChallanNumber("");
  };

  const openEditDialog = (receipt: MaterialReceipt) => {
    setEditingReceipt(receipt);
    setDate(receipt.date);
    setTime(receipt.time || "");
    setPartyId(receipt.partyId ? String(receipt.partyId) : "");
    setIsPlantCommon(!!receipt.isPlantCommon);
    setMaterialId(String(receipt.materialId));
    setQuantity(String(receipt.quantity));
    setUom(receipt.uom);
    setSupplier(receipt.supplier || "");
    setVehicleNumber(receipt.vehicleNumber || "");
    setChallanNumber(receipt.challanNumber || "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!materialId || !quantity) return;
    
    if (editingReceipt) {
      const updateData = {
        date,
        time,
        partyId: isPlantCommon ? null : parseInt(partyId),
        isPlantCommon: isPlantCommon ? 1 : 0,
        materialId: parseInt(materialId),
        quantity: parseFloat(quantity),
        uom,
        supplier,
        vehicleNumber,
        challanNumber,
      };
      updateMutation.mutate({ id: editingReceipt.id, data: updateData });
    } else {
      const data = {
        date,
        time,
        partyId: isPlantCommon ? null : parseInt(partyId),
        isPlantCommon: isPlantCommon ? 1 : 0,
        materialId: parseInt(materialId),
        quantity: parseFloat(quantity),
        uom,
        supplier,
        vehicleNumber,
        challanNumber,
      };
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
        if (pendingAction.receiptId) {
          const receipt = receipts?.find(r => r.id === pendingAction.receiptId);
          if (receipt) openEditDialog(receipt);
        }
        break;
      case "delete":
        if (pendingAction.receiptId) {
          setDeleteConfirmId(pendingAction.receiptId);
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

  const handleEditClick = (receipt: MaterialReceipt) => {
    requestPinAuth({ type: "edit", receiptId: receipt.id });
  };

  const handleDeleteClick = (receiptId: number) => {
    requestPinAuth({ type: "delete", receiptId });
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

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || "Unknown";
  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || "Unknown" : "Plant Common";

  // Filter receipts
  const filteredReceipts = receipts?.filter(r => {
    if (filterDateFrom && r.date < filterDateFrom) return false;
    if (filterDateTo && r.date > filterDateTo) return false;
    if (filterPartyId !== "all") {
      if (filterPartyId === "plant-common") {
        if (!r.isPlantCommon) return false;
      } else {
        if (r.partyId !== parseInt(filterPartyId)) return false;
      }
    }
    if (filterMaterialId !== "all" && r.materialId !== parseInt(filterMaterialId)) return false;
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

  // Export functions
  const exportToExcel = () => {
    const data = filteredReceipts.map(r => ({
      Date: r.date,
      Time: r.time || "",
      Material: getMaterialName(r.materialId),
      Quantity: r.quantity,
      UOM: r.uom,
      "Vehicle No": r.vehicleNumber || "",
      "Challan No": r.challanNumber || "",
      Supplier: r.supplier || "",
      "Party/Job": getPartyName(r.partyId),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Receipts");
    XLSX.writeFile(wb, `material_receipts_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Material Receipts Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
    
    const tableData = filteredReceipts.map(r => [
      r.date,
      r.time || "-",
      getMaterialName(r.materialId),
      `${r.quantity} ${r.uom}`,
      r.vehicleNumber || "-",
      r.challanNumber || "-",
      r.supplier || "-",
      getPartyName(r.partyId),
    ]);
    
    (doc as any).autoTable({
      startY: 28,
      head: [["Date", "Time", "Material", "Quantity", "Vehicle No", "Challan No", "Supplier", "Party/Job"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
    });
    
    doc.save(`material_receipts_${format(new Date(), "yyyy-MM-dd")}.pdf`);
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
            <h1 className="text-2xl font-bold">Material Receipts</h1>
            <p className="text-muted-foreground">Record incoming materials at plant</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingReceipt(null); resetForm(); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-receipt">
              <Plus className="w-4 h-4" /> New Receipt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingReceipt ? "Edit Receipt" : "Record Material Receipt"}</DialogTitle>
            </DialogHeader>
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

              <div className="flex items-center gap-3">
                <Switch checked={isPlantCommon} onCheckedChange={setIsPlantCommon} data-testid="switch-plant-common" />
                <Label>Plant Common (Utilities)</Label>
              </div>

              {!isPlantCommon && (
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
              )}

              <div>
                <Label>Material</Label>
                <Select value={materialId} onValueChange={(v) => { setMaterialId(v); const m = materials?.find(x => x.id === parseInt(v)); if (m) setUom(m.defaultUom || "Ton"); }}>
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

              <div>
                <Label>Supplier</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value.toUpperCase())} placeholder="Supplier name" data-testid="input-supplier" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle No</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g., KA-01-XX-1234" data-testid="input-vehicle" />
                </div>
                <div>
                  <Label>Challan No</Label>
                  <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value.toUpperCase())} placeholder="Receipt/Challan" data-testid="input-challan" />
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !materialId || !quantity} data-testid="button-save-receipt">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingReceipt ? "Update Receipt" : "Save Receipt"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* PIN Auth Modal */}
      {showPinAuth && (
        <PinAuth
          targetRole={pinAuthTarget}
          onSuccess={handlePinSuccess}
          onClose={() => { setShowPinAuth(false); setPendingAction(null); }}
        />
      )}

      {/* Export/Print Actions - Always visible, PIN required on click */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-muted/50">
        <span className="text-sm text-muted-foreground">Admin PIN required for Edit, Delete, Export, and Print</span>
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
                  <SelectItem value="plant-common">Plant Common</SelectItem>
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
                return (
                  <div key={dateKey}>
                    <h3 className="font-semibold text-lg mb-3 border-b pb-2">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    <div className="space-y-2">
                      {dayReceipts.map((receipt) => (
                        <div key={receipt.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate">
                          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
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
                              <span className="text-muted-foreground text-xs block">Party/Job</span>
                              <span className="font-medium">{getPartyName(receipt.partyId)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button size="icon" variant="ghost" onClick={() => handleEditClick(receipt)} data-testid={`button-edit-receipt-${receipt.id}`}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDeleteClick(receipt.id)} data-testid={`button-delete-receipt-${receipt.id}`}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
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
