import { useState } from "react";
import { Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CorrectionChanges, CorrectionImpact } from "@/components/DprCorrectionDialog";
import { canReviewCorrection, correctionErrorMessage, type DprCorrectionRequest } from "@/lib/dprCorrections";

function CorrectionRequest({ request, canApprove, userId, busy, onDecide }: {
  request: DprCorrectionRequest; canApprove: boolean; userId?: number; busy: boolean;
  onDecide: (requestId: number, approve: boolean, reason: string) => Promise<unknown>;
  onWithdraw?: (requestId: number) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const allowed = canReviewCorrection(canApprove, userId, request);
  const decide = async (approve: boolean) => {
    setError("");
    try { await onDecide(request.id, approve, reason.trim()); setReason(""); setConfirmed(false); }
    catch (failure) { setError(correctionErrorMessage(failure)); }
  };
  const withdraw = async () => {
    setError("");
    try { if (onWithdraw) await onWithdraw(Number(request.id)); }
    catch (failure) { setError(correctionErrorMessage(failure)); }
  };
  return <article className="rounded-lg border bg-card p-4" data-testid={`correction-request-${request.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Correction #{request.id} · {request.requestedByName}</h3>
      <Badge variant="outline" className={request.status === "pending" ? "border-amber-300 bg-amber-50 text-amber-900" : ""}>{request.status === "pending" ? "Awaiting approval" : request.status === "used" ? "Applied" : request.status === "owner_corrected" ? "Corrected by Owner" : request.status}</Badge>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString()}</p>
    <p className="my-3 text-sm"><strong>Reason:</strong> {request.requestReason}</p>
    {request.approverName && <p className="my-2 text-sm">Reviewed by {request.approverName}{request.usedAt ? ` · ${new Date(request.usedAt).toLocaleString()}` : ""}{request.approverNote ? ` — ${request.approverNote}` : ""}</p>}
    {error && <p role="alert" className="my-2 text-sm text-destructive">{error}</p>}
    <details open={request.status === "pending" || request.status === "owner_corrected"}><summary className="mb-3 cursor-pointer text-sm font-medium">Field changes & consequences ({request.changes.length})</summary>
      <div className="space-y-3"><CorrectionChanges changes={request.changes} ownerDirect={request.status === "owner_corrected"} /><CorrectionImpact impact={request.impact} /></div>
    </details>
    {request.status === "pending" && Number(userId) === Number(request.requestedBy) && <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className="text-sm text-amber-800">You requested this correction. Another authorized reviewer must review it; self-approval is not permitted.</p>
      {onWithdraw && <Button variant="outline" size="sm" disabled={busy} onClick={() => void withdraw()}>Withdraw request</Button>}
    </div>}
    {allowed && <div className="mt-4 space-y-3 border-t pt-4">
      <Label htmlFor={`review-reason-${request.id}`}>Approval decision reason (required)</Label>
      <Textarea id={`review-reason-${request.id}`} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} placeholder="Record the evidence reviewed and the reason for your decision." />
      <div className="flex items-start gap-2"><Checkbox id={`review-confirm-${request.id}`} checked={confirmed} onCheckedChange={value => setConfirmed(value === true)} disabled={busy} /><Label htmlFor={`review-confirm-${request.id}`} className="text-sm leading-relaxed">I confirm I have reviewed the old/new facts and all listed consequences before making this decision.</Label></div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void decide(true)} disabled={busy || !reason.trim() || !confirmed}>Approve correction</Button><Button variant="destructive" onClick={() => void decide(false)} disabled={busy || !reason.trim() || !confirmed}>Deny correction</Button></div>
    </div>}
  </article>;
}

export function DprCorrectionHistory({ requests, loading, error, canApprove, userId, busy, onRetry, onDecide }: {
  requests: DprCorrectionRequest[]; loading: boolean; error?: string; canApprove: boolean; userId?: number; busy: boolean;
  onRetry: () => void; onDecide: (requestId: number, approve: boolean, reason: string) => Promise<unknown>;
  onWithdraw?: (requestId: number) => Promise<unknown>;
}) {
  return <section className="space-y-3" aria-label="DPR corrections and approval history">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5" />Corrections & approval history</h2>
    {loading ? <Skeleton className="h-28 w-full" /> : error ? <div role="alert" className="rounded-lg border p-4 text-sm"><p>Could not load correction history: {error}</p><Button className="mt-2" variant="outline" onClick={onRetry}>Retry history</Button></div> : requests.length ? requests.map(request => <CorrectionRequest key={request.id} request={request} canApprove={canApprove} userId={userId} busy={busy} onDecide={onDecide} onWithdraw={onWithdraw} />) : <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-4"><Clock className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm font-medium">No correction requests yet</p><p className="text-xs text-muted-foreground">Corrections, reasons and approval decisions appear here after submission.</p></div></div>}
  </section>;
}
