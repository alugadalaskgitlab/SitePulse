import { useState, useMemo, useRef, useEffect, type ComponentType } from "react";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, useSearch, useLocation } from "wouter";
import { useOrigin } from "@/hooks/use-origin";
import { ChevronLeft, Plus, Loader2, Trash2, FileText, ClipboardCheck, ShoppingCart, ArrowRight, Check, X, AlertTriangle, BarChart3, Ban, Lock, LockOpen, Clock, ChevronDown, ChevronUp, Pencil, CheckCircle2, XCircle, PackageCheck, CreditCard, Calendar, Edit2, AlertCircle, ClipboardList, Package, Printer, Warehouse, Camera, Image as ImageIcon } from "lucide-react";
import { EditPermissionButton } from "@/components/EditPermissionButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { format } from "date-fns";
import type { PurchaseIndentWithItems, PurchaseIndentItem, PurchaseIndentItemHistoryEntry, InternalRequisitionWithItems } from "@shared/schema";
import { LocationPicker, locationLabel, SECTION_OPTIONS } from "@/components/LocationPicker";
import type { LocationValue } from "@/components/LocationPicker";
import { useFeatureFlags } from "@/lib/featureFlags";
import { PersonnelCombobox } from "@/components/PersonnelCombobox";
import { AttachmentGallery } from "@/components/AttachmentGallery";
import { AttachmentUploader } from "@/components/AttachmentUploader";

type StoreItem = { id: number; name: string; uom: string; category: string };

