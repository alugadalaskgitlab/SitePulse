import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  normalizeDprSiteName,
  resolveDprSiteId,
  resolveDprBoqProjectId,
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
}: {
  siteName: string;
  sites: readonly SiteChoice[];
  preferredProjectId?: number | null;
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

  const projectId = useMemo(
    () => {
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
    [projects, preferredProjectId, projectsQuery.isSuccess],
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
    // Consumers that persist the resolved project need to distinguish an
    // empty result while the request is still in flight from a completed
    // request that genuinely returned no projects.
    projectsLoaded: siteId == null ? false : projectsQuery.isSuccess,
    projectsLoading: siteId != null && projectsQuery.isLoading,
    projectsError: projectsQuery.error ?? null,
    itemsLoaded: projectId == null ? projectsQuery.isSuccess : itemsQuery.isSuccess,
    itemsLoading: projectId != null && itemsQuery.isLoading,
    itemsError: itemsQuery.error ?? null,
    isLoading: siteId != null
      && (projectsQuery.isLoading || (projectsQuery.isSuccess && projectId != null && itemsQuery.isLoading)),
    error: projectsQuery.error ?? itemsQuery.error ?? null,
    retry,
    retryProjects: () => projectsQuery.refetch(),
    retryItems: () => itemsQuery.refetch(),
  };
}
