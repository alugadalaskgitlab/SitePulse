/**
 * Per-user landing-page (workspace) preference — Field Home vs the Classic
 * Dashboard. Same pattern as lib/dprEntryMode.ts:
 *
 * Field Home is the DEFAULT for every user on every device — role never
 * decides the landing page (the old `!isAdmin && isFieldEngineer` rule is the
 * same class of bug already fixed for DPR entry mode). If a supervisor or PM
 * steps in for an absent Site Engineer, they see the exact same workflow.
 *
 * Only the user's own deliberate switch to the Classic Dashboard is
 * remembered, and it is remembered PER USER (key includes the authenticated
 * user id) — never one shared device-wide value.
 */

const KEY_PREFIX = "sitelog.workspaceMode.u";

export type WorkspaceMode = "field" | "classic";

// The authenticated user id, bound once by auth-context on login/restore so
// every call site doesn't need to thread it through.
let boundUserId: number | null = null;

export function bindWorkspaceModeUser(userId: number | null | undefined) {
  boundUserId = userId ?? null;
  // No legacy device-wide key ever existed for this preference (the old
  // behaviour was purely role-derived), so there is nothing to migrate —
  // any user without a saved per-user value simply gets the Field Home
  // default.
}

// `userId` may be passed explicitly (preferred — components already have the
// authenticated user from useAuth, and the context binding only happens in a
// post-render effect, too late for a first render). The bound id is a
// fallback for call sites without direct access to the user.
function storageKey(userId?: number | null): string | null {
  const id = userId ?? boundUserId;
  return id != null ? `${KEY_PREFIX}${id}` : null;
}

export function getWorkspaceMode(userId?: number | null): WorkspaceMode {
  // Field Home is the default for any user who never expressed a preference.
  // An explicit stored "classic" (deliberate switch) is honoured for that
  // user only.
  try {
    const key = storageKey(userId);
    if (!key) return "field"; // not signed in / unknown user → default
    const v = localStorage.getItem(key);
    return v === "classic" ? "classic" : "field";
  } catch {
    return "field";
  }
}

export function setWorkspaceMode(mode: WorkspaceMode, userId?: number | null) {
  try {
    const key = storageKey(userId);
    if (!key) return; // no authenticated user — nothing to remember
    localStorage.setItem(key, mode);
  } catch {
    // localStorage unavailable — preference simply won't persist
  }
}
