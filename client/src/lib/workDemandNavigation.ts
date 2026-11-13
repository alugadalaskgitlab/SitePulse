import { useEffect, useRef } from "react";

export const WORK_DEMAND_TABS = new Set([
  "materials",
  "equipment",
  "labour",
  "by-item",
  "plan-vs-actual",
  "procurement",
]);

export function readWorkDemandTab(search = window.location.search): string {
  const requested = new URLSearchParams(search).get("tab");
  return requested && WORK_DEMAND_TABS.has(requested) ? requested : "materials";
}

export function writeWorkDemandTab(tab: string, replace = false) {
  if (!WORK_DEMAND_TABS.has(tab)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  const state = window.history.state;
  if (replace) window.history.replaceState(state, "", `${url.pathname}${url.search}${url.hash}`);
  else window.history.pushState(state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function materialUomEditHref(materialId: number, projectId: number): string {
  const returnTo = `/work-program/${projectId}/demand?tab=procurement`;
  return `/masters/section/materials?editMaterial=${materialId}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function isProcurementReturnPath(value: string): boolean {
  return /^\/work-program\/\d+\/demand\?tab=procurement$/.test(value);
}

let dialogHistoryId = 0;

/** Pushes a same-URL history entry while a WorkDemand modal is open, so Back closes it first. */
export function useBackClosesWorkDemandDialog(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = `work-demand-dialog-${++dialogHistoryId}`;
    const priorState = window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
    window.history.pushState({ ...priorState, __workDemandDialog: marker }, "", window.location.href);
    let active = true;
    const handlePopState = () => {
      if (!active) return;
      active = false;
      closeRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      active = false;
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.__workDemandDialog === marker) {
        const { __workDemandDialog: _dialogMarker, ...state } = window.history.state;
        window.history.replaceState(state, "", window.location.href);
      }
    };
  }, [open]);
}
