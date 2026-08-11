/**
 * Task #1409 — grouping DPR photo attachments by activity.
 *
 * dpr_progress attachments may carry a `progressEntryKey` linking them to a
 * specific progress row (the row's stable client-generated entryKey). Photos
 * without a key are general DPR-level site photos — the pre-#1409 behaviour.
 * One grouping helper so the read-only DPR view, the site report and the
 * prior-DPR preview dialog can never disagree.
 */

export type DprPhotoLike = {
  progressEntryKey?: string | null;
};

export type GroupedDprPhotos<T extends DprPhotoLike> = {
  /** photos not linked to any activity (legacy + deliberate general shots) */
  general: T[];
  /** photos per progress-row entryKey */
  byEntryKey: Map<string, T[]>;
};

/**
 * Batch 06C: hard cap on photos per activity row. Enforced BOTH client-side
 * (staging is blocked past remaining capacity) and server-side (a fourth
 * dpr_progress attachment for the same entryKey is rejected) — never rely on
 * the browser alone. General (keyless) DPR photos are not capped here.
 */
export const MAX_ACTIVITY_PHOTOS = 3;

/**
 * Stable client-generated key for a progress row. Progress rows are
 * wholesale-replaced on draft PATCH, so DB serial ids don't survive edits —
 * the entryKey is the only identity photos can safely link to.
 */
export function newEntryKey(): string {
  return `pe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Photos already attached on the server for a given activity entryKey. */
export function countEntryAttachments<T extends DprPhotoLike>(attachments: T[], entryKey: string): number {
  if (!entryKey) return 0;
  return attachments.filter((a) => a.progressEntryKey === entryKey).length;
}

/**
 * How many MORE photos may be staged/uploaded for an activity, given what is
 * already attached server-side and what is already staged locally.
 * Never negative.
 */
export function activityPhotoCapacity(attachedCount: number, stagedCount: number): number {
  return Math.max(0, MAX_ACTIVITY_PHOTOS - attachedCount - stagedCount);
}

export function groupDprPhotos<T extends DprPhotoLike>(attachments: T[]): GroupedDprPhotos<T> {
  const general: T[] = [];
  const byEntryKey = new Map<string, T[]>();
  for (const a of attachments) {
    const key = typeof a.progressEntryKey === "string" && a.progressEntryKey.trim() !== ""
      ? a.progressEntryKey
      : null;
    if (key == null) { general.push(a); continue; }
    const list = byEntryKey.get(key);
    if (list) list.push(a); else byEntryKey.set(key, [a]);
  }
  return { general, byEntryKey };
}
