import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, Plus, ArrowDownToLine, X, Loader2, Eye, AlertTriangle, Pencil, Check, Clock, Zap, Bell, Ban } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { EditPermissionButton } from "@/components/EditPermissionButton";
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
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-[12px] px-1.5 py-0">ACCEPTED</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[12px] px-1.5 py-0">PARTIAL</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 text-[12px] px-1.5 py-0">REJECTED</Badge>;
    default:
      return null;
  }
}

function getDraftBadge() {
  return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[12px] px-1.5 py-0">DRAFT</Badge>;
}

function getStatusBadgeGrn(status: string) {
  switch (status) {
    case "approved": return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700 text-[12px] px-1.5 py-0">APPROVED</Badge>;
    case "pending": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[12px] px-1.5 py-0">PENDING</Badge>;
    case "completed": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700 text-[12px] px-1.5 py-0">COMPLETED</Badge>;
    case "rejected": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700 text-[12px] px-1.5 py-0">REJECTED</Badge>;
    default: return <Badge variant="outline" className="text-[12px] px-1.5 py-0">{status.toUpperCase()}</Badge>;
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
  isCancelled?: boolean; cancelledAt?: string | null; cancelledBy?: number | null; cancellationReason?: string | null;
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
  const [supplierFilter, setSupplierFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [draftOnly, setDraftOnly] = useState(false);
  const [awaitingPiFilter, setAwaitingPiFilter] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancelDialogId, setCancelDialogId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(detailId ?? null);

  const [editingAcceptance, setEditingAcceptance] = useState(false);
  const [acceptanceEdit, setAcceptanceEdit] = useState({ acceptanceStatus: "accepted", acceptanceRemarks: "" });
  const [finalisingDraft, setFinalisingDraft] = useState(false);
  const [draftFinaliseIndentRef, setDraftFinaliseIndentRef] = useState("");
  const [draftFinaliseOverride, setDraftFinaliseOverride] = useState(false);
  const [draftFinaliseComboSearch, setDraftFinaliseComboSearch] = useState("");
  const [draftFinaliseComboOpen, setDraftFinaliseComboOpen] = useState(false);
  const draftFinaliseComboRef = useRef<HTMLDivElement>(null);
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
  const [grnCategory, setGrnCategory] = useState("Spares");
  const [indentComboSearch, setIndentComboSearch] = useState("");
  const [indentComboOpen, setIndentComboOpen] = useState(false);
  const indentComboRef = useRef<HTMLDivElement>(null);

  const [itemComboSearch, setItemComboSearch] = useState<Record<number, string>>({});
  const [itemComboOpen, setItemComboOpen] = useState<Record<number, boolean>>({});
  const itemComboRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (draftFinaliseComboRef.current && !draftFinaliseComboRef.current.contains(e.target as Node)) {
        setDraftFinaliseComboOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
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

  useEffect(() => {
    setDraftFinaliseIndentRef("");
    setDraftFinaliseComboSearch("");
    setDraftFinaliseOverride(false);
    setFinalisingDraft(false);
  }, [selectedId]);

  const { data: items = [] } = useQuery<StoreItem[]>({ queryKey: ["/api/stores/items"] });
  const { data: sites = [] } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const { data: recentItemIds = [] } = useQuery<number[]>({ queryKey: ["/api/stores/grns/recent-items"] });
  const { data: recentSuppliers = [] } = useQuery<string[]>({ queryKey: ["/api/stores/grns/recent-suppliers"] });
  const { data: usersDir = [] } = useQuery<{ id: number; fullName: string }[]>({ queryKey: ["/api/users/directory"] });
  const userNameMap = useMemo(() => new Map(usersDir.map(u => [u.id, u.fullName])), [usersDir]);

  const formItemIds = useMemo(() => {
    const ids = lines
      .map(l => l.itemId)
      .filter((s): s is string => !!s)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n > 0);
    return [...new Set(ids)];
  }, [lines]);

  const { data: grnSupplierHistory = [] } = useQuery<string[]>({
    queryKey: ["/api/stores/grns/supplier-history", formItemIds.join(",")],
    queryFn: async () => {
      if (formItemIds.length === 0) return [];
      const res = await fetch(
        `/api/stores/grns/supplier-history?itemIds=${formItemIds.join(",")}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json() as Promise<string[]>;
    },
    enabled: (showForm || !!editingDraftId) && formItemIds.length > 0,
    staleTime: 60_000,
  });

  const { data: allIndentsGlobal = [] } = useQuery<PurchaseIndentFull[]>({
    queryKey: ["/api/purchase-indents"],
    select: (data: any[]) =>
      data.map(d => ({
        id: d.id,
        indentNo: d.indentNo,
        status: d.status,
        date: d.date,
        raisedBy: d.raisedBy,
        items: (d.items || []).map((it: any) => ({
          description: it.description || "",
          qty: it.qty,
          uom: it.uom,
          approvedQty: it.approvedQty,
        })),
      })),
  });

  const firstItemName = (() => {
    const firstLine = lines[0];
    if (!firstLine?.itemId) return "";
    return items.find(i => String(i.id) === firstLine.itemId)?.name ?? "";
  })();

  const { data: itemIndents = [] } = useQuery<PurchaseIndentFull[]>({
    queryKey: ["/api/purchase-indents/for-material", firstItemName],
    queryFn: () => {
      const url = firstItemName
        ? `/api/purchase-indents/for-material?name=${encodeURIComponent(firstItemName)}`
        : "/api/purchase-indents/for-material";
      return fetch(url).then(r => r.json());
    },
    select: (data: any[]) => data.map(d => ({
      id: d.id,
      indentNo: d.indentNo,
      status: d.status,
      date: d.date,
      raisedBy: d.raisedBy,
      items: (d.items || []).map((it: any) => ({
        description: it.description || "",
        qty: it.qty,
        uom: it.uom,
        approvedQty: it.approvedQty ?? null,
      })),
    })),
  });

  const itemApprovedIndents = itemIndents.filter(pi => pi.status === "approved");
  const noPiForItem = !!firstItemName && itemApprovedIndents.length === 0;

  const { data: grns = [], isLoading } = useQuery<GrnWithItems[]>({
    queryKey: ["/api/stores/grns", dateFrom, dateTo, indentFilter, supplierFilter, siteFilter, statusFilter, categoryFilter, itemFilter, draftOnly, awaitingPiFilter, showCancelled],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (dateFrom) p.set("dateFrom", dateFrom);
      if (dateTo) p.set("dateTo", dateTo);
      if (indentFilter) p.set("indentRef", indentFilter);
      if (supplierFilter) p.set("supplier", supplierFilter);
      if (siteFilter) p.set("siteId", siteFilter);
      if (statusFilter) p.set("acceptanceStatus", statusFilter);
      if (categoryFilter) p.set("category", categoryFilter);
      if (itemFilter) p.set("item", itemFilter);
      if (showCancelled) p.set("showCancelled", "true");
      if (awaitingPiFilter) {
        p.set("awaitingPi", "true");
      } else if (draftOnly) {
        p.set("status", "draft");
      }
      const res = await fetch(`/api/stores/grns${p.toString() ? "?" + p : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: awaitingPiGrns = [] } = useQuery<GrnWithItems[]>({
    queryKey: ["/api/stores/grns/awaiting-pi-count"],
    queryFn: async () => {
      const res = await fetch("/api/stores/grns?awaitingPi=true");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });
  const awaitingPiCount = awaitingPiGrns.length;

  const STALE_GRN_THRESHOLD_HOURS = 48;
  const { data: staleGrns = [] } = useQuery<GrnWithItems[]>({
    queryKey: ["/api/stores/grns/stale"],
    queryFn: async () => {
      const res = await fetch(`/api/stores/grns/stale?thresholdHours=${STALE_GRN_THRESHOLD_HOURS}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isAdmin || isManager,
    staleTime: 5 * 60_000,
    refetchInterval: 30 * 60_000,
  });
  const [staleAlertDismissed, setStaleAlertDismissed] = useState(false);

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

  const draftFirstItemName = selectedGrn?.items?.[0]?.itemName ?? "";
  const { data: draftItemIndents = [] } = useQuery<PurchaseIndentFull[]>({
    queryKey: ["/api/purchase-indents/for-material", draftFirstItemName],
    queryFn: () => {
      const url = draftFirstItemName
        ? `/api/purchase-indents/for-material?name=${encodeURIComponent(draftFirstItemName)}`
        : "/api/purchase-indents/for-material";
      return fetch(url).then(r => r.json());
    },
    select: (data: any[]) => data.map(d => ({
      id: d.id,
      indentNo: d.indentNo,
      status: d.status,
      date: d.date,
      raisedBy: d.raisedBy,
      items: (d.items || []).map((it: any) => ({
        description: it.description || "",
        qty: it.qty,
        uom: it.uom,
        approvedQty: it.approvedQty ?? null,
      })),
    })),
    enabled: finalisingDraft && !!draftFirstItemName,
  });
  const draftItemApprovedIndents = draftItemIndents.filter(pi => pi.status === "approved");

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
        if (idx === 0) {
          setForm(f => ({ ...f, indentRef: "" }));
          setIndentComboSearch("");
          setIndentOverride(false);
        }
      }
      return next;
    });
  }

  useEffect(() => {
    if (!showForm) return;
    if (editingDraftId) return;
    if (form.indentRef) return;
    if (itemApprovedIndents.length === 1) {
      setForm(f => ({ ...f, indentRef: itemApprovedIndents[0].indentNo }));
    }
  }, [itemApprovedIndents, showForm, editingDraftId]);

  useEffect(() => {
    if (!finalisingDraft) return;
    if (draftFinaliseIndentRef) return;
    if (draftItemApprovedIndents.length === 1) {
      setDraftFinaliseIndentRef(draftItemApprovedIndents[0].indentNo);
    }
  }, [finalisingDraft, draftItemApprovedIndents]);

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
      setGrnCategory("Spares");
      setIndentOverride(false);
      setIndentComboSearch("");
      if (isNew) navigate(searchParams.get("returnTo") || "/stores/grns");
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


  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("POST", `/api/stores/grns/${id}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      toast({ title: "GRN cancelled" });
      setCancelDialogId(null);
      setCancelReason("");
      if (selectedId && selectedId === cancelMutation.variables?.id) setSelectedId(null);
    },
    onError: () => toast({ title: "Failed to cancel GRN", variant: "destructive" }),
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
    const selectedPI = allIndentsGlobal.find(pi => pi.indentNo === form.indentRef);
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
    setEditingDraftId(null);
    setEditingDraftNumber("");
    if (isNew) navigate(searchParams.get("returnTo") || "/stores/grns");
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

        {/* Stale draft GRN alert for managers/admins */}
        {(isAdmin || isManager) && !staleAlertDismissed && staleGrns.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-3" data-testid="alert-stale-grns">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {staleGrns.length === 1
                  ? "1 draft GRN has been waiting for a PI for over 48 hours"
                  : `${staleGrns.length} draft GRNs have been waiting for a PI for over 48 hours`}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {staleGrns.map(g => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setStaleAlertDismissed(false);
                      setAwaitingPiFilter(false);
                      setDraftOnly(false);
                      setSelectedId(g.id);
                    }}
                    className="inline-flex items-center gap-1 text-sm font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-600 rounded px-1.5 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors"
                    data-testid={`button-stale-grn-${g.id}`}
                  >
                    {g.grnNumber}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setStaleAlertDismissed(true)}
              className="text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200 flex-shrink-0"
              data-testid="button-dismiss-stale-alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
                    {selectedGrn.status === "draft" && !selectedGrn.indentRef && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[12px] px-1.5 py-0" data-testid="badge-detail-awaiting-pi">Awaiting PI</Badge>
                    )}
                    {selectedGrn.status === "draft" && selectedGrn.indentRef && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700 text-[12px] px-1.5 py-0" data-testid="badge-detail-ready-finalise">Ready to Finalise</Badge>
                    )}
                    {(() => { const s = selectedGrn.siteId ? sites.find(x => x.id === selectedGrn.siteId) : null; return s ? <Badge variant="outline" className="text-[12px] border-amber-400 text-amber-700 dark:text-amber-400">{s.name}</Badge> : <span className="text-sm text-muted-foreground">— No site assigned</span>; })()}
                    {selectedGrn.indentRef && (
                      <Badge variant="outline" className="text-[12px] border-violet-400 text-violet-700 dark:text-violet-400">{selectedGrn.indentRef}</Badge>
                    )}
                  </div>
                  <p className="text-base font-semibold mt-1">{selectedGrn.supplier}</p>
                  {(selectedGrn.invoiceNo || selectedGrn.invoiceDate) && (
                    <p className="text-sm text-muted-foreground">
                      {selectedGrn.invoiceNo ? `Invoice/Challan: ${selectedGrn.invoiceNo}` : ""}
                      {selectedGrn.invoiceNo && selectedGrn.invoiceDate ? " · " : ""}
                      {selectedGrn.invoiceDate ? format(new Date(selectedGrn.invoiceDate + "T00:00:00"), "dd MMM yyyy") : ""}
                    </p>
                  )}
                  {selectedGrn.acceptanceRemarks && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">QC Note:</span> {selectedGrn.acceptanceRemarks}
                    </p>
                  )}
                  {selectedGrn.remarks && <p className="text-sm text-muted-foreground italic mt-1">{selectedGrn.remarks}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedGrn.status === "finalized" && (
                    <EditPermissionButton
                      recordType="stores_grn"
                      recordId={selectedGrn.id}
                      onEditGranted={() => openDraftForEdit(selectedGrn)}
                      size="sm"
                    />
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDetail} data-testid="button-close-detail">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 text-sm">Item</th>
                      <th className="text-left px-3 py-2 text-sm">Category</th>
                      <th className="text-right px-3 py-2 text-sm">Qty</th>
                      <th className="text-left px-2 py-2 text-sm">UOM</th>
                      <th className="text-right px-3 py-2 text-sm">Rate (₹)</th>
                      <th className="text-right px-3 py-2 text-sm">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGrn.items.map((it, i) => (
                      <tr key={i} className="border-t" data-testid={`row-detail-item-${i}`}>
                        <td className="px-3 py-2 font-medium">{it.itemName}</td>
                        <td className="px-3 py-2 text-muted-foreground text-sm">{it.category}</td>
                        <td className="px-3 py-2 text-right">{it.qty}</td>
                        <td className="px-2 py-2 text-sm">{it.uom}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{it.rate != null ? it.rate.toLocaleString("en-IN") : "—"}</td>
                        <td className="px-3 py-2 text-right">{it.rate != null ? (it.qty * it.rate).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Inline draft finalise panel */}
              {selectedGrn.status === "draft" && finalisingDraft && (() => {
                const pi = draftFinaliseIndentRef ? (draftItemIndents.find(p => p.indentNo === draftFinaliseIndentRef) ?? allIndentsGlobal.find(p => p.indentNo === draftFinaliseIndentRef) ?? null) : null;
                const isNotApproved = pi && pi.status !== "approved";
                const noDraftPi = !!draftFirstItemName && draftItemApprovedIndents.length === 0;
                const filteredDraftPIs = draftItemApprovedIndents.filter(p =>
                  !draftFinaliseComboSearch || p.indentNo.toLowerCase().includes(draftFinaliseComboSearch.toLowerCase())
                );
                return (
                  <div className="border rounded-md p-3 space-y-3 bg-green-50/60 dark:bg-green-950/20 border-green-300 dark:border-green-800" data-testid="panel-finalise-draft">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" /> Finalise GRN — Link Indent &amp; Confirm
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Indent Reference (optional)</Label>
                        {draftFirstItemName && draftItemApprovedIndents.length > 0 && !draftFinaliseIndentRef && (
                          <span className="text-[12px] text-violet-600 dark:text-violet-400">
                            {draftItemApprovedIndents.length} approved match{draftItemApprovedIndents.length !== 1 ? "es" : ""}
                          </span>
                        )}
                      </div>

                      {/* No approved PI notice — shown as info alongside the combobox */}
                      {noDraftPi && !draftFinaliseIndentRef && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2" data-testid="note-no-approved-pi">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-amber-700 dark:text-amber-300">No approved Purchase Indent for this item. Ask a manager to approve a PI, or manually enter a PI number below and use the override.</p>
                        </div>
                      )}

                      {/* Combobox — always shown */}
                      <div ref={draftFinaliseComboRef} className="relative">
                        <div className="flex items-center gap-1">
                          <Input
                            className="text-sm flex-1 h-8"
                            placeholder={draftFirstItemName ? "Search approved indents for this item…" : "Type PI number to search…"}
                            value={draftFinaliseIndentRef || draftFinaliseComboSearch}
                            onChange={e => {
                              const v = e.target.value;
                              if (draftFinaliseIndentRef) {
                                setDraftFinaliseIndentRef("");
                                setDraftFinaliseComboSearch(v);
                                setDraftFinaliseOverride(false);
                              } else {
                                setDraftFinaliseComboSearch(v);
                              }
                              setDraftFinaliseComboOpen(true);
                            }}
                            onFocus={() => setDraftFinaliseComboOpen(true)}
                            onBlur={() => {
                              const typed = draftFinaliseComboSearch.trim();
                              if (typed && !draftFinaliseIndentRef) {
                                setDraftFinaliseIndentRef(typed);
                                setDraftFinaliseComboSearch("");
                                setDraftFinaliseComboOpen(false);
                              }
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                const typed = draftFinaliseComboSearch.trim();
                                if (typed && !draftFinaliseIndentRef) {
                                  setDraftFinaliseIndentRef(typed);
                                  setDraftFinaliseComboSearch("");
                                  setDraftFinaliseComboOpen(false);
                                }
                              }
                            }}
                            data-testid="input-finalise-indent"
                          />
                          {draftFinaliseIndentRef && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"
                              onClick={() => { setDraftFinaliseIndentRef(""); setDraftFinaliseComboSearch(""); setDraftFinaliseOverride(false); }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        {draftFinaliseComboOpen && !draftFinaliseIndentRef && filteredDraftPIs.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                            <div className="px-2 py-1 text-[12px] text-muted-foreground border-b">Approved indents — select one</div>
                            {filteredDraftPIs.map(p => (
                              <div
                                key={p.id}
                                className="px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-between gap-2"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  setDraftFinaliseIndentRef(p.indentNo);
                                  setDraftFinaliseComboSearch("");
                                  setDraftFinaliseComboOpen(false);
                                  setDraftFinaliseOverride(false);
                                }}
                                data-testid={`option-finalise-indent-${p.indentNo}`}
                              >
                                <span className="font-semibold">{p.indentNo}</span>
                                {getStatusBadgeGrn(p.status)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Selected PI card */}
                      {pi && (
                        <div className={`rounded-md border p-2 text-sm space-y-1 ${isNotApproved ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"}`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadgeGrn(pi.status)}
                            <span className="font-semibold">{pi.indentNo}</span>
                            <span className="text-muted-foreground">· {pi.items.length} item{pi.items.length !== 1 ? "s" : ""}</span>
                          </div>
                          {pi.items.slice(0, 3).map((it, i) => (
                            <div key={i} className="text-muted-foreground">{it.description} — {it.approvedQty ?? it.qty} {it.uom}</div>
                          ))}
                          {pi.items.length > 3 && <div className="text-muted-foreground">+{pi.items.length - 3} more</div>}
                        </div>
                      )}

                      {/* Override checkbox for non-approved PI */}
                      {isNotApproved && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                              This indent is <strong>{pi.status.toUpperCase()}</strong> — not yet approved.
                            </p>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <input type="checkbox" checked={draftFinaliseOverride} onChange={e => setDraftFinaliseOverride(e.target.checked)} data-testid="checkbox-finalise-override" />
                              <span className="text-amber-700 dark:text-amber-300">Override — I understand this indent is not yet approved</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1 h-7 text-sm bg-green-600 hover:bg-green-700 text-white"
                        disabled={finaliseMutation.isPending}
                        data-testid="button-confirm-finalise"
                        onClick={() => {
                          const committedRef = draftFinaliseIndentRef || draftFinaliseComboSearch.trim() || null;
                          if (committedRef && !draftFinaliseIndentRef) {
                            setDraftFinaliseIndentRef(committedRef);
                            setDraftFinaliseComboSearch("");
                          }
                          const resolvedPi = committedRef
                            ? (draftItemIndents.find(p => p.indentNo === committedRef) ?? allIndentsGlobal.find(p => p.indentNo === committedRef) ?? null)
                            : null;
                          if (resolvedPi && resolvedPi.status !== "approved" && !draftFinaliseOverride) {
                            toast({ title: "Indent not approved", description: "Tick the override checkbox to proceed.", variant: "destructive" });
                            return;
                          }
                          finaliseMutation.mutate({ id: selectedGrn.id, indentRef: committedRef });
                        }}
                      >
                        {finaliseMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Finalise GRN
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-sm" onClick={() => setFinalisingDraft(false)} data-testid="button-cancel-finalise">Cancel</Button>
                    </div>
                  </div>
                );
              })()}

              {/* Inline acceptance editor */}
              {editingAcceptance ? (
                <div className="border rounded-md p-3 space-y-3 bg-muted/40" data-testid="panel-acceptance-edit">
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Edit Acceptance Status</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Status</Label>
                      <Select
                        value={acceptanceEdit.acceptanceStatus}
                        onValueChange={v => setAcceptanceEdit(prev => ({ ...prev, acceptanceStatus: v }))}
                      >
                        <SelectTrigger className="h-8 text-sm" data-testid="select-acceptance-status-edit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCEPTANCE_STATUS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">QC Remarks {(acceptanceEdit.acceptanceStatus === "partial" || acceptanceEdit.acceptanceStatus === "rejected") && <span className="text-destructive">*</span>}</Label>
                      <Input
                        className="h-8 text-sm"
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
                      className="gap-1 h-7 text-sm"
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
                      className="h-7 text-sm"
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
                        className="gap-1 text-sm border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/20"
                        data-testid="button-edit-draft"
                        onClick={() => openDraftForEdit(selectedGrn)}
                      >
                        <Pencil className="w-3 h-3" /> Edit Draft
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-sm bg-green-600 hover:bg-green-700 text-white"
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
                      className="gap-1 text-sm"
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
                  {!selectedGrn.isCancelled && (
                    <Button variant="ghost" size="sm" className="text-destructive gap-1"
                      onClick={() => setCancelDialogId(selectedGrn.id)}
                      data-testid="button-cancel-detail-grn">
                      <Ban className="w-4 h-4" /> Cancel GRN
                    </Button>
                  )}
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
                      ? <><span className="text-amber-600 dark:text-amber-400">Edit Draft</span> <span className="font-mono text-sm bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300">{editingDraftNumber}</span></>
                      : "New Goods Receipt Note"}
                  </h3>
                  {!editingDraftId && (
                    <Select value={grnCategory} onValueChange={v => { setGrnCategory(v); }}>
                      <SelectTrigger className="h-7 w-36 text-sm" data-testid="select-grn-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STORE_CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {!editingDraftId && previewNum?.number && (
                    <span className="text-sm font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded" data-testid="text-grn-preview-number">
                      {previewNum.number}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelForm}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* ── GRN Date (first field) ── */}
                <div className="space-y-1.5">
                  <Label className="text-sm">GRN Date *</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required data-testid="input-grn-date" />
                </div>

                {/* ── Items received (item-first) ── */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Items Received *</Label>
                  <p className="text-[12px] text-muted-foreground -mt-1">Select items first — the approved purchase indent will be matched automatically.</p>

                  {/* Column headers */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-1">
                    <span className="col-span-4 text-[12px] text-muted-foreground font-medium">Item</span>
                    <span className="col-span-2 text-[12px] text-muted-foreground font-medium">Qty *</span>
                    <span className="col-span-2 text-[12px] text-muted-foreground font-medium">UOM</span>
                    <span className="col-span-3 text-[12px] text-muted-foreground font-medium">Rate (₹, optional)</span>
                  </div>

                  {lines.map((line, idx) => {
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
                                const recentItems = !search
                                  ? recentItemIds.map(id => items.find(it => it.id === id)).filter((it): it is StoreItem => !!it)
                                  : [];
                                const recentItemIdSet = new Set(recentItems.map(it => it.id));
                                const remainingItems = filteredItems.filter(it => !recentItemIdSet.has(it.id));
                                return (
                                  <>
                                    <div
                                      className="flex items-center border rounded-md h-8 px-2 gap-1 bg-background text-sm cursor-text w-full"
                                      onClick={() => setItemComboOpen(prev => ({ ...prev, [idx]: true }))}
                                      data-testid={`select-item-${idx}`}
                                    >
                                      {isOpen ? (
                                        <input
                                          autoFocus
                                          className="flex-1 min-w-0 outline-none bg-transparent placeholder:text-muted-foreground text-sm"
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
                                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                                        {filteredItems.length === 0 && (
                                          <div className="px-3 py-2 text-muted-foreground italic">No items match "{search}"</div>
                                        )}
                                        {recentItems.length > 0 && (
                                          <>
                                            <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b">
                                              Recently Used
                                            </div>
                                            {recentItems.map(it => (
                                              <div
                                                key={`recent-${it.id}`}
                                                className={`px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 flex items-center justify-between gap-2 ${String(it.id) === line.itemId ? "bg-violet-50 dark:bg-violet-900/20 font-medium" : ""}`}
                                                onMouseDown={e => {
                                                  e.preventDefault();
                                                  updateLine(idx, "itemId", String(it.id));
                                                  updateLine(idx, "uom", it.uom || "NOS");
                                                  setItemComboSearch(prev => ({ ...prev, [idx]: "" }));
                                                  setItemComboOpen(prev => ({ ...prev, [idx]: false }));
                                                }}
                                                data-testid={`option-recent-item-${idx}-${it.id}`}
                                              >
                                                <span className="truncate">{it.name}</span>
                                                <span className="text-muted-foreground flex-shrink-0">({it.category})</span>
                                              </div>
                                            ))}
                                            {remainingItems.length > 0 && (
                                              <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b border-t">
                                                All Items
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {remainingItems.map(it => (
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
                            <Input type="number" min="0" step="any" className="h-8 text-sm" placeholder="Qty" value={line.qty} onChange={e => updateLine(idx, "qty", e.target.value)} data-testid={`input-qty-${idx}`} />
                          </div>
                          <div className="col-span-2">
                            <Input className="h-8 text-sm bg-muted/50" placeholder="UOM" value={line.uom} onChange={e => updateLine(idx, "uom", e.target.value)} data-testid={`input-uom-${idx}`} />
                          </div>
                          <div className="col-span-3">
                            <Input type="number" min="0" step="any" className="h-8 text-sm" placeholder="Rate ₹" value={line.rate} onChange={e => updateLine(idx, "rate", e.target.value)} data-testid={`input-rate-${idx}`} />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {lines.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}>
                                <X className="w-3 h-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <Button type="button" variant="outline" size="sm" className="text-sm gap-1" onClick={() => setLines(prev => [...prev, emptyLine()])} data-testid="button-add-line">
                    <Plus className="w-3 h-3" /> Add Line
                  </Button>
                </div>

                {/* ── Indent reference — item-filtered, approved-only combobox ── */}
                {(() => {
                  const selectedPI = form.indentRef ? allIndentsGlobal.find(pi => pi.indentNo === form.indentRef) : null;
                  const isNotApproved = selectedPI && selectedPI.status !== "approved";
                  const filteredPIs = itemApprovedIndents.filter(pi =>
                    !indentComboSearch || pi.indentNo.toLowerCase().includes(indentComboSearch.toLowerCase())
                  );
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Indent Reference</Label>
                        {firstItemName && itemApprovedIndents.length > 0 && !form.indentRef && (
                          <span className="text-[12px] text-violet-600 dark:text-violet-400">
                            {itemApprovedIndents.length} approved match{itemApprovedIndents.length !== 1 ? "es" : ""}
                          </span>
                        )}
                      </div>

                      {/* Pending PI notice — no approved indent exists for this item */}
                      {noPiForItem && !form.indentRef ? (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2.5" data-testid="notice-pending-pi">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-0.5">
                            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">No approved Purchase Indent for this item</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400">Save as draft and get the indent approved. Once approved, open this draft and link it before finalising.</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Combobox */}
                          <div ref={indentComboRef} className="relative">
                            <div className="flex items-center gap-1">
                              <Input
                                className="text-sm flex-1"
                                placeholder={firstItemName ? "Search approved indents for this item…" : "Type PI number to search…"}
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
                              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto text-sm">
                                <div className="px-2 py-1 text-[12px] text-muted-foreground border-b">Approved indents — select one</div>
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
                            <div className={`rounded-md border p-2.5 space-y-1 text-sm ${isNotApproved ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"}`}>
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
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                  This indent is <strong>{selectedPI.status.toUpperCase()}</strong> — not yet approved.
                                </p>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
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
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ── Supplier / Invoice / Site ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Supplier / Source *</Label>
                    <div className="relative" ref={supplierDropdownRef}>
                      <Input
                        value={form.supplier}
                        onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                        onFocus={() => setSupplierDropdownOpen(true)}
                        placeholder="Supplier name"
                        required
                        autoComplete="off"
                        data-testid="input-grn-supplier"
                        list="grn-supplier-datalist"
                      />
                      {grnSupplierHistory.length > 0 && (
                        <datalist id="grn-supplier-datalist">
                          {grnSupplierHistory.map(s => <option key={s} value={s} />)}
                        </datalist>
                      )}
                      {supplierDropdownOpen && (grnSupplierHistory.length > 0 || recentSuppliers.length > 0) && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-56 overflow-y-auto text-sm" data-testid="dropdown-recent-suppliers">
                          {grnSupplierHistory.length > 0 && (() => {
                            const filtered = grnSupplierHistory.filter(s => !form.supplier || s.toLowerCase().includes(form.supplier.toLowerCase()));
                            if (filtered.length === 0) return null;
                            return (
                              <>
                                <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b">
                                  Past Suppliers for Selected Items
                                </div>
                                {filtered.map(s => (
                                  <div
                                    key={`hist-${s}`}
                                    className={`px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 ${form.supplier.toLowerCase() === s.toLowerCase() ? "bg-violet-50 dark:bg-violet-900/20 font-medium" : ""}`}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      setForm(f => ({ ...f, supplier: s }));
                                      setSupplierDropdownOpen(false);
                                    }}
                                    data-testid={`option-item-supplier-${s.replace(/\s+/g, "-").toLowerCase()}`}
                                  >
                                    {s}
                                  </div>
                                ))}
                              </>
                            );
                          })()}
                          {recentSuppliers.length > 0 && (() => {
                            const histSet = new Set(grnSupplierHistory.map(s => s.toLowerCase()));
                            const filtered = recentSuppliers
                              .filter(s => !histSet.has(s.toLowerCase()))
                              .filter(s => !form.supplier || s.toLowerCase().includes(form.supplier.toLowerCase()));
                            if (filtered.length === 0) return null;
                            return (
                              <>
                                <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b">
                                  Recently Used
                                </div>
                                {filtered.map(s => (
                                  <div
                                    key={`recent-${s}`}
                                    className={`px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20 ${form.supplier.toLowerCase() === s.toLowerCase() ? "bg-violet-50 dark:bg-violet-900/20 font-medium" : ""}`}
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      setForm(f => ({ ...f, supplier: s }));
                                      setSupplierDropdownOpen(false);
                                    }}
                                    data-testid={`option-recent-supplier-${s.replace(/\s+/g, "-").toLowerCase()}`}
                                  >
                                    {s}
                                  </div>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Invoice / Challan No.</Label>
                    <Input value={form.invoiceNo} onChange={e => setForm(f => ({ ...f, invoiceNo: e.target.value }))} placeholder="Optional" data-testid="input-grn-invoice" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Invoice / Challan Date</Label>
                    <Input type="date" value={form.invoiceDate} onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))} data-testid="input-grn-invoice-date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Site / Project (optional)</Label>
                    <Select value={form.siteId} onValueChange={v => setForm(f => ({ ...f, siteId: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="h-9 text-sm" data-testid="select-grn-site">
                        <SelectValue placeholder="— Not assigned —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-sm text-muted-foreground">— Not assigned —</SelectItem>
                        {sites.map(s => (
                          <SelectItem key={s.id} value={String(s.id)} className="text-sm">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">Remarks / Notes</Label>
                  <Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional" data-testid="input-grn-remarks" />
                </div>

                {/* ── Acceptance Status ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-md border bg-muted/30">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Acceptance Status *</Label>
                    <Select value={form.acceptanceStatus} onValueChange={v => setForm(f => ({ ...f, acceptanceStatus: v, acceptanceRemarks: v === "accepted" ? "" : f.acceptanceRemarks }))}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-acceptance-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCEPTANCE_STATUS_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(form.acceptanceStatus === "partial" || form.acceptanceStatus === "rejected") && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">
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
                  {!(noPiForItem && !form.indentRef) && (
                    <Button type="submit" className="gap-1" disabled={createMutation.isPending || replaceMutation.isPending} data-testid="button-save-grn">
                      {(createMutation.isPending || replaceMutation.isPending) && !isSavingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />}
                      {editingDraftId ? "Finalise GRN" : "Save GRN"}
                    </Button>
                  )}
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
                <Label className="text-sm">Item Name *</Label>
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
                  <Label className="text-sm">Category *</Label>
                  <Select value={addItemForm.category} onValueChange={v => setAddItemForm(f => ({ ...f, category: v }))}>
                    <SelectTrigger className="text-sm" data-testid="select-new-item-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{STORE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">UOM *</Label>
                  <Select value={addItemForm.uom} onValueChange={v => setAddItemForm(f => ({ ...f, uom: v }))}>
                    <SelectTrigger className="text-sm" data-testid="select-new-item-uom"><SelectValue /></SelectTrigger>
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
                <Label className="text-sm text-muted-foreground">From</Label>
                <Input type="date" className="h-8 w-36 text-sm" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="input-date-from" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">To</Label>
                <Input type="date" className="h-8 w-36 text-sm" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="input-date-to" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Indent</Label>
                <Input className="h-8 w-36 text-sm" placeholder="PI-YYYY-NNN" value={indentFilter} onChange={e => setIndentFilter(e.target.value)} data-testid="input-indent-filter" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Supplier</Label>
                <Input className="h-8 w-40 text-sm" placeholder="Supplier name" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} data-testid="input-supplier-filter" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Status</Label>
                <Button
                  variant={draftOnly ? "default" : "outline"}
                  size="sm"
                  className={`text-sm h-8 gap-1 ${draftOnly ? "bg-amber-600 hover:bg-amber-700 text-white border-0" : "text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-300 dark:border-amber-700"}`}
                  onClick={() => { setDraftOnly(v => !v); setAwaitingPiFilter(false); }}
                  data-testid="button-drafts-only"
                >
                  <Clock className="w-3 h-3" />
                  {draftOnly ? "Drafts only ×" : "Drafts only"}
                </Button>
                <Button
                  variant={awaitingPiFilter ? "default" : "outline"}
                  size="sm"
                  className={`text-sm h-8 gap-1.5 ${awaitingPiFilter ? "bg-orange-600 hover:bg-orange-700 text-white border-0" : "text-orange-700 border-orange-300 hover:bg-orange-50 dark:text-orange-300 dark:border-orange-700"}`}
                  onClick={() => { setAwaitingPiFilter(v => !v); setDraftOnly(false); }}
                  data-testid="button-awaiting-pi-filter"
                >
                  <AlertTriangle className="w-3 h-3" />
                  {awaitingPiFilter ? "Awaiting PI ×" : "Awaiting PI"}
                  {!awaitingPiFilter && awaitingPiCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-orange-600 text-white text-[12px] font-bold leading-none" data-testid="badge-awaiting-pi-count">
                      {awaitingPiCount}
                    </span>
                  )}
                </Button>
                <Select value={statusFilter || "__all__"} onValueChange={v => setStatusFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-44 text-sm" data-testid="select-status-filter">
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
                <Label className="text-sm text-muted-foreground">Site</Label>
                <Select value={siteFilter} onValueChange={v => setSiteFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-40 text-sm" data-testid="select-site-filter">
                    <SelectValue placeholder="All sites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="text-sm text-muted-foreground">All sites</SelectItem>
                    {sites.map(s => (
                      <SelectItem key={s.id} value={String(s.id)} className="text-sm">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Category</Label>
                <Select value={categoryFilter || "__all__"} onValueChange={v => setCategoryFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-category-filter">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="text-sm text-muted-foreground">All categories</SelectItem>
                    {STORE_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Item</Label>
                <Input className="h-8 w-36 text-sm" placeholder="Item name" value={itemFilter} onChange={e => setItemFilter(e.target.value)} data-testid="input-item-filter" />
              </div>
              {(dateFrom || dateTo || indentFilter || supplierFilter || siteFilter || statusFilter || categoryFilter || itemFilter || draftOnly || awaitingPiFilter) && (
                <Button variant="ghost" size="sm" className="text-sm h-8" onClick={() => { setDateFrom(""); setDateTo(""); setIndentFilter(""); setSupplierFilter(""); setSiteFilter(""); setStatusFilter(""); setCategoryFilter(""); setItemFilter(""); setDraftOnly(false); setAwaitingPiFilter(false); }}>Clear</Button>
              )}
              <Button
                variant={showCancelled ? "secondary" : "ghost"}
                size="sm"
                className={`text-sm h-8 gap-1 ${showCancelled ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}
                onClick={() => setShowCancelled(v => !v)}
                data-testid="button-toggle-cancelled-grns"
              >
                <Ban className="w-3.5 h-3.5" />
                {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
              </Button>
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
                            <span className="text-sm text-muted-foreground">{format(new Date(grn.date + "T00:00:00"), "dd MMM yyyy")}</span>
                            {grn.status === "draft" ? getDraftBadge() : (grn.acceptanceStatus && grn.acceptanceStatus !== "accepted" && getAcceptanceBadge(grn.acceptanceStatus))}
                            {grn.status === "draft" && !grn.indentRef && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 text-[12px] px-1.5 py-0" data-testid={`badge-awaiting-pi-${grn.id}`}>Awaiting PI</Badge>
                            )}
                            {grn.status === "draft" && grn.indentRef && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700 text-[12px] px-1.5 py-0" data-testid={`badge-ready-finalise-${grn.id}`}>Ready to Finalise</Badge>
                            )}
                            {(() => { const s = grn.siteId ? sites.find(x => x.id === grn.siteId) : null; return s ? <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{s.name}</span> : <span className="text-[12px] text-muted-foreground">—</span>; })()}
                            {grn.indentRef && (
                              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                                {grn.indentRef}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-medium mt-1">{grn.supplier}</div>
                          {(grn.invoiceNo || grn.invoiceDate) && (
                            <div className="text-sm text-muted-foreground">
                              {grn.invoiceNo ? `Inv: ${grn.invoiceNo}` : ""}
                              {grn.invoiceNo && grn.invoiceDate ? " · " : ""}
                              {grn.invoiceDate ? format(new Date(grn.invoiceDate + "T00:00:00"), "dd MMM yyyy") : ""}
                            </div>
                          )}
                          <div className="mt-1 text-sm text-muted-foreground">
                            {grn.items.length} item{grn.items.length !== 1 ? "s" : ""}
                            {" — "}
                            {grn.items.map(it => `${it.itemName} (${it.qty} ${it.uom})`).join(", ")}
                          </div>
                          {grn.isCancelled && (
                            <div className="mt-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded px-2 py-1 space-y-0.5">
                              <div>
                                <span className="font-semibold">Cancelled</span>
                                {grn.cancelledAt ? ` on ${format(new Date(grn.cancelledAt), "dd MMM yyyy, HH:mm")}` : ""}
                                {grn.cancelledBy && userNameMap.get(grn.cancelledBy) ? ` by ${userNameMap.get(grn.cancelledBy)}` : ""}
                              </div>
                              {grn.cancellationReason && (
                                <div className="text-red-500 dark:text-red-400">Reason: {grn.cancellationReason}</div>
                              )}
                            </div>
                          )}
                          {(itemFilter || categoryFilter) && (() => {
                            const matched = grn.items.filter(it => {
                              const nameMatch = itemFilter ? it.itemName.toLowerCase().includes(itemFilter.toLowerCase()) : true;
                              const catMatch = categoryFilter ? it.category.toLowerCase() === categoryFilter.toLowerCase() : true;
                              return nameMatch && catMatch;
                            });
                            if (matched.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1 mt-1.5" data-testid={`matched-items-${grn.id}`}>
                                {matched.map(it => (
                                  <span
                                    key={it.itemId}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                                    data-testid={`matched-item-pill-${grn.id}-${it.itemId}`}
                                  >
                                    {it.itemName}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          {grn.isCancelled && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 text-[12px] px-1.5 py-0">CANCELLED</Badge>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(grn)} data-testid={`button-view-grn-${grn.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {!grn.isCancelled && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setCancelDialogId(grn.id); setCancelReason(""); }} data-testid={`button-cancel-grn-${grn.id}`}>
                              <Ban className="w-3.5 h-3.5 text-amber-600" />
                            </Button>
                          )}
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

      {/* Cancel GRN dialog */}
      <Dialog open={cancelDialogId !== null} onOpenChange={open => { if (!open) { setCancelDialogId(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel GRN</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This GRN will be marked as cancelled and its quantities will be removed from stock. This cannot be undone.</p>
          <div className="space-y-2 mt-2">
            <Label className="text-sm">Reason for Cancellation *</Label>
            <Textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Enter reason…"
              rows={3}
              data-testid="textarea-cancel-reason-grn"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => { setCancelDialogId(null); setCancelReason(""); }}>Close</Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => { if (cancelDialogId !== null) cancelMutation.mutate({ id: cancelDialogId, reason: cancelReason }); }}
              data-testid="button-confirm-cancel-grn"
            >
              {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
              Confirm Cancellation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
