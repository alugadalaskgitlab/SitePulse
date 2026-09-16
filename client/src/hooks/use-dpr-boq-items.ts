import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
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
  const siteId = useMemo(
    () => sites.find((site) => site.name === siteName)?.id ?? null,
    [siteName, sites],
  );

  const projectsQuery = useQuery<DprBoqProject[]>({
    queryKey: ["/api/boq/projects", siteId],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      if (!response.ok) throw new Error("boq_projects_load_failed");
      return response.json();
    },
    enabled: siteId != null,
  });
  const { data: projects = [] } = projectsQuery;

  const projectId = useMemo(
    () => resolveDprBoqProjectId(projects, preferredProjectId),
    [projects, preferredProjectId],
  );

  const { data: items = [] } = useQuery<T[]>({
    queryKey: ["/api/boq/projects", projectId, "items"],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects/${projectId}/items`, { credentials: "include" });
      return response.ok ? response.json() : [];
    },
    enabled: projectId != null,
  });

  return {
    siteId,
    projects,
    projectId,
    items,
    // Consumers that persist the resolved project need to distinguish an
    // empty result while the request is still in flight from a completed
    // request that genuinely returned no projects.
    projectsLoaded: siteId == null ? false : projectsQuery.isSuccess,
  };
}