/**
 * Task #1375 + Pre-Deployment Guided-DPR instruction — per-user choice between
 * the Guided DPR screen (programme-driven checklist) and the Detailed DPR
 * screen (classic full form, SiteEntry).
 *
 * Guided is the DEFAULT for every DPR-authorised user on every device — role
 * and screen size never decide the mode. Only the user's own deliberate switch
 * to Classic is remembered, and it is remembered PER USER (key includes the
 * authenticated user id), not one shared device-wide value.
 *
 * Structure DPRs always use the Detailed screen — the guided flow only covers
 * road progress against programme bars.
 */

const LEGACY_KEY = "sitelog.dprEntryMode";
const KEY_PREFIX = "sitelog.dprEntryMode.u";

export type DprEntryMode = "guided" | "detailed";

// The authenticated user id, bound once by auth-context on login/restore so
// every call site doesn't need to thread it through.
let boundUserId: number | null = null;

export function bindDprEntryModeUser(userId: number | null | undefined) {
  boundUserId = userId ?? null;
  // One-time migration: carry a pre-existing device-wide choice over to the
  // first user who signs in on this device, then drop the shared key so it
  // can never leak one user's preference to another.
  if (boundUserId != null) {
    try {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy != null) {
        const userKey = `${KEY_PREFIX}${boundUserId}`;
        if (localStorage.getItem(userKey) == null && legacy === "detailed") {
          localStorage.setItem(userKey, legacy);
        }
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch { /* localStorage unavailable */ }
  }
}

function storageKey(): string | null {
  return boundUserId != null ? `${KEY_PREFIX}${boundUserId}` : null;
}

export function getDprEntryMode(): DprEntryMode {
  // Guided is the default for any user who never expressed a preference.
  // An explicit stored "detailed" (deliberate switch to Classic) is honoured
  // for that user only.
  try {
    const key = storageKey();
    if (!key) return "guided"; // not signed in / unknown user → default
    const v = localStorage.getItem(key);
    return v === "detailed" ? "detailed" : "guided";
  } catch {
    return "guided";
  }
}

export function setDprEntryMode(mode: DprEntryMode) {
  try {
    const key = storageKey();
    if (!key) return; // no authenticated user bound — nothing to remember
    localStorage.setItem(key, mode);
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

/**
 * Batch 05 — href for CONTINUING an existing road-DPR server draft, honouring
 * the persisted mode choice. Guided (the default) reopens the SAME server
 * draft via `?draftId=`; only an explicit Detailed preference routes to the
 * Detailed draft editor. Never creates a second DPR.
 */
export function roadDprDraftHref(draftId: number, returnTo?: string): string {
  const base = getDprEntryMode() === "guided"
    ? `/site/guided?draftId=${draftId}`
    : `/site/edit/${draftId}?draft`;
  if (!returnTo) return base;
  return `${base}&returnTo=${encodeURIComponent(returnTo)}`;
}
