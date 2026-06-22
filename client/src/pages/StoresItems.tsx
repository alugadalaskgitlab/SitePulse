import { useState, useMemo } from "react";
import { Link, useSearch } from "wouter";

import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Plus, Pencil, Power, Package, AlertTriangle, Search, X } from "lucide-react";
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
type StockBalance = { itemId: number; balance: number; minStockQty: number | null; isLowStock: boolean };

const defaultForm = { name: "", category: "Spares", uom: "Nos", minStockQty: "" };

export default function StoresItems() {
  const { toast } = useToast();
  const _search = useSearch();
  const _returnTo = new URLSearchParams(_search).get("returnTo") || "/stores/hub";
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [searchText, setSearchText] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: items = [], isLoading } = useQuery<StoreItem[]>({
    queryKey: ["/api/stores/items", showInactive],
    queryFn: async () => {
      const res = await fetch(`/api/stores/items?includeInactive=${showInactive}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: stockSummary = [] } = useQuery<StockBalance[]>({
    queryKey: ["/api/stores/stock-summary"],
  });

  const stockMap = Object.fromEntries(stockSummary.map(s => [s.itemId, s]));

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

  const displayedItems = useMemo(() => {
    const all = [...activeItems, ...inactiveItems];
    const q = searchText.trim().toLowerCase();
    return all.filter(item => {
      const matchesSearch = !q || item.name.toLowerCase().includes(q);
      const matchesCategory = filterCategory === "all" || item.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [activeItems, inactiveItems, searchText, filterCategory]);

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
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)} className="text-sm" data-testid="button-toggle-inactive">
            {showInactive ? "Hide Inactive" : "Show All"}
          </Button>
          <Button onClick={openNew} size="sm" className="gap-1" data-testid="button-add-item">
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Search items..."
              className="pl-8 pr-8 h-9 text-sm"
              data-testid="input-search-items"
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-clear-search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-44 h-9 text-sm" data-testid="select-filter-category">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
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
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">Category</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-muted-foreground">UOM</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Min Stock</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold text-muted-foreground">Current Stock</th>
                    <th className="text-center px-4 py-3 text-sm font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No items match your search.
                      </td>
                    </tr>
                  ) : displayedItems.map((item) => {
                    const stock = stockMap[item.id];
                    const isLow = item.isActive === 1 && stock?.isLowStock;
                    return (
                    <tr key={item.id} className={`border-b border-muted/50 hover:bg-muted/20 ${item.isActive !== 1 ? "opacity-50" : ""} ${isLow ? "bg-yellow-50/40" : ""}`} data-testid={`row-item-${item.id}`}>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {isLow && (
                            <span className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200" data-testid={`badge-low-stock-${item.id}`}>
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Low Stock
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.uom}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{item.minStockQty ?? "—"}</td>
                      <td className={`px-4 py-3 text-right font-medium ${isLow ? "text-yellow-700" : "text-slate-700"}`} data-testid={`text-stock-${item.id}`}>
                        {stock !== undefined ? stock.balance : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${item.isActive === 1 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
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
                  );
                  })}
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
              <Label>Minimum Stock Level <span className="text-muted-foreground text-sm">(optional — triggers low-stock alert)</span></Label>
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
