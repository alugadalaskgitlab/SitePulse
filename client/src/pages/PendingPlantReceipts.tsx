import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Inbox, MapPin, User, Calendar, Package,
} from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";

type PendingPlantReceipt = {
  id: number;
  indentId: number;
  indentNo: string | null;
  indentItemId: number;
  materialName: string;
  materialId: number | null;
  qty: number;
  uom: string;
  vendor: string | null;
  rate: number | null;
  paymentMode: string | null;
  paidBy: string | null;
  purchaseDate: string | null;
  receivingLocation: string;
  remarks: string | null;
  createdByUserId: number;
  createdBy: string;
  status: string;
  confirmedByUserId: number | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  rejectionReason: string | null;
  linkedReceiptId: number | null;
  createdAt: string;
};

const LOCATION_LABELS: Record<string, string> = {
  hmp_plant: "HMP Plant",
  rmc_plant: "RMC Plant",
  site: "Site",
};

const LOCATION_COLORS: Record<string, string> = {
  hmp_plant: "bg-teal-100 text-teal-700 border-teal-200",
  rmc_plant: "bg-indigo-100 text-indigo-700 border-indigo-200",
  site: "bg-amber-100 text-amber-700 border-amber-200",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Confirmed</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200 animate-pulse">Pending</Badge>;
}

