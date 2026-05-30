import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, ClipboardCheck, ShoppingCart, ArrowRight, Check, X, AlertTriangle, BarChart3, Ban, Lock, Clock, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import type { PurchaseIndentWithItems, PurchaseIndentItem, PurchaseIndentItemHistoryEntry } from "@shared/schema";

type StoreItem = { id: number; name: string; uom: string; category: string };

function FreeTextCombobox({
  value,
  onChange,
  options,
  placeholder,
  className,
  "data-testid": testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value
    ? options.filter(o => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onBlur={e => onChange(e.target.value.toUpperCase())}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="uppercase"
        data-testid={testId}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map(opt => (
            <div
              key={opt}
              className="px-3 py-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialCombobox({
  description,
  storeItems,
  onChange,
  onAddNew,
  "data-testid": testId,
}: {
  description: string;
  storeItems: StoreItem[];
  onChange: (desc: string, uom: string, materialId?: number | null) => void;
  onAddNew?: (typedName: string) => void;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = description
    ? storeItems.filter(m => m.name.toLowerCase().includes(description.toLowerCase()))
    : storeItems;

  const hasExactMatch = storeItems.some(m => m.name.toLowerCase() === description.toLowerCase());
  const showAddNew = !!onAddNew && !!description.trim() && !hasExactMatch;
  const showDropdown = open && (filtered.length > 0 || showAddNew);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={description}
        onChange={e => {
          onChange(e.target.value, "");
          setOpen(true);
        }}
        onBlur={e => onChange(e.target.value.toUpperCase(), "")}
        onFocus={() => setOpen(true)}
        placeholder="TYPE ITEM NAME OR SELECT FROM LIST"
        className="uppercase"
        data-testid={testId}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-52 overflow-y-auto text-sm">
          {filtered.map(m => (
            <div
              key={m.id}
              className="px-3 py-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-between gap-2"
              onMouseDown={e => {
                e.preventDefault();
                onChange(m.name.toUpperCase(), m.uom.toUpperCase(), m.id);
                setOpen(false);
              }}
            >
              <span>{m.name.toUpperCase()}</span>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.category} · {m.uom.toUpperCase()}</span>
            </div>
          ))}
          {showAddNew && (
            <div
              className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 text-blue-600 dark:text-blue-400 border-t border-muted"
              onMouseDown={e => {
                e.preventDefault();
                onAddNew!(description);
                setOpen(false);
              }}
              data-testid="option-add-new-store-item"
            >
              <Plus className="w-3 h-3 flex-shrink-0" />
              <span>Save "{description.trim()}" as new material</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type ViewMode = "list" | "form" | "detail" | "purchase" | "report";

const PURPOSE_OPTIONS = [
  "DG SET", "PLANT", "OFFICE", "SITE", "EQUIPMENT REPAIR", "VEHICLE MAINTENANCE", "OTHER"
] as const;

const PRIORITY_OPTIONS = ["urgent", "normal", "low"] as const;

const UOM_ITEM_OPTIONS = ["NOS", "KG", "METERS", "LITERS", "SET", "PAIR", "BOX", "ROLLS", "PACKETS", "TON", "MT", "CFT", "CUM", "SQM", "RMT"] as const;

interface ItemRow {
  description: string;
  qty: number;
  uom: string;
  purpose: string;
  priority: string;
  materialId: number | null;
  estRate: number | null;
  estAmount: number | null;
  requiredBy: string | null;
}

interface PurchaseUpdateData {
  purchaseStatus: string;
  qtyPurchased: string;
  vendor: string;
  billNo: string;
  rate: string;
  amount: string;
  purchaseRemarks: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-status-pending">PENDING APPROVAL</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" data-testid="badge-status-approved">APPROVED</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700" data-testid="badge-status-completed">COMPLETED</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" data-testid="badge-status-rejected">REJECTED</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-status-unknown">{status.toUpperCase()}</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "urgent":
      return <Badge variant="outline" className="bg-red-50 text-red-600 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">URGENT</Badge>;
    case "low":
      return <Badge variant="outline" className="bg-green-50 text-green-600 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">LOW</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">NORMAL</Badge>;
  }
}

function getItemStatusBadge(status: string | null) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "purchased":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300">PURCHASED</Badge>;
    case "partial":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">PARTIAL</Badge>;
    case "not_purchased":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300">NOT PURCHASED</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600">CANCELLED</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300">PENDING</Badge>;
  }
}

function isTerminalStatus(status: string | null): boolean {
  const s = (status || "").toLowerCase();
  return ["purchased", "partial", "not_purchased", "cancelled"].includes(s);
}

function canCancelItem(status: string | null): boolean {
  const s = (status || "").toLowerCase();
  return !["purchased", "not_purchased", "cancelled"].includes(s);
}

function ItemHistoryTimeline({ itemId }: { itemId: number }) {
  const { data: history, isLoading } = useQuery<PurchaseIndentItemHistoryEntry[]>({
    queryKey: ["/api/purchase-indent-items", itemId, "history"],
    queryFn: () => fetch(`/api/purchase-indent-items/${itemId}/history`).then(r => r.json()),
  });

  if (isLoading) return <div className="py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (!history || history.length === 0) return <p className="text-xs text-muted-foreground py-2">NO HISTORY ENTRIES</p>;

  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case "PURCHASED": return "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300";
      case "PARTIAL": return "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300";
      case "NOT_PURCHASED": return "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300";
      case "CANCELLED": return "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400";
      default: return "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300";
    }
  };

  return (
    <div className="space-y-2 py-2" data-testid={`history-timeline-${itemId}`}>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Clock className="w-3 h-3" /> HISTORY
      </p>
      <div className="relative pl-4 border-l-2 border-muted space-y-3">
        {history.map((entry) => (
          <div key={entry.id} className="relative" data-testid={`history-entry-${entry.id}`}>
            <div className="absolute -left-[1.3rem] w-2.5 h-2.5 rounded-full bg-muted-foreground border-2 border-background" />
            <div className="text-xs space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getActionColor(entry.action)}`}>
                  {entry.action.toUpperCase().replace("_", " ")}
                </Badge>
                <span className="text-muted-foreground">
                  {entry.actionAt ? format(new Date(entry.actionAt), "dd-MMM-yyyy HH:mm").toUpperCase() : "-"}
                </span>
                <span className="font-semibold">BY {entry.actionBy}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-muted-foreground">
                {entry.qtyValue != null && <span>QTY: <strong className="text-foreground">{entry.qtyValue}</strong></span>}
                {entry.vendor && <span>VENDOR: <strong className="text-foreground">{entry.vendor}</strong></span>}
                {entry.billNo && <span>BILL: <strong className="text-foreground">{entry.billNo}</strong></span>}
                {entry.amount != null && <span>AMT: <strong className="text-foreground">{"\u20B9"}{entry.amount.toLocaleString("en-IN")}</strong></span>}
              </div>
              {entry.notes && <p className="text-muted-foreground italic">{entry.notes}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusSteps({ status }: { status: string }) {
  const steps = [
    { key: "raised", label: "RAISED" },
    { key: "approved", label: "APPROVED" },
    { key: "purchasing", label: "PURCHASING" },
    { key: "completed", label: "COMPLETED" },
  ];

  const getStepState = (stepKey: string) => {
    if (status === "rejected") {
      return stepKey === "raised" ? "done" : stepKey === "approved" ? "rejected" : "pending";
    }
    const statusOrder = ["pending", "approved", "purchasing", "completed"];
    const currentIdx = statusOrder.indexOf(status === "pending" ? "pending" : status);
    const stepMap: Record<string, number> = { raised: 0, approved: 1, purchasing: 2, completed: 3 };
    const stepIdx = stepMap[stepKey];
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="status-steps">
      {steps.map((step, i) => {
        const state = getStepState(step.key);
        return (
          <div key={step.key} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
            <span className={`text-xs font-semibold px-2 py-1 rounded-full border uppercase tracking-wide ${
              state === "done" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" :
              state === "active" ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" :
              state === "rejected" ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" :
              "border-muted text-muted-foreground"
            }`}>
              {state === "done" && <Check className="w-3 h-3 inline mr-1" />}
              {state === "rejected" && <X className="w-3 h-3 inline mr-1" />}
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function PurchaseIndents() {
  const { toast } = useToast();
  const { sectionCan, isAdmin } = useAuth();
  const canCreate = sectionCan("site_procurement", "create");
  const canEdit = sectionCan("site_procurement", "edit");
  const canViewStores = sectionCan("stores_inventory", "view");
  const canDelete = isAdmin;
  const canForceClose = isAdmin;
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });

  const [view, setView] = useState<ViewMode>("list");
  const [selectedIndentId, setSelectedIndentId] = useState<number | null>(null);

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formProposedBy, setFormProposedBy] = useState("");
  const [formRaisedBy, setFormRaisedBy] = useState("");
  const [formRemarks, setFormRemarks] = useState("");
  const [formSiteId, setFormSiteId] = useState<number | null>(null);
  const [formItems, setFormItems] = useState<ItemRow[]>([
    { description: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null },
  ]);

  const [editIndentId, setEditIndentId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvedQtys, setApprovedQtys] = useState<Record<number, number>>({});

  const [purchaseUpdates, setPurchaseUpdates] = useState<Record<number, PurchaseUpdateData>>({});

  const [cancelItemId, setCancelItemId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showForceCloseConfirm, setShowForceCloseConfirm] = useState(false);
  const [forceCloseReason, setForceCloseReason] = useState("");
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<number>>(new Set());

  const [addStoreItemOpen, setAddStoreItemOpen] = useState(false);
  const [addStoreItemTargetIdx, setAddStoreItemTargetIdx] = useState<number | null>(null);
  const [addStoreItemForm, setAddStoreItemForm] = useState({ name: "", category: "Aggregate", uom: "NOS" });

  const addStoreItemMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/plant-module/materials", data); return res.json(); },
    onSuccess: (newItem: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      toast({ title: `"${newItem.name}" added to materials catalogue` });
      if (addStoreItemTargetIdx !== null) {
        const updated = [...formItems];
        updated[addStoreItemTargetIdx] = {
          ...updated[addStoreItemTargetIdx],
          description: newItem.name.toUpperCase(),
          uom: (newItem.defaultUom || "NOS").toUpperCase(),
          materialId: newItem.id,
        };
        setFormItems(updated);
      }
      setAddStoreItemOpen(false);
      setAddStoreItemForm({ name: "", category: "Aggregate", uom: "NOS" });
      setAddStoreItemTargetIdx(null);
    },
    onError: () => toast({ title: "Error adding material", variant: "destructive" }),
  });

  const [reportFilterDateFrom, setReportFilterDateFrom] = useState("");
  const [reportFilterDateTo, setReportFilterDateTo] = useState("");
  const [reportFilterStatus, setReportFilterStatus] = useState("all");
  const [reportFilterPurpose, setReportFilterPurpose] = useState("all");
  const [reportFilterVendor, setReportFilterVendor] = useState("");

  const { data: indents, isLoading } = useQuery<PurchaseIndentWithItems[]>({
    queryKey: ["/api/purchase-indents"],
  });

  const { data: summary } = useQuery<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
  }>({
    queryKey: ["/api/purchase-indents/summary"],
  });

  const { data: selectedIndent, isLoading: isLoadingDetail } = useQuery<PurchaseIndentWithItems>({
    queryKey: ["/api/purchase-indents", selectedIndentId],
    enabled: !!selectedIndentId,
  });

  const { data: rawMaterialsList } = useQuery<any[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: sitesList } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
  });
  const storeItemsList: StoreItem[] = (rawMaterialsList || [])
    .filter((m: any) => m.isActive !== 0)
    .map((m: any) => ({ id: m.id, name: m.name, uom: m.defaultUom || "NOS", category: m.category || "General" }));

  const { data: indentGrnCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/stores/indent-grn-counts"],
    enabled: canViewStores,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-indents", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent submitted for approval" });
      resetForm();
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create indent", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/purchase-indents/${selectedIndentId}/approve`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent approved successfully" });
      setView("list");
      setSelectedIndentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to approve indent", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/purchase-indents/${selectedIndentId}/reject`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent rejected" });
      setView("list");
      setSelectedIndentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reject indent", description: err.message, variant: "destructive" });
    },
  });

  const purchaseUpdateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) =>
      apiRequest("PATCH", `/api/purchase-indent-items/${itemId}/purchase-update`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      }
      toast({ title: "Purchase status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update purchase status", description: err.message, variant: "destructive" });
    },
  });

  const cancelItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) =>
      apiRequest("PATCH", `/api/purchase-indent-items/${itemId}/cancel`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      }
      setShowCancelConfirm(false);
      setCancelItemId(null);
      setCancelReason("");
      toast({ title: "Item cancelled successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to cancel item", description: err.message, variant: "destructive" });
    },
  });

  const forceCloseMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("PATCH", `/api/purchase-indents/${selectedIndentId}/force-close`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      }
      setShowForceCloseConfirm(false);
      setForceCloseReason("");
      toast({ title: "Indent force closed successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to force close indent", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/purchase-indents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent updated successfully" });
      resetForm();
      setEditIndentId(null);
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update indent", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      apiRequest("DELETE", `/api/purchase-indents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Indent deleted successfully" });
      setShowDeleteConfirm(false);
      setSelectedIndentId(null);
      setView("list");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete indent", description: err.message, variant: "destructive" });
    },
  });

  const [reviewerNotes, setReviewerNotes] = useState<Record<number, string>>({});

  const notifyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/purchase-indents/${id}/notify`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "Stakeholders notified", description: "Push notification sent to all subscribed devices." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send notification", description: err.message, variant: "destructive" });
    },
  });

  const reviewerNoteMutation = useMutation({
    mutationFn: ({ itemId, note }: { itemId: number; note: string }) =>
      apiRequest("PATCH", `/api/purchase-indent-items/${itemId}/reviewer-note`, { note }),
  });

  const reportQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (reportFilterDateFrom) params.set("dateFrom", reportFilterDateFrom);
    if (reportFilterDateTo) params.set("dateTo", reportFilterDateTo);
    if (reportFilterStatus !== "all") params.set("purchaseStatus", reportFilterStatus);
    if (reportFilterPurpose !== "all") params.set("purpose", reportFilterPurpose);
    if (reportFilterVendor.trim()) params.set("vendor", reportFilterVendor.trim());
    return params.toString();
  }, [reportFilterDateFrom, reportFilterDateTo, reportFilterStatus, reportFilterPurpose, reportFilterVendor]);

  const { data: reportData, isLoading: isLoadingReport } = useQuery<{
    items: Array<{
      itemId: number;
      indentId: number;
      indentNo: string;
      indentDate: string;
      description: string;
      purpose: string;
      priority: string;
      qty: number;
      approvedQty: number | null;
      qtyPurchased: number | null;
      purchaseStatus: string | null;
      vendor: string | null;
      amount: number | null;
      uom: string;
      cancelledBy: string | null;
      cancelledAt: string | null;
    }>;
    summary: {
      totalItems: number;
      fulfillmentRate: number;
      totalSpend: number;
      pending: number;
      purchased: number;
      partial: number;
      cancelled: number;
      notPurchased: number;
    };
  }>({
    queryKey: ["/api/purchase-indents/report", reportQueryParams],
    queryFn: () => fetch(`/api/purchase-indents/report?${reportQueryParams}`).then(r => r.json()),
    enabled: view === "report",
  });

  const toggleHistoryItem = (itemId: number) => {
    setExpandedHistoryItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleCancelItem = () => {
    if (!cancelItemId || !cancelReason.trim()) {
      toast({ title: "Please enter a cancellation reason", variant: "destructive" });
      return;
    }
    cancelItemMutation.mutate({
      itemId: cancelItemId,
      data: { reason: cancelReason.toUpperCase() },
    });
  };

  const handleForceClose = () => {
    if (!forceCloseReason.trim()) {
      toast({ title: "Please enter a reason for force closing", variant: "destructive" });
      return;
    }
    forceCloseMutation.mutate({
      reason: forceCloseReason.toUpperCase(),
    });
  };

  const resetForm = () => {
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormProposedBy("");
    setFormRaisedBy("");
    setFormRemarks("");
    setFormSiteId(null);
    setFormItems([{ description: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null }]);
  };

  const addItemRow = () => {
    setFormItems([...formItems, { description: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null }]);
  };

  const removeItemRow = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: string | number) => {
    const updated = [...formItems];
    (updated[index] as any)[field] = value;
    setFormItems(updated);
  };

  const handleSubmitIndent = () => {
    if (!formProposedBy.trim() || !formRaisedBy.trim()) {
      toast({ title: "Please fill in Proposed By and Raised By", variant: "destructive" });
      return;
    }
    const validItems = formItems.filter(item => item.description.trim());
    if (validItems.length === 0) {
      toast({ title: "Please add at least one item", variant: "destructive" });
      return;
    }

    const payload = {
      date: formDate,
      indentNo: "",
      proposedBy: formProposedBy.toUpperCase(),
      raisedBy: formRaisedBy.toUpperCase(),
      remarks: formRemarks.toUpperCase() || null,
      status: "pending",
      siteId: formSiteId,
      items: validItems.map(item => ({
        description: item.description.toUpperCase(),
        qty: item.qty,
        uom: item.uom,
        purpose: item.purpose,
        priority: item.priority,
        materialId: item.materialId || undefined,
        estRate: item.estRate || undefined,
        estAmount: item.estAmount || undefined,
        requiredBy: (item.priority !== "urgent" && item.requiredBy) ? item.requiredBy : undefined,
      })),
    };

    if (editIndentId) {
      editMutation.mutate({ id: editIndentId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openDetail = (indent: PurchaseIndentWithItems) => {
    setSelectedIndentId(indent.id);
    if (indent.status === "pending") {
      const qtys: Record<number, number> = {};
      const notes: Record<number, string> = {};
      indent.items.forEach(item => {
        qtys[item.id] = item.qty;
        notes[item.id] = (item as any).reviewerNote || "";
      });
      setApprovedQtys(qtys);
      setReviewerNotes(notes);
      setApprovalRemarks("");
      setView("detail");
    } else if (indent.status === "approved" || indent.status === "completed") {
      setPurchaseUpdates({});
      setView("purchase");
    } else {
      setView("detail");
    }
  };

  const handleApprove = () => {
    const approvedItems = Object.entries(approvedQtys).map(([itemId, qty]) => ({
      itemId: Number(itemId),
      approvedQty: qty,
    }));
    approveMutation.mutate({
      approvedItems,
      remarks: approvalRemarks.toUpperCase() || null,
    });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({ title: "Please enter a rejection reason", variant: "destructive" });
      return;
    }
    rejectMutation.mutate({
      reason: rejectionReason.toUpperCase(),
    });
  };

  const handleEditIndent = () => {
    if (selectedIndentId && selectedIndent) {
      setEditIndentId(selectedIndentId);
      setFormDate(selectedIndent.date);
      setFormProposedBy(selectedIndent.proposedBy);
      setFormRaisedBy(selectedIndent.raisedBy);
      setFormRemarks(selectedIndent.remarks || "");
      setFormSiteId((selectedIndent as any).siteId ?? null);
      setFormItems(selectedIndent.items.map(item => ({
        description: item.description,
        qty: item.qty,
        uom: item.uom,
        purpose: item.purpose,
        priority: item.priority,
        materialId: item.materialId || null,
        estRate: item.estRate || null,
        estAmount: (item as any).estAmount || null,
        requiredBy: (item as any).requiredBy || null,
      })));
      setView("form");
    }
  };

  const handleDeleteIndent = () => {
    if (selectedIndentId) {
      deleteMutation.mutate({ id: selectedIndentId });
    }
  };

  const handleSavePurchaseUpdate = (itemId: number) => {
    const update = purchaseUpdates[itemId];
    if (!update || !update.purchaseStatus) {
      toast({ title: "Please select a purchase status", variant: "destructive" });
      return;
    }
    purchaseUpdateMutation.mutate({
      itemId,
      data: {
        purchaseStatus: update.purchaseStatus,
        qtyPurchased: update.qtyPurchased ? parseFloat(update.qtyPurchased) : undefined,
        vendor: update.vendor.toUpperCase() || undefined,
        billNo: update.billNo.toUpperCase() || undefined,
        rate: update.rate ? parseFloat(update.rate) : undefined,
        amount: update.amount ? parseFloat(update.amount) : undefined,
        purchaseRemarks: update.purchaseRemarks.toUpperCase() || undefined,
      },
    });
  };

  const updatePurchaseField = (itemId: number, field: keyof PurchaseUpdateData, value: string) => {
    setPurchaseUpdates(prev => {
      const current = prev[itemId] || {
        purchaseStatus: "", qtyPurchased: "", vendor: "", billNo: "", rate: "", amount: "", purchaseRemarks: ""
      };
      const updated = { ...current, [field]: value };
      if (field === "rate" || field === "qtyPurchased") {
        const qty = field === "qtyPurchased" ? parseFloat(value) : parseFloat(updated.qtyPurchased);
        const rate = field === "rate" ? parseFloat(value) : parseFloat(updated.rate);
        if (!isNaN(qty) && !isNaN(rate)) {
          updated.amount = (qty * rate).toFixed(2);
        }
      }
      return { ...prev, [itemId]: updated };
    });
  };

  const filteredIndents = useMemo(() => {
    if (!indents) return [];
    return indents.filter(indent => {
      if (filterDateFrom && indent.date < filterDateFrom) return false;
      if (filterDateTo && indent.date > filterDateTo) return false;
      if (filterStatus !== "all" && indent.status !== filterStatus) return false;
      if (filterPriority !== "all") {
        const hasPriority = indent.items.some(item => item.priority === filterPriority);
        if (!hasPriority) return false;
      }
      return true;
    });
  }, [indents, filterDateFrom, filterDateTo, filterStatus, filterPriority]);

  const getIndentBorderColor = (status: string) => {
    switch (status) {
      case "pending": return "border-l-amber-500";
      case "approved": return "border-l-emerald-500";
      case "completed": return "border-l-blue-500";
      case "rejected": return "border-l-red-500";
      default: return "border-l-muted";
    }
  };

  const hasUnfulfilledItems = (items: PurchaseIndentItem[]) => {
    return items.some(i => canCancelItem(i.purchaseStatus));
  };

  const getItemPurchaseCount = (items: PurchaseIndentItem[]) => {
    const purchased = items.filter(i => (i.purchaseStatus || "").toLowerCase() === "purchased").length;
    return { purchased, total: items.length };
  };

  const getTotalAmount = (items: PurchaseIndentItem[]) => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      {showCancelConfirm && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-red-500" />
              <p className="font-bold text-red-600 uppercase">CANCEL ITEM</p>
            </div>
            <p className="text-sm text-muted-foreground">THIS ACTION CANNOT BE UNDONE. THE ITEM WILL BE MARKED AS CANCELLED.</p>
            <div>
              <Label className="text-xs uppercase">REASON FOR CANCELLATION</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                onBlur={(e) => setCancelReason(e.target.value.toUpperCase())}
                placeholder="ENTER REASON FOR CANCELLING THIS ITEM..."
                className="uppercase"
                data-testid="input-cancel-reason"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowCancelConfirm(false); setCancelItemId(null); setCancelReason(""); }} data-testid="button-cancel-dismiss">
                DISMISS
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-300"
                disabled={!cancelReason.trim() || cancelItemMutation.isPending}
                onClick={handleCancelItem}
                data-testid="button-confirm-cancel"
              >
                {cancelItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Ban className="w-4 h-4 mr-1" />}
                CONFIRM CANCEL
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showForceCloseConfirm && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              <p className="font-bold text-amber-600 uppercase">FORCE CLOSE INDENT</p>
            </div>
            <p className="text-sm text-muted-foreground">ALL REMAINING UNFULFILLED ITEMS WILL BE CANCELLED AND THE INDENT WILL BE MARKED AS COMPLETED.</p>
            <div>
              <Label className="text-xs uppercase">REASON FOR FORCE CLOSING</Label>
              <Textarea
                value={forceCloseReason}
                onChange={(e) => setForceCloseReason(e.target.value)}
                onBlur={(e) => setForceCloseReason(e.target.value.toUpperCase())}
                placeholder="ENTER REASON FOR FORCE CLOSING THIS INDENT..."
                className="uppercase"
                data-testid="input-force-close-reason"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowForceCloseConfirm(false); setForceCloseReason(""); }} data-testid="button-force-close-dismiss">
                DISMISS
              </Button>
              <Button
                className="bg-amber-600 text-white"
                disabled={!forceCloseReason.trim() || forceCloseMutation.isPending}
                onClick={handleForceClose}
                data-testid="button-confirm-force-close"
              >
                {forceCloseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                FORCE CLOSE
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showDeleteConfirm && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <p className="font-bold text-red-600 uppercase">DELETE INDENT</p>
            </div>
            <p className="text-sm text-muted-foreground">THIS WILL PERMANENTLY DELETE THE INDENT AND ALL ITS ITEMS. THIS ACTION CANNOT BE UNDONE.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} data-testid="button-delete-dismiss">
                CANCEL
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-300"
                disabled={deleteMutation.isPending}
                onClick={handleDeleteIndent}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                DELETE PERMANENTLY
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <Link href={backLink}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FileText className="w-6 h-6 text-amber-500" />
            PURCHASE INDENTS
          </h1>
          <p className="text-sm text-muted-foreground">RAISE, APPROVE & TRACK PURCHASE REQUESTS</p>
        </div>
        {view === "list" && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setView("report")} data-testid="button-report">
              <BarChart3 className="w-4 h-4 mr-1" /> REPORT
            </Button>
            {canCreate && (
              <Button onClick={() => { resetForm(); setView("form"); }} data-testid="button-raise-indent">
                <Plus className="w-4 h-4 mr-1" /> RAISE INDENT
              </Button>
            )}
          </div>
        )}
        {view !== "list" && (
          <Button variant="outline" onClick={() => { setView("list"); setSelectedIndentId(null); setEditIndentId(null); setExpandedHistoryItems(new Set()); setShowDeleteConfirm(false); }} data-testid="button-back-to-list">
            BACK TO LIST
          </Button>
        )}
      </div>

      {view === "list" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card data-testid="card-summary-total">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TOTAL INDENTS</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-total-count">{summary?.total || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-pending">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PENDING APPROVAL</p>
                <p className="text-2xl font-bold mt-1 text-amber-600" data-testid="text-pending-count">{summary?.pending || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-approved">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">APPROVED</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600" data-testid="text-approved-count">{summary?.approved || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-completed">
              <CardContent className="p-4 text-center">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">COMPLETED</p>
                <p className="text-2xl font-bold mt-1 text-blue-600" data-testid="text-completed-count">{summary?.completed || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs uppercase">DATE FROM</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                </div>
                <div>
                  <Label className="text-xs uppercase">DATE TO</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                </div>
                <div>
                  <Label className="text-xs uppercase">STATUS</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL STATUS</SelectItem>
                      <SelectItem value="pending">PENDING</SelectItem>
                      <SelectItem value="approved">APPROVED</SelectItem>
                      <SelectItem value="completed">COMPLETED</SelectItem>
                      <SelectItem value="rejected">REJECTED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase">PRIORITY</Label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger data-testid="filter-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL PRIORITY</SelectItem>
                      <SelectItem value="urgent">URGENT</SelectItem>
                      <SelectItem value="normal">NORMAL</SelectItem>
                      <SelectItem value="low">LOW</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredIndents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-semibold">NO INDENTS FOUND</p>
                <p className="text-sm mt-1">RAISE A NEW INDENT TO GET STARTED</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredIndents.map(indent => {
                const { purchased, total } = getItemPurchaseCount(indent.items);
                const totalAmt = getTotalAmount(indent.items);
                const priorities = Array.from(new Set(indent.items.map(i => i.priority)));
                const purposes = Array.from(new Set(indent.items.map(i => i.purpose)));

                return (
                  <Card
                    key={indent.id}
                    className={`border-l-4 ${getIndentBorderColor(indent.status)} cursor-pointer hover-elevate`}
                    onClick={() => openDetail(indent)}
                    data-testid={`card-indent-${indent.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-base uppercase" data-testid={`text-indent-no-${indent.id}`}>{indent.indentNo}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(indent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                            {" \u2022 "}PROPOSED BY {indent.proposedBy}
                            {" \u2022 "}RAISED BY {indent.raisedBy}
                            {indent.approvedBy && ` \u2022 ${indent.status === "rejected" ? "REJECTED" : "APPROVED"} BY ${indent.approvedBy}`}
                            {totalAmt > 0 && ` \u2022 \u20B9 ${totalAmt.toLocaleString("en-IN")} PURCHASED`}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2 items-center">
                            {(indent as any).siteId && sitesList && (() => {
                              const site = sitesList.find(s => s.id === (indent as any).siteId);
                              return site ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-700" data-testid={`badge-site-${indent.id}`}>
                                  {site.name}
                                </Badge>
                              ) : null;
                            })()}
                            {priorities.map(p => (
                              <span key={p}>{getPriorityBadge(p)}</span>
                            ))}
                            <span className="text-xs text-muted-foreground pt-1">{purposes.join(" / ")}</span>
                            {(() => {
                              const reqDates = indent.items
                                .map(i => (i as any).requiredBy)
                                .filter(Boolean)
                                .sort();
                              const earliest = reqDates[0];
                              if (!earliest) return null;
                              return (
                                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium pt-1" data-testid={`text-req-by-${indent.id}`}>
                                  REQ. BY: {format(new Date(earliest + "T00:00:00"), "dd-MMM").toUpperCase()}
                                </span>
                              );
                            })()}
                          </div>
                          {indent.status === "rejected" && indent.rejectionReason && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              REASON: {indent.rejectionReason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-semibold" data-testid={`text-items-count-${indent.id}`}>
                              {indent.status === "approved" || indent.status === "completed"
                                ? `${purchased}/${total} PURCHASED`
                                : `${total} ITEMS`}
                            </p>
                            {indent.status === "approved" && purchased === 0 && (
                              <p className="text-xs text-emerald-600 mt-0.5">READY TO PURCHASE</p>
                            )}
                            {canViewStores && indentGrnCounts && indentGrnCounts[indent.indentNo] ? (
                              <Link href={`/stores/grns?indentRef=${encodeURIComponent(indent.indentNo)}`}>
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 font-medium underline-offset-2 hover:underline cursor-pointer" data-testid={`text-grn-count-${indent.id}`}>
                                  {indentGrnCounts[indent.indentNo]} GRN{indentGrnCounts[indent.indentNo] > 1 ? "s" : ""} RAISED ↗
                                </p>
                              </Link>
                            ) : canViewStores && indentGrnCounts && (indent.status === "approved" || indent.status === "completed") ? (
                              <Link href={`/stores/grns/new?indentRef=${encodeURIComponent(indent.indentNo)}`}>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-medium underline-offset-2 hover:underline cursor-pointer" data-testid={`text-no-grn-${indent.id}`}>
                                  NO DELIVERY RECORDED ↗
                                </p>
                              </Link>
                            ) : null}
                          </div>
                          {getStatusBadge(indent.status)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "form" && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base uppercase">INDENT DETAILS</CardTitle>
              {editIndentId ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300">EDITING</Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300">NEW</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs uppercase">DATE</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} data-testid="input-date" />
                </div>
                <div>
                  <Label className="text-xs uppercase">INDENT NO.</Label>
                  <Input value="AUTO-GENERATED" disabled className="bg-muted" data-testid="input-indent-no" />
                  <p className="text-xs text-muted-foreground mt-0.5">AUTO-GENERATED ON SAVE</p>
                </div>
                <div>
                  <Label className="text-xs uppercase">SITE</Label>
                  <Select value={formSiteId !== null ? String(formSiteId) : ""} onValueChange={(v) => setFormSiteId(v ? Number(v) : null)}>
                    <SelectTrigger data-testid="select-site">
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sitesList?.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase">PROPOSED BY</Label>
                  <Input
                    value={formProposedBy}
                    onChange={(e) => setFormProposedBy(e.target.value)}
                    onBlur={(e) => setFormProposedBy(e.target.value.toUpperCase())}
                    placeholder="WHO PROPOSED THIS"
                    className="uppercase"
                    data-testid="input-proposed-by"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">PERSON WHO IDENTIFIED THE NEED</p>
                </div>
                <div>
                  <Label className="text-xs uppercase">RAISED BY</Label>
                  <Input
                    value={formRaisedBy}
                    onChange={(e) => setFormRaisedBy(e.target.value)}
                    onBlur={(e) => setFormRaisedBy(e.target.value.toUpperCase())}
                    placeholder="WHO IS RAISING"
                    className="uppercase"
                    data-testid="input-raised-by"
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">PERSON CREATING THIS INDENT</p>
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase">GENERAL REMARKS (OPTIONAL)</Label>
                <Textarea
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  onBlur={(e) => setFormRemarks(e.target.value.toUpperCase())}
                  placeholder="ANY GENERAL NOTES ABOUT THIS INDENT..."
                  className="uppercase"
                  data-testid="input-remarks"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base uppercase">ITEMS REQUIRED</CardTitle>
              <Button variant="outline" size="sm" onClick={addItemRow} data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-1" /> ADD ITEM
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {formItems.map((item, index) => (
                <Card key={index} className="p-3" data-testid={`card-item-row-${index}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground font-medium mt-2 w-5 flex-shrink-0">{index + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <div>
                        <Label className="text-xs">ITEM</Label>
                        <MaterialCombobox
                          description={item.description}
                          storeItems={storeItemsList}
                          onChange={(desc, uom, materialId) => {
                            const updated = [...formItems];
                            updated[index] = {
                              ...updated[index],
                              description: desc,
                              ...(uom ? { uom } : {}),
                              materialId: materialId ?? (desc !== item.description ? null : updated[index].materialId),
                            };
                            setFormItems(updated);
                          }}
                          onAddNew={(typedName) => {
                            setAddStoreItemTargetIdx(index);
                            setAddStoreItemForm({ name: typedName || "", category: "Aggregate", uom: item.uom });
                            setAddStoreItemOpen(true);
                          }}
                          data-testid={`input-item-desc-${index}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">QTY</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => updateItem(index, "qty", parseFloat(e.target.value) || 1)}
                            data-testid={`input-item-qty-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">UOM</Label>
                          <Select value={item.uom} onValueChange={(v) => updateItem(index, "uom", v)}>
                            <SelectTrigger data-testid={`select-item-uom-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UOM_ITEM_OPTIONS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">PURPOSE</Label>
                          <FreeTextCombobox
                            value={item.purpose}
                            onChange={(v) => updateItem(index, "purpose", v)}
                            options={[...PURPOSE_OPTIONS]}
                            placeholder="PURPOSE"
                            data-testid={`input-item-purpose-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">PRIORITY</Label>
                          <Select value={item.priority} onValueChange={(v) => {
                            const updated = [...formItems];
                            updated[index] = { ...updated[index], priority: v, requiredBy: v === "urgent" ? null : updated[index].requiredBy };
                            setFormItems(updated);
                          }}>
                            <SelectTrigger data-testid={`select-item-priority-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="urgent">URGENT</SelectItem>
                              <SelectItem value="normal">NORMAL</SelectItem>
                              <SelectItem value="low">LOW</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {item.priority !== "urgent" && (
                          <div>
                            <Label className="text-xs">REQUIRED BY</Label>
                            <Input
                              type="date"
                              value={item.requiredBy ?? ""}
                              onChange={(e) => {
                                const updated = [...formItems];
                                updated[index] = { ...updated[index], requiredBy: e.target.value || null };
                                setFormItems(updated);
                              }}
                              data-testid={`input-item-required-by-${index}`}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 bg-amber-50 dark:bg-amber-900/10 rounded-md px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap text-muted-foreground">EST. RATE (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.estRate ?? ""}
                            onChange={(e) => {
                              const rate = e.target.value ? parseFloat(e.target.value) : null;
                              const updated = [...formItems];
                              updated[index] = {
                                ...updated[index],
                                estRate: rate,
                                estAmount: rate != null ? Math.round(rate * updated[index].qty) : updated[index].estAmount,
                              };
                              setFormItems(updated);
                            }}
                            placeholder="rate per unit"
                            className="w-28 text-sm"
                            data-testid={`input-item-est-rate-${index}`}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">OR</span>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap text-muted-foreground font-semibold text-amber-700">EST. AMOUNT (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.estAmount ?? ""}
                            onChange={(e) => updateItem(index, "estAmount", e.target.value ? parseFloat(e.target.value) : null as any)}
                            placeholder="total est. ₹"
                            className="w-32 text-sm font-semibold"
                            data-testid={`input-item-est-amount-${index}`}
                          />
                        </div>
                        {!item.estRate && !item.estAmount && (
                          <p className="text-[11px] text-muted-foreground italic">Optional — enter rate or total amount to help admin evaluate</p>
                        )}
                      </div>
                    </div>
                    {formItems.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItemRow(index)}
                        className="text-red-500 flex-shrink-0"
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => { resetForm(); setEditIndentId(null); setView("list"); }} data-testid="button-cancel">
                CANCEL
              </Button>
              <Button
                onClick={handleSubmitIndent}
                disabled={createMutation.isPending || editMutation.isPending}
                data-testid="button-submit-indent"
              >
                {(createMutation.isPending || editMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editIndentId ? "UPDATE INDENT" : "SUBMIT INDENT"}
              </Button>
            </div>
          </Card>
        </>
      )}

      {view === "detail" && (
        <>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedIndent ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base uppercase" data-testid="text-detail-indent-no">{selectedIndent.indentNo}</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedIndent.status !== "completed" && canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-300"
                        onClick={handleEditIndent}
                        data-testid="button-edit-indent"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> EDIT
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300"
                        onClick={() => setShowDeleteConfirm(true)}
                        data-testid="button-delete-indent"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> DELETE
                      </Button>
                    )}
                    {getStatusBadge(selectedIndent.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">DATE</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-date">
                        {format(new Date(selectedIndent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">PROPOSED BY</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-proposed-by">{selectedIndent.proposedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-raised-by">{selectedIndent.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">TOTAL ITEMS</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-items-count">{selectedIndent.items.length} ITEMS</p>
                    </div>
                  </div>
                  {selectedIndent.remarks && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">REMARKS</p>
                      <p className="text-sm uppercase">{selectedIndent.remarks}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedIndent.status} />
                  </div>
                </CardContent>
              </Card>

              {selectedIndent.status === "pending" ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-base uppercase">ITEMS - REVIEW & APPROVE QUANTITIES</CardTitle>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground hidden sm:block">ADMIN CAN REDUCE QTY PER ITEM IF NEEDED</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-300 hover:bg-blue-50"
                        onClick={() => selectedIndentId && notifyMutation.mutate(selectedIndentId)}
                        disabled={notifyMutation.isPending}
                        data-testid="button-notify-stakeholders"
                      >
                        {notifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <span className="mr-1">🔔</span>}
                        NOTIFY
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(selectedIndent as any).notifyMessage && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">🔔</span>
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong className="uppercase">Reviewer Note:</strong> {(selectedIndent as any).notifyMessage}
                        </p>
                      </div>
                    )}
                    {selectedIndent.items.map((item, index) => {
                      const estAmt = (item as any).estAmount ?? (item.estRate && item.qty ? Math.round(item.estRate * item.qty) : null);
                      return (
                      <Card key={item.id} className="p-4" data-testid={`card-approval-item-${item.id}`}>
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <div>
                            <p className="font-bold uppercase">{index + 1}. {item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {(item.estRate || estAmt) && (
                              <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded">
                                ≈ ₹{estAmt?.toLocaleString("en-IN") ?? "—"}
                                {item.estRate && <span className="text-muted-foreground ml-1">@ ₹{item.estRate}/unit</span>}
                              </span>
                            )}
                            {getPriorityBadge(item.priority)}
                            {(item as any).requiredBy && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium" data-testid={`text-detail-req-by-${item.id}`}>
                                REQ. BY: {format(new Date((item as any).requiredBy + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-md flex-wrap">
                          <div className="text-sm">
                            <span className="text-muted-foreground">INTENDED:</span>{" "}
                            <strong>{item.qty} {item.uom}</strong>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-emerald-600 font-semibold">APPROVE QTY:</span>
                            <Input
                              type="number"
                              min={0}
                              max={item.qty}
                              value={approvedQtys[item.id] ?? item.qty}
                              onChange={(e) => setApprovedQtys(prev => ({
                                ...prev,
                                [item.id]: parseFloat(e.target.value) || 0,
                              }))}
                              className="w-20 text-center font-bold text-emerald-600 border-emerald-300 bg-white dark:bg-emerald-900/40"
                              data-testid={`input-approve-qty-${item.id}`}
                            />
                            <span className="text-xs text-muted-foreground">{item.uom}</span>
                            {(approvedQtys[item.id] ?? item.qty) < item.qty && (
                              <span className="text-xs text-amber-600 font-semibold">(REDUCED FROM {item.qty})</span>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">🔔 Note:</span>
                          <Input
                            value={reviewerNotes[item.id] ?? ""}
                            onChange={(e) => setReviewerNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                            onBlur={(e) => {
                              const upper = e.target.value.toUpperCase();
                              setReviewerNotes(prev => ({ ...prev, [item.id]: upper }));
                              const note = upper.trim();
                              reviewerNoteMutation.mutate({ itemId: item.id, note });
                            }}
                            placeholder="Query or note for this item (optional)..."
                            className="h-7 text-xs border-blue-200 focus:border-blue-400 uppercase"
                            data-testid={`input-reviewer-note-${item.id}`}
                          />
                        </div>
                      </Card>
                      );
                    })}
                    {(() => {
                      const totalEst = selectedIndent.items.reduce((sum, item) => {
                        const ea = (item as any).estAmount ?? (item.estRate && item.qty ? item.estRate * item.qty : null);
                        return sum + (ea || 0);
                      }, 0);
                      return totalEst > 0 ? (
                        <div className="flex justify-end items-center gap-2 pt-1 border-t">
                          <span className="text-xs text-muted-foreground uppercase">Total Est. Value:</span>
                          <span className="font-bold text-amber-700 dark:text-amber-400">₹{Math.round(totalEst).toLocaleString("en-IN")}</span>
                        </div>
                      ) : null;
                    })()}

                    <div className="pt-2">
                      <Label className="text-xs uppercase">APPROVAL REMARKS (OPTIONAL)</Label>
                      <Textarea
                        value={approvalRemarks}
                        onChange={(e) => setApprovalRemarks(e.target.value)}
                        onBlur={(e) => setApprovalRemarks(e.target.value.toUpperCase())}
                        placeholder="REASON FOR PARTIAL APPROVAL OR ANY NOTES..."
                        className="uppercase"
                        data-testid="input-approval-remarks"
                      />
                    </div>

                    <div className="pt-2">
                      <Label className="text-xs uppercase">REJECTION REASON (IF REJECTING)</Label>
                      <Textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        onBlur={(e) => setRejectionReason(e.target.value.toUpperCase())}
                        placeholder="REASON FOR REJECTION..."
                        className="uppercase"
                        data-testid="input-rejection-reason"
                      />
                    </div>
                  </CardContent>
                  <div className="flex justify-between items-center p-4 border-t flex-wrap gap-2">
                    {canEdit && (
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-300"
                        onClick={handleReject}
                        disabled={rejectMutation.isPending}
                        data-testid="button-reject"
                      >
                        {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <X className="w-4 h-4 mr-1" />}
                        REJECT
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        className="bg-emerald-600 text-white"
                        onClick={handleApprove}
                        disabled={approveMutation.isPending}
                        data-testid="button-approve"
                      >
                        {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                        APPROVE INDENT
                      </Button>
                    )}
                  </div>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base uppercase">INDENT DETAILS</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedIndent.items.map((item, index) => (
                      <Card key={item.id} className="p-4" data-testid={`card-detail-item-${item.id}`}>
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <div>
                            <p className="font-bold uppercase">{index + 1}. {item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          <div className="flex gap-1 flex-wrap items-center justify-end">
                            {getPriorityBadge(item.priority)}
                            {(item as any).requiredBy && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium" data-testid={`text-detail-req-by-${item.id}`}>
                                REQ. BY: {format(new Date((item as any).requiredBy + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span><span className="text-muted-foreground">QTY:</span> <strong>{item.qty} {item.uom}</strong></span>
                          {item.approvedQty != null && (
                            <>
                              <span className="text-muted-foreground">{"\u2192"}</span>
                              <span><span className="text-muted-foreground">APPROVED:</span>{" "}
                              <strong className="text-emerald-600">{item.approvedQty} {item.uom}</strong>
                              {item.approvedQty < item.qty && (
                                <span className="text-xs text-amber-600 ml-1">(REDUCED)</span>
                              )}</span>
                            </>
                          )}
                          {(() => {
                            const ea = (item as any).estAmount ?? (item.estRate && item.qty ? Math.round(item.estRate * item.qty) : null);
                            return ea ? (
                              <span className="text-xs font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded">
                                ≈ ₹{ea.toLocaleString("en-IN")}
                                {item.estRate ? ` @ ₹${item.estRate}/unit` : ""}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => toggleHistoryItem(item.id)}
                            data-testid={`button-detail-toggle-history-${item.id}`}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            {expandedHistoryItems.has(item.id) ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                            HISTORY
                          </Button>
                          {expandedHistoryItems.has(item.id) && <ItemHistoryTimeline itemId={item.id} />}
                        </div>
                      </Card>
                    ))}
                    {selectedIndent.status === "rejected" && selectedIndent.rejectionReason && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                        <p className="text-sm text-red-700 dark:text-red-300">
                          <strong>REJECTION REASON:</strong> {selectedIndent.rejectionReason}
                        </p>
                      </div>
                    )}
                    {selectedIndent.approvalRemarks && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          <strong>APPROVAL REMARKS:</strong> {selectedIndent.approvalRemarks}
                        </p>
                      </div>
                    )}
                    {(selectedIndent as any).notifyMessage && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">🔔</span>
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          <strong className="uppercase">Reviewer Note:</strong> {(selectedIndent as any).notifyMessage}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>INDENT NOT FOUND</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === "purchase" && (
        <>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedIndent ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base uppercase" data-testid="text-purchase-indent-no">{selectedIndent.indentNo}</CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedIndent.status !== "completed" && canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-300"
                        onClick={handleEditIndent}
                        data-testid="button-edit-indent-purchase"
                      >
                        <Pencil className="w-3 h-3 mr-1" /> EDIT
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300"
                        onClick={() => setShowDeleteConfirm(true)}
                        data-testid="button-delete-indent-purchase"
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> DELETE
                      </Button>
                    )}
                    {getStatusBadge(selectedIndent.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">DATE</p>
                      <p className="font-semibold uppercase">{format(new Date(selectedIndent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">PROPOSED BY</p>
                      <p className="font-semibold uppercase">{selectedIndent.proposedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold uppercase">{selectedIndent.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase">APPROVED BY</p>
                      <p className="font-semibold uppercase">{selectedIndent.approvedBy || "-"} {selectedIndent.approvedAt ? `\u2022 ${selectedIndent.approvedAt}` : ""}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedIndent.status} />
                  </div>
                </CardContent>
              </Card>

              {selectedIndent.status === "approved" && hasUnfulfilledItems(selectedIndent.items) && (
                <div className="flex justify-end">
                  <Button
                    className="bg-amber-600 text-white"
                    onClick={() => setShowForceCloseConfirm(true)}
                    data-testid="button-force-close"
                  >
                    <Lock className="w-4 h-4 mr-1" /> FORCE CLOSE INDENT
                  </Button>
                </div>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base uppercase">ITEMS - PURCHASE STATUS</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {selectedIndent.items.filter(i => i.purchaseStatus).length} OF {selectedIndent.items.length} ITEMS UPDATED
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedIndent.items.map((item, index) => {
                    const itemStatus = (item.purchaseStatus || "").toLowerCase();
                    const isPending = !item.purchaseStatus;
                    const isCancelled = itemStatus === "cancelled";
                    const canCancel = canCancelItem(item.purchaseStatus);
                    const borderColor = itemStatus === "purchased" ? "border-l-emerald-500" :
                      itemStatus === "partial" ? "border-l-amber-500" :
                      itemStatus === "not_purchased" ? "border-l-red-500" :
                      itemStatus === "cancelled" ? "border-l-gray-400" :
                      "border-l-muted";
                    const update = purchaseUpdates[item.id];

                    return (
                      <Card key={item.id} className={`p-4 border-l-4 ${borderColor}`} data-testid={`card-purchase-item-${item.id}`}>
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <div>
                            <p className="font-bold uppercase">{index + 1}. {item.description}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          <div className="flex gap-1 flex-wrap items-center justify-end">
                            {getPriorityBadge(item.priority)}
                            {getItemStatusBadge(item.purchaseStatus)}
                            {(item as any).requiredBy && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium" data-testid={`text-purchase-req-by-${item.id}`}>
                                REQ. BY: {format(new Date((item as any).requiredBy + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm mt-2 flex-wrap">
                          <span>INTENDED: <strong>{item.qty} {item.uom}</strong></span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span>APPROVED: <strong className="text-emerald-600">{item.approvedQty ?? item.qty} {item.uom}</strong></span>
                          {item.approvedQty != null && item.approvedQty < item.qty && (
                            <span className="text-xs text-amber-600">(REDUCED)</span>
                          )}
                          {item.qtyPurchased != null && (
                            <>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span>BOUGHT: <strong className={itemStatus === "purchased" ? "text-emerald-600" : "text-amber-600"}>{item.qtyPurchased} {item.uom}</strong></span>
                            </>
                          )}
                          {itemStatus === "not_purchased" && (
                            <>
                              <ArrowRight className="w-3 h-3 text-muted-foreground" />
                              <span className="text-red-600 font-semibold">NOT PURCHASED</span>
                            </>
                          )}
                        </div>

                        {item.purchaseStatus && itemStatus !== "not_purchased" && (item.vendor || item.billNo || item.rate || item.amount) && (
                          <div className={`mt-2 p-3 rounded-md ${
                            itemStatus === "purchased" ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-amber-50 dark:bg-amber-900/20"
                          }`}>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              {item.vendor && <div><span className="text-muted-foreground">VENDOR:</span> <strong>{item.vendor}</strong></div>}
                              {item.billNo && <div><span className="text-muted-foreground">BILL NO:</span> <strong>{item.billNo}</strong></div>}
                              {item.rate != null && <div><span className="text-muted-foreground">RATE:</span> <strong>{"\u20B9"} {item.rate}</strong></div>}
                              {item.amount != null && <div><span className="text-muted-foreground">AMOUNT:</span> <strong>{"\u20B9"} {item.amount.toLocaleString("en-IN")}</strong></div>}
                            </div>
                            {item.purchaseRemarks && (
                              <p className="text-xs mt-2 text-amber-700 dark:text-amber-300">
                                <strong>REMARKS:</strong> {item.purchaseRemarks}
                              </p>
                            )}
                          </div>
                        )}

                        {itemStatus === "not_purchased" && item.purchaseRemarks && (
                          <div className="mt-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20">
                            <p className="text-xs text-red-700 dark:text-red-300">
                              <strong>REASON:</strong> {item.purchaseRemarks}
                            </p>
                          </div>
                        )}

                        {isCancelled && (
                          <div className="mt-2 p-3 rounded-md bg-gray-100 dark:bg-gray-800">
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              <strong>CANCELLED</strong>
                              {item.cancelledBy && <> BY {item.cancelledBy}</>}
                              {item.cancelledAt && <> ON {item.cancelledAt}</>}
                            </p>
                            {item.purchaseRemarks && (
                              <p className="text-xs text-gray-500 mt-1">REASON: {item.purchaseRemarks}</p>
                            )}
                          </div>
                        )}
                        {(item as any).reviewerNote && (
                          <div className="mt-2 flex items-start gap-1.5">
                            <span className="text-xs">🔔</span>
                            <p className="text-xs text-blue-700 dark:text-blue-300 italic">{(item as any).reviewerNote}</p>
                          </div>
                        )}

                        {canCancel && (
                          <div className="mt-2 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-300"
                              onClick={(e) => { e.stopPropagation(); setCancelItemId(item.id); setShowCancelConfirm(true); }}
                              data-testid={`button-cancel-item-${item.id}`}
                            >
                              <Ban className="w-3 h-3 mr-1" /> CANCEL ITEM
                            </Button>
                          </div>
                        )}

                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground"
                            onClick={() => toggleHistoryItem(item.id)}
                            data-testid={`button-toggle-history-${item.id}`}
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            {expandedHistoryItems.has(item.id) ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                            HISTORY
                          </Button>
                          {expandedHistoryItems.has(item.id) && <ItemHistoryTimeline itemId={item.id} />}
                        </div>

                        {isPending && (
                          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-3">UPDATE PURCHASE STATUS</p>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label className="text-xs">PURCHASE STATUS</Label>
                                <Select
                                  value={update?.purchaseStatus || ""}
                                  onValueChange={(v) => updatePurchaseField(item.id, "purchaseStatus", v)}
                                >
                                  <SelectTrigger data-testid={`select-purchase-status-${item.id}`}>
                                    <SelectValue placeholder="SELECT..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="purchased">PURCHASED</SelectItem>
                                    <SelectItem value="partial">PARTIALLY PURCHASED</SelectItem>
                                    <SelectItem value="not_purchased">NOT PURCHASED</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">QTY PURCHASED</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  max={item.approvedQty ?? item.qty}
                                  value={update?.qtyPurchased || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "qtyPurchased", e.target.value)}
                                  placeholder="0"
                                  data-testid={`input-qty-purchased-${item.id}`}
                                />
                                <p className="text-xs text-muted-foreground mt-0.5">MAX APPROVED: {item.approvedQty ?? item.qty} {item.uom}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label className="text-xs">VENDOR / SUPPLIER</Label>
                                <Input
                                  value={update?.vendor || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "vendor", e.target.value)}
                                  onBlur={(e) => updatePurchaseField(item.id, "vendor", e.target.value.toUpperCase())}
                                  placeholder="VENDOR NAME"
                                  className="uppercase"
                                  data-testid={`input-vendor-${item.id}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">BILL NO.</Label>
                                <Input
                                  value={update?.billNo || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "billNo", e.target.value)}
                                  onBlur={(e) => updatePurchaseField(item.id, "billNo", e.target.value.toUpperCase())}
                                  placeholder="BILL NUMBER"
                                  className="uppercase"
                                  data-testid={`input-bill-no-${item.id}`}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <Label className="text-xs">RATE ({"\u20B9"})</Label>
                                <Input
                                  type="number"
                                  value={update?.rate || ""}
                                  onChange={(e) => updatePurchaseField(item.id, "rate", e.target.value)}
                                  placeholder="0.00"
                                  data-testid={`input-rate-${item.id}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">AMOUNT ({"\u20B9"})</Label>
                                <Input
                                  type="number"
                                  value={update?.amount || ""}
                                  disabled
                                  className="bg-muted"
                                  data-testid={`input-amount-${item.id}`}
                                />
                                <p className="text-xs text-muted-foreground mt-0.5">AUTO-CALCULATED: QTY x RATE</p>
                              </div>
                            </div>
                            <div className="mb-3">
                              <Label className="text-xs">REMARKS / REASON</Label>
                              <Textarea
                                value={update?.purchaseRemarks || ""}
                                onChange={(e) => updatePurchaseField(item.id, "purchaseRemarks", e.target.value)}
                                onBlur={(e) => updatePurchaseField(item.id, "purchaseRemarks", e.target.value.toUpperCase())}
                                placeholder="REASON IF NOT PURCHASED OR PARTIAL, OR ANY NOTES..."
                                className="uppercase"
                                data-testid={`input-purchase-remarks-${item.id}`}
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                onClick={() => handleSavePurchaseUpdate(item.id)}
                                disabled={purchaseUpdateMutation.isPending}
                                data-testid={`button-save-purchase-${item.id}`}
                              >
                                {purchaseUpdateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                SAVE UPDATE
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </CardContent>
                <div className="flex justify-between items-center p-4 border-t flex-wrap gap-2">
                  <div className="text-sm text-muted-foreground">
                    TOTAL PURCHASED: <strong className="text-foreground text-base">{"\u20B9"} {getTotalAmount(selectedIndent.items).toLocaleString("en-IN")}</strong>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>INDENT NOT FOUND</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === "report" && (
        <>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">FILTERS</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs uppercase">DATE FROM</Label>
                  <Input type="date" value={reportFilterDateFrom} onChange={(e) => setReportFilterDateFrom(e.target.value)} data-testid="report-filter-date-from" />
                </div>
                <div>
                  <Label className="text-xs uppercase">DATE TO</Label>
                  <Input type="date" value={reportFilterDateTo} onChange={(e) => setReportFilterDateTo(e.target.value)} data-testid="report-filter-date-to" />
                </div>
                <div>
                  <Label className="text-xs uppercase">PURCHASE STATUS</Label>
                  <Select value={reportFilterStatus} onValueChange={setReportFilterStatus}>
                    <SelectTrigger data-testid="report-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL STATUS</SelectItem>
                      <SelectItem value="purchased">PURCHASED</SelectItem>
                      <SelectItem value="partial">PARTIAL</SelectItem>
                      <SelectItem value="cancelled">CANCELLED</SelectItem>
                      <SelectItem value="not_purchased">NOT PURCHASED</SelectItem>
                      <SelectItem value="pending">PENDING</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase">PURPOSE</Label>
                  <Select value={reportFilterPurpose} onValueChange={setReportFilterPurpose}>
                    <SelectTrigger data-testid="report-filter-purpose">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL PURPOSE</SelectItem>
                      {PURPOSE_OPTIONS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase">VENDOR</Label>
                  <Input
                    value={reportFilterVendor}
                    onChange={(e) => setReportFilterVendor(e.target.value)}
                    onBlur={(e) => setReportFilterVendor(e.target.value.toUpperCase())}
                    placeholder="SEARCH VENDOR..."
                    className="uppercase"
                    data-testid="report-filter-vendor"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoadingReport ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : reportData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card data-testid="report-card-total">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TOTAL ITEMS</p>
                    <p className="text-2xl font-bold mt-1" data-testid="report-text-total">{reportData.summary.totalItems}</p>
                  </CardContent>
                </Card>
                <Card data-testid="report-card-fulfilled">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">FULFILLED %</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600" data-testid="report-text-fulfilled">{reportData.summary.fulfillmentRate.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card data-testid="report-card-spend">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">TOTAL SPEND</p>
                    <p className="text-2xl font-bold mt-1" data-testid="report-text-spend">{"\u20B9"} {reportData.summary.totalSpend.toLocaleString("en-IN")}</p>
                  </CardContent>
                </Card>
                <Card data-testid="report-card-pending">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">PENDING ITEMS</p>
                    <p className="text-2xl font-bold mt-1 text-amber-600" data-testid="report-text-pending">{reportData.summary.pending}</p>
                  </CardContent>
                </Card>
              </div>

              {reportData.items.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">NO ITEMS FOUND</p>
                    <p className="text-sm mt-1">ADJUST FILTERS TO SEE RESULTS</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs" data-testid="report-table">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-3 font-semibold uppercase">INDENT NO</th>
                            <th className="text-left p-3 font-semibold uppercase">DATE</th>
                            <th className="text-left p-3 font-semibold uppercase">ITEM</th>
                            <th className="text-left p-3 font-semibold uppercase">PURPOSE</th>
                            <th className="text-left p-3 font-semibold uppercase">PRIORITY</th>
                            <th className="text-right p-3 font-semibold uppercase">INTENDED</th>
                            <th className="text-right p-3 font-semibold uppercase">APPROVED</th>
                            <th className="text-right p-3 font-semibold uppercase">PURCHASED</th>
                            <th className="text-center p-3 font-semibold uppercase">STATUS</th>
                            <th className="text-left p-3 font-semibold uppercase">VENDOR</th>
                            <th className="text-right p-3 font-semibold uppercase">AMOUNT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.items.map((item) => (
                            <tr
                              key={item.itemId}
                              className="border-b hover-elevate cursor-pointer"
                              onClick={() => {
                                setSelectedIndentId(item.indentId);
                                setView("purchase");
                                setPurchaseUpdates({});
                              }}
                              data-testid={`report-row-${item.itemId}`}
                            >
                              <td className="p-3 font-semibold">{item.indentNo}</td>
                              <td className="p-3">{format(new Date(item.indentDate + "T00:00:00"), "dd-MMM-yy").toUpperCase()}</td>
                              <td className="p-3 max-w-[200px] truncate" title={item.description}>{item.description}</td>
                              <td className="p-3">{item.purpose}</td>
                              <td className="p-3">{getPriorityBadge(item.priority)}</td>
                              <td className="p-3 text-right">{item.qty} {item.uom}</td>
                              <td className="p-3 text-right">{item.approvedQty != null ? `${item.approvedQty} ${item.uom}` : "-"}</td>
                              <td className="p-3 text-right">{item.qtyPurchased != null ? `${item.qtyPurchased} ${item.uom}` : "-"}</td>
                              <td className="p-3 text-center">{getItemStatusBadge(item.purchaseStatus)}</td>
                              <td className="p-3">{item.vendor || "-"}</td>
                              <td className="p-3 text-right">{item.amount != null ? `${"\u20B9"}${item.amount.toLocaleString("en-IN")}` : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </>
      )}

      <Dialog open={addStoreItemOpen} onOpenChange={open => { setAddStoreItemOpen(open); if (!open) setAddStoreItemTargetIdx(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as New Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">MATERIAL NAME *</Label>
              <Input
                value={addStoreItemForm.name}
                onChange={e => setAddStoreItemForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. STONE DUST"
                className="uppercase"
                data-testid="input-new-store-item-name"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">CATEGORY *</Label>
                <Select value={addStoreItemForm.category} onValueChange={v => setAddStoreItemForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="text-xs" data-testid="select-new-store-item-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Aggregate", "Bitumen", "Utility", "LDO", "Spares", "Consumables", "Electricals", "Others"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">DEFAULT UOM *</Label>
                <Select value={addStoreItemForm.uom} onValueChange={v => setAddStoreItemForm(f => ({ ...f, uom: v }))}>
                  <SelectTrigger className="text-xs" data-testid="select-new-store-item-uom"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["NOS", "KG", "TON", "MT", "LITERS", "CUM", "CFT", "SQM", "RMT", "METERS", "SET", "PAIR", "BOX", "ROLL", "PACK"].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Material will be added to the plant materials catalogue and linked to this indent item.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAddStoreItemOpen(false)}>Cancel</Button>
              <Button
                type="button"
                size="sm"
                disabled={!addStoreItemForm.name.trim() || addStoreItemMutation.isPending}
                onClick={() => addStoreItemMutation.mutate({ name: addStoreItemForm.name.trim().toUpperCase(), category: addStoreItemForm.category, defaultUom: addStoreItemForm.uom, isActive: 1 })}
                data-testid="button-save-new-store-item"
              >
                {addStoreItemMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save as New Item"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
