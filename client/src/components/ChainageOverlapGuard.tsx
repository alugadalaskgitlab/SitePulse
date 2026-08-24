/**
 * Batch 06B — chainage duplicate/overlap guard for DPR entry, shared by
 * Guided DPR, Detailed DPR (SiteEntry) and SiteEdit draft completion.
 *
 * - Overlap math is the SAME neutral shared helper the Progress Report and
 *   the server Final-Submit recheck use (shared/chainageOverlap.ts).
 * - The warning is ADVISORY ("Possible overlap", never "Duplicate"); it never
 *   deletes/merges/reduces anything. Draft save is never blocked.
 * - Final Submit requires a reason: the guard reuses the row's EXISTING
 *   chainageOverrideReason field (same field the outside-planned-reach
 *   override uses) — one reason satisfies both warnings and is never
 *   overwritten here.
 * - Referenced prior DPRs open READ-ONLY in a modal (DprPreviewDialog) over
 *   the live form: the form stays mounted, closing returns to it untouched.
 *
 * Batch 06V: reason is now a fixed pick-list so engineers can't leave a
 * cryptic free-text note. "Other" falls back to a free-text input.
 */
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { formatChainageKm } from "@shared/barSide";
import {
  findActionableChainageOverlaps,
  isChainageGuardRow,
  type CandidateChainageRow,
  type ChainageOverlapHit,
  type PriorChainageEntry,
} from "@shared/chainageOverlap";
import { DprPreviewDialog } from "@/components/DprPreviewDialog";
import {
  OVERLAP_REASON_OPTIONS, OTHER_VALUE, classifyReason, buildReason,
} from "@/lib/overlapReason";

// Re-export so existing callers that import from this module still work.
export { OVERLAP_REASON_OPTIONS, classifyReason, buildReason };

// ── Reason dialog ─────────────────────────────────────────────────────────────

function OverlapReasonDialog({
  open, onOpenChange, initialReason, onSave, testidPrefix,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  initialReason: string; onSave: (reason: string) => void; testidPrefix: string;
}) {
  const { pick: initPick, elaboration: initElab } = classifyReason(initialReason);
  const [pick, setPick] = useState(initPick);
  const [elaboration, setElaboration] = useState(initElab);

  // Re-sync whenever the dialog opens (in case the parent updated the reason)
  useEffect(() => {
    if (open) {
      const { pick: p, elaboration: e } = classifyReason(initialReason);
      setPick(p);
      setElaboration(e);
    }
  }, [open, initialReason]);

  const result = buildReason(pick, elaboration);
  const canSave = result.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testidPrefix}-overlap-reason-modal`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Reason for repeated chainage
          </DialogTitle>
          <DialogDescription>
            Part of this chainage already has recorded progress. Repeated work is allowed —
            another layer, another lift, rework, correction — but Final Submit needs the reason on record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-sm mb-1.5 block">Reason</Label>
            <Select value={pick} onValueChange={(v) => { setPick(v); if (v !== OTHER_VALUE) setElaboration(""); }}>
              <SelectTrigger data-testid={`${testidPrefix}-select-overlap-reason`}>
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {OVERLAP_REASON_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pick === OTHER_VALUE && (
            <div>
              <Label className="text-sm mb-1.5 block">Describe the reason</Label>
              <Input
                value={elaboration}
                onChange={(e) => setElaboration(e.target.value)}
                placeholder='e.g. "Second WMM layer", "Embankment lift 3", "Rework after rain damage"'
                data-testid={`${testidPrefix}-input-overlap-reason`}
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid={`${testidPrefix}-button-overlap-cancel`}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => { onSave(result); onOpenChange(false); }}
            data-testid={`${testidPrefix}-button-overlap-save`}
          >
            Save reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Fetch prior valid submitted chainage progress for the given BOQ items. */
export function useChainageOverlapContext(boqItemIds: number[], excludeDprId?: number | null) {
  const ids = Array.from(new Set(boqItemIds.filter((n) => Number.isFinite(n) && n > 0))).sort((a, b) => a - b);
  const key = ids.join(",");
  const query = useQuery<{ entries: (PriorChainageEntry & { activity?: string | null; chainageFrom?: string | null; chainageTo?: string | null })[] }>({
    queryKey: ["/api/dprs/chainage-overlap-context", key, excludeDprId ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ boqItemIds: key });
      if (excludeDprId != null) params.set("excludeDprId", String(excludeDprId));
      const res = await fetch(`/api/dprs/chainage-overlap-context?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load overlap context");
      return res.json();
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  return { priors: query.data?.entries ?? [], isLoading: query.isLoading };
}

