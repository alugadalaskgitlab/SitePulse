import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { refreshDprDerivedQueries } from "@/lib/dprQueryInvalidation";
import { resolveReturnTo, withDprFocus, DPR_REGISTER_PATH } from "@/lib/progressReportNav";
import { DprSectionsSubmitIssues, type DprSubmitIssue, type DprSubmitIssueAction } from "@/components/DprSectionsSubmitIssues";
import type { DraftReadiness } from "@shared/dprDraftReadiness";

type DraftSnapshot = {
  dpr: any;
  sectionTokens: Record<string, string>;
  headerToken: string;
  draftReadiness?: DraftReadiness;
  chainageOverlapIssues?: DprSubmitIssue[];
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Could not load the saved draft.");
  return data;
}

export function draftReviewSummary(dpr: any) {
  const progress = Array.isArray(dpr?.progress) ? dpr.progress : [];
  const equipment = Array.isArray(dpr?.equipment) ? dpr.equipment : [];
  const labour = Array.isArray(dpr?.labour) ? dpr.labour : [];
  return {
    date: String(dpr?.date ?? "").slice(0, 10),
    activities: progress.map((row: any) => ({
      label: row.activity || (row.noSiteWork ? row.noSiteWorkDescription || "No site work" : "Activity"),
      from: row.chainageFrom || "—",
      to: row.chainageTo || "—",
      quantity: row.quantity == null ? "—" : `${row.quantity}${row.uom ? ` ${row.uom}` : ""}`,
    })),
    equipmentCount: equipment.length,
    labourCount: labour.reduce((sum: number, row: any) => sum + (Number(row.count) || 0), 0),
    dieselLitres: equipment.reduce((sum: number, row: any) => sum + (Number(row.diesel) || 0), 0),
  };
}

export function DprDraftSubmitDialog({
  dprId, returnTo = DPR_REGISTER_PATH, label = "Submit", variant = "default", size = "sm", className,
}: {
  dprId: number;
  returnTo?: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snapshot, setSnapshot] = useState<DraftSnapshot | null>(null);
  const [error, setError] = useState("");
  const [submitIssues, setSubmitIssues] = useState<DprSubmitIssue[]>([]);
  const safeReturnTo = resolveReturnTo(`returnTo=${encodeURIComponent(returnTo)}`, DPR_REGISTER_PATH);
  const readiness = snapshot?.draftReadiness;
  const summary = snapshot ? draftReviewSummary(snapshot.dpr) : null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSubmitIssues([]);
    setSnapshot(null);
    void getJson<DraftSnapshot>(`/api/dpr-sections/${dprId}`)
      .then((result) => { if (!cancelled) setSnapshot(result); })
      .catch((failure) => { if (!cancelled) setError(failure.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, dprId]);

  const openSections = (issue?: DprSubmitIssue, action?: DprSubmitIssueAction) => {
    setOpen(false);
    const params = new URLSearchParams({ returnTo: safeReturnTo });
    if (issue?.rowKey != null) params.set("issueRow", String(issue.rowKey));
    if (action) params.set("issueAction", action);
    setLocation(`/site/edit/${dprId}?${params}`);
  };

  const submit = async () => {
    if (!snapshot) return;
    setSubmitting(true);
    setError("");
    setSubmitIssues([]);
    try {
      const response = await fetch(`/api/dpr-sections/${dprId}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionTokens: snapshot.sectionTokens,
          headerToken: snapshot.headerToken,
          clientTimestamp: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (Array.isArray(data.mandatory)) setSubmitIssues(data.mandatory);
        setError(data.message ?? "Could not submit this DPR.");
        if (response.status === 422) {
          const refreshed = await getJson<DraftSnapshot>(`/api/dpr-sections/${dprId}`);
          setSnapshot(refreshed);
        }
        return;
      }
      await refreshDprDerivedQueries(queryClient);
      toast({ title: `DPR #${dprId} submitted` });
      setOpen(false);
      setLocation(withDprFocus(safeReturnTo, dprId));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not submit this DPR.");
    } finally {
      setSubmitting(false);
    }
  };

  const currentIssues = submitIssues.length
    ? submitIssues
    : snapshot?.chainageOverlapIssues ?? [];
  const ready = readiness?.state === "ready";
  const issueAction = (issue: DprSubmitIssue, action: DprSubmitIssueAction) => openSections(issue, action);
  const issueKey = (issue: DprSubmitIssue) => `${issue.section}:${issue.rowKey ?? issue.rowIndex ?? ""}:${issue.message}`;
  const visibleIssueKeys = new Set(currentIssues.map(issueKey));

  return <>
    <Button type="button" size={size} variant={variant} className={className} onClick={() => setOpen(true)} data-testid={`button-submit-draft-${dprId}`}>
      {label}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid={`draft-submit-review-${dprId}`}>
        <DialogHeader>
          <DialogTitle>Review DPR #{dprId}</DialogTitle>
          <DialogDescription>Review the saved sections. They will not be saved again before submission.</DialogDescription>
        </DialogHeader>
        {loading && <p role="status">Loading saved DPR…</p>}
        {error && !submitIssues.length && <p role="alert">{error}</p>}
        {summary && <>
          <div className="space-y-2 text-sm">
            <p><strong>Date:</strong> {summary.date}</p>
            <div>
              <strong>Items</strong>
              {summary.activities.length
                ? <ul className="mt-1 list-disc pl-5">{summary.activities.map((row: any, index: number) =>
                  <li key={index}>{row.label} · {row.from} → {row.to} · {row.quantity}</li>)}</ul>
                : <p className="text-muted-foreground">No activity rows saved.</p>}
            </div>
            <p><strong>Equipment count:</strong> {summary.equipmentCount}</p>
            <p><strong>Labour count:</strong> {summary.labourCount}</p>
            <p><strong>Diesel:</strong> {summary.dieselLitres.toLocaleString("en-IN")} L</p>
          </div>
          {currentIssues.length > 0 && <DprSectionsSubmitIssues issues={currentIssues} onAction={issueAction} />}
          {readiness && readiness.mandatory.some(issue => !visibleIssueKeys.has(issueKey(issue))) && (
            <div role="status" className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
              {readiness.mandatory.filter(issue => !visibleIssueKeys.has(issueKey(issue))).map((issue, index) =>
                <p key={`${issue.section}-${issue.rowKey ?? issue.rowIndex ?? index}`}>{issue.label}: {issue.message}</p>)}
            </div>
          )}
          {readiness?.state === "unavailable" && <p role="alert">Submission readiness is unavailable. Open the sections and resolve this before submitting.</p>}
        </>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button type="button" variant="outline" onClick={() => openSections()}>Open sections</Button>
          <Button type="button" onClick={() => void submit()} disabled={!snapshot || !ready || loading || submitting} data-testid={`button-confirm-submit-draft-${dprId}`}>
            {submitting ? "Submitting…" : "Submit DPR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
