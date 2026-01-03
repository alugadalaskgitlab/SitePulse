import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";
import { ChevronLeft, Plus, Package, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Party, PlantMaterial, MaterialReceipt } from "@shared/schema";

export default function PlantMaterialReceipts() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
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
      setDialogOpen(false);
      resetForm();
      toast({ title: "Material receipt recorded successfully" });
    },
  });

  const resetForm = () => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTime(format(new Date(), "HH:mm"));
    setPartyId("");
    setIsPlantCommon(false);
    setMaterialId("");
    setQuantity("");
    setSupplier("");
    setVehicleNumber("");
    setChallanNumber("");
  };

  const handleSubmit = () => {
    if (!materialId || !quantity) return;
    createMutation.mutate({
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
    });
  };

  const selectedMaterial = materials?.find(m => m.id === parseInt(materialId));

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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-receipt">
              <Plus className="w-4 h-4" /> New Receipt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Material Receipt</DialogTitle>
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
                      <SelectItem value="Ton">Ton</SelectItem>
                      <SelectItem value="MT">MT</SelectItem>
                      <SelectItem value="Cum">Cum</SelectItem>
                      <SelectItem value="Liters">Liters</SelectItem>
                      <SelectItem value="Kgs">Kgs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Supplier</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" data-testid="input-supplier" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Vehicle No</Label>
                  <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g., KA-01-XX-1234" data-testid="input-vehicle" />
                </div>
                <div>
                  <Label>Challan No</Label>
                  <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} placeholder="Receipt/Challan" data-testid="input-challan" />
                </div>
              </div>

              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || !materialId || !quantity} data-testid="button-save-receipt">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Receipt"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Receipt Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !receipts?.length ? (
            <p className="text-muted-foreground text-center py-8">No receipts recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {receipts.map((receipt) => {
                const material = materials?.find(m => m.id === receipt.materialId);
                const party = parties?.find(p => p.id === receipt.partyId);
                return (
                  <div key={receipt.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{material?.name || "Unknown"} - {receipt.quantity} {receipt.uom}</p>
                      <p className="text-sm text-muted-foreground">
                        {receipt.isPlantCommon ? "Plant Common" : party?.name || "Unknown Party"} | 
                        {receipt.supplier && ` Supplier: ${receipt.supplier} |`}
                        {receipt.vehicleNumber && ` Vehicle: ${receipt.vehicleNumber}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{receipt.date} {receipt.time}</p>
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
