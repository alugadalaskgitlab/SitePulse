/**
 * Task #1375 — per-user choice between the Guided DPR screen (programme-driven
 * checklist) and the Detailed DPR screen (classic full form, SiteEntry).
 *
 * The choice is persisted in localStorage so every entry point (Field Home,
 * Site Home, Site Dashboard, Site Hub) routes the "Road DPR" action to the
 * screen the user last picked. Structure DPRs always use the Detailed screen —
 * the guided flow only covers road progress against programme bars.
 */

const STORAGE_KEY = "sitelog.dprEntryMode";

export type DprEntryMode = "guided" | "detailed";

export function getDprEntryMode(): DprEntryMode {
  // Guided is the default for devices that never expressed a preference.
  // An explicit stored "detailed" (deliberate switch to Classic) is honoured
  // per device and is never overridden by this default.
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "detailed" ? "detailed" : "guided";
  } catch {
    return "guided";
  }
}

export function setDprEntryMode(mode: DprEntryMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable — preference simply won't persist
  }
}

/**
 * Href for starting a new road DPR, honouring the persisted mode choice.
 * `returnTo` is forwarded so both screens land back on the right page.
 */
export function roadDprHref(returnTo?: string): string {
  const base = getDprEntryMode() === "guided" ? "/site/guided" : "/site/new?type=road";
  if (!returnTo) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}
