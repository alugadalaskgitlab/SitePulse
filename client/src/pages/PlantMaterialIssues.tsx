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
import { useAutosave } from "@/hooks/use-autosave";
import { DraftRestoreBanner } from "@/components/DraftRestoreBanner";
import { ChevronLeft, Plus, Package, Loader2, Edit, Trash2, Download, Printer, ArrowUpRight } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import { format } from "date-fns";
import type { Party, PlantMaterial, MaterialIssue } from "@shared/schema";
import { UOM_OPTIONS } from "@shared/schema";

export default function PlantMaterialIssues() {
  const { toast } = useToast();
  const { appendOrigin } = useOrigin();
  const backLink = appendOrigin("/plant/dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<MaterialIssue | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("all");
  const [filterMaterialId, setFilterMaterialId] = useState("all");
  
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; issueId?: number } | null>(null);
  
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState("Liters");
  const [issuedTo, setIssuedTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");

  interface IssueFormData {
    date: string;
    time: string;
    partyId: string;
    materialId: string;
    quantity: string;
    uom: string;
    issuedTo: string;
    purpose: string;
    vehicleNumber: string;
    notes: string;
  }

  const formData = useMemo<IssueFormData>(() => ({
    date, time, partyId, materialId, quantity, uom, issuedTo, purpose, vehicleNumber, notes
  }), [date, time, partyId, materialId, quantity, uom, issuedTo, purpose, vehicleNumber, notes]);

  const handleRestoreDraft = useCallback((data: IssueFormData) => {
    setDate(data.date);
    setTime(data.time);
    setPartyId(data.partyId);
    setMaterialId(data.materialId);
    setQuantity(data.quantity);
    setUom(data.uom);
    setIssuedTo(data.issuedTo);
    setPurpose(data.purpose);
    setVehicleNumber(data.vehicleNumber);
    setNotes(data.notes);
  }, []);

  const { hasDraft, draftAge, restoreDraft, discardDraft, clearDraft } = useAutosave<IssueFormData>({
    formKey: "plant-material-issue-new",
    data: formData,
    enabled: dialogOpen && !editingIssue,
    onRestore: handleRestoreDraft,
  });

  const { data: issues, isLoading } = useQuery<MaterialIssue[]>({
    queryKey: ["/api/plant-module/material-issues"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const invalidateStockQueries = () => {
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
      apiRequest("POST", "/api/plant-module/material-issues", data),
    onSuccess: async () => {
      await clearDraft();
      invalidateStockQueries();
      setDialogOpen(false);
      resetForm();
      toast({ title: "Material issue recorded successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/material-issues/${id}`, data),
    onSuccess: () => {
      invalidateStockQueries();
      setDialogOpen(false);
      setEditingIssue(null);
      resetForm();
      toast({ title: "Issue updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/material-issues/${id}`),
    onSuccess: () => {
      invalidateStockQueries();
      setDeleteConfirmId(null);
      toast({ title: "Issue deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setMaterialId("");
    setQuantity("");
    setUom("Liters");
    setIssuedTo("");
    setPurpose("");
    setVehicleNumber("");
    setNotes("");
  };

  const openEditDialog = (issue: MaterialIssue) => {
    setEditingIssue(issue);
    setDate(issue.date);
    setTime(issue.time || "");
    setPartyId(issue.partyId ? String(issue.partyId) : "");
    setMaterialId(String(issue.materialId));
    setQuantity(String(issue.quantity));
    setUom(issue.uom);
    setIssuedTo(issue.issuedTo || "");
    setPurpose(issue.purpose || "");
    setVehicleNumber(issue.vehicleNumber || "");
    setNotes(issue.notes || "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!materialId || !quantity || !issuedTo || !partyId) return;
    
    const data = {
      date,
      time: time || null,
      partyId: parseInt(partyId),
      isPlantCommon: 0,
      materialId: parseInt(materialId),
      quantity: parseFloat(quantity),
      uom,
      issuedTo,
      purpose: purpose || null,
      vehicleNumber: vehicleNumber || null,
      notes: notes || null,
    };
    
    if (editingIssue) {
      updateMutation.mutate({ id: editingIssue.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || `Material #${id}`;
  const getPartyName = (id: number | null) => {
    if (id === null) return "Unknown";
    return parties?.find(p => p.id === id)?.name || `Party #${id}`;
  };

  const filteredIssues = useMemo(() => {
    if (!issues) return [];
    return issues.filter((issue) => {
      if (filterDateFrom && issue.date < filterDateFrom) return false;
      if (filterDateTo && issue.date > filterDateTo) return false;
      if (filterPartyId !== "all") {
        if (issue.partyId !== parseInt(filterPartyId)) return false;
      }
      if (filterMaterialId !== "all" && issue.materialId !== parseInt(filterMaterialId)) return false;
      return true;
    });
  }, [issues, filterDateFrom, filterDateTo, filterPartyId, filterMaterialId]);

  // Calculate totals for filtered issues (grouped by material)
  const filteredTotals = useMemo(() => {
    if (!filteredIssues.length) return [];
    const totalsMap: Record<string, { materialId: number; materialName: string; uom: string; total: number }> = {};
    filteredIssues.forEach(issue => {
      const key = `${issue.materialId}-${issue.uom}`;
      if (!totalsMap[key]) {
        totalsMap[key] = { materialId: issue.materialId, materialName: getMaterialName(issue.materialId), uom: issue.uom, total: 0 };
      }
      totalsMap[key].total += issue.quantity;
    });
    return Object.values(totalsMap);
  }, [filteredIssues, materials]);

  const handlePinSuccess = () => {
    setShowPinAuth(false);
    if (pendingAction) {
      switch (pendingAction.type) {
        case "edit":
          const issueToEdit = issues?.find(r => r.id === pendingAction.issueId);
          if (issueToEdit) openEditDialog(issueToEdit);
          break;
        case "delete":
          if (pendingAction.issueId) setDeleteConfirmId(pendingAction.issueId);
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
    }
  };

  const requireAuth = (action: { type: "edit" | "delete" | "export-excel" | "export-pdf" | "print"; issueId?: number }) => {
    setPendingAction(action);
    setPinAuthTarget("admin");
    setShowPinAuth(true);
  };

  const exportToExcel = () => {
    if (!filteredIssues.length) return;
    const data = filteredIssues.map(issue => ({
      Date: issue.date,
      Time: issue.time || "",
      "Stock Owner": getPartyName(issue.partyId),
      Material: getMaterialName(issue.materialId),
      Quantity: issue.quantity,
      UOM: issue.uom,
      "Issued To": issue.issuedTo,
      Purpose: issue.purpose || "",
      "Vehicle No.": issue.vehicleNumber || "",
      Notes: issue.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Material Issues");
    XLSX.writeFile(wb, `MaterialIssues_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    if (!filteredIssues.length) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Material Issues Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);

    const tableData = filteredIssues.map(issue => [
      issue.date,
      getPartyName(issue.partyId),
      getMaterialName(issue.materialId),
      `${issue.quantity} ${issue.uom}`,
      issue.issuedTo,
      issue.purpose || "",
    ]);

    autoTable(doc, {
      startY: 28,
      head: [["Date", "Stock Owner", "Material", "Qty", "Issued To", "Purpose"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [245, 158, 11] },
    });

    doc.save(`MaterialIssues_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "Exported to PDF" });
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Please allow pop-ups to print", variant: "destructive" });
      return;
    }

    const tableRows = filteredIssues.map(issue => `
      <tr>
        <td>${issue.date}</td>
        <td>${getPartyName(issue.partyId)}</td>
        <td>${getMaterialName(issue.materialId)}</td>
        <td>${issue.quantity} ${issue.uom}</td>
        <td>${issue.issuedTo}</td>
        <td>${issue.purpose || ""}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Material Issues - Print</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            .date { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f59e0b; color: white; }
          </style>
        </head>
        <body>
          <h1>Material Issues Report</h1>
          <p class="date">Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Stock Owner</th>
                <th>Material</th>
                <th>Quantity</th>
                <th>Issued To</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={backLink}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowUpRight className="w-6 h-6 text-orange-500" />
              Material Issues
            </h1>
            <p className="text-sm text-muted-foreground">Issue materials to sites from central store</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => requireAuth({ type: "export-excel" })} data-testid="button-export-excel">
            <Download className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth({ type: "export-pdf" })} data-testid="button-export-pdf">
            <Download className="w-4 h-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => requireAuth({ type: "print" })} data-testid="button-print">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); setEditingIssue(null); } setDialogOpen(open); }}>
            <DialogTrigger asChild>
              <Button className="gap-1" data-testid="button-add-issue">
                <Plus className="w-4 h-4" /> New Issue
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingIssue ? "Edit Material Issue" : "Record Material Issue"}</DialogTitle>
              </DialogHeader>
              
              {hasDraft && !editingIssue && (
                <DraftRestoreBanner
                  draftAge={draftAge}
                  onRestore={restoreDraft}
                  onDiscard={discardDraft}
                />
              )}
              
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-date" />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} data-testid="input-time" />
                  </div>
                </div>
                
                <div>
                  <Label>Stock Owner (Party)</Label>
                  <Select value={partyId} onValueChange={setPartyId}>
                    <SelectTrigger data-testid="select-party">
                      <SelectValue placeholder="Select party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties?.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Material</Label>
                  <Select value={materialId} onValueChange={setMaterialId}>
                    <SelectTrigger data-testid="select-material">
                      <SelectValue placeholder="Select material" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials?.map(m => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
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
                  <Label>Issued To (Site/Party)</Label>
                  <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value.toUpperCase())} placeholder="e.g., SITE A, HYDERABAD OFFICE" data-testid="input-issued-to" />
                </div>
                
                <div>
                  <Label>Purpose</Label>
                  <Input value={purpose} onChange={(e) => setPurpose(e.target.value.toUpperCase())} placeholder="e.g., Equipment fuel, Site consumption" data-testid="input-purpose" />
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
                  disabled={createMutation.isPending || updateMutation.isPending || !materialId || !quantity || !issuedTo}
                  data-testid="button-submit"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingIssue ? "Update Issue" : "Record Issue"}
                </Button>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">From Date</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
            </div>
            <div>
              <Label className="text-xs">To Date</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
            </div>
            <div>
              <Label className="text-xs">Stock Owner</Label>
              <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                <SelectTrigger data-testid="filter-party">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {parties?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Totals Summary */}
      {filteredTotals.length > 0 && (
        <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-semibold text-orange-700 dark:text-orange-300">Filtered Totals:</span>
              {filteredTotals.map((t, i) => (
                <Badge key={i} variant="outline" className="text-orange-700 dark:text-orange-300 border-orange-400 dark:border-orange-600 text-sm px-3 py-1">
                  {t.materialName}: {t.total.toFixed(2)} {t.uom}
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
      ) : !filteredIssues.length ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <ArrowUpRight className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Material Issues</h3>
            <p className="text-muted-foreground">Record material issues to sites from central store.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => (
            <Card key={issue.id} className="hover-elevate">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                      <ArrowUpRight className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{getMaterialName(issue.materialId)}</span>
                        <Badge variant="secondary">{issue.quantity} {issue.uom}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {issue.date} {issue.time && `at ${issue.time}`}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">To: </span>
                        <span className="font-medium">{issue.issuedTo}</span>
                        {issue.purpose && <span className="text-muted-foreground"> - {issue.purpose}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        From: {getPartyName(issue.partyId)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => requireAuth({ type: "edit", issueId: issue.id })} data-testid={`button-edit-${issue.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => requireAuth({ type: "delete", issueId: issue.id })} data-testid={`button-delete-${issue.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Material Issue?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">This will reverse the stock balance change. This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPinAuth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <PinAuth
            targetRole={pinAuthTarget}
            onClose={() => { setShowPinAuth(false); setPendingAction(null); }}
            onSuccess={handlePinSuccess}
          />
        </div>
      )}
    </div>
  );
}
