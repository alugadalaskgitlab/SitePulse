import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Package, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { RmcRawMaterialReceipt } from "@shared/schema";

const today = new Date().toISOString().slice(0, 10);
const CATEGORIES = ["Cement", "Fine Aggregate", "Coarse Aggregate 10mm", "Coarse Aggregate 20mm", "Admixture", "Water", "Other"];
const UOMS = ["MT", "kg", "L", "m³", "Bag", "Nos"];

function defaultForm() {
  return {
    date: today,
    plantName: "Main Plant",
    materialName: "",
    category: "",
    qty: "",
    uom: "MT",
    supplier: "",
    vehicleNumber: "",
    challanNumber: "",
    notes: "",
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  "Cement": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  "Fine Aggregate": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Coarse Aggregate 10mm": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "Coarse Aggregate 20mm": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "Admixture": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "Water": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const ALL_PLANTS = "__ALL__";

export default function RmcRawMaterials() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canCreate = sectionCan("plant_materials", "create");
  const canEdit = sectionCan("plant_materials", "edit");

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm());
  const [dateFrom, setDateFrom] = useState(() => localStorage.getItem("rmc_materials_date_from") ?? today);
  const [dateTo, setDateTo] = useState(() => localStorage.getItem("rmc_materials_date_to") ?? today);
  const [plantSelect, setPlantSelect] = useState(() => localStorage.getItem("rmc_plant_filter") ?? ALL_PLANTS);
  const plantName = plantSelect === ALL_PLANTS ? "" : plantSelect;

  function handlePlantChange(value: string) {
    setPlantSelect(value);
    localStorage.setItem("rmc_plant_filter", value);
  }

  const { data: plantNames = [] } = useQuery<string[]>({
    queryKey: ["/api/rmc/plants"],
    queryFn: () => apiRequest("GET", "/api/rmc/plants").then(r => r.json()),
  });

  const plantParam = plantName ? `&plantName=${encodeURIComponent(plantName)}` : "";

  const { data: receipts = [], isLoading } = useQuery<RmcRawMaterialReceipt[]>({
    queryKey: ["/api/rmc/raw-materials", dateFrom, dateTo, plantName],
    queryFn: () =>
      apiRequest("GET", `/api/rmc/raw-materials?dateFrom=${dateFrom}&dateTo=${dateTo}${plantParam}`)
        .then(r => r.json()),
  });

  const { data: stockSummary = [] } = useQuery<{ materialName: string; category: string; totalReceived: number; totalConsumed: number; balance: number; uom: string; balanceKg: number | null }[]>({
    queryKey: ["/api/rmc/stock-summary", plantName],
    queryFn: () =>
      apiRequest("GET", `/api/rmc/stock-summary${plantName ? `?plantName=${encodeURIComponent(plantName)}` : ""}`)
        .then(r => r.json()),
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = editingId
        ? await apiRequest("PATCH", `/api/rmc/raw-materials/${editingId}`, payload)
        : await apiRequest("POST", "/api/rmc/raw-materials", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/raw-materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/stock-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/plants"] });
      toast({ title: editingId ? "Receipt updated" : "Receipt recorded" });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/rmc/raw-materials/${id}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/raw-materials"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rmc/stock-summary"] });
      toast({ title: "Receipt deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm());
    setOpen(true);
  }

  function openEdit(r: RmcRawMaterialReceipt) {
    setEditingId(r.id);
    setForm({
      date: r.date,
      plantName: r.plantName,
      materialName: r.materialName,
      category: r.category ?? "",
      qty: r.qty.toString(),
      uom: r.uom,
      supplier: r.supplier ?? "",
      vehicleNumber: r.vehicleNumber ?? "",
      challanNumber: r.challanNumber ?? "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.materialName.trim()) return toast({ title: "Material name required", variant: "destructive" });
    upsertMutation.mutate({
      date: form.date,
      plantName: form.plantName,
      materialName: form.materialName.trim(),
      category: form.category || null,
      qty: Number(form.qty),
      uom: form.uom,
      supplier: form.supplier || null,
      vehicleNumber: form.vehicleNumber || null,
      challanNumber: form.challanNumber || null,
      notes: form.notes || null,
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/plant">
            <Button variant="ghost" size="icon" data-testid="btn-back"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">RMC Raw Material Receipts</h1>
            <p className="text-sm text-muted-foreground">Track incoming cement, aggregates, admixtures & other materials</p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={openCreate} data-testid="btn-add-receipt">
            <Plus className="w-4 h-4 mr-2" />Add Receipt
          </Button>
        )}
      </div>

      <Tabs defaultValue="receipts">
        <TabsList>
          <TabsTrigger value="receipts" className="gap-2"><Package className="w-4 h-4" />Receipts</TabsTrigger>
          <TabsTrigger value="stock" className="gap-2"><BarChart3 className="w-4 h-4" />Stock Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="receipts" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); localStorage.setItem("rmc_materials_date_from", e.target.value); }} className="w-36" data-testid="input-date-from" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); localStorage.setItem("rmc_materials_date_to", e.target.value); }} className="w-36" data-testid="input-date-to" />
            {plantNames.length > 0 && (
              <Select value={plantSelect} onValueChange={handlePlantChange}>
                <SelectTrigger className="w-40" data-testid="select-plant-name">
                  <SelectValue placeholder="All plants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PLANTS}>All plants</SelectItem>
                  {plantNames.map(name => (
                    <SelectItem key={name} value={name} data-testid={`option-plant-${name}`}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : receipts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <Package className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground">No receipts for this period.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {receipts.map(r => (
                <Card key={r.id} data-testid={`card-receipt-${r.id}`}>
                  <CardContent className="p-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.materialName}</span>
                        {r.category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[r.category] ?? "bg-muted text-muted-foreground"}`}>
                            {r.category}
                          </span>
                        )}
                        <span className="font-bold text-green-700 dark:text-green-400">{r.qty} {r.uom}</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">
                        <span>{r.date}</span>
                        {r.supplier && <span>{r.supplier}</span>}
                        {r.vehicleNumber && <span>🚚 {r.vehicleNumber}</span>}
                        {r.challanNumber && <span>Challan: {r.challanNumber}</span>}
                      </div>
                      {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                    </div>
                    <div className="flex gap-2">
                      {canEdit && (
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)} data-testid={`btn-edit-receipt-${r.id}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {isAdmin && (
                        <Button
                          variant="outline" size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm("Delete this receipt?")) deleteMutation.mutate(r.id); }}
                          data-testid={`btn-delete-receipt-${r.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-4">
          {plantNames.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={plantSelect} onValueChange={handlePlantChange}>
                <SelectTrigger className="w-40" data-testid="select-plant-name-stock">
                  <SelectValue placeholder="All plants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PLANTS}>All plants</SelectItem>
                  {plantNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {stockSummary.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <BarChart3 className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground">No stock data yet. Record material receipts first.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stockSummary.map((s, i) => (
                <Card key={i} data-testid={`card-stock-${i}`} className={s.balance < 0 ? "border-red-300 dark:border-red-700" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{s.materialName}</p>
                        {s.category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[s.category] ?? "bg-muted text-muted-foreground"}`}>
                            {s.category}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${s.balance < 0 ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}>
                          {s.balance.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">balance ({s.uom})</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-2">
                      <div>
                        <span className="text-green-700 dark:text-green-400 font-medium">↑ {s.totalReceived.toFixed(2)} {s.uom}</span>
                        <span className="ml-1">received</span>
                      </div>
                      <div>
                        <span className={`font-medium ${s.totalConsumed > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
                          ↓ {s.totalConsumed.toFixed(2)} kg
                        </span>
                        <span className="ml-1">consumed</span>
                      </div>
                    </div>
                    {s.balanceKg !== null && s.uom.toLowerCase() !== 'kg' && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">≈ {s.balanceKg.toFixed(1)} kg balance</p>
                    )}
                    {s.totalConsumed === 0 && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Add component proportions to mix designs to track consumption</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Receipt" : "New Material Receipt"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required data-testid="input-date" />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Material Name *</Label>
              <Input value={form.materialName} onChange={e => setForm(f => ({ ...f, materialName: e.target.value }))} required placeholder="e.g. OPC 53 Grade Cement" data-testid="input-material-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantity *</Label>
                <Input type="number" step="0.001" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} required data-testid="input-qty" />
              </div>
              <div className="space-y-1">
                <Label>UOM</Label>
                <Select value={form.uom} onValueChange={v => setForm(f => ({ ...f, uom: v }))}>
                  <SelectTrigger data-testid="select-uom">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UOMS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} data-testid="input-supplier" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vehicle Number</Label>
                <Input value={form.vehicleNumber} onChange={e => setForm(f => ({ ...f, vehicleNumber: e.target.value }))} data-testid="input-vehicle" />
              </div>
              <div className="space-y-1">
                <Label>Challan Number</Label>
                <Input value={form.challanNumber} onChange={e => setForm(f => ({ ...f, challanNumber: e.target.value }))} data-testid="input-challan" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="textarea-notes" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={upsertMutation.isPending} data-testid="btn-save-receipt">
                {upsertMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