export default function PendingPlantReceipts() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [statusFilter, setStatusFilter] = useState<"pending" | "confirmed" | "rejected">("pending");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: receipts = [], isLoading } = useQuery<PendingPlantReceipt[]>({
    queryKey: ["/api/pending-plant-receipts", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/pending-plant-receipts?status=${statusFilter}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/pending-plant-receipts/${id}`, { action: "confirm" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plant-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      setConfirmId(null);
      toast({ title: "Receipt confirmed — stock updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Confirmation failed", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest("PATCH", `/api/pending-plant-receipts/${id}`, { action: "reject", rejectionReason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pending-plant-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-indents"] });
      setRejectId(null);
      setRejectionReason("");
      toast({ title: "Receipt rejected — purchaser notified" });
    },
    onError: (err: Error) => {
      toast({ title: "Rejection failed", description: err.message, variant: "destructive" });
    },
  });

  const confirmingReceipt = receipts.find(r => r.id === confirmId);
  const rejectingReceipt = receipts.find(r => r.id === rejectId);

  const isSodBlocked = (receipt: PendingPlantReceipt) =>
    !isAdmin && receipt.createdByUserId === user?.id;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/stores/hub")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Stores Hub
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-lg">
          <Inbox className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pending Plant Receipts</h1>
          <p className="text-sm text-slate-500">Bulk plant material receipts awaiting confirmation before entering stock</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["pending", "confirmed", "rejected"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === s
                ? "bg-slate-800 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
            data-testid={`filter-${s}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-12 text-slate-400">Loading...</div>
      )}

      {!isLoading && receipts.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No {statusFilter} receipts</p>
            <p className="text-sm text-slate-400 mt-1">
              {statusFilter === "pending"
                ? "All bulk plant receipts have been confirmed or are not yet submitted."
                : `No ${statusFilter} receipts to show.`}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {receipts.map(receipt => {
          const blocked = isSodBlocked(receipt);
          return (
            <Card
              key={receipt.id}
              className={`border ${blocked ? "border-amber-200 bg-amber-50/30" : "border-slate-200"}`}
              data-testid={`card-ppr-${receipt.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{receipt.materialName}</span>
                      <StatusBadge status={receipt.status} />
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${LOCATION_COLORS[receipt.receivingLocation] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        <MapPin className="w-3 h-3" />
                        {LOCATION_LABELS[receipt.receivingLocation] ?? receipt.receivingLocation}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{receipt.qty} {receipt.uom}</span>
                      </div>
                      {receipt.vendor && (
                        <div className="col-span-1">
                          <span className="text-slate-400">Vendor: </span>
                          <span>{receipt.vendor}</span>
                        </div>
                      )}
                      {receipt.rate != null && (
                        <div>
                          <span className="text-slate-400">Rate: </span>
                          <span>₹{receipt.rate}/{receipt.uom}</span>
                        </div>
                      )}
                      {receipt.purchaseDate && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{format(new Date(receipt.purchaseDate), "dd MMM yyyy")}</span>
                        </div>
                      )}
                    </div>

                    {receipt.indentNo && (
                      <p className="text-xs text-slate-400">Indent: {receipt.indentNo}</p>
                    )}
                    {receipt.remarks && (
                      <p className="text-xs text-slate-500 italic">{receipt.remarks}</p>
                    )}

                    <div className="flex items-center gap-1 text-xs text-slate-400">
                      <User className="w-3 h-3" />
                      <span>Submitted by {receipt.createdBy}</span>
                      <span>·</span>
                      <span>{receipt.createdAt ? format(new Date(receipt.createdAt), "dd MMM yyyy, h:mm a") : ""}</span>
                    </div>

                    {receipt.status === "confirmed" && receipt.confirmedBy && (
                      <div className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Confirmed by {receipt.confirmedBy}
                        {receipt.confirmedAt ? ` on ${format(new Date(receipt.confirmedAt), "dd MMM yyyy")}` : ""}
                      </div>
                    )}
                    {receipt.status === "rejected" && (
                      <div className="text-xs text-red-600 flex items-center gap-1">
                        <XCircle className="w-3 h-3" />
                        Rejected: {receipt.rejectionReason ?? "No reason given"}
                      </div>
                    )}

                    {blocked && receipt.status === "pending" && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 w-fit">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        You submitted this receipt — another plant staff member must confirm it (Separation of Duties)
                      </div>
                    )}
                  </div>

                  {receipt.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={blocked || confirmMutation.isPending}
                        onClick={() => setConfirmId(receipt.id)}
                        data-testid={`button-confirm-ppr-${receipt.id}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                        disabled={rejectMutation.isPending}
                        onClick={() => { setRejectId(receipt.id); setRejectionReason(""); }}
                        data-testid={`button-reject-ppr-${receipt.id}`}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirmId !== null} onOpenChange={(o) => { if (!o) setConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Confirm Plant Receipt
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 text-sm">
                {confirmingReceipt && (
                  <>
                    <p>You are confirming receipt of <strong>{confirmingReceipt.qty} {confirmingReceipt.uom}</strong> of <strong>{confirmingReceipt.materialName}</strong>.</p>
                    <p className="text-slate-500">This will post the material to plant stock at <strong>{LOCATION_LABELS[confirmingReceipt.receivingLocation] ?? confirmingReceipt.receivingLocation}</strong>.</p>
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)} data-testid="button-confirm-cancel">Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={confirmMutation.isPending}
              onClick={() => confirmId !== null && confirmMutation.mutate(confirmId)}
              data-testid="button-confirm-proceed"
            >
              {confirmMutation.isPending ? "Confirming..." : "Confirm & Post to Stock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectId !== null} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectionReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Reject Plant Receipt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rejectingReceipt && (
              <p className="text-sm text-slate-600">
                Rejecting receipt of <strong>{rejectingReceipt.qty} {rejectingReceipt.uom}</strong> of <strong>{rejectingReceipt.materialName}</strong>.
                The purchaser's item will revert to "Purchaser Actioned" status.
              </p>
            )}
            <div>
              <Label className="text-sm font-medium">Reason for Rejection</Label>
              <Textarea
                className="mt-1"
                placeholder="Explain why this receipt is being rejected..."
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={3}
                data-testid="input-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectionReason(""); }} data-testid="button-reject-cancel">Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
              onClick={() => rejectId !== null && rejectMutation.mutate({ id: rejectId, reason: rejectionReason.trim() })}
              data-testid="button-reject-proceed"
            >
              {rejectMutation.isPending ? "Rejecting..." : "Reject Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
