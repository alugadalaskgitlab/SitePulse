import { boqItemDisplayName, type BoqItemNameFields } from "./boqItemName";

export interface DprBoqProjectChoice {
  id: number;
  status?: string | null;
  barCount?: number | null;
}

export interface DprBoqSelectableItem extends BoqItemNameFields {
  id: number;
  includeInDpr?: boolean | null;
}

/**
 * One DPR-project rule for Guided, Detailed, and Edit.
 * Edit may prefer the project already saved on the DPR; otherwise every form
 * uses active-with-programme → active → first API row.
 */
export function resolveDprBoqProjectId(
  projects: readonly DprBoqProjectChoice[],
  preferredProjectId?: number | null,
): number | null {
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