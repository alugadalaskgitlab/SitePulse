import { useCallback, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  collectDprBoqItemIds,
  normalizeDprSiteName,
  resolveDprSiteId,
  resolveDprBoqProjectId,
  resolveDprBoqProjectIdByEvidence,
  type DprBoqProjectChoice,
  type DprBoqSelectableItem,
} from "@shared/dprBoqSelection";

type SiteChoice = { id: number; name: string };
type DprBoqProject = DprBoqProjectChoice & {
  name: string;
  itemCount?: number | null;
};

export function useDprBoqItems<T extends DprBoqSelectableItem>({
  siteName,
  sites,
  preferredProjectId,
  allowEvidenceBasedRecovery = false,
  recoveryEvidence,
  cataloguePreviewEligible = false,
}: {
  siteName: string;
  sites: readonly SiteChoice[];
  preferredProjectId?: number | null;
  /**
   * Enables the narrow evidence-based recovery path. The default resolver
   * remains unchanged unless a caller supplies live BOQ evidence.
   */
  allowEvidenceBasedRecovery?: boolean;
  /** Initial live DPR/form data; later edits use requestEvidenceRecovery. */
  recoveryEvidence?: unknown;
  /**
   * Explicit opt-in from the page after its live form state has hydrated and
   * proved that only untouched placeholders remain. Keep this false until
   * hydration so a saved-null special-only DPR cannot trigger a catalogue
   * request during the initial render.
   */
  cataloguePreviewEligible?: boolean;
}) {
  const siteId = useMemo(() => resolveDprSiteId(sites, siteName), [siteName, sites]);
  const normalizedSiteName = normalizeDprSiteName(siteName);
  const matchingSiteIds = useMemo(
    () => new Set(
      sites
        .filter((site) => normalizeDprSiteName(site.name) === normalizedSiteName)
        .map((site) => site.id),
    ),
    [normalizedSiteName, sites],
  );
  const siteResolutionError = normalizedSiteName && sites.length > 0 && siteId == null
    ? matchingSiteIds.size > 1
      ? "This site name is shared by more than one site. Choose the uniquely named site before loading BOQ items."
      : "The selected site could not be resolved. Choose a site from the list before loading BOQ items."
    : null;

  const projectsQuery = useQuery<DprBoqProject[]>({
    queryKey: ["/api/boq/projects", siteId],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      if (!response.ok) throw new Error(`BOQ projects request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("BOQ projects response was invalid");
      return data;
    },
    enabled: siteId != null,
    retry: false,
  });
  const { data: projects = [] } = projectsQuery;

  const initialEvidenceIds = useMemo(
    () => collectDprBoqItemIds(recoveryEvidence),
    [recoveryEvidence],
  );
  // null means no post-mount live-form snapshot has arrived yet. Once a page
  // reports its current rows, that snapshot replaces (rather than accumulates
  // with) the initial server/local recovery evidence.
  const [requestedEvidenceIds, setRequestedEvidenceIds] = useState<number[] | null>(null);
  const requestEvidenceRecovery = useCallback((evidence: unknown) => {
    const ids = Array.isArray(evidence) && evidence.every((value) => Number.isInteger(value))
      ? Array.from(new Set((evidence as number[]).filter((value) => value > 0))).sort((a, b) => a - b)
      : collectDprBoqItemIds(evidence);
    setRequestedEvidenceIds((previous) => (
      previous != null
      && previous.length === ids.length
      && previous.every((id, index) => id === ids[index])
        ? previous
        : ids
    ));
  }, []);
  const evidenceBoqItemIds = useMemo(
    () => requestedEvidenceIds ?? initialEvidenceIds,
    [initialEvidenceIds, requestedEvidenceIds],
  );
  const evidenceRecoveryActive = allowEvidenceBasedRecovery
    && evidenceBoqItemIds.length > 0
    && preferredProjectId == null;

  // Candidate item lists are fetched only for this recovery path. Normal DPR
  // entry still follows the deterministic project resolver; a saved-null DPR
  // must prove that one site project owns every live BOQ reference before its
  // picker is enabled.
  const candidateItemQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["/api/boq/projects", project.id, "items"],
      queryFn: async () => {
        const response = await fetch(`/api/boq/projects/${project.id}/items`, { credentials: "include" });
        if (!response.ok) throw new Error(`BOQ items request failed (${response.status})`);
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("BOQ items response was invalid");
        return data as Array<{ id: number }>;
      },
      enabled: evidenceRecoveryActive && projectsQuery.isSuccess,
      retry: false,
    })),
  });
  const candidateItemsByProject = useMemo(() => {
    const byProject = new Map<number, readonly { id: number }[]>();
    projects.forEach((project, index) => {
      const result = candidateItemQueries[index];
      if (result?.isSuccess) byProject.set(project.id, result.data ?? []);
    });
    return byProject;
  }, [candidateItemQueries, projects]);
  const candidateQueriesSettled = candidateItemQueries.every(
    (query) => query.isSuccess || query.isError,
  );
  const evidenceProjectId = evidenceRecoveryActive
    && projectsQuery.isSuccess
    && candidateQueriesSettled
    && candidateItemQueries.every((query) => query.isSuccess)
    ? resolveDprBoqProjectIdByEvidence(projects, evidenceBoqItemIds, candidateItemsByProject)
    : null;
  const evidenceRecoveryPending = evidenceRecoveryActive
    && projectsQuery.isSuccess
    && !candidateQueriesSettled;

  // An explicit saved null still needs a read-only catalogue preview so the
  // engineer can choose the first BOQ item. This intentionally does not feed
  // `projectId` or any persistence state: selecting a real item creates live
  // evidence, after which the ownership recovery path above resolves the
  // project's ID.
  const catalogueProjectId = preferredProjectId === null
    && cataloguePreviewEligible
    && projectsQuery.isSuccess
    ? resolveDprBoqProjectId(projects, undefined)
    : null;
  const catalogueItemsQuery = useQuery<T[]>({
    queryKey: ["/api/boq/projects", catalogueProjectId, "items", "catalogue-preview"],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects/${catalogueProjectId}/items`, { credentials: "include" });
      if (!response.ok) throw new Error(`BOQ catalogue request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("BOQ catalogue response was invalid");
      return data;
    },
    enabled: catalogueProjectId != null,
    retry: false,
  });

  const projectId = useMemo(
    () => {
      // Never expose the ordinary first-project fallback while evidence
      // ownership is being checked. A failed/ambiguous recovery stays null
      // rather than silently assigning the wrong project.
      if (evidenceRecoveryActive) return evidenceProjectId;
      // An explicit saved project must never be replaced by a fallback merely
      // because the project request is still loading/has failed, or because it
      // is no longer in the accessible project list. Let the status/payload
      // preserve the saved ID while the request fails visibly.
      if (
        preferredProjectId != null
        && (
          !projectsQuery.isSuccess
          || !projects.some((project) => project.id === preferredProjectId)
        )
      ) {
        return preferredProjectId;
      }
      return resolveDprBoqProjectId(projects, preferredProjectId);
    },
    [
      projects,
      preferredProjectId,
      projectsQuery.isSuccess,
      evidenceRecoveryActive,
      evidenceProjectId,
    ],
  );

  const itemsQuery = useQuery<T[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      if (!response.ok) throw new Error(`BOQ items request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("BOQ items response was invalid");
      return data;
    },
    enabled: projectId != null && projectsQuery.isSuccess,
    retry: false,
  });
  const { data: items = [] } = itemsQuery;

  const retry = async () => {
    if (projectsQuery.isError) await projectsQuery.refetch();
    if (itemsQuery.isError) await itemsQuery.refetch();
  };

  return {
    siteId,
    siteResolutionError,
    projects,
    projectId,
    items,
    // Preview-only items for an explicit saved-null DPR. Pages must keep these
    // separate from `items`: selecting one is what supplies live evidence for
    // ownership validation and durable project recovery.
    catalogueProjectId,
    catalogueItems: catalogueItemsQuery.data ?? [],
    catalogueItemsLoading: catalogueProjectId != null && catalogueItemsQuery.isLoading,
    // Consumers that persist the resolved project need to distinguish an
    // empty result while the request is still in flight from a completed
    // request that genuinely returned no projects.
    projectsLoaded: siteId == null ? false : projectsQuery.isSuccess,
    projectsLoading: siteId != null && projectsQuery.isLoading,
    projectsError: projectsQuery.error ?? null,
    itemsLoaded: projectId == null ? projectsQuery.isSuccess : itemsQuery.isSuccess,
    itemsLoading: projectId != null && itemsQuery.isLoading,
    itemsError: itemsQuery.error ?? null,
    evidenceProjectId,
    evidenceRecoveryPending,
    requestEvidenceRecovery,
    isLoading: siteId != null
      && (projectsQuery.isLoading || (projectsQuery.isSuccess && projectId != null && itemsQuery.isLoading)),
    error: projectsQuery.error ?? itemsQuery.error ?? null,
    retry,
    retryProjects: () => projectsQuery.refetch(),
    retryItems: () => itemsQuery.refetch(),
  };
}
