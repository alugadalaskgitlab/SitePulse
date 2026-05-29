import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowDownToLine, X, Loader2, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

interface Props { isNew?: boolean; detailId?: number }

type PurchaseIndentSummary = { id: number; indentNo: string; status: string };

export default function StoresGrn({ isNew, detailId }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const returnTo = searchParams.get("returnTo") || "/stores";
  const indentRefFilter = searchParams.get("indentRef") || "";

  const [showForm, setShowForm] = useState(!!isNew);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [indentFilter, setIndentFilter] = useState(indentRefFilter);
  const [selectedId, setSelectedId] = useState<number | null>(detailId ?? null);

  const [form, setForm] = useState({
    date: TODAY, supplier: "", invoiceNo: "", indentRef: "", remarks: "",
  });
  const [manualIndent, setManualIndent] = useState(false);
  const [lines, setLines] = useState<GrnLine[]>([emptyLine()]);

  useEffect(() => {
    if (detailId) setSelectedId(detailId);
  }, [detailId]);

  const { data: items = [] } = useQuery<StoreItem[]>({ queryKey: ["/api/stores/items"] });

  const { data: purchaseIndents = [] } = useQuery<PurchaseIndentSummary[]>({
    queryKey: ["/api/purchase-indents"],
    select: (data: any[]) =>
      data
        .map(d => ({ id: d.id, indentNo: d.indentNo, status: d.status }))
        .filter(d => d.status === "approved" || d.status === "pending"),
  });

  const { data: grns = [], isLoading } = useQuery<GrnWithItems[]>({
    queryKey: ["/api/stores/grns", dateFrom, dateTo, indentFilter],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (indentFilter) p.set("indentRef", indentFilter);
      const res = await fetch(`/api/stores/grns${p.toString() ? "?" + p : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: previewNum } = useQuery<{ number: string }>({
    queryKey: ["/api/stores/next-doc-number", "GRN"],
    queryFn: () => fetch("/api/stores/next-doc-number?type=GRN").then(r => r.json()),
    enabled: showForm,
    staleTime: 0,
  });

  const selectedGrn = grns.find(g => g.id === selectedId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stores/grns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "GRN created successfully" });
      setShowForm(false);
      setForm({ date: TODAY, supplier: "", invoiceNo: "", indentRef: "", remarks: "" });
      setManualIndent(false);
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
      if (selectedId && selectedId === deleteMutation.variables) setSelectedId(null);
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

  function openDetail(grn: GrnWithItems) {
    setSelectedId(grn.id);
    navigate(`/stores/grns/${grn.id}`);
    setShowForm(false);
  }

  function closeDetail() {
    setSelectedId(null);
    navigate("/stores/grns");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Link href={returnTo}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <ArrowDownToLine className="w-5 h-5 text-green-600" />
            <h1 className="text-xl font-bold">GRN History</h1>
          </div>
          {!showForm && !selectedId && (
            <Button size="sm" className="gap-1" onClick={() => setShowForm(true)} data-testid="button-new-grn">
              <Plus className="w-4 h-4" /> New GRN
            </Button>
          )}
        </div>

        {/* Detail panel */}
        {selectedGrn && (
          <Card className="border-green-300 dark:border-green-800 shadow-md">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-lg font-bold text-green-700 dark:text-green-400" data-testid="text-grn-detail-number">{selectedGrn.grnNumber}</span>
                    <span className="text-sm text-muted-foreground">{format(new Date(selectedGrn.date + "T00:00:00"), "dd MMM yyyy")}</span>
                    {selectedGrn.indentRef && (
                      <Badge variant="outline" className="text-[10px] border-violet-400 text-violet-700 dark:text-violet-400">{selectedGrn.indentRef}</Badge>
                    )}
                  </div>
                  <p className="text-base font-semibold mt-1">{selectedGrn.supplier}</p>
                  {selectedGrn.invoiceNo && <p className="text-xs text-muted-foreground">Invoice / Challan: {selectedGrn.invoiceNo}</p>}
                  {selectedGrn.remarks && <p className="text-xs text-muted-foreground italic mt-1">{selectedGrn.remarks}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={closeDetail} data-testid="button-close-detail">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs">Item</th>
                      <th className="text-left px-3 py-2 text-xs">Category</th>
                      <th className="text-right px-3 py-2 text-xs">Qty</th>
                      <th className="text-left px-2 py-2 text-xs">UOM</th>
                      <th className="text-right px-3 py-2 text-xs">Rate (₹)</th>
                      <th className="text-right px-3 py-2 text-xs">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGrn.items.map((it, i) => (
                      <tr key={i} className="border-t" data-testid={`row-detail-item-${i}`}>
                        <td className="px-3 py-2 font-medium">{it.itemName}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{it.category}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-2 py-2 text-xs">{it.uom}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{it.rate != null ? it.rate.toLocaleString("en-IN") : "—"}</td>
                        <td className="px-3 py-2 text-right">{it.rate != null ? (it.qty * it.rate).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={closeDetail} data-testid="button-back-to-list" className="gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back to list
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive gap-1"
                  onClick={() => { if (confirm("Delete this GRN?")) { deleteMutation.mutate(selectedGrn.id); closeDetail(); } }}
                  data-testid="button-delete-detail-grn">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* New GRN form */}
        {!selectedId && showForm && (
          <Card className="border-green-200 dark:border-green-900">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 text-green-600" /> New Goods Receipt Note
                  </h3>
                  {previewNum?.number && (
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" data-testid="text-grn-preview-number">
                      {previewNum.number}
                    </span>
                  )}
                </div>
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
                    {manualIndent ? (
                      <div className="flex gap-1">
                        <Input
                          value={form.indentRef}
                          onChange={e => setForm(f => ({ ...f, indentRef: e.target.value }))}
                          placeholder="e.g. PI-2026-001"
                          className="text-xs"
                          data-testid="input-grn-indent-manual"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs px-2 shrink-0"
                          onClick={() => { setManualIndent(false); setForm(f => ({ ...f, indentRef: "" })); }}
                        >
                          ← Pick
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={form.indentRef || "__none__"}
                        onValueChange={v => {
                          if (v === "__manual__") {
                            setManualIndent(true);
                            setForm(f => ({ ...f, indentRef: "" }));
                          } else {
                            setForm(f => ({ ...f, indentRef: v === "__none__" ? "" : v }));
                          }
                        }}
                      >
                        <SelectTrigger className="text-xs" data-testid="select-grn-indent">
                          <SelectValue placeholder="Select indent (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None / No indent</SelectItem>
                          {purchaseIndents.map(pi => (
                            <SelectItem key={pi.id} value={pi.indentNo}>
                              {pi.indentNo}{" "}
                              <span className="text-muted-foreground text-[10px]">({pi.status.toUpperCase()})</span>
                            </SelectItem>
                          ))}
                          <SelectItem value="__manual__">Other — type manually…</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs">Remarks</Label>
                    <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" data-testid="input-grn-remarks" />
                  </div>
                </div>

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

        {!selectedId && (
          <>
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
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Indent</Label>
                <Input className="h-8 w-36 text-xs" placeholder="PI-YYYY-NNN" value={indentFilter} onChange={e => setIndentFilter(e.target.value)} data-testid="input-indent-filter" />
              </div>
              {(dateFrom || dateTo || indentFilter) && (
                <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setDateFrom(""); setDateTo(""); setIndentFilter(""); }}>Clear</Button>
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
                  <Card key={grn.id} className="cursor-pointer hover-elevate" onClick={() => openDetail(grn)} data-testid={`card-grn-${grn.id}`}>
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
                          <div className="mt-1 text-xs text-muted-foreground">
                            {grn.items.length} item{grn.items.length !== 1 ? "s" : ""}
                            {" — "}
                            {grn.items.map(it => `${it.itemName} (${it.qty} ${it.uom})`).join(", ")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(grn)} data-testid={`button-view-grn-${grn.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (confirm("Delete this GRN?")) deleteMutation.mutate(grn.id); }} data-testid={`button-delete-grn-${grn.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
