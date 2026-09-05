export type WorkHubSection = "activities" | "equipment" | "labour" | "materials" | "review";
export type FieldDprPhase = "not-started" | "draft-own" | "submitted-own" | "submitted-other";

export const WORK_HUB_SECTIONS: WorkHubSection[] = [
  "activities", "equipment", "labour", "materials", "review",
];

export function dprWorkHubHref(draftId: number): string {
  return `/site/work/${draftId}`;
}

export function dprWorkSectionHref(draftId: number, section: WorkHubSection): string {
  const hub = dprWorkHubHref(draftId);
  if (section === "materials") {
    return `/site/edit/${draftId}?draft&rowSection=materials&returnTo=${encodeURIComponent(hub)}`;
  }
  return `/site/guided?draftId=${draftId}&section=${section}&returnTo=${encodeURIComponent(hub)}`;
}

type PrioritySite = { id: number; name: string };
type PriorityDpr = { site?: string | null; date?: string | null; dprStatus?: string | null; status?: string | null; submittedAt?: string | null };
type ProgrammeSite = { siteId: number; activeToday: boolean };
type SiteDprCandidate = {
  id?: number | null;
  dprStatus?: string | null;
  status?: string | null;
  submittedAt?: string | null;
};

const normalise = (value: unknown) =>
  String(value ?? "").replace(/ [–-] (Edited by|Copy by) .+$/, "").trim().toLowerCase();

/** User intent always wins. The remaining ordering is deliberately deterministic
 * so asynchronous programme data can never change a choice made this session. */
export function resolveFieldSitePriority(
  sites: PrioritySite[],
  options: {
    explicitSiteId?: number | null;
    lastSiteId?: number | null;
    todayDprs?: PriorityDpr[];
    programmeSites?: ProgrammeSite[];
    today: string;
  },
): number | null {
  const exists = (id: number | null | undefined) => id != null && sites.some((site) => site.id === id);
  if (exists(options.explicitSiteId)) return options.explicitSiteId!;
  if (exists(options.lastSiteId)) return options.lastSiteId!;

  const todayNames = new Set(
    (options.todayDprs ?? [])
      .filter((dpr) => dpr.date === options.today)
      .map((dpr) => normalise(dpr.site)),
  );
  const dprSite = sites.find((site) => todayNames.has(normalise(site.name)));
  if (dprSite) return dprSite.id;

  const programmeSite = (options.programmeSites ?? []).find(
    (programme) => programme.activeToday && exists(programme.siteId),
  );
  if (programmeSite) return programmeSite.siteId;
  return sites[0]?.id ?? null;
}

export function dprSectionCounts(dpr: any) {
  return {
    activities: Array.isArray(dpr?.progress) ? dpr.progress.length : 0,
    equipment: Array.isArray(dpr?.equipment) ? dpr.equipment.length : 0,
    labour: Array.isArray(dpr?.labour) ? dpr.labour.length : 0,
    materials: Array.isArray(dpr?.materials) ? dpr.materials.length : 0,
  };
}

const isSubmittedDpr = (dpr: any) =>
  dpr?.dprStatus === "submitted" || dpr?.status === "submitted" || !!dpr?.submittedAt;

const engineerBase = (value: unknown) =>
  String(value ?? "").split(" - ")[0].trim().toLowerCase();

/**
 * A site/date can contain legacy duplicate drafts created by the Detailed and
 * Field entry paths. The highest DPR id is the last record the user saved and
 * is therefore the canonical draft to resume. Never rely on database tie order
 * for rows that share the same date.
 */
export function newestDpr<T extends SiteDprCandidate>(rows: readonly T[]): T | null {
  return rows.reduce<T | null>((newest, row) => {
    if (!newest) return row;
    return Number(row.id ?? 0) > Number(newest.id ?? 0) ? row : newest;
  }, null);
}

/**
 * Existing drafts are site work shared by every authorised user, not
 * user-owned records. The draft's server id remains the sole identity.
 */
export function resolveExistingSiteDpr(
  siteDprs: any[],
  currentUserName: string,
): { activeDpr: any | null; phase: FieldDprPhase } {
  const draft = newestDpr(siteDprs.filter((dpr) => !isSubmittedDpr(dpr)));
  if (draft) return { activeDpr: draft, phase: "draft-own" };

  const ownSubmitted = newestDpr(siteDprs.filter(
    (dpr) => isSubmittedDpr(dpr) && engineerBase(dpr.engineer) === currentUserName.trim().toLowerCase(),
  ));
  if (ownSubmitted) return { activeDpr: ownSubmitted, phase: "submitted-own" };

  const otherSubmitted = newestDpr(siteDprs.filter(isSubmittedDpr));
  return otherSubmitted
    ? { activeDpr: otherSubmitted, phase: "submitted-other" }
    : { activeDpr: null, phase: "not-started" };
}