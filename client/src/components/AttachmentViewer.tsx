import { useCallback, useEffect, useRef } from "react";
import { Download, ExternalLink, FileText, X } from "lucide-react";
import type { Attachment } from "@shared/schema";
import {
  ATTACHMENT_VIEWER_HISTORY_KEY,
  getAttachmentViewerHistoryContext,
  setAttachmentViewerHistoryContext,
} from "@/hooks/use-before-unload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The viewer owns one history entry while it is open. This is deliberately
 * local to the viewer rather than the route: the route, its mounted form, and
 * its scroll position all remain untouched when an attachment is inspected.
 */
let nextViewerToken = 0;

function isHistoryState(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
}

/**
 * Attachment API records are object-storage paths, never arbitrary URLs.
 * Return a same-origin relative URL so unsafe legacy/corrupt rows cannot be
 * used as an iframe, image, download, or new-tab navigation.
 */
export function getSafeAttachmentObjectPath(objectPath: string): string | null {
  try {
    const baseOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const url = new URL(objectPath, baseOrigin);
    if (
      url.origin !== baseOrigin ||
      !url.pathname.startsWith("/objects/") ||
      url.pathname.length <= "/objects/".length ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function isPdfAttachment(attachment: Attachment): boolean {
  return (
    attachment.mimeType?.toLowerCase() === "application/pdf" ||
    fileExtension(attachment.fileName) === "pdf"
  );
}

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimeType?.toLowerCase().startsWith("image/") ?? false;
}

export function AttachmentViewer({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  const tokenRef = useRef(`attachment-viewer-${++nextViewerToken}`);
  const ownsHistoryEntryRef = useRef(false);
  const pendingTraversalRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const isOpenRef = useRef(attachment !== null);
  onCloseRef.current = onClose;
  isOpenRef.current = attachment !== null;

  const isOpen = attachment !== null;

  const closeViewer = useCallback(() => {
    if (!ownsHistoryEntryRef.current) {
      onCloseRef.current();
      return;
    }

    ownsHistoryEntryRef.current = false;
    const currentState = window.history.state;
    if (
      isHistoryState(currentState) &&
      currentState[ATTACHMENT_VIEWER_HISTORY_KEY] === tokenRef.current
    ) {
      // The entry is ours, so remove it rather than leaving a duplicate route
      // in browser history. popstate will not close a second time because the
      // ownership flag is cleared before traversing.
      pendingTraversalRef.current = true;
      window.history.back();
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const token = tokenRef.current;
    const handlePopState = () => {
      const state = window.history.state;
      const isOwnMarker =
        isHistoryState(state) &&
        state[ATTACHMENT_VIEWER_HISTORY_KEY] === token &&
        state.viewerUrl === window.location.href;

      if (!isOpenRef.current && pendingTraversalRef.current && !isOwnMarker) {
        pendingTraversalRef.current = false;
        setAttachmentViewerHistoryContext(null);
        return;
      }

      // Closing with X traverses back and leaves our marker in the forward
      // stack. If the browser later goes forward to that stale entry, consume
      // it immediately instead of reopening a closed overlay.
      if (!isOpenRef.current && isOwnMarker) {
        pendingTraversalRef.current = true;
        setAttachmentViewerHistoryContext({
          token,
          viewerUrl: window.location.href,
          mode: "stale",
        });
        window.history.back();
        return;
      }

      if (!ownsHistoryEntryRef.current) return;
      if (getAttachmentViewerHistoryContext()?.mode === "restoring") return;
      // A back gesture has already traversed away from our marker entry. Do
      // not call history.back() again: that would accidentally leave the app.
      if (!isOwnMarker) {
        ownsHistoryEntryRef.current = false;
        pendingTraversalRef.current = true;
        setAttachmentViewerHistoryContext(null);
        onCloseRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const token = tokenRef.current;
    const viewerUrl = window.location.href;
    const currentState = window.history.state;
    if (
      !isHistoryState(currentState) ||
      currentState[ATTACHMENT_VIEWER_HISTORY_KEY] !== token
    ) {
      const nextState = {
        ...(isHistoryState(currentState) ? currentState : {}),
        [ATTACHMENT_VIEWER_HISTORY_KEY]: token,
        viewerUrl,
      };
      window.history.pushState(nextState, "", viewerUrl);
    }
    const markerWasPushed =
      isHistoryState(window.history.state) &&
      window.history.state[ATTACHMENT_VIEWER_HISTORY_KEY] === token;
    if (!markerWasPushed) {
      // A history guard may decline an unexpected pushState wrapper. Never
      // claim ownership unless the marker is observable, because a subsequent
      // Back must not navigate away from the dirty form.
      onCloseRef.current();
      return;
    }
    ownsHistoryEntryRef.current = true;
    setAttachmentViewerHistoryContext({ token, viewerUrl, mode: "active" });

    return () => {
      // If the route unmounts while the viewer entry is still current, clean
      // up that entry. If navigation already traversed away, do nothing.
      if (
        ownsHistoryEntryRef.current &&
        isHistoryState(window.history.state) &&
        window.history.state[ATTACHMENT_VIEWER_HISTORY_KEY] === token
      ) {
        ownsHistoryEntryRef.current = false;
        pendingTraversalRef.current = true;
        setAttachmentViewerHistoryContext({
          token,
          viewerUrl: window.location.href,
          mode: "cleanup",
        });
        window.history.back();
      }
    };
  }, [isOpen]);

  const title = attachment?.caption || attachment?.fileName || "Attachment";
  const safeObjectPath = attachment ? getSafeAttachmentObjectPath(attachment.objectPath) : null;
  const isImage = attachment ? safeObjectPath !== null && isImageAttachment(attachment) : false;
  const isPdf = attachment ? safeObjectPath !== null && isPdfAttachment(attachment) : false;
  const isUnsafePath = attachment !== null && safeObjectPath === null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeViewer();
      }}
    >
      <DialogContent
        className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-3 overflow-hidden p-3 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:p-5"
        data-testid="attachment-viewer"
      >
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle className="truncate">{title}</DialogTitle>
          <DialogDescription className="truncate">
            {attachment?.fileName}
          </DialogDescription>
        </DialogHeader>

        {attachment && (
          <div className="min-h-0 flex-1 overflow-auto rounded-md bg-slate-950/95 p-1 sm:p-3">
            {isImage && (
              <div className="flex min-h-full items-center justify-center">
                <img
                  src={safeObjectPath ?? undefined}
                  alt={title}
                  className="max-h-[calc(100dvh-10rem)] max-w-full object-contain"
                  data-testid={`viewer-image-${attachment.id}`}
                />
              </div>
            )}

            {isPdf && (
              <iframe
                src={safeObjectPath ?? undefined}
                title={`PDF preview of ${attachment.fileName}`}
                className="h-full min-h-[50vh] w-full rounded bg-white"
                sandbox="allow-same-origin"
                data-testid={`viewer-pdf-${attachment.id}`}
              />
            )}

            {!isImage && !isPdf && (
              <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">
                  {isUnsafePath
                    ? "This attachment path is not available safely."
                    : "Preview isn't available for this file type."}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {isUnsafePath
                    ? "The attachment can only be opened from an approved object-storage path."
                    : "Open the file in a new tab or download it to view the attachment."}
                </p>
              </div>
            )}
          </div>
        )}

        {attachment && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {safeObjectPath && (isPdf || (!isImage && !isPdf)) && (
              <a
                href={safeObjectPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open in new tab
              </a>
            )}
            <a
              href={safeObjectPath}
              download={attachment.fileName}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download
            </a>
            <button
              type="button"
              onClick={closeViewer}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              data-testid="button-close-attachment-viewer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              <span>Close</span>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}