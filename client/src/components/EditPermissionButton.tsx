import { useState } from "react";
import { PencilLine, Clock, CheckCircle2, XCircle, Send, Loader2, Lock, Eye, X } from "lucide-react";
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
  /** Called when edit is granted. Second arg is a function to call after a successful save
   * to mark the one-time token as consumed. Calling it on click is the bug — always call it
   * in your mutation's onSuccess instead. */
  onEditGranted?: (requestId: number, consumeGrant?: () => void) => void;
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
  const [previewMode, setPreviewMode] = useState(false);
  const isAdminOrOwner = isAdmin || isOwner;

  const {
    currentStatus,
    hasActivePermission,
    activeRequest,
    isLoading,
    requestEditPermission,
    isRequesting,
    consumePermission,
  } = useEditPermission(recordType, recordId);

  // Admin/Owner not previewing: render a plain Edit button, plus a "Preview as
  // requester" toggle so they can see what non-admin users experience without
  // leaving their own session.
  if (isAdminOrOwner && !previewMode) {
    return (
      <div className="flex items-center gap-1">
        <Button
          size={size}
          className={className}
          onClick={() => onEditGranted?.(0)}
          data-testid="btn-admin-edit"
        >
          <PencilLine className="h-4 w-4 mr-1" />
          {label}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setPreviewMode(true)}
          title="Preview as requester"
          data-testid="btn-preview-as-requester"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // From here on, both real non-admin requesters AND admins in preview mode
  // render the exact same branches, driven by the same useEditPermission data
  // for this record. Admins previewing simply see their own (normally idle)
  // requester state — nothing is faked or simulated.
  const previewWrapper = (children: React.ReactNode) =>
    isAdminOrOwner ? (
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs text-muted-foreground border-dashed">
          Preview mode
        </Badge>
        {children}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setPreviewMode(false)}
          title="Exit preview"
          data-testid="btn-exit-preview"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    ) : (
      children
    );

  if (isLoading || !recordId) return isAdminOrOwner ? previewWrapper(null) : null;

  // Already has an active approved permission — let them start editing.
  // (Admins previewing can never actually reach this branch for a real record,
  // since the backend never grants them an approved request — see submit guard below.)
  if (hasActivePermission && activeRequest) {
    const expiresAt = activeRequest.expiresAt ? new Date(activeRequest.expiresAt) : null;
    const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000)) : 0;
    return previewWrapper(
      <Button
        size={size}
        variant="default"
        className={`bg-green-600 hover:bg-green-700 text-white ${className ?? ""}`}
        onClick={() => {
          if (isAdminOrOwner) return;
          // Do NOT consume the grant on click — call consumeGrant() in your
          // mutation's onSuccess so the token is only spent after a successful save.
          const consumeGrant = () => consumePermission(activeRequest.id);
          onConsumed?.();
          onEditGranted?.(activeRequest.id, consumeGrant);
        }}
        data-testid="btn-edit-permitted"
      >
        <CheckCircle2 className="h-4 w-4 mr-1" />
        {label} ({minutesLeft}m left)
      </Button>,
    );
  }

  // Pending request
  if (currentStatus === "pending") {
    return previewWrapper(
      <Button size={size} variant="outline" disabled className={className} data-testid="btn-edit-pending">
        <Clock className="h-4 w-4 mr-1 text-amber-500" />
        Waiting for Approval
      </Button>,
    );
  }

  // Denied
  if (currentStatus === "denied") {
    return previewWrapper(
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
      </div>,
    );
  }

  // Idle — show "Request Edit"
  return previewWrapper(
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
            <DialogTitle>Request Edit Permission{isAdminOrOwner ? " (Preview)" : ""}</DialogTitle>
            <DialogDescription>
              {isAdminOrOwner
                ? "This is a preview of what a non-admin user sees. Submission is disabled for admins so no real request is created."
                : "This record is finalized. Describe why you need to edit it. An admin will review and approve or deny your request."}
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
                if (isAdminOrOwner || !reason.trim()) return;
                requestEditPermission(reason.trim());
                setDialogOpen(false);
              }}
              disabled={isAdminOrOwner || !reason.trim() || isRequesting}
              title={isAdminOrOwner ? "Preview only — submission disabled for admins" : undefined}
              data-testid="btn-submit-edit-request"
            >
              {isRequesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {isAdminOrOwner ? "Submit Request (disabled in preview)" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>,
  );
}
