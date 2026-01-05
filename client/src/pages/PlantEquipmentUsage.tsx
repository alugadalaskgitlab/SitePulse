import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ChevronLeft, Plus, Gauge, Loader2, Edit, Trash2, Download, Printer, Lock } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { EquipmentMasterType, EquipmentUsage } from "@shared/schema";

export default function PlantEquipmentUsage() {
  const { toast } = useToast();
  const { canEdit, canDelete, isAdmin, access, requestAdminAccess } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<EquipmentUsage | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [openingReading, setOpeningReading] = useState("");
  const [closingReading, setClosingReading] = useState("");
  const [openingDiesel, setOpeningDiesel] = useState("");
  const [dieselIssued, setDieselIssued] = useState("");
  const [remarks, setRemarks] = useState("");
  const [previousDieselBalance, setPreviousDieselBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [userModifiedOpening, setUserModifiedOpening] = useState(false);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterEquipmentId, setFilterEquipmentId] = useState("all");

  const [adminPin, setAdminPin] = useState("");

  const { data: usage, isLoading } = useQuery<EquipmentUsage[]>({
    queryKey: ["/api/plant-module/equipment-usage"],
  });

  const { data: equipment } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/plant-module/equipment-usage", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Equipment usage recorded successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/plant-module/equipment-usage/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDialogOpen(false);
      setEditingUsage(null);
      resetForm();
      toast({ title: "Equipment usage updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/equipment-usage/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment-usage"] });
      setDeleteConfirmId(null);
      toast({ title: "Equipment usage deleted successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setEquipmentId("");
    setOpeningReading("");
    setClosingReading("");
    setOpeningDiesel("");
    setDieselIssued("");
    setRemarks("");
    setEditingUsage(null);
    setPreviousDieselBalance(null);
    setIsLoadingBalance(false);
    setUserModifiedOpening(false);
  };

  const openEditDialog = (entry: EquipmentUsage) => {
    setEditingUsage(entry);
    setDate(entry.date);
    setEquipmentId(String(entry.equipmentId));
    setOpeningReading(String(entry.openingReading));
    setClosingReading(String(entry.closingReading));
    setOpeningDiesel((entry as any).openingDiesel ? String((entry as any).openingDiesel) : "0");
    setDieselIssued(entry.dieselIssued ? String(entry.dieselIssued) : "");
    setRemarks(entry.remarks || "");
    setPreviousDieselBalance((entry as any).openingDiesel || 0);
    setUserModifiedOpening(true);
    setDialogOpen(true);
  };

  const handleEquipmentChange = async (value: string) => {
    setEquipmentId(value);
    setUserModifiedOpening(false);
    
    if (value && !editingUsage) {
      setIsLoadingBalance(true);
      try {
        const res = await fetch(`/api/plant-module/equipment-usage/previous-balance/${value}`);
        if (res.ok) {
          const data = await res.json();
          setPreviousDieselBalance(data.previousBalance);
          setOpeningDiesel(String(data.previousBalance));
        } else {
          setPreviousDieselBalance(0);
          setOpeningDiesel("0");
        }
      } catch {
        setPreviousDieselBalance(0);
        setOpeningDiesel("0");
      }
      setIsLoadingBalance(false);
    }
  };
  
  const handleOpeningDieselChange = (value: string) => {
    setOpeningDiesel(value);
    setUserModifiedOpening(true);
  };

  const handleSubmit = () => {
    if (!equipmentId || !openingReading || !closingReading) return;
    
    const data = {
      date,
      equipmentId: parseInt(equipmentId),
      openingReading: parseFloat(openingReading),
      closingReading: parseFloat(closingReading),
      openingDiesel: openingDiesel ? parseFloat(openingDiesel) : 0,
      dieselIssued: dieselIssued ? parseFloat(dieselIssued) : 0,
      remarks: remarks.toUpperCase(),
    };

    if (editingUsage) {
      updateMutation.mutate({ id: editingUsage.id, data });
    } else {
      createMutation.mutate(data);
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

  const selectedEquipment = equipment?.find(e => e.id === parseInt(equipmentId));
  const runtime = openingReading && closingReading ? parseFloat(closingReading) - parseFloat(openingReading) : 0;
  const expectedDiesel = runtime * (selectedEquipment?.consumptionNorm || 0);

  const filteredUsage = usage?.filter(u => {
    if (filterDateFrom && u.date < filterDateFrom) return false;
    if (filterDateTo && u.date > filterDateTo) return false;
    if (filterEquipmentId !== "all" && u.equipmentId !== parseInt(filterEquipmentId)) return false;
    return true;
  }) || [];

  const groupedUsage = filteredUsage.reduce((acc, entry) => {
    const dateKey = entry.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, EquipmentUsage[]>);

  const sortedDates = Object.keys(groupedUsage).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const getExportData = () => {
    return filteredUsage.map(entry => {
      const equip = equipment?.find(e => e.id === entry.equipmentId);
      const openingDieselVal = (entry as any).openingDiesel ?? 0;
      const dieselIssuedVal = entry.dieselIssued ?? 0;
      const consumed = entry.expectedDiesel ?? 0;
      const closingDieselVal = (entry as any).closingDiesel ?? (openingDieselVal + dieselIssuedVal - consumed);
      return {
        Date: entry.date,
        Equipment: equip?.name || "Unknown",
        "Opening Reading": entry.openingReading,
        "Closing Reading": entry.closingReading,
        "Hours/KM Run": entry.hoursOrKmRun?.toFixed(1) || "0",
        "Opening Diesel": openingDieselVal.toFixed(1),
        "Diesel Issued": dieselIssuedVal.toFixed(1),
        "Closing Diesel": closingDieselVal.toFixed(1),
        "Expected Diesel": consumed.toFixed(1),
      };
    });
  };

  const exportToExcel = () => {
    const data = getExportData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equipment Usage");
    XLSX.writeFile(wb, `equipment-usage-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast({ title: "Exported to Excel" });
  };

  const exportToPdf = () => {
    const data = getExportData();
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Equipment Usage Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 22);
    
    autoTable(doc, {
      startY: 28,
      head: [["Date", "Equipment", "Opening Reading", "Closing Reading", "Hours/KM Run", "Opening Diesel", "Diesel Issued", "Closing Diesel", "Expected Diesel"]],
      body: data.map(row => [
        row.Date,
        row.Equipment,
        row["Opening Reading"],
        row["Closing Reading"],
        row["Hours/KM Run"],
        row["Opening Diesel"],
        row["Diesel Issued"],
        row["Closing Diesel"],
        row["Expected Diesel"],
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });
    
    doc.save(`equipment-usage-${format(new Date(), "yyyy-MM-dd")}.pdf`);
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
            <h1 className="text-2xl font-bold">Equipment Usage</h1>
            <p className="text-muted-foreground">Track meter readings and fuel consumption</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-usage">
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingUsage ? "Edit Equipment Usage" : "Record Equipment Usage"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-usage-date" />
              </div>

              <div>
                <Label>Equipment</Label>
                <Select value={equipmentId} onValueChange={handleEquipmentChange}>
                  <SelectTrigger data-testid="select-equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment?.map((equip) => (
                      <SelectItem key={equip.id} value={String(equip.id)}>
                        {equip.name} {(equip as any).registrationNumber ? `(${(equip as any).registrationNumber})` : ""} - {equip.meterType === "hour_meter" ? "hrs" : "km"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedEquipment && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Norm: {selectedEquipment.consumptionNorm} {selectedEquipment.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Reading</Label>
                  <Input type="number" step="0.1" value={openingReading} onChange={(e) => setOpeningReading(e.target.value)} placeholder="0.0" data-testid="input-opening-reading" />
                </div>
                <div>
                  <Label>Closing Reading</Label>
                  <Input type="number" step="0.1" value={closingReading} onChange={(e) => setClosingReading(e.target.value)} placeholder="0.0" data-testid="input-closing-reading" />
                </div>
              </div>

              {runtime > 0 && selectedEquipment && (
                <div className="p-3 bg-muted rounded-md text-sm">
                  <p>Runtime: <strong>{runtime.toFixed(1)} {selectedEquipment.meterType === "hour_meter" ? "hrs" : "km"}</strong></p>
                  <p>Diesel Consumed: <strong>{expectedDiesel.toFixed(1)} L</strong></p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Opening Diesel Tank (L)</Label>
                  <div className="relative">
                    <Input 
                      type="number" 
                      step="0.1" 
                      value={openingDiesel} 
                      onChange={(e) => handleOpeningDieselChange(e.target.value)} 
                      placeholder="Previous balance" 
                      data-testid="input-opening-diesel"
                      disabled={isLoadingBalance}
                    />
                    {isLoadingBalance && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {previousDieselBalance !== null && !editingUsage && (
                    <p className="text-xs text-muted-foreground mt-1">Auto-filled from previous: {previousDieselBalance.toFixed(1)} L</p>
                  )}
                </div>
                <div>
                  <Label>Diesel Issued (L)</Label>
                  <Input type="number" step="0.1" value={dieselIssued} onChange={(e) => setDieselIssued(e.target.value)} placeholder="0" data-testid="input-diesel-issued" />
                </div>
              </div>

              {openingDiesel && dieselIssued !== undefined && expectedDiesel > 0 && (
                <div className="p-3 bg-primary/10 rounded-md text-sm">
                  <p>Closing Tank Balance: <strong>{(parseFloat(openingDiesel || "0") + parseFloat(dieselIssued || "0") - expectedDiesel).toFixed(1)} L</strong></p>
                </div>
              )}

              <div>
                <Label>Remarks</Label>
                <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value.toUpperCase())} placeholder="Optional notes" data-testid="input-usage-remarks" />
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !equipmentId || !openingReading || !closingReading} data-testid="button-save-usage">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingUsage ? "Update Entry" : "Save Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant={isAdmin ? "default" : "secondary"} className="text-xs">
                {access.toUpperCase()}
              </Badge>
            </div>
            {!isAdmin && (
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="Admin PIN"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  className="w-28"
                  data-testid="input-admin-pin"
                />
                <Button size="sm" variant="outline" onClick={handleUnlockAdmin} className="gap-1" data-testid="button-unlock-admin">
                  <Lock className="w-3 h-3" /> Unlock Admin
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">Filters</CardTitle>
          {isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1" onClick={exportToExcel} disabled={!filteredUsage.length} data-testid="button-export-excel">
                <Download className="w-4 h-4" /> Excel
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={exportToPdf} disabled={!filteredUsage.length} data-testid="button-export-pdf">
                <Download className="w-4 h-4" /> PDF
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs text-muted-foreground">DATE FROM</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                data-testid="input-filter-date-from"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs text-muted-foreground">DATE TO</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                data-testid="input-filter-date-to"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">EQUIPMENT</Label>
              <Select value={filterEquipmentId} onValueChange={setFilterEquipmentId}>
                <SelectTrigger data-testid="select-filter-equipment">
                  <SelectValue placeholder="All Equipment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Equipment</SelectItem>
                  {equipment?.map((equip) => (
                    <SelectItem key={equip.id} value={String(equip.id)}>
                      {equip.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterDateFrom("");
                setFilterDateTo("");
                setFilterEquipmentId("all");
              }}
              data-testid="button-clear-filters"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this equipment usage entry?</p>
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
            <Gauge className="w-5 h-5" />
            Usage Log
            {filteredUsage.length > 0 && (
              <Badge variant="secondary" className="ml-2">{filteredUsage.length} entries</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !filteredUsage.length ? (
            <p className="text-muted-foreground text-center py-8">No usage recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((dateKey) => {
                const dayUsage = groupedUsage[dateKey];
                return (
                  <div key={dateKey}>
                    <h3 className="font-semibold text-lg mb-3 border-b pb-2">{format(new Date(dateKey), "EEEE, dd MMM yyyy")}</h3>
                    <div className="space-y-2">
                      {dayUsage.map((entry) => {
                        const equip = equipment?.find(e => e.id === entry.equipmentId);
                        const openingDieselVal = (entry as any).openingDiesel ?? 0;
                        const dieselIssuedVal = entry.dieselIssued ?? 0;
                        const consumed = entry.expectedDiesel ?? 0;
                        const closingDieselVal = (entry as any).closingDiesel ?? (openingDieselVal + dieselIssuedVal - consumed);
                        return (
                          <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground text-xs block">Equipment</span>
                                <span className="font-medium">{equip?.name || "Unknown"}</span>
                                {(equip as any)?.registrationNumber && (
                                  <span className="text-xs text-muted-foreground block">{(equip as any).registrationNumber}</span>
                                )}
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Runtime</span>
                                <span className="font-medium">{entry.hoursOrKmRun?.toFixed(1)} {equip?.meterType === "hour_meter" ? "hrs" : "km"}</span>
                                <span className="text-xs text-muted-foreground block">{entry.openingReading} - {entry.closingReading}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Diesel Issued</span>
                                <span className="font-medium">{dieselIssuedVal.toFixed(1)} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Consumed</span>
                                <span className="font-medium">{consumed.toFixed(1)} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Tank Balance</span>
                                <span className="font-medium">{closingDieselVal.toFixed(1)} L</span>
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex gap-2 ml-4">
                                <Button size="icon" variant="ghost" onClick={() => openEditDialog(entry)} data-testid={`button-edit-usage-${entry.id}`}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button size="icon" variant="ghost" onClick={() => setDeleteConfirmId(entry.id)} data-testid={`button-delete-usage-${entry.id}`}>
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
