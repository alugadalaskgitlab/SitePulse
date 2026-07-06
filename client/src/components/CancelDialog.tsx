import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** API path to POST the cancellation to, e.g. `/api/dprs/5/cancel` */
  cancelUrl: string;
  /** Human-readable label for the record being cancelled, e.g. "DPR for Site A (2026-07-01)" */
  recordLabel: string;
  /** Query keys to invalidate after a successful cancel */
  invalidateQueryKeys: (string | (string | number)[])[];
  onCancelled?: () => void;
}

export default function CancelDialog({
  open,
  onOpenChange,
  cancelUrl,
  recordLabel,
  invalidateQueryKeys,
  onCancelled,
}: CancelDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", cancelUrl, { reason: reason.trim() });
    },
    onSuccess: () => {
      invalidateQueryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
      });
      toast({ title: "Cancelled", description: `${recordLabel} has been cancelled.` });
      setReason("");
      onOpenChange(false);
      onCancelled?.();
    },
    onError: (err: any) => {
      toast({ title: "Cancellation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleOpenChange = (v: boolean) => {
    if (!v) setReason("");
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel record</DialogTitle>
          <DialogDescription>
            You're about to cancel <strong>{recordLabel}</strong>. This keeps the record for audit purposes
            but excludes it from reports and totals. This action is logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="cancel-reason">Reason for cancellation *</Label>
          <Textarea
            id="cancel-reason"
            data-testid="input-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Duplicate entry, wrong site, superseded by corrected record..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-dismiss-cancel-dialog"
          >
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || reason.trim().length === 0}
            data-testid="button-confirm-cancel"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
