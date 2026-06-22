import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import {
  ClipboardList, ChevronLeft, ChevronDown, PackageCheck, ListTodo, CheckCircle2,
  AlertCircle, AlertTriangle, User, Calendar, FileText, Info, MapPin,
  ShieldCheck, XCircle, ThumbsUp, ThumbsDown, ShoppingCart, Download, Archive,
  Warehouse, Pencil, Trash2, Clock, Hash, Truck, FileCheck, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InternalRequisitionWithItems, InternalRequisitionItem, IrnAuditLog, StoreIssueWithItems } from "@shared/schema";

type StoresAction = "issue" | "procure" | "split";

type ItemVerification = {
  itemId: number;
  storesAction: StoresAction;
  stockAvailable: number;
  issueQty: number;
  procureQty: number;
  storesNotes: string;
};

const URGENCY_COLOR: Record<string, string> = {
  urgent: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  normal: "bg-gray-100 text-gray-600 border-gray-200",
};

const ACTION_LABEL: Record<string, string> = {
  issue: "Issue from store",
  procure: "Procurement queue",
  split: "Split (partial issue + queue)",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "pending_stores")
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-sm">Pending Stores Check</Badge>;
  if (status === "stores_verified")
    return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-sm">Awaiting Approval</Badge>;
  if (status === "approved")
    return <Badge className="bg-green-50 text-green-700 border border-green-200 text-sm gap-1"><ShieldCheck className="h-3 w-3" />Approved</Badge>;
  if (status === "issued")
    return <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-sm gap-1"><PackageCheck className="h-3 w-3" />Issued</Badge>;
  if (status === "partially_issued")
    return <Badge className="bg-orange-50 text-orange-700 border border-orange-300 text-sm gap-1"><PackageCheck className="h-3 w-3" />Partial Issue</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-50 text-red-700 border border-red-200 text-sm gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-sm">Closed</Badge>;
}

function initVerifications(items: InternalRequisitionItem[]): ItemVerification[] {
  return items.map((item) => ({
    itemId: item.id,
    storesAction: (item.storesAction as StoresAction) ?? "issue",
    stockAvailable: item.stockAvailable ?? 0,
    issueQty: item.issueQty ?? item.qty,
    procureQty: item.procureQty ?? 0,
    storesNotes: item.storesNotes ?? "",
  }));
}

