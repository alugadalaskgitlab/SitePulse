import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { ChevronLeft, Plus, Factory, Users, Package, Layers, Truck, Settings, Gauge, Droplets, ChevronRight, Loader2, Pencil, Trash2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import type { Party, PlantMaterial, MixTemplate, EquipmentMasterType } from "@shared/schema";
import { EQUIPMENT_TYPES, METER_TYPES, MIX_TYPES } from "@shared/schema";

export default function Plant() {
  const [activeTab, setActiveTab] = useState("operations");
  
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">Plant Module</h1>
            <p className="text-muted-foreground mt-1">Hot-mix plant operations and material tracking</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="operations" className="gap-2">
            <Truck className="w-4 h-4" />
            <span className="hidden sm:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="equipment" className="gap-2">
            <Gauge className="w-4 h-4" />
            <span className="hidden sm:inline">Equipment</span>
          </TabsTrigger>
          <TabsTrigger value="masters" className="gap-2">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Masters</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2">
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-6">
          <OperationsTab />
        </TabsContent>

        <TabsContent value="equipment" className="mt-6">
          <EquipmentTab />
        </TabsContent>

        <TabsContent value="masters" className="mt-6">
          <MastersTab />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OperationsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Link href="/plant/material-receipts">
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Package className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Material Receipts</h3>
              <p className="text-sm text-muted-foreground">Record incoming materials by party/job</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/plant/dispatches">
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Truck className="w-7 h-7 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Mix Dispatches</h3>
              <p className="text-sm text-muted-foreground">Log outgoing truck loads with mix data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/plant/stock">
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Layers className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Stock Balances</h3>
              <p className="text-sm text-muted-foreground">View party-wise and plant stock</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function EquipmentTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Link href="/plant/equipment-usage">
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Gauge className="w-7 h-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Equipment Usage</h3>
              <p className="text-sm text-muted-foreground">Track meter readings and diesel consumption</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function MastersTab() {
  return (
    <div className="space-y-6">
      <PartyMaster />
      <MaterialMaster />
      <MixTemplateMaster />
      <EquipmentMasterSection />
    </div>
  );
}

function PartyMaster() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const { data: parties, isLoading } = useQuery<Party[]>({
    queryKey: ["/api/plant-module/parties"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; notes?: string }) =>
      apiRequest("POST", "/api/plant-module/parties", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Party created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; notes?: string } }) =>
      apiRequest("PATCH", `/api/plant-module/parties/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Party updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/parties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/parties"] });
      toast({ title: "Party deleted successfully" });
    },
  });

  const resetForm = () => {
    setName("");
    setNotes("");
    setEditingParty(null);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: { name, notes } });
    } else {
      createMutation.mutate({ name, notes });
    }
  };

  const openEdit = (party: Party) => {
    setEditingParty(party);
    setName(party.name);
    setNotes(party.notes || "");
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Party/Job Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-party">
              <Plus className="w-4 h-4" /> Add Party
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingParty ? "Edit Party" : "Add New Party"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="party-name">Party/Job Name</Label>
                <Input
                  id="party-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Giridhar - BC"
                  data-testid="input-party-name"
                />
              </div>
              <div>
                <Label htmlFor="party-notes">Notes (optional)</Label>
                <Textarea
                  id="party-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  data-testid="input-party-notes"
                />
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-party">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingParty ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !parties?.length ? (
          <p className="text-muted-foreground text-center py-6">No parties added yet.</p>
        ) : (
          <div className="space-y-2">
            {parties.map((party) => (
              <div key={party.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{party.name}</p>
                  {party.notes && <p className="text-sm text-muted-foreground">{party.notes}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(party)} data-testid={`button-edit-party-${party.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(party.id)} data-testid={`button-delete-party-${party.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MaterialMaster() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [defaultUom, setDefaultUom] = useState("Ton");

  const { data: materials, isLoading } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string; defaultUom: string }) =>
      apiRequest("POST", "/api/plant-module/materials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      setDialogOpen(false);
      setName("");
      setCategory("");
      toast({ title: "Material created successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/materials/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      toast({ title: "Material deleted successfully" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Material Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-material">
              <Plus className="w-4 h-4" /> Add Material
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Material</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="material-name">Material Name</Label>
                <Input
                  id="material-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., 20mm Aggregate"
                  data-testid="input-material-name"
                />
              </div>
              <div>
                <Label htmlFor="material-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-material-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aggregate">Aggregate</SelectItem>
                    <SelectItem value="Bitumen">Bitumen</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="material-uom">Default UOM</Label>
                <Select value={defaultUom} onValueChange={setDefaultUom}>
                  <SelectTrigger data-testid="select-material-uom">
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ton">Ton</SelectItem>
                    <SelectItem value="MT">MT</SelectItem>
                    <SelectItem value="Cum">Cum</SelectItem>
                    <SelectItem value="Liters">Liters</SelectItem>
                    <SelectItem value="Kgs">Kgs</SelectItem>
                    <SelectItem value="CFT">CFT</SelectItem>
                    <SelectItem value="Barrels">Barrels</SelectItem>
                    <SelectItem value="Nos">Nos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => createMutation.mutate({ name, category, defaultUom })} className="w-full" disabled={createMutation.isPending || !name.trim()} data-testid="button-save-material">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !materials?.length ? (
          <p className="text-muted-foreground text-center py-6">No materials added yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {materials.map((material) => (
              <div key={material.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{material.name}</p>
                  <p className="text-xs text-muted-foreground">{material.category} - {material.defaultUom}</p>
                </div>
                {canDelete && (
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(material.id)} data-testid={`button-delete-material-${material.id}`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MixTemplateMaster() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [mixType, setMixType] = useState("BC");
  const [bitumenPercent, setBitumenPercent] = useState("");
  const [ldoNorm, setLdoNorm] = useState("6");
  const [notes, setNotes] = useState("");
  const [aggregateProportions, setAggregateProportions] = useState<Record<number, string>>({});

  const { data: templates, isLoading } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const aggregateMaterials = materials?.filter(m => m.category === "Aggregate") || [];

  const createMutation = useMutation({
    mutationFn: (data: { 
      name: string; 
      mixType: string; 
      bitumenPercent?: number; 
      ldoNorm?: number;
      notes?: string;
      components?: { materialId: number; percent: number; uom: string }[];
    }) => apiRequest("POST", "/api/plant-module/mix-templates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Mix template created successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/mix-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      toast({ title: "Mix template deleted successfully" });
    },
  });

  const resetForm = () => {
    setName("");
    setBitumenPercent("");
    setLdoNorm("6");
    setNotes("");
    setAggregateProportions({});
  };

  // Calculate total percentage (aggregates + bitumen)
  const aggregateTotal = Object.values(aggregateProportions)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const bitumenVal = parseFloat(bitumenPercent) || 0;
  const totalPercent = aggregateTotal + bitumenVal;

  const handleCreate = () => {
    const components = Object.entries(aggregateProportions)
      .filter(([_, value]) => value && parseFloat(value) > 0)
      .map(([materialId, percent]) => ({
        materialId: parseInt(materialId),
        percent: parseFloat(percent),
        uom: "%"
      }));

    createMutation.mutate({
      name,
      mixType,
      bitumenPercent: bitumenPercent ? parseFloat(bitumenPercent) : undefined,
      ldoNorm: ldoNorm ? parseFloat(ldoNorm) : 6,
      notes,
      components
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-5 h-5" />
          Mix Template Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-mix-template">
              <Plus className="w-4 h-4" /> Add Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Mix Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., BC Standard"
                  data-testid="input-template-name"
                />
              </div>
              <div>
                <Label htmlFor="mix-type">Mix Type</Label>
                <Select value={mixType} onValueChange={setMixType}>
                  <SelectTrigger data-testid="select-mix-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MIX_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bitumen-percent">Bitumen %</Label>
                  <Input
                    id="bitumen-percent"
                    type="number"
                    step="0.1"
                    value={bitumenPercent}
                    onChange={(e) => setBitumenPercent(e.target.value)}
                    placeholder="e.g., 5.2"
                    data-testid="input-bitumen-percent"
                  />
                </div>
                <div>
                  <Label htmlFor="ldo-norm">LDO Norm (L/ton)</Label>
                  <Input
                    id="ldo-norm"
                    type="number"
                    step="0.1"
                    value={ldoNorm}
                    onChange={(e) => setLdoNorm(e.target.value)}
                    placeholder="e.g., 6"
                    data-testid="input-ldo-norm"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Aggregate Proportions (% of total mix)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {aggregateMaterials.map((mat) => (
                    <div key={mat.id} className="flex items-center gap-2">
                      <Label className="w-20 text-xs">{mat.name}</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={aggregateProportions[mat.id] || ""}
                        onChange={(e) => setAggregateProportions(prev => ({
                          ...prev,
                          [mat.id]: e.target.value
                        }))}
                        placeholder="0"
                        className="h-8"
                        data-testid={`input-aggregate-${mat.id}`}
                      />
                    </div>
                  ))}
                </div>
                <div className={`text-xs ${Math.abs(totalPercent - 100) < 0.5 ? "text-green-600" : "text-amber-600"}`}>
                  Total: {totalPercent.toFixed(1)}% (Bitumen: {bitumenVal}% + Aggregates: {aggregateTotal.toFixed(1)}%)
                  {Math.abs(totalPercent - 100) >= 0.5 && " - Should equal 100%"}
                </div>
              </div>

              <div>
                <Label htmlFor="template-notes">Notes</Label>
                <Textarea
                  id="template-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                  data-testid="input-template-notes"
                />
              </div>
              <Button 
                onClick={handleCreate} 
                className="w-full" 
                disabled={createMutation.isPending || !name.trim()}
                data-testid="button-save-template"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-center py-6">No mix templates added yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {template.mixType} - Bitumen: {template.bitumenPercent}% - LDO: {template.ldoNorm || 6} L/ton
                    {template.isStandard === 1 ? " (Standard)" : " (Job-specific)"}
                  </p>
                </div>
                {canDelete && (
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(template.id)} data-testid={`button-delete-template-${template.id}`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EquipmentMasterSection() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [equipmentType, setEquipmentType] = useState("Generator");
  const [meterType, setMeterType] = useState("hour_meter");
  const [consumptionNorm, setConsumptionNorm] = useState("");

  const { data: equipment, isLoading } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; equipmentType: string; meterType: string; consumptionNorm?: number }) =>
      apiRequest("POST", "/api/plant-module/equipment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      setDialogOpen(false);
      setName("");
      setConsumptionNorm("");
      toast({ title: "Equipment created successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/equipment/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      toast({ title: "Equipment deleted successfully" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Equipment Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-equipment">
              <Plus className="w-4 h-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Equipment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="equipment-name">Equipment Name</Label>
                <Input
                  id="equipment-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., 600 KVA Generator"
                  data-testid="input-equipment-name"
                />
              </div>
              <div>
                <Label htmlFor="equipment-type">Equipment Type</Label>
                <Select value={equipmentType} onValueChange={setEquipmentType}>
                  <SelectTrigger data-testid="select-equipment-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="meter-type">Meter Type</Label>
                <Select value={meterType} onValueChange={setMeterType}>
                  <SelectTrigger data-testid="select-meter-type">
                    <SelectValue placeholder="Select meter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour_meter">Hour Meter (hrs)</SelectItem>
                    <SelectItem value="odometer">Odometer (km)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="consumption-norm">Consumption Norm ({meterType === "hour_meter" ? "L/hr" : "L/km"})</Label>
                <Input
                  id="consumption-norm"
                  type="number"
                  step="0.1"
                  value={consumptionNorm}
                  onChange={(e) => setConsumptionNorm(e.target.value)}
                  placeholder="e.g., 50"
                  data-testid="input-consumption-norm"
                />
              </div>
              <Button 
                onClick={() => createMutation.mutate({ 
                  name, 
                  equipmentType, 
                  meterType,
                  consumptionNorm: consumptionNorm ? parseFloat(consumptionNorm) : undefined
                })} 
                className="w-full" 
                disabled={createMutation.isPending || !name.trim()}
                data-testid="button-save-equipment"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !equipment?.length ? (
          <p className="text-muted-foreground text-center py-6">No equipment added yet.</p>
        ) : (
          <div className="space-y-2">
            {equipment.map((equip) => (
              <div key={equip.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                <div>
                  <p className="font-medium">{equip.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {equip.equipmentType} - {equip.meterType === "hour_meter" ? "Hour Meter" : "Odometer"} - 
                    Norm: {equip.consumptionNorm} {equip.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                </div>
                {canDelete && (
                  <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(equip.id)} data-testid={`button-delete-equipment-${equip.id}`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterPartyId, setFilterPartyId] = useState<string>("all");

  const { data: dispatches } = useQuery<any[]>({ queryKey: ["/api/plant-module/dispatches"] });
  const { data: generatorLogs } = useQuery<any[]>({ queryKey: ["/api/plant-module/generator-logs"] });
  const { data: ldoLogs } = useQuery<any[]>({ queryKey: ["/api/plant-module/ldo-logs"] });
  const { data: stockBalances } = useQuery<any[]>({ queryKey: ["/api/plant-module/stock-balances"] });
  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: materials } = useQuery<PlantMaterial[]>({ queryKey: ["/api/plant-module/materials"] });
  const { data: stockLedger } = useQuery<any[]>({ queryKey: ["/api/plant-module/stock-ledger"] });

  const filteredDispatches = dispatches?.filter((d) => {
    if (filterPartyId !== "all" && String(d.partyId) !== filterPartyId) return false;
    if (dateFrom && d.date < dateFrom) return false;
    if (dateTo && d.date > dateTo) return false;
    return true;
  }) || [];

  const filteredGeneratorLogs = generatorLogs?.filter((l) => {
    if (dateFrom && l.date < dateFrom) return false;
    if (dateTo && l.date > dateTo) return false;
    return true;
  }) || [];

  const filteredLdoLogs = ldoLogs?.filter((l) => {
    if (dateFrom && l.date < dateFrom) return false;
    if (dateTo && l.date > dateTo) return false;
    return true;
  }) || [];

  const totalTons = filteredDispatches.reduce((sum, d) => sum + (d.loadWeight || 0), 0);
  const avgGeneratorEfficiency = filteredGeneratorLogs.length 
    ? (filteredGeneratorLogs.reduce((sum, l) => sum + (l.efficiency || 0), 0) / filteredGeneratorLogs.length).toFixed(2)
    : "N/A";
  const avgLdoEfficiency = filteredLdoLogs.length
    ? (filteredLdoLogs.reduce((sum, l) => sum + (l.efficiency || 0), 0) / filteredLdoLogs.length).toFixed(2)
    : "N/A";

  // Group dispatches by party
  const partyProduction: Record<number, { name: string; tons: number; dispatches: number }> = {};
  filteredDispatches.forEach((d) => {
    if (d.partyId) {
      if (!partyProduction[d.partyId]) {
        const party = parties?.find((p) => p.id === d.partyId);
        partyProduction[d.partyId] = { name: party?.name || `Party ${d.partyId}`, tons: 0, dispatches: 0 };
      }
      partyProduction[d.partyId].tons += d.loadWeight || 0;
      partyProduction[d.partyId].dispatches += 1;
    }
  });

  // Calculate theoretical vs actual consumption
  const theoreticalVsActual = {
    bitumen: { theoretical: 0, actual: 0 },
    ldo: { theoretical: 0, actual: 0 },
  };
  filteredDispatches.forEach((d) => {
    theoreticalVsActual.bitumen.theoretical += d.theoreticalBitumenQty || 0;
    theoreticalVsActual.bitumen.actual += d.actualBitumenQty || 0;
    theoreticalVsActual.ldo.theoretical += d.theoreticalLdoQty || 0;
    theoreticalVsActual.ldo.actual += d.actualLdoQty || 0;
  });

  // Bitumen savings/wastage
  const bitumenDiff = theoreticalVsActual.bitumen.theoretical - theoreticalVsActual.bitumen.actual;
  const ldoDiff = theoreticalVsActual.ldo.theoretical - theoreticalVsActual.ldo.actual;

  // Get material name by ID
  const getMaterialName = (id: number) => materials?.find((m) => m.id === id)?.name || `Material ${id}`;
  const getPartyName = (id: number | null) => id ? parties?.find((p) => p.id === id)?.name || `Party ${id}` : "Plant Common";

  // Critical stock check (low balance warning)
  const criticalStock = stockBalances?.filter((s) => s.balance < 10) || [];

  // Stock Movement Report - compute Opening/Received/Consumed/Closing per material
  const computeStockMovement = () => {
    if (!stockLedger || !materials) return [];
    
    // Filter ledger by party
    const partyFilteredLedger = stockLedger.filter(entry => {
      if (filterPartyId === "all") return true;
      return String(entry.partyId) === filterPartyId || entry.partyId === null;
    });

    // Entries in the selected period
    const filteredLedger = partyFilteredLedger.filter(entry => {
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo) return false;
      return true;
    });

    // Entries before the selected period (for opening balance)
    const priorLedger = dateFrom 
      ? partyFilteredLedger.filter(entry => entry.date < dateFrom)
      : [];

    // Group by material
    const movements: Record<number, { received: number; consumed: number; opening: number }> = {};
    
    // Calculate opening balance from prior period ledger
    priorLedger.forEach(entry => {
      if (!movements[entry.materialId]) movements[entry.materialId] = { received: 0, consumed: 0, opening: 0 };
      movements[entry.materialId].opening += (entry.quantityIn || 0) - (entry.quantityOut || 0);
    });

    // Calculate received and consumed in period
    filteredLedger.forEach(entry => {
      if (!movements[entry.materialId]) movements[entry.materialId] = { received: 0, consumed: 0, opening: 0 };
      movements[entry.materialId].received += entry.quantityIn || 0;
      movements[entry.materialId].consumed += entry.quantityOut || 0;
    });

    return Object.entries(movements).map(([matId, data]) => ({
      materialId: parseInt(matId),
      materialName: getMaterialName(parseInt(matId)),
      opening: data.opening,
      received: data.received,
      consumed: data.consumed,
      closing: data.opening + data.received - data.consumed,
    })).filter(m => m.received > 0 || m.consumed > 0 || m.opening > 0);
  };

  const stockMovement = computeStockMovement();

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Party / Job</Label>
              <Select value={filterPartyId} onValueChange={setFilterPartyId}>
                <SelectTrigger data-testid="select-dashboard-party">
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  {parties?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="input-dashboard-date-from" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="input-dashboard-date-to" />
            </div>
          </div>
          {(dateFrom || dateTo || filterPartyId !== "all") && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing filtered data: {filteredDispatches.length} dispatches, {filteredGeneratorLogs.length} generator logs, {filteredLdoLogs.length} LDO logs
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Production</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalTons.toFixed(1)} MT</div>
            <p className="text-xs text-muted-foreground mt-1">{filteredDispatches.length} dispatches</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Generator Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgGeneratorEfficiency} L/hr</div>
            <p className="text-xs text-muted-foreground mt-1">Average diesel consumption</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">LDO Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgLdoEfficiency} L/ton</div>
            <p className="text-xs text-muted-foreground mt-1">Target: 6 L/ton</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Bitumen Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${bitumenDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {bitumenDiff >= 0 ? '+' : ''}{bitumenDiff.toFixed(1)} kg
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {bitumenDiff >= 0 ? 'Savings vs theoretical' : 'Excess vs theoretical'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Stock Alerts */}
      {criticalStock.length > 0 && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Low Stock Warning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {criticalStock.map((s, i) => (
                <div key={i} className="px-3 py-1 rounded-md bg-red-100 dark:bg-red-900/40 text-sm">
                  {getMaterialName(s.materialId)} ({getPartyName(s.partyId)}): <span className="font-bold">{s.balance.toFixed(1)} {s.uom}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Movement Report */}
      {stockMovement.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Stock Movement Report {(dateFrom || dateTo) && "(Filtered)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">Material</th>
                    <th className="text-right py-2 px-2">Opening</th>
                    <th className="text-right py-2 px-2">Received</th>
                    <th className="text-right py-2 px-2">Consumed</th>
                    <th className="text-right py-2 px-2">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {stockMovement.map((m) => (
                    <tr key={m.materialId} className="border-b last:border-0">
                      <td className="py-2 px-2 font-medium">{m.materialName}</td>
                      <td className="text-right py-2 px-2">{m.opening.toFixed(2)}</td>
                      <td className="text-right py-2 px-2 text-green-600 dark:text-green-400">+{m.received.toFixed(2)}</td>
                      <td className="text-right py-2 px-2 text-red-600 dark:text-red-400">-{m.consumed.toFixed(2)}</td>
                      <td className="text-right py-2 px-2 font-bold">{m.closing.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Party-wise Production */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Party-wise Production
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(partyProduction).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No production data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(partyProduction).map(([id, data]) => (
                  <div key={id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                    <div>
                      <p className="font-medium">{data.name}</p>
                      <p className="text-xs text-muted-foreground">{data.dispatches} dispatches</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{data.tons.toFixed(1)} MT</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Consumption Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="w-5 h-5" />
              Consumption Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-muted/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">Bitumen</span>
                  <span className={`text-sm font-bold ${bitumenDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {bitumenDiff >= 0 ? 'SAVING' : 'EXCESS'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Theoretical</p>
                    <p className="font-bold">{theoreticalVsActual.bitumen.theoretical.toFixed(1)} kg</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Actual</p>
                    <p className="font-bold">{theoreticalVsActual.bitumen.actual.toFixed(1)} kg</p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-md bg-muted/50">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium">LDO</span>
                  <span className={`text-sm font-bold ${ldoDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ldoDiff >= 0 ? 'SAVING' : 'EXCESS'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Theoretical</p>
                    <p className="font-bold">{theoreticalVsActual.ldo.theoretical.toFixed(1)} L</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Actual</p>
                    <p className="font-bold">{theoreticalVsActual.ldo.actual.toFixed(1)} L</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity {(dateFrom || dateTo || filterPartyId !== "all") && "(Filtered)"}</CardTitle>
        </CardHeader>
        <CardContent>
          {!filteredDispatches.length && !filteredGeneratorLogs.length ? (
            <p className="text-muted-foreground text-center py-6">No activity recorded yet. Start by entering material receipts or dispatches.</p>
          ) : (
            <div className="space-y-3">
              {filteredDispatches.slice(0, 5).map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                  <Truck className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Dispatch: {d.truckNumber} - {d.loadWeight} MT</span>
                  {d.shortages && d.shortages.length > 0 && (
                    <span className="px-2 py-0.5 text-xs rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                      Stock shortage
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">{d.date}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
