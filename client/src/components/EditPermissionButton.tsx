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
import { EDIT_RECORD_TYPE_SECTION } from "@shared/permissions";

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
  const { isAdmin, isOwner, sectionCan } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const isAdminOrOwner = isAdmin || isOwner;
  // Permission Panel: users granted "edit" on the section governing this
  // record type edit directly — same as admins — instead of requesting.
  const mappedSection = EDIT_RECORD_TYPE_SECTION[recordType];
  const canEditDirect = isAdminOrOwner || (!!mappedSection && sectionCan(mappedSection, "edit"));

  const {
    currentStatus,
    hasActivePermission,
    activeRequest,
    isLoading,
    requestEditPermission,
    isRequesting,
    consumePermission,
  } = useEditPermission(recordType, recordId);

  // Direct editors (admin/owner or Permission Panel edit right) not previewing:
  // render a plain Edit button, plus a "Preview as requester" toggle so they
  // can see what request-flow users experience without leaving their session.
  if (canEditDirect && !previewMode) {
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

  // From here on, both real request-flow users AND direct editors in preview
  // mode render the exact same branches, driven by the same useEditPermission
  // data for this record. Direct editors previewing simply see their own
  // (normally idle) requester state — nothing is faked or simulated.
  const previewWrapper = (children: React.ReactNode) =>
    canEditDirect ? (
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

  if (isLoading || !recordId) return canEditDirect ? previewWrapper(null) : null;

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
          if (canEditDirect) return;
          consumePermission(activeRequest.id);
          onConsumed?.();
          onEditGranted?.(activeRequest.id);
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
            <DialogTitle>Request Edit Permission{canEditDirect ? " (Preview)" : ""}</DialogTitle>
            <DialogDescription>
              {canEditDirect
                ? "This is a preview of what a request-flow user sees. Submission is disabled so no real request is created."
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
                if (canEditDirect || !reason.trim()) return;
                requestEditPermission(reason.trim());
                setDialogOpen(false);
              }}
              disabled={canEditDirect || !reason.trim() || isRequesting}
              title={canEditDirect ? "Preview only — submission disabled for direct editors" : undefined}
              data-testid="btn-submit-edit-request"
            >
              {isRequesting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {canEditDirect ? "Submit Request (disabled in preview)" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>,
  );
}
