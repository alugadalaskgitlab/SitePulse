import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowDownToLine, X, Loader2, Eye, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const STORE_CATEGORIES = ["Spares", "Lubricants", "Consumables", "Electricals", "Tools", "HMA", "RMC", "Office", "General", "Others"];
const STORE_CATEGORY_CODES: Record<string, string> = {
  "Spares": "EQP", "Lubricants": "LUBR", "Consumables": "CONS", "Electricals": "ELECT",
  "Tools": "TOOLS", "HMA": "STORE", "RMC": "STORE", "Office": "STORE", "General": "STORE", "Others": "GRN",
};

const ACCEPTANCE_STATUS_OPTIONS = [
  { value: "accepted", label: "Accepted" },
  { value: "partial", label: "Partially Accepted" },
  { value: "rejected", label: "Rejected" },
];

function getAcceptanceBadge(status: string) {
  switch (status) {
    case "accepted":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-[10px] px-1.5 py-0">ACCEPTED</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0">PARTIAL</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 text-[10px] px-1.5 py-0">REJECTED</Badge>;
    default:
      return null;
  }
}

function getStatusBadgeGrn(status: string) {
  switch (status) {
    case "approved": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-[10px] px-1.5 py-0">APPROVED</Badge>;
    case "pending": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0">PENDING</Badge>;
    case "completed": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700 text-[10px] px-1.5 py-0">COMPLETED</Badge>;
    case "rejected": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 text-[10px] px-1.5 py-0">REJECTED</Badge>;
    default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status.toUpperCase()}</Badge>;
  }
}
const STORE_UOMS = ["Nos", "Pcs", "Set", "Liters", "Ltrs", "Kg", "Grams", "Meters", "Feet", "Roll", "Bag", "Box", "Pair", "Pack"];

const TODAY = format(new Date(), "yyyy-MM-dd");

type StoreItem = { id: number; name: string; category: string; uom: string };
type GrnLine = { itemId: string; qty: string; rate: string; uom: string };
type GrnWithItems = {
  id: number; grnNumber: string; date: string; supplier: string;
  invoiceNo: string | null; invoiceDate: string | null; indentRef: string | null; remarks: string | null;
  acceptanceStatus: string; acceptanceRemarks: string | null;
  items: { itemId: number; itemName: string; category: string; qty: number; rate: number | null; uom: string }[];
};

type PurchaseIndentFull = {
  id: number;
  indentNo: string;
  status: string;
  date?: string;
  raisedBy?: string;
  items: { description: string; qty: number; uom: string; approvedQty: number | null }[];
};

const emptyLine = (): GrnLine => ({ itemId: "", qty: "", rate: "", uom: "" });