/** Compute per-row overlap hits (same-DPR + prior-DPR) for the whole form. */
export function useChainageOverlapHits(
  rows: CandidateChainageRow[],
  priors: PriorChainageEntry[],
  exemptRowKeys?: ReadonlySet<string | number>,
): Map<string | number, ChainageOverlapHit[]> {
  const exemptKey = JSON.stringify(Array.from(exemptRowKeys ?? []).map(String).sort());
  return useMemo(() => findActionableChainageOverlaps(
    rows,
    priors,
    { exemptRowKeys },
  ), [
    // cheap stable dependency: serialize the guard-relevant fields only
    JSON.stringify(rows.filter(isChainageGuardRow).map((r) => [
      r.rowKey, r.boqItemId, r.side ?? null, r.fromKm, r.toKm, r.layerNo ?? null,
    ])),
    priors,
    exemptKey,
  ]);
}

/**
 * Per-row advisory warning. Renders nothing when the row has no hits.
 * Reuses the row's chainageOverrideReason (never overwrites an existing one —
 * the edit dialog always starts from the current value).
 */
export function ChainageOverlapWarning({
  hits, overrideReason, onOverrideReason, testidPrefix,
}: {
  hits: ChainageOverlapHit[];
  overrideReason: string;
  onOverrideReason: (v: string) => void;
  testidPrefix: string;
}) {
  const [reasonOpen, setReasonOpen] = useState(false);
  const [previewDprId, setPreviewDprId] = useState<number | null>(null);
  const [previewEntryId, setPreviewEntryId] = useState<number | null>(null);
  if (hits.length === 0) return null;
  const exact = hits.some((h) => h.kind === "exact");
  const hasReason = overrideReason.trim() !== "";
  return (
    <div
      className={`rounded-md border px-2.5 py-2 text-xs space-y-1.5 ${exact ? "border-orange-400 bg-orange-50 dark:bg-orange-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"}`}
      data-testid={`${testidPrefix}-overlap-warning`}
    >
      <p className={`font-semibold flex items-center gap-1.5 ${exact ? "text-orange-700 dark:text-orange-400" : "text-amber-700 dark:text-amber-400"}`}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {exact
          ? "Progress has already been recorded for this exact chainage."
          : "Part of this chainage overlaps previously recorded progress."}
      </p>
      <ul className="space-y-1">
        {hits.map((h, i) => (
          <li key={i} className="text-slate-700 dark:text-slate-300" data-testid={`${testidPrefix}-overlap-hit-${i}`}>
            {h.source === "same_dpr" ? (
              <>Possible overlap with another row in this DPR: {h.withSide ?? "—"} Ch. {formatChainageKm(h.segmentFromKm)}–{formatChainageKm(h.segmentToKm)}</>
            ) : (
              <>
                Possible overlap with{" "}
                <button
                  type="button"
                  className="underline font-medium text-blue-700 dark:text-blue-400"
                  onClick={() => { setPreviewDprId(h.withDprId); setPreviewEntryId(h.withEntryId); }}
                  data-testid={`${testidPrefix}-overlap-dpr-link-${i}`}
                >
                  DPR-{h.withDprId}
                </button>{" "}
                ({h.withDprDate ?? "?"}) {h.withSide ?? "—"} Ch. {formatChainageKm(h.withFromKm ?? h.segmentFromKm)}–{formatChainageKm(h.withToKm ?? h.segmentToKm)}
                {h.withQuantity != null ? ` — ${h.withQuantity} ${h.withUom ?? ""}` : ""}
                {h.kind === "partial" ? <> · overlapping segment {formatChainageKm(h.segmentFromKm)}–{formatChainageKm(h.segmentToKm)}</> : null}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-slate-600 dark:text-slate-400">
        Legitimate reasons include another layer, another lift, rework, correction or a repeated operation.
      </p>
      {hasReason ? (
        <p className="text-emerald-700 dark:text-emerald-400" data-testid={`${testidPrefix}-overlap-reason-ok`}>
          Reason on record (also covers any outside-planned-reach warning): <span className="font-medium">{overrideReason}</span>
        </p>
      ) : (
        <p className="text-slate-600 dark:text-slate-400" data-testid={`${testidPrefix}-overlap-reason-needed`}>
          A reason is required before Final Submit (draft save is not blocked).
        </p>
      )}
      <Button
        type="button" size="sm" variant="outline" className="h-7 text-xs"
        onClick={() => setReasonOpen(true)}
        data-testid={`${testidPrefix}-button-overlap-reason`}
      >
        {hasReason ? "Edit reason" : "Give reason"}
      </Button>
      <OverlapReasonDialog
        open={reasonOpen}
        onOpenChange={setReasonOpen}
        initialReason={overrideReason}
        onSave={onOverrideReason}
        testidPrefix={testidPrefix}
      />
      <DprPreviewDialog
        dprId={previewDprId}
        highlightEntryId={previewEntryId}
        onClose={() => { setPreviewDprId(null); setPreviewEntryId(null); }}
      />
    </div>
  );
}
