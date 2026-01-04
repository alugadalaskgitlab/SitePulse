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
import { ChevronLeft, Plus, Gauge, Loader2, TrendingUp, TrendingDown, Edit, Trash2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import { format } from "date-fns";
import type { EquipmentMasterType, EquipmentUsage } from "@shared/schema";

export default function PlantEquipmentUsage() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<EquipmentUsage | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [equipmentId, setEquipmentId] = useState<string>("");
  const [openingReading, setOpeningReading] = useState("");
  const [closingReading, setClosingReading] = useState("");
  const [dieselIssued, setDieselIssued] = useState("");
  const [remarks, setRemarks] = useState("");

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
    setDieselIssued("");
    setRemarks("");
    setEditingUsage(null);
  };

  const openEditDialog = (entry: EquipmentUsage) => {
    setEditingUsage(entry);
    setDate(entry.date);
    setEquipmentId(String(entry.equipmentId));
    setOpeningReading(String(entry.openingReading));
    setClosingReading(String(entry.closingReading));
    setDieselIssued(entry.dieselIssued ? String(entry.dieselIssued) : "");
    setRemarks(entry.remarks || "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!equipmentId || !openingReading || !closingReading) return;
    
    const data = {
      date,
      equipmentId: parseInt(equipmentId),
      openingReading: parseFloat(openingReading),
      closingReading: parseFloat(closingReading),
      dieselIssued: dieselIssued ? parseFloat(dieselIssued) : null,
      remarks: remarks.toUpperCase(),
    };

    if (editingUsage) {
      updateMutation.mutate({ id: editingUsage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const selectedEquipment = equipment?.find(e => e.id === parseInt(equipmentId));
  const runtime = openingReading && closingReading ? parseFloat(closingReading) - parseFloat(openingReading) : 0;
  const expectedDiesel = runtime * (selectedEquipment?.consumptionNorm || 0);

  // Group usage by date
  const groupedUsage = usage?.reduce((acc, entry) => {
    const dateKey = entry.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, EquipmentUsage[]>) || {};

  // Sort dates descending
  const sortedDates = Object.keys(groupedUsage).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

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
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger data-testid="select-equipment">
                    <SelectValue placeholder="Select equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment?.map((equip) => (
                      <SelectItem key={equip.id} value={String(equip.id)}>
                        {equip.name} ({equip.meterType === "hour_meter" ? "hrs" : "km"})
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
                  <p>Expected Diesel: <strong>{expectedDiesel.toFixed(1)} L</strong></p>
                </div>
              )}

              <div>
                <Label>Diesel Issued (L)</Label>
                <Input type="number" step="0.1" value={dieselIssued} onChange={(e) => setDieselIssued(e.target.value)} placeholder="Actual diesel issued" data-testid="input-diesel-issued" />
              </div>

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

      {/* Delete Confirmation Dialog */}
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
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !usage?.length ? (
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
                        const variance = entry.variance || 0;
                        return (
                          <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover-elevate">
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
                              <div>
                                <span className="text-muted-foreground text-xs block">Equipment</span>
                                <span className="font-medium">{equip?.name || "Unknown"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Opening</span>
                                <span className="font-medium">{entry.openingReading}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Closing</span>
                                <span className="font-medium">{entry.closingReading}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Runtime</span>
                                <span className="font-medium">{entry.hoursOrKmRun?.toFixed(1)} {equip?.meterType === "hour_meter" ? "hrs" : "km"}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Consumed</span>
                                <span className="font-medium">{entry.expectedDiesel?.toFixed(1)} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Diesel Issued</span>
                                <span className="font-medium">{entry.dieselIssued?.toFixed(1) || "-"} L</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-xs block">Balance</span>
                                <Badge variant="secondary" className="gap-1">
                                  {variance > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {variance?.toFixed(1) || "0"} L
                                </Badge>
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
