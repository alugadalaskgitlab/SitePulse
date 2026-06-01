import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  ClipboardList, ChevronLeft, PackageCheck, ListTodo, CheckCircle2,
  AlertCircle, AlertTriangle, User, Calendar, FileText, Info,
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

function StatusBadge({ status }: { status: string }) {
  if (status === "pending_stores")
    return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs">Pending Stores Check</Badge>;
  if (status === "stores_verified")
    return <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs">Stores Verified</Badge>;
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

export default function IrnDetailPage({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const { sectionCan } = useAuth();
  const { toast } = useToast();
  const canVerify = sectionCan("stores_inventory", "create");

  const { data: irn, isLoading } = useQuery<InternalRequisitionWithItems>({
    queryKey: ["/api/irn", id],
    queryFn: async () => {
      const res = await fetch(`/api/irn/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("IRN not found");
      return res.json();
    },
  });

  const [verifications, setVerifications] = useState<ItemVerification[]>([]);
  const [storesRemarks, setStoresRemarks] = useState("");
  const [verified, setVerified] = useState(false);

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
        if (field === "issueQty") { updated.procureQty = Math.max(0, reqQty - Number(value)); }
        if (field === "procureQty") { updated.issueQty = Math.max(0, reqQty - Number(value)); }
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

  // Confirmed state after submitting
  if (verified || (isStoresVerified && irn.storesVerifiedBy)) {
    const iv = irn.status === "stores_verified" ? irn : null;
    const displayIssue = iv ? irn.items.filter((i) => i.issueQty && i.issueQty > 0).length : issueCount;
    const displayProcure = iv ? irn.items.filter((i) => i.procureQty && i.procureQty > 0).length : procureCount;

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

        <div className="max-w-3xl mx-auto px-6 py-5">
          {/* Meta */}
          <div className="bg-white border rounded-lg p-4 mb-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2"><User className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-400">Raised by</p><p className="font-medium text-gray-800 text-xs">{irn.raisedBy}</p></div></div>
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-400">Section</p><p className="font-medium text-gray-800 text-xs">{irn.raisedFrom}</p></div></div>
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-gray-400" /><div><p className="text-xs text-gray-400">Date</p><p className="font-medium text-gray-800 text-xs">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div></div>
            </div>
          </div>

          {/* Verification summary card */}
          <div className="bg-white border rounded-xl p-6 text-center space-y-4">
            <div className="p-4 bg-green-100 rounded-full w-fit mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Stores Verification Complete</h2>
            <p className="text-sm text-gray-500">
              Verified by <strong>{irn.storesVerifiedBy ?? "Stores"}</strong>
              {irn.storesVerifiedAt ? ` on ${format(new Date(irn.storesVerifiedAt), "dd MMM yyyy, h:mm a")}` : ""}
            </p>
            <div className="space-y-2 text-left max-w-sm mx-auto">
              {displayIssue > 0 && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded p-2.5 text-sm text-green-700">
                  <PackageCheck className="h-4 w-4 shrink-0" />
                  <span><strong>{displayIssue} item{displayIssue !== 1 ? "s" : ""}</strong> — Issue Voucher generated</span>
                </div>
              )}
              {displayProcure > 0 && (
                <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded p-2.5 text-sm text-purple-700">
                  <ListTodo className="h-4 w-4 shrink-0" />
                  <span><strong>{displayProcure} item{displayProcure !== 1 ? "s" : ""}</strong> — Added to Procurement Queue</span>
                </div>
              )}
            </div>
            {irn.storesRemarks && (
              <p className="text-xs text-gray-500 italic">Stores note: "{irn.storesRemarks}"</p>
            )}
            <Button variant="outline" onClick={() => navigate("/irn")} className="mt-2">← Back to IRN list</Button>
          </div>
        </div>
      </div>
    );
  }

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
              <div><p className="text-xs text-gray-400">Raised by</p><p className="font-medium text-gray-800 text-xs">{irn.raisedBy}</p></div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <FileText className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-xs text-gray-400">Section</p><p className="font-medium text-gray-800 text-xs">{irn.raisedFrom}</p></div>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
              <div><p className="text-xs text-gray-400">Date</p><p className="font-medium text-gray-800 text-xs">{irn.date ? format(new Date(irn.date), "dd MMM yyyy") : "—"}</p></div>
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
