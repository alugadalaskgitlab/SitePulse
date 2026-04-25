import { useState, useMemo, useCallback } from "react";
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
import { ChevronLeft, Plus, Loader2, Trash2, Download, Printer, RotateCcw, Pencil } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import type { Party, PlantMaterial, MaterialIssue, MaterialReturn } from "@shared/schema";

export default function PlantMaterialReturns() {
  const { toast } = useToast();
  const { getPlantBackLink } = useOrigin();
  const { sectionCan } = useAuth();
  const canCreate = sectionCan("plant_stock", "create");
  const canEdit = sectionCan("plant_stock", "edit");
  const canExport = sectionCan("plant_stock", "view_reports");
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingReturn, setEditingReturn] = useState<MaterialReturn | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMaterialId, setFilterMaterialId] = useState("all");

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [selectedIssueId, setSelectedIssueId] = useState<string>("");
  const [returnDate, setReturnDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [returnTime, setReturnTime] = useState(format(new Date(), "HH:mm"));
  const [returnQuantity, setReturnQuantity] = useState("");
  const [returnedBy, setReturnedBy] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");

  const { data: returns, isLoading } = useQuery<MaterialReturn[]>({
    queryKey: ["/api/plant-module/material-returns"],
  });

  const { data: issues } = useQuery<MaterialIssue[]>({
    queryKey: ["/api/plant-module/material-issues"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/plant-module/material-returns"] });
    queryClient.invalidateQueries({ queryKey: ["/api/plant-module/material-issues"] });
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key.startsWith('/api/plant-module/stock-balances') ||
          key.startsWith('/api/plant-module/stock-ledger')
        );
      }
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/material-returns", data),
    onSuccess: () => {
      invalidateQueries();
      setDialogOpen(false);
      resetForm();
      toast({ title: "Material return recorded successfully" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Failed to record return", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/material-returns/${id}`),
    onSuccess: () => {
      invalidateQueries();
      setDeleteConfirmId(null);
      toast({ title: "Return deleted successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/material-returns/${id}`, data),
    onSuccess: () => {
      invalidateQueries();
      setDialogOpen(false);
      setEditingReturn(null);
      resetForm();
      toast({ title: "Material return updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: err.message || "Failed to update return", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingReturn(null);
    setSelectedMaterialId("");
    setSelectedIssueId("");
    setReturnDate(format(new Date(), "yyyy-MM-dd"));
    setReturnTime(format(new Date(), "HH:mm"));
    setReturnQuantity("");
    setReturnedBy("");
    setVehicleNumber("");
    setNotes("");
  };

  const openEditReturn = (ret: MaterialReturn) => {
    setEditingReturn(ret);
    setSelectedMaterialId(String(ret.materialId));
    setSelectedIssueId(String(ret.originalIssueId));
    setReturnDate(ret.date);
    setReturnTime(ret.time || format(new Date(), "HH:mm"));
    setReturnQuantity(String(ret.quantity));
    setReturnedBy(ret.returnedBy || "");
    setVehicleNumber(ret.vehicleNumber || "");
    setNotes(ret.notes || "");
    setDialogOpen(true);
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || `Material #${id}`;
  const getPartyName = (id: number | null) => {
    if (id === null) return "Plant Common";
    return parties?.find(p => p.id === id)?.name || `Party #${id}`;
  };

  const materialsWithIssues = useMemo(() => {
    if (!issues || !materials) return [];
    const issuedMaterialIds = new Set(issues.map(i => i.materialId));
    return materials.filter(m => issuedMaterialIds.has(m.id));
  }, [issues, materials]);

  const issuesForSelectedMaterial = useMemo(() => {
    if (!issues || !selectedMaterialId) return [];
    return issues.filter(i => i.materialId === parseInt(selectedMaterialId));
  }, [issues, selectedMaterialId]);

  const returnedQtyByIssue = useMemo(() => {
    if (!returns) return {};
    const map: Record<number, number> = {};
    returns.forEach(r => {
      map[r.originalIssueId] = (map[r.originalIssueId] || 0) + r.quantity;
    });
    return map;
  }, [returns]);

  const selectedIssue = useMemo(() => {
    if (!selectedIssueId || !issues) return null;
    return issues.find(i => i.id === parseInt(selectedIssueId)) || null;
  }, [selectedIssueId, issues]);

  const remainingQty = useMemo(() => {
    if (!selectedIssue) return 0;
    const alreadyReturned = returnedQtyByIssue[selectedIssue.id] || 0;
    const currentEntryQty = editingReturn && editingReturn.originalIssueId === selectedIssue.id
      ? editingReturn.quantity : 0;
    return selectedIssue.quantity - alreadyReturned + currentEntryQty;
  }, [selectedIssue, returnedQtyByIssue, editingReturn]);

  const handleSubmit = () => {
    if (!selectedIssueId || !returnQuantity || !selectedIssue) return;

    const qty = parseFloat(returnQuantity);
    if (qty <= 0 || qty > remainingQty) {
      toast({ title: `Quantity must be between 0 and ${remainingQty.toFixed(3)}`, variant: "destructive" });
      return;
    }

    const data = {
      date: returnDate,
      time: returnTime || null,
      originalIssueId: parseInt(selectedIssueId),
      materialId: selectedIssue.materialId,
      quantity: qty,
      uom: selectedIssue.uom,
      returnedBy: returnedBy || null,
      partyId: selectedIssue.partyId,
      isPlantCommon: selectedIssue.isPlantCommon || 0,
      vehicleNumber: vehicleNumber || null,
      notes: notes || null,
    };

    if (editingReturn) {
      updateMutation.mutate({ id: editingReturn.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const filteredReturns = useMemo(() => {
    if (!returns) return [];
    return returns.filter((ret) => {
      if (filterDateFrom && ret.date < filterDateFrom) return false;
      if (filterDateTo && ret.date > filterDateTo) return false;
      if (filterMaterialId !== "all" && ret.materialId !== parseInt(filterMaterialId)) return false;
      return true;
    });
  }, [returns, filterDateFrom, filterDateTo, filterMaterialId]);

  const filteredTotals = useMemo(() => {
    if (!filteredReturns.length) return [];
    const totalsMap: Record<string, { materialId: number; materialName: string; uom: string; total: number }> = {};
    filteredReturns.forEach(ret => {
      const key = `${ret.materialId}-${ret.uom}`;
      if (!totalsMap[key]) {
        totalsMap[key] = { materialId: ret.materialId, materialName: getMaterialName(ret.materialId), uom: ret.uom, total: 0 };
      }
      totalsMap[key].total += ret.quantity;
    });
    return Object.values(totalsMap);
  }, [filteredReturns, materials]);

  const requireAuth = (action: { type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; returnId?: number }) => {
    switch (action.type) {
      case "edit":
        if (action.returnId) {
          const ret = returns?.find(r => r.id === action.returnId);
          if (ret) openEditReturn(ret);
        }
        break;
      case "delete":
        if (action.returnId) setDeleteConfirmId(action.returnId);
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
  };

  const exportToExcel = () => {
    if (!filteredReturns.length) return;
    const data = filteredReturns.map(ret => ({
      Date: ret.date,
      Time: ret.time || "",
      "Original Issue #": ret.originalIssueId,
      Material: getMaterialName(ret.materialId),
      Quantity: ret.quantity,
      UOM: ret.uom,
      "Returned By": (ret as any).returnedBy || "",
      "Stock Owner": getPartyName(ret.partyId),
      "Vehicle No.": ret.vehicleNumber || "",
      Notes: ret.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Returns");
    XLSX.writeFile(wb, `MaterialReturns_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    if (!filteredReturns.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Material Returns Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);

    const tableData = filteredReturns.map(ret => [
      ret.date,
      getMaterialName(ret.materialId),
      `${ret.quantity} ${ret.uom}`,
      (ret as any).returnedBy || "",
      getPartyName(ret.partyId),
      `Issue #${ret.originalIssueId}`,
    ]);

    autoTable(doc, {
      startY: 28,
      head: [["Date", "Material", "Qty", "Returned By", "Stock Owner", "Linked Issue"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [34, 197, 94] },
    });

    doc.save(`MaterialReturns_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "Exported to PDF" });
  };

  const handlePrint = () => {
    const tableRows = filteredReturns.map(ret => `
      <tr>
        <td>${ret.date}</td>
        <td>${getMaterialName(ret.materialId)}</td>
        <td>${ret.quantity} ${ret.uom}</td>
        <td>${(ret as any).returnedBy || ""}</td>
        <td>${getPartyName(ret.partyId)}</td>
        <td>Issue #${ret.originalIssueId}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Material Returns - Print</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .company-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px; }
            .company-header img { height: 50px; margin-bottom: 5px; }
            .company-header h2 { margin: 0; font-size: 14px; font-weight: bold; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            .date { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #22c55e; color: white; }
          </style>
        </head>
        <body>
          <div class="company-header">
            <img src="${window.location.origin}/hlc-logo.jpg" onerror="this.style.display='none'" />
            <h2>High Lane Constructions Pvt Ltd</h2>
          </div>
          <h1>Material Returns Report</h1>
          <p class="date">Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th>Quantity</th>
                <th>Returned By</th>
                <th>Stock Owner</th>
                <th>Linked Issue</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RotateCcw className="w-6 h-6 text-green-500" />
              Material Returns
            </h1>
            <p className="text-sm text-muted-foreground">Return issued materials back to plant stock</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => requireAuth({ type: "export-excel" })} data-testid="button-export-excel">
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => requireAuth({ type: "export-pdf" })} data-testid="button-export-pdf">
                <Download className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => requireAuth({ type: "print" })} data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
            {canCreate && (
              <DialogTrigger asChild>
                <Button className="gap-1" data-testid="button-add-return">
                  <Plus className="w-4 h-4" /> New Return
                </Button>
              </DialogTrigger>
            )}
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingReturn ? "Edit Material Return" : "Record Material Return"}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div>
                  <Label>Step 1: Select Material</Label>
                  <Select value={selectedMaterialId} onValueChange={(val) => { setSelectedMaterialId(val); setSelectedIssueId(""); setReturnQuantity(""); }} disabled={!!editingReturn}>
                    <SelectTrigger data-testid="select-material">
                      <SelectValue placeholder="Select material to return" />
                    </SelectTrigger>
                    <SelectContent>
                      {materialsWithIssues.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedMaterialId && (
                  <div>
                    <Label>Step 2: Select Original Issue</Label>
                    <Select value={selectedIssueId} onValueChange={(val) => { setSelectedIssueId(val); setReturnQuantity(""); }} disabled={!!editingReturn}>
                      <SelectTrigger data-testid="select-issue">
                        <SelectValue placeholder="Select issue entry" />
                      </SelectTrigger>
                      <SelectContent>
                        {issuesForSelectedMaterial.map(issue => {
                          const alreadyReturned = returnedQtyByIssue[issue.id] || 0;
                          const editQtyBack = editingReturn && editingReturn.originalIssueId === issue.id ? editingReturn.quantity : 0;
                          const remaining = issue.quantity - alreadyReturned + editQtyBack;
                          if (remaining <= 0 && !(editingReturn && editingReturn.originalIssueId === issue.id)) return null;
                          return (
                            <SelectItem key={issue.id} value={String(issue.id)}>
                              {issue.date} | {issue.issuedTo} | {issue.quantity} {issue.uom} (Remaining: {remaining.toFixed(3)})
                              {(issue as any).receivedBy ? ` | Rcvd: ${(issue as any).receivedBy}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedIssue && (
                  <>
                    <Card className="bg-muted/50">
                      <CardContent className="p-3 text-sm space-y-1">
                        <div><span className="text-muted-foreground">Issue Date:</span> {selectedIssue.date} {selectedIssue.time && `at ${selectedIssue.time}`}</div>
                        <div><span className="text-muted-foreground">Issued To:</span> {selectedIssue.issuedTo}</div>
                        <div><span className="text-muted-foreground">Quantity:</span> {selectedIssue.quantity} {selectedIssue.uom}</div>
                        <div><span className="text-muted-foreground">Already Returned:</span> {(returnedQtyByIssue[selectedIssue.id] || 0).toFixed(3)} {selectedIssue.uom}</div>
                        <div className="font-semibold"><span className="text-muted-foreground">Remaining:</span> {remainingQty.toFixed(3)} {selectedIssue.uom}</div>
                        <div><span className="text-muted-foreground">Stock Owner:</span> {getPartyName(selectedIssue.partyId)}</div>
                        {(selectedIssue as any).receivedBy && <div><span className="text-muted-foreground">Received By:</span> {(selectedIssue as any).receivedBy}</div>}
                        {selectedIssue.purpose && <div><span className="text-muted-foreground">Purpose:</span> {selectedIssue.purpose}</div>}
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Return Date</Label>
                        <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} data-testid="input-return-date" />
                      </div>
                      <div>
                        <Label>Return Time</Label>
                        <Input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} data-testid="input-return-time" />
                      </div>
                    </div>

                    <div>
                      <Label>Return Quantity (Max: {remainingQty.toFixed(3)} {selectedIssue.uom})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        max={remainingQty}
                        value={returnQuantity}
                        onChange={(e) => setReturnQuantity(e.target.value)}
                        placeholder={`0.000 (max ${remainingQty.toFixed(3)})`}
                        data-testid="input-return-quantity"
                      />
                    </div>

                    <div>
                      <Label>Returned By (Person)</Label>
                      <Input value={returnedBy} onChange={(e) => setReturnedBy(e.target.value.toUpperCase())} placeholder="Person returning the material" data-testid="input-returned-by" />
                    </div>

                    <div>
                      <Label>Vehicle Number</Label>
                      <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g., TS09AB1234" data-testid="input-vehicle" />
                    </div>

                    <div>
                      <Label>Notes</Label>
                      <Input value={notes} onChange={(e) => setNotes(e.target.value.toUpperCase())} placeholder="Additional notes" data-testid="input-notes" />
                    </div>

                    <Button
                      onClick={handleSubmit}
                      className="w-full"
                      disabled={createMutation.isPending || updateMutation.isPending || !selectedIssueId || !returnQuantity || parseFloat(returnQuantity) <= 0 || parseFloat(returnQuantity) > remainingQty}
                      data-testid="button-submit-return"
                    >
                      {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingReturn ? "Update Return" : "Record Return")}
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">From Date</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
            </div>
            <div>
              <Label className="text-xs">To Date</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
            </div>
            <div>
              <Label className="text-xs">Material</Label>
              <Select value={filterMaterialId} onValueChange={setFilterMaterialId}>
                <SelectTrigger data-testid="filter-material">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  {materials?.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {filteredTotals.length > 0 && (
        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-green-700 dark:text-green-300">Return Totals:</span>
              {filteredTotals.map((t, i) => (
                <Badge key={i} variant="outline" className="text-green-700 dark:text-green-300 border-green-400 dark:border-green-600 text-sm px-3 py-1">
                  {t.materialName}: {t.total.toFixed(3)} {t.uom}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !filteredReturns.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Material Returns</h3>
            <p className="text-muted-foreground">Record material returns from sites back to plant stock.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredReturns.map((ret) => {
            const linkedIssue = issues?.find(i => i.id === ret.originalIssueId);
            return (
              <Card key={ret.id} className="hover-elevate" data-testid={`card-return-${ret.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <RotateCcw className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{getMaterialName(ret.materialId)}</span>
                          <Badge variant="secondary">{ret.quantity} {ret.uom}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {ret.date} {ret.time && `at ${ret.time}`}
                        </div>
                        {(ret as any).returnedBy && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Returned By: </span>
                            <span className="font-medium">{(ret as any).returnedBy}</span>
                          </div>
                        )}
                        {linkedIssue && (
                          <div className="text-xs text-muted-foreground">
                            From Issue: {linkedIssue.date} | {linkedIssue.issuedTo} | {linkedIssue.quantity} {linkedIssue.uom}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Stock Owner: {getPartyName(ret.partyId)}
                        </div>
                        {ret.notes && (
                          <div className="text-xs text-muted-foreground">
                            Notes: {ret.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => requireAuth({ type: "edit", returnId: ret.id })} data-testid={`button-edit-${ret.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => requireAuth({ type: "delete", returnId: ret.id })} data-testid={`button-delete-${ret.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Material Return?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">This will reverse the stock balance credit. This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