type ItemApprovalState = {
  action: 'pending' | 'modifying' | 'rejecting' | 'approved' | 'modified' | 'rejected';
  approvedQty: number;
  modQty: string;
  rejectReason: string;
};

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
  recentItemIds = [],
  onChange,
  onAddNew,
  "data-testid": testId,
}: {
  description: string;
  storeItems: StoreItem[];
  recentItemIds?: number[];
  onChange: (desc: string, uom: string, materialId?: number | null) => void;
  onAddNew?: (typedName: string) => void;
  "data-testid"?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = description
    ? storeItems.filter(m => m.name.toLowerCase().includes(description.toLowerCase()))
    : storeItems;

  const recentItems = !description
    ? recentItemIds.map(id => storeItems.find(m => m.id === id)).filter((m): m is StoreItem => !!m)
    : [];
  const recentItemIdSet = new Set(recentItems.map(m => m.id));
  const remainingItems = filtered.filter(m => !recentItemIdSet.has(m.id));

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
          {recentItems.length > 0 && (
            <>
              <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b">
                Recently Used
              </div>
              {recentItems.map(m => (
                <div
                  key={`recent-${m.id}`}
                  className="px-3 py-2 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 flex items-center justify-between gap-2"
                  onMouseDown={e => {
                    e.preventDefault();
                    onChange(m.name.toUpperCase(), m.uom.toUpperCase(), m.id);
                    setOpen(false);
                  }}
                  data-testid={`option-recent-indent-item-${m.id}`}
                >
                  <span>{m.name.toUpperCase()}</span>
                  <span className="text-[12px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.category} · {m.uom.toUpperCase()}</span>
                </div>
              ))}
              {remainingItems.length > 0 && (
                <div className="px-3 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/50 border-b border-t">
                  All Items
                </div>
              )}
            </>
          )}
          {remainingItems.map(m => (
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
              <span className="text-[12px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.category} · {m.uom.toUpperCase()}</span>
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

type ViewMode = "list" | "form" | "detail" | "purchase" | "procurement" | "report" | "stores";

interface StoreItemVerification {
  stockStatus: string;
  stockAvailableQty: string;
  storesItemNote: string;
  showNote: boolean;
}

interface ProcurementExtra {
  expectedDelivery: string;
  paymentMode: string;
}

const PURPOSE_OPTIONS = [
  "DG SET", "PLANT", "OFFICE", "SITE", "EQUIPMENT REPAIR", "VEHICLE MAINTENANCE", "OTHER"
] as const;

const PRIORITY_OPTIONS = ["urgent", "normal", "low"] as const;

const UOM_ITEM_OPTIONS = ["NOS", "KG", "METERS", "LITERS", "SET", "PAIR", "BOX", "ROLLS", "PACKETS", "TON", "MT", "CFT", "CUM", "SQM", "RMT"] as const;

interface ItemRow {
  description: string;
  spec: string;
  partNo: string;
  qty: number;
  uom: string;
  purpose: string;
  priority: string;
  materialId: number | null;
  estRate: number | null;
  estAmount: number | null;
  requiredBy: string | null;
  procurementRoute: string | null; // 'stores' | 'bulk_plant' | null — auto-filled from material master
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

function getStatusBadge(status: string, storesStatus?: string | null, piType?: string) {
  const isMaterial = piType === "material";
  switch (status) {
    case "pending":
      if (storesStatus === "verified") {
        return <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700" data-testid="badge-status-pending-verified">AWAITING APPROVAL</Badge>;
      }
      if (isMaterial) {
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-status-pending">PENDING APPROVAL</Badge>;
      }
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-status-pending">PENDING STORES</Badge>;
    case "stores_check":
      if (storesStatus === "verified") {
        return <Badge variant="outline" className="bg-cyan-50 text-cyan-700 border-cyan-300 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700" data-testid="badge-status-stores-check">AWAITING APPROVAL</Badge>;
      }
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-status-stores-check-pending">PENDING STORES</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" data-testid="badge-status-approved">APPROVED</Badge>;
    case "ordered":
      return <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700" data-testid="badge-status-ordered">ORDER PLACED</Badge>;
    case "purchaser_actioned":
      return <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700" data-testid="badge-status-purchaser-actioned">PURCHASE IN PROGRESS</Badge>;
    case "awaiting_delivery":
      return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700" data-testid="badge-status-awaiting-delivery">AWAITING DELIVERY</Badge>;
    case "handover_pending":
      return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700" data-testid="badge-status-handover-pending">HANDOVER PENDING</Badge>;
    case "partially_received":
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" data-testid="badge-status-partially-received">PARTIALLY RECEIVED</Badge>;
    case "closed":
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600" data-testid="badge-status-closed">CLOSED</Badge>;
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
    case "ordered":
      return <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-300">ORDER PLACED</Badge>;
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
  // "ordered" is intentionally excluded — ORDERED items await delivery and are never terminal on the client
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
  if (!history || history.length === 0) return <p className="text-sm text-muted-foreground py-2">NO HISTORY ENTRIES</p>;

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
      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <Clock className="w-3 h-3" /> HISTORY
      </p>
      <div className="relative pl-4 border-l-2 border-muted space-y-3">
        {history.map((entry) => (
          <div key={entry.id} className="relative" data-testid={`history-entry-${entry.id}`}>
            <div className="absolute -left-[1.3rem] w-2.5 h-2.5 rounded-full bg-muted-foreground border-2 border-background" />
            <div className="text-sm space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-[12px] px-1.5 py-0 ${getActionColor(entry.action)}`}>
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

function StatusSteps({ status, storesStatus, piType }: { status: string; storesStatus?: string | null; piType?: string }) {
  // Material Indent: RAISED → STOCK INFO (N/A) → APPROVED → ORDERED → COMPLETED
  if (piType === "material") {
    const matSteps = [
      { key: "raised", label: "RAISED" },
      { key: "stock_info", label: "STOCK INFO" },
      { key: "approved", label: "APPROVED" },
      { key: "ordered", label: "ORDERED" },
      { key: "completed", label: "COMPLETED" },
    ];
    const getMatState = (stepKey: string) => {
      if (status === "rejected") return stepKey === "raised" ? "done" : "pending";
      if (status === "pending" || status === "stores_check") {
        return stepKey === "raised" ? "done" : stepKey === "stock_info" ? "bypassed" : stepKey === "approved" ? "active" : "pending";
      }
      if (status === "approved") {
        return (stepKey === "raised" || stepKey === "stock_info" || stepKey === "approved") ? "done" : stepKey === "ordered" ? "active" : "pending";
      }
      if (status === "ordered") {
        return (stepKey === "raised" || stepKey === "stock_info" || stepKey === "approved" || stepKey === "ordered") ? "done" : "pending";
      }
      if (status === "completed") return "done";
      return "pending";
    };
    return (
      <div className="flex items-center gap-1 flex-wrap" data-testid="status-steps">
        {matSteps.map((step, i) => {
          const state = getMatState(step.key);
          return (
            <div key={step.key} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              <span className={`text-sm font-semibold px-2 py-1 rounded-full border uppercase tracking-wide ${
                state === "done" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" :
                state === "active" ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" :
                state === "bypassed" ? "border-slate-300 bg-slate-50 text-slate-400 dark:bg-slate-800/30 dark:text-slate-500 dark:border-slate-700 line-through" :
                "border-muted text-muted-foreground"
              }`}>
                {state === "done" && <Check className="w-3 h-3 inline mr-1" />}
                {step.label}{state === "bypassed" ? " (N/A)" : ""}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  const steps = [
    { key: "raised", label: "RAISED" },
    { key: "stores", label: "STORES" },
    { key: "approved", label: "APPROVED" },
    { key: "actioned", label: "ACTIONED" },
    { key: "purchasing", label: "RECEIPT" },
    { key: "completed", label: "COMPLETED" },
  ];


  // null on an approved/completed indent = stores step was skipped entirely (legacy or pre-stores-workflow)
  const isBypassed = (storesStatus === "bypassed" || storesStatus === null) && (status === "approved" || status === "completed" || status === "purchaser_actioned");

  const getStepState = (stepKey: string) => {
    if (status === "rejected") {
      return stepKey === "raised" ? "done" : stepKey === "stores" ? "rejected" : "pending";
    }
    if (isBypassed && stepKey === "stores") return "bypassed";
    // statusOrder: indices 0..4
    const statusOrder = ["stores_check", "approved", "purchaser_actioned", "purchasing", "completed"];
    const currentIdx = statusOrder.indexOf(status);
    const stepMap: Record<string, number> = { raised: -1, stores: 0, approved: 1, actioned: 2, purchasing: 3, completed: 4 };
    const stepIdx = stepMap[stepKey];
    if (stepIdx < 0) return "done"; // "raised" is always done
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
            <span className={`text-sm font-semibold px-2 py-1 rounded-full border uppercase tracking-wide ${
              state === "done" ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700" :
              state === "active" ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700" :
              state === "rejected" ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" :
              state === "bypassed" ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700" :
              "border-muted text-muted-foreground"
            }`}>
              {state === "done" && <Check className="w-3 h-3 inline mr-1" />}
              {state === "rejected" && <X className="w-3 h-3 inline mr-1" />}
              {state === "bypassed" ? "BYPASSED" : step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function IndentAuditTrail({ indent }: { indent: PurchaseIndentWithItems }) {
  const [open, setOpen] = useState(false);

  type AuditEvent = {
    icon: ComponentType<{ className?: string }>;
    label: string;
    actor: string | null;
    timestamp: string | null;
    note: string | null;
    colorClass: string;
    dotClass: string;
  };

  const events: AuditEvent[] = [];

  const fmt = (ts: string | null | undefined) => {
    if (!ts) return null;
    try {
      return format(new Date(ts), "dd-MMM-yyyy HH:mm").toUpperCase();
    } catch {
      return ts;
    }
  };

  const storesStatus = (indent as any).storesStatus as string | null;
  const storesVerifiedBy = (indent as any).storesVerifiedBy as string | null;
  const storesVerifiedAt = (indent as any).storesVerifiedAt as string | null;
  const createdAt = (indent as any).createdAt as string | null;

  events.push({
    icon: FileText,
    label: "Indent Raised",
    actor: indent.raisedBy,
    timestamp: fmt(createdAt),
    note: null,
    colorClass: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700",
    dotClass: "bg-blue-500",
  });

  const unlockedByName = (indent as any).unlockedByName as string | null;
  const unlockedAt = (indent as any).unlockedAt as string | null;
  const unlockReason = (indent as any).unlockReason as string | null;

  if (indent.lockStatus !== "locked" && (unlockedByName || unlockedAt)) {
    events.push({
      icon: LockOpen,
      label: "Unlocked",
      actor: unlockedByName,
      timestamp: fmt(unlockedAt),
      note: unlockReason,
      colorClass: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700",
      dotClass: "bg-amber-500",
    });
  }

  if (storesStatus === "verified" && storesVerifiedBy) {
    events.push({
      icon: ClipboardCheck,
      label: "Stores Verified",
      actor: storesVerifiedBy,
      timestamp: fmt(storesVerifiedAt),
      note: null,
      colorClass: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700",
      dotClass: "bg-emerald-500",
    });
  } else if (
    storesStatus === "bypassed" ||
    (storesStatus === null &&
      (indent.status === "approved" || indent.status === "completed"))
  ) {
    const bypassNote = (() => {
      const r = indent.approvalRemarks ?? "";
      const m = r.match(/\[BYPASS:\s*(.*?)\]/i);
      return m ? m[1].trim() : null;
    })();
    events.push({
      icon: AlertTriangle,
      label: "Stores Check Bypassed",
      actor: indent.approvedBy ?? null,
      timestamp: null,
      note: bypassNote,
      colorClass: "text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700",
      dotClass: "bg-orange-400",
    });
  }

  if (indent.status === "approved" || indent.status === "completed") {
    const cleanRemarks = (() => {
      const r = indent.approvalRemarks ?? "";
      const stripped = r.replace(/\[BYPASS:[^\]]*\]/gi, "").trim();
      return stripped || null;
    })();
    events.push({
      icon: CheckCircle2,
      label: "Approved",
      actor: indent.approvedBy ?? null,
      timestamp: fmt((indent as any).approvedAt),
      note: cleanRemarks,
      colorClass: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700",
      dotClass: "bg-emerald-600",
    });
  } else if (indent.status === "rejected") {
    events.push({
      icon: XCircle,
      label: "Rejected",
      actor: indent.approvedBy ?? null,
      timestamp: fmt((indent as any).approvedAt),
      note: indent.rejectionReason ?? null,
      colorClass: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700",
      dotClass: "bg-red-500",
    });
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden" data-testid="panel-audit-trail">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="button-toggle-audit-trail"
      >
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <ClipboardList className="w-4 h-4" />
          <span className="text-sm font-semibold uppercase tracking-wide">Audit Trail</span>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-[12px] font-bold">{events.length}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && (
        <div className="px-4 py-4 bg-white dark:bg-card space-y-0" data-testid="audit-trail-events">
          {events.map((ev, i) => {
            const Icon = ev.icon;
            return (
              <div key={i} className="flex gap-3" data-testid={`audit-event-${i}`}>
                <div className="flex flex-col items-center">
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${ev.colorClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {i < events.length - 1 && (
                    <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 my-1" />
                  )}
                </div>
                <div className={`pb-4 ${i === events.length - 1 ? "pb-0" : ""} min-w-0`}>
                  <p className="text-sm font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200">{ev.label}</p>
                  {ev.actor && (
                    <p className="text-sm text-muted-foreground mt-0.5 uppercase">{ev.actor}</p>
                  )}
                  {ev.timestamp && (
                    <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3 inline shrink-0" /> {ev.timestamp}
                    </p>
                  )}
                  {ev.note && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">{ev.note}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PurchaseIndents() {
  const { toast } = useToast();
  const { sectionCan, isAdmin, canApprove, user: currentUser } = useAuth();
  const { rmcEnabled } = useFeatureFlags();
  const canCreate = sectionCan("site_procurement", "create");
  const canEdit = sectionCan("site_procurement", "edit") || isAdmin;
  const canViewStores = sectionCan("stores_inventory", "view");
  const canCreateStores = sectionCan("stores_inventory", "create");
  const isApprover = canApprove("purchase_indents_approve");
  const canDelete = isAdmin;
  const canForceClose = isAdmin;
  const { getPlantBackLink } = useOrigin();
  const backLink = getPlantBackLink({ defaultTab: "operations" });

  const searchString = useSearch();
  const [, navigate] = useLocation();
  const fromIrnId = (() => {
    const sp = new URLSearchParams(searchString);
    const v = sp.get("fromIrnId");
    return v ? parseInt(v) : null;
  })();
  const defaultRaisedFrom: string | null = (() => {
    const sp = new URLSearchParams(searchString);
    const hub = sp.get("from");
    if (hub === "hmp") return "HMP PLANT";
    if (hub === "rmc") return "RMC PLANT";
    if (hub === "equipment") return "EQUIPMENT & FLEET";
    return null;
  })();

  // Task #1240 — pass-through only: prefills the first item row from a
  // shortage/demand link (material/qty/uom). Does not alter the PI schema
  // or approval workflow.
  const prefill = (() => {
    const sp = new URLSearchParams(searchString);
    const material = sp.get("material");
    if (!material) return null;
    const qtyRaw = sp.get("qty");
    return {
      material,
      qty: qtyRaw ? Number(qtyRaw) : 1,
      uom: sp.get("uom") || "NOS",
    };
  })();

  // Task #1240 — project context pass-through: resolve ?boqProjectId= to the
  // BOQ project's linked site so the PI form (like IRN) auto-fills Site and
  // surfaces the project name to the requester.
  const prefillBoqProjectId = (() => {
    const sp = new URLSearchParams(searchString);
    return sp.get("boqProjectId") || "";
  })();

  const prefillRequirementId = (() => {
    const sp = new URLSearchParams(searchString);
    const v = sp.get("requirementId");
    return v ? Number(v) : null;
  })();

  const [view, setView] = useState<ViewMode>(() => (fromIrnId || prefill ? "form" : "list"));
  const [selectedIndentId, setSelectedIndentId] = useState<number | null>(null);
  const [sourceIrnId, setSourceIrnId] = useState<number | null>(fromIrnId);

  const [piFilters, setPiFilters, resetPiFilters] = usePersistedFilters(
    "purchase-indents:filters:v1",
    {
      dateFrom: "",
      dateTo: "",
      status: "all",
      priority: "all",
      location: "all",
    },
  );

  const filterDateFrom = piFilters.dateFrom;
  const filterDateTo = piFilters.dateTo;
  const filterStatus = piFilters.status;
  const filterPriority = piFilters.priority;
  const filterLocation = piFilters.location as string;

  const setFilterDateFrom = (v: string) => setPiFilters((f) => ({ ...f, dateFrom: v }));
  const setFilterDateTo = (v: string) => setPiFilters((f) => ({ ...f, dateTo: v }));
  const setFilterStatus = (v: string) => setPiFilters((f) => ({ ...f, status: v }));
  const setFilterPriority = (v: string) => setPiFilters((f) => ({ ...f, priority: v }));
  const setFilterLocation = (v: string) => setPiFilters((f) => ({ ...f, location: v }));

  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formProposedBy, setFormProposedBy] = useState("");
  const [formRaisedBy, setFormRaisedBy] = useState("");
  const [formRemarks, setFormRemarks] = useState("");
  const [formSiteId, setFormSiteId] = useState<number | null>(null);
  const [formRaisedFrom, setFormRaisedFrom] = useState<string | null>(fromIrnId ? null : defaultRaisedFrom);

  // Task #1240 — project context pass-through: resolve the BOQ project
  // linked to ?boqProjectId= and auto-fill the PI's Site once, mirroring
  // the same behavior added to the IRN form.
  const { data: prefillProject } = useQuery<{ id: number; name: string; siteId: number | null }>({
    queryKey: ["/api/boq/projects", prefillBoqProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/boq/projects/${prefillBoqProjectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Project not found");
      return res.json();
    },
    enabled: !!prefillBoqProjectId,
  });
  const [projectSiteFillApplied, setProjectSiteFillApplied] = useState(false);
  useEffect(() => {
    if (!prefillProject || projectSiteFillApplied) return;
    if (prefillProject.siteId != null && formSiteId == null) {
      setFormSiteId(prefillProject.siteId);
    }
    setProjectSiteFillApplied(true);
  }, [prefillProject, projectSiteFillApplied, formSiteId]);
  const [formItems, setFormItems] = useState<ItemRow[]>([
    prefill
      ? { description: prefill.material, spec: "", partNo: "", qty: prefill.qty, uom: prefill.uom, purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null, procurementRoute: null }
      : { description: "", spec: "", partNo: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null, procurementRoute: null },
  ]);
  const [formPiType, setFormPiType] = useState<"stores" | "material">("stores");


  const [editIndentId, setEditIndentId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [approvedQtys, setApprovedQtys] = useState<Record<number, number>>({});

  const [purchaseUpdates, setPurchaseUpdates] = useState<Record<number, PurchaseUpdateData>>({});
  type ProcureItemData = { vendor?: string; rate?: string; qtyPurchased?: string; expectedDelivery?: string; paymentMode?: string; billNo?: string; purchaseRemarks?: string; purchasedBy?: string };

  const [cancelItemId, setCancelItemId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showForceCloseConfirm, setShowForceCloseConfirm] = useState(false);
  const [forceCloseReason, setForceCloseReason] = useState("");
  const [grnPanelOpen, setGrnPanelOpen] = useState(true);
  const [expandedHistoryItems, setExpandedHistoryItems] = useState<Set<number>>(new Set());

  const [showGrnDialog, setShowGrnDialog] = useState(false);
  const [grnDialogDate, setGrnDialogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [grnDialogSupplier, setGrnDialogSupplier] = useState("");
  const [grnDialogInvoiceNo, setGrnDialogInvoiceNo] = useState("");
  const [grnDialogRemarks, setGrnDialogRemarks] = useState("");
  type GrnDialogLine = { indentItemId: number; description: string; qty: string; rate: string; uom: string; storeItemId: string; itemSearch: string; autoLinked: boolean; approvedQty: number };
  const [grnLines, setGrnLines] = useState<GrnDialogLine[]>([]);
  const [grnOpenDropdownIdx, setGrnOpenDropdownIdx] = useState<number | null>(null);

  const [storeItemVerifications, setStoreItemVerifications] = useState<Record<number, StoreItemVerification>>({});
  const [procurementExtras, setProcurementExtras] = useState<Record<number, ProcurementExtra>>({});
  const [procureItemMode, setProcureItemMode] = useState<Record<number, "ordered" | "received" | null>>({});
  const [procureItemData, setProcureItemData] = useState<Record<number, ProcureItemData>>({});
  const [itemApprovalStates, setItemApprovalStates] = useState<Record<number, ItemApprovalState>>({});

  // Unified purchaser-action form state — one action type per item
  const [purchaserActionOpen, setPurchaserActionOpen] = useState(false);
  type PurchaserActionItemData = {
    purchaseActionType: string;   // "already_purchased" | "ordered" | "not_available" | "recommend_cancellation"
    qty: string;
    orderNo: string;
    orderedByName: string;
    vendor: string;
    rate: string;
    paymentMode: string;
    paidBy: string;
    payerName: string;
    purchaseDate: string;
    expectedDeliveryDate: string;
    billNo: string;
    remarks: string;
  };
  const [purchaserActionData, setPurchaserActionData] = useState<Record<number, PurchaserActionItemData>>({});
  // Record-delivery form state — per ORDERED item
  type DeliveryFormData = { deliveredQty: string; deliveryDate: string; challanNo: string; paymentMode: string; remarks: string };
  const [deliveryForms, setDeliveryForms] = useState<Record<number, DeliveryFormData>>({});
  const [deliveryExpanded, setDeliveryExpanded] = useState<Set<number>>(new Set());
  // Staged photos for Purchaser Action — per-item, keyed by PI item ID (Batch 17)
  const [paPhotos, setPaPhotos] = useState<Record<number, File[]>>({});
  const { uploadFile } = useUpload();
  const addPaPhotos = (itemId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPaPhotos(prev => ({ ...prev, [itemId]: [...(prev[itemId] || []), ...Array.from(files)] }));
  };
  const removePaPhoto = (itemId: number, idx: number) => {
    setPaPhotos(prev => { const copy = { ...prev }; copy[itemId] = (copy[itemId] || []).filter((_, j) => j !== idx); return copy; });
  };
  // Dual-route: Bulk plant receipt dialog (Route B)
  const [bulkReceiptOpen, setBulkReceiptOpen] = useState(false);
  type BulkReceiptItemData = { qty: string; uom: string; vendor: string; rate: string; receiptDate: string; remarks: string; partyId: string };
  const [bulkReceiptData, setBulkReceiptData] = useState<Record<number, BulkReceiptItemData>>({});
  const [bulkReceivingLocation, setBulkReceivingLocation] = useState<string>("hmp_plant");
  const [bulkReceivingSiteId, setBulkReceivingSiteId] = useState<number | null>(null);

  // Service / Hire route — completion verification dialog
  const [serviceCompletionItemId, setServiceCompletionItemId] = useState<number | null>(null);
  type ServiceCompletionForm = { completionStatus: string; completionDate: string; qty: string; hours: string; remarks: string; documentUrl: string };
  const [serviceCompletionForm, setServiceCompletionForm] = useState<ServiceCompletionForm>({ completionStatus: "completed", completionDate: format(new Date(), "yyyy-MM-dd"), qty: "", hours: "", remarks: "", documentUrl: "" });

  // Material Indent: Record Receipt (place-order now unified with purchaser-action card above)
  type MatReceiptForm = { qty: string; vendor: string; rate: string; receiptDate: string; notes: string };
  const [matReceiptForms, setMatReceiptForms] = useState<Record<number, MatReceiptForm>>({});
  const [matReceiptExpanded, setMatReceiptExpanded] = useState<Set<number>>(new Set());

  const [addStoreItemOpen, setAddStoreItemOpen] = useState(false);
  const [addStoreItemTargetIdx, setAddStoreItemTargetIdx] = useState<number | null>(null);
  const [addStoreItemForm, setAddStoreItemForm] = useState({ name: "", category: "Aggregate", uom: "NOS" });
  // tracks whether the "Add to Catalogue" was triggered from the GRN dialog (vs the PI item form)
  const [addStoreItemFromGrn, setAddStoreItemFromGrn] = useState(false);

  const addStoreItemMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/plant-module/materials", data); return res.json(); },
    onSuccess: (newItem: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/materials"] });
      toast({ title: `"${newItem.name}" added to materials catalogue` });
      if (addStoreItemFromGrn && addStoreItemTargetIdx !== null) {
        // Link the new catalogue item directly into the GRN line
        setGrnLines(prev => prev.map((l, i) => i === addStoreItemTargetIdx ? {
          ...l,
          storeItemId: String(newItem.id),
          itemSearch: newItem.name,
          uom: (newItem.defaultUom || l.uom || "NOS").toUpperCase(),
          autoLinked: false,
        } : l));
      } else if (addStoreItemTargetIdx !== null) {
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
      setAddStoreItemFromGrn(false);
    },
    onError: () => toast({ title: "Error adding material", variant: "destructive" }),
  });

  const [reportFilterDateFrom, setReportFilterDateFrom] = useState("");
  const [reportFilterDateTo, setReportFilterDateTo] = useState("");
  const [reportFilterStatus, setReportFilterStatus] = useState("all");
  const [reportFilterPurpose, setReportFilterPurpose] = useState("all");
  const [reportFilterVendor, setReportFilterVendor] = useState("");
  const [reportFilterPaymentMode, setReportFilterPaymentMode] = useState("all");

  const { data: indents, isLoading } = useQuery<PurchaseIndentWithItems[]>({
    queryKey: ["/api/purchase-indents"],
  });

  const { data: allSites = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
  });

  const { data: indentPendingPPRs = [] } = useQuery<any[]>({
    queryKey: ["/api/pending-plant-receipts", { indentId: selectedIndentId, status: "pending" }],
    queryFn: async () => {
      const res = await fetch(`/api/pending-plant-receipts?indentId=${selectedIndentId}&status=pending`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedIndentId,
  });

  const { data: indentServiceCompletions = [] } = useQuery<any[]>({
    queryKey: ["/api/service-completions", { indentId: selectedIndentId }],
    queryFn: async () => {
      const res = await fetch(`/api/service-completions?indentId=${selectedIndentId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedIndentId,
  });

  // Fetch source IRN for pre-filling when navigated from IrnDetailPage
  const { data: sourceIrn } = useQuery<InternalRequisitionWithItems>({
    queryKey: ["/api/irn", fromIrnId],
    queryFn: async () => {
      const res = await fetch(`/api/irn/${fromIrnId}`, { credentials: "include" });
      if (!res.ok) throw new Error("IRN not found");
      return res.json();
    },
    enabled: !!fromIrnId,
  });

  // Pre-fill form once IRN data arrives
  useEffect(() => {
    if (!sourceIrn || !fromIrnId) return;
    const procureItems = sourceIrn.items.filter((i) => i.procureQty && i.procureQty > 0);
    if (procureItems.length === 0) return;
    setFormItems(procureItems.map((i) => ({
      description: i.material.toUpperCase(),
      spec: "",
      partNo: "",
      qty: i.procureQty!,
      uom: i.uom.toUpperCase(),
      purpose: i.purpose.toUpperCase(),
      priority: i.urgency === "urgent" ? "urgent" : i.urgency === "high" ? "normal" : "normal",
      materialId: null,
      estRate: null,
      estAmount: null,
      requiredBy: i.needByDate ?? null,
    })));
    setFormRaisedBy(sourceIrn.raisedBy);
    if (sourceIrn.siteId) setFormSiteId(sourceIrn.siteId);
    else if (sourceIrn.raisedFrom) setFormRaisedFrom(sourceIrn.raisedFrom);
    setView("form");
  }, [sourceIrn?.id]);

  const { data: summary } = useQuery<{ storesCheck?: number;
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

  const { data: piTxns = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-indents", selectedIndentId, "transactions"],
    queryFn: () => fetch(`/api/purchase-indents/${selectedIndentId}/transactions`).then(r => r.json()),
    enabled: !!selectedIndentId && (view === "purchase" || view === "procurement"),
  });

  const { data: rawMaterialsList } = useQuery<any[]>({
    queryKey: ["/api/plant-module/materials"],
  });

  const { data: recentIndentItemIds = [] } = useQuery<number[]>({
    queryKey: ["/api/purchase-indent-items/recent-items"],
  });

  const { data: sitesList } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
  });

  const { data: storeStockBalance } = useQuery<Array<{ id: number; name: string; uom: string; category: string; balance: number }>>({
    queryKey: ["/api/stores/stock-balance"],
    enabled: canCreateStores,
  });


  const { data: actualStoreItems = [] } = useQuery<Array<{ id: number; name: string; uom: string; category: string }>>({
    queryKey: ["/api/stores/items"],
    enabled: canCreateStores && showGrnDialog,
  });

  const { data: plantMaterialsForGrn = [] } = useQuery<Array<{ id: number; name: string; defaultUom: string; category: string }>>({
    queryKey: ["/api/plant-module/materials"],
    enabled: canCreateStores && showGrnDialog,
  });

  // Collect numeric storeItemIds from currently linked GRN lines (excludes pm: plant-material IDs)
  const linkedStoreItemIds = useMemo(() => {
    if (!showGrnDialog) return [];
    const ids = grnLines
      .map(l => l.storeItemId)
      .filter((s): s is string => !!s && !s.startsWith("pm:"))
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n > 0);
    return [...new Set(ids)];
  }, [showGrnDialog, grnLines]);

  const { data: grnSupplierHistory = [] } = useQuery<string[]>({
    queryKey: ["/api/stores/grns/supplier-history", linkedStoreItemIds.join(",")],
    queryFn: async () => {
      if (linkedStoreItemIds.length === 0) return [];
      const res = await fetch(
        `/api/stores/grns/supplier-history?itemIds=${linkedStoreItemIds.join(",")}`,
        { credentials: "include" }
      );
      if (!res.ok) return [];
      return res.json() as Promise<string[]>;
    },
    enabled: showGrnDialog && linkedStoreItemIds.length > 0,
    staleTime: 60_000,
  });

  // Combined catalogue: store items first, then plant/bulk materials not already in store items
  const combinedGrnItems = (() => {
    const storeNames = new Set(actualStoreItems.map(si => si.name.toUpperCase().trim()));
    const plantExtras = plantMaterialsForGrn
      .filter(pm => !storeNames.has(pm.name.toUpperCase().trim()))
      .map(pm => ({ id: pm.id, name: pm.name, uom: pm.defaultUom || "CFT", category: pm.category || "Aggregate", isPlantMaterial: true }));
    return [
      ...actualStoreItems.map(si => ({ ...si, isPlantMaterial: false })),
      ...plantExtras,
    ];
  })();


  useEffect(() => {
    if (view !== "stores" || !selectedIndent) return;
    setStoreItemVerifications(prev => {
      const updated = { ...prev };
      selectedIndent.items.forEach(item => {
        const existing = prev[item.id] || { stockStatus: "", stockAvailableQty: "", storesItemNote: "", showNote: false };
        if (existing.stockStatus) return;
        const balance = (item as any).liveStockQty as number | null;
        if (balance == null) return;
        const requested = item.qty;
        let stockStatus = "";
        let stockAvailableQty = "";
        if (balance >= requested) {
          stockStatus = "in_stock";
          stockAvailableQty = balance.toFixed(3);
        } else if (balance > 0) {
          stockStatus = "short";
          stockAvailableQty = balance.toFixed(3);
        } else {
          stockStatus = "out_of_stock";
          stockAvailableQty = "0";
        }
        updated[item.id] = { ...existing, stockStatus, stockAvailableQty };
      });
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedIndent?.id]);

  const storeItemsList: StoreItem[] = (rawMaterialsList || [])
    .filter((m: any) => m.isActive !== 0)
    .map((m: any) => ({ id: m.id, name: m.name, uom: m.defaultUom || "NOS", category: m.category || "General" }));

  const { data: indentGrnCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/stores/indent-grn-counts"],
    enabled: canViewStores,
  });

  const { data: indentFulfilmentStatus } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/stores/indent-fulfilment-status"],
    enabled: canViewStores,
  });

  const { data: grnReceivedByItem = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/stores/indent-received-per-item", selectedIndent?.id],
    enabled: showGrnDialog && !!selectedIndent?.id,
    queryFn: async () => {
      if (!selectedIndent?.id) return {};
      const res = await fetch(`/api/stores/indent-received-per-item?indentId=${selectedIndent.id}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  // Site trips linked to the currently selected indent (for balance tracking on site-destination material items)
  const { data: indentSiteTrips = [] } = useQuery<any[]>({
    queryKey: ["/api/site-material-trips", { indentId: selectedIndentId }],
    queryFn: () => fetch(`/api/site-material-trips?indentId=${selectedIndentId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedIndentId && (view === "purchase" || view === "procurement"),
  });

  const indentRefForGrns = (view === "purchase" || view === "procurement") ? selectedIndent?.indentNo : undefined;
  const { data: linkedGrns = [] } = useQuery<{ id: number; grnNumber: string; date: string; supplier: string; acceptanceStatus: string; itemCount: number }[]>({
    queryKey: ["/api/stores/grns", "linked", indentRefForGrns ?? ""],
    queryFn: () => fetch(`/api/stores/grns?indentRef=${encodeURIComponent(indentRefForGrns!)}`, { credentials: "include" })
      .then(r => r.json())
      .then((grns: any[]) => grns.map(g => ({ id: g.id, grnNumber: g.grnNumber, date: g.date, supplier: g.supplier, acceptanceStatus: g.acceptanceStatus, itemCount: (g.items ?? []).length }))),
    enabled: canViewStores && !!indentRefForGrns,
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

  const storesVerifyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/purchase-indents/${selectedIndentId}/stores-verify`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      toast({ title: "Stores verification submitted", description: "Indent is now awaiting manager approval." });
      setView("list");
      setSelectedIndentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit verification", description: err.message, variant: "destructive" });
    },
  });


  const procureMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) =>
      apiRequest("PATCH", `/api/purchase-indent-items/${itemId}/procure`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      toast({ title: "Procurement status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update procurement status", description: err.message, variant: "destructive" });
    },
  });

  const purchaserActionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/purchase-indents/${selectedIndentId}/purchaser-action`, data);
      return res.json() as Promise<{ indent: any; txnIdsByItemId: Record<number, number>; grnIdsByItemId: Record<number, number> }>;
    },
    onSuccess: async (result) => {
      // Upload per-item invoice photos — tag to PI transaction AND draft GRN (Batch 17)
      const { txnIdsByItemId = {}, grnIdsByItemId = {} } = result ?? {};
      const allItemIds = new Set([
        ...Object.keys(txnIdsByItemId).map(Number),
        ...Object.keys(paPhotos).map(Number),
      ]);
      for (const itemId of allItemIds) {
        const files = paPhotos[itemId] || [];
        if (files.length === 0) continue;
        const txnId = txnIdsByItemId[itemId];
        const grnId = grnIdsByItemId[itemId];
        for (const file of files) {
          const up = await uploadFile(file);
          if (!up) continue;
          const base = { fileName: file.name, objectPath: up.objectPath, mimeType: file.type || "application/octet-stream", fileSize: file.size };
          // Tag to the PI purchaser-action transaction (for PI history)
          if (txnId) {
            apiRequest("POST", "/api/attachments", { ...base, moduleType: "pi_purchaser_action", linkedRecordId: txnId }).catch(() => {});
          }
          // Also tag to the draft GRN so Stores sees it without re-uploading
          if (grnId) {
            apiRequest("POST", "/api/attachments", { ...base, moduleType: "store_grn", linkedRecordId: grnId }).catch(() => {});
          }
        }
      }
      setPaPhotos({});
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId, "transactions"] });
      }
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      setPurchaserActionOpen(false);
      setPurchaserActionData({});
      toast({ title: "Purchaser action recorded" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record purchaser action", description: err.message, variant: "destructive" });
    },
  });

  const serviceCompletionMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/purchase-indents/${selectedIndentId}/service-completion`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-completions", { indentId: selectedIndentId }] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      }
      setServiceCompletionItemId(null);
      toast({ title: "Service completion recorded" });
    },
    onError: (err: Error) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkReceiptMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/purchase-indents/${selectedIndentId}/bulk-receipt`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plant-receipts"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId, "transactions"] });
      }
      setBulkReceiptOpen(false);
      setBulkReceiptData({});
      toast({ title: "Receipt submitted", description: "For plant destinations it will appear in the Pending Plant Receipts queue. For site destinations, use 'Log Site Delivery' to record each truckload." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to submit plant receipt", description: err.message, variant: "destructive" });
    },
  });

  const recordDeliveryMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) =>
      apiRequest("POST", `/api/purchase-indent-items/${itemId}/record-delivery`, data),
    onSuccess: (_result, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId, "transactions"] });
      }
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      setDeliveryExpanded(prev => { const next = new Set(prev); next.delete(itemId); return next; });
      setDeliveryForms(prev => { const next = { ...prev }; delete next[itemId]; return next; });
      toast({ title: "Delivery recorded", description: "Item status and GRN updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record delivery", description: err.message, variant: "destructive" });
    },
  });

  const recordMatReceiptMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/purchase-indents/${selectedIndentId}/record-material-receipt`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      if (selectedIndentId) queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents", selectedIndentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/plant-module/material-receipts"] });
      setMatReceiptForms({});
      setMatReceiptExpanded(new Set());
      toast({ title: "Material receipt recorded — stock updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to record receipt", description: err.message, variant: "destructive" });
    },
  });

  const GRN_MAPPINGS_KEY = "grn_item_mappings";
  const normDesc = (s: string) => s.toUpperCase().trim().replace(/\s+/g, " ");

  function loadGrnMappings(): Record<string, string> {
    try {
      return JSON.parse(localStorage.getItem(GRN_MAPPINGS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveGrnMappings(lines: typeof grnLines) {
    try {
      const stored = loadGrnMappings();
      for (const line of lines) {
        if (line.storeItemId) {
          stored[normDesc(line.description)] = line.storeItemId;
        }
      }
      localStorage.setItem(GRN_MAPPINGS_KEY, JSON.stringify(stored));
    } catch {
    }
  }

  const createGrnMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stores/grns", data),
    onSuccess: () => {
      saveGrnMappings(grnLines);
      queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/stores") });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      toast({ title: "GRN created — items added to stock" });
      setShowGrnDialog(false);
    },
    onError: (err: any) => {
      try {
        const msg: string = err?.message ?? "";
        if (msg.startsWith("422:")) {
          const jsonPart = msg.slice(msg.indexOf("{"));
          const body = JSON.parse(jsonPart);
          if (body?.details?.length) {
            toast({ title: "Over-receipt blocked", description: body.details.join("; "), variant: "destructive" });
            return;
          }
        }
      } catch {}
      toast({ title: "Error creating GRN", variant: "destructive" });
    },
  });

  function openGrnDialog() {
    if (!selectedIndent) return;
    const purchasedItems = selectedIndent.items.filter(i => {
      const ps = (i.purchaseStatus || "").toLowerCase();
      return ps === "purchased" || ps === "partial" || ps === "handover_pending";
    });
    const firstVendor = purchasedItems.find(i => i.vendor)?.vendor || "";
    const firstBillNo = purchasedItems.find(i => (i as any).billNo)?.billNo || "";
    setGrnDialogDate(format(new Date(), "yyyy-MM-dd"));
    setGrnDialogSupplier(firstVendor);
    setGrnDialogInvoiceNo(firstBillNo);
    setGrnDialogRemarks("");
    setGrnLines(purchasedItems.map(i => {
      const handoverTx = piTxns.filter((t: any) => t.indentItemId === i.id && t.transactionType === "handover").slice(-1)[0] as any;
      const purchaserTx = piTxns.filter((t: any) => t.indentItemId === i.id && t.transactionType === "purchaser_action").slice(-1)[0] as any;
      return {
        indentItemId: i.id,
        description: i.description,
        qty: (handoverTx?.acceptedQty ?? (i as any).qtyPurchased ?? i.approvedQty ?? i.qty).toString(),
        rate: (purchaserTx?.rate ?? i.rate)?.toString() || "",
        uom: i.uom,
        storeItemId: "",
        itemSearch: "",
        autoLinked: false,
        approvedQty: i.approvedQty ?? i.qty,
      };
    }));
    setGrnOpenDropdownIdx(null);
    setShowGrnDialog(true);
  }

  function fuzzyMatchStoreItem(description: string, items: Array<{ id: number; name: string; uom: string; category: string }>) {
    const norm = (s: string) => s.toUpperCase().trim().replace(/\s+/g, " ");
    const desc = norm(description);
    const exact = items.find(si => norm(si.name) === desc);
    if (exact) return exact;
    const contains = items.find(si => norm(si.name).includes(desc) || desc.includes(norm(si.name)));
    if (contains) return contains;
    const descWords = desc.split(" ").filter(w => w.length > 2);
    if (descWords.length === 0) return null;
    const descWordSet = new Set(descWords);
    let bestMatch: typeof items[0] | null = null;
    let bestScore = 0;
    for (const si of items) {
      const itemWords = norm(si.name).split(" ").filter(w => w.length > 2);
      const itemWordSet = new Set(itemWords);
      let matches = 0;
      for (const w of descWordSet) { if (itemWordSet.has(w)) matches++; }
      const score = matches / Math.max(descWordSet.size, itemWordSet.size);
      if (score > bestScore && score >= 0.6) { bestScore = score; bestMatch = si; }
    }
    return bestMatch;
  }

  useEffect(() => {
    if (!showGrnDialog || combinedGrnItems.length === 0) return;
    const storedMappings = loadGrnMappings();
    setGrnLines(prev => prev.map(line => {
      if (line.storeItemId) return line;
      const key = normDesc(line.description);
      const persistedId = storedMappings[key];
      if (persistedId) {
        const item = combinedGrnItems.find(si => String(si.id) === persistedId && !si.isPlantMaterial);
        if (item) return { ...line, storeItemId: persistedId, itemSearch: item.name, uom: item.uom, autoLinked: true };
      }
      const match = fuzzyMatchStoreItem(line.description, combinedGrnItems);
      if (!match) return line;
      const sid = (match as any).isPlantMaterial ? `pm:${match.id}` : String(match.id);
      return { ...line, storeItemId: sid, itemSearch: match.name, uom: match.uom, autoLinked: true };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGrnDialog, combinedGrnItems.length]);

  async function handleGrnSubmit() {
    if (!selectedIndent) return;
    const validLines = grnLines.filter(l => l.storeItemId && parseFloat(l.qty) > 0);
    if (validLines.length === 0) {
      toast({ title: "Please link at least one item to a store catalogue entry", variant: "destructive" });
      return;
    }
    if (!grnDialogDate) {
      toast({ title: "Please enter a date", variant: "destructive" });
      return;
    }

    // Resolve any plant-material lines (storeItemId = "pm:N") by finding or
    // auto-creating a matching store item — keeps the GRN backend unchanged
    const resolvedLines = await Promise.all(validLines.map(async l => {
      if (!l.storeItemId.startsWith("pm:")) return l;
      const pmId = parseInt(l.storeItemId.replace("pm:", ""));
      const pm = plantMaterialsForGrn.find(p => p.id === pmId);
      if (!pm) return null;
      // Check if a store item with the same name already exists
      const existing = actualStoreItems.find(si => si.name.toUpperCase().trim() === pm.name.toUpperCase().trim());
      if (existing) return { ...l, storeItemId: String(existing.id) };
      // Auto-create a store item for this plant material
      try {
        const res = await apiRequest("POST", "/api/stores/items", {
          name: pm.name.toUpperCase(),
          category: pm.category || "Aggregate",
          defaultUom: pm.defaultUom || l.uom || "CFT",
          isActive: 1,
        });
        const newItem = await res.json();
        queryClient.invalidateQueries({ queryKey: ["/api/stores/items"] });
        return { ...l, storeItemId: String(newItem.id) };
      } catch {
        return null;
      }
    }));

    const finalLines = resolvedLines.filter(Boolean) as typeof validLines;
    if (finalLines.length === 0) {
      toast({ title: "Could not resolve item links — please try again", variant: "destructive" });
      return;
    }

    createGrnMutation.mutate({
      grn: {
        date: grnDialogDate,
        supplier: grnDialogSupplier.trim() || "—",
        invoiceNo: grnDialogInvoiceNo.trim() || null,
        invoiceDate: null,
        siteId: (selectedIndent as any).siteId || null,
        indentRef: selectedIndent.indentNo,
        remarks: grnDialogRemarks.trim() || null,
        status: "finalized",
        acceptanceStatus: "accepted",
      },
      items: finalLines.map(l => ({
        itemId: parseInt(l.storeItemId),
        qty: parseFloat(l.qty),
        rate: l.rate ? parseFloat(l.rate) : null,
        uom: l.uom,
        indentItemId: l.indentItemId || null,
      })),
    });
  }

  const reportQueryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (reportFilterDateFrom) params.set("dateFrom", reportFilterDateFrom);
    if (reportFilterDateTo) params.set("dateTo", reportFilterDateTo);
    if (reportFilterStatus !== "all") params.set("purchaseStatus", reportFilterStatus);
    if (reportFilterPurpose !== "all") params.set("purpose", reportFilterPurpose);
    if (reportFilterVendor.trim()) params.set("vendor", reportFilterVendor.trim());
    if (reportFilterPaymentMode !== "all") params.set("paymentMode", reportFilterPaymentMode);
    return params.toString();
  }, [reportFilterDateFrom, reportFilterDateTo, reportFilterStatus, reportFilterPurpose, reportFilterVendor, reportFilterPaymentMode]);

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
      expectedDelivery: string | null;
      paymentMode: string | null;
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
    setFormRaisedFrom(defaultRaisedFrom);
    setFormItems([{ description: "", spec: "", partNo: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null, procurementRoute: null }]);
    setSourceIrnId(null);
    setFormPiType("stores");
  };

  const openIndentForm = (type: "stores" | "material") => {
    const defaultRoute = type === "material" ? "material" : "stores";
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormProposedBy("");
    setFormRaisedBy("");
    setFormRemarks("");
    setFormSiteId(null);
    setFormRaisedFrom(defaultRaisedFrom);
    setFormItems([{ description: "", spec: "", partNo: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null, procurementRoute: defaultRoute }]);
    setSourceIrnId(null);
    setFormPiType(type);
    setView("form");
  };

  const addItemRow = () => {
    const defaultRoute = formPiType === "material" ? "material" : "stores";
    setFormItems([...formItems, { description: "", spec: "", partNo: "", qty: 1, uom: "NOS", purpose: "PLANT", priority: "normal", materialId: null, estRate: null, estAmount: null, requiredBy: null, procurementRoute: defaultRoute }]);
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
    if (!formSiteId && !formRaisedFrom) {
      toast({ title: "Please select a raised from / location", variant: "destructive" });
      return;
    }
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
      siteId: formSiteId ?? null,
      raisedFrom: formRaisedFrom ?? null,
      sourceIrnId: sourceIrnId ?? undefined,
      requirementId: prefillRequirementId ?? undefined,
      piType: formPiType,
      items: validItems.map(item => ({
        description: item.description.toUpperCase(),
        spec: item.spec?.trim().toUpperCase() || undefined,
        partNo: item.partNo?.trim().toUpperCase() || undefined,
        qty: item.qty,
        uom: item.uom,
        purpose: item.purpose,
        priority: item.priority,
        materialId: item.materialId || undefined,
        estRate: item.estRate || undefined,
        estAmount: item.estAmount || undefined,
        requiredBy: (item.priority !== "urgent" && item.requiredBy) ? item.requiredBy : undefined,
        procurementRoute: item.procurementRoute || undefined,
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
    const piType = (indent as any).piType ?? "stores";
    const ss = (indent as any).storesStatus as string | null;
    const storesNotVerified = !ss || ss !== "verified";

    const initApprovalStates = (items: PurchaseIndentWithItems["items"]) => {
      const states: Record<number, ItemApprovalState> = {};
      items.forEach(item => {
        states[item.id] = { action: 'pending', approvedQty: item.approvedQty ?? item.qty, modQty: (item.approvedQty ?? item.qty).toString(), rejectReason: '' };
      });
      setItemApprovalStates(states);
    };

    // Material Indent: skip stores verification, go directly to approval or procurement
    if (piType === "material" && (indent.status === "pending" || indent.status === "stores_check")) {
      if (isApprover) {
        const qtys: Record<number, number> = {};
        const notes: Record<number, string> = {};
        indent.items.forEach(item => {
          qtys[item.id] = item.approvedQty ?? item.qty;
          notes[item.id] = (item as any).reviewerNote || "";
        });
        setApprovedQtys(qtys);
        setReviewerNotes(notes);
        initApprovalStates(indent.items);
        setApprovalRemarks("");
      }
      setView("detail");
      return;
    }
    if (piType === "material" && ["approved", "ordered", "purchasing", "completed"].includes(indent.status)) {
      setPurchaseUpdates({});
      setProcurementExtras({});
      setView("procurement");
      return;
    }

    if ((indent.status === "pending" && storesNotVerified) || (indent.status === "stores_check" && storesNotVerified)) {
      // Stores write permission takes priority — dual-role users (stores + approver) verify stock first
      if (canCreateStores) {
        // Stores user with write permission → verification view
        const verifs: Record<number, StoreItemVerification> = {};
        indent.items.forEach(item => {
          verifs[item.id] = {
            stockStatus: (item as any).stockStatus || "",
            stockAvailableQty: (item as any).stockAvailableQty?.toString() || "",
            storesItemNote: (item as any).storesItemNote || "",
            showNote: !!(item as any).storesItemNote,
          };
        });
        setStoreItemVerifications(verifs);
        setView("stores");
      } else if (isApprover) {
        // Pure approver (no stores write permission) → approval/bypass view directly
        const qtys: Record<number, number> = {};
        const notes: Record<number, string> = {};
        indent.items.forEach(item => {
          qtys[item.id] = item.approvedQty ?? item.qty;
          notes[item.id] = (item as any).reviewerNote || "";
        });
        setApprovedQtys(qtys);
        setReviewerNotes(notes);
        initApprovalStates(indent.items);
        setApprovalRemarks("");
        setView("detail");
      } else {
        // No approval or stores-write permission → read-only detail view
        setView("detail");
      }
    } else if (indent.status === "pending" || indent.status === "stores_check") {
      // stores_check + verified → approval detail view
      const qtys: Record<number, number> = {};
      const notes: Record<number, string> = {};
      indent.items.forEach(item => {
        qtys[item.id] = item.approvedQty ?? item.qty;
        notes[item.id] = (item as any).reviewerNote || "";
      });
      setApprovedQtys(qtys);
      setReviewerNotes(notes);
      initApprovalStates(indent.items);
      setApprovalRemarks("");
      setView("detail");
    } else if (indent.status === "approved" || indent.status === "ordered" || indent.status === "purchasing" || indent.status === "completed") {
      setPurchaseUpdates({});
      setProcurementExtras({});
      setView("procurement");
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

  const handleFinaliseApproval = () => {
    if (!selectedIndent) return;
    // If ALL items are rejected, treat the whole indent as rejected
    const allRejected = selectedIndent.items.every(item => itemApprovalStates[item.id]?.action === 'rejected');
    if (allRejected) {
      const combinedReason = selectedIndent.items
        .map(item => {
          const st = itemApprovalStates[item.id];
          return st?.rejectReason?.trim() ? `${item.description}: ${st.rejectReason.trim()}` : item.description;
        })
        .join("; ");
      const reason = (approvalRemarks.trim() || combinedReason).toUpperCase();
      if (!reason) {
        toast({ title: "Enter a rejection reason in the remarks field", variant: "destructive" });
        return;
      }
      rejectMutation.mutate({ reason });
      return;
    }
    const approvedItems = selectedIndent.items.map(item => {
      const st = itemApprovalStates[item.id];
      if (!st || st.action === 'pending') return { itemId: item.id, approvedQty: item.qty };
      if (st.action === 'rejected') return { itemId: item.id, approvedQty: 0, note: st.rejectReason };
      return { itemId: item.id, approvedQty: st.approvedQty };
    });
    approveMutation.mutate({
      approvedItems,
      remarks: approvalRemarks.toUpperCase() || null,
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
      setFormRaisedFrom((selectedIndent as any).raisedFrom ?? null);
      setFormItems(selectedIndent.items.map(item => ({
        description: item.description,
        spec: (item as any).spec || "",
        partNo: (item as any).partNo || "",
        qty: item.qty,
        uom: item.uom,
        purpose: item.purpose,
        priority: item.priority,
        materialId: item.materialId || null,
        estRate: item.estRate || null,
        estAmount: (item as any).estAmount || null,
        requiredBy: (item as any).requiredBy || null,
        procurementRoute: (item as any).procurementRoute || null,
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
    const extra = procurementExtras[itemId] || { expectedDelivery: "", paymentMode: "" };
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
        expectedDelivery: extra.expectedDelivery || undefined,
        paymentMode: extra.paymentMode || undefined,
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
      if (filterLocation !== "all") {
        const loc = locationLabel({ siteId: (indent as any).siteId ?? null, raisedFrom: (indent as any).raisedFrom ?? null }, sitesList);
        if (loc !== filterLocation) return false;
      }
      return true;
    });
  }, [indents, filterDateFrom, filterDateTo, filterStatus, filterPriority, filterLocation, sitesList]);

  const getIndentBorderColor = (status: string) => {
    switch (status) {
      case "pending": return "border-l-amber-500";
      case "stores_check": return "border-l-cyan-500";
      case "approved": return "border-l-emerald-500";
      case "completed": return "border-l-blue-500";
      case "rejected": return "border-l-red-500";
      default: return "border-l-muted";
    }
  };

  const handlePrintIndent = (indent: PurchaseIndentWithItems) => {
    const esc = (v: string | null | undefined): string => {
      if (v == null) return "";
      return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    };

    const fmtTs = (ts: string | null | undefined) => {
      if (!ts) return "—";
      try { return format(new Date(ts), "dd-MMM-yyyy HH:mm").toUpperCase(); } catch { return esc(ts); }
    };

    const statusLabel = (s: string) => ({
      pending: "PENDING", stores_check: "STORES CHECK", approved: "APPROVED",
      rejected: "REJECTED", completed: "COMPLETED",
    }[s] ?? esc(s.toUpperCase()));

    const priorityLabel = (p: string) => ({ normal: "Normal", high: "HIGH", urgent: "URGENT" }[p] ?? esc(p));

    const location = locationLabel(
      { siteId: (indent as any).siteId ?? null, raisedFrom: (indent as any).raisedFrom ?? null },
      sitesList
    );

    const storesStatus = (indent as any).storesStatus as string | null;
    const storesVerifiedBy = (indent as any).storesVerifiedBy as string | null;
    const storesVerifiedAt = (indent as any).storesVerifiedAt as string | null;
    const createdAt = (indent as any).createdAt as string | null;

    type AuditRow = { label: string; actor: string | null; timestamp: string | null; note: string | null };
    const auditEvents: AuditRow[] = [];

    auditEvents.push({ label: "Indent Raised", actor: indent.raisedBy, timestamp: fmtTs(createdAt), note: null });

    if (storesStatus === "verified" && storesVerifiedBy) {
      auditEvents.push({ label: "Stores Verified", actor: storesVerifiedBy, timestamp: fmtTs(storesVerifiedAt), note: null });
    } else if (storesStatus === "bypassed" || (storesStatus === null && (indent.status === "approved" || indent.status === "completed"))) {
      const m = (indent.approvalRemarks ?? "").match(/\[BYPASS:\s*(.*?)\]/i);
      auditEvents.push({ label: "Stores Check Bypassed", actor: indent.approvedBy ?? null, timestamp: null, note: m ? m[1].trim() : null });
    }

    if (indent.status === "approved" || indent.status === "completed") {
      const cleanRemarks = (indent.approvalRemarks ?? "").replace(/\[BYPASS:[^\]]*\]/gi, "").trim() || null;
      auditEvents.push({ label: "Approved", actor: indent.approvedBy ?? null, timestamp: fmtTs((indent as any).approvedAt), note: cleanRemarks });
    } else if (indent.status === "rejected") {
      auditEvents.push({ label: "Rejected", actor: indent.approvedBy ?? null, timestamp: fmtTs((indent as any).approvedAt), note: indent.rejectionReason ?? null });
    }

    const itemRows = indent.items.map((item, i) => {
      const approvedCell = item.approvedQty != null ? `${item.approvedQty} ${esc(item.uom)}` : "—";
      const statusCell = item.purchaseStatus ? esc(item.purchaseStatus.toUpperCase()) : (item.cancelledBy ? "CANCELLED" : "—");
      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:6px 8px;font-weight:600;">${i + 1}. ${esc(item.description)}</td>
          <td style="padding:6px 8px;">${item.qty} ${esc(item.uom)}</td>
          <td style="padding:6px 8px;">${approvedCell}</td>
          <td style="padding:6px 8px;">${esc(item.purpose)}</td>
          <td style="padding:6px 8px;">${priorityLabel(item.priority)}</td>
          <td style="padding:6px 8px;">${statusCell}</td>
        </tr>`;
    }).join("");

    const auditRows = auditEvents.map(ev => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:6px 8px;font-weight:600;">${esc(ev.label)}</td>
        <td style="padding:6px 8px;">${esc(ev.actor) || "—"}</td>
        <td style="padding:6px 8px;">${esc(ev.timestamp) || "—"}</td>
        <td style="padding:6px 8px;font-style:italic;color:#6b7280;">${esc(ev.note)}</td>
      </tr>`).join("");

    const printedAt = format(new Date(), "dd-MMM-yyyy HH:mm").toUpperCase();
    const indentDate = format(new Date(indent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase();

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Purchase Indent ${esc(indent.indentNo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 20px 0 8px; color: #374151; border-bottom: 2px solid #d1d5db; padding-bottom: 4px; }
    .header-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
    .header-grid .field label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; display: block; margin-bottom: 2px; }
    .header-grid .field span { font-weight: 600; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: #f3f4f6; color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: #f9fafb; }
    thead th { padding: 7px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
    .footer { margin-top: 40px; font-size: 9px; color: #9ca3af; text-align: right; }
    @media print {
      body { padding: 10mm; }
      @page { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #111;padding-bottom:12px;">
    <div>
      <h1>Purchase Indent</h1>
      <div style="font-size:20px;font-weight:800;color:#0F5F64;">${esc(indent.indentNo)}</div>
    </div>
    <div style="text-align:right;">
      <div class="status-badge">${statusLabel(indent.status)}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:4px;">Printed: ${printedAt}</div>
    </div>
  </div>

  <div class="header-grid">
    <div class="field"><label>Date</label><span>${indentDate}</span></div>
    <div class="field"><label>Proposed By</label><span>${esc(indent.proposedBy)}</span></div>
    <div class="field"><label>Raised By</label><span>${esc(indent.raisedBy)}</span></div>
    <div class="field"><label>Location / Raised From</label><span>${esc(location) || "—"}</span></div>
    <div class="field"><label>Total Items</label><span>${indent.items.length}</span></div>
    ${indent.remarks ? `<div class="field"><label>Remarks</label><span>${esc(indent.remarks)}</span></div>` : ""}
  </div>

  <h2>Items</h2>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Qty Requested</th>
        <th>Qty Approved</th>
        <th>Purpose</th>
        <th>Priority</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <h2>Audit Trail</h2>
  <table>
    <thead>
      <tr>
        <th>Event</th>
        <th>By</th>
        <th>Timestamp</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${auditRows}</tbody>
  </table>

  <div class="footer">SiteLog &middot; Purchase Indent ${esc(indent.indentNo)}</div>
</body>
</html>`;

    const win = window.open("", "_blank", "width=900,height=700,noopener,noreferrer");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const handleSubmitStoresVerify = () => {
    if (!selectedIndentId || !selectedIndent) return;
    const allVerified = selectedIndent.items.every(item => {
      const v = storeItemVerifications[item.id];
      return v && v.stockStatus;
    });
    if (!allVerified) {
      toast({ title: "Please set stock status for all items", variant: "destructive" });
      return;
    }
    const items = selectedIndent.items.map(item => {
      const v = storeItemVerifications[item.id] || { stockStatus: "", stockAvailableQty: "", storesItemNote: "", showNote: false };
      return {
        itemId: item.id,
        stockStatus: v.stockStatus,
        stockAvailableQty: v.stockAvailableQty ? parseFloat(v.stockAvailableQty) : undefined,
        storesItemNote: v.storesItemNote || undefined,
      };
    });
    storesVerifyMutation.mutate({ items });
  };

  const updateStoreVerification = (itemId: number, field: keyof StoreItemVerification, value: string | boolean) => {
    setStoreItemVerifications(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { stockStatus: "", stockAvailableQty: "", storesItemNote: "", showNote: false }), [field]: value },
    }));
  };

  const updateProcurementExtra = (itemId: number, field: keyof ProcurementExtra, value: string) => {
    setProcurementExtras(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { expectedDelivery: "", paymentMode: "credit" }), [field]: value },
    }));
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

  const isIndentFullyReceived = useMemo(() => {
    if (!selectedIndent || !indentFulfilmentStatus) return false;
    return indentFulfilmentStatus[selectedIndent.indentNo] === true;
  }, [selectedIndent, indentFulfilmentStatus]);

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
              <Label className="text-sm uppercase">REASON FOR CANCELLATION</Label>
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
              <Label className="text-sm uppercase">REASON FOR FORCE CLOSING</Label>
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="button-raise-indent">
                    <Plus className="w-4 h-4 mr-1" /> RAISE INDENT <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuItem onClick={() => openIndentForm("stores")} data-testid="menu-item-store-indent">
                    <Warehouse className="w-4 h-4 mr-2 shrink-0 text-blue-600" />
                    <div>
                      <p className="font-semibold text-sm">Store / Spares / Consumables</p>
                      <p className="text-sm text-muted-foreground">Routed through Stores verification</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openIndentForm("material")} data-testid="menu-item-bulk-indent">
                    <Package className="w-4 h-4 mr-2 shrink-0 text-teal-600" />
                    <div>
                      <p className="font-semibold text-sm">Bulk Material Indent</p>
                      <p className="text-sm text-muted-foreground">Direct approval → Plant Material Receipt</p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card data-testid="card-summary-total">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">TOTAL</p>
                <p className="text-2xl font-bold mt-1" data-testid="text-total-count">{summary?.total || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-pending">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">PENDING STORES</p>
                <p className="text-2xl font-bold mt-1 text-amber-600" data-testid="text-pending-count">{summary?.pending || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-stores-check">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">AWAITING APPROVAL</p>
                <p className="text-2xl font-bold mt-1 text-cyan-600" data-testid="text-stores-check-count">{summary?.storesCheck || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-approved">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">APPROVED</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600" data-testid="text-approved-count">{summary?.approved || 0}</p>
              </CardContent>
            </Card>
            <Card data-testid="card-summary-completed">
              <CardContent className="p-4 text-center">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">COMPLETED</p>
                <p className="text-2xl font-bold mt-1 text-blue-600" data-testid="text-completed-count">{summary?.completed || 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-sm uppercase">DATE FROM</Label>
                  <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} data-testid="filter-date-from" />
                </div>
                <div>
                  <Label className="text-sm uppercase">DATE TO</Label>
                  <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} data-testid="filter-date-to" />
                </div>
                <div>
                  <Label className="text-sm uppercase">STATUS</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger data-testid="filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL STATUS</SelectItem>
                      <SelectItem value="pending">PENDING STORES</SelectItem>
                      <SelectItem value="stores_check">AWAITING APPROVAL</SelectItem>
                      <SelectItem value="approved">APPROVED</SelectItem>
                      <SelectItem value="completed">COMPLETED</SelectItem>
                      <SelectItem value="rejected">REJECTED</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm uppercase">PRIORITY</Label>
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
                <div>
                  <Label className="text-sm uppercase">LOCATION</Label>
                  <Select value={filterLocation} onValueChange={setFilterLocation}>
                    <SelectTrigger data-testid="filter-location">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL LOCATIONS</SelectItem>
                      {(sitesList ?? []).map(s => (
                        <SelectItem key={`site-${s.id}`} value={s.name}>{s.name}</SelectItem>
                      ))}
                      {SECTION_OPTIONS.filter(o => !o.rmcOnly || rmcEnabled).map(o => (
                        <SelectItem key={`sec-${o.value}`} value={o.value}>{o.label}</SelectItem>
                      ))}
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
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {format(new Date(indent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                            {" \u2022 "}PROPOSED BY {indent.proposedBy}
                            {" \u2022 "}RAISED BY {indent.raisedBy}
                            {indent.approvedBy && ` \u2022 ${indent.status === "rejected" ? "REJECTED" : "APPROVED"} BY ${indent.approvedBy}`}
                            {totalAmt > 0 && ` \u2022 \u20B9 ${totalAmt.toLocaleString("en-IN")} PURCHASED`}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2 items-center">
                            {(() => {
                              const loc = locationLabel({ siteId: (indent as any).siteId ?? null, raisedFrom: (indent as any).raisedFrom ?? null }, sitesList);
                              return (
                                <Badge variant="outline" className="text-[12px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-700" data-testid={`badge-site-${indent.id}`}>
                                  {loc}
                                </Badge>
                              );
                            })()}
                            {priorities.map(p => (
                              <span key={p}>{getPriorityBadge(p)}</span>
                            ))}
                            <span className="text-sm text-gray-700 dark:text-gray-300 font-medium pt-1">{purposes.join(" / ")}</span>
                            {(() => {
                              const reqDates = indent.items
                                .map(i => (i as any).requiredBy)
                                .filter(Boolean)
                                .sort();
                              const earliest = reqDates[0];
                              if (!earliest) return null;
                              return (
                                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium pt-1" data-testid={`text-req-by-${indent.id}`}>
                                  REQ. BY: {format(new Date(earliest + "T00:00:00"), "dd-MMM").toUpperCase()}
                                </span>
                              );
                            })()}
                          </div>
                          {indent.status === "rejected" && indent.rejectionReason && (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              REASON: {indent.rejectionReason}
                            </p>
                          )}

                          {/* Items list */}
                          {indent.items.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {indent.items.slice(0, 5).map(item => (
                                <span key={item.id} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-200 border border-gray-300 dark:border-slate-600">
                                  {item.description}{(item as any).spec ? ` · ${(item as any).spec}` : ""} — {item.qty} {item.uom}
                                </span>
                              ))}
                              {indent.items.length > 5 && (
                                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-900 text-gray-600 border border-gray-200 dark:border-slate-700">
                                  +{indent.items.length - 5} more
                                </span>
                              )}
                            </div>
                          )}

                          {/* Audit trail timestamps */}
                          {(() => {
                            const raised = indent.createdAt ? format(new Date(indent.createdAt as any), "dd-MMM-yy HH:mm") : null;
                            const verified = (indent as any).storesVerifiedAt ? format(new Date((indent as any).storesVerifiedAt), "dd-MMM-yy HH:mm") : null;
                            const approved = (indent as any).approvedAt ? format(new Date((indent as any).approvedAt), "dd-MMM-yy HH:mm") : null;
                            const ordered = (indent as any).orderedAt ? format(new Date((indent as any).orderedAt), "dd-MMM-yy HH:mm") : null;
                            const earliestExpected = indent.items?.reduce((min: string | null, it: any) => {
                              if (!it.expectedDelivery) return min;
                              return (!min || it.expectedDelivery < min) ? it.expectedDelivery : min;
                            }, null as string | null);
                            const expectedStr = earliestExpected ? format(new Date(earliestExpected + "T00:00:00"), "dd-MMM-yy") : null;
                            if (!raised && !verified && !approved && !ordered && !expectedStr) return null;
                            return (
                              <div className="mt-2 flex items-center gap-3 flex-wrap text-[12px] text-muted-foreground">
                                {raised && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />Raised {raised}</span>}
                                {verified && <><span className="text-muted-foreground/40">→</span><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Verified {verified}</span></>}
                                {approved && <><span className="text-muted-foreground/40">→</span><span className="flex items-center gap-1"><span className={`w-1.5 h-1.5 rounded-full inline-block ${indent.status === "rejected" ? "bg-red-400" : "bg-emerald-400"}`} />{indent.status === "rejected" ? "Rejected" : "Approved"} {approved}</span></>}
                                {ordered && <><span className="text-muted-foreground/40">→</span><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" />Ordered {ordered}</span></>}
                                {expectedStr && <><span className="text-muted-foreground/40">·</span><span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />Expected {expectedStr}</span></>}
                              </div>
                            );
                          })()}

                          {/* Explicit Verify Stock action for stores users */}
                          {(() => {
                            const ss = (indent as any).storesStatus as string | null;
                            const storesNotVerified = !ss || ss !== "verified";
                            const _piType = (indent as any).piType ?? "stores";
                            if (!((indent.status === "stores_check" || indent.status === "pending") && storesNotVerified && canCreateStores && _piType !== "material")) return null;
                            return (
                              <button
                                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-300 dark:border-cyan-700 px-2 py-0.5 rounded-full hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors"
                                onClick={(e) => { e.stopPropagation(); openDetail(indent); }}
                                data-testid={`button-verify-stock-${indent.id}`}
                              >
                                <PackageCheck className="w-3 h-3" /> VERIFY STOCK →
                              </button>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-sm font-semibold" data-testid={`text-items-count-${indent.id}`}>
                              {indent.status === "approved" || indent.status === "completed"
                                ? `${purchased}/${total} PURCHASED`
                                : `${total} ITEMS`}
                            </p>
                            {indent.status === "approved" && purchased === 0 && (
                              <p className="text-sm text-emerald-600 mt-0.5">READY TO PURCHASE</p>
                            )}
                            {canViewStores && indentGrnCounts && indentGrnCounts[indent.indentNo] ? (
                              (() => {
                                const count = indentGrnCounts[indent.indentNo];
                                const fullyReceived = indentFulfilmentStatus?.[indent.indentNo] === true;
                                return (
                                  <Link href={`/stores/grns?indentRef=${encodeURIComponent(indent.indentNo)}`}>
                                    <span
                                      className={`mt-1 inline-flex items-center gap-1 text-[12px] font-semibold px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${
                                        fullyReceived
                                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                                          : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                                      }`}
                                      data-testid={`badge-grn-status-${indent.id}`}
                                    >
                                      {fullyReceived ? (
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                      ) : (
                                        <PackageCheck className="w-2.5 h-2.5" />
                                      )}
                                      {fullyReceived
                                        ? `FULLY RECEIVED (${count} GRN${count > 1 ? "s" : ""})`
                                        : `PARTIAL · ${count} GRN${count > 1 ? "s" : ""}`}
                                      <span className="opacity-60">↗</span>
                                    </span>
                                  </Link>
                                );
                              })()
                            ) : canViewStores && indentGrnCounts && (indent.status === "approved" || indent.status === "completed") ? (
                              <Link href={`/stores/grns/new?indentRef=${encodeURIComponent(indent.indentNo)}`}>
                                <span
                                  className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold px-1.5 py-0.5 rounded-full border bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                                  data-testid={`badge-no-grn-${indent.id}`}
                                >
                                  <Package className="w-2.5 h-2.5" />
                                  NO GRN YET <span className="opacity-60">↗</span>
                                </span>
                              </Link>
                            ) : null}
                          </div>
                          {(indent as any).piType === "material" ? (
                            <Badge variant="outline" className="text-[12px] px-1.5 py-0 bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-700" data-testid={`badge-pi-type-${indent.id}`}>MAT. INDENT</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[12px] px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-300 dark:bg-slate-800/30 dark:text-slate-400 dark:border-slate-700" data-testid={`badge-pi-type-${indent.id}`}>STORE</Badge>
                          )}
                          {getStatusBadge(indent.status, (indent as any).storesStatus, (indent as any).piType)}
                          {(indent as any).items?.some((i: any) => i.purchaseStatus === "AWAITING_SERVICE_VERIFICATION") && (
                            <Badge variant="outline" className="text-[12px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-700 animate-pulse" data-testid={`badge-service-pending-${indent.id}`}>
                              ⏳ SERVICE PENDING
                            </Badge>
                          )}
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
          {sourceIrnId && sourceIrn && (
            <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-800">
              <ShoppingCart className="h-4 w-4 mt-0.5 shrink-0 text-indigo-600" />
              <div>
                <p className="font-semibold">Pre-filled from IRN <span className="font-mono">{sourceIrn.irnNo}</span></p>
                <p className="text-sm text-indigo-600 mt-0.5">
                  Items with procurement quantity have been populated below. Review and fill in Proposed By before submitting.
                </p>
              </div>
            </div>
          )}
          {prefillRequirementId && (
            <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-sm text-violet-800">
              <ClipboardList className="h-4 w-4 mt-0.5 shrink-0 text-violet-600" />
              <div>
                <p className="font-semibold">Linked to Material Requirement <span className="font-mono">REQ-{prefillRequirementId}</span></p>
                <p className="text-sm text-violet-600 mt-0.5">
                  This PI will be tracked against the demand requirement from the Work Programme shortage screen.
                </p>
              </div>
            </div>
          )}
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
                  <Label className="text-sm uppercase">DATE</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} data-testid="input-date" />
                </div>
                <div>
                  <Label className="text-sm uppercase">INDENT NO.</Label>
                  <Input value="AUTO-GENERATED" disabled className="bg-muted" data-testid="input-indent-no" />
                  <p className="text-sm text-muted-foreground mt-0.5">AUTO-GENERATED ON SAVE</p>
                </div>
                <div>
                  <Label className="text-sm uppercase">RAISED FROM <span className="text-red-500">*</span></Label>
                  <LocationPicker
                    value={{ siteId: formSiteId, raisedFrom: formRaisedFrom }}
                    onChange={(val) => { setFormSiteId(val.siteId); setFormRaisedFrom(val.raisedFrom); }}
                    sitesList={sitesList}
                    placeholder="Select location"
                    data-testid="select-site"
                  />
                  {prefillProject && (
                    <p className="text-xs text-amber-700 flex items-center gap-1 mt-1" data-testid="text-prefill-project">
                      <ClipboardList className="h-3 w-3" />
                      Project: {prefillProject.name}
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-sm uppercase">PROPOSED BY</Label>
                  <PersonnelCombobox
                    value={formProposedBy}
                    onChange={setFormProposedBy}
                    placeholder="Search personnel…"
                    data-testid="input-proposed-by"
                  />
                  <p className="text-sm text-muted-foreground mt-0.5">PERSON WHO IDENTIFIED THE NEED</p>
                </div>
                <div>
                  <Label className="text-sm uppercase">RAISED BY</Label>
                  <PersonnelCombobox
                    value={formRaisedBy}
                    onChange={setFormRaisedBy}
                    placeholder="Search personnel…"
                    data-testid="input-raised-by"
                  />
                  <p className="text-sm text-muted-foreground mt-0.5">PERSON CREATING THIS INDENT</p>
                </div>
              </div>
              <div>
                <Label className="text-sm uppercase">INDENT TYPE</Label>
                <div className="flex items-center gap-2 mt-1" data-testid="toggle-pi-type">
                  {formPiType === "material" ? (
                    <Badge className="bg-teal-50 text-teal-700 border border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700 font-semibold px-3 py-1" data-testid="badge-pi-type">
                      <Package className="w-3 h-3 mr-1.5" /> BULK MATERIAL INDENT
                    </Badge>
                  ) : (
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700 font-semibold px-3 py-1" data-testid="badge-pi-type">
                      <Warehouse className="w-3 h-3 mr-1.5" /> STORE / SPARES / CONSUMABLES
                    </Badge>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-sm text-muted-foreground underline hover:text-foreground"
                      onClick={() => {
                        const next = formPiType === "material" ? "stores" : "material";
                        setFormPiType(next);
                        const defaultRoute = next === "material" ? "material" : "stores";
                        setFormItems(prev => prev.map(it => ({ ...it, procurementRoute: defaultRoute })));
                      }}
                      data-testid="button-change-pi-type"
                    >
                      Change
                    </button>
                  )}
                </div>
                {formPiType === "material" && (
                  <p className="text-sm text-teal-700 dark:text-teal-400 mt-1">Material Indent goes directly for approval — no stores verification needed. Material receipt is recorded directly in the Plant module.</p>
                )}
              </div>
              <div>
                <Label className="text-sm uppercase">GENERAL REMARKS (OPTIONAL)</Label>
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
                    <span className="text-sm text-muted-foreground font-medium mt-2 w-5 flex-shrink-0">{index + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <div>
                        <Label className="text-sm">ITEM</Label>
                        <MaterialCombobox
                          description={item.description}
                          storeItems={storeItemsList}
                          recentItemIds={recentIndentItemIds}
                          onChange={(desc, uom, materialId) => {
                            const updated = [...formItems];
                            const mat = materialId != null ? (rawMaterialsList || []).find((m: any) => m.id === materialId) : null;
                            updated[index] = {
                              ...updated[index],
                              description: desc,
                              // Only apply uom from catalogue if it's a meaningful unit (not the "NOS" fallback
                              // used when a material has no defaultUom set — that would override the user's choice)
                              ...(uom && uom !== "NOS" ? { uom } : {}),
                              materialId: materialId ?? (desc !== item.description ? null : updated[index].materialId),
                              procurementRoute: mat ? ((mat as any).procurementRoute || "stores") : updated[index].procurementRoute,
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
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-sm">SPEC / DIMENSIONS <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input
                            value={item.spec}
                            onChange={(e) => updateItem(index, "spec", e.target.value)}
                            placeholder="e.g. FE 400 · 12mm Dia, 10mm thickness"
                            className="text-sm"
                            data-testid={`input-item-spec-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">PART NO / CAT. NO <span className="font-normal text-muted-foreground">(optional)</span></Label>
                          <Input
                            value={item.partNo}
                            onChange={(e) => updateItem(index, "partNo", e.target.value)}
                            placeholder="e.g. SKF 6205, IS 1786"
                            className="text-sm"
                            data-testid={`input-item-partno-${index}`}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-sm">QTY</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => updateItem(index, "qty", parseFloat(e.target.value) || 1)}
                            data-testid={`input-item-qty-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">UOM</Label>
                          <div className="relative">
                            <Input
                              list="pi-uom-options"
                              value={item.uom}
                              onChange={(e) => updateItem(index, "uom", e.target.value.toUpperCase())}
                              className="uppercase"
                              placeholder="UOM"
                              data-testid={`input-item-uom-${index}`}
                            />
                            <datalist id="pi-uom-options">
                              {UOM_ITEM_OPTIONS.map(u => <option key={u} value={u} />)}
                            </datalist>
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm">PURPOSE</Label>
                          <FreeTextCombobox
                            value={item.purpose}
                            onChange={(v) => updateItem(index, "purpose", v)}
                            options={[...PURPOSE_OPTIONS]}
                            placeholder="PURPOSE"
                            data-testid={`input-item-purpose-${index}`}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">PRIORITY</Label>
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
                            <Label className="text-sm">REQUIRED BY</Label>
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
                        <div>
                          <Label className="text-sm">ROUTE</Label>
                          <Select
                            value={item.procurementRoute ?? ""}
                            onValueChange={(v) => {
                              const updated = [...formItems];
                              updated[index] = { ...updated[index], procurementRoute: v || null };
                              setFormItems(updated);
                            }}
                          >
                            <SelectTrigger className="w-36 text-sm" data-testid={`select-item-route-${index}`}>
                              <SelectValue placeholder="Route…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stores">STORES</SelectItem>
                              <SelectItem value="material">BULK MATERIAL</SelectItem>
                              <SelectItem value="service">SERVICE / HIRE</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 bg-amber-50 dark:bg-amber-900/10 rounded-md px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm whitespace-nowrap text-muted-foreground">EST. RATE (₹)</Label>
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
                        <span className="text-sm text-muted-foreground">OR</span>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm whitespace-nowrap text-muted-foreground font-semibold text-amber-700">EST. AMOUNT (₹)</Label>
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
                          <p className="text-xs text-muted-foreground italic">Optional — enter rate or total amount to help admin evaluate</p>
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

      {view === "stores" && (
        <>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedIndent ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base uppercase flex items-center gap-2" data-testid="text-stores-indent-no">
                    <PackageCheck className="w-4 h-4 text-cyan-600" />
                    {selectedIndent.indentNo} — Stores Verification
                  </CardTitle>
                  {getStatusBadge(selectedIndent.status, (selectedIndent as any).storesStatus, (selectedIndent as any).piType)}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">Date</p>
                      <p className="font-semibold uppercase">{format(new Date(selectedIndent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">Raised By</p>
                      <p className="font-semibold uppercase">{selectedIndent.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">Purpose</p>
                      <p className="font-semibold uppercase">{selectedIndent.purpose}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">Location</p>
                      <p className="font-semibold uppercase">{selectedIndent.location}</p>
                    </div>
                  </div>
                  <div className="rounded-md border border-cyan-200 bg-cyan-50 dark:bg-cyan-950/30 dark:border-cyan-800 px-3 py-2 text-sm text-cyan-800 dark:text-cyan-300">
                    <strong>Stores Team:</strong> Check each item against current stock. Set status and available quantity where applicable, then submit for manager approval.
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm uppercase">Items to Verify ({selectedIndent.items.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedIndent.items.map((item, idx) => {
                    const v = storeItemVerifications[item.id] || { stockStatus: "", stockAvailableQty: "", storesItemNote: "", showNote: false };
                    const isInStock = v.stockStatus === "in_stock";
                    const isShort = v.stockStatus === "short";
                    const isOut = v.stockStatus === "out_of_stock";
                    const isVerified = !!v.stockStatus;
                    return (
                      <div key={item.id} className={`border rounded-lg p-3 space-y-3 ${isInStock ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : isShort ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : isOut ? "border-red-300 bg-red-50/50 dark:bg-red-950/20" : "border-border"}`} data-testid={`stores-item-${item.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-muted-foreground">#{idx + 1}</span>
                              <span className="font-semibold uppercase text-sm">{item.description}</span>
                              {(item as any).spec && <span className="text-sm text-slate-800 dark:text-slate-100 italic font-normal">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</span>}
                              {getPriorityBadge(item.priority)}
                              {!isVerified && <Badge variant="outline" className="text-sm bg-slate-50 text-slate-600 border-slate-300">PENDING</Badge>}
                              {isVerified && (
                                <Badge variant="outline" className={`text-sm ${isInStock ? "bg-emerald-50 text-emerald-700 border-emerald-300" : isShort ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-red-50 text-red-700 border-red-300"}`}>
                                  {isInStock ? "IN STOCK" : isShort ? "SHORT" : "OUT OF STOCK"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span className="font-semibold text-foreground">{item.qty} {item.uom}</span>
                              {item.estRate && <span>Est. ₹{item.estRate}/{item.uom}</span>}
                              {(() => {
                                const balance = (item as any).liveStockQty as number | null;
                                if (balance == null) return null;
                                const colour = balance >= item.qty ? "text-emerald-600 dark:text-emerald-400" : balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                                return (
                                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${colour}`}>
                                    <PackageCheck className="w-3.5 h-3.5" />
                                    Stock: {balance.toFixed(3)} {item.uom}
                                  </span>
                                );
                              })()}
                            </div>
                            {item.purpose && <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">FOR: {item.purpose}</p>}
                          </div>
                          {isVerified && (
                            <div className="flex-shrink-0">
                              {isInStock ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : isOut ? <XCircle className="w-5 h-5 text-red-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-muted-foreground uppercase">Stock Status:</span>
                          {(["in_stock", "short", "out_of_stock"] as const).map((s) => (
                            <Button
                              key={s}
                              size="sm"
                              variant={v.stockStatus === s ? "default" : "outline"}
                              className={`text-sm h-7 px-2 ${v.stockStatus === s && s === "in_stock" ? "bg-emerald-600 hover:bg-emerald-700" : v.stockStatus === s && s === "short" ? "bg-amber-500 hover:bg-amber-600" : v.stockStatus === s && s === "out_of_stock" ? "bg-red-600 hover:bg-red-700" : ""}`}
                              onClick={() => updateStoreVerification(item.id, "stockStatus", s)}
                              data-testid={`button-stock-${item.id}-${s}`}
                            >
                              {s === "in_stock" ? "✓ In Stock" : s === "short" ? "⚠ Short" : "✗ Out"}
                            </Button>
                          ))}
                        </div>

                        {(isShort || isOut) && (
                          <div className="flex items-center gap-3">
                            <label className="text-sm font-semibold text-muted-foreground uppercase whitespace-nowrap">Qty Available:</label>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={v.stockAvailableQty}
                              onChange={(e) => updateStoreVerification(item.id, "stockAvailableQty", e.target.value)}
                              className="h-8 w-28 text-sm"
                              placeholder="0"
                              data-testid={`input-stock-qty-${item.id}`}
                            />
                            <span className="text-sm text-muted-foreground">of {item.qty} {item.uom} requested</span>
                          </div>
                        )}

                        <div>
                          {!v.showNote ? (
                            <Button variant="ghost" size="sm" className="text-sm h-7 text-muted-foreground" onClick={() => updateStoreVerification(item.id, "showNote", true)} data-testid={`button-add-note-${item.id}`}>
                              + Add stores note
                            </Button>
                          ) : (
                            <div className="space-y-1">
                              <label className="text-sm font-semibold text-muted-foreground uppercase">Stores Note:</label>
                              <Input
                                value={v.storesItemNote}
                                onChange={(e) => updateStoreVerification(item.id, "storesItemNote", e.target.value)}
                                className="h-8 text-sm"
                                placeholder="e.g. available at second rack, check with vendor…"
                                data-testid={`input-stores-note-${item.id}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {(() => {
                    const allVerified = selectedIndent.items.every(item => !!storeItemVerifications[item.id]?.stockStatus);
                    return (
                      <div className="pt-2 border-t space-y-3">
                        {!allVerified && (
                          <p className="text-sm text-muted-foreground italic">Set stock status for all items to enable submission.</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          <Button
                            onClick={handleSubmitStoresVerify}
                            disabled={!allVerified || storesVerifyMutation.isPending}
                            data-testid="button-submit-stores-verify"
                          >
                            {storesVerifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PackageCheck className="w-4 h-4 mr-2" />}
                            Submit Verification
                          </Button>
                          <Button variant="outline" onClick={() => { setView("list"); setSelectedIndentId(null); }} data-testid="button-cancel-stores">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card><CardContent className="py-8 text-center text-muted-foreground"><p>INDENT NOT FOUND</p></CardContent></Card>
          )}
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-600 border-gray-300"
                      onClick={() => handlePrintIndent(selectedIndent)}
                      data-testid="button-print-indent"
                    >
                      <Printer className="w-3 h-3 mr-1" /> PRINT
                    </Button>
                    {selectedIndent.status === "completed" && (
                      <EditPermissionButton
                        recordType="purchase_indent"
                        recordId={selectedIndent.id}
                        onEditGranted={() => handleEditIndent()}
                        size="sm"
                      />
                    )}
                    {(selectedIndent.status !== "completed" || isAdmin) && canEdit && (
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
                    {getStatusBadge(selectedIndent.status, (selectedIndent as any).storesStatus, (selectedIndent as any).piType)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">DATE</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-date">
                        {format(new Date(selectedIndent.date + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">PROPOSED BY</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-proposed-by">{selectedIndent.proposedBy}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">RAISED BY</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-raised-by">{selectedIndent.raisedBy}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">RAISED FROM</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-location">
                        {locationLabel({ siteId: (selectedIndent as any).siteId ?? null, raisedFrom: (selectedIndent as any).raisedFrom ?? null }, sitesList)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">TOTAL ITEMS</p>
                      <p className="font-semibold uppercase" data-testid="text-detail-items-count">{selectedIndent.items.length} ITEMS</p>
                    </div>
                  </div>
                  {selectedIndent.remarks && (
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase">REMARKS</p>
                      <p className="text-sm uppercase">{selectedIndent.remarks}</p>
                    </div>
                  )}
                  {(() => {
                    const _createdAt = (selectedIndent as any).createdAt as string | null;
                    const _storesVerifiedAt = (selectedIndent as any).storesVerifiedAt as string | null;
                    const _storesStatus = (selectedIndent as any).storesStatus as string | null;
                    const fmtDate = (ts: string | null) => { try { return ts ? format(new Date(ts), "dd-MMM-yyyy") : null; } catch { return null; } };
                    const fmtTs = (ts: string | null) => { try { return ts ? format(new Date(ts), "dd-MMM-yyyy HH:mm") : null; } catch { return null; } };
                    const raisedLabel = fmtDate(_createdAt);
                    const storesLabel = _storesStatus === "verified" && _storesVerifiedAt
                      ? `Stores verified: ${fmtTs(_storesVerifiedAt)}`
                      : _storesStatus === "bypassed" ? "Stores bypassed" : null;
                    if (!raisedLabel && !storesLabel) return null;
                    return (
                      <p className="text-sm text-muted-foreground">
                        {raisedLabel && <span>Raised: {raisedLabel}</span>}
                        {raisedLabel && storesLabel && <span className="mx-1.5">·</span>}
                        {storesLabel && <span>{storesLabel}</span>}
                      </p>
                    );
                  })()}
                  <div>
                    <p className="text-sm font-semibold text-amber-600 uppercase tracking-wider mb-2">WORKFLOW STATUS</p>
                    <StatusSteps status={selectedIndent.status} storesStatus={(selectedIndent as any).storesStatus} piType={(selectedIndent as any).piType} />
                  </div>
                </CardContent>
              </Card>

              {(selectedIndent.status === "stores_check" || selectedIndent.status === "pending") ? (
                <>
                  {/* Guard: if stores hasn't verified yet and current user has stores write permission,
                      show an info bar instead of the approval action panel */}
                  {(() => {
                    const _ss = (selectedIndent as any).storesStatus as string | null;
                    const _piType2 = (selectedIndent as any).piType ?? "stores";
                    const _blocked = canCreateStores && (!_ss || _ss !== "verified") && _piType2 !== "material";
                    if (!_blocked) return null;
                    return (
                      <Card className="shadow-none border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                        <CardContent className="py-3 px-4 flex items-center gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Stores verification required</p>
                            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">Complete stock verification before items can be approved.</p>
                          </div>
                          <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300 hover:bg-amber-100 shrink-0 text-sm" onClick={() => openDetail(selectedIndent)} data-testid="button-stores-verify-now">
                            Verify Now
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })()}
                  {/* Summary bar */}
                  {(() => {
                    const allItems = selectedIndent.items;
                    const actionedCount = allItems.filter(item => { const st = itemApprovalStates[item.id]; return st && ['approved','modified','rejected'].includes(st.action); }).length;
                    const totalEst = allItems.reduce((sum, item) => sum + ((item as any).estAmount ?? (item.estRate && item.qty ? item.estRate * item.qty : 0) ?? 0), 0);
                    const getEffectiveStockStatus = (item: any) => {
                      if (item.stockStatus) return item.stockStatus as string;
                      const live = item.liveStockQty as number | null;
                      if (live == null) return null;
                      return live >= item.qty ? 'in_stock' : live > 0 ? 'short' : 'out_of_stock';
                    };
                    const hasAvail = allItems.some(item => { const st = itemApprovalStates[item.id]; return (!st || st.action === 'pending') && getEffectiveStockStatus(item) === 'in_stock'; });
                    const approveAll = () => {
                      const updates: Record<number, ItemApprovalState> = {};
                      allItems.forEach(item => {
                        const st = itemApprovalStates[item.id];
                        if ((!st || st.action === 'pending') && getEffectiveStockStatus(item) === 'in_stock')
                          updates[item.id] = { action: 'approved', approvedQty: item.qty, modQty: item.qty.toString(), rejectReason: '' };
                      });
                      setItemApprovalStates(prev => ({ ...prev, ...updates }));
                    };
                    return (
                      <Card className="shadow-none">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex gap-5 items-center">
                              <div>
                                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Actioned</p>
                                <p className="font-bold text-gray-900 dark:text-gray-100">{actionedCount} / {allItems.length}</p>
                              </div>
                              {totalEst > 0 && (<>
                                <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                                <div>
                                  <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Est. Total</p>
                                  <p className="font-bold text-gray-900 dark:text-gray-100">₹{Math.round(totalEst).toLocaleString("en-IN")}</p>
                                </div>
                              </>)}
                            </div>
                            <div className="flex gap-2">
                              {hasAvail && (
                                <Button size="sm" variant="outline" className="text-sm text-[#0F5F64] border-[#0F5F64]/30 bg-[#0F5F64]/5 hover:bg-[#0F5F64]/15 dark:text-teal-300" onClick={approveAll} data-testid="button-approve-all-available">
                                  Approve All Available
                                </Button>
                              )}
                              <Button variant="outline" size="sm" className="text-blue-600 border-blue-300 hover:bg-blue-50 text-sm" onClick={() => selectedIndentId && notifyMutation.mutate(selectedIndentId)} disabled={notifyMutation.isPending} data-testid="button-notify-stakeholders">
                                {notifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🔔</span>}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* Per-item approval cards */}
                  <div className="space-y-3">
                  {selectedIndent.items.map((item, index) => {
                    const st: ItemApprovalState = itemApprovalStates[item.id] || { action: 'pending', approvedQty: item.qty, modQty: item.qty.toString(), rejectReason: '' };
                    const isActioned = (['approved','modified','rejected'] as const).includes(st.action as any);
                    const stockStatus = (item as any).stockStatus as string | null;
                    const stockAvailableQty = (item as any).stockAvailableQty as number | null;
                    const liveStockQty = (item as any).liveStockQty as number | null;
                    const effStockStatus = stockStatus ?? (liveStockQty != null ? (liveStockQty >= item.qty ? 'in_stock' : liveStockQty > 0 ? 'short' : 'out_of_stock') : null);
                    const effStockQty = stockAvailableQty ?? liveStockQty;
                    const isLive = !stockStatus && liveStockQty != null;
                    const updateState = (updates: Partial<ItemApprovalState>) =>
                      setItemApprovalStates(prev => ({ ...prev, [item.id]: { ...st, ...updates } }));
                    const estAmt = (item as any).estAmount ?? (item.estRate && item.qty ? Math.round(item.estRate * item.qty) : null);
                    const stockBadge = effStockStatus ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isLive ? 'opacity-75' : ''} ${
                        effStockStatus === 'in_stock' ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40' :
                        effStockStatus === 'short' ? 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40' :
                        'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800'
                      }`}>
                        {effStockStatus === 'in_stock' ? <PackageCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {effStockStatus === 'in_stock' ? `${isLive ? 'Live' : 'Stores'}: ${effStockQty != null ? effStockQty : item.qty} ${item.uom} avail.` :
                         effStockStatus === 'short' ? `${isLive ? 'Live' : 'Stores'}: ${effStockQty ?? 0} / ${item.qty} — short` : `${isLive ? 'Live' : 'Stores'}: No stock`}
                        {(item as any).storesItemNote ? ` · ${(item as any).storesItemNote}` : ''}
                      </span>
                    ) : null;

                    if (isActioned) {
                      return (
                        <div key={item.id} className={`border rounded-lg p-3 space-y-2 ${
                          st.action === 'approved' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800' :
                          st.action === 'rejected' ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800' :
                          'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                        }`} data-testid={`card-approval-item-${item.id}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className={`font-semibold text-sm ${st.action==='rejected'?'line-through text-red-800 dark:text-red-300':st.action==='approved'?'text-emerald-900 dark:text-emerald-300':'text-amber-900 dark:text-amber-300'}`}>{index+1}. {item.description}</h3>
                              {(item as any).spec && <p className="text-sm text-slate-800 dark:text-slate-100 italic mt-0.5">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                            </div>
                            <div className="shrink-0 text-right">
                              <span className={`font-bold text-sm ${st.action==='rejected'?'text-red-700':st.action==='approved'?'text-emerald-700':'text-amber-700'}`}>{st.action==='modified'?st.approvedQty:item.qty} {item.uom}</span>
                              {st.action==='modified' && <p className="text-[12px] text-amber-600/80 line-through">req: {item.qty}</p>}
                            </div>
                          </div>
                          {stockBadge}
                          <div className={`flex items-start gap-2 text-sm py-1.5 px-2 rounded-md ${st.action==='approved'?'text-emerald-700 bg-emerald-100/50':st.action==='rejected'?'text-red-700 bg-red-100/50':'text-amber-800 bg-amber-100/50'}`}>
                            {st.action==='approved' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                            {st.action==='rejected' && <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                            {st.action==='modified' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{st.action==='approved'?'Approved as requested':st.action==='rejected'?'Rejected':`Partial: ${st.approvedQty} of ${item.qty}`}</span>
                              {st.action==='rejected' && st.rejectReason && <p className="opacity-80 truncate">"{st.rejectReason}"</p>}
                            </div>
                            <button className="text-[12px] underline opacity-60 hover:opacity-100 shrink-0" onClick={() => updateState({ action: 'pending' })}>Undo</button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={item.id} className="bg-white dark:bg-card border-2 border-[#0F5F64]/20 shadow-sm rounded-xl overflow-hidden" data-testid={`card-approval-item-${item.id}`}>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-900 dark:text-gray-100">{index+1}. {item.description}</p>
                              {(item as any).spec && <p className="text-sm text-slate-800 dark:text-slate-100 italic">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                              <p className="text-sm text-gray-700 dark:text-gray-300">FOR: {item.purpose}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-bold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-sm">{item.qty} {item.uom}</span>
                              {estAmt && <p className="text-sm text-muted-foreground mt-0.5">Est ₹{estAmt.toLocaleString("en-IN")}</p>}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {getPriorityBadge(item.priority)}
                            {(item as any).requiredBy && <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">REQ. BY: {format(new Date((item as any).requiredBy+"T00:00:00"),"dd-MMM-yyyy").toUpperCase()}</span>}
                            {stockBadge}
                          </div>
                          {st.action === 'pending' && (() => {
                            const _ss2 = (selectedIndent as any).storesStatus as string | null;
                            const _piType3 = (selectedIndent as any).piType ?? "stores";
                            const _blocked2 = canCreateStores && (!_ss2 || _ss2 !== "verified") && _piType3 !== "material";
                            if (_blocked2) return null;
                            return (
                              <div className="grid grid-cols-3 gap-2 mt-1">
                                <button onClick={() => updateState({ action:'approved', approvedQty:item.qty })} className="flex flex-col items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 py-2.5 rounded-lg transition-colors" data-testid={`button-approve-item-${item.id}`}>
                                  <Check className="w-5 h-5" /><span className="text-sm font-semibold">Approve</span>
                                </button>
                                <button onClick={() => updateState({ action:'modifying', modQty:item.qty.toString() })} className="flex flex-col items-center gap-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 py-2.5 rounded-lg transition-colors" data-testid={`button-modify-item-${item.id}`}>
                                  <Edit2 className="w-4 h-4" /><span className="text-sm font-semibold">Modify Qty</span>
                                </button>
                                <button onClick={() => updateState({ action:'rejecting', rejectReason:'' })} className="flex flex-col items-center gap-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 py-2.5 rounded-lg transition-colors" data-testid={`button-reject-item-${item.id}`}>
                                  <X className="w-5 h-5" /><span className="text-sm font-semibold">Reject</span>
                                </button>
                              </div>
                            );
                          })()}
                          {st.action === 'modifying' && (
                            <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                              <label className="block text-sm font-medium text-amber-900 dark:text-amber-300 mb-1.5">Approved Qty ({item.uom})</label>
                              <div className="flex gap-2">
                                <Input type="number" min={0} max={item.qty} value={st.modQty} onChange={(e) => updateState({ modQty:e.target.value })} className="flex-1 border-amber-300" data-testid={`input-modify-qty-${item.id}`} />
                                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={() => { const q=parseFloat(st.modQty); if(!isNaN(q)&&q>=0) updateState({action:'modified',approvedQty:q}); }} data-testid={`button-save-modify-${item.id}`}>Save</Button>
                              </div>
                              <div className="flex justify-end mt-1.5"><button className="text-sm text-amber-700 dark:text-amber-400 underline" onClick={() => updateState({action:'pending'})}>Cancel</button></div>
                            </div>
                          )}
                          {st.action === 'rejecting' && (
                            <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg border border-red-200 dark:border-red-800">
                              <label className="block text-sm font-medium text-red-900 dark:text-red-300 mb-1.5">Reason for Rejection</label>
                              <Textarea value={st.rejectReason} onChange={(e) => updateState({rejectReason:e.target.value})} placeholder="e.g. Budget exceeded, not required now..." className="bg-white dark:bg-card border-red-300 dark:border-red-800 resize-none min-h-[60px] text-sm" rows={2} data-testid={`input-reject-reason-${item.id}`} />
                              <div className="flex justify-between items-center mt-2">
                                <button className="text-sm text-red-700 dark:text-red-400 underline" onClick={() => updateState({action:'pending'})}>Cancel</button>
                                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={!st.rejectReason.trim()} onClick={() => updateState({action:'rejected'})} data-testid={`button-confirm-reject-${item.id}`}>Confirm Reject</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </div>

                  {/* Overall remarks */}
                  <Card className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2"><FileText className="w-4 h-4 text-gray-500" />Overall Manager Remarks</label>
                        <Textarea value={approvalRemarks} onChange={(e)=>setApprovalRemarks(e.target.value)} onBlur={(e)=>setApprovalRemarks(e.target.value.toUpperCase())} placeholder="Add any final comments for stores or procurement..." className="uppercase min-h-[70px]" data-testid="input-approval-remarks" />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sticky bottom Finalise button */}
                  {(() => {
                    const allActioned = selectedIndent.items.every(item => { const st = itemApprovalStates[item.id]; return st && (['approved','modified','rejected'] as const).includes(st.action as any); });
                    return (
                      <div className="sticky bottom-0 bg-white dark:bg-card border-t border-gray-200 dark:border-gray-800 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] rounded-b-lg">
                        <Button disabled={!allActioned || approveMutation.isPending} onClick={handleFinaliseApproval} className={`w-full py-5 text-base font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${allActioned?'bg-[#F97316] hover:bg-[#EA580C] text-white shadow-lg shadow-orange-500/20':'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'}`} data-testid="button-finalise-approval">
                          {approveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : allActioned ? <CheckCircle2 className="w-5 h-5" /> : null}
                          Finalise Approval
                        </Button>
                        {!allActioned && <p className="text-center text-sm text-muted-foreground mt-2">Action all {selectedIndent.items.length} items to enable</p>}
                      </div>
                    );
                  })()}
                </>
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
                            <p className="text-sm text-muted-foreground mt-0.5">FOR: {item.purpose}</p>
                          </div>
                          <div className="flex gap-1 flex-wrap items-center justify-end">
                            {getPriorityBadge(item.priority)}
                            {(item as any).requiredBy && (
                              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium" data-testid={`text-detail-req-by-${item.id}`}>
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
                                <span className="text-sm text-amber-600 ml-1">(REDUCED)</span>
                              )}</span>
                            </>
                          )}
                          {(() => {
                            const ea = (item as any).estAmount ?? (item.estRate && item.qty ? Math.round(item.estRate * item.qty) : null);
                            return ea ? (
                              <span className="text-sm font-semibold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded">
                                ≈ ₹{ea.toLocaleString("en-IN")}
                                {item.estRate ? ` @ ₹${item.estRate}/unit` : ""}
                              </span>
                            ) : null;
                          })()}
                        </div>
                        {((item as any).expectedDelivery || (item as any).paymentMode) && (
                          <div className="mt-2 flex flex-wrap gap-2 items-center">
                            {(item as any).expectedDelivery && (
                              <span className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400" data-testid={`text-detail-exp-delivery-${item.id}`}>
                                <Calendar className="w-3 h-3" />
                                EXP: {format(new Date((item as any).expectedDelivery + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                              </span>
                            )}
                            {(item as any).paymentMode && (
                              <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                                (item as any).paymentMode === "cash" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                                (item as any).paymentMode === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                                (item as any).paymentMode === "upi" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                (item as any).paymentMode === "cheque" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                              }`} data-testid={`badge-detail-payment-${item.id}`}>
                                {((item as any).paymentMode as string).toUpperCase()}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-sm text-muted-foreground"
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
              <IndentAuditTrail indent={selectedIndent} />
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

      {(view === "purchase" || view === "procurement") && (
        <>
          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedIndent ? (
            <>
              {/* Teal procurement header */}
              <div className="rounded-xl overflow-hidden border border-[#0F5F64]/20 shadow-sm">
                <div className="bg-[#0F5F64] text-white p-5">
                  <div className="flex items-center gap-2 mb-1 text-xs uppercase tracking-wider opacity-70">
                    <ChevronLeft className="w-3.5 h-3.5" /> Purchase Indent · Procurement
                  </div>
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div>
                      <h2 className="text-xl font-bold" data-testid="text-purchase-indent-no">{selectedIndent.indentNo}</h2>
                      <p className="text-sm text-teal-200 mt-0.5">
                        {selectedIndent.raisedBy} · {format(new Date(selectedIndent.date + "T00:00:00"), "dd MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {getStatusBadge(selectedIndent.status, (selectedIndent as any).storesStatus, (selectedIndent as any).piType)}
                        {canViewStores && indentGrnCounts?.[selectedIndent.indentNo] ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-600/80 text-white border border-emerald-400/40 rounded-full px-2 py-0.5" data-testid="badge-grn-count">
                            <Package className="w-3 h-3" />
                            {indentGrnCounts[selectedIndent.indentNo]} GRN{indentGrnCounts[selectedIndent.indentNo] > 1 ? "s" : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex gap-1 items-center">
                        {canCreateStores && selectedIndent.items.some(i => ["purchased","partial"].includes((i.purchaseStatus || "").toLowerCase())) && (
                          isIndentFullyReceived ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-emerald-300/60 font-semibold cursor-not-allowed select-none"
                              title="All approved quantities have already been received"
                              data-testid="badge-fully-received"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Fully received
                            </span>
                          ) : (
                            <button onClick={openGrnDialog} className="text-xs text-emerald-300 underline hover:text-white font-semibold" data-testid="button-create-grn">
                              + Create GRN
                            </button>
                          )
                        )}
                        <button onClick={() => handlePrintIndent(selectedIndent)} className="text-xs text-teal-200 underline hover:text-white flex items-center gap-0.5" data-testid="button-print-indent-purchase"><Printer className="w-3 h-3" /> Print</button>
                        {(selectedIndent.status !== "completed" || isAdmin) && canEdit && (
                          <button onClick={handleEditIndent} className="text-xs text-teal-200 underline hover:text-white" data-testid="button-edit-indent-purchase">Edit</button>
                        )}
                        {canDelete && (
                          <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-300 underline hover:text-red-200" data-testid="button-delete-indent-purchase">Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedIndent.approvedBy && (
                    <div className="bg-white/10 border border-white/15 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                      <p className="text-sm"><strong>Approved</strong>{" "}
                        <span className="text-teal-200">· {selectedIndent.approvedBy}{selectedIndent.approvedAt ? ` · ${selectedIndent.approvedAt}` : ""}</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Sticky summary bar */}
                {(() => {
                  const toProcure = selectedIndent.items.filter(i => {
                    const approvedQty = i.approvedQty ?? i.qty;
                    const ps = (i.purchaseStatus || "").toLowerCase();
                    return approvedQty > 0 && ps !== "purchased" && ps !== "partial";
                  });
                  const rejectedCount = selectedIndent.items.filter(i => (i.approvedQty ?? i.qty) === 0).length;
                  const totalEst = selectedIndent.items.reduce((s, i) => s + ((i as any).estAmount ?? (i.estRate && i.qty ? i.estRate * i.qty : 0) ?? 0), 0);
                  const totalPurchased = getTotalAmount(selectedIndent.items);
                  return (
                    <div className="bg-white dark:bg-card border-b border-gray-200 dark:border-gray-700 px-4 py-2.5 flex gap-4 items-center flex-wrap">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-[#0F5F64]">
                        <ShoppingCart className="w-4 h-4" /> {toProcure.length} to procure
                      </div>
                      {rejectedCount > 0 && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-500">
                          <Ban className="w-3.5 h-3.5" /> {rejectedCount} rejected
                        </div>
                      )}
                      <div className="ml-auto flex items-center gap-3 text-sm">
                        {totalEst > 0 && <span className="text-gray-600 dark:text-gray-400">Est: <strong className="text-gray-800 dark:text-gray-200">₹{Math.round(totalEst).toLocaleString("en-IN")}</strong></span>}
                        {totalPurchased > 0 && <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Purchased: ₹{totalPurchased.toLocaleString("en-IN")}</span>}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Force close */}
              {selectedIndent.status === "approved" && hasUnfulfilledItems(selectedIndent.items) && (
                <div className="flex justify-end">
                  <Button className="bg-amber-600 text-white" onClick={() => setShowForceCloseConfirm(true)} data-testid="button-force-close">
                    <Lock className="w-4 h-4 mr-1" /> FORCE CLOSE INDENT
                  </Button>
                </div>
              )}

              {/* ── Unified Purchase Action Card (all PI types and routes) ── */}
              {["approved", "purchaser_actioned", "awaiting_delivery", "partially_received"].includes(selectedIndent.status) && canCreate && (
                <Card className="border-violet-200 dark:border-violet-800">
                  <CardHeader className="py-3 px-4 bg-violet-50 dark:bg-violet-900/20 rounded-t-lg">
                    <CardTitle className="text-sm font-semibold text-violet-800 dark:text-violet-200 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" />
                      PURCHASE ACTION
                      {selectedIndent.status !== "approved" && (
                        <Badge variant="outline" className="ml-2 text-sm bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700">SUBMITTED</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {selectedIndent.status === "approved" ? (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">Select the action type for each item and fill in the required details, then submit all at once.</p>
                        <div className="space-y-3">
                          {selectedIndent.items
                            .filter(i => !["cancelled", "closed"].includes((i as any).status || "") && (i.approvedQty ?? i.qty) > 0)
                            .map(item => {
                              const route = ((item as any).procurementRoute as string) || "stores";
                              const approvedQty = item.approvedQty ?? item.qty;
                              const isMat = (selectedIndent as any).piType === "material";
                              const defaultActionType = (isMat || route === "bulk_plant") ? "ordered" : "already_purchased";
                              const pd = purchaserActionData[item.id] ?? { purchaseActionType: defaultActionType, qty: String(approvedQty), orderNo: "", orderedByName: "", vendor: "", rate: "", paymentMode: isMat ? "credit" : "cash", paidBy: "company", payerName: "", purchaseDate: format(new Date(), "yyyy-MM-dd"), expectedDeliveryDate: "", billNo: "", remarks: "" };
                              const updField = (field: string, val: string) => {
                                setPurchaserActionData(prev => ({ ...prev, [item.id]: { ...pd, [field]: val } }));
                              };
                              const at = pd.purchaseActionType;
                              const isOrdered = at === "ordered";
                              const isNotAvailable = at === "not_available";
                              const isRecommendCancel = at === "recommend_cancellation";
                              const isPurchased = !isOrdered && !isNotAvailable && !isRecommendCancel;
                              const badgeStyle = isOrdered ? "bg-sky-50 text-sky-700 border-sky-200" : isNotAvailable ? "bg-red-50 text-red-700 border-red-200" : isRecommendCancel ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200";
                              const badgeLabel = isOrdered ? "Ordering" : isNotAvailable ? "Not Available" : isRecommendCancel ? "Recommend Cancel" : "Purchasing";
                              return (
                                <div key={item.id} className="border rounded-lg overflow-hidden bg-white dark:bg-gray-950">
                                  {/* Item header row */}
                                  <div className="flex items-start justify-between px-4 py-3 bg-muted/40 border-b">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold">{item.description}</span>
                                        <Badge variant="outline" className={
                                          (route === "material" || route === "bulk_plant") ? "text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300"
                                          : route === "service" ? "text-violet-700 border-violet-300 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-300"
                                          : "text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300"
                                        }>
                                          {(route === "material" || route === "bulk_plant") ? "BULK MATERIAL" : route === "service" ? "SERVICE / HIRE" : "STORES"}
                                        </Badge>
                                      </div>
                                      <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                                        <span>PI Qty: <strong>{item.qty} {item.uom}</strong></span>
                                        <span>Approved: <strong className="text-green-700 dark:text-green-400">{approvedQty} {item.uom}</strong></span>
                                      </div>
                                    </div>
                                    <Badge variant="outline" className={`text-sm ${badgeStyle}`}>{badgeLabel}</Badge>
                                  </div>
                                  {/* Form fields */}
                                  <div className="p-3 space-y-3">
                                    {/* Action type selector */}
                                    <div>
                                      <Label className="text-sm">PURCHASE ACTION TYPE <span className="text-red-500">*</span></Label>
                                      <Select value={pd.purchaseActionType} onValueChange={v => updField("purchaseActionType", v)}>
                                        <SelectTrigger data-testid={`select-pa-action-${item.id}`}><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="already_purchased">✓ Already Purchased / Paid</SelectItem>
                                          <SelectItem value="ordered">📦 Ordered — Awaiting Delivery</SelectItem>
                                          <SelectItem value="not_available">✗ Not Available in Market</SelectItem>
                                          <SelectItem value="recommend_cancellation">⚠ Recommend Cancellation (PM to decide)</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {/* Fields for "ordered" */}
                                    {isOrdered && (
                                      <>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                          <div><Label className="text-sm">QTY ORDERED ({item.uom})</Label><Input type="number" min={0} max={approvedQty} value={pd.qty} onChange={e => updField("qty", e.target.value)} data-testid={`input-pa-qty-${item.id}`} /></div>
                                          <div><Label className="text-sm">VENDOR / SUPPLIER</Label><Input value={pd.vendor} onChange={e => updField("vendor", e.target.value)} onBlur={e => updField("vendor", e.target.value.toUpperCase())} placeholder="Optional" className="uppercase" data-testid={`input-pa-vendor-${item.id}`} /></div>
                                          <div><Label className="text-sm">ORDER / PO NO.</Label><Input value={pd.orderNo} onChange={e => updField("orderNo", e.target.value)} placeholder="Optional" data-testid={`input-pa-order-no-${item.id}`} /></div>
                                          <div>
                                            <Label className="text-sm">RATE (₹/{item.uom}) <span className="text-red-500">*</span></Label>
                                            <Input type="number" value={pd.rate} onChange={e => updField("rate", e.target.value)} data-testid={`input-pa-rate-${item.id}`} />
                                            {pd.rate && parseFloat(pd.qty) > 0 && <p className="text-xs text-muted-foreground mt-0.5">Est: ₹{(parseFloat(pd.rate) * parseFloat(pd.qty)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>}
                                          </div>
                                          <div><Label className="text-sm">EXPECTED DELIVERY <span className="text-red-500">*</span></Label><Input type="date" value={pd.expectedDeliveryDate} onChange={e => updField("expectedDeliveryDate", e.target.value)} data-testid={`input-pa-delivery-${item.id}`} /></div>
                                          <div>
                                            <Label className="text-sm">PAYMENT MODE</Label>
                                            <Select value={pd.paymentMode || "credit"} onValueChange={v => updField("paymentMode", v)}>
                                              <SelectTrigger data-testid={`select-pa-payment-${item.id}`}><SelectValue /></SelectTrigger>
                                              <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="credit">Credit</SelectItem><SelectItem value="advance">Advance</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="rtgs">RTGS / NEFT</SelectItem></SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                        <div><Label className="text-sm">REMARKS</Label><Input value={pd.remarks} onChange={e => updField("remarks", e.target.value)} placeholder="Optional notes" data-testid={`input-pa-remarks-${item.id}`} /></div>
                                        <p className="text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded p-2">Marking as ordered will NOT create a GRN or update stock. Use "Record Delivery" on the item card when goods arrive.</p>
                                      </>
                                    )}
                                    {/* Fields for "already_purchased" */}
                                    {isPurchased && (
                                      <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                          <div>
                                            <Label className="text-sm">QTY PURCHASING <span className="text-red-500">*</span></Label>
                                            <Input type="number" min={0} max={approvedQty} value={pd.qty} onChange={e => updField("qty", e.target.value)} data-testid={`input-pa-qty-${item.id}`} />
                                            {parseFloat(pd.qty) < approvedQty && parseFloat(pd.qty) > 0 && <p className="text-xs text-amber-600 mt-0.5">Shortfall: {approvedQty - parseFloat(pd.qty)} {item.uom}</p>}
                                          </div>
                                          <div><Label className="text-sm">VENDOR / SUPPLIER <span className="text-red-500">*</span></Label><Input value={pd.vendor} onChange={e => updField("vendor", e.target.value)} onBlur={e => updField("vendor", e.target.value.toUpperCase())} placeholder="Supplier name" className="uppercase" data-testid={`input-pa-vendor-${item.id}`} /></div>
                                          <div>
                                            <Label className="text-sm">RATE (₹/{item.uom}) <span className="text-red-500">*</span></Label>
                                            <Input type="number" value={pd.rate} onChange={e => updField("rate", e.target.value)} data-testid={`input-pa-rate-${item.id}`} />
                                            {pd.rate && parseFloat(pd.qty) > 0 && <p className="text-xs text-muted-foreground mt-0.5">Total: ₹{(parseFloat(pd.rate) * parseFloat(pd.qty)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>}
                                          </div>
                                          <div><Label className="text-sm">PURCHASE DATE</Label><Input type="date" value={pd.purchaseDate} onChange={e => updField("purchaseDate", e.target.value)} data-testid={`input-pa-purchase-date-${item.id}`} /></div>
                                          <div><Label className="text-sm">BILL / INVOICE NO.</Label><Input value={pd.billNo} onChange={e => updField("billNo", e.target.value)} placeholder="Optional" data-testid={`input-pa-bill-no-${item.id}`} /></div>
                                          <div>
                                            <Label className="text-sm">PAYMENT MODE</Label>
                                            <Select value={pd.paymentMode || "cash"} onValueChange={v => updField("paymentMode", v)}>
                                              <SelectTrigger data-testid={`select-pa-payment-${item.id}`}><SelectValue /></SelectTrigger>
                                              <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="credit">Credit</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="rtgs">RTGS / NEFT</SelectItem></SelectContent>
                                            </Select>
                                          </div>
                                          <div>
                                            <Label className="text-sm">PAID BY</Label>
                                            <Select value={pd.paidBy || "company"} onValueChange={v => updField("paidBy", v)}>
                                              <SelectTrigger data-testid={`select-pa-paidby-${item.id}`}><SelectValue /></SelectTrigger>
                                              <SelectContent><SelectItem value="company">Company Account</SelectItem><SelectItem value="personal">Personal (Reimbursement)</SelectItem></SelectContent>
                                            </Select>
                                          </div>
                                        </div>
                                        {pd.paidBy === "personal" && (
                                          <div>
                                            <Label className="text-sm">PAID BY — PERSON NAME <span className="text-red-500">*</span></Label>
                                            <Input value={pd.payerName || ""} onChange={e => updField("payerName", e.target.value)} placeholder="Name of employee who paid (for reimbursement)" data-testid={`input-pa-payer-name-${item.id}`} />
                                            <p className="text-xs text-amber-600 mt-0.5">Reimbursement will be tracked to this person.</p>
                                          </div>
                                        )}
                                        <div><Label className="text-sm">REMARKS</Label><Input value={pd.remarks} onChange={e => updField("remarks", e.target.value)} placeholder="Optional notes" data-testid={`input-pa-remarks-${item.id}`} /></div>
                                        {/* Per-item photo pickers */}
                                        <div className="border rounded-lg p-2.5 bg-muted/20 space-y-1.5 mt-1">
                                          <p className="text-xs font-medium text-muted-foreground">Invoice / Bill Photo <span className="text-gray-400 font-normal">(optional)</span></p>
                                          <input type="file" id={`pa-cam-${item.id}`} accept="image/*" capture="environment" className="hidden" onChange={e => { addPaPhotos(item.id, e.target.files); e.target.value = ""; }} />
                                          <input type="file" id={`pa-gal-${item.id}`} accept="image/*" multiple className="hidden" onChange={e => { addPaPhotos(item.id, e.target.files); e.target.value = ""; }} />
                                          <input type="file" id={`pa-pdf-${item.id}`} accept="application/pdf,.pdf" multiple className="hidden" onChange={e => { addPaPhotos(item.id, e.target.files); e.target.value = ""; }} />
                                          <div className="flex flex-wrap gap-1.5">
                                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7 px-2" onClick={() => (document.getElementById(`pa-cam-${item.id}`) as HTMLInputElement)?.click()} data-testid={`button-pa-cam-${item.id}`}><Camera className="w-3 h-3" /> Take Photo</Button>
                                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7 px-2" onClick={() => (document.getElementById(`pa-gal-${item.id}`) as HTMLInputElement)?.click()} data-testid={`button-pa-gal-${item.id}`}><ImageIcon className="w-3 h-3" /> Gallery</Button>
                                            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs h-7 px-2" onClick={() => (document.getElementById(`pa-pdf-${item.id}`) as HTMLInputElement)?.click()} data-testid={`button-pa-pdf-${item.id}`}><FileText className="w-3 h-3" /> PDF / File</Button>
                                          </div>
                                          {(paPhotos[item.id] || []).length > 0 && (
                                            <div className="space-y-1">
                                              {(paPhotos[item.id] || []).map((f, i) => (
                                                <div key={i} className="flex items-center gap-2 bg-white dark:bg-gray-900 rounded px-2 py-1 border">
                                                  <ImageIcon className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                                  <span className="flex-1 truncate text-xs">{f.name}</span>
                                                  <button type="button" onClick={() => removePaPhoto(item.id, i)} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                    {/* Not available */}
                                    {isNotAvailable && (
                                      <>
                                        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded p-2">Item not available in market — no purchase details required. This item will be marked as not procured.</p>
                                        <div><Label className="text-sm">REMARKS</Label><Input value={pd.remarks} onChange={e => updField("remarks", e.target.value)} placeholder="Optional notes" data-testid={`input-pa-remarks-${item.id}`} /></div>
                                      </>
                                    )}
                                    {/* Recommend cancellation */}
                                    {isRecommendCancel && (
                                      <>
                                        <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded p-2">Flagging for PM / Admin review — actual cancellation requires PM or Admin approval.</p>
                                        <div><Label className="text-sm">REASON FOR RECOMMENDATION <span className="text-red-500">*</span></Label><Input value={pd.remarks} onChange={e => updField("remarks", e.target.value)} placeholder="Why are you recommending cancellation?" data-testid={`input-pa-remarks-${item.id}`} /></div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                        <div className="flex justify-end mt-3">
                          <Button
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                            disabled={purchaserActionMutation.isPending}
                            onClick={() => {
                              const activeItems = selectedIndent.items.filter(i => !["cancelled", "closed"].includes((i as any).status || "") && (i.approvedQty ?? i.qty) > 0);
                              const isMat = (selectedIndent as any).piType === "material";
                              for (const aItem of activeItems) {
                                const defaultAt = (isMat || (aItem as any).procurementRoute === "bulk_plant") ? "ordered" : "already_purchased";
                                const pd = purchaserActionData[aItem.id] ?? { purchaseActionType: defaultAt, qty: String(aItem.approvedQty ?? aItem.qty), orderNo: "", orderedByName: "", vendor: "", rate: "", paymentMode: "cash", paidBy: "company", payerName: "", purchaseDate: format(new Date(), "yyyy-MM-dd"), expectedDeliveryDate: "", billNo: "", remarks: "" };
                                const at = pd.purchaseActionType;
                                if (at === "not_available") continue;
                                if (at === "recommend_cancellation") { if (!pd.remarks.trim()) { toast({ title: "Reason required", description: `Enter reason for recommending cancellation: ${aItem.description}`, variant: "destructive" }); return; } continue; }
                                if (!parseFloat(pd.qty) || parseFloat(pd.qty) <= 0) { toast({ title: "Invalid quantity", description: `Enter a valid quantity for: ${aItem.description}`, variant: "destructive" }); return; }
                                if (!parseFloat(pd.rate) || parseFloat(pd.rate) <= 0) { toast({ title: "Rate required", description: `Enter rate for: ${aItem.description}`, variant: "destructive" }); return; }
                                if (at === "already_purchased" && !pd.vendor.trim()) { toast({ title: "Vendor required", description: `Enter vendor/supplier for: ${aItem.description}`, variant: "destructive" }); return; }
                                if (at === "already_purchased" && pd.paidBy === "personal" && !pd.payerName.trim()) { toast({ title: "Payer name required", description: `Enter the person who paid for: ${aItem.description}`, variant: "destructive" }); return; }
                                if (at === "ordered" && !pd.expectedDeliveryDate) { toast({ title: "Expected delivery required", description: `Enter expected delivery date for: ${aItem.description}`, variant: "destructive" }); return; }
                              }
                              const items = activeItems.map(item => {
                                const defaultAt = (isMat || (item as any).procurementRoute === "bulk_plant") ? "ordered" : "already_purchased";
                                const pd = purchaserActionData[item.id] ?? { purchaseActionType: defaultAt, qty: String(item.approvedQty ?? item.qty), orderNo: "", orderedByName: "", vendor: "", rate: "", paymentMode: "cash", paidBy: "company", payerName: "", purchaseDate: format(new Date(), "yyyy-MM-dd"), expectedDeliveryDate: "", billNo: "", remarks: "" };
                                const at = pd.purchaseActionType;
                                const paidByEncoded = pd.paidBy === "personal" ? (pd.payerName.trim() || "PERSONAL") : "company";
                                return {
                                  itemId: item.id,
                                  purchaseActionType: at,
                                  qty: (at === "not_available" || at === "recommend_cancellation") ? 0 : (parseFloat(pd.qty) || (item.approvedQty ?? item.qty)),
                                  orderNo: pd.orderNo || null,
                                  orderedByName: pd.orderedByName || currentUser?.fullName || null,
                                  vendor: pd.vendor || null,
                                  rate: parseFloat(pd.rate) || null,
                                  paymentMode: pd.paymentMode,
                                  paidBy: at === "already_purchased" ? paidByEncoded : null,
                                  expectedDeliveryDate: at === "ordered" ? (pd.expectedDeliveryDate || null) : (at === "already_purchased" ? (pd.purchaseDate || null) : null),
                                  billNo: pd.billNo || null,
                                  remarks: pd.remarks || null,
                                  procurementRoute: ((item as any).procurementRoute as string) || "stores",
                                };
                              });
                              purchaserActionMutation.mutate({ items });
                            }}
                            data-testid="button-submit-purchaser-action"
                          >
                            {purchaserActionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ClipboardList className="w-4 h-4 mr-1" />}
                            RECORD PURCHASE ACTION
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground mb-2">Purchase actions recorded.</p>
                        {piTxns.filter((t: any) => t.transactionType === "purchaser_action").map((tx: any, idx: number) => {
                          const relItem = selectedIndent.items.find(i => i.id === tx.indentItemId);
                          if (!relItem) return null;
                          const route = (relItem as any).procurementRoute as string;
                          const actionLabel = tx.reasonCode === "ordered" ? "ORDERED" : tx.reasonCode === "not_available" ? "NOT AVAIL." : tx.reasonCode === "recommend_cancellation" ? "REC. CANCEL" : "PURCHASED";
                          return (
                            <div key={idx} className="flex items-center gap-3 text-sm p-2 bg-violet-50 dark:bg-violet-900/10 rounded-lg flex-wrap">
                              <Badge variant="outline" className={(route === "material" || route === "bulk_plant") ? "text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300" : "text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300"}>
                                {(route === "material" || route === "bulk_plant") ? "BULK MATERIAL" : "STORES"}
                              </Badge>
                              <Badge variant="outline" className={tx.reasonCode === "ordered" ? "text-sky-700 border-sky-200 bg-sky-50" : tx.reasonCode === "not_available" ? "text-red-700 border-red-200 bg-red-50" : "text-green-700 border-green-200 bg-green-50"}>{actionLabel}</Badge>
                              <span className="font-medium flex-1 min-w-0 truncate">{relItem.description}</span>
                              {tx.qty > 0 && <span className="text-muted-foreground">{tx.qty} {relItem.uom}</span>}
                              {tx.rate != null && <span className="text-muted-foreground">@₹{tx.rate}</span>}
                              {tx.vendor && <span className="font-medium">{tx.vendor}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}


              {/* ── Material Indent: Record Material Receipt Card ── */}
              {(selectedIndent as any).piType === "material" && selectedIndent.status === "ordered" && canCreate && (
                <Card className="border-amber-200 dark:border-amber-800" data-testid="card-record-mat-receipt">
                  <CardHeader className="py-3 px-4 bg-amber-50 dark:bg-amber-900/20 rounded-t-lg">
                    <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      RECORD MATERIAL RECEIPT
                    </CardTitle>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">Record material received at plant via the Plant Material Receipts form. The PI indent reference will be pre-filled and stock updated automatically.</p>
                  </CardHeader>
                  <CardContent className="py-3 px-4 space-y-2">
                    {selectedIndent.items
                      .filter(item => (item.approvedQty ?? 0) > 0 && (item.totalAcceptedQty ?? 0) < (item.approvedQty ?? 0))
                      .map(item => {
                        const remaining = (item.approvedQty ?? item.qty) - (item.totalAcceptedQty ?? 0);
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3 border rounded-lg p-3 bg-amber-50/40 dark:bg-amber-900/10" data-testid={`card-mat-receipt-${item.id}`}>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{item.description}</p>
                              <p className="text-sm text-muted-foreground">Remaining: <strong className="text-amber-700 dark:text-amber-400">{remaining} {item.uom}</strong></p>
                              {!item.materialId && <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">⚠ No linked plant material — link first to enable receipt</p>}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              disabled={!item.materialId}
                              onClick={() => navigate(`/plant/material-receipts?autoOpen=1&piRef=${encodeURIComponent(selectedIndent.indentNo)}&piItemId=${item.id}&materialId=${item.materialId}&qty=${item.orderedQty ?? item.approvedQty ?? ""}&supplier=${encodeURIComponent((item as any).vendor ?? "")}`)}
                              data-testid={`button-record-mat-receipt-${item.id}`}
                            >
                              <Package className="w-3.5 h-3.5 mr-1" />
                              Record Receipt →
                            </Button>
                          </div>
                        );
                      })}
                    {selectedIndent.items.filter(i => (i.approvedQty ?? 0) > 0 && (i.totalAcceptedQty ?? 0) < (i.approvedQty ?? 0)).length === 0 && (
                      <p className="text-sm text-emerald-700 dark:text-emerald-400 text-center py-2">✓ All approved quantities have been received</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Linked GRNs Panel */}
              {canViewStores && linkedGrns.length > 0 && (
                <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl overflow-hidden" data-testid="panel-linked-grns">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-left"
                    onClick={() => setGrnPanelOpen(o => !o)}
                    data-testid="button-toggle-grn-panel"
                  >
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                      <Package className="w-4 h-4" />
                      <span className="text-sm font-semibold">GRNs Raised Against This Indent</span>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-[12px] font-bold">{linkedGrns.length}</span>
                    </div>
                    {grnPanelOpen ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4 text-emerald-600" />}
                  </button>
                  {grnPanelOpen && (
                    <div className="divide-y divide-emerald-100 dark:divide-emerald-900">
                      {linkedGrns.map(grn => (
                        <Link key={grn.id} href={`/stores/grns/${grn.id}`}>
                          <div
                            className="flex items-center justify-between px-4 py-3 bg-white dark:bg-card hover:bg-emerald-50 dark:hover:bg-emerald-900/10 cursor-pointer transition-colors"
                            data-testid={`row-linked-grn-${grn.id}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 shrink-0">{grn.grnNumber}</span>
                              <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">{format(new Date(grn.date + "T00:00:00"), "dd MMM yyyy")}</span>
                              <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{grn.supplier}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className="text-sm text-gray-500 dark:text-gray-400">{grn.itemCount} item{grn.itemCount !== 1 ? "s" : ""}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                grn.acceptanceStatus === "accepted" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" :
                                grn.acceptanceStatus === "partial" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              }`} data-testid={`badge-grn-acceptance-${grn.id}`}>
                                {grn.acceptanceStatus.charAt(0).toUpperCase() + grn.acceptanceStatus.slice(1)}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Item cards — sorted: pending → ordered → received → rejected */}
              <div className="space-y-3">
                {(() => {
                  const rankItem = (i: typeof selectedIndent.items[0]) => {
                    if ((i.approvedQty ?? i.qty) === 0) return 4;
                    const ps = (i.purchaseStatus || "").toLowerCase();
                    if (ps === "purchased") return 3;
                    if (ps === "ordered" || ps === "partial") return 2;
                    return 1;
                  };
                  return [...selectedIndent.items]
                    .sort((a, b) => rankItem(a) - rankItem(b))
                    .map((item) => {
                      const realIndex = selectedIndent.items.indexOf(item);
                      const ps = (item.purchaseStatus || "").toLowerCase();
                      const approvedQty = item.approvedQty ?? item.qty;
                      const isRejected = approvedQty === 0;
                      const isPurchased = ps === "purchased";
                      // PARTIAL = partial delivery received, more still in-flight — same card as ordered
                      const isOrdered = ps === "ordered" || ps === "partial";
                      const isCancelled = ps === "cancelled";
                      const isPending = !isRejected && !isPurchased && !isOrdered && !isCancelled;
                      const canCancel = canCancelItem(item.purchaseStatus);
                      const procData = procureItemData[item.id] || {};
                      const setProcData = (updates: Partial<typeof procData>) =>
                        setProcureItemData(prev => ({ ...prev, [item.id]: { ...procData, ...updates } }));
                      const computedAmount = procData.rate && approvedQty
                        ? Math.round(parseFloat(procData.rate) * approvedQty) : null;
                      const stockStatus = (item as any).stockStatus as string | null;
                      const liveStockQtyP = (item as any).liveStockQty as number | null;
                      const convertedLiveP = liveStockQtyP;
                      const effStockStatusP = stockStatus ?? (convertedLiveP != null ? (convertedLiveP >= approvedQty ? 'in_stock' : convertedLiveP > 0 ? 'short' : 'out_of_stock') : null);
                      const isLiveP = !stockStatus && convertedLiveP != null;
                      const stockBadge = effStockStatusP ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isLiveP ? 'opacity-75' : ''} ${
                          effStockStatusP === "in_stock" ? "text-[#0F5F64] bg-[#0F5F64]/10 border border-[#0F5F64]/20" :
                          effStockStatusP === "short" ? "text-amber-700 bg-amber-100 border border-amber-200 dark:text-amber-300 dark:bg-amber-900/30" :
                          "text-gray-500 bg-gray-100 border border-gray-200 dark:text-gray-400 dark:bg-gray-800"
                        }`}>
                          <CheckCircle2 className="w-3 h-3" />
                          {effStockStatusP === "in_stock" ? `${isLiveP ? 'Live' : 'Stores'} ✓${isLiveP ? ` ${liveStockQtyP} ${item.uom}` : ''}` : effStockStatusP === "short" ? `${isLiveP ? `Live: ${liveStockQtyP} ${item.uom}` : 'Stores'} ⚠️` : `${isLiveP ? 'Live' : 'Stores'} ✗`}
                          {(item as any).storesItemNote ? ` · ${(item as any).storesItemNote}` : ""}
                        </span>
                      ) : null;

                      if (isRejected) {
                        return (
                          <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/30 p-4 opacity-70" data-testid={`card-procure-item-${item.id}`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-semibold text-gray-500 dark:text-gray-400 line-through">{realIndex + 1}. {item.description}</h3>
                                {(item as any).spec && <p className="text-sm text-slate-600 dark:text-slate-300 italic line-through">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                                <p className="text-sm text-gray-400 mt-0.5">{item.qty} {item.uom} · FOR: {item.purpose}</p>
                              </div>
                            </div>
                            {stockBadge && <div className="mt-2">{stockBadge}</div>}
                            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2.5">
                              <Ban className="w-4 h-4 text-gray-400 shrink-0" />
                              <span>Manager Rejected — No procurement needed</span>
                            </div>
                          </div>
                        );
                      }

                      if (isCancelled) {
                        return (
                          <div key={item.id} className="border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/30 p-4 opacity-70" data-testid={`card-procure-item-${item.id}`}>
                            <h3 className="font-semibold text-gray-500 dark:text-gray-400 line-through">{realIndex + 1}. {item.description}</h3>
                            {(item as any).spec && <p className="text-sm text-slate-600 dark:text-slate-300 italic line-through">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                            <p className="text-sm text-gray-400 mt-1">Cancelled{item.cancelledBy ? ` by ${item.cancelledBy}` : ""}
                              {item.purchaseRemarks ? ` · ${item.purchaseRemarks}` : ""}</p>
                          </div>
                        );
                      }

                      if (isPurchased) {
                        return (
                          <div key={item.id} className="border border-emerald-200 dark:border-emerald-800 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4" data-testid={`card-procure-item-${item.id}`}>
                            <div className="flex justify-between items-start mb-1.5">
                              <div>
                                <h3 className="font-semibold text-emerald-900 dark:text-emerald-300">{realIndex + 1}. {item.description}</h3>
                                {(item as any).spec && <p className="text-sm text-slate-800 dark:text-slate-100 italic">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">{approvedQty} {item.uom} approved</p>
                              </div>
                            </div>
                            {stockBadge && <div className="mb-2">{stockBadge}</div>}
                            <div className="bg-emerald-100/60 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                              <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                              <div>
                                <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                                  Received{(item as any).linkedReceiptNo ? ` · ${(item as any).linkedReceiptNo}` : item.billNo ? ` · Bill: ${item.billNo}` : ""}
                                </p>
                                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                                  {item.vendor ? item.vendor : ""}{item.rate != null ? ` · ₹${item.rate}/${item.uom}` : ""}{item.amount != null ? ` · ₹${item.amount.toLocaleString("en-IN")} total` : ""}
                                  {(item as any).purchasedBy ? ` · Purchased by ${(item as any).purchasedBy}` : ""}
                                </p>
                                {((item as any).expectedDelivery || (item as any).paymentMode) && (
                                  <div className="flex flex-wrap gap-2 items-center mt-1">
                                    {(item as any).expectedDelivery && (
                                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400" data-testid={`text-purchased-exp-delivery-${item.id}`}>
                                        <Calendar className="w-3 h-3" />
                                        EXP: {format(new Date((item as any).expectedDelivery + "T00:00:00"), "dd-MMM-yy").toUpperCase()}
                                      </span>
                                    )}
                                    {(item as any).paymentMode && (
                                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                                        (item as any).paymentMode === "cash" ? "bg-green-200 text-green-800 dark:bg-green-900/60 dark:text-green-300" :
                                        (item as any).paymentMode === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                                        (item as any).paymentMode === "upi" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                        (item as any).paymentMode === "cheque" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                      }`} data-testid={`badge-purchased-payment-${item.id}`}>
                                        {((item as any).paymentMode as string).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            {(item as any).reviewerNote && (
                              <div className="mt-2 flex items-start gap-1.5 text-sm text-blue-700 dark:text-blue-300 italic">
                                <span>🔔</span><span>{(item as any).reviewerNote}</span>
                              </div>
                            )}
                            <div className="mt-2">
                              <Button variant="ghost" size="sm" className="text-sm text-muted-foreground" onClick={() => toggleHistoryItem(item.id)} data-testid={`button-toggle-history-${item.id}`}>
                                <Clock className="w-3 h-3 mr-1" />
                                {expandedHistoryItems.has(item.id) ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                                HISTORY
                              </Button>
                              {expandedHistoryItems.has(item.id) && <ItemHistoryTimeline itemId={item.id} />}
                            </div>
                          </div>
                        );
                      }

                      if (isOrdered) {
                        const isPartialDelivery = ps === "partial";
                        const deliveredSoFar = (item as any).totalAcceptedQty ?? 0;
                        return (
                          <div key={item.id} className={`border rounded-xl p-4 ${isPartialDelivery ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30" : "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"}`} data-testid={`card-procure-item-${item.id}`}>
                            <div className="flex justify-between items-start mb-1.5">
                              <div>
                                <h3 className={`font-semibold ${isPartialDelivery ? "text-amber-900 dark:text-amber-300" : "text-blue-900 dark:text-blue-300"}`}>{realIndex + 1}. {item.description}</h3>
                                {(item as any).spec && <p className="text-sm text-slate-800 dark:text-slate-100 italic">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                                <p className={`text-sm mt-0.5 ${isPartialDelivery ? "text-amber-700 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`}>
                                  {approvedQty} {item.uom}
                                  {isPartialDelivery && deliveredSoFar > 0 && ` · ${deliveredSoFar} received, ${Number((approvedQty - deliveredSoFar).toFixed(2))} remaining`}
                                </p>
                              </div>
                              {isPartialDelivery && <Badge variant="outline" className="shrink-0 text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300">PARTIAL</Badge>}
                            </div>
                            {stockBadge && <div className="mb-2">{stockBadge}</div>}
                            <div className={`border rounded-lg overflow-hidden ${isPartialDelivery ? "bg-amber-100 dark:bg-amber-900/40 border-amber-200 dark:border-amber-700" : "bg-blue-100 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800"}`}>
                              <div className={`flex items-center gap-2 px-3 py-2 border-b ${isPartialDelivery ? "border-amber-200 dark:border-amber-700 bg-amber-200/60 dark:bg-amber-900/60" : "border-blue-200 dark:border-blue-800 bg-blue-200/60 dark:bg-blue-900/60"}`}>
                                <ClipboardList className={`w-4 h-4 ${isPartialDelivery ? "text-amber-600" : "text-blue-600"}`} />
                                <span className={`font-semibold text-sm ${isPartialDelivery ? "text-amber-800 dark:text-amber-200" : "text-blue-800 dark:text-blue-200"}`}>{isPartialDelivery ? "Partial Delivery — Balance Due" : "Order Placed"}</span>
                              </div>
                              <div className="px-3 py-2.5 space-y-1.5 text-sm">
                                {item.vendor && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Vendor</span>
                                    <span className="font-semibold">{item.vendor}</span>
                                  </div>
                                )}
                                {item.rate != null && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Rate</span>
                                    <span className="font-semibold">₹{item.rate}/{item.uom}</span>
                                  </div>
                                )}
                                {(item as any).expectedDelivery && (
                                  <div className="flex justify-between">
                                    <span className="text-gray-500">Expected</span>
                                    <span className="font-semibold flex items-center gap-1">
                                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                      {format(new Date((item as any).expectedDelivery + "T00:00:00"), "dd MMM yyyy")}
                                    </span>
                                  </div>
                                )}
                                {(item as any).paymentMode && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Payment</span>
                                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      (item as any).paymentMode === "cash" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                                      (item as any).paymentMode === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                                      (item as any).paymentMode === "upi" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                      (item as any).paymentMode === "cheque" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                    }`} data-testid={`badge-ordered-payment-${item.id}`}>
                                      {((item as any).paymentMode as string).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                {/* Record Delivery expandable panel — stores/service route only; material route uses Plant Material Receipts */}
                                {canCreate && ((item as any).procurementRoute !== "material" && (item as any).procurementRoute !== "bulk_plant") && (
                                  <div className="mt-3 border-t border-blue-200 dark:border-blue-800 pt-3">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full border-emerald-400 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 gap-1.5"
                                      onClick={() => setDeliveryExpanded(prev => { const next = new Set(prev); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}
                                      data-testid={`button-expand-delivery-${item.id}`}
                                    >
                                      <PackageCheck className="w-3.5 h-3.5" />
                                      {deliveryExpanded.has(item.id) ? "Cancel" : "Record Delivery"}
                                      {deliveryExpanded.has(item.id) ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
                                    </Button>
                                    {deliveryExpanded.has(item.id) && (() => {
                                      const df = deliveryForms[item.id] ?? { deliveredQty: String(approvedQty), deliveryDate: format(new Date(), "yyyy-MM-dd"), challanNo: "", paymentMode: (item as any).paymentMode || "credit", remarks: "" };
                                      const setDf = (patch: Partial<typeof df>) => setDeliveryForms(prev => ({ ...prev, [item.id]: { ...df, ...patch } }));
                                      return (
                                        <div className="mt-2 space-y-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase">Delivery Details</p>
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <Label className="text-xs">QTY DELIVERED ({item.uom}) <span className="text-red-500">*</span></Label>
                                              <Input type="number" min={0} max={approvedQty} value={df.deliveredQty} onChange={e => setDf({ deliveredQty: e.target.value })} className="h-8 text-sm" data-testid={`input-delivery-qty-${item.id}`} />
                                            </div>
                                            <div>
                                              <Label className="text-xs">DELIVERY DATE</Label>
                                              <Input type="date" value={df.deliveryDate} onChange={e => setDf({ deliveryDate: e.target.value })} className="h-8 text-sm" data-testid={`input-delivery-date-${item.id}`} />
                                            </div>
                                            <div>
                                              <Label className="text-xs">CHALLAN / DC NO.</Label>
                                              <Input value={df.challanNo} onChange={e => setDf({ challanNo: e.target.value })} placeholder="Optional" className="h-8 text-sm" data-testid={`input-delivery-challan-${item.id}`} />
                                            </div>
                                            <div>
                                              <Label className="text-xs">PAYMENT MODE</Label>
                                              <Select value={df.paymentMode || "credit"} onValueChange={v => setDf({ paymentMode: v })}>
                                                <SelectTrigger className="h-8 text-sm" data-testid={`select-delivery-payment-${item.id}`}><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="credit">Credit</SelectItem><SelectItem value="advance">Advance</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="rtgs">RTGS / NEFT</SelectItem></SelectContent>
                                              </Select>
                                            </div>
                                          </div>
                                          <div>
                                            <Label className="text-xs">REMARKS</Label>
                                            <Input value={df.remarks} onChange={e => setDf({ remarks: e.target.value })} placeholder="Optional notes" className="h-8 text-sm" data-testid={`input-delivery-remarks-${item.id}`} />
                                          </div>
                                          <Button
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                            size="sm"
                                            disabled={recordDeliveryMutation.isPending}
                                            onClick={() => {
                                              if (!parseFloat(df.deliveredQty) || parseFloat(df.deliveredQty) <= 0) { toast({ title: "Invalid quantity", description: "Enter a valid delivered quantity", variant: "destructive" }); return; }
                                              recordDeliveryMutation.mutate({ itemId: item.id, data: { deliveredQty: parseFloat(df.deliveredQty), deliveryDate: df.deliveryDate || null, challanNo: df.challanNo || null, paymentMode: df.paymentMode || null, remarks: df.remarks || null } });
                                            }}
                                            data-testid={`button-submit-delivery-${item.id}`}
                                          >
                                            {recordDeliveryMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
                                            Confirm Delivery &amp; Create GRN
                                          </Button>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-2">
                              <Button variant="ghost" size="sm" className="text-sm text-muted-foreground" onClick={() => toggleHistoryItem(item.id)} data-testid={`button-toggle-history-${item.id}`}>
                                <Clock className="w-3 h-3 mr-1" />
                                {expandedHistoryItems.has(item.id) ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                                HISTORY
                              </Button>
                              {expandedHistoryItems.has(item.id) && <ItemHistoryTimeline itemId={item.id} />}
                            </div>
                          </div>
                        );
                      }

                      /* Purchaser actioned — show read-only card when PA transaction exists (Batch 16) */
                      if (selectedIndent.status === "purchaser_actioned") {
                        const paTx = piTxns.filter((t: any) => t.indentItemId === item.id && t.transactionType === "purchaser_action").slice(-1)[0] as any;
                        if (paTx) {
                          const paidByLabel = paTx.paidBy === "company" ? "Company Account" : paTx.paidBy ? `Personal — ${paTx.paidBy}` : "—";
                          return (
                            <div key={item.id} className="border border-violet-200 dark:border-violet-800 rounded-xl bg-violet-50 dark:bg-violet-950/30 p-4" data-testid={`card-procure-item-${item.id}`}>
                              <div className="flex justify-between items-start mb-1.5">
                                <div>
                                  <h3 className="font-semibold text-violet-900 dark:text-violet-300">{realIndex + 1}. {item.description}</h3>
                                  {(item as any).spec && <p className="text-sm italic text-violet-700 dark:text-violet-400">{(item as any).spec}</p>}
                                  <p className="text-sm text-violet-600 dark:text-violet-400 mt-0.5">{approvedQty} {item.uom} approved · FOR: {item.purpose}</p>
                                </div>
                                <span className="shrink-0 inline-flex items-center text-xs font-bold text-violet-700 bg-violet-100 border border-violet-300 rounded-full px-2.5 py-1 ml-2">{paTx.expectedDeliveryDate ? "Ordered — Awaiting Delivery" : "Purchase Recorded — Awaiting Receipt"}</span>
                              </div>
                              {stockBadge && <div className="mb-2">{stockBadge}</div>}
                              <div className="bg-violet-100/60 dark:bg-violet-900/40 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2.5 space-y-1.5 text-sm">
                                <div className="flex items-center gap-1.5 border-b border-violet-200 dark:border-violet-700 pb-1.5 mb-1.5">
                                  <ClipboardList className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                                  <span className="font-semibold text-violet-800 dark:text-violet-200 text-sm">{paTx.expectedDeliveryDate ? "Ordered — Awaiting Delivery" : "Purchase Recorded — Awaiting Receipt"}</span>
                                </div>
                                {paTx.vendor && <div className="flex justify-between"><span className="text-gray-500">Vendor</span><span className="font-semibold">{paTx.vendor}</span></div>}
                                {paTx.qty != null && <div className="flex justify-between"><span className="text-gray-500">Qty</span><span className="font-semibold">{paTx.qty} {item.uom}</span></div>}
                                {paTx.rate != null && <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-semibold">₹{paTx.rate}/{item.uom}</span></div>}
                                {paTx.paymentMode && <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="font-semibold uppercase">{paTx.paymentMode}</span></div>}
                                {paTx.paidBy && <div className="flex justify-between"><span className="text-gray-500">Paid By</span><span className="font-semibold">{paidByLabel}</span></div>}
                                {paTx.expectedDeliveryDate && <div className="flex justify-between"><span className="text-gray-500">Expected</span><span className="font-semibold flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{format(new Date(paTx.expectedDeliveryDate + "T00:00:00"), "dd MMM yyyy")}</span></div>}
                              </div>
                              {/* Attachments — invoice / challan photos linked during Purchaser Action */}
                              {paTx.id && (
                                <div className="mt-3 space-y-2">
                                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide">Documents / Photos</p>
                                  <AttachmentGallery
                                    moduleType="pi_purchaser_action"
                                    linkedRecordId={paTx.id}
                                    allowDelete={false}
                                    emptyText="No invoice or challan attached yet."
                                    className="grid grid-cols-3 sm:grid-cols-4 gap-2"
                                  />
                                  {(canEdit || isAdmin) && (
                                    <AttachmentUploader
                                      moduleType="pi_purchaser_action"
                                      linkedRecordId={paTx.id}
                                      label="Add Document"
                                      showCamera={true}
                                    />
                                  )}
                                </div>
                              )}
                              <div className="mt-2">
                                <Button variant="ghost" size="sm" className="text-sm text-muted-foreground" onClick={() => toggleHistoryItem(item.id)} data-testid={`button-toggle-history-${item.id}`}>
                                  <Clock className="w-3 h-3 mr-1" />{expandedHistoryItems.has(item.id) ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />} HISTORY
                                </Button>
                                {expandedHistoryItems.has(item.id) && <ItemHistoryTimeline itemId={item.id} />}
                              </div>
                            </div>
                          );
                        }
                      }

                      /* Pending → action form */
                      return (
                        <div key={item.id} className="border-2 border-[#0F5F64]/25 dark:border-[#0F5F64]/40 rounded-xl bg-white dark:bg-card shadow-sm p-4" data-testid={`card-procure-item-${item.id}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-gray-900 dark:text-gray-100">{realIndex + 1}. {item.description}</h3>
                              {(item as any).spec && <p className="text-sm text-slate-800 dark:text-slate-100 italic">{(item as any).spec}{(item as any).partNo ? ` · ${(item as any).partNo}` : ""}</p>}
                              <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{approvedQty} {item.uom} approved · FOR: {item.purpose}</p>
                            </div>
                            <span className="shrink-0 inline-flex items-center text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 ml-2">
                              Pending Order
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {getPriorityBadge(item.priority)}
                            {(item as any).requiredBy && (
                              <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                                REQ. BY: {format(new Date((item as any).requiredBy + "T00:00:00"), "dd-MMM-yyyy").toUpperCase()}
                              </span>
                            )}
                            {stockBadge}
                          </div>
                          {(item as any).reviewerNote && (
                            <div className="flex items-start gap-1.5 text-sm text-blue-700 dark:text-blue-300 italic mb-3">
                              <span>🔔</span><span>{(item as any).reviewerNote}</span>
                            </div>
                          )}
                          {selectedIndent.status === "approved" ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2.5">
                              <ClipboardList className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                              Fill in procurement details in the <span className="font-semibold text-violet-700 dark:text-violet-300">PURCHASER ACTION</span> form above.
                            </div>
                          ) : (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Purchased By</label>
                              <PersonnelCombobox
                                value={procData.purchasedBy || ""}
                                onChange={v => setProcData({ purchasedBy: v })}
                                placeholder="Who is purchasing this item…"
                                data-testid={`input-procure-purchased-by-${item.id}`}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Vendor / Supplier</label>
                              <Input
                                value={procData.vendor || ""}
                                onChange={e => setProcData({ vendor: e.target.value })}
                                onBlur={e => setProcData({ vendor: e.target.value.toUpperCase() })}
                                placeholder="Type vendor name..."
                                className="uppercase"
                                data-testid={`input-procure-vendor-${item.id}`}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Rate (₹/{item.uom})</label>
                                <Input type="number" value={procData.rate || ""} onChange={e => setProcData({ rate: e.target.value })} placeholder="0.00" data-testid={`input-procure-rate-${item.id}`} />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Total Amount</label>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-300 h-10 flex items-center">
                                  {computedAmount ? `₹${computedAmount.toLocaleString("en-IN")}` : "—"}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Expected Delivery</label>
                                <Input type="date" value={procData.expectedDelivery || ""} onChange={e => setProcData({ expectedDelivery: e.target.value })} data-testid={`input-procure-delivery-${item.id}`} />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-1.5">Payment Mode</label>
                                <Select value={procData.paymentMode || "credit"} onValueChange={v => setProcData({ paymentMode: v })}>
                                  <SelectTrigger data-testid={`select-procure-payment-${item.id}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cash">Cash</SelectItem>
                                    <SelectItem value="credit">Credit</SelectItem>
                                    <SelectItem value="upi">UPI</SelectItem>
                                    <SelectItem value="cheque">Cheque</SelectItem>
                                    <SelectItem value="rtgs">RTGS / NEFT</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {(((item as any).procurementRoute === "stores" || !(item as any).procurementRoute)) && selectedIndent.status === "purchaser_actioned" ? (
                              <div className="pt-1">
                                {(item as any).linkedGrnId ? (
                                  <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-300" data-testid={`grn-pending-receipt-${item.id}`}>
                                    <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                                    <span className="font-semibold">Pending Store Receipt</span>
                                    <span className="text-xs text-emerald-600 dark:text-emerald-400 ml-auto">Draft GRN created — awaiting Stores finalization</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                                    <Loader2 className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-xs">Draft GRN being created — check Stores GRN list</span>
                                  </div>
                                )}
                              </div>
                            ) : (item as any).procurementRoute === "service" && selectedIndent.status === "purchaser_actioned" ? (() => {
                              const ps = (item.purchaseStatus || "").toUpperCase();
                              const completion = indentServiceCompletions.find((c: any) => c.indentItemId === item.id);
                              if (ps === "SERVICE_COMPLETED" || ps === "SERVICE_PARTLY_COMPLETED") {
                                return (
                                  <div className="pt-1">
                                    <div className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${ps === "SERVICE_COMPLETED" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      <span className="font-semibold text-xs">{ps === "SERVICE_COMPLETED" ? "Service Completed" : "Service Partly Completed"}</span>
                                      {completion?.verifiedByName && <span className="text-xs ml-auto opacity-70">Verified by {completion.verifiedByName}</span>}
                                    </div>
                                  </div>
                                );
                              }
                              if (ps === "AWAITING_SERVICE_VERIFICATION") {
                                const purchasedBy = (item as any).purchasedBy ?? "";
                                const isSelf = purchasedBy && purchasedBy.toUpperCase() === (currentUser?.fullName || "").toUpperCase();
                                if (isSelf || !isApprover) {
                                  return (
                                    <div className="pt-1">
                                      <div className="flex items-center gap-2 p-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-sm">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                        <span className="font-semibold text-xs">Service — Awaiting Verification</span>
                                        <span className="text-xs ml-auto opacity-70">Another approver must verify</span>
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div className="pt-1">
                                    <Button
                                      className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                                      onClick={() => {
                                        setServiceCompletionItemId(item.id);
                                        setServiceCompletionForm({
                                          completionStatus: "completed",
                                          completionDate: format(new Date(), "yyyy-MM-dd"),
                                          qty: String((item as any).orderedQty ?? (item as any).totalPurchasedQty ?? item.qty ?? ""),
                                          hours: "",
                                          remarks: (item as any).vendor ? `Service by: ${(item as any).vendor}` : "",
                                          documentUrl: "",
                                        });
                                      }}
                                      data-testid={`button-verify-service-${item.id}`}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                      Record Service Completion
                                    </Button>
                                  </div>
                                );
                              }
                              return null;
                            })()
                            : ((item as any).procurementRoute === "material" || (item as any).procurementRoute === "bulk_plant") && selectedIndent.status === "purchaser_actioned" ? (
                              <div className="pt-1">
                                {(item.purchaseStatus || "").toLowerCase() === "pending_plant_receipt" ? (() => {
                                  const ppr = indentPendingPPRs.find((r: any) => r.indentItemId === item.id);
                                  const isSite = ppr?.receivingLocation === "site";
                                  const receivingSite = allSites.find(s => s.id === ppr?.receivingSiteId);
                                  const locLabels: Record<string, string> = { hmp_plant: "HMP Plant", rmc_plant: "RMC Plant" };
                                  const locName = isSite
                                    ? (receivingSite?.name ?? `Site #${ppr?.receivingSiteId}`)
                                    : (locLabels[ppr?.receivingLocation ?? "hmp_plant"] ?? "HMP Plant");
                                  if (isSite) {
                                    const itemTrips = indentSiteTrips.filter((t: any) => t.indentItemId === item.id);
                                    const totalDelivered = itemTrips.reduce((sum: number, t: any) => sum + (t.quantity || 0), 0);
                                    const purchasedQty = ppr?.qty ?? (item as any).totalPurchasedQty ?? 0;
                                    const balance = Math.max(0, purchasedQty - totalDelivered);
                                    return (
                                      <div className="space-y-1.5">
                                        <div className="flex items-center gap-2 p-2 rounded-lg bg-teal-50 border border-teal-200 dark:bg-teal-900/20 dark:border-teal-800 text-sm text-teal-700 dark:text-teal-300">
                                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                          <span className="font-semibold text-xs">Awaiting Site Material Receipt — {locName}</span>
                                          <span className="text-xs ml-auto text-teal-600">{totalDelivered}/{purchasedQty} {item.uom} received</span>
                                        </div>
                                        {balance > 0 && (
                                          <Button
                                            size="sm"
                                            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs"
                                            onClick={() => {
                                              const url = `/site/material-trips?piIndentId=${selectedIndentId}&piItemId=${item.id}&pendingReceiptId=${ppr?.id ?? ""}&material=${encodeURIComponent(item.description)}&supplier=${encodeURIComponent(ppr?.vendor || "")}&qty=${balance}&uom=${encodeURIComponent(item.uom)}&site=${encodeURIComponent(receivingSite?.name ?? "")}`;
                                              navigate(url);
                                            }}
                                            data-testid={`button-log-site-delivery-${item.id}`}
                                          >
                                            <Warehouse className="w-3 h-3 mr-1.5" />
                                            Log Site Delivery ({balance} {item.uom} remaining)
                                          </Button>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                      <span className="font-semibold text-xs">Awaiting Plant Receipt — {locName}</span>
                                      <span className="text-xs ml-auto text-amber-500">Pending plant confirmation</span>
                                    </div>
                                  );
                                })()
                                : (
                                  <Button
                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                                    onClick={() => {
                                      const paTx = piTxns.filter((t: any) => t.indentItemId === item.id && t.transactionType === "purchaser_action").slice(-1)[0] as any;
                                      setBulkReceiptData(prev => ({ ...prev, [item.id]: { qty: paTx?.qty?.toString() || (item.approvedQty ?? item.qty).toString(), uom: item.uom, vendor: paTx?.vendor || "", rate: paTx?.rate?.toString() || "", receiptDate: format(new Date(), "yyyy-MM-dd"), remarks: "", partyId: "" } }));
                                      setBulkReceivingLocation("hmp_plant");
                                      setBulkReceivingSiteId(null);
                                      setBulkReceiptOpen(true);
                                    }}
                                    data-testid={`button-bulk-receipt-${item.id}`}
                                  >
                                    <Warehouse className="w-3.5 h-3.5 mr-1.5" />
                                    Submit Material Receipt
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <Button
                                  variant="outline"
                                  className="border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/30 dark:text-blue-300 font-semibold"
                                  onClick={() => procureMutation.mutate({ itemId: item.id, data: { ...procData, action: "ordered" } })}
                                  disabled={procureMutation.isPending}
                                  data-testid={`button-mark-ordered-${item.id}`}
                                >
                                  {procureMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ClipboardList className="w-3.5 h-3.5 mr-1.5" />}
                                  Mark Ordered
                                </Button>
                                <Button
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                                  onClick={() => procureMutation.mutate({ itemId: item.id, data: { ...procData, action: "received" } })}
                                  disabled={procureMutation.isPending}
                                  data-testid={`button-received-grn-${item.id}`}
                                >
                                  {procureMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
                                  Received → GRN
                                </Button>
                              </div>
                            )}
                            {canCancel && (
                              <div className="flex justify-end pt-1">
                                <Button variant="outline" size="sm" className="text-red-600 border-red-300 text-sm" onClick={(e) => { e.stopPropagation(); setCancelItemId(item.id); setShowCancelConfirm(true); }} data-testid={`button-cancel-item-${item.id}`}>
                                  <Ban className="w-3 h-3 mr-1" /> Cancel Item
                                </Button>
                              </div>
                            )}
                          </div>
                          )}
                          <div className="mt-3">
                            <Button variant="ghost" size="sm" className="text-sm text-muted-foreground" onClick={() => toggleHistoryItem(item.id)} data-testid={`button-toggle-history-${item.id}`}>
                              <Clock className="w-3 h-3 mr-1" />
                              {expandedHistoryItems.has(item.id) ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                              HISTORY
                            </Button>
                            {expandedHistoryItems.has(item.id) && <ItemHistoryTimeline itemId={item.id} />}
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
              <IndentAuditTrail indent={selectedIndent} />
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

      {/* Handover dialog removed — replaced by auto-draft GRN creation (Batch 11) */}

      {/* ── Bulk Plant Receipt Dialog (Route B) ── */}
      <Dialog open={bulkReceiptOpen} onOpenChange={setBulkReceiptOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>SUBMIT PLANT MATERIAL RECEIPT</DialogTitle>
          </DialogHeader>
          {selectedIndent && (() => {
            const bulkItems = selectedIndent.items.filter(i => ((i as any).procurementRoute === "material" || (i as any).procurementRoute === "bulk_plant") && !["cancelled", "closed"].includes((i as any).status || "") && (i.purchaseStatus || "").toLowerCase() !== "pending_plant_receipt");
            if (bulkItems.length === 0) return <p className="text-sm text-muted-foreground">No bulk plant items pending receipt.</p>;
            return (
              <div className="space-y-4">
                {/* Receiving Location — applies to all items in this receipt */}
                <div className="border rounded-lg p-3 bg-slate-50 dark:bg-slate-900/30 space-y-2">
                  <Label className="text-sm font-semibold uppercase tracking-wide">RECEIVING LOCATION</Label>
                  <div className="flex gap-2">
                    {([["hmp_plant", "HMP Plant"], ["rmc_plant", "RMC Plant"], ["site", "Site"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { setBulkReceivingLocation(val); if (val !== "site") setBulkReceivingSiteId(null); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                          bulkReceivingLocation === val
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-white dark:bg-slate-800 border-slate-200 text-slate-600 hover:border-amber-400"
                        }`}
                        data-testid={`button-rl-${val}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {bulkReceivingLocation === "site" && (
                    <div className="pt-1">
                      <Label className="text-xs text-slate-500 mb-1 block">Select Site</Label>
                      <Select
                        value={bulkReceivingSiteId?.toString() ?? ""}
                        onValueChange={v => setBulkReceivingSiteId(v ? parseInt(v) : null)}
                      >
                        <SelectTrigger data-testid="select-receiving-site" className="h-8 text-sm">
                          <SelectValue placeholder="Choose site…" />
                        </SelectTrigger>
                        <SelectContent>
                          {allSites.map(site => (
                            <SelectItem key={site.id} value={site.id.toString()}>{site.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {bulkItems.map(item => {
                  const rd = bulkReceiptData[item.id] ?? { qty: (item.approvedQty ?? item.qty).toString(), uom: item.uom, vendor: "", rate: "", receiptDate: format(new Date(), "yyyy-MM-dd"), remarks: "", partyId: "" };
                  const upd = (field: string, val: string) => setBulkReceiptData(prev => ({ ...prev, [item.id]: { ...rd, [field]: val } }));
                  return (
                    <div key={item.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{item.description}</span>
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300">BULK MATERIAL</Badge>
                        <span className="text-sm text-muted-foreground ml-auto">Approved: {item.approvedQty ?? item.qty} {item.uom}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div>
                          <Label className="text-sm">QTY RECEIVED</Label>
                          <Input type="number" value={rd.qty} onChange={e => upd("qty", e.target.value)} data-testid={`input-br-qty-${item.id}`} />
                        </div>
                        <div>
                          <Label className="text-sm">VENDOR</Label>
                          <Input value={rd.vendor} onChange={e => upd("vendor", e.target.value)} data-testid={`input-br-vendor-${item.id}`} />
                        </div>
                        <div>
                          <Label className="text-sm">RATE (₹/{item.uom})</Label>
                          <Input type="number" value={rd.rate} onChange={e => upd("rate", e.target.value)} data-testid={`input-br-rate-${item.id}`} />
                        </div>
                        <div>
                          <Label className="text-sm">RECEIPT DATE</Label>
                          <Input type="date" value={rd.receiptDate} onChange={e => upd("receiptDate", e.target.value)} data-testid={`input-br-date-${item.id}`} />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm">REMARKS</Label>
                          <Input value={rd.remarks} onChange={e => upd("remarks", e.target.value)} data-testid={`input-br-remarks-${item.id}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-md p-2">
                  This receipt will be queued for confirmation by a plant staff member (Separation of Duties). Material will be posted to stock only after confirmation.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setBulkReceiptOpen(false)} data-testid="button-cancel-bulk-receipt">Cancel</Button>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={bulkReceiptMutation.isPending}
                    onClick={() => bulkReceiptMutation.mutate({
                      receivingLocation: bulkReceivingLocation,
                      receivingSiteId: bulkReceivingSiteId,
                      items: bulkItems.map(item => {
                        const rd = bulkReceiptData[item.id] ?? { qty: (item.approvedQty ?? item.qty).toString(), uom: item.uom, vendor: "", rate: "", receiptDate: format(new Date(), "yyyy-MM-dd"), remarks: "", partyId: "" };
                        return {
                          itemId: item.id,
                          materialId: item.materialId,
                          materialName: item.description,
                          qty: parseFloat(rd.qty) || 0,
                          uom: rd.uom,
                          vendor: rd.vendor || null,
                          rate: parseFloat(rd.rate) || null,
                          purchaseDate: rd.receiptDate,
                          remarks: rd.remarks || null,
                        };
                      }),
                    })}
                    data-testid="button-submit-bulk-receipt"
                  >
                    {bulkReceiptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Warehouse className="w-4 h-4 mr-1" />}
                    SUBMIT FOR CONFIRMATION
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {view === "report" && (
        <>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">FILTERS</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label className="text-sm uppercase">DATE FROM</Label>
                  <Input type="date" value={reportFilterDateFrom} onChange={(e) => setReportFilterDateFrom(e.target.value)} data-testid="report-filter-date-from" />
                </div>
                <div>
                  <Label className="text-sm uppercase">DATE TO</Label>
                  <Input type="date" value={reportFilterDateTo} onChange={(e) => setReportFilterDateTo(e.target.value)} data-testid="report-filter-date-to" />
                </div>
                <div>
                  <Label className="text-sm uppercase">PURCHASE STATUS</Label>
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
                  <Label className="text-sm uppercase">PURPOSE</Label>
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
                  <Label className="text-sm uppercase">VENDOR</Label>
                  <Input
                    value={reportFilterVendor}
                    onChange={(e) => setReportFilterVendor(e.target.value)}
                    onBlur={(e) => setReportFilterVendor(e.target.value.toUpperCase())}
                    placeholder="SEARCH VENDOR..."
                    className="uppercase"
                    data-testid="report-filter-vendor"
                  />
                </div>
                <div>
                  <Label className="text-sm uppercase">PAYMENT MODE</Label>
                  <Select value={reportFilterPaymentMode} onValueChange={setReportFilterPaymentMode}>
                    <SelectTrigger data-testid="report-filter-payment-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ALL MODES</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="rtgs">RTGS / NEFT</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">TOTAL ITEMS</p>
                    <p className="text-2xl font-bold mt-1" data-testid="report-text-total">{reportData.summary.totalItems}</p>
                  </CardContent>
                </Card>
                <Card data-testid="report-card-fulfilled">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">FULFILLED %</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600" data-testid="report-text-fulfilled">{reportData.summary.fulfillmentRate.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card data-testid="report-card-spend">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">TOTAL SPEND</p>
                    <p className="text-2xl font-bold mt-1" data-testid="report-text-spend">{"\u20B9"} {reportData.summary.totalSpend.toLocaleString("en-IN")}</p>
                  </CardContent>
                </Card>
                <Card data-testid="report-card-pending">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">PENDING ITEMS</p>
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
                      <table className="w-full text-sm" data-testid="report-table">
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
                            <th className="text-left p-3 font-semibold uppercase">EXP. DELIVERY</th>
                            <th className="text-left p-3 font-semibold uppercase">PAYMENT MODE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.items.map((item) => (
                            <tr
                              key={item.itemId}
                              className="border-b hover-elevate cursor-pointer"
                              onClick={() => {
                                setSelectedIndentId(item.indentId);
                                setView("procurement");
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
                              <td className="p-3 whitespace-nowrap" data-testid={`report-delivery-${item.itemId}`}>
                                {item.expectedDelivery ? format(new Date(item.expectedDelivery + "T00:00:00"), "dd-MMM-yy").toUpperCase() : "-"}
                              </td>
                              <td className="p-3" data-testid={`report-payment-${item.itemId}`}>
                                {item.paymentMode ? (
                                  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    item.paymentMode === "cash" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" :
                                    item.paymentMode === "credit" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" :
                                    item.paymentMode === "upi" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" :
                                    item.paymentMode === "cheque" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                  }`}>
                                    {item.paymentMode.toUpperCase()}
                                  </span>
                                ) : "-"}
                              </td>
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

      {/* GRN Creation Dialog */}
      <Dialog open={showGrnDialog} onOpenChange={open => { if (!open) setShowGrnDialog(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#0F5F64]" />
              Create GRN — {selectedIndent?.indentNo}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Duplicate GRN warning */}
            {selectedIndent && indentGrnCounts && indentGrnCounts[selectedIndent.indentNo] > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600 px-3 py-2.5 text-sm text-yellow-800 dark:text-yellow-300" data-testid="banner-duplicate-grn-warning">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-yellow-500" />
                <span>
                  <strong>{indentGrnCounts[selectedIndent.indentNo]} GRN{indentGrnCounts[selectedIndent.indentNo] > 1 ? "s" : ""} already exist{indentGrnCounts[selectedIndent.indentNo] === 1 ? "s" : ""} for this indent</strong> — you are creating an additional receipt.{" "}
                  <Link href={`/stores/grns?indentRef=${encodeURIComponent(selectedIndent.indentNo)}`} className="underline font-semibold hover:text-yellow-900 dark:hover:text-yellow-100">
                    View existing GRNs ↗
                  </Link>
                </span>
              </div>
            )}
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase text-muted-foreground">Date *</Label>
                <Input type="date" value={grnDialogDate} onChange={e => setGrnDialogDate(e.target.value)} data-testid="input-grn-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase text-muted-foreground">Supplier / Vendor</Label>
                <Input
                  value={grnDialogSupplier}
                  onChange={e => setGrnDialogSupplier(e.target.value)}
                  onBlur={e => setGrnDialogSupplier(e.target.value.toUpperCase())}
                  placeholder="Vendor name"
                  className="uppercase"
                  data-testid="input-grn-supplier"
                  list="grn-supplier-datalist"
                />
                {grnSupplierHistory.length > 0 && (
                  <datalist id="grn-supplier-datalist">
                    {grnSupplierHistory.map(s => <option key={s} value={s} />)}
                  </datalist>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase text-muted-foreground">Invoice No.</Label>
                <Input
                  value={grnDialogInvoiceNo}
                  onChange={e => setGrnDialogInvoiceNo(e.target.value)}
                  placeholder="Optional"
                  data-testid="input-grn-invoice-no"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold uppercase text-muted-foreground">Remarks</Label>
                <Input
                  value={grnDialogRemarks}
                  onChange={e => setGrnDialogRemarks(e.target.value)}
                  placeholder="Optional"
                  data-testid="input-grn-remarks"
                />
              </div>
            </div>

            {/* Line items */}
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Items to Receive ({grnLines.length})
              </p>
              {grnLines.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-sm text-muted-foreground">
                  No purchased items found on this indent.
                </div>
              ) : (
                <div className="space-y-3">
                  {grnLines.map((line, idx) => {
                    const filteredItems = combinedGrnItems.filter(si =>
                      !line.itemSearch || si.name.toLowerCase().includes(line.itemSearch.toLowerCase())
                    ).slice(0, 20);
                    const selectedItem = combinedGrnItems.find(si =>
                      line.storeItemId.startsWith("pm:")
                        ? si.isPlantMaterial && String(si.id) === line.storeItemId.replace("pm:", "")
                        : !si.isPlantMaterial && String(si.id) === line.storeItemId
                    );
                    return (
                      <div key={line.indentItemId} className="border rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-900/40" data-testid={`grn-line-${idx}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{idx + 1}. {line.description}</p>
                          {selectedItem && line.autoLinked && (
                            <span className="shrink-0 inline-flex items-center text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5" data-testid={`badge-auto-linked-${idx}`}>
                              <Check className="w-3 h-3 mr-1" /> Auto-linked ✓
                            </span>
                          )}
                          {selectedItem && !line.autoLinked && (
                            <span className="shrink-0 inline-flex items-center text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5" data-testid={`badge-linked-${idx}`}>
                              <Check className="w-3 h-3 mr-1" /> Linked
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[12px] font-bold uppercase text-muted-foreground">Store Catalogue Item *</Label>
                            <div className="relative">
                              <Input
                                value={grnOpenDropdownIdx === idx ? line.itemSearch : (selectedItem?.name || line.itemSearch)}
                                onChange={e => {
                                  const val = e.target.value;
                                  setGrnLines(prev => prev.map((l, i) => i === idx ? { ...l, itemSearch: val, storeItemId: "", autoLinked: false } : l));
                                  setGrnOpenDropdownIdx(idx);
                                }}
                                onFocus={() => setGrnOpenDropdownIdx(idx)}
                                placeholder="Search store items..."
                                className="text-sm"
                                data-testid={`input-grn-item-search-${idx}`}
                                autoComplete="off"
                              />
                              {grnOpenDropdownIdx === idx && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-44 overflow-y-auto text-sm">
                                  {filteredItems.length === 0 ? (
                                    <div className="px-3 py-2 space-y-1.5">
                                      <p className="text-muted-foreground text-sm">No items found in catalogue.</p>
                                      <button
                                        type="button"
                                        className="text-sm text-[#0F5F64] font-semibold hover:underline flex items-center gap-1"
                                        onMouseDown={e => {
                                          e.preventDefault();
                                          setGrnOpenDropdownIdx(null);
                                          const prefill = line.itemSearch.trim() || line.description;
                                          setAddStoreItemForm({ name: prefill.toUpperCase(), category: "Spares", uom: line.uom || "NOS" });
                                          setAddStoreItemTargetIdx(idx);
                                          setAddStoreItemFromGrn(true);
                                          setAddStoreItemOpen(true);
                                        }}
                                        data-testid={`button-grn-add-catalogue-${idx}`}
                                      >
                                        + Add "{line.itemSearch || line.description}" to Store Catalogue
                                      </button>
                                    </div>
                                  ) : filteredItems.map(si => (
                                    <div
                                      key={(si.isPlantMaterial ? "pm:" : "") + si.id}
                                      className="px-3 py-2 cursor-pointer hover:bg-[#0F5F64]/10 flex justify-between items-center"
                                      onMouseDown={e => {
                                        e.preventDefault();
                                        const sid = si.isPlantMaterial ? `pm:${si.id}` : String(si.id);
                                        setGrnLines(prev => prev.map((l, i) => i === idx ? {
                                          ...l,
                                          storeItemId: sid,
                                          itemSearch: si.name,
                                          uom: si.uom,
                                          autoLinked: false,
                                        } : l));
                                        setGrnOpenDropdownIdx(null);
                                      }}
                                      data-testid={`grn-item-option-${si.id}-${idx}`}
                                    >
                                      <span className="font-medium">{si.name}</span>
                                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground ml-2">
                                        {si.isPlantMaterial && (
                                          <span className="inline-flex items-center text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0">Bulk</span>
                                        )}
                                        {si.category} · {si.uom}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[12px] font-bold uppercase text-muted-foreground">Qty</Label>
                              <Input
                                type="number"
                                value={line.qty}
                                onChange={e => setGrnLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: e.target.value } : l))}
                                min="0"
                                step="any"
                                className={`text-sm ${(() => { const alreadyRcvd = grnReceivedByItem[line.indentItemId] ?? 0; const remaining = line.approvedQty - alreadyRcvd; const entered = parseFloat(line.qty); return !isNaN(entered) && entered > remaining ? "border-red-400 focus-visible:ring-red-400" : ""; })()}`}
                                data-testid={`input-grn-qty-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[12px] font-bold uppercase text-muted-foreground">Rate (₹)</Label>
                              <Input
                                type="number"
                                value={line.rate}
                                onChange={e => setGrnLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: e.target.value } : l))}
                                min="0"
                                step="any"
                                placeholder="0.00"
                                className="text-sm"
                                data-testid={`input-grn-rate-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[12px] font-bold uppercase text-muted-foreground">UOM</Label>
                              <Input
                                value={line.uom}
                                onChange={e => setGrnLines(prev => prev.map((l, i) => i === idx ? { ...l, uom: e.target.value } : l))}
                                placeholder="NOS"
                                className="text-sm uppercase"
                                data-testid={`input-grn-uom-${idx}`}
                              />
                            </div>
                          </div>
                          {(() => {
                            const alreadyRcvd = grnReceivedByItem[line.indentItemId] ?? 0;
                            const remaining = line.approvedQty - alreadyRcvd;
                            const entered = parseFloat(line.qty);
                            if (!isNaN(entered) && entered > remaining) {
                              return (
                                <div className="flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 px-2.5 py-1.5 text-sm text-red-700 dark:text-red-300" data-testid={`warning-over-receipt-${idx}`}>
                                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                  <span>
                                    Over-receipt: {entered} {line.uom} entered but only <strong>{remaining} {line.uom}</strong> remain
                                    {alreadyRcvd > 0 && <span className="text-red-500 dark:text-red-400"> ({alreadyRcvd} already received)</span>}.
                                    Max receivable: {remaining} {line.uom}.
                                  </span>
                                </div>
                              );
                            }
                            if (alreadyRcvd > 0) {
                              return (
                                <p className="text-xs text-amber-600 dark:text-amber-400" data-testid={`info-already-received-${idx}`}>
                                  {alreadyRcvd} {line.uom} already received · {remaining > 0 ? `${remaining} remaining` : "fully received"}
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Only items marked as <strong>purchased / partial</strong> appear here. Link each to a store catalogue entry to update stock balance.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setShowGrnDialog(false)} data-testid="button-grn-cancel">
                Cancel
              </Button>
              <Button
                className="bg-[#0F5F64] hover:bg-[#0a4a4e] text-white"
                size="sm"
                disabled={createGrnMutation.isPending || grnLines.every(l => !l.storeItemId) || grnLines.filter(l => l.storeItemId && parseFloat(l.qty) > 0).some(l => { const alreadyRcvd = grnReceivedByItem[l.indentItemId] ?? 0; const remaining = l.approvedQty - alreadyRcvd; const entered = parseFloat(l.qty); return !isNaN(entered) && entered > remaining; })}
                onClick={handleGrnSubmit}
                data-testid="button-grn-submit"
              >
                {createGrnMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Package className="w-3.5 h-3.5 mr-1.5" />}
                Create GRN
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addStoreItemOpen} onOpenChange={open => { setAddStoreItemOpen(open); if (!open) setAddStoreItemTargetIdx(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as New Material</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">MATERIAL NAME *</Label>
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
                <Label className="text-sm">CATEGORY *</Label>
                <Select value={addStoreItemForm.category} onValueChange={v => setAddStoreItemForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="text-sm" data-testid="select-new-store-item-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Aggregate", "Bitumen", "Utility", "LDO", "Spares", "Consumables", "Electricals", "Others"].map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">DEFAULT UOM *</Label>
                <Select value={addStoreItemForm.uom} onValueChange={v => setAddStoreItemForm(f => ({ ...f, uom: v }))}>
                  <SelectTrigger className="text-sm" data-testid="select-new-store-item-uom"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["NOS", "KG", "TON", "MT", "LITERS", "CUM", "CFT", "SQM", "RMT", "METERS", "SET", "PAIR", "BOX", "ROLL", "PACK"].map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">Material will be added to the plant materials catalogue and linked to this indent item.</p>
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

      {/* Service / Hire — Completion Verification Dialog */}
      <Dialog open={serviceCompletionItemId !== null} onOpenChange={(open) => { if (!open) setServiceCompletionItemId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-violet-600" />
              Record Service Completion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">COMPLETION STATUS *</Label>
              <Select value={serviceCompletionForm.completionStatus} onValueChange={v => setServiceCompletionForm(f => ({ ...f, completionStatus: v }))}>
                <SelectTrigger data-testid="select-service-completion-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Fully Completed</SelectItem>
                  <SelectItem value="partly_completed">Partly Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">COMPLETION DATE</Label>
              <Input type="date" value={serviceCompletionForm.completionDate} onChange={e => setServiceCompletionForm(f => ({ ...f, completionDate: e.target.value }))} data-testid="input-service-completion-date" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">QTY / VALUE</Label>
                <Input type="number" placeholder="e.g. 1" value={serviceCompletionForm.qty} onChange={e => setServiceCompletionForm(f => ({ ...f, qty: e.target.value }))} data-testid="input-service-completion-qty" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">HOURS (if applicable)</Label>
                <Input type="number" placeholder="e.g. 8" value={serviceCompletionForm.hours} onChange={e => setServiceCompletionForm(f => ({ ...f, hours: e.target.value }))} data-testid="input-service-completion-hours" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">REMARKS</Label>
              <Input placeholder="Any notes on service delivery" value={serviceCompletionForm.remarks} onChange={e => setServiceCompletionForm(f => ({ ...f, remarks: e.target.value }))} data-testid="input-service-completion-remarks" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">DOCUMENT URL</Label>
              <Input placeholder="https://..." value={serviceCompletionForm.documentUrl} onChange={e => setServiceCompletionForm(f => ({ ...f, documentUrl: e.target.value }))} data-testid="input-service-completion-doc-url" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setServiceCompletionItemId(null)}>Cancel</Button>
              <Button
                type="button"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                disabled={!serviceCompletionForm.completionStatus || serviceCompletionMutation.isPending}
                onClick={() => {
                  if (!serviceCompletionItemId) return;
                  const activeItem = selectedIndent?.items?.find((i: any) => i.id === serviceCompletionItemId);
                  serviceCompletionMutation.mutate({
                    indentItemId: serviceCompletionItemId,
                    itemDescription: activeItem?.description,
                    completionStatus: serviceCompletionForm.completionStatus,
                    completionDate: serviceCompletionForm.completionDate || undefined,
                    qty: serviceCompletionForm.qty ? Number(serviceCompletionForm.qty) : undefined,
                    hours: serviceCompletionForm.hours ? Number(serviceCompletionForm.hours) : undefined,
                    remarks: serviceCompletionForm.remarks || undefined,
                    documentUrl: serviceCompletionForm.documentUrl || undefined,
                  });
                }}
                data-testid="button-submit-service-completion"
              >
                {serviceCompletionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                Confirm Completion
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