interface Props { isNew?: boolean; detailId?: number }

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
    date: TODAY,
    supplier: "",
    invoiceNo: "",
    invoiceDate: "",
    indentRef: isNew ? indentRefFilter : "",
    remarks: "",
    acceptanceStatus: "accepted",
    acceptanceRemarks: "",
  });
  const [lines, setLines] = useState<GrnLine[]>([emptyLine()]);
  const [suggestedIndents, setSuggestedIndents] = useState<PurchaseIndentFull[]>([]);
  const [grnCategory, setGrnCategory] = useState("Spares");
  const [indentComboSearch, setIndentComboSearch] = useState("");
  const [indentComboOpen, setIndentComboOpen] = useState(false);
  const indentComboRef = useRef<HTMLDivElement>(null);
  const [indentOverride, setIndentOverride] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (indentComboRef.current && !indentComboRef.current.contains(e.target as Node)) {
        setIndentComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemTargetIdx, setAddItemTargetIdx] = useState<number | null>(null);
  const [addItemForm, setAddItemForm] = useState({ name: "", category: "Spares", uom: "Nos" });

  useEffect(() => {
    if (detailId) setSelectedId(detailId);
  }, [detailId]);

  const { data: items = [] } = useQuery<StoreItem[]>({ queryKey: ["/api/stores/items"] });

  const { data: allPurchaseIndents = [] } = useQuery<PurchaseIndentFull[]>({
    queryKey: ["/api/purchase-indents"],
    select: (data: any[]) =>
      data.map(d => ({
        id: d.id,
        indentNo: d.indentNo,
        status: d.status,
        items: (d.items || []).map((it: any) => ({
          description: it.description || "",
          qty: it.qty,
          uom: it.uom,
          approvedQty: it.approvedQty,
        })),
      })),
  });
  const purchaseIndents = allPurchaseIndents.filter(d => d.status === "approved" || d.status === "pending");

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
    queryKey: ["/api/stores/next-doc-number", "GRN", grnCategory],
    queryFn: () => {
      const catCode = STORE_CATEGORY_CODES[grnCategory] || "OTH";
      return fetch(`/api/stores/next-doc-number?type=GRN&category=${catCode}`).then(r => r.json());
    },
    enabled: showForm,
    staleTime: 0,
  });

  const selectedGrn = grns.find(g => g.id === selectedId) ?? null;

  function findMatchingIndents(itemName: string): PurchaseIndentFull[] {
    if (!itemName || !purchaseIndents.length) return [];
    const lc = itemName.toLowerCase();
    return purchaseIndents.filter(pi =>
      pi.items.some(it => it.description.toLowerCase().includes(lc) || lc.includes(it.description.toLowerCase()))
    );
  }

  function updateLine(idx: number, key: keyof GrnLine, val: string) {
    setLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === "itemId" && val) {
        const item = items.find(i => String(i.id) === val);
        if (item) {
          next[idx].uom = item.uom;
          if (idx === 0 && item.category && STORE_CATEGORIES.includes(item.category)) {
            setGrnCategory(item.category);
          }
        }
        const matched = findMatchingIndents(item?.name || "");
        setSuggestedIndents(matched);
        if (matched.length === 1 && !form.indentRef) {
          setForm(f => ({ ...f, indentRef: matched[0].indentNo }));
        }
      }
      return next;
    });
  }

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stores/grns", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "GRN created successfully" });
      setShowForm(false);
      setForm({ date: TODAY, supplier: "", invoiceNo: "", invoiceDate: "", indentRef: "", remarks: "", acceptanceStatus: "accepted", acceptanceRemarks: "" });
      setLines([emptyLine()]);
      setSuggestedIndents([]);
      setGrnCategory("Spares");
      setIndentOverride(false);
      setIndentComboSearch("");
      if (isNew) navigate("/stores/grns");
    },
    onError: () => toast({ title: "Error creating GRN", variant: "destructive" }),
  });

  const addStoreItemMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/stores/items", data); return res.json(); },
    onSuccess: (newItem: any) => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: `"${newItem.name}" added to catalogue` });
      if (addItemTargetIdx !== null) {
        updateLine(addItemTargetIdx, "itemId", String(newItem.id));
      }
      setAddItemOpen(false);
      setAddItemForm({ name: "", category: "Spares", uom: "Nos" });
      setAddItemTargetIdx(null);
    },
    onError: () => toast({ title: "Error adding item", variant: "destructive" }),
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validLines = lines.filter(l => l.itemId && l.qty);
    if (!validLines.length) {
      toast({ title: "Add at least one item with quantity", variant: "destructive" });
      return;
    }
    if ((form.acceptanceStatus === "partial" || form.acceptanceStatus === "rejected") && !form.acceptanceRemarks.trim()) {
      toast({ title: "Please provide a reason for partial/rejected status", variant: "destructive" });
      return;
    }
    const selectedPI = allPurchaseIndents.find(pi => pi.indentNo === form.indentRef);
    if (selectedPI && selectedPI.status !== "approved" && !indentOverride) {
      toast({ title: "Indent not approved", description: "Tick the override checkbox to proceed anyway.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      grn: {
        ...form,
        invoiceNo: form.invoiceNo || null,
        invoiceDate: form.invoiceDate || null,
        indentRef: form.indentRef || null,
        remarks: form.remarks || null,
        acceptanceStatus: form.acceptanceStatus,
        acceptanceRemarks: form.acceptanceRemarks || null,
      },
      items: validLines.map(l => ({
        itemId: parseInt(l.itemId),
        qty: parseFloat(l.qty),
        rate: l.rate ? parseFloat(l.rate) : null,
        uom: l.uom,
      })),
      grnCategory: STORE_CATEGORY_CODES[grnCategory] || "GRN",
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

  function cancelForm() {
    setShowForm(false);
    setSuggestedIndents([]);
    if (isNew) navigate("/stores/grns");
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
                    {getAcceptanceBadge(selectedGrn.acceptanceStatus || "accepted")}
                    {selectedGrn.indentRef && (
                      <Badge variant="outline" className="text-[10px] border-violet-400 text-violet-700 dark:text-violet-400">{selectedGrn.indentRef}</Badge>
                    )}
                  </div>
                  <p className="text-base font-semibold mt-1">{selectedGrn.supplier}</p>
                  {(selectedGrn.invoiceNo || selectedGrn.invoiceDate) && (
                    <p className="text-xs text-muted-foreground">
                      {selectedGrn.invoiceNo ? `Invoice/Challan: ${selectedGrn.invoiceNo}` : ""}
                      {selectedGrn.invoiceNo && selectedGrn.invoiceDate ? " · " : ""}
                      {selectedGrn.invoiceDate ? format(new Date(selectedGrn.invoiceDate + "T00:00:00"), "dd MMM yyyy") : ""}
                    </p>
                  )}
                  {selectedGrn.acceptanceRemarks && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-medium">QC Note:</span> {selectedGrn.acceptanceRemarks}
                    </p>
                  )}
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
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 text-green-600" /> New Goods Receipt Note
                  </h3>
                  <Select value={grnCategory} onValueChange={v => { setGrnCategory(v); }}>
                    <SelectTrigger className="h-7 w-36 text-xs" data-testid="select-grn-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {previewNum?.number && (
                    <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" data-testid="text-grn-preview-number">
                      {previewNum.number}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelForm}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* ── Header fields ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">GRN Date *</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required data-testid="input-grn-date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Supplier / Source *</Label>
                    <Input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Supplier name" required data-testid="input-grn-supplier" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Invoice / Challan No.</Label>
                    <Input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="Optional" data-testid="input-grn-invoice" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Invoice / Challan Date</Label>
                    <Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} data-testid="input-grn-invoice-date" />
                  </div>
                </div>

                {/* Indent reference — searchable combobox + status card */}
                {(() => {
                  const selectedPI = form.indentRef ? allPurchaseIndents.find(pi => pi.indentNo === form.indentRef) : null;
                  const isNotApproved = selectedPI && selectedPI.status !== "approved";
                  const filteredPIs = allPurchaseIndents.filter(pi =>
                    !indentComboSearch || pi.indentNo.toLowerCase().includes(indentComboSearch.toLowerCase())
                  );
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Indent Reference</Label>
                        {suggestedIndents.length > 0 && !form.indentRef && (
                          <span className="text-[10px] text-violet-600 dark:text-violet-400">
                            {suggestedIndents.length} match{suggestedIndents.length !== 1 ? "es" : ""}
                          </span>
                        )}
                      </div>

                      {/* Combobox */}
                      <div ref={indentComboRef} className="relative">
                        <div className="flex items-center gap-1">
                          <Input
                            className="text-xs flex-1"
                            placeholder="Type PI number to search…"
                            value={form.indentRef || indentComboSearch}
                            onChange={e => {
                              const v = e.target.value;
                              if (form.indentRef) {
                                setForm(f => ({ ...f, indentRef: "" }));
                                setIndentComboSearch(v);
                              } else {
                                setIndentComboSearch(v);
                              }
                              setIndentComboOpen(true);
                            }}
                            onFocus={() => setIndentComboOpen(true)}
                            data-testid="input-indent-ref"
                          />
                          {form.indentRef && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"
                              onClick={() => { setForm(f => ({ ...f, indentRef: "" })); setIndentComboSearch(""); setIndentOverride(false); }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        {indentComboOpen && !form.indentRef && filteredPIs.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-xs">
                            <div className="px-2 py-1 text-[10px] text-muted-foreground border-b">None / No indent</div>
                            {filteredPIs.map(pi => (
                              <div
                                key={pi.id}
                                className="px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-between gap-2"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setForm(f => ({ ...f, indentRef: pi.indentNo }));
                                  setIndentComboSearch("");
                                  setIndentComboOpen(false);
                                }}
                                data-testid={`option-indent-${pi.indentNo}`}
                              >
                                <span className="font-semibold">{pi.indentNo}</span>
                                {getStatusBadgeGrn(pi.status)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Selected PI status card */}
                      {selectedPI && (
                        <div className={`rounded-md border p-2.5 space-y-1 text-xs ${isNotApproved ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{selectedPI.indentNo}</span>
                            {getStatusBadgeGrn(selectedPI.status)}
                            <span className="text-muted-foreground">{selectedPI.items.length} item{selectedPI.items.length !== 1 ? "s" : ""}</span>
                            {selectedPI.date && <span className="text-muted-foreground">· {selectedPI.date}</span>}
                            {selectedPI.raisedBy && <span className="text-muted-foreground">by {selectedPI.raisedBy}</span>}
                          </div>
                          {selectedPI.items.slice(0, 3).map((it, i) => (
                            <div key={i} className="text-muted-foreground">{it.description} — {it.approvedQty ?? it.qty} {it.uom}</div>
                          ))}
                          {selectedPI.items.length > 3 && <div className="text-muted-foreground">+{selectedPI.items.length - 3} more</div>}
                        </div>
                      )}

                      {/* Warning + override if not approved */}
                      {isNotApproved && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              This indent is <strong>{selectedPI.status.toUpperCase()}</strong> — not yet approved.
                            </p>
                            <label className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={indentOverride}
                                onChange={e => setIndentOverride(e.target.checked)}
                                data-testid="checkbox-indent-override"
                              />
                              <span className="text-amber-700 dark:text-amber-300">Override — I understand this GRN is being raised against an unapproved indent</span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Suggestions from item matching */}
                      {suggestedIndents.length > 0 && !form.indentRef && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Matching indents:</span>
                          {suggestedIndents.map(pi => (
                            <button
                              key={pi.id}
                              type="button"
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 hover:bg-violet-200 transition-colors"
                              onClick={() => { setForm(f => ({ ...f, indentRef: pi.indentNo })); setIndentComboSearch(""); }}
                              data-testid={`badge-indent-${pi.indentNo}`}
                            >
                              {pi.indentNo}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="space-y-1.5">
                  <Label className="text-xs">Remarks / Notes</Label>
                  <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" data-testid="input-grn-remarks" />
                </div>

                {/* ── Acceptance Status ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-md border bg-muted/30">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Acceptance Status *</Label>
                    <Select value={form.acceptanceStatus} onValueChange={v => setForm(f => ({ ...f, acceptanceStatus: v, acceptanceRemarks: v === "accepted" ? "" : f.acceptanceRemarks }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-acceptance-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCEPTANCE_STATUS_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(form.acceptanceStatus === "partial" || form.acceptanceStatus === "rejected") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">
                        {form.acceptanceStatus === "rejected" ? "Rejection Reason *" : "Partial Acceptance Reason *"}
                      </Label>
                      <Input
                        value={form.acceptanceRemarks}
                        onChange={e => setForm(f => ({ ...f, acceptanceRemarks: e.target.value }))}
                        placeholder={form.acceptanceStatus === "rejected" ? "Why were goods rejected?" : "What was accepted / what was not?"}
                        required
                        data-testid="input-acceptance-remarks"
                      />
                    </div>
                  )}
                </div>

                {/* ── Items received (item-first) ── */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Items Received *</Label>
                  <p className="text-[10px] text-muted-foreground -mt-1">Select an item first — matching purchase indents will be suggested automatically.</p>

                  {/* Column headers */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
                    <span className="col-span-4 text-[10px] text-muted-foreground font-medium">Item</span>
                    <span className="col-span-2 text-[10px] text-muted-foreground font-medium">Qty *</span>
                    <span className="col-span-2 text-[10px] text-muted-foreground font-medium">UOM</span>
                    <span className="col-span-3 text-[10px] text-muted-foreground font-medium">Rate (₹, optional)</span>
                  </div>

                  {lines.map((line, idx) => {
                    const selectedItem = items.find(i => String(i.id) === line.itemId);
                    return (
                      <div key={idx} className="space-y-1" data-testid={`grn-line-${idx}`}>
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-4 flex gap-1">
                            <div className="flex-1 min-w-0">
                              <Select
                                value={line.itemId}
                                onValueChange={v => {
                                  if (v === "__add_new__") {
                                    setAddItemTargetIdx(idx);
                                    setAddItemForm({ name: "", category: "Spares", uom: "Nos" });
                                    setAddItemOpen(true);
                                  } else {
                                    updateLine(idx, "itemId", v);
                                    const it = items.find(i => String(i.id) === v);
                                    if (it) updateLine(idx, "uom", it.uom || "NOS");
                                  }
                                }}
                              >
                                <SelectTrigger className="text-xs h-8 w-full" data-testid={`select-item-${idx}`}>
                                  <SelectValue placeholder="Select item…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {items.map(it => (
                                    <SelectItem key={it.id} value={String(it.id)}>
                                      {it.name} <span className="text-muted-foreground">({it.category})</span>
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="__add_new__" className="text-blue-600 dark:text-blue-400 font-medium border-t">
                                    + Add new item to catalogue…
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              title="Add new item to catalogue"
                              onClick={() => { setAddItemTargetIdx(idx); setAddItemForm({ name: "", category: "Spares", uom: "Nos" }); setAddItemOpen(true); }}
                              data-testid={`button-add-item-inline-${idx}`}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="col-span-2">
                            <Input type="number" min="0" step="any" className="h-8 text-xs" placeholder="Qty" value={line.qty} onChange={e => updateLine(idx, "qty", e.target.value)} data-testid={`input-qty-${idx}`} />
                          </div>
                          <div className="col-span-2">
                            <Input className="h-8 text-xs bg-muted/50" placeholder="UOM" value={line.uom} onChange={e => updateLine(idx, "uom", e.target.value)} data-testid={`input-uom-${idx}`} />
                          </div>
                          <div className="col-span-3">
                            <Input type="number" min="0" step="any" className="h-8 text-xs" placeholder="Rate ₹" value={line.rate} onChange={e => updateLine(idx, "rate", e.target.value)} data-testid={`input-rate-${idx}`} />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {lines.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}>
                                <X className="w-3 h-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {/* Per-line indent suggestion based on this item */}
                        {selectedItem && (() => {
                          const lineMatches = findMatchingIndents(selectedItem.name);
                          if (!lineMatches.length) return null;
                          return (
                            <div className="flex items-center gap-1 pl-1">
                              <span className="text-[10px] text-muted-foreground">Indent for {selectedItem.name}:</span>
                              {lineMatches.map(pi => (
                                <button
                                  key={pi.id}
                                  type="button"
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${form.indentRef === pi.indentNo ? "bg-violet-200 text-violet-800 dark:bg-violet-800/60 dark:text-violet-200" : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 hover:bg-violet-200"}`}
                                  onClick={() => setForm(f => ({ ...f, indentRef: pi.indentNo }))}
                                  data-testid={`line-badge-indent-${idx}-${pi.indentNo}`}
                                >
                                  {pi.indentNo}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}

                  <Button type="button" variant="outline" size="sm" className="text-xs gap-1" onClick={() => setLines(prev => [...prev, emptyLine()])} data-testid="button-add-line">
                    <Plus className="w-3 h-3" /> Add Line
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button type="button" variant="ghost" onClick={cancelForm}>Cancel</Button>
                  <Button type="submit" className="gap-1" disabled={createMutation.isPending} data-testid="button-save-grn">
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                    Save GRN
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Inline add-item dialog */}
        <Dialog open={addItemOpen} onOpenChange={open => { setAddItemOpen(open); if (!open) setAddItemTargetIdx(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add New Item to Catalogue</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Item Name *</Label>
                <Input
                  value={addItemForm.name}
                  onChange={e => setAddItemForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Engine Oil 15W40"
                  data-testid="input-new-item-name"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Category *</Label>
                  <Select value={addItemForm.category} onValueChange={v => setAddItemForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="text-xs" data-testid="select-new-item-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{STORE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">UOM *</Label>
                  <Select value={addItemForm.uom} onValueChange={v => setAddItemForm(f => ({ ...f, uom: v }))}>
                    <SelectTrigger className="text-xs" data-testid="select-new-item-uom"><SelectValue /></SelectTrigger>
                    <SelectContent>{STORE_UOMS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setAddItemOpen(false)}>Cancel</Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!addItemForm.name.trim() || addStoreItemMutation.isPending}
                  onClick={() => addStoreItemMutation.mutate({ name: addItemForm.name.trim(), category: addItemForm.category, uom: addItemForm.uom, isActive: 1 })}
                  data-testid="button-save-new-item"
                >
                  {addStoreItemMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add & Select"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {!selectedId && !showForm && (
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
              <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No GRNs found. Click "New GRN" to create one.</CardContent></Card>
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
                            {grn.acceptanceStatus && grn.acceptanceStatus !== "accepted" && getAcceptanceBadge(grn.acceptanceStatus)}
                            {grn.indentRef && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                                {grn.indentRef}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-medium mt-1">{grn.supplier}</div>
                          {(grn.invoiceNo || grn.invoiceDate) && (
                            <div className="text-xs text-muted-foreground">
                              {grn.invoiceNo ? `Inv: ${grn.invoiceNo}` : ""}
                              {grn.invoiceNo && grn.invoiceDate ? " · " : ""}
                              {grn.invoiceDate ? format(new Date(grn.invoiceDate + "T00:00:00"), "dd MMM yyyy") : ""}
                            </div>
                          )}
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
