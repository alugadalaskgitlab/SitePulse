import { boqItemDisplayName, type BoqItemNameFields } from "./boqItemName";

export interface DprBoqProjectChoice {
  id: number;
  status?: string | null;
  barCount?: number | null;
}

export interface DprBoqSiteChoice {
  id: number;
  name: string;
}

export interface DprBoqSelectableItem extends BoqItemNameFields {
  id: number;
  includeInDpr?: boolean | null;
}

/**
 * Site names are user-facing strings and have historically accumulated
 * harmless whitespace/case differences.  Normalize only those differences;
 * never do a partial/fuzzy match because two sites can legitimately have
 * similar names.
 */
export function normalizeDprSiteName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLocaleLowerCase()
    : "";
}

/**
 * Resolve a site name only when the normalized exact match is unambiguous.
 * Returning null for duplicate names is deliberate: choosing an arbitrary
 * site would query the wrong BOQ project and make valid items appear absent.
 */
export function resolveDprSiteId(
  sites: readonly DprBoqSiteChoice[],
  siteName: unknown,
): number | null {
  const normalized = normalizeDprSiteName(siteName);
  if (!normalized) return null;
  const matches = sites.filter((site) => normalizeDprSiteName(site.name) === normalized);
  const ids = new Set(matches.map((site) => site.id));
  return ids.size === 1 ? matches[0].id : null;
}

/**
 * One DPR-project rule for Guided, Detailed, and Edit.
 * Edit may prefer the project already saved on the DPR; otherwise every form
 * uses active-with-programme → active → first API row. `undefined` means that
 * no saved preference exists yet. An explicit `null` is different: it is a
 * saved DPR with no BOQ project and must not be replaced by a newly guessed
 * project.
 */
export function resolveDprBoqProjectId(
  projects: readonly DprBoqProjectChoice[],
  preferredProjectId?: number | null,
): number | null {
  if (preferredProjectId === null) return null;
  if (
    preferredProjectId != null
    && projects.some((project) => project.id === preferredProjectId)
  ) {
    return preferredProjectId;
  }
  return (
    projects.find((project) => project.status === "active" && Number(project.barCount ?? 0) > 0)?.id
    ?? projects.find((project) => project.status === "active")?.id
    ?? projects[0]?.id
    ?? null
  );
}

/**
 * Return true when any DPR-owned row contains a BOQ item reference.
 *
 * Guided equipment keeps some links in `passthrough`, while equipment
 * allocations/segments and cut/fill allocations can be nested several levels
 * deep. Recursing over plain form data keeps the page guards consistent and
 * avoids allowing a site/project change to orphan a nested reference.
 */
export function hasDprBoqReferences(value: unknown): boolean {
  const visited = new WeakSet<object>();
  const visit = (current: unknown): boolean => {
    if (current == null || typeof current !== "object") return false;
    if (visited.has(current)) return false;
    visited.add(current);

    if (Array.isArray(current)) return current.some(visit);
    const record = current as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(record, "boqItemId")
      && record.boqItemId != null
      && record.boqItemId !== ""
      && Number(record.boqItemId) > 0
    ) {
      return true;
    }
    return Object.values(record).some(visit);
  };
  return visit(value);
}

/** Preserve the server's deterministic order; exclude only explicit DPR opt-outs. */
export function dprSelectableBoqItems<T extends DprBoqSelectableItem>(
  items: readonly T[],
): T[] {
  return items.filter((item) => item.includeInDpr !== false);
}

/** The only user-facing BOQ label allowed in a DPR picker. */
export function dprBoqItemDisplayName(item?: DprBoqSelectableItem | null): string {
  return boqItemDisplayName(item);
}