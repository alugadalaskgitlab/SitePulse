import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowDownToLine, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const TODAY = format(new Date(), "yyyy-MM-dd");

type StoreItem = { id: number; name: string; category: string; uom: string };
type GrnLine = { itemId: string; qty: string; rate: string; uom: string };
type GrnWithItems = {
  id: number; grnNumber: string; date: string; supplier: string;
  invoiceNo: string | null; indentRef: string | null; remarks: string | null;
  items: { itemId: number; itemName: string; category: string; qty: number; rate: number | null; uom: string }[];
};

const emptyLine = (): GrnLine => ({ itemId: "", qty: "", rate: "", uom: "" });

interface Props { isNew?: boolean }

export default function StoresGrn({ isNew }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(!!isNew);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [form, setForm] = useState({
    date: TODAY, supplier: "", invoiceNo: "", indentRef: "", remarks: "",
  });
  const [lines, setLines] = useState<GrnLine[]>([emptyLine()]);

  const { data: items = [] } = useQuery<StoreItem[]>({
    queryKey: ["/api/stores/items"],
    queryFn: async () => {
      const res = await fetch("/api/stores/items");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: grns = [], isLoading } = useQuery<GrnWithItems[]>({
    queryKey: ["/api/stores/grns", dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      const res = await fetch(`/api/stores/grns${p.toString() ? "?" + p : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stores/grns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "GRN created successfully" });
      setShowForm(false);
      setForm({ date: TODAY, supplier: "", invoiceNo: "", indentRef: "", remarks: "" });
      setLines([emptyLine()]);
      if (isNew) navigate("/stores/grns");
    },
    onError: () => toast({ title: "Error creating GRN", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/stores/grns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "GRN deleted" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  function updateLine(idx: number, key: keyof GrnLine, val: string) {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === "itemId" && val) {
        const item = items.find(i => String(i.id) === val);
        if (item) next[idx].uom = item.uom;
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter(l => l.itemId && l.qty);
    if (!validLines.length) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      grn: { ...form, invoiceNo: form.invoiceNo || null, indentRef: form.indentRef || null, remarks: form.remarks || null },
      items: validLines.map(l => ({ itemId: parseInt(l.itemId), qty: parseFloat(l.qty), rate: l.rate ? parseFloat(l.rate) : null, uom: l.uom })),
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/stores">
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <ArrowDownToLine className="w-5 h-5 text-green-600" />
            <h1 className="text-xl font-bold">GRN History</h1>
          </div>
          {!showForm && (
            <Button size="sm" className="gap-1" onClick={() => setShowForm(true)} data-testid="button-new-grn">
              <Plus className="w-4 h-4" /> New GRN
            </Button>
          )}
        </div>

        {/* New GRN form */}
        {showForm && (
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ArrowDownToLine className="w-4 h-4 text-green-600" /> New Goods Receipt Note
                </h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowForm(false); if (isNew) navigate("/stores/grns"); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Date *</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required data-testid="input-grn-date" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Supplier *</Label>
                    <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" required data-testid="input-grn-supplier" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Invoice / Challan No.</Label>
                    <Input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="Optional" data-testid="input-grn-invoice" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Indent Reference</Label>
                    <Input value={form.indentRef} onChange={e => setForm(f => ({ ...f, indentRef: e.target.value }))} placeholder="e.g. PI-2026-001" data-testid="input-grn-indent" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs">Remarks</Label>
                    <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" data-testid="input-grn-remarks" />
                  </div>
                </div>

                {/* Line items */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Items Received *</Label>
                  {lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end" data-testid={`grn-line-${idx}`}>
                      <div className="col-span-4">
                        <Select value={line.itemId} onValueChange={v => updateLine(idx, "itemId", v)}>
                          <SelectTrigger className="text-xs h-8" data-testid={`select-item-${idx}`}><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>
                            {items.map(it => <SelectItem key={it.id} value={String(it.id)}>{it.name} <span className="text-muted-foreground">({it.category})</span></SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min="0" step="any" className="h-8 text-xs" placeholder="Qty" value={line.qty} onChange={e => updateLine(idx, "qty", e.target.value)} data-testid={`input-qty-${idx}`} />
                      </div>
                      <div className="col-span-2">
                        <Input className="h-8 text-xs" placeholder="UOM" value={line.uom} onChange={e => updateLine(idx, "uom", e.target.value)} data-testid={`input-uom-${idx}`} />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min="0" step="any" className="h-8 text-xs" placeholder="Rate (₹, optional)" value={line.rate} onChange={e => updateLine(idx, "rate", e.target.value)} data-testid={`input-rate-${idx}`} />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {lines.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}>
                            <X className="w-3 h-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={() => setLines(prev => [...prev, emptyLine()])} data-testid="button-add-line">
                    <Plus className="w-3 h-3" /> Add Line
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button type="button" variant="ghost" onClick={() => { setShowForm(false); if (isNew) navigate("/stores/grns"); }}>Cancel</Button>
                  <Button type="submit" className="gap-1" disabled={createMutation.isPending} data-testid="button-save-grn">
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                    Save GRN
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setDateFrom(""); setDateTo(""); }}>Clear</Button>
          )}
        </div>

        {/* GRN List */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : grns.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No GRNs found. Create one using the button above.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {grns.map(grn => (
              <Card key={grn.id} data-testid={`card-grn-${grn.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-bold text-green-700 dark:text-green-400">{grn.grnNumber}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(grn.date + "T00:00:00"), "dd MMM yyyy")}</span>
                        {grn.indentRef && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                            {grn.indentRef}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium mt-1">{grn.supplier}</div>
                      {grn.invoiceNo && <div className="text-xs text-muted-foreground">Inv: {grn.invoiceNo}</div>}
                      <div className="mt-2 space-y-0.5">
                        {grn.items.map((it, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{it.itemName}</span>
                            <span>—</span>
                            <span>{it.qty} {it.uom}</span>
                            {it.rate && <span className="text-slate-400">@ ₹{it.rate}</span>}
                          </div>
                        ))}
                      </div>
                      {grn.remarks && <div className="text-xs text-muted-foreground mt-1 italic">{grn.remarks}</div>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => { if (confirm("Delete this GRN?")) deleteMutation.mutate(grn.id); }} data-testid={`button-delete-grn-${grn.id}`}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
