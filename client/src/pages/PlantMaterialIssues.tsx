import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import { ChevronLeft, Plus, Package, Loader2, Edit, Trash2, Download, Printer, ArrowUpRight } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useFeatureFlags } from "@/lib/featureFlags";
import { format } from "date-fns";
import type { Party, PlantMaterial, MaterialIssue } from "@shared/schema";
import { UOM_OPTIONS } from "@shared/schema";
import { stockOwnerLabel } from "@shared/stockOwnerLabel";

const LDO_TANK_LABELS: Record<string, string> = {
  "1": "LDO TANK 1 (BOILER)",
  "2": "LDO TANK 2 (DRYER)",
};

export default function PlantMaterialIssues() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const { companyName, logoFile } = useFeatureFlags();
  const canCreate = sectionCan("plant_stock", "create");
  const canEdit = sectionCan("plant_stock", "edit");
  const canDelete = isAdmin;
  const canExport = sectionCan("plant_stock", "view_reports");
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<MaterialIssue | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Deep-link highlight support: ?highlight=<issueId>
  const searchString = useSearch();
  const highlightId = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const v = params.get("highlight");
    return v ? parseInt(v, 10) : null;
  }, [searchString]);
  const returnTo = useMemo(() => {
    const sp = new URLSearchParams(searchString);
    const v = sp.get("returnTo");
    return (v && v.startsWith("/")) ? v : null;
  }, [searchString]);
  const highlightRowRef = useRef<HTMLDivElement | null>(null);
  const [localHighlightId, setLocalHighlightId] = useState<number | null>(null);
  const dialogOpenedForReturnRef = useRef<boolean>(false);
  useEffect(() => {
    if (highlightId != null) {
      setLocalHighlightId(highlightId);
    }
  }, [highlightId]);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("all");
  const [filterMaterialId, setFilterMaterialId] = useState("all");
  
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [uom, setUom] = useState("Liters");
  const [issuedTo, setIssuedTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [ldoTankNumber, setLdoTankNumber] = useState<string>("");
  const issuedToAutoSet = useRef(false);
  const purposeAutoSet = useRef(false);
  const receivedByAutoSet = useRef(false);

  const LDO_AUTO_PURPOSE = "TANK FILLING";
  const LDO_FALLBACK_RECEIVED_BY = "PLANT OPERATOR";

  const { data: ldoDefaults } = useQuery<{ tank1: string | null; tank2: string | null }>({
    queryKey: ["/api/admin/ldo-received-by"],
  });

  const getLdoReceivedByDefault = (tank: string) => {
    if (tank === "1") return ldoDefaults?.tank1 || LDO_FALLBACK_RECEIVED_BY;
    if (tank === "2") return ldoDefaults?.tank2 || LDO_FALLBACK_RECEIVED_BY;
    return LDO_FALLBACK_RECEIVED_BY;
  };

  // When defaults finish loading, update receivedBy if the tank is already
  // selected and the field was auto-set to the fallback (meaning defaults
  // arrived after the user picked a tank).
  useEffect(() => {
    if (!ldoDefaults || !ldoTankNumber || ldoTankNumber === "none") return;
    if (!receivedByAutoSet.current) return;
    const configured = getLdoReceivedByDefault(ldoTankNumber);
    if (receivedBy === LDO_FALLBACK_RECEIVED_BY && configured !== LDO_FALLBACK_RECEIVED_BY) {
      setReceivedBy(configured);
    }
  }, [ldoDefaults]);

  interface IssueFormData {
    date: string;
    time: string;
    partyId: string;
    materialId: string;
    quantity: string;
    uom: string;
    issuedTo: string;
    purpose: string;
    receivedBy: string;
    vehicleNumber: string;
    notes: string;
    ldoTankNumber: string;
  }

  const formData = useMemo<IssueFormData>(() => ({
    date, time, partyId, materialId, quantity, uom, issuedTo, purpose, receivedBy, vehicleNumber, notes, ldoTankNumber
  }), [date, time, partyId, materialId, quantity, uom, issuedTo, purpose, receivedBy, vehicleNumber, notes, ldoTankNumber]);

  const handleRestoreDraft = useCallback((data: IssueFormData) => {
    setDate(data.date);
    setTime(data.time);
    setPartyId(data.partyId);
    setMaterialId(data.materialId);
    setQuantity(data.quantity);
    setUom(data.uom);
    setIssuedTo(data.issuedTo);
    setPurpose(data.purpose);
    setReceivedBy(data.receivedBy || "");
    setVehicleNumber(data.vehicleNumber);
    setNotes(data.notes);
    const tank = data.ldoTankNumber || "";
    setLdoTankNumber(tank);
    issuedToAutoSet.current = !!(tank && tank !== "none" && data.issuedTo === LDO_TANK_LABELS[tank]);
    purposeAutoSet.current = !!(tank && tank !== "none" && data.purpose === LDO_AUTO_PURPOSE);
    receivedByAutoSet.current = !!(tank && tank !== "none" && data.receivedBy === getLdoReceivedByDefault(tank));
  }, [ldoDefaults]);

  const { hasDraft, draftAge, lastSavedAt, isDirty, restoreDraft, discardDraft, clearDraft } = useAutosave<IssueFormData>({
    formKey: "plant-material-issue-new",
    data: formData,
    enabled: dialogOpen && !editingIssue,
    onRestore: handleRestoreDraft,
  });

  const [, setLocation] = useLocation();
  const { confirmLeave } = useBeforeUnload(isDirty);

  const { data: issues, isLoading } = useQuery<MaterialIssue[]>({
    queryKey: ["/api/plant-module/material-issues"],
  });

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
  }, [localHighlightId, issues]);

  useEffect(() => {
    if (dialogOpen && returnTo) {
      dialogOpenedForReturnRef.current = true;
    }
  }, [dialogOpen, returnTo]);

  useEffect(() => {
    if (!dialogOpen && dialogOpenedForReturnRef.current) {
      dialogOpenedForReturnRef.current = false;
      if (returnTo) setLocation(returnTo);
    }
  }, [dialogOpen]);

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

  const handleLdoTankChange = (value: string) => {
    setLdoTankNumber(value);
    if (value && value !== "none") {
      if (!issuedTo || issuedToAutoSet.current) {
        setIssuedTo(LDO_TANK_LABELS[value] ?? "");
        issuedToAutoSet.current = true;
      }
      if (!purpose || purposeAutoSet.current) {
        setPurpose(LDO_AUTO_PURPOSE);
        purposeAutoSet.current = true;
      }
      if (!receivedBy || receivedByAutoSet.current) {
        setReceivedBy(getLdoReceivedByDefault(value));
        receivedByAutoSet.current = true;
      }
    } else {
      if (issuedToAutoSet.current) {
        setIssuedTo("");
        issuedToAutoSet.current = false;
      }
      if (purposeAutoSet.current) {
        setPurpose("");
        purposeAutoSet.current = false;
      }
      if (receivedByAutoSet.current) {
        setReceivedBy("");
        receivedByAutoSet.current = false;
      }
    }
  };

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setMaterialId("");
    setQuantity("");
    setUom("Liters");
    setIssuedTo("");
    setPurpose("");
    setReceivedBy("");
    setVehicleNumber("");
    setNotes("");
    setLdoTankNumber("");
    issuedToAutoSet.current = false;
    purposeAutoSet.current = false;
    receivedByAutoSet.current = false;
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
    setReceivedBy(issue.receivedBy || "");
    setVehicleNumber(issue.vehicleNumber || "");
    setNotes(issue.notes || "");
    const tank = issue.ldoTankNumber ? String(issue.ldoTankNumber) : "";
    setLdoTankNumber(tank);
    issuedToAutoSet.current = !!(tank && (issue.issuedTo || "") === LDO_TANK_LABELS[tank]);
    purposeAutoSet.current = !!(tank && (issue.purpose || "") === LDO_AUTO_PURPOSE);
    receivedByAutoSet.current = !!(tank && (issue.receivedBy || "") === getLdoReceivedByDefault(tank));
    setDialogOpen(true);
  };

  const selectedMaterial = materials?.find(m => String(m.id) === materialId);
  const isLdoOrDiesel = selectedMaterial
    ? ["LDO", "DIESEL"].includes(selectedMaterial.name.toUpperCase().trim())
    : false;

  const getLdoTankLabel = (tank: number | null | undefined) => {
    if (tank === 1) return "Tank 1 (Boiler)";
    if (tank === 2) return "Tank 2 (Dryer)";
    return null;
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
      receivedBy: receivedBy || null,
      vehicleNumber: vehicleNumber || null,
      notes: notes || null,
      ldoTankNumber: (isLdoOrDiesel && ldoTankNumber && ldoTankNumber !== "none") ? parseInt(ldoTankNumber) : null,
    };
    
    if (editingIssue) {
      updateMutation.mutate({ id: editingIssue.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || `Material #${id}`;
  const getPartyName = (id: number | null, issueMaterialId: number) => stockOwnerLabel({
    partyId: id,
    materialName: materials?.find((m) => m.id === issueMaterialId)?.name,
    resolvedPartyName: id == null ? null : parties?.find((p) => p.id === id)?.name,
    unresolvedPartyPrefix: "Party #",
  });

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

  const handleEditClick = (issueId: number) => {
    const issueToEdit = issues?.find(r => r.id === issueId);
    if (issueToEdit) openEditDialog(issueToEdit);
  };

  const handleDeleteClick = (issueId: number) => {
    setDeleteConfirmId(issueId);
  };

  const exportToExcel = () => {
    if (!filteredIssues.length) return;
    const data = filteredIssues.map(issue => ({
      Date: issue.date,
      Time: issue.time || "",
      "Stock Owner": getPartyName(issue.partyId, issue.materialId),
      Material: getMaterialName(issue.materialId),
      "LDO Tank": getLdoTankLabel(issue.ldoTankNumber) || "",
      Quantity: issue.quantity,
      UOM: issue.uom,
      "Issued To": issue.issuedTo,
      Purpose: issue.purpose || "",
      "Received By": issue.receivedBy || "",
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
      getPartyName(issue.partyId, issue.materialId),
      getMaterialName(issue.materialId),
      getLdoTankLabel(issue.ldoTankNumber) || "",
      `${issue.quantity} ${issue.uom}`,
      issue.issuedTo,
      issue.purpose || "",
      issue.receivedBy || "",
    ]);

    autoTable(doc, {
      startY: 28,
      head: [["Date", "Stock Owner", "Material", "LDO Tank", "Qty", "Issued To", "Purpose", "Received By"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [245, 158, 11] },
    });

    doc.save(`MaterialIssues_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "Exported to PDF" });
  };

  const handlePrint = () => {
    const tableRows = filteredIssues.map(issue => `
      <tr>
        <td>${issue.date}</td>
        <td>${getPartyName(issue.partyId, issue.materialId)}</td>
        <td>${getMaterialName(issue.materialId)}</td>
        <td>${getLdoTankLabel(issue.ldoTankNumber) || ""}</td>
        <td>${issue.quantity} ${issue.uom}</td>
        <td>${issue.issuedTo}</td>
        <td>${issue.purpose || ""}</td>
        <td>${issue.receivedBy || ""}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Material Issues - Print</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .company-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px; }
            .company-header img { height: 50px; margin-bottom: 5px; }
            .company-header h2 { margin: 0; font-size: 14px; font-weight: bold; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            .date { font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
            th { background-color: #f59e0b; color: white; }
          </style>
        </head>
        <body>
          <div class="company-header">
            <img src="${window.location.origin}/${logoFile}" onerror="this.style.display='none'" />
            <h2>${companyName}</h2>
          </div>
          <h1>Material Issues Report</h1>
          <p class="date">Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Stock Owner</th>
                <th>Material</th>
                <th>LDO Tank</th>
                <th>Quantity</th>
                <th>Issued To</th>
                <th>Purpose</th>
                <th>Received By</th>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => confirmLeave(() => setLocation(backLink))} data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowUpRight className="w-6 h-6 text-orange-500" />
              Material Issues
            </h1>
            <p className="text-sm text-muted-foreground">Issue materials to sites from central store</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={exportToExcel} data-testid="button-export-excel">
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportToPDF} data-testid="button-export-pdf">
                <Download className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </>
          )}
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); setEditingIssue(null); } setDialogOpen(open); }}>
            {canCreate && (
              <DialogTrigger asChild>
                <Button className="gap-1" data-testid="button-add-issue">
                  <Plus className="w-4 h-4" /> New Issue
                </Button>
              </DialogTrigger>
            )}
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
                  <Select value={materialId} onValueChange={(v) => { setMaterialId(v); setLdoTankNumber(""); }}>
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

                {isLdoOrDiesel && (
                  <div>
                    <Label>Destination LDO Tank</Label>
                    <Select value={ldoTankNumber} onValueChange={handleLdoTankChange}>
                      <SelectTrigger data-testid="select-ldo-tank">
                        <SelectValue placeholder="Select tank (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None / Not applicable</SelectItem>
                        <SelectItem value="1">Tank 1 — Boiler</SelectItem>
                        <SelectItem value="2">Tank 2 — Dryer</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground mt-1">
                      Select a tank to auto-record this issue as a receipt in the LDO flow tracker.
                    </p>
                  </div>
                )}
                
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
                  <Input value={issuedTo} onChange={(e) => { issuedToAutoSet.current = false; setIssuedTo(e.target.value.toUpperCase()); }} placeholder="e.g., SITE A, HYDERABAD OFFICE" data-testid="input-issued-to" />
                </div>
                
                <div>
                  <Label>Purpose</Label>
                  <Input value={purpose} onChange={(e) => { purposeAutoSet.current = false; setPurpose(e.target.value.toUpperCase()); }} placeholder="e.g., Equipment fuel, Site consumption" data-testid="input-purpose" />
                </div>
                
                <div>
                  <Label>Received By</Label>
                  <Input value={receivedBy} onChange={(e) => { receivedByAutoSet.current = false; setReceivedBy(e.target.value.toUpperCase()); }} placeholder="Person receiving the material" data-testid="input-received-by" />
                </div>
                
                <div>
                  <Label>Vehicle Number</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g., TS09AB1234" data-testid="input-vehicle" />
                </div>
                
                <div>
                  <Label>Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value.toUpperCase())} placeholder="Additional notes" data-testid="input-notes" />
                </div>
                
                <div className="space-y-1.5">
                  <Button 
                    onClick={handleSubmit} 
                    className="w-full" 
                    disabled={createMutation.isPending || updateMutation.isPending || !materialId || !quantity || !issuedTo}
                    data-testid="button-submit"
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingIssue ? "Update Issue" : "Record Issue"}
                  </Button>
                  {!editingIssue && <AutoSaveIndicator lastSavedAt={lastSavedAt} className="justify-center w-full" />}
                </div>
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
              <Label className="text-sm">From Date</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
            </div>
            <div>
              <Label className="text-sm">To Date</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
            </div>
            <div>
              <Label className="text-sm">Stock Owner</Label>
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
              <Label className="text-sm">Material</Label>
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
            <div
              key={issue.id}
              ref={issue.id === localHighlightId ? highlightRowRef : null}
            >
            <Card className={`hover-elevate transition-all duration-500 ${issue.id === localHighlightId ? "ring-2 ring-yellow-400 dark:ring-yellow-600 bg-yellow-50 dark:bg-yellow-900/20" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                      <ArrowUpRight className="w-6 h-6 text-orange-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{getMaterialName(issue.materialId)}</span>
                        <Badge variant="secondary">{issue.quantity} {issue.uom}</Badge>
                        {getLdoTankLabel(issue.ldoTankNumber) && (
                          <Badge variant="outline" className="text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-600 text-sm">
                            {getLdoTankLabel(issue.ldoTankNumber)}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {issue.date} {issue.time && `at ${issue.time}`}
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">To: </span>
                        <span className="font-medium">{issue.issuedTo}</span>
                        {issue.purpose && <span className="text-muted-foreground"> - {issue.purpose}</span>}
                      </div>
                      {issue.receivedBy && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Received By: </span>
                          <span className="font-medium">{issue.receivedBy}</span>
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        From: {getPartyName(issue.partyId, issue.materialId)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => handleEditClick(issue.id)} data-testid={`button-edit-${issue.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(issue.id)} data-testid={`button-delete-${issue.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
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
    </div>
  );
}
