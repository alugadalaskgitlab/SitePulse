import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  CheckCircle2, XCircle, Clock, ShieldCheck, User, FileText,
  MessageSquare, RefreshCw, Inbox, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EditPermissionRequest } from "@shared/schema";

const RECORD_TYPE_LABELS: Record<string, string> = {
  dpr: "Daily Progress Report",
  plant_shift_log: "Plant Shift Log",
  heating_session: "Heating Session",
  material_receipt: "Material Receipt",
  site_purchase: "Site Purchase",
  store_grn: "Store GRN",
  diesel_requirement: "Diesel Requirement",
  purchase_indent: "Purchase Indent",
  truck_dispatch: "Truck Dispatch",
  equipment_usage: "Equipment Usage",
};

function statusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-300"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case "approved":
      return <Badge className="bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    case "denied":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Denied</Badge>;
    case "used":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300"><ShieldCheck className="h-3 w-3 mr-1" />Used</Badge>;
    case "expired":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function RequestCard({
  req,
  showActions,
  onApprove,
  onDeny,
}: {
  req: EditPermissionRequest;
  showActions: boolean;
  onApprove?: (id: number) => void;
  onDeny?: (id: number) => void;
}) {
  const expiresAt = req.expiresAt ? new Date(req.expiresAt) : null;
  const isActive = req.status === "approved" && expiresAt && expiresAt > new Date();

  return (
    <div
      className="rounded-lg border bg-card p-4 space-y-3 shadow-sm"
      data-testid={`card-edit-request-${req.id}`}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-0.5">
          <p className="font-medium text-sm">
            {RECORD_TYPE_LABELS[req.recordType] ?? req.recordType} <span className="text-muted-foreground">#{req.recordId}</span>
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            {req.requestedByName} &middot; {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
          </p>
        </div>
        {statusBadge(req.status)}
      </div>

      <div className="bg-muted/50 rounded px-3 py-2 text-sm flex gap-2">
        <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <span>{req.requestReason}</span>
      </div>

      {req.approverName && (
        <div className="text-xs text-muted-foreground flex gap-1 items-start">
          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">{req.approverName}</span>
            {req.approverNote ? `: "${req.approverNote}"` : " (no note)"}
          </span>
        </div>
      )}

      {isActive && expiresAt && (
        <p className="text-xs text-green-700 font-medium">
          Expires {formatDistanceToNow(expiresAt, { addSuffix: true })} ({format(expiresAt, "h:mm a")})
        </p>
      )}

      {showActions && req.status === "pending" && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onApprove?.(req.id)}
            data-testid={`btn-approve-${req.id}`}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1"
            onClick={() => onDeny?.(req.id)}
            data-testid={`btn-deny-${req.id}`}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EditRequestsPage() {
  const { isAdmin, isOwner } = useAuth();
  const { toast } = useToast();

  const [actionId, setActionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"approve" | "deny">("approve");
  const [note, setNote] = useState("");

  const canApprove = isAdmin || isOwner;

  const pendingQuery = useQuery<EditPermissionRequest[]>({
    queryKey: ["/api/edit-requests/pending"],
    queryFn: async () => {
      const res = await fetch("/api/edit-requests/pending", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: canApprove,
    refetchInterval: 30_000,
  });

  const mineQuery = useQuery<EditPermissionRequest[]>({
    queryKey: ["/api/edit-requests/mine"],
    queryFn: async () => {
      const res = await fetch("/api/edit-requests/mine", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await apiRequest("POST", `/api/edit-requests/${id}/approve`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/edit-requests/pending"] });
      toast({ title: "Approved", description: "Edit permission granted for 2 hours." });
      setActionId(null);
      setNote("");
    },
    onError: () => toast({ title: "Error", description: "Could not approve request.", variant: "destructive" }),
  });

  const denyMutation = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await apiRequest("POST", `/api/edit-requests/${id}/deny`, { note });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/edit-requests/pending"] });
      toast({ title: "Denied", description: "Edit request has been denied." });
      setActionId(null);
      setNote("");
    },
    onError: () => toast({ title: "Error", description: "Could not deny request.", variant: "destructive" }),
  });

  const isMutating = approveMutation.isPending || denyMutation.isPending;

  function handleAction() {
    if (!actionId) return;
    if (actionType === "approve") {
      approveMutation.mutate({ id: actionId, note });
    } else {
      denyMutation.mutate({ id: actionId, note });
    }
  }

  const myPending = mineQuery.data?.filter(r => r.status === "pending") ?? [];
  const myApproved = mineQuery.data?.filter(r => r.status === "approved") ?? [];
  const myPast = mineQuery.data?.filter(r => ["denied", "used", "expired"].includes(r.status)) ?? [];

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Edit Requests</h1>
          <p className="text-sm text-muted-foreground">
            {canApprove
              ? "Review and approve edit requests from your team."
              : "Track your edit permission requests."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            pendingQuery.refetch();
            mineQuery.refetch();
          }}
          data-testid="btn-refresh-requests"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue={canApprove ? "pending" : "mine"}>
        <TabsList className="w-full">
          {canApprove && (
            <TabsTrigger value="pending" className="flex-1" data-testid="tab-pending-requests">
              Pending
              {(pendingQuery.data?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 text-white text-xs px-1.5">
                  {pendingQuery.data!.length}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="mine" className="flex-1" data-testid="tab-my-requests">
            My Requests
          </TabsTrigger>
        </TabsList>

        {canApprove && (
          <TabsContent value="pending" className="space-y-3 pt-4">
            {pendingQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-lg" />)
            ) : !pendingQuery.data?.length ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Inbox className="h-10 w-10 opacity-40" />
                <p className="text-sm">No pending edit requests</p>
              </div>
            ) : (
              pendingQuery.data.map(r => (
                <RequestCard
                  key={r.id}
                  req={r}
                  showActions
                  onApprove={(id) => { setActionId(id); setActionType("approve"); setNote(""); }}
                  onDeny={(id) => { setActionId(id); setActionType("deny"); setNote(""); }}
                />
              ))
            )}
          </TabsContent>
        )}

        <TabsContent value="mine" className="space-y-4 pt-4">
          {mineQuery.isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)
          ) : (
            <>
              {myApproved.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Active Edit Windows</p>
                  {myApproved.map(r => (
                    <RequestCard key={r.id} req={r} showActions={false} />
                  ))}
                </div>
              )}
              {myPending.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Waiting for Approval</p>
                  {myPending.map(r => (
                    <RequestCard key={r.id} req={r} showActions={false} />
                  ))}
                </div>
              )}
              {myPast.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Past Requests</p>
                  {myPast.map(r => (
                    <RequestCard key={r.id} req={r} showActions={false} />
                  ))}
                </div>
              )}
              {!mineQuery.data?.length && (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Inbox className="h-10 w-10 opacity-40" />
                  <p className="text-sm">No edit requests yet</p>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={actionId !== null} onOpenChange={(o) => { if (!o) setActionId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve Edit Request" : "Deny Edit Request"}
            </DialogTitle>
            <DialogDescription>
              {actionType === "approve"
                ? "The user will get a 2-hour window to make one edit."
                : "The user will be notified that their request was denied."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="approver-note">Note (optional)</Label>
            <Textarea
              id="approver-note"
              placeholder={actionType === "approve" ? "Any instructions for the editor…" : "Reason for denial…"}
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              data-testid="input-approver-note"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionId(null)} disabled={isMutating}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={isMutating}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              variant={actionType === "deny" ? "destructive" : "default"}
              data-testid={`btn-confirm-${actionType}`}
            >
              {isMutating ? "Processing…" : actionType === "approve" ? "Approve" : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
