import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Plus, Truck, Loader2, Lock, Trash2, Edit } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import { format } from "date-fns";
import type { Party, MixTemplate, TruckDispatch } from "@shared/schema";

export default function PlantDispatches() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState<TruckDispatch | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
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

  const selectedTemplate = templates?.find(t => t.id === parseInt(mixTemplateId));

  // Group dispatches by date
  const groupedDispatches = dispatches?.reduce((acc, dispatch) => {
    const dateKey = dispatch.date;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(dispatch);
    return acc;
  }, {} as Record<string, TruckDispatch[]>) || {};

  // Sort dates descending, and entries within each date by time descending
  const sortedDates = Object.keys(groupedDispatches).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  const getPartyName = (id: number | null) => id ? parties?.find(p => p.id === id)?.name || "Unknown" : "Unknown";
  const getTemplateName = (id: number | null) => id ? templates?.find(t => t.id === id)?.name || "Unknown" : "Unknown";

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
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !dispatches?.length ? (
            <p className="text-muted-foreground text-center py-8">No dispatches recorded yet.</p>
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
