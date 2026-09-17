import { useEffect, useCallback, useRef } from "react";

const CONFIRM_MESSAGE =
  "You have unsaved changes. If you leave now, your work may be lost.\n\nLeave anyway?";

/**
 * AttachmentViewer uses a same-URL history marker so hardware Back closes the
 * overlay. Dirty forms must not treat that marker as route navigation.
 * Keeping this contract here avoids importing a page or creating a
 * page-specific exception for the shared viewer.
 */
export const ATTACHMENT_VIEWER_HISTORY_KEY = "__sitepulseAttachmentViewer";
const ATTACHMENT_VIEWER_CONTEXT_KEY = "__sitepulseAttachmentViewerContext";

export type AttachmentViewerHistoryContext = {
  token: string;
  viewerUrl: string;
  mode: "active" | "restoring" | "cleanup" | "stale";
};

function isAttachmentViewerState(state: unknown): state is Record<string, unknown> {
  return (
    state !== null &&
    typeof state === "object" &&
    !Array.isArray(state) &&
    typeof (state as Record<string, unknown>)[ATTACHMENT_VIEWER_HISTORY_KEY] === "string" &&
    typeof (state as Record<string, unknown>).viewerUrl === "string"
  );
}

export function setAttachmentViewerHistoryContext(context: AttachmentViewerHistoryContext | null) {
  if (typeof window === "undefined") return;
  if (context) {
    (window as Window & Record<string, unknown>)[ATTACHMENT_VIEWER_CONTEXT_KEY] = context;
  } else {
    delete (window as Window & Record<string, unknown>)[ATTACHMENT_VIEWER_CONTEXT_KEY];
  }
}

export function getAttachmentViewerHistoryContext(): AttachmentViewerHistoryContext | null {
  if (typeof window === "undefined") return null;
  const context = (window as Window & Record<string, unknown>)[ATTACHMENT_VIEWER_CONTEXT_KEY];
  if (
    context &&
    typeof context === "object" &&
    typeof (context as Record<string, unknown>).token === "string" &&
    typeof (context as Record<string, unknown>).viewerUrl === "string" &&
    ["active", "restoring", "cleanup", "stale"].includes(String((context as Record<string, unknown>).mode))
  ) {
    return context as AttachmentViewerHistoryContext;
  }
  return null;
}

export function useBeforeUnload(isDirty: boolean) {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    let ignoreNext = false;

    const handlePopState = (event: PopStateEvent) => {
      // Closing/opening the shared attachment overlay is same-route history
      // traversal, not leaving this dirty form. The viewer clears this flag
      // after handling the traversal.
      const context = getAttachmentViewerHistoryContext();
      const currentUrl = window.location.href;
      const state = window.history.state;
      const markerAtCurrentEntry =
        context &&
        isAttachmentViewerState(state) &&
        state[ATTACHMENT_VIEWER_HISTORY_KEY] === context.token &&
        state.viewerUrl === context.viewerUrl;
      const standaloneViewerMarker =
        isAttachmentViewerState(state) &&
        state.viewerUrl === currentUrl;

      if (context?.mode === "restoring") {
        event.stopImmediatePropagation();
        if (markerAtCurrentEntry) {
          setAttachmentViewerHistoryContext({ ...context, mode: "active" });
        } else {
          window.history.forward();
        }
        return;
      }

      if (context && currentUrl === context.viewerUrl) {
        event.stopPropagation();
        // A same-URL traversal is the viewer's single-step marker traversal.
        // The viewer (or cleanup path) consumes the context after popstate.
        if (context.mode === "cleanup" || context.mode === "stale") {
          setAttachmentViewerHistoryContext(null);
        }
        return;
      }

      if (standaloneViewerMarker) {
        // A closed viewer can leave its own marker in the forward stack after
        // X. It is safe to bypass only when the marker itself proves the
        // exact current same-URL destination.
        event.stopPropagation();
        return;
      }

      if (context?.mode === "active" && currentUrl !== context.viewerUrl) {
        const confirmed = window.confirm(CONFIRM_MESSAGE);
        if (!confirmed) {
          event.stopImmediatePropagation();
          // Return to the marker entry one step at a time. This handles
          // history.go(-2) without granting a timed, route-wide exemption.
          setAttachmentViewerHistoryContext({ ...context, mode: "restoring" });
          window.history.forward();
        }
        return;
      }

      if (ignoreNext) {
        event.stopPropagation();
        ignoreNext = false;
        return;
      }

      const confirmed = window.confirm(CONFIRM_MESSAGE);
      if (!confirmed) {
        event.stopImmediatePropagation();
        ignoreNext = true;
        window.history.go(1);
      }
    };

    window.addEventListener("popstate", handlePopState, true);
    return () => window.removeEventListener("popstate", handlePopState, true);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    const originalPushState = window.history.pushState.bind(window.history);

    window.history.pushState = function (
      state: Parameters<typeof originalPushState>[0],
      title: Parameters<typeof originalPushState>[1],
      url?: Parameters<typeof originalPushState>[2]
    ) {
      // The viewer marker is intentionally a same-URL overlay entry. Let it
      // through without a dirty-form prompt; the viewer verifies that the
      // marker really exists before claiming ownership.
      const destination = url == null
        ? window.location.href
        : new URL(String(url), window.location.href).href;
      const viewerPush =
        isAttachmentViewerState(state) &&
        state.viewerUrl === window.location.href &&
        destination === window.location.href;
      if (viewerPush || !isDirtyRef.current || window.confirm(CONFIRM_MESSAGE)) {
        originalPushState(state, title, url);
      }
    };

    return () => {
      window.history.pushState = originalPushState;
    };
  }, [isDirty]);

  const confirmLeave = useCallback(
    (onConfirm: () => void) => {
      if (!isDirty || window.confirm(CONFIRM_MESSAGE)) {
        onConfirm();
      }
    },
    [isDirty]
  );

  return { confirmLeave };
}
