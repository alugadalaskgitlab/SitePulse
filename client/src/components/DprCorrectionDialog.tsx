import { useState } from "react";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { correctionCanSubmit, correctionDisposition, correctionValue, groupCorrectionChanges, type DprCorrectionChange, type DprCorrectionReview } from "@/lib/dprCorrections";
import "./dpr-corrections.css";

export function CorrectionChanges({ changes, blocked = [] }: { changes: DprCorrectionChange[]; blocked?: DprCorrectionReview["blocked"] }) {
  const groups = groupCorrectionChanges(changes, blocked);
  const dispositionClass = (value: string) => value === "Blocked" ? "border-destructive text-destructive"
    : value === "Requires approval" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return <div className="dpr-correction-list">
    {groups.map(group => <details key={group.key} className="dpr-correction-group rounded-lg border bg-card" data-testid="correction-group">
      <summary>
        <span className="ml-1 text-sm font-semibold">{group.label}</span>
        <span className="ml-2 text-xs text-muted-foreground">{group.changes.length} change{group.changes.length === 1 ? "" : "s"} · {group.changes.filter(change => !change.derived).length} intentional · {group.changes.filter(change => change.derived).length} derived</span>
        <Badge variant="outline" className={`ml-2 ${dispositionClass(group.disposition)}`}>{group.disposition}</Badge>
        <span className="mt-1 block text-xs text-muted-foreground">{group.section} · Expand to review recorded and proposed facts</span>
      </summary>
      <div className="space-y-3 p-3">{group.changes.map((change, index) => <article key={`${change.field}-${index}`} className="rounded-lg border bg-card p-3" data-testid="correction-change">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{change.field}</h4>
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{change.derived ? "Automatically derived" : "Intentional change"}</Badge>
          <Badge variant="outline" className={dispositionClass(correctionDisposition(change, blocked))}>{correctionDisposition(change, blocked)}</Badge></div>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto_1fr]">
        <div><p className="mb-1 text-xs text-muted-foreground">Recorded value</p><div className="dpr-correction-value rounded bg-muted/50 p-2">{correctionValue(change.oldValue)}</div></div>
        <ArrowRight className="hidden h-4 w-4 self-center text-muted-foreground sm:block" />
        <div><p className="mb-1 text-xs text-muted-foreground">Proposed value</p><div className="dpr-correction-value rounded border p-2 font-medium">{correctionValue(change.newValue)}</div></div>
      </div>
    </article>)}</div></details>)}
  </div>;
}

export function CorrectionImpact({ impact }: { impact: string[] }) {
  return <aside className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <h4 className="mb-1 flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />Consequences & financial disposition</h4>
    {impact.length ? <ul className="list-disc space-y-1 pl-5">{impact.map((line, index) => <li key={index}>{line}</li>)}</ul>
      : <p>No additional impact reported by the server.</p>}
    <p className="mt-2 text-xs">Paid bills and completed accounting records are not silently rewritten. Any required adjustment is a separate reviewed action.</p>
  </aside>;
}

export function DprCorrectionDialog({ open, dprId, review, loading, saving, error, onClose, onRetry, onSubmit }: {
  open: boolean; dprId: number; review: DprCorrectionReview | null; loading: boolean; saving: boolean; error?: string;
  onClose: () => void; onRetry: () => void; onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!value && !saving) onClose(); }}>
    <DialogContent className="dpr-correction-dialog sm:max-w-3xl">
      <DialogHeader><DialogTitle>Review corrections · DPR #{dprId}</DialogTitle>
        <DialogDescription>{review ? `Revision ${review.revision}. ` : ""}Review the recorded and proposed facts before continuing. Closing this review keeps your edits.</DialogDescription>
      </DialogHeader>
      {loading ? <div aria-label="Reviewing corrections" className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-28 w-full" /></div> : <>
        {error && <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm"><p>{error}</p><p className="mt-1">Your entries have been retained. Review again for an updated baseline; no automatic retry or save occurs.</p><Button variant="outline" className="mt-2" onClick={() => { setConfirmed(false); onRetry(); }} disabled={saving}>Review again</Button></div>}
        {review && <>
          {review.blocked.map((block, index) => <div role="alert" key={index} className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />Blocked · {block.section} · {block.rowId == null ? "Report" : `Row #${block.rowId}`} · {block.field}</p>
            <p className="mt-1">{block.message}</p><p className="mt-1 text-xs">Return to the editor to resolve this restriction. No entered rows have been removed.</p>
          </div>)}
          <CorrectionChanges changes={review.changes} blocked={review.blocked} />
          {!review.changes.length && <div className="rounded-lg border border-dashed bg-muted/30 p-5 text-sm"><h3 className="font-semibold">No persisted changes to save</h3><p className="mt-1 text-muted-foreground">Unchanged values and form defaults do not create a correction.</p></div>}
          <CorrectionImpact impact={review.impact} />
          {review.requiresApproval && <p role="status" className="text-sm font-medium text-amber-800">This correction will await Administrator approval. The recorded DPR remains unchanged until approval; your entered edits stay in the editor.</p>}
          <div><Label htmlFor="dpr-correction-reason">Correction reason (required)</Label><Textarea id="dpr-correction-reason" value={reason} onChange={event => setReason(event.target.value)} disabled={saving} placeholder="Explain what was corrected and the register or evidence used." className="mt-2" required /></div>
          <div className="flex items-start gap-2"><Checkbox id="dpr-correction-confirm" checked={confirmed} disabled={saving} onCheckedChange={value => setConfirmed(value === true)} /><Label htmlFor="dpr-correction-confirm" className="text-sm leading-relaxed">I have reviewed every change and its consequences, including any separate financial adjustment.</Label></div>
        </>}
      </>}
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>Back to editing</Button><Button disabled={loading || saving || !!error || !correctionCanSubmit(review, reason, confirmed)} onClick={() => onSubmit(reason.trim())}>{saving ? "Submitting correction…" : review?.requiresApproval ? "Submit for approval" : "Confirm & save correction"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