export default function IrnDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = parseInt(idParam ?? "0");
  const [, navigate] = useLocation();
  const { sectionCan, user, isAdmin } = useAuth();
  const { toast } = useToast();
  const canVerify = sectionCan("stores_inventory", "create");
  const canApprove = sectionCan("irn_approve", "create");
  const canClose = sectionCan("irn_approve", "approve") || sectionCan("stores_inventory", "create");

  const { data: irn, isLoading } = useQuery<InternalRequisitionWithItems>({
    queryKey: ["/api/irn", id],
    queryFn: async () => {
      const res = await fetch(`/api/irn/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("IRN not found");
      return res.json();
    },
  });

  // Fetch live stock balances for stores verification form AND manager approval view
  const { data: stockLookupRows } = useQuery<{
    materialName: string; balance: number; uom: string | null; partyId: number | null;
    conversionFactor?: number | null; conversionFromUom?: string | null; conversionToUom?: string | null;
  }[]>({
    queryKey: ["/api/irn/stock-lookup"],
    enabled: (canVerify && irn?.status === "pending_stores") || (canApprove && irn?.status === "stores_verified") || isAdmin,
  });

  // Store items for the Issue Voucher form (to link store items for stock deduction)
  const { data: storeItems = [] } = useQuery<{ id: number; name: string; category: string; uom: string }[]>({
    queryKey: ["/api/stores/items"],
    enabled: !!irn && (irn.status === "approved" || irn.status === "partially_issued"),
  });

  // Sites list (to display site name in headers)
  const { data: allSites = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/sites"],
    queryFn: async () => {
      const res = await fetch("/api/sites", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const getSiteName = (id: number | null | undefined) => allSites.find(s => s.id === id)?.name ?? null;

  // Parties for party picker in issue form (bulk material stock deduction)
  const { data: parties = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/plant-module/parties"],
    queryFn: async () => {
      const res = await fetch("/api/plant-module/parties", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!irn && (irn.status === "approved" || irn.status === "partially_issued"),
  });

  // Fetch all issue vouchers for this IRN (for multi-voucher history)
  const { data: irnVouchers = [] } = useQuery<StoreIssueWithItems[]>({
    queryKey: [`/api/irn/${id}/issue-vouchers`],
    enabled: !!irn && ["approved", "issued", "partially_issued"].includes(irn.status ?? ""),
  });

  // Fetch audit log for approved / closed / rejected IRNs
  const { data: auditLogs } = useQuery<IrnAuditLog[]>({
    queryKey: ["/api/irn", id, "audit-logs"],
    queryFn: async () => {
      const res = await fetch(`/api/irn/${id}/audit-logs`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!irn && ["approved", "issued", "partially_issued", "closed", "rejected", "stores_verified"].includes(irn.status ?? ""),
  });

  type UomBreakdown = { balance: number; uom: string };
  type StockEntry = {
    breakdowns: UomBreakdown[];
    conversionFactor?: number | null; conversionFromUom?: string | null; conversionToUom?: string | null;
  };
  type LiveStockResult = {
    balance: number;            // total in requested UOM (or raw if no conversion)
    uom: string;               // requested UOM (or first-row UOM if no conversion)
    sourceParts: string[];     // e.g. ["6546.653 CFT", "13.840 MT"] for display
    hasConversionError: boolean; // true if any row could not be converted
    approx: boolean;
    converted: boolean;
  };

  // Build a map: UPPER(materialName) → per-UOM breakdowns + sorted list for partial matching.
  // We intentionally do NOT sum across UOMs here — conversion happens in findLiveStock.
  const liveStock = useMemo(() => {
    const exact = new Map<string, StockEntry>();
    if (!stockLookupRows) return { exact, sorted: [] as ({ key: string } & StockEntry)[] };
    for (const row of stockLookupRows) {
      const key = row.materialName.toUpperCase().trim();
      const rowUom = row.uom ?? "";
      const existing = exact.get(key);
      if (existing) {
        // Accumulate into the matching UOM bucket, or add a new bucket
        const bucket = existing.breakdowns.find(b => b.uom.toUpperCase().trim() === rowUom.toUpperCase().trim());
        if (bucket) { bucket.balance += row.balance; }
        else { existing.breakdowns.push({ balance: row.balance, uom: rowUom }); }
      } else {
        exact.set(key, {
          breakdowns: [{ balance: row.balance, uom: rowUom }],
          conversionFactor: row.conversionFactor,
          conversionFromUom: row.conversionFromUom,
          conversionToUom: row.conversionToUom,
        });
      }
    }
    const sorted = [...exact.entries()].map(([key, val]) => ({ key, ...val }));
    return { exact, sorted };
  }, [stockLookupRows]);

  // Convert a single-row balance from rowUom → requestedUom using the material's conversion config.
  // Returns null if the conversion cannot be performed (missing factor, incompatible UOMs).
  function convertSingleRow(
    rowBalance: number, rowUom: string, requestedUom: string,
    cf?: number | null, cfFrom?: string | null, cfTo?: string | null,
  ): number | null {
    const isTon = (u: string) => { const u2 = u.toUpperCase().trim(); return u2 === "MT" || u2 === "TON"; };
    const fromU = rowUom.toUpperCase().trim();
    const reqU = requestedUom.toUpperCase().trim();
    if (fromU === reqU) return rowBalance;
    if (isTon(fromU) && isTon(reqU)) return rowBalance; // MT ≡ Ton
    if (!cf || !cfFrom || !cfTo) return null;
    const cFrom = cfFrom.toUpperCase().trim();
    const cTo = cfTo.toUpperCase().trim();
    // Forward: CFT → Ton/MT
    if (fromU === cFrom && (reqU === cTo || (isTon(reqU) && isTon(cTo)))) return rowBalance * cf;
    // Reverse: Ton/MT → CFT
    if ((isTon(fromU) || fromU === cTo) && reqU === cFrom && cf !== 0) return rowBalance / cf;
    return null;
  }

  // Find the best live stock entry for an IRN item.
  // Converts EACH UOM breakdown individually to requestedUom, then sums.
  // This prevents the CFT+MT mixing bug.
  function findLiveStock(materialName: string, requestedUom?: string): LiveStockResult | null {
    const needle = materialName.toUpperCase().trim();
    let entry: StockEntry | null = null;
    let approx = false;

    const ex = liveStock.exact.get(needle);
    if (ex) {
      entry = ex;
    } else {
      // Approximate: pick the entry whose key has the most word overlap with needle
      let bestTotalBalance = -1;
      for (const e of liveStock.sorted) {
        const stockWords = e.key.split(/\s+/).filter(w => w.length >= 3);
        const isMatch = stockWords.some(w => needle.includes(w)) || e.key.includes(needle) || needle.includes(e.key);
        if (isMatch) {
          const total = e.breakdowns.reduce((s, b) => s + b.balance, 0);
          if (total > bestTotalBalance) { bestTotalBalance = total; entry = e; approx = true; }
        }
      }
    }
    if (!entry) return null;

    const { conversionFactor: cf, conversionFromUom: cfFrom, conversionToUom: cfTo } = entry;
    const nonZero = entry.breakdowns.filter(b => b.balance !== 0);

    if (!requestedUom) {
      // No target UOM — sum raw (single-UOM use case)
      const total = entry.breakdowns.reduce((s, b) => s + b.balance, 0);
      const mainUom = entry.breakdowns[0]?.uom ?? "";
      return { balance: total, uom: mainUom, sourceParts: [], hasConversionError: false, approx, converted: false };
    }

    // Convert each breakdown to requestedUom individually, then sum
    let totalConverted = 0;
    let hasConversionError = false;
    const sourceParts: string[] = [];
    const isTon = (u: string) => { const u2 = u.toUpperCase().trim(); return u2 === "MT" || u2 === "TON"; };
    const reqU = requestedUom.toUpperCase().trim();

    for (const bd of nonZero) {
      const converted = convertSingleRow(bd.balance, bd.uom, requestedUom, cf, cfFrom, cfTo);
      if (converted === null) {
        hasConversionError = true;
        sourceParts.push(`${bd.balance.toFixed(3)} ${bd.uom} ⚠`);
      } else {
        totalConverted += converted;
        // Show source line if this row wasn't already in the requested UOM
        const bU = bd.uom.toUpperCase().trim();
        if (bU !== reqU && !(isTon(bU) && isTon(reqU))) {
          sourceParts.push(`${bd.balance.toFixed(3)} ${bd.uom}`);
        }
      }
    }

    const wasConverted = nonZero.some(bd => {
      const bU = bd.uom.toUpperCase().trim();
      return bU !== reqU && !(isTon(bU) && isTon(reqU));
    });

    return {
      balance: Math.max(0, totalConverted),
      uom: requestedUom,
      sourceParts,
      hasConversionError,
      approx,
      converted: wasConverted,
    };
  }

  const [verifications, setVerifications] = useState<ItemVerification[]>([]);
  const [storesRemarks, setStoresRemarks] = useState("");
  const [verified, setVerified] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ── Issue Voucher form state ──────────────────────────────────────────────
  const [showIssueHistory, setShowIssueHistory] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [ivDate, setIvDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [ivIssuedBy, setIvIssuedBy] = useState("");
  const [ivReceivedBy, setIvReceivedBy] = useState("");
  const [ivReceiverDesig, setIvReceiverDesig] = useState("");
  const [ivDeliveryMode, setIvDeliveryMode] = useState<"vehicle" | "hand_carried">("vehicle");
  const [ivVehicleType, setIvVehicleType] = useState("");
  const [ivVehicleNo, setIvVehicleNo] = useState("");
  const [ivDriverName, setIvDriverName] = useState("");
  const [ivRemarks, setIvRemarks] = useState("");
  const [ivItemQtys, setIvItemQtys] = useState<Record<number, string>>({});
  const [ivItemStoreIds, setIvItemStoreIds] = useState<Record<number, number | null>>({});
  const [ivItemPartyIds, setIvItemPartyIds] = useState<Record<number, number | null>>({});

  // Auto-fill stock + set smart default action when live stock data arrives (first time only).
  // Balance is converted to the IRN item's requested UOM where possible.
  const autoFillApplied = useRef(false);
  useEffect(() => {
    if (liveStock.sorted.length === 0 || !irn || verifications.length === 0) return;
    if (autoFillApplied.current) return;
    autoFillApplied.current = true;
    setVerifications(prev => prev.map(v => {
      const item = irn.items.find(i => i.id === v.itemId);
      if (!item) return v;
      if (item.storesAction != null) return v; // already verified — keep saved values
      // Pass item.uom so balance is converted to the requested UOM (e.g. CFT → Ton)
      const live = findLiveStock(item.material, item.uom);
      if (!live) return v;
      const balance = Math.max(0, live.balance); // now in item.uom
      if (balance === 0) {
        return { ...v, stockAvailable: 0, storesAction: "procure", issueQty: 0, procureQty: item.qty };
      } else if (balance < item.qty) {
        // Partial stock: issue what's available, queue the deficit
        const canIssue = Math.min(balance, item.qty);
        return { ...v, stockAvailable: balance, storesAction: "split", issueQty: canIssue, procureQty: Math.max(0, item.qty - canIssue) };
      } else {
        // Full stock: issue exactly the requested qty
        return { ...v, stockAvailable: balance, storesAction: "issue", issueQty: item.qty, procureQty: 0 };
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStock.sorted.length, verifications.length]);

  // init verifications when irn loads
  if (irn && verifications.length === 0 && irn.items.length > 0) {
    setVerifications(initVerifications(irn.items));
  }

  function updateVerification(itemId: number, field: keyof ItemVerification, value: string | number | StoresAction) {
    setVerifications((prev) =>
      prev.map((v) => {
        if (v.itemId !== itemId) return v;
        const updated = { ...v, [field]: value };
        const reqQty = irn?.items.find((i) => i.id === itemId)?.qty ?? 0;

        if (field === "storesAction") {
          if (value === "issue") {
            updated.issueQty = reqQty;  // issue exactly the requested qty
            updated.procureQty = 0;
          } else if (value === "procure") {
            updated.issueQty = 0;
            updated.procureQty = reqQty;
          } else if (value === "split") {
            // issue what's available (capped at reqQty), queue the deficit only
            const canIssue = Math.min(v.stockAvailable, reqQty);
            updated.issueQty = canIssue;
            updated.procureQty = Math.max(0, reqQty - canIssue);
          }
        }

        if (field === "stockAvailable" && updated.storesAction === "split") {
          const sa = Number(value);
          updated.issueQty = Math.min(sa, reqQty);  // never exceed requested qty
          updated.procureQty = Math.max(0, reqQty - updated.issueQty);  // deficit only
        }

        // issueQty: hard cap at min(reqQty, stockAvailable); procureQty = remaining deficit
        if (field === "issueQty") {
          const maxIssue = updated.stockAvailable > 0
            ? Math.min(reqQty, updated.stockAvailable)
            : reqQty;
          updated.issueQty = Math.min(Math.max(0, Number(value)), maxIssue);
          updated.procureQty = Math.max(0, reqQty - updated.issueQty);
        }

        // procureQty: hard cap at remaining deficit (reqQty - issueQty)
        if (field === "procureQty") {
          const maxProcure = Math.max(0, reqQty - updated.issueQty);
          updated.procureQty = Math.min(Math.max(0, Number(value)), maxProcure);
        }

        return updated;
      })
    );
  }

  const recordIssueMutation = useMutation({
    mutationFn: async () => {
      const issueItems = irn!.items.filter((i) => (i.issueQty ?? 0) > 0);
      const payload = {
        date: ivDate,
        issuedBy: ivIssuedBy,
        receivedBy: ivReceivedBy,
        receiverDesignation: ivReceiverDesig || undefined,
        deliveryMode: ivDeliveryMode,
        vehicleType: ivDeliveryMode === "vehicle" ? ivVehicleType : undefined,
        vehicleNo: ivDeliveryMode === "vehicle" ? ivVehicleNo : undefined,
        driverName: ivDeliveryMode === "vehicle" ? ivDriverName : undefined,
        movementRemarks: ivRemarks || undefined,
        items: issueItems
          .map((item) => ({
            irnItemId: item.id,
            storeItemId: item.materialId ? null : (ivItemStoreIds[item.id] ?? null),
            materialId: item.materialId ?? null,
            partyId: item.materialId ? (ivItemPartyIds[item.id] ?? null) : null,
            actualIssuedQty: parseFloat(ivItemQtys[item.id] ?? String(item.issueQty ?? 0)) || 0,
            uom: item.uom,
            materialText: item.material,
          }))
          .filter(it => it.actualIssuedQty > 0),
      };
      const res = await apiRequest("POST", `/api/irn/${id}/record-issue`, payload);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to record issue");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id] });
      queryClient.invalidateQueries({ queryKey: [`/api/irn/${id}/issue-vouchers`] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/issues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/stock-summary"] });
      setShowIssueForm(false);
      setShowIssueHistory(true);
      toast({ title: `Issue Voucher ${data.issueNumber} recorded`, description: "Stock has been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to record issue", description: err.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/irn/${id}/stores-verify`, {
        storesRemarks,
        items: verifications,
      });
      return res.json() as Promise<InternalRequisitionWithItems>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id] });
      setVerified(true);
      toast({ title: "Stores verification saved", description: "IRN has been verified by stores" });
    },
    onError: (err: any) => {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") => {
      const res = await apiRequest("PATCH", `/api/irn/${id}/approve`, {
        action,
        remarks: approvalRemarks || undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Request failed");
      }
      return res.json() as Promise<InternalRequisitionWithItems>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id] });
      toast({
        title: data.status === "approved" ? "IRN Approved" : "IRN Rejected",
        description: data.status === "approved"
          ? "The requisition has been approved."
          : "The requisition has been rejected.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/irn/${id}/close`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Request failed");
      }
      return res.json() as Promise<InternalRequisitionWithItems>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id, "audit-logs"] });
      toast({ title: "IRN Closed", description: "Requisition marked as fulfilled and closed." });
    },
    onError: (err: any) => {
      toast({ title: "Close failed", description: err.message, variant: "destructive" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/irn/${id}/reopen`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Request failed");
      }
      return res.json() as Promise<InternalRequisitionWithItems>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/irn", id, "audit-logs"] });
      toast({ title: "IRN Reopened", description: "Requisition has been returned to Approved status." });
    },
    onError: (err: any) => {
      toast({ title: "Reopen failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/irn/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to delete");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/irn"] });
      toast({ title: "IRN deleted", description: "The requisition has been permanently deleted." });
      navigate("/irn");
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
      setDeleteConfirm(false);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-6 py-4"><Skeleton className="h-8 w-64" /></div>
        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!irn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 font-medium">IRN not found</p>
          <Button variant="outline" onClick={() => navigate("/irn")} className="mt-2">← Back to list</Button>
        </div>
      </div>
    );
  }

  const issueCount = verifications.filter((v) => v.issueQty > 0).length;
  const procureCount = verifications.filter((v) => v.procureQty > 0).length;
  const isStoresVerified = irn.status === "stores_verified";
  const isApproved = irn.status === "approved";
  const isIssued = irn.status === "issued" || irn.status === "partially_issued";
  const isRejected = irn.status === "rejected";
  const allItemsIssued = irn.items.length > 0 && irn.items.every((i) => i.itemStatus === "issued");

  const adminBar = isAdmin ? (
    <div className="ml-auto flex items-center gap-1.5">
      {!deleteConfirm && (
        <button
          onClick={() => navigate(`/irn/raise?editId=${id}&returnTo=/irn/${id}`)}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 bg-white"
          data-testid="button-edit-irn"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      )}
      {!deleteConfirm ? (
        <button
          onClick={() => setDeleteConfirm(true)}
          className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1 bg-white"
          data-testid="button-delete-irn"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      ) : (
        <div className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 rounded px-3 py-1.5">
          <span className="text-red-700 font-medium">Delete this IRN?</span>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="text-red-700 underline font-semibold hover:text-red-900"
            data-testid="button-confirm-delete-irn"
          >
            {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
          </button>
          <button onClick={() => setDeleteConfirm(false)} className="text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      )}
    </div>
  ) : null;

  // ── Stores verification complete / awaiting approval view ──────────────────
  if (verified || (isStoresVerified && irn.storesVerifiedBy)) {
    const displayIssue = irn.items.filter((i) => i.issueQty && i.issueQty > 0).length;
    const displayProcure = irn.items.filter((i) => i.procureQty && i.procureQty > 0).length;

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/irn")} className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
              <ChevronLeft className="h-4 w-4" /> Requisitions
            </button>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-amber-700 font-semibold">{irn.irnNo}</span>
            <StatusBadge status={irn.status} />
            {adminBar}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          {/* Meta */}
          <div className="bg-white border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" /><div><p className="text-sm text-gray-500">Raised by</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedBy}</p></div></div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /><div><p className="text-sm text-gray-500">Section</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedFrom}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><div><p className="text-sm text-gray-500">Date</p><p className="font-semibold text-gray-800 text-sm">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div></div>
              {getSiteName(irn.siteId) && (
                <div className="flex items-center gap-2 col-span-3 pt-1 border-t mt-1">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <div><p className="text-sm text-gray-500">Site / Location</p><p className="font-semibold text-gray-800 text-sm">{getSiteName(irn.siteId)}</p></div>
                </div>
              )}
            </div>
          </div>

          {/* Stores verification summary */}
          <div className="bg-white border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <h3 className="text-sm font-semibold text-gray-800">Stores Verification</h3>
              <span className="text-sm text-gray-500 ml-auto">
                {irn.storesVerifiedBy} · {irn.storesVerifiedAt ? format(new Date(irn.storesVerifiedAt), "dd MMM, h:mm a") : ""}
              </span>
            </div>
            <div className="space-y-2">
              {irn.items.map((item, idx) => {
                // Pass item.uom so the result is converted to the requested UOM (e.g. CFT → MT)
                const stock = findLiveStock(item.material, item.uom);
                return (
                  <div key={item.id} className="py-1.5 border-b last:border-0 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">#{idx + 1}</span>
                        <span className="font-semibold text-gray-800">{item.material}</span>
                        <span className={`text-sm px-1.5 py-0.5 rounded-full border ${URGENCY_COLOR[item.urgency]}`}>{item.urgency}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        {item.issueQty && item.issueQty > 0 ? (
                          <span className="text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                            Issue {item.issueQty} {item.uom}
                          </span>
                        ) : null}
                        {item.procureQty && item.procureQty > 0 ? (
                          <span className="text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                            Procure {item.procureQty} {item.uom}
                          </span>
                        ) : null}
                        <span className="text-gray-600">{ACTION_LABEL[item.storesAction ?? ""] ?? item.storesAction}</span>
                      </div>
                    </div>
                    {stock && (
                      <div className="mt-1 ml-6 space-y-0.5">
                        <span className={`text-sm px-2 py-0.5 rounded border ${stock.balance >= item.qty ? "bg-teal-50 text-teal-700 border-teal-200" : stock.balance > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-600 border-red-200"}`}>
                          Available: {stock.balance.toFixed(3)} {stock.uom}{stock.approx ? " (approx)" : ""}
                        </span>
                        {stock.sourceParts.length > 0 && (
                          <p className="text-[12px] text-gray-400 ml-1">
                            Source: {stock.sourceParts.join(" + ")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {displayIssue > 0 && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2 text-sm text-green-700 mt-3">
                <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                <span><strong>{displayIssue} item{displayIssue !== 1 ? "s" : ""}</strong> to issue from store</span>
              </div>
            )}
            {displayProcure > 0 && (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-2 text-sm text-purple-700 mt-2">
                <ListTodo className="h-3.5 w-3.5 shrink-0" />
                <span><strong>{displayProcure} item{displayProcure !== 1 ? "s" : ""}</strong> to add to Procurement Queue</span>
              </div>
            )}
            {irn.storesRemarks && (
              <p className="text-sm text-gray-500 italic mt-2">Stores note: "{irn.storesRemarks}"</p>
            )}
          </div>

          {/* Approval panel — shown to approvers when still awaiting */}
          {canApprove && irn.status === "stores_verified" && (
            <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-blue-800">Manager Approval</h3>
              </div>
              <p className="text-sm text-gray-500">
                Review the stores decision above and approve or reject this requisition.
              </p>
              <div className="space-y-1">
                <Label className="text-sm font-medium text-gray-700">Remarks (optional)</Label>
                <Textarea
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  placeholder="Add any notes for the requester…"
                  className="text-sm resize-none h-16"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => approveMutation.mutate("reject")}
                  disabled={approveMutation.isPending}
                  className="text-sm h-9 gap-2 border-red-200 text-red-700 hover:bg-red-50"
                >
                  <ThumbsDown className="h-4 w-4" />
                  {approveMutation.isPending ? "Processing…" : "Reject"}
                </Button>
                <Button
                  onClick={() => approveMutation.mutate("approve")}
                  disabled={approveMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white text-sm h-9 px-6 gap-2"
                >
                  <ThumbsUp className="h-4 w-4" />
                  {approveMutation.isPending ? "Processing…" : "Approve"}
                </Button>
              </div>
            </div>
          )}

          {/* Non-approver waiting banner */}
          {!canApprove && irn.status === "stores_verified" && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Stores verification is complete. Awaiting manager approval before items can be issued.</span>
            </div>
          )}

          {/* Close / Mark Fulfilled — stores_verified IRNs */}
          {canClose && irn.status === "stores_verified" && allItemsIssued && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Mark as Fulfilled</h3>
              </div>
              <p className="text-sm text-gray-500">
                If all items have been issued or actioned and no further steps are needed, you can close this requisition.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                  className="text-sm h-9 gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
                  data-testid="button-close-irn"
                >
                  <Archive className="h-4 w-4" />
                  {closeMutation.isPending ? "Closing…" : "Close / Mark Fulfilled"}
                </Button>
              </div>
            </div>
          )}

          <Button variant="outline" onClick={() => navigate("/irn")} className="text-sm">← Back to IRN list</Button>
        </div>
      </div>
    );
  }

  // ── Shared audit trail for approved / issued / closed / rejected ──────────
  if (isApproved || isIssued || irn.status === "closed" || isRejected) {
    const isClosed = irn.status === "closed";
    const procureItems = irn.items.filter((i) => (i.procureQty ?? 0) > 0);
    const issueItems = irn.items.filter((i) => (i.issueQty ?? 0) > 0);
    const linkedPi = (irn as any).linkedPi as { id: number; indentNo: string; raisedBy: string; createdAt: string | null } | null;

    const ITEM_STATUS_LABEL: Record<string, string> = {
      issued: "Issued",
      queued_procurement: "Queued for Procurement",
      partially_issued: "Partially Issued",
      pending: "Pending",
    };

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/irn")} className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
              <ChevronLeft className="h-4 w-4" /> Requisitions
            </button>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-amber-700 font-semibold">{irn.irnNo}</span>
            <StatusBadge status={irn.status} />
            {adminBar}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">

          {/* ── 1. Requisition Meta ── */}
          <div className="bg-white border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Raised by</p>
                  <p className="font-semibold text-gray-800">{irn.raisedBy}</p>
                  {irn.createdAt && (
                    <p className="text-sm text-gray-400">{format(new Date(irn.createdAt), "dd MMM yyyy, h:mm a")}</p>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Section</p>
                  <p className="font-semibold text-gray-800">{irn.raisedFrom}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-semibold text-gray-800">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p>
                </div>
              </div>
              {getSiteName(irn.siteId) && (
                <div className="flex items-start gap-2 col-span-3 pt-2 mt-1 border-t">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-500">Site / Location</p>
                    <p className="font-semibold text-gray-800">{getSiteName(irn.siteId)}</p>
                  </div>
                </div>
              )}
            </div>
            {irn.remarks && (
              <p className="text-sm text-gray-500 italic mt-3 pt-3 border-t">Remarks: "{irn.remarks}"</p>
            )}
          </div>

          {/* ── 2. Items Detail ── */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-400" /> Items Requested
            </h3>
            <div className="space-y-3">
              {irn.items.map((item, idx) => (
                <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                  {/* Item header row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-gray-400 font-mono">#{idx + 1}</span>
                      <span className="font-semibold text-gray-900">{item.material}</span>
                      <span className={`text-sm px-1.5 py-0.5 rounded-full border ${URGENCY_COLOR[item.urgency]}`}>{item.urgency}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm text-gray-500">Requested</span>
                      <p className="font-bold text-gray-800 text-sm">{item.qty} <span className="font-normal text-gray-500 text-sm">{item.uom}</span></p>
                    </div>
                  </div>
                  {/* Purpose + need by */}
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-2">
                    {item.purpose && (
                      <div><span className="text-gray-400">Purpose: </span>{item.purpose}</div>
                    )}
                    {item.needByDate && (
                      <div><span className="text-gray-400">Need by: </span><span className="font-medium">{format(new Date(item.needByDate), "dd MMM yyyy")}</span></div>
                    )}
                  </div>
                  {/* Stores decision row */}
                  {item.storesAction && (() => {
                    const live = findLiveStock(item.material, item.uom);
                    return (
                      <div className="pt-2 border-t border-gray-200 mt-1 space-y-1.5">
                        {/* Available stock — converted to item's UOM */}
                        {live && (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Warehouse className="h-3 w-3 text-gray-400 shrink-0" />
                              <span className="text-sm text-gray-500">Stores verified available:</span>
                              <span className={`text-sm font-semibold ${live.balance >= item.qty ? "text-green-700" : live.balance > 0 ? "text-amber-700" : "text-red-600"}`}>
                                {live.balance > 0 ? live.balance.toFixed(3) : "0"} {live.uom}
                              </span>
                              {live.hasConversionError && (
                                <span className="text-[12px] text-orange-600 flex items-center gap-0.5">
                                  <AlertCircle className="h-2.5 w-2.5" /> partial conversion
                                </span>
                              )}
                            </div>
                            {live.sourceParts.length > 0 && (
                              <p className="text-[12px] text-gray-400 ml-4.5">
                                Source: {live.sourceParts.join(" + ")}
                              </p>
                            )}
                          </div>
                        )}
                        {/* Issue / Procure decision badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {(item.issueQty ?? 0) > 0 && (
                            <span className="text-sm px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200">
                              Issue {item.issueQty} {item.uom}
                            </span>
                          )}
                          {(item.procureQty ?? 0) > 0 && (
                            <span className="text-sm px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">
                              Procure {item.procureQty} {item.uom}
                            </span>
                          )}
                          <span className="text-sm text-gray-500 italic">{ACTION_LABEL[item.storesAction] ?? item.storesAction}</span>
                          {item.storesNotes && (
                            <span className="text-sm text-blue-600">Note: {item.storesNotes}</span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Final status */}
                  <div className="mt-2 text-right">
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full border ${
                      item.itemStatus === "issued" ? "bg-green-50 text-green-700 border-green-200" :
                      item.itemStatus === "queued_procurement" ? "bg-purple-50 text-purple-700 border-purple-200" :
                      item.itemStatus === "partially_issued" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-gray-100 text-gray-500 border-gray-200"
                    }`}>
                      {ITEM_STATUS_LABEL[item.itemStatus] ?? item.itemStatus}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── 3. Stores Verification ── */}
          {irn.storesVerifiedBy && (
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-700">Stores Verification</h3>
                <span className="ml-auto text-sm text-gray-500">
                  {irn.storesVerifiedBy}
                  {irn.storesVerifiedAt ? ` · ${format(new Date(irn.storesVerifiedAt), "dd MMM yyyy, h:mm a")}` : ""}
                </span>
              </div>
              {irn.storesRemarks && (
                <p className="text-sm text-gray-500 italic ml-6">"{irn.storesRemarks}"</p>
              )}
            </div>
          )}

          {/* ── 4. Manager Decision ── */}
          {isApproved || isClosed ? (
            <div className="bg-white border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                <h3 className="text-sm font-semibold text-green-800">Approved</h3>
                <span className="ml-auto text-sm text-gray-500">
                  {irn.approvedBy}
                  {irn.approvedAt ? ` · ${format(new Date(irn.approvedAt), "dd MMM yyyy, h:mm a")}` : ""}
                </span>
              </div>
              {irn.approvalRemarks && (
                <p className="text-sm text-gray-500 italic ml-6">"{irn.approvalRemarks}"</p>
              )}
            </div>
          ) : isRejected ? (
            <div className="bg-white border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                <h3 className="text-sm font-semibold text-red-800">Rejected</h3>
                <span className="ml-auto text-sm text-gray-500">
                  {irn.rejectedBy}
                  {irn.rejectedAt ? ` · ${format(new Date(irn.rejectedAt), "dd MMM yyyy, h:mm a")}` : ""}
                </span>
              </div>
              {irn.rejectionReason && (
                <p className="text-sm text-red-600 italic ml-6">"{irn.rejectionReason}"</p>
              )}
            </div>
          ) : null}

          {/* ── 5. Procurement / PI ── */}
          {procureItems.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <ListTodo className="h-4 w-4 text-purple-600 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-700">Procurement Queue</h3>
              </div>
              <div className="space-y-1 mb-3">
                {procureItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span className="text-gray-800">{item.material}</span>
                    <span className="text-purple-700 font-medium">{item.procureQty} {item.uom}</span>
                  </div>
                ))}
              </div>
              {linkedPi ? (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded p-2.5 text-sm text-indigo-700">
                  <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    PI <strong>{linkedPi.indentNo}</strong> raised by {linkedPi.raisedBy}
                    {linkedPi.createdAt ? ` · ${format(new Date(linkedPi.createdAt), "dd MMM yyyy, h:mm a")}` : ""}
                  </span>
                </div>
              ) : !isRejected && (
                <Button
                  onClick={() => navigate(`/plant/purchase-indents?fromIrnId=${irn.id}`)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 text-sm h-8 px-4"
                  data-testid="button-raise-pi-from-irn"
                >
                  <ShoppingCart className="h-3.5 w-3.5" /> Raise PI
                </Button>
              )}
            </div>
          )}

          {/* ── 6. Issue Voucher action ── */}
          {issueItems.length > 0 && !isClosed && (() => {
            // Compute per-item totals from all recorded vouchers
            const itemSummary = issueItems.map(item => {
              const totalIssued = irnVouchers.reduce((sum, v) => {
                const match = v.items.find(vi => vi.materialText === item.material);
                return sum + (match?.qty ?? 0);
              }, 0);
              const approvedQty = item.issueQty ?? 0;
              const balance = Math.max(0, approvedQty - totalIssued);
              return { item, totalIssued, approvedQty, balance };
            });
            const hasBalance = itemSummary.some(s => s.balance > 0.001);
            const voucherCount = irnVouchers.length;
            // Items with balance that have no stock link (store item OR plant party)
            const unlinkedActiveCount = itemSummary.filter(s => {
              if (s.balance < 0.001) return false;
              if (s.item.materialId) return ivItemPartyIds[s.item.id] == null;
              return ivItemStoreIds[s.item.id] == null;
            }).length;

            return (
              <div className="space-y-3">
                {/* ── Summary card ── */}
                <div className="bg-white border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <PackageCheck className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold text-gray-800">Issue Voucher Status</span>
                    {voucherCount > 0 && (
                      <span className="ml-auto text-sm bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">
                        {voucherCount} voucher{voucherCount > 1 ? "s" : ""} raised
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {itemSummary.map(({ item, totalIssued, approvedQty, balance }) => (
                      <div key={item.id} className="flex justify-between items-center text-sm border-t pt-1.5 text-gray-700">
                        <span className="font-medium text-gray-800">{item.material}</span>
                        <span className="flex gap-4">
                          <span className="text-gray-500">Approved: <strong className="text-gray-700">{approvedQty} {item.uom}</strong></span>
                          <span className="text-gray-500">Issued: <strong className="text-gray-700">{totalIssued.toFixed(2)} {item.uom}</strong></span>
                          <span className={`font-semibold ${balance > 0.001 ? "text-amber-700" : "text-emerald-700"}`}>
                            Bal: {balance.toFixed(2)} {item.uom}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Issue History ── */}
                {voucherCount > 0 && (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <button
                      className="w-full p-4 flex items-center justify-between text-sm hover:bg-gray-50 transition-colors"
                      onClick={() => setShowIssueHistory(h => !h)}
                      data-testid="button-toggle-issue-history"
                    >
                      <span className="flex items-center gap-2 font-medium text-gray-800">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Issue History ({voucherCount} voucher{voucherCount > 1 ? "s" : ""})
                      </span>
                      <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showIssueHistory ? "rotate-180" : ""}`} />
                    </button>
                    {showIssueHistory && (
                      <div className="border-t divide-y">
                        {irnVouchers.map(v => (
                          <div key={v.id} className="p-4 space-y-2" data-testid={`card-voucher-${v.id}`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200" data-testid={`text-voucher-no-${v.id}`}>
                                  {v.issueNumber}
                                </span>
                                <span className="text-sm text-gray-500">{v.date}</span>
                              </div>
                              <Button
                                variant="outline" size="sm"
                                onClick={() => window.open(`/api/irn/${irn.id}/issue-voucher?voucherId=${v.id}`, "_blank")}
                                className="gap-1.5 text-sm h-7 border-gray-300"
                                data-testid={`button-print-voucher-${v.id}`}
                              >
                                <Printer className="h-3 w-3" /> Print
                              </Button>
                            </div>
                            <div className="text-sm text-gray-600 flex flex-wrap gap-3">
                              {v.issuedBy && <span>Issued by: <strong className="text-gray-800">{v.issuedBy}</strong></span>}
                              {v.receivedBy && <span>Received by: <strong className="text-gray-800">{v.receivedBy}</strong></span>}
                              {v.receiverDesignation && <span>Desig: <strong className="text-gray-800">{v.receiverDesignation}</strong></span>}
                              {v.vehicleNo && <span>Vehicle: <strong className="text-gray-800">{v.vehicleNo}</strong></span>}
                              {v.driverName && <span>Driver: <strong className="text-gray-800">{v.driverName}</strong></span>}
                            </div>
                            <div className="space-y-0.5">
                              {v.items.map(vi => (
                                <div key={vi.id} className="flex justify-between text-sm text-gray-700">
                                  <span>{vi.materialText ?? vi.itemName ?? "—"}</span>
                                  <span className="font-semibold">{vi.qty} {vi.uom}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Record next Issue Voucher — only when balance remains ── */}
                {hasBalance && (
                  <div className="bg-white border rounded-lg overflow-hidden">
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PackageCheck className="h-4 w-4 text-green-600 shrink-0" />
                        <span className="text-sm text-gray-700 font-medium">
                          {voucherCount === 0
                            ? `${issueItems.length} item(s) — Issue Voucher authorised`
                            : "Balance remaining — record next Issue Voucher"}
                        </span>
                      </div>
                      {!showIssueForm ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            const qtys: Record<number, string> = {};
                            for (const { item, balance } of itemSummary) qtys[item.id] = balance > 0.001 ? String(Math.round(balance * 1000) / 1000) : "0";
                            setIvItemQtys(qtys);
                            const storeMap: Record<number, number | null> = {};
                            for (const item of issueItems) {
                              const n = item.material.toLowerCase().trim();
                              const found =
                                storeItems.find(s => s.name.toLowerCase().trim() === n) ??
                                storeItems.find(s => s.name.toLowerCase().trim().startsWith(n) || n.startsWith(s.name.toLowerCase().trim())) ??
                                storeItems.find(s => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase().trim())) ??
                                null;
                              storeMap[item.id] = found ? found.id : null;
                            }
                            setIvItemStoreIds(storeMap);
                            setShowIssueForm(true);
                          }}
                          className="bg-green-700 hover:bg-green-800 text-white gap-2 text-sm h-8"
                          data-testid="button-record-issue-voucher"
                        >
                          <PackageCheck className="h-4 w-4" /> {voucherCount === 0 ? "Record Issue" : "Record Next Issue"}
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setShowIssueForm(false)} className="text-sm text-gray-500">
                          Cancel
                        </Button>
                      )}
                    </div>

                    {showIssueForm && (
                      <div className="border-t bg-gray-50 p-4 space-y-4">
                        {/* Header fields */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm text-gray-600">Issue Date *</Label>
                            <Input type="date" value={ivDate} onChange={e => setIvDate(e.target.value)}
                              className="h-8 text-sm mt-1" data-testid="input-iv-date" />
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Issued By *</Label>
                            <Input value={ivIssuedBy} onChange={e => setIvIssuedBy(e.target.value)}
                              placeholder="Name of person issuing" className="h-8 text-sm mt-1" data-testid="input-iv-issued-by" />
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Received By *</Label>
                            <Input value={ivReceivedBy} onChange={e => setIvReceivedBy(e.target.value)}
                              placeholder="Name of recipient" className="h-8 text-sm mt-1" data-testid="input-iv-received-by" />
                          </div>
                          <div>
                            <Label className="text-sm text-gray-600">Receiver Designation</Label>
                            <Input value={ivReceiverDesig} onChange={e => setIvReceiverDesig(e.target.value)}
                              placeholder="e.g. Site Engineer" className="h-8 text-sm mt-1" data-testid="input-iv-receiver-desig" />
                          </div>
                        </div>

                        {/* Delivery mode */}
                        <div>
                          <Label className="text-sm text-gray-600 mb-1 block">Delivery Mode *</Label>
                          <div className="flex gap-2">
                            <Button
                              variant={ivDeliveryMode === "vehicle" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setIvDeliveryMode("vehicle")}
                              className={`gap-1.5 text-sm h-8 ${ivDeliveryMode === "vehicle" ? "bg-amber-700 hover:bg-amber-800" : ""}`}
                              data-testid="button-iv-mode-vehicle"
                            >
                              <Truck className="h-3.5 w-3.5" /> Vehicle
                            </Button>
                            <Button
                              variant={ivDeliveryMode === "hand_carried" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setIvDeliveryMode("hand_carried")}
                              className={`gap-1.5 text-sm h-8 ${ivDeliveryMode === "hand_carried" ? "bg-blue-700 hover:bg-blue-800" : ""}`}
                              data-testid="button-iv-mode-hand"
                            >
                              Hand-carried
                            </Button>
                          </div>
                        </div>

                        {ivDeliveryMode === "vehicle" && (
                          <div className="grid grid-cols-3 gap-3 bg-amber-50 border border-amber-200 rounded p-3">
                            <div>
                              <Label className="text-sm text-gray-600">Vehicle Type *</Label>
                              <Select value={ivVehicleType} onValueChange={setIvVehicleType}>
                                <SelectTrigger className="h-8 text-sm mt-1" data-testid="select-iv-vehicle-type">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {["Two Wheeler", "Three Wheeler", "Light Vehicle", "Medium Vehicle", "Heavy Vehicle", "Tractor", "Other"].map(v => (
                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-sm text-gray-600">Vehicle No. *</Label>
                              <Input value={ivVehicleNo} onChange={e => setIvVehicleNo(e.target.value)}
                                placeholder="e.g. TN 01 AA 1234" className="h-8 text-sm mt-1" data-testid="input-iv-vehicle-no" />
                            </div>
                            <div>
                              <Label className="text-sm text-gray-600">Driver Name *</Label>
                              <Input value={ivDriverName} onChange={e => setIvDriverName(e.target.value)}
                                placeholder="Driver name" className="h-8 text-sm mt-1" data-testid="input-iv-driver-name" />
                            </div>
                          </div>
                        )}

                        <div>
                          <Label className="text-sm text-gray-600">Movement Remarks</Label>
                          <Textarea value={ivRemarks} onChange={e => setIvRemarks(e.target.value)}
                            placeholder="Any remarks about the movement" rows={2}
                            className="text-sm mt-1 resize-none" data-testid="textarea-iv-remarks" />
                        </div>

                        {/* Items table — shows remaining qty as the cap */}
                        <div>
                          <Label className="text-sm text-gray-700 font-semibold mb-2 block">Items to Issue (this voucher)</Label>
                          <div className="border rounded overflow-hidden bg-white">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100 border-b">
                                <tr>
                                  <th className="text-left p-2 font-semibold text-gray-600">Material</th>
                                  <th className="text-center p-2 font-semibold text-gray-600">Remaining Qty</th>
                                  <th className="text-center p-2 font-semibold text-gray-600">Issue Qty (this voucher)</th>
                                  <th className="text-left p-2 font-semibold text-gray-600">Stock Deduction</th>
                                </tr>
                              </thead>
                              <tbody>
                                {issueItems.map((item) => {
                                  const summary = itemSummary.find(s => s.item.id === item.id)!;
                                  const maxQty = summary.balance;
                                  const currentQty = parseFloat(ivItemQtys[item.id] ?? String(maxQty)) || 0;
                                  const isBulk = !!item.materialId;
                                  const storeMatch = ivItemStoreIds[item.id];
                                  const partyMatch = ivItemPartyIds[item.id];
                                  return (
                                    <tr key={item.id} className={`border-t ${maxQty < 0.001 ? "opacity-50" : ""}`}>
                                      <td className="p-2 font-medium text-gray-800">
                                        {item.material}
                                        {isBulk && (
                                          <span className="ml-1 text-xs bg-green-100 text-green-700 border border-green-200 px-1 py-0.5 rounded font-semibold">PLANT</span>
                                        )}
                                      </td>
                                      <td className="p-2 text-center text-gray-600">{maxQty.toFixed(2)} {item.uom}</td>
                                      <td className="p-2">
                                        <div className="flex items-center gap-1 justify-center">
                                          <Input
                                            type="number"
                                            min={0}
                                            max={maxQty}
                                            step={0.01}
                                            value={ivItemQtys[item.id] ?? String(maxQty)}
                                            disabled={maxQty < 0.001}
                                            onChange={e => {
                                              const v = e.target.value;
                                              setIvItemQtys(prev => ({ ...prev, [item.id]: v }));
                                            }}
                                            className={`h-7 w-24 text-center text-sm ${currentQty > maxQty + 0.001 ? "border-red-400 bg-red-50" : ""}`}
                                            data-testid={`input-iv-qty-${item.id}`}
                                          />
                                          <span className="text-gray-500">{item.uom}</span>
                                        </div>
                                        {currentQty > maxQty + 0.001 && (
                                          <p className="text-red-600 text-[12px] text-center">Exceeds balance {maxQty.toFixed(2)}</p>
                                        )}
                                      </td>
                                      <td className="p-2">
                                        {isBulk ? (
                                          <>
                                            <Select
                                              value={partyMatch != null ? String(partyMatch) : "__none__"}
                                              onValueChange={v => setIvItemPartyIds(prev => ({ ...prev, [item.id]: v === "__none__" ? null : parseInt(v) }))}
                                              disabled={maxQty < 0.001}
                                            >
                                              <SelectTrigger className="h-7 text-sm" data-testid={`select-iv-party-${item.id}`}>
                                                <SelectValue placeholder="Select party" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="__none__">— No party —</SelectItem>
                                                {parties.map(p => (
                                                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            {partyMatch == null && maxQty > 0.001 && (
                                              <p className="text-amber-600 font-semibold text-[12px] mt-0.5">⚠ Select party for plant stock</p>
                                            )}
                                          </>
                                        ) : (
                                          <>
                                            <Select
                                              value={storeMatch != null ? String(storeMatch) : "__none__"}
                                              onValueChange={v => setIvItemStoreIds(prev => ({ ...prev, [item.id]: v === "__none__" ? null : parseInt(v) }))}
                                              disabled={maxQty < 0.001}
                                            >
                                              <SelectTrigger className="h-7 text-sm" data-testid={`select-iv-store-item-${item.id}`}>
                                                <SelectValue placeholder="None (text only)" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="__none__">— None (text only) —</SelectItem>
                                                {storeItems.map(si => (
                                                  <SelectItem key={si.id} value={String(si.id)}>{si.name} ({si.category})</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            {storeMatch == null && maxQty > 0.001 && (
                                              <p className="text-red-600 font-semibold text-[12px] mt-0.5">⚠ No stock deduction</p>
                                            )}
                                          </>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Submit */}
                        {unlinkedActiveCount > 0 && (
                          <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm text-amber-800 flex items-start gap-2">
                            <span className="text-amber-600 mt-0.5 shrink-0">⚠</span>
                            <span>
                              <strong>{unlinkedActiveCount} item{unlinkedActiveCount > 1 ? "s" : ""}</strong> {unlinkedActiveCount > 1 ? "have" : "has"} no stock link — select the party (PLANT items) or store item (spare/consumable items) above to enable stock deduction.
                            </span>
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => setShowIssueForm(false)} className="text-sm">
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={recordIssueMutation.isPending || !ivIssuedBy.trim() || !ivReceivedBy.trim() || !ivDate}
                            onClick={() => recordIssueMutation.mutate()}
                            className="bg-green-700 hover:bg-green-800 text-white gap-2 text-sm"
                            data-testid="button-submit-record-issue"
                          >
                            {recordIssueMutation.isPending ? "Recording…" : <><FileCheck className="h-4 w-4" /> Record Issue Voucher</>}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── 7. Closure ── */}
          {isClosed && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Archive className="h-4 w-4 text-gray-500 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-700">Requisition Closed</h3>
                <span className="ml-auto text-sm text-gray-500">
                  {irn.closedBy}
                  {irn.closedAt ? ` · ${format(new Date(irn.closedAt), "dd MMM yyyy, h:mm a")}` : ""}
                </span>
                {(isAdmin || canClose) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reopenMutation.mutate()}
                    disabled={reopenMutation.isPending}
                    className="text-sm h-8 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                    data-testid="button-reopen-irn"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    {reopenMutation.isPending ? "Reopening…" : "Reopen"}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── 8. History Log ── */}
          {auditLogs && auditLogs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" /> Activity History
              </h3>
              <ol className="relative border-l border-gray-200 space-y-3 ml-2">
                {auditLogs.map((log) => {
                  const eventMeta: Record<string, { label: string; color: string }> = {
                    opened: { label: "Raised", color: "bg-blue-100 text-blue-700" },
                    stores_verified: { label: "Stores Verified", color: "bg-purple-100 text-purple-700" },
                    approved: { label: "Approved", color: "bg-green-100 text-green-700" },
                    rejected: { label: "Rejected", color: "bg-red-100 text-red-700" },
                    closed: { label: "Closed / Fulfilled", color: "bg-gray-100 text-gray-600" },
                    reopened: { label: "Reopened", color: "bg-amber-100 text-amber-700" },
                  };
                  const meta = eventMeta[log.event] ?? { label: log.event, color: "bg-gray-100 text-gray-600" };
                  return (
                    <li key={log.id} className="ml-4 pb-1" data-testid={`audit-log-entry-${log.id}`}>
                      <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-gray-300" />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>{meta.label}</span>
                        <span className="text-sm text-gray-500 font-medium">{log.actorName}</span>
                        <span className="text-sm text-gray-400">&middot; {format(new Date(log.timestamp), "dd MMM yyyy, h:mm a")}</span>
                      </div>
                      {log.notes && (
                        <p className="text-sm text-gray-500 mt-0.5 italic">"{log.notes}"</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* ── 9. Actions (approved but not yet closed) ── */}
          {isApproved && (
            <div className="flex items-center gap-3 flex-wrap">
              {canClose && allItemsIssued && (
                <Button
                  variant="outline"
                  onClick={() => closeMutation.mutate()}
                  disabled={closeMutation.isPending}
                  className="text-sm h-9 gap-2 border-gray-300 text-gray-600 hover:bg-gray-50"
                  data-testid="button-close-irn-approved"
                >
                  <Archive className="h-4 w-4" />
                  {closeMutation.isPending ? "Closing…" : "Close / Mark Fulfilled"}
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate("/irn")} className="text-sm">← Back to IRN list</Button>
            </div>
          )}

          {(isClosed || isRejected) && (
            <Button variant="outline" onClick={() => navigate("/irn")} className="text-sm">← Back to IRN list</Button>
          )}
        </div>
      </div>
    );
  }

  // ── Main form: pending_stores (active verification) ────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-0.5">
          <button onClick={() => navigate("/irn")} className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm">
            <ChevronLeft className="h-4 w-4" /> Requisitions
          </button>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded">
              <ClipboardList className="h-4 w-4 text-amber-700" />
            </div>
            <span className="font-mono font-semibold text-amber-700">{irn.irnNo}</span>
            <StatusBadge status={irn.status} />
          </div>
          {adminBar}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
        {/* IRN meta */}
        <div className="bg-white border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-sm text-gray-500">Raised by</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedBy}</p></div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-sm text-gray-500">Section</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedFrom}</p></div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-sm text-gray-500">Date</p><p className="font-semibold text-gray-800 text-sm">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div>
            </div>
            {getSiteName(irn.siteId) && (
              <div className="flex items-center gap-2 text-gray-600 col-span-3 pt-2 mt-1 border-t">
                <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                <div><p className="text-sm text-gray-500">Site / Location</p><p className="font-semibold text-gray-800 text-sm">{getSiteName(irn.siteId)}</p></div>
              </div>
            )}
          </div>
          {irn.remarks && (
            <>
              <Separator className="my-3" />
              <p className="text-sm text-gray-500"><span className="font-medium text-gray-700">Remarks:</span> {irn.remarks}</p>
            </>
          )}
        </div>

        {canVerify && irn.status === "pending_stores" && (
          <>
            {/* Instruction */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                For each item: check physical stock, then choose an action.{" "}
                <strong>Issue from Store</strong> generates an Issue Voucher immediately.{" "}
                <strong>Add to Procurement Queue</strong> queues the item — no PI is auto-raised.{" "}
                <strong>Split</strong> issues available stock now and queues the shortfall.
              </span>
            </div>

            {/* Items verification */}
            <div className="space-y-3">
              {irn.items.map((item, idx) => {
                const v = verifications.find((x) => x.itemId === item.id);
                if (!v) return null;
                return (
                  <div key={item.id} className="bg-white border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-400 font-medium">#{idx + 1}</span>
                          <span className="font-semibold text-gray-800 text-sm">{item.material}</span>
                          <span className={`text-sm px-1.5 py-0.5 rounded-full border font-medium ${URGENCY_COLOR[item.urgency]}`}>
                            {item.urgency === "urgent" ? "🔴 Urgent" : item.urgency === "high" ? "🟠 High" : "Normal"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 ml-7">{item.purpose}</p>
                        {item.needByDate && (
                          <p className="text-sm text-amber-600 mt-0.5 ml-7 font-medium">Need by: {format(new Date(item.needByDate), "dd MMM yyyy")}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm text-gray-400">Requested</p>
                        <p className="font-bold text-gray-800">{item.qty} <span className="font-normal text-gray-500">{item.uom}</span></p>
                      </div>
                    </div>

                    <Separator />

                    {(() => {
                      const live = findLiveStock(item.material, item.uom);
                      const reqQty = item.qty;
                      // issueQty over-limit: exceeds requested qty OR exceeds what's physically available
                      const issueOverReq = v.issueQty > reqQty;
                      const issueOverStock = v.stockAvailable > 0 && v.issueQty > v.stockAvailable;
                      const issueOver = issueOverReq || issueOverStock;
                      const procureOver = v.procureQty > reqQty - v.issueQty;
                      const issueMax = v.stockAvailable > 0 ? Math.min(reqQty, v.stockAvailable) : reqQty;
                      return (
                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-3 space-y-1">
                            <Label className="text-sm text-gray-500">
                              Stock in Hand ({item.uom})
                            </Label>
                            <Input
                              type="number"
                              value={v.stockAvailable}
                              onChange={(e) => updateVerification(item.id, "stockAvailable", Number(e.target.value))}
                              className={`h-8 text-sm font-medium ${v.stockAvailable >= item.qty ? "border-green-300 bg-green-50" : v.stockAvailable === 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
                            />
                            {live ? (
                              <div className="space-y-0.5">
                                {live.hasConversionError && (
                                  <p className="text-[12px] flex items-center gap-0.5 text-orange-600">
                                    <AlertCircle className="h-2.5 w-2.5 shrink-0" />
                                    Mixed UOMs — partial conversion
                                  </p>
                                )}
                                <p className={`text-[12px] flex items-center gap-0.5 ${live.balance >= item.qty ? "text-green-600" : live.balance > 0 ? "text-amber-600" : "text-red-500"}`}>
                                  <Warehouse className="h-2.5 w-2.5 shrink-0" />
                                  {live.approx ? "~" : ""}Available: {live.balance > 0 ? live.balance.toFixed(3) : "0"} {live.uom}
                                </p>
                                {live.sourceParts.length > 0 && (
                                  <p className="text-[12px] text-gray-400 ml-3">
                                    Source: {live.sourceParts.join(" + ")}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-[12px] text-gray-400 flex items-center gap-0.5">
                                <Warehouse className="h-2.5 w-2.5" /> No match in stock ledger
                              </p>
                            )}
                          </div>
                          <div className="col-span-3 space-y-1">
                            <Label className="text-sm text-gray-500">Action</Label>
                            <Select value={v.storesAction} onValueChange={(val) => updateVerification(item.id, "storesAction", val as StoresAction)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="issue" className="text-sm text-green-700">✅ Issue from Store</SelectItem>
                                <SelectItem value="procure" className="text-sm text-purple-700">📋 Add to Procurement Queue</SelectItem>
                                <SelectItem value="split" className="text-sm text-blue-700">⚖️ Split — issue now + queue balance</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className={`text-sm ${issueOver ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                              Issue ({item.uom}){issueOver ? ` ⚠ max ${issueMax.toFixed(3)}` : ""}
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              max={issueMax}
                              value={v.issueQty}
                              onChange={(e) => updateVerification(item.id, "issueQty", Number(e.target.value))}
                              disabled={v.storesAction === "procure"}
                              className={`h-8 text-sm disabled:opacity-50 ${issueOver ? "border-red-400 bg-red-50" : "bg-green-50 border-green-200"}`}
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className={`text-sm ${procureOver ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                              Queue ({item.uom}){procureOver ? ` ⚠ max ${Math.max(0, reqQty - v.issueQty)}` : ""}
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              max={Math.max(0, reqQty - v.issueQty)}
                              value={v.procureQty}
                              onChange={(e) => updateVerification(item.id, "procureQty", Number(e.target.value))}
                              disabled={v.storesAction === "issue"}
                              className={`h-8 text-sm disabled:opacity-50 ${procureOver ? "border-red-400 bg-red-50" : "bg-purple-50 border-purple-200"}`}
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-sm text-gray-500">Notes</Label>
                            <Input
                              value={v.storesNotes}
                              onChange={(e) => updateVerification(item.id, "storesNotes", e.target.value)}
                              placeholder="optional"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex gap-2 flex-wrap">
                      {v.issueQty > 0 && (
                        <span className="inline-flex items-center gap-1 text-sm bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">
                          <PackageCheck className="h-3 w-3" /> Issue {v.issueQty} {item.uom} from stock
                        </span>
                      )}
                      {v.procureQty > 0 && (
                        <span className="inline-flex items-center gap-1 text-sm bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                          <ListTodo className="h-3 w-3" /> {v.procureQty} {item.uom} → Procurement Queue
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stores remarks */}
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <Label className="text-sm font-medium text-gray-700">Storekeeper Remarks</Label>
              <Textarea
                value={storesRemarks}
                onChange={(e) => setStoresRemarks(e.target.value)}
                placeholder="Any remarks for the requester or procurement team…"
                className="text-sm resize-none h-16"
              />
            </div>

            {/* Summary + confirm */}
            <div className="bg-white border rounded-lg p-4">
              <div className="flex items-center gap-6 text-sm mb-4">
                <div className="flex items-center gap-2 text-green-700">
                  <PackageCheck className="h-4 w-4" />
                  <span>{issueCount} item{issueCount !== 1 ? "s" : ""} to issue from store</span>
                </div>
                <div className="flex items-center gap-2 text-purple-700">
                  <ListTodo className="h-4 w-4" />
                  <span>{procureCount} item{procureCount !== 1 ? "s" : ""} to add to Procurement Queue</span>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => navigate("/irn")} className="text-sm h-9">Cancel</Button>
                <Button
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-sm h-9 px-6 gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {verifyMutation.isPending ? "Saving…" : "Confirm Verification"}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Read-only view when not stores or already verified */}
        {(!canVerify || irn.status !== "pending_stores") && (
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Info className="h-4 w-4 text-gray-400" /> Requested Items
            </h2>
            <Separator />
            {irn.items.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">#{idx + 1}</span>
                    <span className="font-medium text-gray-800 text-sm">{item.material}</span>
                    <span className={`text-sm px-1.5 py-0.5 rounded-full border ${URGENCY_COLOR[item.urgency]}`}>
                      {item.urgency}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 ml-5">{item.purpose}</p>
                  {item.needByDate && <p className="text-sm text-amber-600 ml-5 font-medium">Need by: {format(new Date(item.needByDate), "dd MMM yyyy")}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800">{item.qty} <span className="font-normal text-gray-500 text-sm">{item.uom}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}

        {irn.status === "pending_stores" && !canVerify && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>This IRN is awaiting stores verification. The storekeeper will check stock and respond shortly.</span>
          </div>
        )}
      </div>
    </div>
  );
}
