import type { DprReadinessIssue } from "./dprSubmitReadiness";
import { evaluateSectionReadiness } from "./dprSectionReadiness";
import { collectDprBoqItemIds } from "./dprBoqSelection";
import { siteMatchesPermitted } from "./siteName";

export type DraftReadiness = {
  state: "ready" | "blocked" | "unavailable";
  mandatory: DprReadinessIssue[];
  advisories: DprReadinessIssue[];
};

type BoqContextItem = { id: number; boqProjectId: number; description: string; unit: string };
type BoqContextProject = { id: number; siteName: string | null };
type DraftAggregate = {
  site: string;
  boqProjectId: number | null;
  workType: string;
  progress: Array<{ boqItemId?: number | null }>;
  [key: string]: any;
};

const unavailable = (): DraftReadiness => ({ state: "unavailable", mandatory: [], advisories: [] });

/**
 * Read-only list adapter. BOQ context MUST be loaded in batches by the caller;
 * unresolved or foreign references must never silently become "ready".
 * This calls the same saved-section evaluator used in the section hub.
 */
export function evaluateSavedDraftReadiness(
  dpr: DraftAggregate,
  itemsById: ReadonlyMap<number, BoqContextItem>,
  projectsById: ReadonlyMap<number, BoqContextProject>,
): DraftReadiness {
  const referencedIds = collectDprBoqItemIds({
    progress: dpr.progress, equipment: dpr.equipment, labour: dpr.labour,
    structureItems: dpr.structureItems,
  });
  const projectId = dpr.boqProjectId;
  if (projectId == null && referencedIds.length > 0) return unavailable();
  const project = projectId == null ? null : projectsById.get(projectId);
  if (projectId != null && (!project?.siteName || !siteMatchesPermitted(dpr.site, [project.siteName]))) return unavailable();
  if (referencedIds.some(id => {
    const item = itemsById.get(id);
    return !item || item.boqProjectId !== projectId || !item.unit || !item.description;
  })) return unavailable();
  const items = referencedIds.map(id => itemsById.get(id)!);
  const result = evaluateSectionReadiness(dpr, items);
  return { state: result.ready ? "ready" : "blocked", mandatory: result.mandatory, advisories: result.advisories };
}