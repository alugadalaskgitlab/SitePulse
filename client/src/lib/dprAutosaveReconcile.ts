/**
 * Batch 05 — local-autosave vs server-draft reconciliation.
 *
 * Guided ("guided-dpr-new") and Detailed ("site-entry-new") keep independent
 * NEW-DPR local autosave blobs. Once a real server draft exists and has been
 * saved, the server draft is authoritative; a stale new-DPR blob for the SAME
 * context must not keep nagging "Unsaved draft found".
 *
 * EXACT SUPPRESSION RULE (reported per spec §10):
 * A stale new-DPR blob is cleared only when its relationship to the active
 * server draft is safely established, meaning EITHER:
 *  1. the blob itself records the same server draftId (guided blob only), OR
 *  2. the blob's date AND normalised site both equal the server draft's —
 *     i.e. the "same site/date/context" the spec defines as one DPR.
 * Anything else (different site, different date, missing fields) is left
 * untouched — unrelated autosaves are never globally deleted.
 */

import { loadFormDraft, clearFormDraft } from "@/lib/autosave";

export type DraftContext = { draftId: number; site: string; date: string };

/** Same normalisation FieldHome/Guided already use for site labels. */
export const normaliseSite = (s: unknown): string =>
  String(s ?? "").replace(/ [–-] (Edited by|Copy by) .+$/, "").trim().toLowerCase();

const sameContext = (site: unknown, date: unknown, ctx: DraftContext): boolean =>
  normaliseSite(site) !== "" &&
  normaliseSite(site) === normaliseSite(ctx.site) &&
  String(date ?? "") !== "" &&
  String(date ?? "") === ctx.date;

/** guided-dpr-new blob: { draftId?, siteName?, date?, ... } */
export function guidedBlobMatches(blob: any, ctx: DraftContext): boolean {
  if (!blob) return false;
  if (blob.draftId != null && Number(blob.draftId) === ctx.draftId) return true;
  return sameContext(blob.siteName, blob.date, ctx);
}

/** site-entry-new blob: { header: { site?, date? }, ... } */
export function siteEntryBlobMatches(blob: any, ctx: DraftContext): boolean {
  if (!blob?.header) return false;
  return sameContext(blob.header.site, blob.header.date, ctx);
}

/**
 * Clear stale new-DPR blobs (both silos) that belong to the given server
 * draft context. Safe to call repeatedly; failures are silent (autosave is
 * best-effort infrastructure).
 */
export async function reconcileNewDprAutosaves(ctx: DraftContext): Promise<void> {
  try {
    const g = await loadFormDraft<any>("guided-dpr-new");
    if (g && guidedBlobMatches(g.data, ctx)) await clearFormDraft("guided-dpr-new");
  } catch { /* best effort */ }
  try {
    const s = await loadFormDraft<any>("site-entry-new");
    if (s && siteEntryBlobMatches(s.data, ctx)) await clearFormDraft("site-entry-new");
  } catch { /* best effort */ }
}
