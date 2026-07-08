import { useState } from "react";
import { PencilLine, Clock, CheckCircle2, XCircle, Send, Loader2, Lock, Eye, X, RotateCcw } from "lucide-react";
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

type PreviewStatus = "idle" | "pending" | "approved" | "denied";

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
  const [previewMode, setPreviewMode] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");

  const {
    currentStatus,
    hasActivePermission,
    activeRequest,
    isLoading,
    requestEditPermission,
    isRequesting,
    consumePermission,
  } = useEditPermission(recordType, recordId);

  // Admin/Owner: render a plain Edit button, plus a "Preview as requester" toggle
  // so admins can see (without affecting real data) what non-admin users experience.
  if (isAdmin || isOwner) {
    if (previewMode) {
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs text-muted-foreground border-dashed">
            Preview mode
          </Badge>
          <PreviewRequesterView
            size={size}
            className={className}
            label={label}
            status={previewStatus}
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
            reason={reason}
            setReason={setReason}
            onSubmit={() => {
              setPreviewStatus("pending");
              setDialogOpen(false);
            }}
            onSimulateApprove={() => setPreviewStatus("approved")}
            onSimulateDeny={() => setPreviewStatus("denied")}
            onReset={() => setPreviewStatus("idle")}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => { setPreviewMode(false); setPreviewStatus("idle"); }}
            title="Exit preview"
            data-testid="btn-exit-preview"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }
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

interface PreviewRequesterViewProps {
  size: "default" | "sm" | "lg" | "icon";
  className?: string;
  label: string;
  status: PreviewStatus;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  reason: string;
  setReason: (reason: string) => void;
  onSubmit: () => void;
  onSimulateApprove: () => void;
  onSimulateDeny: () => void;
  onReset: () => void;
}

// Renders the exact same UI a non-admin requester would see, driven entirely by
// local state — no real /api/edit-requests calls are made, so no live pending
// request is ever created while an admin is previewing the flow.
function PreviewRequesterView({
  size,
  className,
  label,
  status,
  dialogOpen,
  setDialogOpen,
  reason,
  setReason,
  onSubmit,
  onSimulateApprove,
  onSimulateDeny,
  onReset,
}: PreviewRequesterViewProps) {
  if (status === "approved") {
    return (
      <div className="flex items-center gap-1">
        <Button
          size={size}
          variant="default"
          className={`bg-green-600 hover:bg-green-700 text-white ${className ?? ""}`}
          onClick={onReset}
          data-testid="btn-preview-edit-permitted"
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          {label} (120m left)
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onReset} title="Reset preview" data-testid="btn-preview-reset">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="flex items-center gap-1">
        <Button size={size} variant="outline" disabled className={className} data-testid="btn-preview-edit-pending">
          <Clock className="h-4 w-4 mr-1 text-amber-500" />
          Waiting for Approval
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600" onClick={onSimulateApprove} data-testid="btn-preview-simulate-approve">
          Simulate approve
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onSimulateDeny} data-testid="btn-preview-simulate-deny">
          Simulate deny
        </Button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">Request Denied</Badge>
        <Button
          size={size}
          variant="outline"
          className={className}
          onClick={() => setDialogOpen(true)}
          data-testid="btn-preview-edit-request-again"
        >
          <Send className="h-4 w-4 mr-1" />
          Request Again
        </Button>
        <PreviewDialog
          open={dialogOpen}
          setOpen={setDialogOpen}
          reason={reason}
          setReason={setReason}
          onSubmit={onSubmit}
        />
      </div>
    );
  }

  // idle
  return (
    <>
      <Button
        size={size}
        variant="outline"
        className={className}
        onClick={() => { setReason(""); setDialogOpen(true); }}
        data-testid="btn-preview-request-edit"
      >
        <Lock className="h-4 w-4 mr-1 text-muted-foreground" />
        Request Edit
      </Button>
      <PreviewDialog
        open={dialogOpen}
        setOpen={setDialogOpen}
        reason={reason}
        setReason={setReason}
        onSubmit={onSubmit}
      />
    </>
  );
}

function PreviewDialog({
  open,
  setOpen,
  reason,
  setReason,
  onSubmit,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  reason: string;
  setReason: (reason: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Edit Permission (Preview)</DialogTitle>
          <DialogDescription>
            This is a preview of what a non-admin user sees. Submitting here is simulated
            locally and will not create a real request or notify anyone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="preview-edit-reason">Reason for edit</Label>
          <Textarea
            id="preview-edit-reason"
            placeholder="e.g. Entered wrong equipment hours, need to correct fuel consumption figure…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={4}
            data-testid="input-preview-edit-reason"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!reason.trim()) return;
              onSubmit();
            }}
            disabled={!reason.trim()}
            data-testid="btn-preview-submit-edit-request"
          >
            <Send className="h-4 w-4 mr-1" />
            Submit Request (Preview only)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
