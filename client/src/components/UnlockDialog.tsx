import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LockableResourceType } from "@shared/permissions";

const MIN_REASON_LEN = 10;

const RESOURCE_LABEL: Record<LockableResourceType, string> = {
  dpr: "Site DPR",
  plant_shift_log: "plant shift log",
  equipment_usage: "equipment usage entry",
  purchase_indent: "purchase indent",
  diesel_requirement: "diesel requirement",
  vendor_bill: "vendor bill",
};

// Query-key prefixes that are likely affected by an unlock so the UI re-reads
// the new lockStatus right away. Pages that fetch with custom keys should
// also invalidate themselves on the toast — but this covers the common ones.
const INVALIDATE_PREFIXES: Record<LockableResourceType, string[]> = {
  dpr: ["/api/dprs"],
  plant_shift_log: ["/api/plant-module/shift-logs", "/api/plant-shift-logs"],
  equipment_usage: ["/api/plant-module/equipment-usage"],
  purchase_indent: ["/api/purchase-indents"],
  diesel_requirement: ["/api/diesel-requirements"],
  vendor_bill: ["/api/vendor-bills"],
};

export type UnlockDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: LockableResourceType;
  resourceId: number;
  /** Called after a successful unlock so the page can refresh its data. */
  onUnlocked?: () => void;
};

export function UnlockDialog(props: UnlockDialogProps) {
  const { open, onOpenChange, resourceType, resourceId, onUnlocked } = props;
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/locks/unlock", {
        resourceType,
        resourceId,
        reason: reason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Record unlocked",
        description:
          "You can save one edit. The record will lock again automatically on the next save.",
      });
      // Invalidate everything related to this resource type so badges
      // & lists re-render with the new state.
      const prefixes = INVALIDATE_PREFIXES[resourceType] ?? [];
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          if (typeof k !== "string") return false;
          return prefixes.some((p) => k === p || k.startsWith(p));
        },
      });
      setReason("");
      onOpenChange(false);
      onUnlocked?.();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      let description = "Could not unlock the record. Please try again.";
      if (msg.includes("403") && msg.includes("unlock_not_allowed")) {
        description = "You don't have permission to unlock records.";
      } else if (msg.includes("403") && msg.includes("forbidden_section")) {
        description = "You don't have edit access for this section.";
      } else if (msg.includes("404")) {
        description = "Record not found — it may have been deleted.";
      }
      toast({ title: "Unlock failed", description, variant: "destructive" });
    },
  });

  const trimmed = reason.trim();
  const tooShort = trimmed.length < MIN_REASON_LEN;
  const remaining = Math.max(0, MIN_REASON_LEN - trimmed.length);

  return (
    <Dialog open={open} onOpenChange={(v) => !mutation.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Unlock {RESOURCE_LABEL[resourceType]}
          </DialogTitle>
          <DialogDescription>
            Enter a reason (at least {MIN_REASON_LEN} characters). The next save
            will automatically re-lock this record. Your reason is stored in
            the audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="unlock-reason">Reason for unlocking</Label>
          <Textarea
            id="unlock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Correcting a typo in the diesel reading after operator shift change."
            disabled={mutation.isPending}
            data-testid="input-unlock-reason"
          />
          <p
            className={`text-xs ${
              tooShort ? "text-destructive" : "text-muted-foreground"
            }`}
            data-testid="text-unlock-reason-hint"
          >
            {tooShort
              ? `Need ${remaining} more character${remaining === 1 ? "" : "s"}.`
              : `${trimmed.length} characters.`}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
            data-testid="button-cancel-unlock"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={tooShort || mutation.isPending}
            data-testid="button-confirm-unlock"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Unlocking…
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4 mr-2" />
                Unlock for one edit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
