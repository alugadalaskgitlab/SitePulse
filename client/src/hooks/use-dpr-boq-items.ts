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
  preferredProjectId = null,
}: {
  siteName: string;
  sites: readonly SiteChoice[];
  preferredProjectId?: number | null;
}) {
  const siteId = useMemo(
    () => sites.find((site) => site.name === siteName)?.id ?? null,
    [siteName, sites],
  );

  const { data: projects = [] } = useQuery<DprBoqProject[]>({
    queryKey: ["/api/boq/projects", siteId],
    queryFn: async () => {
      const response = await fetch(`/api/boq/projects?siteId=${siteId}`, { credentials: "include" });
      return response.ok ? response.json() : [];
    },
    enabled: siteId != null,
  });

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

  return { siteId, projects, projectId, items };
}