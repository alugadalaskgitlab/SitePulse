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
