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
import { ChevronLeft, Plus, Factory, Users, Package, Layers, Truck, Settings, Gauge, Droplets, ChevronRight, Loader2, Pencil, Trash2, Download, Printer, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAccess } from "@/lib/access-context";
import { PinAuth } from "@/components/PinAuth";
import type { Party, PlantMaterial, MixTemplate, EquipmentMasterType } from "@shared/schema";
import { EQUIPMENT_TYPES, METER_TYPES, MIX_TYPES } from "@shared/schema";
import { format } from "date-fns";

export default function Plant() {
  const [activeTab, setActiveTab] = useState("operations");
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [unlockedTabs, setUnlockedTabs] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { setAccess } = useAccess();

  const handleTabChange = (tab: string) => {
    // Masters and Dashboard tabs require admin PIN
    if ((tab === "masters" || tab === "dashboard") && !unlockedTabs.has(tab)) {
      setPendingTab(tab);
      setShowPinAuth(true);
      return;
    }
    setActiveTab(tab);
  };

  const handlePinSuccess = (role: "manager" | "admin") => {
    if (role === "admin" && pendingTab) {
      // Also set global access to admin so canEdit/canDelete work in Masters
      setAccess("admin");
      setUnlockedTabs(prev => {
        const newSet = new Set(Array.from(prev));
        newSet.add(pendingTab);
        return newSet;
      });
      setActiveTab(pendingTab);
      toast({ title: `${pendingTab === "masters" ? "Masters" : "Dashboard"} unlocked` });
    } else {
      toast({ title: "Admin access required", description: "Only admin PIN can access this section", variant: "destructive" });
    }
    setShowPinAuth(false);
    setPendingTab(null);
  };

  const handlePinClose = () => {
    setShowPinAuth(false);
    setPendingTab(null);
  };
  
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

      {showPinAuth && (
        <PinAuth
          targetRole="admin"
          onSuccess={handlePinSuccess}
          onClose={handlePinClose}
        />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="operations" className="gap-2" data-testid="tab-operations">
            <Truck className="w-4 h-4" />
            <span className="hidden sm:inline">Operations</span>
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-2" data-testid="tab-stock">
            <Layers className="w-4 h-4" />
            <span className="hidden sm:inline">Stock Details</span>
          </TabsTrigger>
          <TabsTrigger value="masters" className="gap-2" data-testid="tab-masters">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Masters</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2" data-testid="tab-dashboard">
            <Factory className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operations" className="mt-6">
          <OperationsTab />
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <StockDetailsTab />
        </TabsContent>

        <TabsContent value="masters" className="mt-6">
          {unlockedTabs.has("masters") ? (
            <MastersTab />
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Admin Access Required</h3>
                <p className="text-muted-foreground mb-4">Enter admin PIN to access Masters settings</p>
                <Button onClick={() => handleTabChange("masters")} data-testid="button-unlock-masters">
                  <Lock className="w-4 h-4 mr-2" /> Unlock Masters
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="mt-6">
          {unlockedTabs.has("dashboard") ? (
            <DashboardTab />
          ) : (
            <Card className="py-12">
              <CardContent className="text-center">
                <Lock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Admin Access Required</h3>
                <p className="text-muted-foreground mb-2">Enter admin PIN to access Dashboard</p>
                <Button onClick={() => handleTabChange("dashboard")} data-testid="button-unlock-dashboard">
                  <Lock className="w-4 h-4 mr-2" /> Unlock Dashboard
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OperationsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <h3 className="font-semibold text-lg">Plant Production and Dispatches</h3>
              <p className="text-sm text-muted-foreground">Log outgoing truck loads with mix data</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

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

function StockDetailsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Link href="/plant/stock">
        <Card className="hover-elevate cursor-pointer h-full">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Layers className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">Stock Balances & Ledger</h3>
              <p className="text-sm text-muted-foreground">View party-wise stock and transaction history</p>
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

  const exportToExcel = (data: Party[]) => {
    const ws = XLSX.utils.json_to_sheet(data.map(p => ({ Name: p.name, Notes: p.notes || "" })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parties");
    XLSX.writeFile(wb, "parties.xlsx");
    toast({ title: "Exported to Excel" });
  };

  const handlePrint = () => {
    window.print();
  };

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
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Party/Job Master
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => parties && exportToExcel(parties)} disabled={!parties?.length} data-testid="button-export-parties">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handlePrint} data-testid="button-print-parties">
            <Printer className="w-4 h-4" /> Print
          </Button>
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
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., GIRIDHAR - BC"
                  data-testid="input-party-name"
                />
              </div>
              <div>
                <Label htmlFor="party-notes">Notes (optional)</Label>
                <Textarea
                  id="party-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.toUpperCase())}
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
        </div>
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
  const [editingMaterial, setEditingMaterial] = useState<PlantMaterial | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [defaultUom, setDefaultUom] = useState("Ton");

  const exportToExcel = (data: PlantMaterial[]) => {
    const ws = XLSX.utils.json_to_sheet(data.map(m => ({ Name: m.name, Category: m.category || "", UOM: m.defaultUom })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    XLSX.writeFile(wb, "materials.xlsx");
    toast({ title: "Exported to Excel" });
  };

  const { data: materials, isLoading } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; category?: string; defaultUom: string }) =>
      apiRequest("POST", "/api/plant-module/materials", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      resetForm();
      toast({ title: "Material created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; category?: string; defaultUom: string }> }) =>
      apiRequest("PATCH", `/api/plant-module/materials/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      resetForm();
      toast({ title: "Material updated successfully" });
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

  const resetForm = () => {
    setDialogOpen(false);
    setEditingMaterial(null);
    setName("");
    setCategory("");
    setDefaultUom("Ton");
  };

  const openEdit = (material: PlantMaterial) => {
    setEditingMaterial(material);
    setName(material.name);
    setCategory(material.category || "");
    setDefaultUom(material.defaultUom || "Ton");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editingMaterial) {
      updateMutation.mutate({ id: editingMaterial.id, data: { name, category, defaultUom } });
    } else {
      createMutation.mutate({ name, category, defaultUom });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          Material Master
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => materials && exportToExcel(materials)} disabled={!materials?.length} data-testid="button-export-materials">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" data-testid="button-add-material">
                <Plus className="w-4 h-4" /> Add Material
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingMaterial ? "Edit Material" : "Add New Material"}</DialogTitle>
              </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="material-name">Material Name</Label>
                <Input
                  id="material-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., 20MM AGGREGATE"
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
              <Button onClick={handleSubmit} className="w-full" disabled={createMutation.isPending || updateMutation.isPending || !name.trim()} data-testid="button-save-material">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingMaterial ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
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
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(material)} data-testid={`button-edit-material-${material.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(material.id)} data-testid={`button-delete-material-${material.id}`}>
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

type MixTemplateComponent = {
  id: number;
  templateId: number;
  materialId: number;
  percent: number | null;
  uom: string;
};

function MixTemplateMaster() {
  const { toast } = useToast();
  const { canEdit, canDelete } = useAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MixTemplate | null>(null);
  const [name, setName] = useState("");
  const [mixType, setMixType] = useState("BC");
  const [bitumenPercent, setBitumenPercent] = useState("");
  const [ldoNorm, setLdoNorm] = useState("6");
  const [notes, setNotes] = useState("");
  const [aggregateProportions, setAggregateProportions] = useState<Record<number, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: templates, isLoading } = useQuery<MixTemplate[]>({
    queryKey: ["/api/plant-module/mix-templates"],
  });

  const { data: materials } = useQuery<PlantMaterial[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: allComponents } = useQuery<MixTemplateComponent[]>({
    queryKey: ["/api/plant-module/mix-template-components"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Mix template created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { 
      name?: string; 
      mixType?: string; 
      bitumenPercent?: number; 
      ldoNorm?: number;
      notes?: string;
      components?: { materialId: number; percent: number; uom: string }[];
    }}) => apiRequest("PATCH", `/api/plant-module/mix-templates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Mix template updated successfully" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/plant-module/mix-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/mix-template-components"] });
      setDeleteConfirmId(null);
      toast({ title: "Mix template deleted successfully" });
    },
  });

  const resetForm = () => {
    setEditingTemplate(null);
    setName("");
    setMixType("BC");
    setBitumenPercent("");
    setLdoNorm("6");
    setNotes("");
    setAggregateProportions({});
  };

  const openEdit = (template: MixTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setMixType(template.mixType);
    setBitumenPercent(template.bitumenPercent?.toString() || "");
    setLdoNorm(template.ldoNorm?.toString() || "6");
    setNotes(template.notes || "");
    // Load components for this template
    const templateComponents = allComponents?.filter(c => c.templateId === template.id) || [];
    const proportions: Record<number, string> = {};
    templateComponents.forEach(c => {
      proportions[c.materialId] = c.percent?.toString() || "";
    });
    setAggregateProportions(proportions);
    setDialogOpen(true);
  };

  const getMaterialName = (id: number) => materials?.find(m => m.id === id)?.name || "Unknown";

  // Calculate total percentage (aggregates + bitumen)
  const aggregateTotal = Object.values(aggregateProportions)
    .reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const bitumenVal = parseFloat(bitumenPercent) || 0;
  const totalPercent = aggregateTotal + bitumenVal;

  const handleSubmit = () => {
    const components = Object.entries(aggregateProportions)
      .filter(([_, value]) => value && parseFloat(value) > 0)
      .map(([materialId, percent]) => ({
        materialId: parseInt(materialId),
        percent: parseFloat(percent),
        uom: "%"
      }));

    const data = {
      name,
      mixType,
      bitumenPercent: bitumenPercent ? parseFloat(bitumenPercent) : undefined,
      ldoNorm: ldoNorm ? parseFloat(ldoNorm) : 6,
      notes,
      components
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data });
    } else {
      createMutation.mutate(data);
    }
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
              <DialogTitle>{editingTemplate ? "Edit Mix Template" : "Add Mix Template"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., BC STANDARD"
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
                onClick={handleSubmit} 
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
                data-testid="button-save-template"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this mix template?</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-center py-6">No mix templates added yet.</p>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => {
              const templateComponents = allComponents?.filter(c => c.templateId === template.id) || [];
              return (
                <div key={template.id} className="p-3 rounded-md bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {template.mixType} - Bitumen: {template.bitumenPercent}% - LDO: {template.ldoNorm || 6} L/ton
                        {template.isStandard === 1 ? " (Standard)" : " (Job-specific)"}
                      </p>
                      {template.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Created: {format(new Date(template.createdAt), "dd-MMM-yyyy HH:mm")}
                        </p>
                      )}
                      {templateComponents.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Aggregates:</span>{" "}
                          {templateComponents.map((c, idx) => (
                            <span key={c.id}>
                              {getMaterialName(c.materialId)}: {c.percent}%{idx < templateComponents.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(template)} data-testid={`button-edit-template-${template.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(template.id)} data-testid={`button-delete-template-${template.id}`}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
  const [editingEquipment, setEditingEquipment] = useState<EquipmentMasterType | null>(null);
  const [name, setName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [equipmentType, setEquipmentType] = useState("Generator");
  const [meterType, setMeterType] = useState("hour_meter");
  const [consumptionNorm, setConsumptionNorm] = useState("");

  const { data: equipment, isLoading } = useQuery<EquipmentMasterType[]>({
    queryKey: ["/api/plant-module/equipment"],
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; registrationNumber?: string; equipmentType: string; meterType: string; consumptionNorm?: number }) =>
      apiRequest("POST", "/api/plant-module/equipment", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      resetForm();
      toast({ title: "Equipment created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; registrationNumber?: string; equipmentType: string; meterType: string; consumptionNorm?: number }> }) =>
      apiRequest("PATCH", `/api/plant-module/equipment/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/equipment"] });
      resetForm();
      toast({ title: "Equipment updated successfully" });
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

  const resetForm = () => {
    setDialogOpen(false);
    setEditingEquipment(null);
    setName("");
    setRegistrationNumber("");
    setEquipmentType("Generator");
    setMeterType("hour_meter");
    setConsumptionNorm("");
  };

  const openEdit = (equip: EquipmentMasterType) => {
    setEditingEquipment(equip);
    setName(equip.name);
    setRegistrationNumber((equip as any).registrationNumber || "");
    setEquipmentType(equip.equipmentType);
    setMeterType(equip.meterType);
    setConsumptionNorm(equip.consumptionNorm?.toString() || "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const data = {
      name,
      registrationNumber: registrationNumber || undefined,
      equipmentType,
      meterType,
      consumptionNorm: consumptionNorm ? parseFloat(consumptionNorm) : undefined
    };
    if (editingEquipment) {
      updateMutation.mutate({ id: editingEquipment.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Gauge className="w-5 h-5" />
          Equipment Master
        </CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-add-equipment">
              <Plus className="w-4 h-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEquipment ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="equipment-name">Equipment Name</Label>
                <Input
                  id="equipment-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  placeholder="e.g., 600 KVA GENERATOR"
                  data-testid="input-equipment-name"
                />
              </div>
              <div>
                <Label htmlFor="registration-number">Registration / ID Number</Label>
                <Input
                  id="registration-number"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value.toUpperCase())}
                  placeholder="e.g., MH12AB1234"
                  data-testid="input-registration-number"
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
                onClick={handleSubmit}
                className="w-full" 
                disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
                data-testid="button-save-equipment"
              >
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : editingEquipment ? "Update" : "Create"}
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
                    {(equip as any).registrationNumber && <span className="font-medium">{(equip as any).registrationNumber} | </span>}
                    {equip.equipmentType} | {equip.meterType === "hour_meter" ? "Hour Meter" : "Odometer"} | 
                    Norm: {equip.consumptionNorm} {equip.meterType === "hour_meter" ? "L/hr" : "L/km"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(equip)} data-testid={`button-edit-equipment-${equip.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {canDelete && (
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(equip.id)} data-testid={`button-delete-equipment-${equip.id}`}>
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

function DashboardTab() {
  const { toast } = useToast();
  
  // PIN auth state for per-action authentication
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuthTarget, setPinAuthTarget] = useState<"admin" | "manager">("admin");
  const [pendingAction, setPendingAction] = useState<{ type: "export-excel" | "export-pdf" | "print" } | null>(null);

  // KPI date range (separate from table filters)
  const [kpiDateFrom, setKpiDateFrom] = useState("");
  const [kpiDateTo, setKpiDateTo] = useState("");

  // Table filters (separate from KPI)
  const [tableDateFrom, setTableDateFrom] = useState("");
  const [tableDateTo, setTableDateTo] = useState("");
  const [tablePartyId, setTablePartyId] = useState<string>("all");
  const [tableSite, setTableSite] = useState<string>("all");
  const [tableMixType, setTableMixType] = useState<string>("all");
  const [tableVehicle, setTableVehicle] = useState<string>("all");

  const { data: dispatches } = useQuery<any[]>({ queryKey: ["/api/plant-module/dispatches"] });
  const { data: equipmentUsage } = useQuery<any[]>({ queryKey: ["/api/plant-module/equipment-usage"] });
  const { data: parties } = useQuery<Party[]>({ queryKey: ["/api/plant-module/parties"] });
  const { data: mixTemplates } = useQuery<MixTemplate[]>({ queryKey: ["/api/plant-module/mix-templates"] });

  // KPI filtered data (only by KPI date range)
  const kpiFilteredDispatches = dispatches?.filter((d) => {
    if (kpiDateFrom && d.date < kpiDateFrom) return false;
    if (kpiDateTo && d.date > kpiDateTo) return false;
    return true;
  }) || [];

  const kpiFilteredEquipment = equipmentUsage?.filter((e) => {
    if (kpiDateFrom && e.date < kpiDateFrom) return false;
    if (kpiDateTo && e.date > kpiDateTo) return false;
    return true;
  }) || [];

  // Helper to get mix type from dispatch
  const getDispatchMixType = (d: any) => {
    const template = mixTemplates?.find(m => m.id === d.mixTemplateId);
    return template?.mixType || "";
  };

  // Table filtered data (by all table filters)
  const tableFilteredDispatches = dispatches?.filter((d) => {
    if (tableDateFrom && d.date < tableDateFrom) return false;
    if (tableDateTo && d.date > tableDateTo) return false;
    if (tablePartyId !== "all" && String(d.partyId) !== tablePartyId) return false;
    if (tableSite !== "all" && d.deliveryLocation !== tableSite) return false;
    if (tableMixType !== "all" && getDispatchMixType(d) !== tableMixType) return false;
    if (tableVehicle !== "all" && d.truckNumber !== tableVehicle) return false;
    return true;
  }) || [];

  // Get unique values for filters
  const uniqueSites = Array.from(new Set(dispatches?.map(d => d.deliveryLocation).filter(Boolean) || []));
  const uniqueVehicles = Array.from(new Set(dispatches?.map(d => d.truckNumber).filter(Boolean) || []));

  // KPI calculations
  const totalTons = kpiFilteredDispatches.reduce((sum, d) => sum + (d.loadWeight || 0), 0);
  const totalTrips = kpiFilteredDispatches.length;
  const totalDieselConsumed = kpiFilteredEquipment.reduce((sum, e) => sum + (e.dieselConsumed || 0), 0);
  const totalHoursRun = kpiFilteredEquipment.reduce((sum, e) => sum + (e.hoursRun || 0), 0);
  const dieselEfficiency = totalHoursRun > 0 ? (totalDieselConsumed / totalHoursRun).toFixed(2) : "N/A";

  const theoreticalVsActual = {
    bitumen: { theoretical: 0, actual: 0 },
    ldo: { theoretical: 0, actual: 0 },
  };
  kpiFilteredDispatches.forEach((d) => {
    theoreticalVsActual.bitumen.theoretical += d.theoreticalBitumenQty || 0;
    theoreticalVsActual.bitumen.actual += d.actualBitumenQty || 0;
    theoreticalVsActual.ldo.theoretical += d.theoreticalLdoQty || 0;
    theoreticalVsActual.ldo.actual += d.actualLdoQty || 0;
  });

  const LDO_NORM = 6;
  const actualLdoPerTon = totalTons > 0 ? theoreticalVsActual.ldo.actual / totalTons : 0;
  const ldoVariance = LDO_NORM - actualLdoPerTon;
  const totalBitumenConsumed = theoreticalVsActual.bitumen.actual;

  // Helper functions
  const getPartyName = (id: number | null) => id ? parties?.find((p) => p.id === id)?.name?.toUpperCase() || `PARTY ${id}` : "";
  const getMixType = (id: number | null) => {
    if (!id) return "";
    const template = mixTemplates?.find((m) => m.id === id);
    return template?.mixType?.toUpperCase() || `MIX ${id}`;
  };

  // Table subtotals
  const subtotalTons = tableFilteredDispatches.reduce((sum, d) => sum + (d.loadWeight || 0), 0);
  const subtotalBitumen = tableFilteredDispatches.reduce((sum, d) => sum + (d.actualBitumenQty || 0), 0); // Already in MT
  const subtotalLdo = tableFilteredDispatches.reduce((sum, d) => sum + (d.actualLdoQty || 0), 0);
  const subtotalTrips = tableFilteredDispatches.length;

  // Build filename with date range and filters
  const buildFilename = (extension: string) => {
    const timestamp = format(new Date(), "yyyyMMdd_HHmm");
    const fromDate = tableDateFrom || "All";
    const toDate = tableDateTo || "All";
    const partyFilter = tablePartyId !== "all" ? getPartyName(Number(tablePartyId)).replace(/\s+/g, '') : "";
    const siteFilter = tableSite !== "all" ? tableSite.replace(/\s+/g, '') : "";
    const mixFilter = tableMixType !== "all" ? tableMixType.replace(/\s+/g, '') : "";
    const filters = [partyFilter, siteFilter, mixFilter].filter(Boolean).join("_");
    return `SiteLog_Plant_Dashboard_${fromDate}_to_${toDate}${filters ? "_" + filters : ""}_${timestamp}.${extension}`;
  };

  // Universal download function for all devices including iPad
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  // Export functions
  const exportToExcel = async () => {
    try {
      const headerRows = [
        ["PLANT DISPATCH SUMMARY REPORT"],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Date Range: ${tableDateFrom || "All"} to ${tableDateTo || "All"}`],
        [`Filters: Party: ${tablePartyId === "all" ? "All" : getPartyName(Number(tablePartyId))}, Site: ${tableSite === "all" ? "All" : tableSite}, Mix: ${tableMixType === "all" ? "All" : tableMixType}, Vehicle: ${tableVehicle === "all" ? "All" : tableVehicle}`],
        [],
        ["DISPATCH DATE & TIME", "PARTY", "SITE", "MIX TYPE", "LOAD / TONS (MT)", "VEHICLE NO", "BITUMEN CONSUMED (MT)", "LDO CONSUMED (L)"]
      ];

      const dataRows = tableFilteredDispatches.map(d => [
        `${d.date} ${d.time || ""}`.trim().toUpperCase(),
        getPartyName(d.partyId),
        (d.deliveryLocation || "").toUpperCase(),
        getMixType(d.mixTemplateId),
        d.loadWeight?.toFixed(2) || "0.00",
        (d.truckNumber || "").toUpperCase(),
        (d.actualBitumenQty || 0).toFixed(3),
        (d.actualLdoQty || 0).toFixed(1)
      ]);

      const totalRows = [
        [],
        ["TOTALS", "", "", "", subtotalTons.toFixed(2), `${subtotalTrips} TRIPS`, subtotalBitumen.toFixed(3), subtotalLdo.toFixed(1)]
      ];

      const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows, ...totalRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dispatch Summary");
      
      const filename = buildFilename("xlsx");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Excel Files',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          const writable = await handle.createWritable();
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          await writable.write(buffer);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerDownload(blob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const exportToPdf = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      await import("jspdf-autotable");
      
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const headers = [["DATE/TIME", "PARTY", "SITE", "MIX", "LOAD", "VEHICLE", "BITUMEN", "LDO"]];
      const data = tableFilteredDispatches.map(d => [
        `${d.date} ${d.time || ""}`.trim(),
        getPartyName(d.partyId),
        (d.deliveryLocation || ""),
        getMixType(d.mixTemplateId),
        d.loadWeight?.toFixed(2) || "0.00",
        (d.truckNumber || ""),
        (d.actualBitumenQty || 0).toFixed(3),
        (d.actualLdoQty || 0).toFixed(1)
      ]);

      let currentPage = 1;
      const addHeader = () => {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("PLANT DISPATCH SUMMARY REPORT", pageWidth / 2, 15, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Date Range: ${tableDateFrom || "All"} to ${tableDateTo || "All"}`, 14, 22);
      };

      const addFooter = (pageNum: number, totalPages: number) => {
        doc.setFontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, pageHeight - 10);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 30, pageHeight - 10);
      };

      (doc as any).autoTable({
        head: headers,
        body: data,
        startY: 28,
        theme: "grid",
        headStyles: { fillColor: [50, 50, 50], textColor: 255, fontSize: 7, fontStyle: "bold" },
        bodyStyles: { fontSize: 7 },
        margin: { top: 28, bottom: 25, left: 10, right: 10 },
        didDrawPage: () => {
          addHeader();
          currentPage++;
        },
      });

      const finalY = (doc as any).lastAutoTable.finalY || 100;
      if (finalY + 20 > pageHeight - 25) {
        doc.addPage();
        addHeader();
      }

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const subtotalY = Math.min(finalY + 10, pageHeight - 30);
      doc.text(`TOTALS: ${subtotalTrips} TRIPS | ${subtotalTons.toFixed(2)} MT | BITUMEN: ${subtotalBitumen.toFixed(3)} MT | LDO: ${subtotalLdo.toFixed(1)} L`, 14, subtotalY);

      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      const filename = buildFilename("pdf");
      
      // Try File System Access API for save dialog (Chrome/Edge desktop)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'PDF Files',
              accept: { 'application/pdf': ['.pdf'] }
            }]
          });
          const writable = await handle.createWritable();
          const pdfBlob = doc.output('blob');
          await writable.write(pdfBlob);
          await writable.close();
          toast({ title: "File saved successfully" });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }
      
      // Standard download for Safari, mobile, and other browsers
      const pdfBlob = doc.output('blob');
      triggerDownload(pdfBlob, filename);
      toast({ title: "File download started", description: "Check your Downloads or Files app." });
    } catch (err) {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    }
  };
  
  const handlePrint = () => {
    // Create a printable version formatted for A4 portrait
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Plant Dispatch Summary Report</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 0; margin: 0; font-size: 10px; }
            .header { margin-bottom: 15px; }
            h1 { color: #333; margin: 0 0 5px 0; font-size: 16px; }
            .date { color: #666; margin: 0; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #ccc; padding: 4px 3px; text-align: left; font-size: 8px; }
            th { background-color: #f0f0f0; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .totals { margin-top: 15px; font-weight: bold; font-size: 10px; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="company-header" style="text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 12px;">
            <img src="${window.location.origin}/hlc-logo.jpg" style="height: 50px; margin-bottom: 5px;" onerror="this.style.display='none'" />
            <h2 style="margin: 0; font-size: 14px; font-weight: bold;">High Lane Constructions Pvt Ltd</h2>
          </div>
          <div class="header">
            <h1>Plant Dispatch Summary Report</h1>
            <p class="date">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")} | Range: ${tableDateFrom || "All"} to ${tableDateTo || "All"}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date/Time</th>
                <th>Party</th>
                <th>Site</th>
                <th>Mix</th>
                <th>Load (MT)</th>
                <th>Vehicle</th>
                <th>Bitumen (MT)</th>
                <th>LDO (L)</th>
              </tr>
            </thead>
            <tbody>
              ${tableFilteredDispatches.map(d => `
                <tr>
                  <td>${d.date} ${d.time || ''}</td>
                  <td>${getPartyName(d.partyId)}</td>
                  <td>${d.deliveryLocation || '-'}</td>
                  <td>${getMixType(d.mixTemplateId)}</td>
                  <td>${d.loadWeight?.toFixed(2) || '0.00'}</td>
                  <td>${d.truckNumber || '-'}</td>
                  <td>${(d.actualBitumenQty || 0).toFixed(3)}</td>
                  <td>${(d.actualLdoQty || 0).toFixed(1)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totals">
            TOTALS: ${subtotalTrips} TRIPS | ${subtotalTons.toFixed(2)} MT | BITUMEN: ${subtotalBitumen.toFixed(3)} MT | LDO: ${subtotalLdo.toFixed(1)} L
          </div>
        </body>
      </html>
    `;
    
    // Use iframe with srcdoc - attach onload BEFORE setting srcdoc for Safari compatibility
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';
    
    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        window.print();
      }
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    };
    
    // Attach onload BEFORE adding to DOM and setting srcdoc
    iframe.onload = () => setTimeout(doPrint, 100);
    document.body.appendChild(iframe);
    iframe.srcdoc = printContent;
    
    // Fallback timeout in case onload doesn't fire
    setTimeout(() => {
      if (!printed) doPrint();
    }, 2000);
  };

  // Per-action PIN authentication handlers
  const requestPinAuth = (action: typeof pendingAction) => {
    setPendingAction(action);
    setPinAuthTarget("admin"); // All plant module export actions require admin PIN
    setShowPinAuth(true);
  };

  const handlePinSuccess = (role: "manager" | "admin", pin: string) => {
    setShowPinAuth(false);
    if (!pendingAction) return;

    switch (pendingAction.type) {
      case "export-excel":
        exportToExcel();
        break;
      case "export-pdf":
        exportToPdf();
        break;
      case "print":
        handlePrint();
        break;
    }
    setPendingAction(null);
  };

  const handleExportExcelClick = () => {
    requestPinAuth({ type: "export-excel" });
  };

  const handleExportPdfClick = () => {
    requestPinAuth({ type: "export-pdf" });
  };

  const handlePrintClick = () => {
    requestPinAuth({ type: "print" });
  };

  return (
    <div className="space-y-6">
      {/* KPI Date Range Selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">KPI DATE RANGE</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">FROM DATE</Label>
              <Input type="date" value={kpiDateFrom} onChange={(e) => setKpiDateFrom(e.target.value)} data-testid="input-kpi-date-from" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">TO DATE</Label>
              <Input type="date" value={kpiDateTo} onChange={(e) => setKpiDateTo(e.target.value)} data-testid="input-kpi-date-to" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">TOTAL PRODUCTION</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTons.toFixed(1)} MT</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">TOTAL TRIPS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTrips}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">GENERATOR EFFICIENCY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dieselEfficiency} L/HR</div>
            <p className="text-xs text-muted-foreground">{totalDieselConsumed.toFixed(0)}L / {totalHoursRun.toFixed(1)} HRS</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">LDO EFFICIENCY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${actualLdoPerTon <= LDO_NORM ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalTons > 0 ? actualLdoPerTon.toFixed(2) : "N/A"} L/TON
            </div>
            <p className="text-xs text-muted-foreground">TARGET: {LDO_NORM} L/TON</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">BITUMEN CONSUMED</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalBitumenConsumed / 1000).toFixed(2)} MT</div>
            <p className="text-xs text-muted-foreground">{totalBitumenConsumed.toFixed(0)} KG</p>
          </CardContent>
        </Card>
      </div>

      {/* PinAuth Modal */}
      {showPinAuth && (
        <PinAuth
          targetRole={pinAuthTarget}
          onSuccess={handlePinSuccess}
          onClose={() => {
            setShowPinAuth(false);
            setPendingAction(null);
          }}
        />
      )}

      {/* Dispatch Summary Section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>DISPATCH SUMMARY</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportExcelClick} data-testid="button-export-excel">
                <Download className="w-4 h-4 mr-1" />
                EXPORT EXCEL
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdfClick} data-testid="button-export-pdf">
                <Printer className="w-4 h-4 mr-1" />
                EXPORT PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrintClick} data-testid="button-print">
                <Printer className="w-4 h-4 mr-1" />
                PRINT
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Table Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 p-3 bg-muted/30 rounded-md">
            <div>
              <Label className="text-xs text-muted-foreground">DATE FROM</Label>
              <Input type="date" value={tableDateFrom} onChange={(e) => setTableDateFrom(e.target.value)} data-testid="input-table-date-from" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">DATE TO</Label>
              <Input type="date" value={tableDateTo} onChange={(e) => setTableDateTo(e.target.value)} data-testid="input-table-date-to" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">PARTY</Label>
              <Select value={tablePartyId} onValueChange={setTablePartyId}>
                <SelectTrigger data-testid="select-table-party" className="h-8 text-sm">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  {parties?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name?.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">SITE</Label>
              <Select value={tableSite} onValueChange={setTableSite}>
                <SelectTrigger data-testid="select-table-site" className="h-8 text-sm">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  {uniqueSites.map((site) => (
                    <SelectItem key={site} value={site}>{site.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">MIX TYPE</Label>
              <Select value={tableMixType} onValueChange={setTableMixType}>
                <SelectTrigger data-testid="select-table-mix" className="h-8 text-sm">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  {MIX_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">VEHICLE NO</Label>
              <Select value={tableVehicle} onValueChange={setTableVehicle}>
                <SelectTrigger data-testid="select-table-vehicle" className="h-8 text-sm">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  {uniqueVehicles.map((v) => (
                    <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scrollable Table */}
          <div className="border rounded-md">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="border-b">
                    <th className="text-left py-3 px-3 font-bold whitespace-nowrap">DISPATCH DATE & TIME</th>
                    <th className="text-left py-3 px-3 font-bold whitespace-nowrap">PARTY</th>
                    <th className="text-left py-3 px-3 font-bold whitespace-nowrap">SITE</th>
                    <th className="text-left py-3 px-3 font-bold whitespace-nowrap">MIX TYPE</th>
                    <th className="text-right py-3 px-3 font-bold whitespace-nowrap">LOAD / TONS (MT)</th>
                    <th className="text-left py-3 px-3 font-bold whitespace-nowrap">VEHICLE NO</th>
                    <th className="text-right py-3 px-3 font-bold whitespace-nowrap">BITUMEN CONSUMED (MT)</th>
                    <th className="text-right py-3 px-3 font-bold whitespace-nowrap">LDO CONSUMED (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {tableFilteredDispatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-muted-foreground">NO DISPATCHES FOUND</td>
                    </tr>
                  ) : (
                    tableFilteredDispatches.map((d, i) => (
                      <tr key={d.id || i} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-dispatch-${d.id || i}`}>
                        <td className="py-2 px-3 whitespace-nowrap">{`${d.date} ${d.time || ""}`.trim().toUpperCase()}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{getPartyName(d.partyId)}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{(d.deliveryLocation || "").toUpperCase()}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{getMixType(d.mixTemplateId)}</td>
                        <td className="py-2 px-3 text-right font-medium whitespace-nowrap">{d.loadWeight?.toFixed(2) || "0.00"}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{(d.truckNumber || "").toUpperCase()}</td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">{(d.actualBitumenQty || 0).toFixed(3)}</td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">{(d.actualLdoQty || 0).toFixed(1)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-muted/70 border-t-2 border-foreground/20 sticky bottom-0">
                  <tr>
                    <td className="py-3 px-3 font-bold whitespace-nowrap">SUBTOTALS</td>
                    <td className="py-3 px-3 whitespace-nowrap"></td>
                    <td className="py-3 px-3 whitespace-nowrap"></td>
                    <td className="py-3 px-3 whitespace-nowrap">{subtotalTrips} TRIPS</td>
                    <td className="py-3 px-3 text-right font-bold whitespace-nowrap">{subtotalTons.toFixed(2)}</td>
                    <td className="py-3 px-3 whitespace-nowrap"></td>
                    <td className="py-3 px-3 text-right font-bold whitespace-nowrap">{subtotalBitumen.toFixed(3)}</td>
                    <td className="py-3 px-3 text-right font-bold whitespace-nowrap">{subtotalLdo.toFixed(1)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
