import { useState } from "react";
import { Link, useSearch } from "wouter";

import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Plus, Pencil, Power, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const CATEGORIES = ["Spares", "Lubricants", "Consumables", "Electricals", "Tools", "Others"];
const UOMS = ["Nos", "Pcs", "Set", "Liters", "Ltrs", "Kg", "Grams", "Meters", "Feet", "Roll", "Bag", "Box", "Pair", "Pack"];

type StoreItem = { id: number; name: string; category: string; uom: string; minStockQty: number | null; isActive: number };

const defaultForm = { name: "", category: "Spares", uom: "Nos", minStockQty: "" };

export default function StoresItems() {
  const { toast } = useToast();
  const _search = useSearch();
  const _returnTo = new URLSearchParams(_search).get("returnTo") || "/stores/hub";
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: items = [], isLoading } = useQuery<StoreItem[]>({
    queryKey: ["/api/stores/items", showInactive],
    queryFn: async () => {
      const res = await fetch(`/api/stores/items?includeInactive=${showInactive}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stores/items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "Item added" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PATCH", `/api/stores/items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "Item updated" });
      setDialogOpen(false);
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/stores/items/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  function openNew() {
    setEditing(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(item: StoreItem) {
    setEditing(item);
    setForm({ name: item.name, category: item.category, uom: item.uom, minStockQty: item.minStockQty != null ? String(item.minStockQty) : "" });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      category: form.category,
      uom: form.uom,
      minStockQty: form.minStockQty !== "" ? parseFloat(form.minStockQty) : null,
      isActive: 1,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload });
    else createMutation.mutate(payload);
  }

  const activeItems = items.filter(i => i.isActive === 1);
  const inactiveItems = items.filter(i => i.isActive !== 1);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href={_returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <Package className="w-5 h-5 text-blue-600" />
            <h1 className="text-xl font-bold">Item Master</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)} className="text-xs" data-testid="button-toggle-inactive">
            {showInactive ? "Hide Inactive" : "Show All"}
          </Button>
          <Button onClick={openNew} size="sm" className="gap-1" data-testid="button-add-item">
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : items.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No items yet. Add your first item.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Category</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">UOM</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Min Stock</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...activeItems, ...inactiveItems].map((item, i) => (
                    <tr key={item.id} className={`border-b border-muted/50 hover:bg-muted/20 ${item.isActive !== 1 ? "opacity-50" : ""}`} data-testid={`row-item-${item.id}`}>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.uom}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{item.minStockQty ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${item.isActive === 1 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                          {item.isActive === 1 ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)} data-testid={`button-edit-${item.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleMutation.mutate(item.id)} data-testid={`button-toggle-${item.id}`}>
                          <Power className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Item" : "Add Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Item Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Engine Oil 15W40" required data-testid="input-item-name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>UOM *</Label>
                <Select value={form.uom} onValueChange={v => setForm(f => ({ ...f, uom: v }))}>
                  <SelectTrigger data-testid="select-uom"><SelectValue /></SelectTrigger>
                  <SelectContent>{UOMS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Minimum Stock Level <span className="text-muted-foreground text-xs">(optional — triggers low-stock alert)</span></Label>
              <Input type="number" min="0" step="any" value={form.minStockQty} onChange={e => setForm(f => ({ ...f, minStockQty: e.target.value }))} placeholder="Leave blank for no alert" data-testid="input-min-stock" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-item">
                {editing ? "Update" : "Add Item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
