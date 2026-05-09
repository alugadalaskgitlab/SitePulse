import { useEffect, useCallback, useRef } from "react";

const CONFIRM_MESSAGE =
  "You have unsaved changes. If you leave now, your work may be lost.\n\nLeave anyway?";

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

    const handlePopState = () => {
      if (ignoreNext) {
        ignoreNext = false;
        return;
      }

      const confirmed = window.confirm(CONFIRM_MESSAGE);
      if (!confirmed) {
        ignoreNext = true;
        window.history.go(1);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    const originalPushState = window.history.pushState.bind(window.history);

    window.history.pushState = function (
      state: Parameters<typeof originalPushState>[0],
      title: Parameters<typeof originalPushState>[1],
      url?: Parameters<typeof originalPushState>[2]
    ) {
      if (!isDirtyRef.current || window.confirm(CONFIRM_MESSAGE)) {
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
