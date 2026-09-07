/**
 * Batch 06A — Progress Report URL state + context-aware navigation helpers.
 *
 * The Progress Report keeps its filter/view state in URL query params so that
 * drilling into a DPR and coming back (via the DPR page's `returnTo`) restores
 * the exact report context. Pure functions — unit-tested in
 * tests/progressReportNav.test.ts.
 *
 * Batch 06V additions:
 *  - overlapAnchor: preserved in URL to reopen Overlap Review panel on Back
 *  - editActivityLink: deep-link to SiteEdit with progressEntryId + returnTo
 */

export type ProgressReportTab = "item" | "chainage" | "date";
export type ItemView = "measurement" | "abstract";
export type SortKey = "chainage_date" | "date_chainage";

export interface ProgressReportState {
  projectId: string; // "" = not chosen
  site: string; // "" = all sites
  from: string; // "" = default
  to: string; // "" = today
  tab: ProgressReportTab;
  /** Expanded BOQ item id in Item-wise view ("" = none). */
  item: string;
  view: ItemView;
  sort: SortKey;
  chFrom: string;
  chTo: string;
  chSide: string;
  /**
   * 06V: When non-empty, scrolls the Overlap Review panel open and anchors to
   * the specific pair key "<entryId>:<withEntryId>". "open" = panel open
   * (no specific anchor). Empty = no anchor, panel closed.
   */
  overlapAnchor: string;
}

export const DEFAULT_STATE: ProgressReportState = {
  projectId: "",
  site: "",
  from: "",
  to: "",
  tab: "item",
  item: "",
  view: "measurement",
  sort: "chainage_date",
  chFrom: "",
  chTo: "",
  chSide: "",
  overlapAnchor: "",
};

/** Canonical register containing the complete DPR list. */
export const DPR_REGISTER_PATH = "/site/dashboard";

const TABS: ReadonlySet<string> = new Set(["item", "chainage", "date"]);
const VIEWS: ReadonlySet<string> = new Set(["measurement", "abstract"]);
const SORTS: ReadonlySet<string> = new Set(["chainage_date", "date_chainage"]);

/** Parse a query string (with or without leading "?") into report state. */
export function parseReportState(search: string): ProgressReportState {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const pick = (k: string) => sp.get(k) ?? "";
  const tab = pick("tab");
  const view = pick("view");
  const sort = pick("sort");
  return {
    projectId: pick("projectId"),
    site: pick("site"),
    from: pick("from"),
    to: pick("to"),
    tab: (TABS.has(tab) ? tab : "item") as ProgressReportTab,
    item: pick("item"),
    view: (VIEWS.has(view) ? view : "measurement") as ItemView,
    sort: (SORTS.has(sort) ? sort : "chainage_date") as SortKey,
    chFrom: pick("chFrom"),
    chTo: pick("chTo"),
    chSide: pick("chSide"),
    overlapAnchor: pick("overlapAnchor"),
  };
}

/** Serialise report state to a query string, omitting default values. */
export function buildReportSearch(state: ProgressReportState): string {
  const sp = new URLSearchParams();
  (Object.keys(DEFAULT_STATE) as Array<keyof ProgressReportState>).forEach((k) => {
    const v = state[k];
    if (v && v !== DEFAULT_STATE[k]) sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Full Progress Report URL (path + state query) for the given state. */
export function progressReportUrl(state: ProgressReportState): string {
  return `/reports/progress${buildReportSearch(state)}`;
}

/**
 * Link to a DPR detail page carrying a `returnTo` back to the Progress
 * Report in its exact current state.
 */
export function dprLinkWithReturn(dprId: number, state: ProgressReportState): string {
  return `/site/report/${dprId}?returnTo=${encodeURIComponent(progressReportUrl(state))}`;
}

/**
 * 06V: Deep-link to /site/edit/:dprId with progressEntryId and returnTo.
 * Opens the SiteEdit page and pre-scrolls/highlights the given progress entry.
 * returnTo encodes the FULL current report URL so Back restores the exact
 * report context including the expanded overlap anchor.
 */
export function editActivityLink(dprId: number, entryId: number, state: ProgressReportState): string {
  const returnTo = encodeURIComponent(progressReportUrl(state));
  return `/site/edit/${dprId}?progressEntryId=${entryId}&returnTo=${returnTo}`;
}

/** Any non-empty anchor opens the review; "open" has no pair-specific target. */
export function isOverlapReviewOpen(anchor: string): boolean {
  return anchor.trim() !== "";
}

/** Return the safe DOM id for a persisted numeric pair key, else no target. */
export function overlapReviewTargetId(anchor: string): string | null {
  return /^\d+:\d+$/.test(anchor) ? `overlap-pair-${anchor}` : null;
}

/**
 * Resolve a validated in-app `returnTo` from a query string, else the given
 * fallback. Rejects absolute/external URLs and protocol-relative ("//...")
 * values. Used by the DPR detail page so Back returns to the originating
 * context (Progress Report, or any other page that set returnTo) without
 * changing existing default behaviour when no context is present.
 */
export function resolveReturnTo(search: string, fallback: string): string {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const rt = sp.get("returnTo");
  // Accept only clean root-relative paths: must start with a single "/",
  // and must not contain backslashes (browsers treat "/\evil.com" like
  // "//evil.com" — a scheme-relative external redirect) or a scheme.
  if (rt && rt.startsWith("/") && !rt.startsWith("//") && !rt.includes("\\") && !rt.includes(":")) return rt;
  return fallback;
}

/** Encode a navigation destination without losing query state on either URL. */
export function withReturnTo(path: string, returnTo: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
