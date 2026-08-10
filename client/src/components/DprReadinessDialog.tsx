/**
 * Batch 04 — consolidated Submit Readiness panel, shared by Guided DPR,
 * Detailed DPR (SiteEntry) and SiteEdit draft completion.
 *
 * One dialog instead of N toasts:
 *  - MANDATORY issues block Final Submit ("Go back and complete").
 *  - Advisories never block — "Submit anyway" is offered when there are no
 *    mandatory issues (same rule the server enforces).
 */
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { DprReadinessResult } from "@shared/dprSubmitReadiness";

const SECTION_LABELS: Record<string, string> = {
  activities: "Activities",
  equipment: "Equipment",
  labour: "Labour",
  materials: "Materials",
};

export function DprReadinessDialog({
  readiness,
  onClose,
  onSubmitAnyway,
  onSaveDraft,
}: {
  readiness: DprReadinessResult | null;
  onClose: () => void;
  /** called for advisory-only results when the engineer confirms */
  onSubmitAnyway: () => void;
  /** optional Save Draft shortcut (drafts are always allowed) */
  onSaveDraft?: () => void;
}) {
  const hasMandatory = (readiness?.mandatory.length ?? 0) > 0;
  return (
    <Dialog open={!!readiness} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-dpr-readiness">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${hasMandatory ? "text-destructive" : "text-amber-700"}`}>
            <AlertTriangle className="w-5 h-5" />
            {hasMandatory ? "DPR is not ready to submit" : "Please confirm before submitting"}
          </DialogTitle>
          <DialogDescription>
            {hasMandatory
              ? "Complete the items below (or save as a draft and finish later)."
              : "Nothing blocks submission, but please check these advisories."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm max-h-[50vh] overflow-y-auto">
          {hasMandatory && (
            <div>
              <p className="font-semibold text-destructive mb-1">Must be completed</p>
              <ul className="space-y-1" data-testid="list-readiness-mandatory">
                {readiness!.mandatory.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                    <span><span className="font-medium">{SECTION_LABELS[m.section] ?? m.section} · {m.label}</span> — {m.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(readiness?.advisories.length ?? 0) > 0 && (
            <div>
              <p className="font-semibold text-amber-700 mb-1">Advisories (do not block)</p>
              <ul className="space-y-1" data-testid="list-readiness-advisories">
                {readiness!.advisories.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <Info className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                    <span>{a.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          {onSaveDraft && (
            <Button variant="outline" onClick={() => { onClose(); onSaveDraft(); }} data-testid="button-readiness-save-draft">
              Save Draft
            </Button>
          )}
          <Button variant={hasMandatory ? "default" : "outline"} onClick={onClose} data-testid="button-readiness-back">
            Go back and complete
          </Button>
          {!hasMandatory && (
            <Button onClick={() => { onClose(); onSubmitAnyway(); }} data-testid="button-readiness-submit-anyway">
              Submit anyway
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
