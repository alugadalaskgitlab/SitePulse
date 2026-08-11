/**
 * Batch 06D — Field Home DPR lifecycle helpers (pure, testable).
 *
 * Selects the current engineer's own UNSUBMITTED DPRs dated before today from
 * a bounded recent window. Used for the "older pending DPR" banner — warn
 * only, never blocks starting today's DPR, never creates a new DPR (the
 * banner reopens the SAME draft via its id).
 */

export const normSiteName = (s: string): string =>
  s.split(" –")[0].split(" -–")[0].trim();

export const engineerBaseName = (eng: string): string =>
  eng.split(" - ")[0].trim().toLowerCase();

export type DprWindowRow = {
  id: number;
  date: string;
  site?: string | null;
  engineer?: string | null;
  status?: string | null;
  submittedAt?: string | null;
  isSuperseded?: boolean | null;
};

/**
 * Own unsubmitted DPRs before `todayStr`, most recent first.
 * - other engineers' drafts are never returned;
 * - submitted/superseded DPRs are never returned;
 * - multiple pending drafts are all returned (caller shows the most recent
 *   prominently and indicates the rest — never silently collapsed).
 */
export function findOlderPendingDprs<T extends DprWindowRow>(
  rows: readonly T[],
  opts: { todayStr: string; siteName: string; myName: string },
): T[] {
  const myNorm = opts.myName.toLowerCase();
  return rows
    .filter(d =>
      d.date < opts.todayStr &&
      normSiteName(d.site ?? "") === opts.siteName &&
      !d.isSuperseded &&
      engineerBaseName(d.engineer ?? "") === myNorm &&
      !(d.status === "submitted" || d.submittedAt),
    )
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
