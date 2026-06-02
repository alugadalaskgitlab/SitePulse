import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import {
  ClipboardList, ChevronLeft, PackageCheck, ListTodo, CheckCircle2,
  AlertCircle, AlertTriangle, User, Calendar, FileText, Info,
  ShieldCheck, XCircle, ThumbsUp, ThumbsDown, ShoppingCart, Download, Archive,
  Warehouse,
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
import type { InternalRequisitionWithItems, InternalRequisitionItem } from "@shared/schema";

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
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs">Pending Stores Check</Badge>;
  if (status === "stores_verified")
    return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">Awaiting Approval</Badge>;
  if (status === "approved")
    return <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs gap-1"><ShieldCheck className="h-3 w-3" />Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-50 text-red-700 border border-red-200 text-xs gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border border-gray-200 text-xs">Closed</Badge>;
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
  const { sectionCan } = useAuth();
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

  // Fetch live stock balances for stores verification form
  const { data: stockLookupRows } = useQuery<{ materialName: string; balance: number; uom: string | null; partyId: number | null }[]>({
    queryKey: ["/api/irn/stock-lookup"],
    enabled: canVerify && irn?.status === "pending_stores",
  });

  // Build a map: UPPER(materialName) → total balance across all parties + sorted list for partial matching
  const liveStock = useMemo(() => {
    const exact = new Map<string, { balance: number; uom: string }>();
    if (!stockLookupRows) return { exact, sorted: [] as { key: string; balance: number; uom: string }[] };
    for (const row of stockLookupRows) {
      const key = row.materialName.toUpperCase().trim();
      const existing = exact.get(key);
      if (existing) { existing.balance += row.balance; }
      else { exact.set(key, { balance: row.balance, uom: row.uom ?? "" }); }
    }
    const sorted = [...exact.entries()].map(([key, val]) => ({ key, ...val }));
    return { exact, sorted };
  }, [stockLookupRows]);

  // Find the best live stock entry for an IRN item:
  // 1. Exact name match (always wins)
  // 2. Among all approximate word-level matches, pick the one with the highest balance
  function findLiveStock(materialName: string): { balance: number; uom: string; approx: boolean } | null {
    const needle = materialName.toUpperCase().trim();
    const ex = liveStock.exact.get(needle);
    if (ex) return { ...ex, approx: false };
    // Collect all approximate matches, return the best (highest balance)
    let best: { balance: number; uom: string } | null = null;
    for (const entry of liveStock.sorted) {
      const stockWords = entry.key.split(/\s+/).filter(w => w.length >= 3);
      if (stockWords.some(w => needle.includes(w) || entry.key.includes(needle))) {
        if (!best || entry.balance > best.balance) {
          best = { balance: entry.balance, uom: entry.uom };
        }
      }
    }
    return best ? { ...best, approx: true } : null;
  }

  const [verifications, setVerifications] = useState<ItemVerification[]>([]);
  const [storesRemarks, setStoresRemarks] = useState("");
  const [verified, setVerified] = useState(false);
  const [approvalRemarks, setApprovalRemarks] = useState("");

  // Auto-fill stock + set smart default action when live stock data arrives (first time only)
  const autoFillApplied = useRef(false);
  useEffect(() => {
    if (liveStock.sorted.length === 0 || !irn || verifications.length === 0) return;
    if (autoFillApplied.current) return;
    autoFillApplied.current = true;
    setVerifications(prev => prev.map(v => {
      const item = irn.items.find(i => i.id === v.itemId);
      if (!item) return v;
      if (item.storesAction != null) return v; // already verified — keep saved values
      const live = findLiveStock(item.material);
      if (!live) return v;
      const balance = Math.max(0, live.balance);
      if (balance === 0) {
        return { ...v, stockAvailable: 0, storesAction: "procure", issueQty: 0, procureQty: item.qty };
      } else if (balance < item.qty) {
        return { ...v, stockAvailable: balance, storesAction: "split", issueQty: Math.min(balance, item.qty), procureQty: Math.max(0, item.qty - balance) };
      } else {
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
          if (value === "issue") { updated.issueQty = reqQty; updated.procureQty = 0; }
          else if (value === "procure") { updated.issueQty = 0; updated.procureQty = reqQty; }
          else if (value === "split") { updated.issueQty = updated.stockAvailable; updated.procureQty = Math.max(0, reqQty - updated.stockAvailable); }
        }
        if (field === "stockAvailable" && updated.storesAction === "split") {
          const sa = Number(value);
          updated.issueQty = Math.min(sa, reqQty);
          updated.procureQty = Math.max(0, reqQty - sa);
        }
        // issueQty change sets a baseline procureQty (user can raise it further for replenishment)
        if (field === "issueQty") { updated.procureQty = Math.max(updated.procureQty, reqQty - Number(value)); }
        // procureQty is free — storekeeper can queue more than the deficit for stock replenishment
        return updated;
      })
    );
  }

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
      toast({ title: "IRN Closed", description: "Requisition marked as fulfilled and closed." });
    },
    onError: (err: any) => {
      toast({ title: "Close failed", description: err.message, variant: "destructive" });
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
  const isRejected = irn.status === "rejected";
  const allItemsIssued = irn.items.length > 0 && irn.items.every((i) => i.itemStatus === "issued");

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
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          {/* Meta */}
          <div className="bg-white border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Raised by</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedBy}</p></div></div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Section</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedFrom}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Date</p><p className="font-semibold text-gray-800 text-sm">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div></div>
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
              {irn.items.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">#{idx + 1}</span>
                    <span className="font-semibold text-gray-800">{item.material}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${URGENCY_COLOR[item.urgency]}`}>{item.urgency}</span>
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
              ))}
            </div>
            {displayIssue > 0 && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2 text-xs text-green-700 mt-3">
                <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                <span><strong>{displayIssue} item{displayIssue !== 1 ? "s" : ""}</strong> to issue from store</span>
              </div>
            )}
            {displayProcure > 0 && (
              <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-2 text-xs text-purple-700 mt-2">
                <ListTodo className="h-3.5 w-3.5 shrink-0" />
                <span><strong>{displayProcure} item{displayProcure !== 1 ? "s" : ""}</strong> to add to Procurement Queue</span>
              </div>
            )}
            {irn.storesRemarks && (
              <p className="text-xs text-gray-500 italic mt-2">Stores note: "{irn.storesRemarks}"</p>
            )}
          </div>

          {/* Approval panel — shown to approvers when still awaiting */}
          {canApprove && irn.status === "stores_verified" && (
            <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-blue-800">Manager Approval</h3>
              </div>
              <p className="text-xs text-gray-500">
                Review the stores decision above and approve or reject this requisition.
              </p>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-700">Remarks (optional)</Label>
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
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
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
              <p className="text-xs text-gray-500">
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

  // ── Approved view ──────────────────────────────────────────────────────────
  if (isApproved) {
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
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Raised by</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedBy}</p></div></div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Section</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedFrom}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Date</p><p className="font-semibold text-gray-800 text-sm">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div></div>
            </div>
          </div>

          <div className="bg-white border border-green-200 rounded-xl p-6 text-center space-y-4">
            <div className="p-4 bg-green-100 rounded-full w-fit mx-auto">
              <ShieldCheck className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Requisition Approved</h2>
            <p className="text-sm text-gray-500">
              Approved by <strong>{irn.approvedBy}</strong>
              {irn.approvedAt ? ` on ${format(new Date(irn.approvedAt), "dd MMM yyyy, h:mm a")}` : ""}
            </p>
            {irn.approvalRemarks && (
              <p className="text-xs text-gray-500 italic">"{irn.approvalRemarks}"</p>
            )}
            <div className="space-y-1.5 text-left max-w-sm mx-auto">
              {irn.items.filter((i) => i.issueQty && i.issueQty > 0).length > 0 && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2.5 text-sm text-green-700">
                  <PackageCheck className="h-4 w-4 shrink-0" />
                  <span><strong>{irn.items.filter((i) => i.issueQty && i.issueQty > 0).length} item(s)</strong> — Issue Voucher authorised</span>
                </div>
              )}
              {irn.items.filter((i) => i.procureQty && i.procureQty > 0).length > 0 && (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-2.5 text-sm text-purple-700">
                  <ListTodo className="h-4 w-4 shrink-0" />
                  <span><strong>{irn.items.filter((i) => i.procureQty && i.procureQty > 0).length} item(s)</strong> — Procurement Queue confirmed</span>
                </div>
              )}
            </div>
            {/* Download Issue Voucher — shown when there are issue items */}
            {irn.items.filter((i) => i.issueQty && i.issueQty > 0).length > 0 && (
              <Button
                variant="outline"
                onClick={() => window.open(`/api/irn/${irn.id}/issue-voucher`, "_blank")}
                className="gap-2 text-sm border-green-300 text-green-700 hover:bg-green-50"
                data-testid="button-download-issue-voucher"
              >
                <Download className="h-4 w-4" />
                Download Issue Voucher
              </Button>
            )}
            {/* Raise PI button — shown when procure items exist and PI not yet raised */}
            {irn.items.filter((i) => i.procureQty && i.procureQty > 0).length > 0 && (
              (irn as any).linkedPiId ? (
                <div className="flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-2.5 text-sm text-indigo-700 max-w-sm mx-auto">
                  <ShoppingCart className="h-4 w-4 shrink-0" />
                  <span>Purchase Indent already raised from this IRN</span>
                </div>
              ) : (
                <Button
                  onClick={() => navigate(`/purchase-indents?fromIrnId=${irn.id}`)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 text-sm px-5"
                  data-testid="button-raise-pi-from-irn"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Raise PI from this IRN
                </Button>
              )
            )}
            <div className="text-xs text-gray-400 border-t pt-3 mt-2">
              Stores verified by {irn.storesVerifiedBy}
              {irn.storesVerifiedAt ? ` · ${format(new Date(irn.storesVerifiedAt), "dd MMM, h:mm a")}` : ""}
            </div>
            {/* Close / Mark Fulfilled — approved IRNs */}
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
            <Button variant="outline" onClick={() => navigate("/irn")} className="mt-1">← Back to IRN list</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Closed view ────────────────────────────────────────────────────────────
  if (irn.status === "closed") {
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
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-400">Raised by</p><p className="font-medium text-gray-800 text-xs">{irn.raisedBy}</p></div></div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-400">Section</p><p className="font-medium text-gray-800 text-xs">{irn.raisedFrom}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-400">Date</p><p className="font-medium text-gray-800 text-xs">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div></div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
            <div className="p-4 bg-gray-100 rounded-full w-fit mx-auto">
              <Archive className="h-10 w-10 text-gray-500" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Requisition Closed</h2>
            <p className="text-sm text-gray-500">
              Closed by <strong>{(irn as any).closedBy ?? "—"}</strong>
              {(irn as any).closedAt ? ` on ${format(new Date((irn as any).closedAt), "dd MMM yyyy, h:mm a")}` : ""}
            </p>
            <div className="space-y-1.5 text-left max-w-sm mx-auto">
              {irn.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1 border-b last:border-0 text-sm">
                  <span className="text-gray-700">{item.material}</span>
                  <span className="text-xs text-gray-400">{item.itemStatus}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-400 border-t pt-3 mt-2">
              {irn.approvedBy && <>Approved by {irn.approvedBy}{irn.approvedAt ? ` · ${format(new Date(irn.approvedAt), "dd MMM")}` : ""}<br /></>}
              Stores verified by {irn.storesVerifiedBy}
              {irn.storesVerifiedAt ? ` · ${format(new Date(irn.storesVerifiedAt), "dd MMM, h:mm a")}` : ""}
            </div>
            <Button variant="outline" onClick={() => navigate("/irn")} className="mt-1">← Back to IRN list</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Rejected view ──────────────────────────────────────────────────────────
  if (isRejected) {
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
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Raised by</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedBy}</p></div></div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Section</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedFrom}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-500">Date</p><p className="font-semibold text-gray-800 text-sm">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div></div>
            </div>
          </div>

          <div className="bg-white border border-red-200 rounded-xl p-6 text-center space-y-4">
            <div className="p-4 bg-red-100 rounded-full w-fit mx-auto">
              <XCircle className="h-10 w-10 text-red-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Requisition Rejected</h2>
            <p className="text-sm text-gray-500">
              Rejected by <strong>{irn.rejectedBy}</strong>
              {irn.rejectedAt ? ` on ${format(new Date(irn.rejectedAt), "dd MMM yyyy, h:mm a")}` : ""}
            </p>
            {irn.rejectionReason && (
              <p className="text-xs text-red-600 italic bg-red-50 border border-red-200 rounded p-2">"{irn.rejectionReason}"</p>
            )}
            <div className="text-xs text-gray-400 border-t pt-3">
              Stores verified by {irn.storesVerifiedBy}
              {irn.storesVerifiedAt ? ` · ${format(new Date(irn.storesVerifiedAt), "dd MMM, h:mm a")}` : ""}
            </div>
            <Button variant="outline" onClick={() => navigate("/irn")} className="mt-1">← Back to IRN list</Button>
          </div>
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
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-5 space-y-4">
        {/* IRN meta */}
        <div className="bg-white border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <User className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-xs text-gray-500">Raised by</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedBy}</p></div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-xs text-gray-500">Section</p><p className="font-semibold text-gray-800 text-sm">{irn.raisedFrom}</p></div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-xs text-gray-500">Date</p><p className="font-semibold text-gray-800 text-sm">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div>
            </div>
          </div>
          {irn.remarks && (
            <>
              <Separator className="my-3" />
              <p className="text-xs text-gray-500"><span className="font-medium text-gray-700">Remarks:</span> {irn.remarks}</p>
            </>
          )}
        </div>

        {canVerify && irn.status === "pending_stores" && (
          <>
            {/* Instruction */}
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
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
                          <span className="text-xs text-gray-400 font-medium">#{idx + 1}</span>
                          <span className="font-semibold text-gray-800 text-sm">{item.material}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${URGENCY_COLOR[item.urgency]}`}>
                            {item.urgency === "urgent" ? "🔴 Urgent" : item.urgency === "high" ? "🟠 High" : "Normal"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 ml-7">{item.purpose}</p>
                        {item.needByDate && (
                          <p className="text-xs text-amber-600 mt-0.5 ml-7 font-medium">Need by: {format(new Date(item.needByDate), "dd MMM yyyy")}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-xs text-gray-400">Requested</p>
                        <p className="font-bold text-gray-800">{item.qty} <span className="font-normal text-gray-500">{item.uom}</span></p>
                      </div>
                    </div>

                    <Separator />

                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs text-gray-500">Stock in Hand ({item.uom})</Label>
                        <Input
                          type="number"
                          value={v.stockAvailable}
                          onChange={(e) => updateVerification(item.id, "stockAvailable", Number(e.target.value))}
                          className={`h-8 text-sm font-medium ${v.stockAvailable >= item.qty ? "border-green-300 bg-green-50" : v.stockAvailable === 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
                        />
                        {(() => {
                          const live = findLiveStock(item.material);
                          if (!live) return null;
                          const color = live.balance >= item.qty ? "text-green-600" : live.balance > 0 ? "text-amber-600" : "text-red-500";
                          return (
                            <p className={`text-[10px] flex items-center gap-0.5 ${color}`}>
                              <Warehouse className="h-2.5 w-2.5" />
                              Plant stock: {live.approx ? "~" : ""}{live.balance > 0 ? live.balance.toFixed(2) : "0"} {live.uom}
                            </p>
                          );
                        })()}
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs text-gray-500">Action</Label>
                        <Select value={v.storesAction} onValueChange={(val) => updateVerification(item.id, "storesAction", val as StoresAction)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="issue" className="text-xs text-green-700">✅ Issue from Store</SelectItem>
                            <SelectItem value="procure" className="text-xs text-purple-700">📋 Add to Procurement Queue</SelectItem>
                            <SelectItem value="split" className="text-xs text-blue-700">⚖️ Split — issue now + queue balance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs text-gray-500">Issue ({item.uom})</Label>
                        <Input
                          type="number"
                          value={v.issueQty}
                          onChange={(e) => updateVerification(item.id, "issueQty", Number(e.target.value))}
                          disabled={v.storesAction === "procure"}
                          className="h-8 text-sm bg-green-50 border-green-200 disabled:opacity-50"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs text-gray-500">Queue ({item.uom})</Label>
                        <Input
                          type="number"
                          value={v.procureQty}
                          onChange={(e) => updateVerification(item.id, "procureQty", Number(e.target.value))}
                          disabled={v.storesAction === "issue"}
                          className="h-8 text-sm bg-purple-50 border-purple-200 disabled:opacity-50"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs text-gray-500">Notes</Label>
                        <Input
                          value={v.storesNotes}
                          onChange={(e) => updateVerification(item.id, "storesNotes", e.target.value)}
                          placeholder="optional"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {v.issueQty > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full">
                          <PackageCheck className="h-3 w-3" /> Issue {v.issueQty} {item.uom} from stock
                        </span>
                      )}
                      {v.procureQty > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
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
              <Label className="text-xs font-medium text-gray-700">Storekeeper Remarks</Label>
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
                    <span className="text-xs text-gray-400">#{idx + 1}</span>
                    <span className="font-medium text-gray-800 text-sm">{item.material}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${URGENCY_COLOR[item.urgency]}`}>
                      {item.urgency}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 ml-5">{item.purpose}</p>
                  {item.needByDate && <p className="text-xs text-amber-600 ml-5 font-medium">Need by: {format(new Date(item.needByDate), "dd MMM yyyy")}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-800">{item.qty} <span className="font-normal text-gray-500 text-xs">{item.uom}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}

        {irn.status === "pending_stores" && !canVerify && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>This IRN is awaiting stores verification. The storekeeper will check stock and respond shortly.</span>
          </div>
        )}
      </div>
    </div>
  );
}
