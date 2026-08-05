/**
 * Instruction 031 Part F — out-of-programme chainage reason modal, shared by
 * BOTH DPR screens (Detailed/SiteEntry and Guided). Replaces the small inline
 * reason field. Opens when the entered range falls outside the linked bar's
 * planned range; shows planned vs entered plainly; requires a reason to
 * continue. "Correct chainage" closes without a reason so the user can fix the
 * range instead. Valid sub-ranges fully inside the bar never trigger this.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { formatChainageKm } from "@shared/barSide";

export function OutOfRangeChainageModal({
  open,
  onOpenChange,
  plannedFromKm,
  plannedToKm,
  enteredFromKm,
  enteredToKm,
  initialReason,
  onContinue,
  onCorrect,
  testidPrefix,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plannedFromKm: number | null;
  plannedToKm: number | null;
  enteredFromKm: number | null;
  enteredToKm: number | null;
  initialReason: string;
  /** Called with the (non-empty) reason when the user continues. */
  onContinue: (reason: string) => void;
  /** Called when the user chooses to go back and fix the chainage instead. */
  onCorrect: () => void;
  testidPrefix: string;
}) {
  const [reason, setReason] = useState(initialReason);
  useEffect(() => { if (open) setReason(initialReason); }, [open, initialReason]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={`${testidPrefix}-out-of-range-modal`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Outside planned reach
          </DialogTitle>
          <DialogDescription>
            The chainage you entered falls outside the planned range of the linked programme reach.
            This entry will be saved as <b>“Outside planned reach — review required”</b> and will not
            count toward the reach's completed quantity until reviewed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Planned range</p>
            <p className="font-semibold" data-testid={`${testidPrefix}-planned-range`}>
              {plannedFromKm != null ? formatChainageKm(plannedFromKm) : "?"} – {plannedToKm != null ? formatChainageKm(plannedToKm) : "?"}
            </p>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5">
            <p className="text-xs text-muted-foreground mb-0.5">Entered range</p>
            <p className="font-semibold text-amber-700 dark:text-amber-400" data-testid={`${testidPrefix}-entered-range`}>
              {enteredFromKm != null ? formatChainageKm(enteredFromKm) : "?"} – {enteredToKm != null ? formatChainageKm(enteredToKm) : "?"}
            </p>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-1">Reason for working outside the planned reach <span className="text-red-500">*</span></p>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. programme revision pending, continuation of previous stretch, client instruction…"
            data-testid={`${testidPrefix}-input-out-of-range-reason`}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onCorrect(); onOpenChange(false); }} data-testid={`${testidPrefix}-button-correct-chainage`}>
            Correct chainage
          </Button>
          <Button
            disabled={!reason.trim()}
            onClick={() => { onContinue(reason.trim()); onOpenChange(false); }}
            data-testid={`${testidPrefix}-button-continue-with-reason`}
          >
            Continue with reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
