import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, Trash2, ArrowDownToLine, X, Loader2, Eye, AlertTriangle, Pencil, Check, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";

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

function getDraftBadge() {
  return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[10px] px-1.5 py-0">DRAFT</Badge>;
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
type Site = { id: number; name: string; isActive: number };
type GrnLine = { itemId: string; qty: string; rate: string; uom: string };
type GrnWithItems = {
  id: number; grnNumber: string; date: string; supplier: string;
  invoiceNo: string | null; invoiceDate: string | null; siteId: number | null;
  indentRef: string | null; remarks: string | null;
  status: string; acceptanceStatus: string; acceptanceRemarks: string | null;
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
  const { isAdmin, isManager } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const returnTo = searchParams.get("returnTo") || "/stores";
  const indentRefFilter = searchParams.get("indentRef") || "";

  const [showForm, setShowForm] = useState(!!isNew);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [indentFilter, setIndentFilter] = useState(indentRefFilter);
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [draftOnly, setDraftOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(detailId ?? null);

  const [editingAcceptance, setEditingAcceptance] = useState(false);
  const [acceptanceEdit, setAcceptanceEdit] = useState({ acceptanceStatus: "accepted", acceptanceRemarks: "" });
  const [finalisingDraft, setFinalisingDraft] = useState(false);
  const [draftFinaliseIndentRef, setDraftFinaliseIndentRef] = useState("");
  const [draftFinaliseOverride, setDraftFinaliseOverride] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const [editingDraftNumber, setEditingDraftNumber] = useState("");

  const [form, setForm] = useState({
    date: TODAY,
    supplier: "",
    invoiceNo: "",
    invoiceDate: "",
    siteId: "",
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

  const [itemComboSearch, setItemComboSearch] = useState<Record<number, string>>({});
  const [itemComboOpen, setItemComboOpen] = useState<Record<number, boolean>>({});
  const itemComboRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [indentOverride, setIndentOverride] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (indentComboRef.current && !indentComboRef.current.contains(e.target as Node)) {
        setIndentComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      Object.entries(itemComboRefs.current).forEach(([idxStr, ref]) => {
        if (ref && !ref.contains(e.target as Node)) {
          const idx = Number(idxStr);
          setItemComboOpen(prev => prev[idx] ? { ...prev, [idx]: false } : prev);
        }
      });
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
  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });

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
    queryKey: ["/api/stores/grns", dateFrom, dateTo, indentFilter, siteFilter, statusFilter, draftOnly],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (indentFilter) p.set("indentRef", indentFilter);
      if (siteFilter) p.set("siteId", siteFilter);
      if (statusFilter) p.set("acceptanceStatus", statusFilter);
      if (draftOnly) p.set("status", "draft");
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
      if (isSavingDraft) {
        toast({ title: "Draft saved", description: "Find it in the GRN list to finalise later." });
      } else {
        toast({ title: "GRN created — items added to stock" });
      }
      setIsSavingDraft(false);
      setShowForm(false);
      setForm({ date: TODAY, supplier: "", invoiceNo: "", invoiceDate: "", siteId: "", indentRef: "", remarks: "", acceptanceStatus: "accepted", acceptanceRemarks: "" });
      setLines([emptyLine()]);
      setSuggestedIndents([]);
      setGrnCategory("Spares");
      setIndentOverride(false);
      setIndentComboSearch("");
      if (isNew) navigate("/stores/grns");
    },
    onError: () => {
      setIsSavingDraft(false);
      toast({ title: "Error creating GRN", variant: "destructive" });
    },
  });

  const finaliseMutation = useMutation({
    mutationFn: ({ id, indentRef }: { id: number; indentRef: string | null }) =>
      apiRequest("PATCH", `/api/stores/grns/${id}`, { status: "finalized", indentRef }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "GRN finalised — items added to stock" });
      setFinalisingDraft(false);
      setDraftFinaliseIndentRef("");
      setDraftFinaliseOverride(false);
    },
    onError: () => toast({ title: "Failed to finalise GRN", variant: "destructive" }),
  });

  const replaceMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/stores/grns/${editingDraftId}`, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      const isDraft = variables?.grn?.status === "draft";
      toast({ title: isDraft ? "Draft updated" : "GRN finalised — items added to stock" });
      setIsSavingDraft(false);
      setShowForm(false);
      setEditingDraftId(null);
      setEditingDraftNumber("");
      setForm({ date: TODAY, supplier: "", invoiceNo: "", invoiceDate: "", siteId: "", indentRef: "", remarks: "", acceptanceStatus: "accepted", acceptanceRemarks: "" });
      setLines([emptyLine()]);
      setSuggestedIndents([]);
      setGrnCategory("Spares");
      setIndentOverride(false);
      setIndentComboSearch("");
    },
    onError: () => {
      setIsSavingDraft(false);
      toast({ title: "Failed to update draft", variant: "destructive" });
    },
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

  const patchAcceptanceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { acceptanceStatus: string; acceptanceRemarks: string | null } }) =>
      apiRequest("PATCH", `/api/stores/grns/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "Acceptance status updated" });
      setEditingAcceptance(false);
    },
    onError: () => toast({ title: "Failed to update acceptance status", variant: "destructive" }),
  });

  function buildGrnPayload(status: "draft" | "finalized") {
    const validLines = lines.filter(l => l.itemId && l.qty);
    return {
      grn: {
        date: form.date,
        supplier: form.supplier || "—",
        invoiceNo: form.invoiceNo || null,
        invoiceDate: form.invoiceDate || null,
        siteId: form.siteId ? parseInt(form.siteId) : null,
        indentRef: form.indentRef || null,
        remarks: form.remarks || null,
        acceptanceStatus: status === "draft" ? "accepted" : form.acceptanceStatus,
        acceptanceRemarks: status === "draft" ? null : (form.acceptanceRemarks || null),
        status,
      },
      items: validLines.map(l => ({
        itemId: parseInt(l.itemId),
        qty: parseFloat(l.qty),
        rate: l.rate ? parseFloat(l.rate) : null,
        uom: l.uom,
      })),
      grnCategory: STORE_CATEGORY_CODES[grnCategory] || "GRN",
    };
  }

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
    const payload = buildGrnPayload("finalized");
    if (editingDraftId) {
      replaceMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleSaveDraft(e: React.MouseEvent) {
    e.preventDefault();
    const validLines = lines.filter(l => l.itemId && l.qty);
    if (!validLines.length) {
      toast({ title: "Add at least one item with quantity", variant: "destructive" });
      return;
    }
    setIsSavingDraft(true);
    const payload = buildGrnPayload("draft");
    if (editingDraftId) {
      replaceMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  function openDraftForEdit(grn: GrnWithItems) {
    setForm({
      date: grn.date,
      supplier: grn.supplier === "—" ? "" : grn.supplier,
      invoiceNo: grn.invoiceNo || "",
      invoiceDate: grn.invoiceDate || "",
      siteId: grn.siteId ? String(grn.siteId) : "",
      indentRef: grn.indentRef || "",
      remarks: grn.remarks || "",
      acceptanceStatus: grn.acceptanceStatus || "accepted",
      acceptanceRemarks: grn.acceptanceRemarks || "",
    });
    setLines(grn.items.length > 0
      ? grn.items.map(it => ({ itemId: String(it.itemId), qty: String(it.qty), rate: it.rate != null ? String(it.rate) : "", uom: it.uom }))
      : [emptyLine()]
    );
    if (grn.items.length > 0) {
      const firstItem = items.find(i => i.id === grn.items[0].itemId);
      if (firstItem?.category && STORE_CATEGORIES.includes(firstItem.category)) {
        setGrnCategory(firstItem.category);
      }
    }
    setEditingDraftId(grn.id);
    setEditingDraftNumber(grn.grnNumber);
    setIndentOverride(false);
    setIndentComboSearch("");
    setSuggestedIndents([]);
    setSelectedId(null);
    navigate("/stores/grns");
    setShowForm(true);
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
    setEditingDraftId(null);
    setEditingDraftNumber("");
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
                    {selectedGrn.status === "draft" ? getDraftBadge() : getAcceptanceBadge(selectedGrn.acceptanceStatus || "accepted")}
                    {(() => { const s = selectedGrn.siteId ? sites.find(x => x.id === selectedGrn.siteId) : null; return s ? <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">{s.name}</Badge> : <span className="text-xs text-muted-foreground">— No site assigned</span>; })()}
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
              {/* Inline draft finalise panel */}
              {selectedGrn.status === "draft" && finalisingDraft && (() => {
                const pi = draftFinaliseIndentRef ? allPurchaseIndents.find(p => p.indentNo === draftFinaliseIndentRef) : null;
                const isNotApproved = pi && pi.status !== "approved";
                return (
                  <div className="border rounded-md p-3 space-y-3 bg-green-50/60 dark:bg-green-950/20 border-green-300 dark:border-green-800" data-testid="panel-finalise-draft">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Finalise GRN — Link Indent &amp; Confirm
                    </p>
                    <div className="space-y-2">
                      <Label className="text-xs">Indent Reference (optional)</Label>
                      <Select value={draftFinaliseIndentRef || "__none__"} onValueChange={v => { setDraftFinaliseIndentRef(v === "__none__" ? "" : v); setDraftFinaliseOverride(false); }}>
                        <SelectTrigger className="h-8 text-xs" data-testid="select-finalise-indent">
                          <SelectValue placeholder="— No indent —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-xs text-muted-foreground">— No indent —</SelectItem>
                          {allPurchaseIndents.map(p => (
                            <SelectItem key={p.id} value={p.indentNo} className="text-xs">{p.indentNo} ({p.status})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {pi && (
                        <div className={`rounded-md border p-2 text-xs space-y-1 ${isNotApproved ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadgeGrn(pi.status)}
                            <span className="font-semibold">{pi.indentNo}</span>
                            <span className="text-muted-foreground">· {pi.items.length} item{pi.items.length !== 1 ? "s" : ""}</span>
                          </div>
                          {pi.items.slice(0, 3).map((it, i) => (
                            <div key={i} className="text-muted-foreground">{it.description} — {it.approvedQty ?? it.qty} {it.uom}</div>
                          ))}
                          {isNotApproved && (
                            <label className="flex items-center gap-2 cursor-pointer pt-1">
                              <input type="checkbox" checked={draftFinaliseOverride} onChange={e => setDraftFinaliseOverride(e.target.checked)} data-testid="checkbox-finalise-override" />
                              <span className="text-amber-700 dark:text-amber-300">Override — I understand this indent is not yet approved</span>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        disabled={finaliseMutation.isPending}
                        data-testid="button-confirm-finalise"
                        onClick={() => {
                          if (isNotApproved && !draftFinaliseOverride) {
                            toast({ title: "Indent not approved", description: "Tick the override checkbox to proceed.", variant: "destructive" });
                            return;
                          }
                          finaliseMutation.mutate({ id: selectedGrn.id, indentRef: draftFinaliseIndentRef || null });
                        }}
                      >
                        {finaliseMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Finalise GRN
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFinalisingDraft(false)} data-testid="button-cancel-finalise">Cancel</Button>
                    </div>
                  </div>
                );
              })()}

              {/* Inline acceptance editor */}
              {editingAcceptance ? (
                <div className="border rounded-md p-3 space-y-3 bg-muted/40" data-testid="panel-acceptance-edit">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Edit Acceptance Status</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Status</Label>
                      <Select
                        value={acceptanceEdit.acceptanceStatus}
                        onValueChange={v => setAcceptanceEdit(prev => ({ ...prev, acceptanceStatus: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid="select-acceptance-status-edit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCEPTANCE_STATUS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">QC Remarks {(acceptanceEdit.acceptanceStatus === "partial" || acceptanceEdit.acceptanceStatus === "rejected") && <span className="text-destructive">*</span>}</Label>
                      <Input
                        className="h-8 text-xs"
                        value={acceptanceEdit.acceptanceRemarks}
                        onChange={e => setAcceptanceEdit(prev => ({ ...prev, acceptanceRemarks: e.target.value }))}
                        placeholder="Reason / note"
                        data-testid="input-acceptance-remarks-edit"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1 h-7 text-xs"
                      disabled={patchAcceptanceMutation.isPending}
                      data-testid="button-save-acceptance"
                      onClick={() => {
                        if ((acceptanceEdit.acceptanceStatus === "partial" || acceptanceEdit.acceptanceStatus === "rejected") && !acceptanceEdit.acceptanceRemarks.trim()) {
                          toast({ title: "Please provide a reason for partial/rejected status", variant: "destructive" });
                          return;
                        }
                        patchAcceptanceMutation.mutate({
                          id: selectedGrn.id,
                          data: {
                            acceptanceStatus: acceptanceEdit.acceptanceStatus,
                            acceptanceRemarks: acceptanceEdit.acceptanceRemarks.trim() || null,
                          },
                        });
                      }}
                    >
                      {patchAcceptanceMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditingAcceptance(false)}
                      data-testid="button-cancel-acceptance-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={closeDetail} data-testid="button-back-to-list" className="gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back to list
                </Button>
                <div className="flex items-center gap-2">
                  {selectedGrn.status === "draft" && !finalisingDraft && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/20"
                        data-testid="button-edit-draft"
                        onClick={() => openDraftForEdit(selectedGrn)}
                      >
                        <Pencil className="w-3 h-3" /> Edit Draft
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                        data-testid="button-finalise-grn"
                        onClick={() => {
                          setDraftFinaliseIndentRef(selectedGrn.indentRef || "");
                          setDraftFinaliseOverride(false);
                          setFinalisingDraft(true);
                        }}
                      >
                        <Zap className="w-3 h-3" /> Finalise GRN
                      </Button>
                    </>
                  )}
                  {(isAdmin || isManager) && !editingAcceptance && selectedGrn.status !== "draft" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      data-testid="button-edit-acceptance"
                      onClick={() => {
                        setAcceptanceEdit({
                          acceptanceStatus: selectedGrn.acceptanceStatus || "accepted",
                          acceptanceRemarks: selectedGrn.acceptanceRemarks || "",
                        });
                        setEditingAcceptance(true);
                      }}
                    >
                      <Pencil className="w-3 h-3" /> Edit Acceptance
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-destructive gap-1"
                    onClick={() => { if (confirm("Delete this GRN?")) { deleteMutation.mutate(selectedGrn.id); closeDetail(); } }}
                    data-testid="button-delete-detail-grn">
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
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
                    <ArrowDownToLine className="w-4 h-4 text-green-600" />
                    {editingDraftId
                      ? <><span className="text-amber-600 dark:text-amber-400">Edit Draft</span> <span className="font-mono text-xs bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300">{editingDraftNumber}</span></>
                      : "New Goods Receipt Note"}
                  </h3>
                  {!editingDraftId && (
                    <Select value={grnCategory} onValueChange={v => { setGrnCategory(v); }}>
                      <SelectTrigger className="h-7 w-36 text-xs" data-testid="select-grn-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STORE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {!editingDraftId && previewNum?.number && (
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">Site / Project (optional)</Label>
                    <Select value={form.siteId} onValueChange={v => setForm(f => ({ ...f, siteId: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-9 text-xs" data-testid="select-grn-site">
                        <SelectValue placeholder="— Not assigned —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-muted-foreground">— Not assigned —</SelectItem>
                        {sites.map(s => (
                          <SelectItem key={s.id} value={String(s.id)} className="text-xs">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <div className="space-y-1">
                          <span className="text-[10px] text-muted-foreground">Matching indent{suggestedIndents.length > 1 ? "s" : ""} based on items:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {suggestedIndents.map(pi => (
                              <button
                                key={pi.id}
                                type="button"
                                className="text-left rounded border border-violet-200 hover:bg-violet-50 bg-white dark:bg-zinc-900 dark:border-violet-800 dark:hover:bg-violet-900/20 px-2 py-1 text-[10px] leading-snug transition-colors"
                                onClick={() => { setForm(f => ({ ...f, indentRef: pi.indentNo })); setIndentComboSearch(""); }}
                                data-testid={`badge-indent-${pi.indentNo}`}
                              >
                                <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                  <span className="font-semibold text-violet-700 dark:text-violet-400">{pi.indentNo}</span>
                                  {getStatusBadgeGrn(pi.status)}
                                </div>
                                {pi.items.slice(0, 3).map((it, i) => (
                                  <div key={i} className="text-muted-foreground">{it.description} — {it.approvedQty ?? it.qty} {it.uom}</div>
                                ))}
                                {pi.items.length > 3 && <div className="text-muted-foreground italic">+{pi.items.length - 3} more</div>}
                              </button>
                            ))}
                          </div>
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
                            <div className="flex-1 min-w-0 relative" ref={el => { itemComboRefs.current[idx] = el; }}>
                              {(() => {
                                const search = itemComboSearch[idx] ?? "";
                                const isOpen = itemComboOpen[idx] ?? false;
                                const selectedItem = items.find(i => String(i.id) === line.itemId);
                                const filteredItems = items.filter(it =>
                                  !search || it.name.toLowerCase().includes(search.toLowerCase()) || it.category.toLowerCase().includes(search.toLowerCase())
                                );
                                return (
                                  <>
                                    <div
                                      className="flex items-center border rounded-md h-8 px-2 gap-1 bg-background text-xs cursor-text w-full"
                                      onClick={() => setItemComboOpen(prev => ({ ...prev, [idx]: true }))}
                                      data-testid={`select-item-${idx}`}
                                    >
                                      {isOpen ? (
                                        <input
                                          autoFocus
                                          className="flex-1 min-w-0 outline-none bg-transparent placeholder:text-muted-foreground text-xs"
                                          placeholder="Type to search items…"
                                          value={search}
                                          onChange={e => setItemComboSearch(prev => ({ ...prev, [idx]: e.target.value }))}
                                          data-testid={`input-item-search-${idx}`}
                                        />
                                      ) : (
                                        <span className={`flex-1 truncate ${selectedItem ? "" : "text-muted-foreground"}`}>
                                          {selectedItem ? selectedItem.name : "Select item…"}
                                        </span>
                                      )}
                                      {selectedItem && !isOpen && (
                                        <button
                                          type="button"
                                          className="ml-auto flex-shrink-0 text-muted-foreground hover:text-foreground"
                                          onMouseDown={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            updateLine(idx, "itemId", "");
                                            updateLine(idx, "uom", "");
                                            setItemComboSearch(prev => ({ ...prev, [idx]: "" }));
                                          }}
                                          data-testid={`button-clear-item-${idx}`}
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    {isOpen && (
                                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-xs">
                                        {filteredItems.length === 0 && (
                                          <div className="px-3 py-2 text-muted-foreground italic">No items match "{search}"</div>
                                        )}
                                        {filteredItems.map(it => (
                                          <div
                                            key={it.id}
                                            className={`px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-between gap-2 ${String(it.id) === line.itemId ? "bg-violet-50 dark:bg-violet-900/20 font-medium" : ""}`}
                                            onMouseDown={e => {
                                              e.preventDefault();
                                              updateLine(idx, "itemId", String(it.id));
                                              updateLine(idx, "uom", it.uom || "NOS");
                                              setItemComboSearch(prev => ({ ...prev, [idx]: "" }));
                                              setItemComboOpen(prev => ({ ...prev, [idx]: false }));
                                            }}
                                            data-testid={`option-item-${idx}-${it.id}`}
                                          >
                                            <span className="truncate">{it.name}</span>
                                            <span className="text-muted-foreground flex-shrink-0">({it.category})</span>
                                          </div>
                                        ))}
                                        <div
                                          className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium border-t flex items-center gap-1"
                                          onMouseDown={e => {
                                            e.preventDefault();
                                            setAddItemTargetIdx(idx);
                                            setAddItemForm({ name: search, category: "Spares", uom: "Nos" });
                                            setAddItemOpen(true);
                                            setItemComboOpen(prev => ({ ...prev, [idx]: false }));
                                          }}
                                          data-testid={`option-add-new-item-${idx}`}
                                        >
                                          <Plus className="w-3 h-3" />
                                          Add new item to catalogue…
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
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
                            <div className="pl-1 space-y-1">
                              <span className="text-[10px] text-muted-foreground">Matching indent{lineMatches.length > 1 ? "s" : ""} for <span className="font-medium">{selectedItem.name}</span>:</span>
                              <div className="flex flex-wrap gap-1.5">
                                {lineMatches.map(pi => {
                                  const isSelected = form.indentRef === pi.indentNo;
                                  return (
                                    <button
                                      key={pi.id}
                                      type="button"
                                      className={`text-left rounded border px-2 py-1 text-[10px] leading-snug transition-colors ${isSelected ? "bg-violet-100 border-violet-400 text-violet-900 dark:bg-violet-800/40 dark:border-violet-600 dark:text-violet-100" : "bg-white border-violet-200 hover:bg-violet-50 dark:bg-zinc-900 dark:border-violet-800 dark:hover:bg-violet-900/20"}`}
                                      onClick={() => setForm(f => ({ ...f, indentRef: pi.indentNo }))}
                                      data-testid={`line-badge-indent-${idx}-${pi.indentNo}`}
                                    >
                                      <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                        <span className="font-semibold text-violet-700 dark:text-violet-400">{pi.indentNo}</span>
                                        {getStatusBadgeGrn(pi.status)}
                                      </div>
                                      {pi.items.slice(0, 3).map((it, i) => (
                                        <div key={i} className="text-muted-foreground">{it.description} — {it.approvedQty ?? it.qty} {it.uom}</div>
                                      ))}
                                      {pi.items.length > 3 && <div className="text-muted-foreground italic">+{pi.items.length - 3} more</div>}
                                    </button>
                                  );
                                })}
                              </div>
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
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1 text-amber-700 border-amber-400 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/20"
                    disabled={createMutation.isPending || replaceMutation.isPending}
                    onClick={handleSaveDraft}
                    data-testid="button-save-draft"
                  >
                    {(createMutation.isPending || replaceMutation.isPending) && isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    {editingDraftId ? "Update Draft" : "Save as Draft"}
                  </Button>
                  <Button type="submit" className="gap-1" disabled={createMutation.isPending || replaceMutation.isPending} data-testid="button-save-grn">
                    {(createMutation.isPending || replaceMutation.isPending) && !isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                    {editingDraftId ? "Finalise GRN" : "Save GRN"}
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
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Button
                  variant={draftOnly ? "default" : "outline"}
                  size="sm"
                  className={`text-xs h-8 gap-1 ${draftOnly ? "bg-amber-600 hover:bg-amber-700 text-white border-0" : "text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700"}`}
                  onClick={() => setDraftOnly(v => !v)}
                  data-testid="button-drafts-only"
                >
                  <Clock className="w-3 h-3" />
                  {draftOnly ? "Drafts only ×" : "Drafts only"}
                </Button>
                <Select value={statusFilter || "__all__"} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-status-filter">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All statuses</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="partial">Partially Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Site</Label>
                <Select value={siteFilter} onValueChange={v => setSiteFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-40 text-xs" data-testid="select-site-filter">
                    <SelectValue placeholder="All sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="text-xs text-muted-foreground">All sites</SelectItem>
                    {sites.map(s => (
                      <SelectItem key={s.id} value={String(s.id)} className="text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(dateFrom || dateTo || indentFilter || siteFilter || statusFilter || draftOnly) && (
                <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setDateFrom(""); setDateTo(""); setIndentFilter(""); setSiteFilter(""); setStatusFilter(""); setDraftOnly(false); }}>Clear</Button>
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
                            {grn.status === "draft" ? getDraftBadge() : (grn.acceptanceStatus && grn.acceptanceStatus !== "accepted" && getAcceptanceBadge(grn.acceptanceStatus))}
                            {(() => { const s = grn.siteId ? sites.find(x => x.id === grn.siteId) : null; return s ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{s.name}</span> : <span className="text-[10px] text-muted-foreground">—</span>; })()}
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
