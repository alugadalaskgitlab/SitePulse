import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DprBoqProjectOption = {
  id: number;
  name?: string | null;
  status?: string | null;
  barCount?: number | null;
};

export type DprBoqStatusProps = {
  siteName: string;
  siteId: number | null;
  siteResolutionError?: string | null;
  projects: readonly DprBoqProjectOption[];
  projectId: number | null;
  items: readonly unknown[];
  projectsLoading: boolean;
  projectsLoaded: boolean;
  projectsError?: unknown;
  itemsLoading: boolean;
  itemsLoaded: boolean;
  itemsError?: unknown;
  onRetry: () => void | Promise<unknown>;
  onProjectChange?: (projectId: number | null) => void;
  projectChangeDisabled?: boolean;
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Shared status/selection surface for all DPR BOQ flows.
 *
 * A failed request must not look like an empty BOQ.  The status intentionally
 * stays outside BillItemPicker so the picker remains a pure item-selection
 * control and all three DPR pages expose the same loading/error/retry UX.
 */
export function DprBoqStatus({
  siteName,
  siteId,
  siteResolutionError,
  projects,
  projectId,
  items,
  projectsLoading,
  projectsLoaded,
  projectsError,
  itemsLoading,
  itemsLoaded,
  itemsError,
  onRetry,
  onProjectChange,
  projectChangeDisabled = false,
}: DprBoqStatusProps) {
  if (!siteName.trim()) return null;

  if (siteResolutionError) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="dpr-boq-status">
        <span data-testid="dpr-boq-site-error">{siteResolutionError}</span>
      </div>
    );
  }

  if (siteId == null) return null;

  if (projectsError != null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm" data-testid="dpr-boq-status">
        <span className="flex min-w-0 items-center gap-2 text-destructive" data-testid="dpr-boq-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>BOQ projects could not be loaded. {errorMessage(projectsError, "Please try again.")}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void onRetry()} data-testid="dpr-boq-retry">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (projectsLoading || !projectsLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" data-testid="dpr-boq-status">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span data-testid="dpr-boq-loading">Loading BOQ projects…</span>
      </div>
    );
  }

  // A saved project can remain selected while an accessible project response
  // is empty (or no longer contains that row). Keep the retained project
  // context visible so its item request can show a real error/retry instead
  // of silently turning into "no BOQ project".
  if (projects.length === 0 && projectId == null) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="dpr-boq-status">
        <span data-testid="dpr-boq-empty">No BOQ project is available for this site.</span>
      </div>
    );
  }

  const selectedProject = projects.find((project) => project.id === projectId);
  const projectUnavailable = projectId != null && !selectedProject;
  const canChangeProject = !!onProjectChange && !projectChangeDisabled;
  const projectSelector = onProjectChange ? (
    <Select
      value={projectId == null ? "__none__" : String(projectId)}
      onValueChange={(value) => onProjectChange(value === "__none__" ? null : Number(value))}
      disabled={projectChangeDisabled}
    >
      <SelectTrigger className="h-8 min-w-[12rem] max-w-full text-left" data-testid="dpr-boq-project-select">
        <SelectValue placeholder="Select BOQ project" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No BOQ project</SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={String(project.id)}>
            {project.name?.trim() || `Project ${project.id}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <span className="font-medium" data-testid="dpr-boq-project-name">
      {selectedProject?.name?.trim() || (projectId == null ? "No BOQ project" : `Project ${projectId}`)}
    </span>
  );

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2 text-sm" data-testid="dpr-boq-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium shrink-0">BOQ project</span>
          {projectSelector}
          {projectUnavailable && (
            <span className="text-amber-700" data-testid="dpr-boq-project-unavailable">Saved project unavailable</span>
          )}
        </div>
        {!canChangeProject && onProjectChange && projectChangeDisabled && (
          <span className="text-xs text-muted-foreground">Linked project is preserved</span>
        )}
      </div>

      {itemsLoading && (
        <div className="flex items-center gap-2 text-muted-foreground" data-testid="dpr-boq-items-loading">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading BOQ items…
        </div>
      )}
      {itemsError != null && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-destructive" data-testid="dpr-boq-items-error">
          <span className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>BOQ items could not be loaded. {errorMessage(itemsError, "Please try again.")}</span>
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void onRetry()} data-testid="dpr-boq-retry">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}
      {itemsLoaded && itemsError == null && projectId != null && items.length === 0 && (
        <div className="text-muted-foreground" data-testid="dpr-boq-items-empty">
          No DPR-eligible BOQ items are available in this project. Programme bars are not required.
        </div>
      )}
      {itemsLoaded && itemsError == null && projectId == null && (
        <div className="text-muted-foreground" data-testid="dpr-boq-no-project">
          No BOQ project selected. Existing saved references are not changed.
        </div>
      )}
    </div>
  );
}