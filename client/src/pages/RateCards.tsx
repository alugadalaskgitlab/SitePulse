import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import { ChevronLeft, Plus, Trash2, Loader2, Edit, Search, Lock } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PinAuth } from "@/components/PinAuth";
import type { VendorRateCard } from "@shared/schema";

const CATEGORIES = [
  { value: "equipment", label: "EQUIPMENT" },
  { value: "material", label: "MATERIAL" },
  { value: "transport", label: "TRANSPORT" },
  { value: "other", label: "OTHER" },
];

const getCategoryBadgeClass = (cat: string) => {
  switch (cat) {
    case "equipment": return "bg-blue-100 text-blue-800 border-blue-200";
    case "material": return "bg-amber-100 text-amber-800 border-amber-200";
    case "transport": return "bg-purple-100 text-purple-800 border-purple-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

export default function RateCards() {
  const { toast } = useToast();
  const [authenticated, setAuthenticated] = useState(false);
  const [showPinAuth, setShowPinAuth] = useState(true);
  const [vendorFilter, setVendorFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<VendorRateCard | null>(null);

  const [formVendor, setFormVendor] = useState("");
  const [formCategory, setFormCategory] = useState("equipment");
  const [formItemKey, setFormItemKey] = useState("");
  const [formItemLabel, setFormItemLabel] = useState("");
  const [formUnit, setFormUnit] = useState("HRS");
  const [formRate, setFormRate] = useState(0);
  const [formNotes, setFormNotes] = useState("");

  const { data: rateCards = [], isLoading } = useQuery<VendorRateCard[]>({
    queryKey: ["/api/vendor-rate-cards"],
  });

  const { data: vendorNames = [] } = useQuery<string[]>({
    queryKey: ["/api/vendor-bills/vendor-names"],
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vendor-rate-cards", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      toast({ title: editingCard ? "Rate card updated" : "Rate card created" });
      closeForm();
    },
    onError: (err: any) => toast({ title: err.message || "Failed to save rate card", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/vendor-rate-cards/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor-rate-cards"] });
      toast({ title: "Rate card deleted" });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to delete", variant: "destructive" }),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingCard(null);
    setFormVendor("");
    setFormCategory("equipment");
    setFormItemKey("");
    setFormItemLabel("");
    setFormUnit("HRS");
    setFormRate(0);
    setFormNotes("");
  };

  const openEdit = (card: VendorRateCard) => {
    setEditingCard(card);
    setFormVendor(card.vendorName);
    setFormCategory(card.category);
    setFormItemKey(card.itemKey);
    setFormItemLabel(card.itemLabel || "");
    setFormUnit(card.unit || "HRS");
    setFormRate(Number(card.rate) || 0);
    setFormNotes(card.notes || "");
    setShowForm(true);
  };

  const handleSave = () => {
    if (!formVendor || !formItemKey || !formRate) {
      toast({ title: "Vendor, Item Key and Rate are required", variant: "destructive" });
      return;
    }
    upsertMutation.mutate({
      vendorName: formVendor.toUpperCase(),
      category: formCategory,
      itemKey: formItemKey.toUpperCase(),
      itemLabel: formItemLabel.toUpperCase() || formItemKey.toUpperCase(),
      unit: formUnit,
      rate: formRate,
      notes: formNotes.toUpperCase() || null,
    });
  };

  const filteredCards = useMemo(() => {
    return rateCards.filter(card => {
      if (vendorFilter && !card.vendorName.toUpperCase().includes(vendorFilter.toUpperCase())) return false;
      if (categoryFilter !== "all" && card.category !== categoryFilter) return false;
      return true;
    });
  }, [rateCards, vendorFilter, categoryFilter]);

  const groupedByVendor = useMemo(() => {
    const groups: Record<string, VendorRateCard[]> = {};
    filteredCards.forEach(card => {
      const key = card.vendorName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(card);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCards]);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto p-8 space-y-4">
        <div className="text-center space-y-2">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">RATE CARD MANAGEMENT</h1>
          <p className="text-sm text-muted-foreground">Manager or Admin PIN required to access rate cards</p>
        </div>
        {showPinAuth && (
          <PinAuth
            targetRole="any"
            onSuccess={() => { setAuthenticated(true); setShowPinAuth(false); }}
            onClose={() => setShowPinAuth(false)}
          />
        )}
        {!showPinAuth && (
          <div className="text-center space-y-2">
            <Button onClick={() => setShowPinAuth(true)} data-testid="button-retry-pin">
              ENTER PIN
            </Button>
            <div>
              <Link href="/plant/vendor-bills">
                <Button variant="ghost" size="sm">BACK TO VENDOR BILLS</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/plant/vendor-bills">
          <Button variant="ghost" size="icon" data-testid="button-back-rate-cards">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold" data-testid="text-rate-cards-title">VENDOR RATE CARDS</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-rate-card">
            <Plus className="w-4 h-4 mr-1" /> ADD RATE
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs uppercase">Filter by Vendor</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendor..."
                  value={vendorFilter}
                  onChange={e => setVendorFilter(e.target.value)}
                  className="pl-8 uppercase"
                  data-testid="input-filter-vendor"
                />
              </div>
            </div>
            <div className="min-w-[150px]">
              <Label className="text-xs uppercase">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger data-testid="select-filter-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ALL</SelectItem>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : groupedByVendor.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No rate cards found. Click "ADD RATE" to create one.
          </CardContent>
        </Card>
      ) : (
        groupedByVendor.map(([vendor, cards]) => (
          <Card key={vendor}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm" data-testid={`text-vendor-group-${vendor}`}>{vendor}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs">ITEM</th>
                    <th className="px-3 py-2 text-left text-xs">CATEGORY</th>
                    <th className="px-3 py-2 text-left text-xs">UNIT</th>
                    <th className="px-3 py-2 text-right text-xs">RATE (₹)</th>
                    <th className="px-3 py-2 text-left text-xs">NOTES</th>
                    <th className="px-3 py-2 text-center text-xs w-20">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map(card => (
                    <tr key={card.id} className="border-t" data-testid={`row-rate-card-${card.id}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{card.itemLabel || card.itemKey}</div>
                        <div className="text-xs text-muted-foreground font-mono">{card.itemKey}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] ${getCategoryBadgeClass(card.category)}`}>
                          {card.category.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{card.unit}</td>
                      <td className="px-3 py-2 text-right font-mono">₹{Number(card.rate).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{card.notes || "-"}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(card)} data-testid={`button-edit-rate-${card.id}`}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => { if (confirm("Delete this rate card?")) deleteMutation.mutate(card.id); }}
                            data-testid={`button-delete-rate-${card.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCard ? "EDIT RATE CARD" : "ADD RATE CARD"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase">Vendor Name</Label>
              <Input
                list="vendor-names-list"
                value={formVendor}
                onChange={e => setFormVendor(e.target.value.toUpperCase())}
                placeholder="VENDOR NAME"
                className="uppercase"
                data-testid="input-form-vendor"
              />
              <datalist id="vendor-names-list">
                {vendorNames.map(v => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase">Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger data-testid="select-form-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase">Unit</Label>
                <Input
                  value={formUnit}
                  onChange={e => setFormUnit(e.target.value.toUpperCase())}
                  placeholder="HRS"
                  className="uppercase"
                  data-testid="input-form-unit"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Item Key (unique identifier)</Label>
              <Input
                value={formItemKey}
                onChange={e => setFormItemKey(e.target.value.toUpperCase())}
                placeholder="e.g. EQ_123_HOURLY_HIRE"
                className="uppercase font-mono text-sm"
                data-testid="input-form-item-key"
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Display Label</Label>
              <Input
                value={formItemLabel}
                onChange={e => setFormItemLabel(e.target.value.toUpperCase())}
                placeholder="e.g. JCB 3DX - HOURLY HIRE"
                className="uppercase"
                data-testid="input-form-item-label"
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Rate (₹)</Label>
              <Input
                type="number"
                step="0.01"
                value={formRate || ""}
                onChange={e => setFormRate(parseFloat(e.target.value) || 0)}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                placeholder="0"
                data-testid="input-form-rate"
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Notes (optional)</Label>
              <Input
                value={formNotes}
                onChange={e => setFormNotes(e.target.value.toUpperCase())}
                placeholder="Any notes..."
                className="uppercase"
                data-testid="input-form-notes"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeForm}>CANCEL</Button>
              <Button onClick={handleSave} disabled={upsertMutation.isPending} data-testid="button-save-rate-card">
                {upsertMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {editingCard ? "UPDATE" : "SAVE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
