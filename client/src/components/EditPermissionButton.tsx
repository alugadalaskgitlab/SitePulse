import { useState } from "react";
import { PencilLine, Clock, CheckCircle2, XCircle, Send, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useEditPermission } from "@/hooks/useEditPermission";
import type { EditPermissionRecordType } from "@shared/schema";

interface EditPermissionButtonProps {
  recordType: EditPermissionRecordType;
  recordId: number | undefined;
  onEditGranted?: (requestId: number) => void;
  onConsumed?: () => void;
  label?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
}

export function EditPermissionButton({
  recordType,
  recordId,
  onEditGranted,
  onConsumed,
  label = "Edit",
  className,
  size = "sm",
}: EditPermissionButtonProps) {
  const { isAdmin, isOwner } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");

  const {
    currentStatus,
    hasActivePermission,
    activeRequest,
    isLoading,
    requestEditPermission,
    isRequesting,
    consumePermission,
  } = useEditPermission(recordType, recordId);

  // Admin/Owner: render a plain Edit button (no request flow needed)
  if (isAdmin || isOwner) {
    return (
      <Button
        size={size}
        className={className}
        onClick={() => onEditGranted?.(0)}
        data-testid="btn-admin-edit"
      >
        <PencilLine className="h-4 w-4 mr-1" />
        {label}
      </Button>
    );
  }

  if (isLoading || !recordId) return null;

  // Already has an active approved permission — let them start editing
  if (hasActivePermission && activeRequest) {
    const expiresAt = activeRequest.expiresAt ? new Date(activeRequest.expiresAt) : null;
    const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : 0;
    return (
      <Button
        size={size}
        variant="default"
        className={`bg-green-600 hover:bg-green-700 text-white ${className ?? ""}`}
        onClick={() => {
          consumePermission(activeRequest.id);
          onConsumed?.();
          onEditGranted?.(activeRequest.id);
        }}
        data-testid="btn-edit-permitted"
      >
        <CheckCircle2 className="h-4 w-4 mr-1" />
        {label} ({minutesLeft}m left)
      </Button>
    );
  }

  // Pending request
  if (currentStatus === "pending") {
    return (
      <Button size={size} variant="outline" disabled className={className} data-testid="btn-edit-pending">
        <Clock className="h-4 w-4 mr-1 text-amber-500" />
        Waiting for Approval
      </Button>
    );
  }

  // Denied
  if (currentStatus === "denied") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">Request Denied</Badge>
        <Button
          size={size}
          variant="outline"
          className={className}
          onClick={() => { setReason(""); setDialogOpen(true); }}
          data-testid="btn-edit-request-again"
        >
          <Send className="h-4 w-4 mr-1" />
          Request Again
        </Button>
      </div>
    );
  }

  // Idle — show "Request Edit"
  return (
    <>
      <Button
        size={size}
        variant="outline"
        className={className}
        onClick={() => { setReason(""); setDialogOpen(true); }}
        data-testid="btn-request-edit"
      >
        <Lock className="h-4 w-4 mr-1 text-muted-foreground" />
        Request Edit
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Edit Permission</DialogTitle>
            <DialogDescription>
              This record is finalized. Describe why you need to edit it. An admin will review and approve or deny your request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="edit-reason">Reason for edit</Label>
            <Textarea
              id="edit-reason"
              placeholder="e.g. Entered wrong equipment hours, need to correct fuel consumption figure…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              data-testid="input-edit-reason"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isRequesting}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reason.trim()) return;
                requestEditPermission(reason.trim());
                setDialogOpen(false);
              }}
              disabled={!reason.trim() || isRequesting}
              data-testid="btn-submit-edit-request"
            >
              {isRequesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
