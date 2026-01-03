import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { ChevronLeft, Plus, Truck, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Party, MixTemplate, TruckDispatch } from "@shared/schema";

export default function PlantDispatches() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
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
      setDialogOpen(false);
      resetForm();
      toast({ title: "Dispatch recorded successfully" });
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
  };

  const handleSubmit = () => {
    if (!partyId || !mixTemplateId || !truckNumber || !loadWeight) return;
    createMutation.mutate({
      date,
      time,
      partyId: parseInt(partyId),
      mixTemplateId: parseInt(mixTemplateId),
      truckNumber,
      loadWeight: parseFloat(loadWeight),
      deliveryLocation,
      actualBitumenPercent: actualBitumenPercent ? parseFloat(actualBitumenPercent) : null,
    });
  };

  const selectedTemplate = templates?.find(t => t.id === parseInt(mixTemplateId));

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
            <h1 className="text-2xl font-bold">Truck Dispatches</h1>
            <p className="text-muted-foreground">Record outgoing truck loads</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-dispatch">
              <Plus className="w-4 h-4" /> New Dispatch
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Truck Dispatch</DialogTitle>
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
                <Input value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} placeholder="e.g., KA-01-XX-1234" data-testid="input-truck-number" />
              </div>

              <div>
                <Label>Load Weight (MT)</Label>
                <Input type="number" step="0.1" value={loadWeight} onChange={(e) => setLoadWeight(e.target.value)} placeholder="e.g., 20.5" data-testid="input-load-weight" />
              </div>

              <div>
                <Label>Delivery Location (optional)</Label>
                <Input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Site/chainage" data-testid="input-delivery-location" />
              </div>

              <div>
                <Label>Actual Bitumen % (optional)</Label>
                <Input type="number" step="0.1" value={actualBitumenPercent} onChange={(e) => setActualBitumenPercent(e.target.value)} placeholder="Leave blank for theoretical" data-testid="input-actual-bitumen" />
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || !partyId || !mixTemplateId || !truckNumber || !loadWeight} data-testid="button-save-dispatch">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Dispatch"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
            <div className="space-y-3">
              {dispatches.map((dispatch) => {
                const party = parties?.find(p => p.id === dispatch.partyId);
                const template = templates?.find(t => t.id === dispatch.mixTemplateId);
                return (
                  <div key={dispatch.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{dispatch.truckNumber} - {dispatch.loadWeight} MT</p>
                      <p className="text-sm text-muted-foreground">
                        {party?.name} | {template?.name} ({template?.mixType})
                        {dispatch.deliveryLocation && ` | To: ${dispatch.deliveryLocation}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Theoretical: {dispatch.theoreticalBitumenQty?.toFixed(2)} MT ({dispatch.theoreticalBitumenPercent}%)
                        {dispatch.actualBitumenPercent && ` | Actual: ${dispatch.actualBitumenPercent}%`}
                      </p>
                      <p className="text-xs text-muted-foreground">{dispatch.date} {dispatch.time}</p>
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
