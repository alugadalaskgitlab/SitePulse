import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChevronLeft, Plus, Truck, Loader2, Lock, Trash2, Edit, Download, Printer, Unlock } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import { format } from "date-fns";
import type { Party, MixTemplate, TruckDispatch } from "@shared/schema";

const MIX_TYPES = ["BC", "DBM"];

export default function PlantDispatches() {
  const { toast } = useToast();
  const { canEdit, canDelete, isAdmin, access, requestAdminAccess } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState<TruckDispatch | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  
  // Filter state
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState("all");
  const [filterMixType, setFilterMixType] = useState("all");
  const [filterVehicle, setFilterVehicle] = useState("all");
  
  // Admin PIN state
  const [adminPin, setAdminPin] = useState("");
  
  // Form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState(format(new Date(), "HH:mm"));
  const [partyId, setPartyId] = useState<string>("");
  const [mixTemplateId, setMixTemplateId] = useState<string>("");
  const [truckNumber, setTruckNumber] = useState("");
  const [loadWeight, setLoadWeight] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [actualBitumenPercent, setActualBitumenPercent] = useState("");

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
    onSuccess: () => {
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

  const handleUnlockAdmin = () => {
    const success = requestAdminAccess(adminPin);
    if (success) {
      toast({ title: "Admin access granted" });
      setAdminPin("");
    } else {
      toast({ title: "Invalid PIN", variant: "destructive" });
    }
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

  // Export functions
  const exportToExcel = () => {
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
    XLSX.writeFile(wb, `dispatches_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Mix Dispatches Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
    
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
      startY: 28,
      head: [["Date", "Time", "Party", "Site", "Mix Type", "Load (MT)", "Vehicle", "Bitumen (MT)", "LDO (L)"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
    });
    
    doc.save(`dispatches_${format(new Date(), "yyyy-MM-dd")}.pdf`);
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
            <h1 className="text-2xl font-bold">Mix Dispatches</h1>
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
              <DialogTitle>{editingDispatch ? "Edit Dispatch" : "Record Mix Dispatch"}</DialogTitle>
            </DialogHeader>
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

              {canEdit && (
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

      {/* Admin Access Section */}
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
              placeholder="Enter PIN"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              className="w-32"
              data-testid="input-admin-pin"
            />
            <Button size="sm" onClick={handleUnlockAdmin} className="gap-1" data-testid="button-unlock-admin">
              <Unlock className="w-4 h-4" /> Unlock Admin
            </Button>
          </div>
        )}
        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="sm" variant="outline" className="gap-1" onClick={exportToExcel} disabled={!filteredDispatches.length} data-testid="button-export-excel">
              <Download className="w-4 h-4" /> Export Excel
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={exportToPDF} disabled={!filteredDispatches.length} data-testid="button-export-pdf">
              <Download className="w-4 h-4" /> Export PDF
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print">
              <Printer className="w-4 h-4" /> Print
            </Button>
          </div>
        )}
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
                                <span className="font-medium">{template?.name || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Bitumen</span>
                                <span className="font-medium">{dispatch.theoreticalBitumenQty?.toFixed(2) || "0"} MT ({dispatch.theoreticalBitumenPercent || 0}%)</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">LDO</span>
                                <span className="font-medium">{dispatch.theoreticalLdoQty?.toFixed(1) || "0"} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Location</span>
                                <span className="font-medium">{dispatch.deliveryLocation || "-"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Party</span>
                                <span className="font-medium">{getPartyName(dispatch.partyId)}</span>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex gap-2 ml-4">
                                <Button size="icon" variant="ghost" onClick={() => openEditDialog(dispatch)} data-testid={`button-edit-dispatch-${dispatch.id}`}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(dispatch.id)} data-testid={`button-delete-dispatch-${dispatch.id}`}>
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
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
