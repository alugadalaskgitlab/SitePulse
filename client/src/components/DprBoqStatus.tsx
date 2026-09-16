import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  /** Site directory state is distinct from a BOQ project-empty response. */
  sitesLoading?: boolean;
  sitesLoaded?: boolean;
  sitesError?: unknown;
  onRetrySites?: () => void | Promise<unknown>;
  onRetry: () => void | Promise<unknown>;
  onProjectChange?: (projectId: number | null) => void;
  projectChangeDisabled?: boolean;
  /**
   * A saved null is never auto-resolved. When there are no references, offer a
   * deliberate recovery path, but require a second affirmative action before
   * attaching the DPR to a site BOQ project.
   */
  projectRecoveryRequired?: boolean;
  /** Reopen a locally persisted recovery intent after a refresh. */
  pendingRecoveryProjectId?: number | null;
  onRecoveryPendingChange?: (projectId: number | null) => void;
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
  sitesLoading = false,
  sitesLoaded = true,
  sitesError,
  onRetrySites,
  onRetry,
  onProjectChange,
  projectChangeDisabled = false,
  projectRecoveryRequired = false,
  pendingRecoveryProjectId: persistedPendingRecoveryProjectId = null,
  onRecoveryPendingChange,
}: DprBoqStatusProps) {
  const [pendingRecoveryProjectId, setPendingRecoveryProjectId] = useState<number | null>(
    persistedPendingRecoveryProjectId,
  );
  const pendingContextRef = useRef<{ siteName: string; siteId: number | null; projectId: number | null }>({
    siteName,
    siteId,
    projectId,
  });
  const projectOptionKey = useMemo(
    () => projects
      .map((project) => `${project.id}:${project.name ?? ""}:${project.status ?? ""}`)
      .join("|"),
    [projects],
  );

  // A confirmation belongs to one site, selected project and option set. Do
  // not let a modal opened before a refetch/site switch confirm a target that
  // is no longer shown by the current form.
  useEffect(() => {
    setPendingRecoveryProjectId(persistedPendingRecoveryProjectId);
    if (persistedPendingRecoveryProjectId != null) {
      pendingContextRef.current = { siteName, siteId, projectId };
    }
  }, [persistedPendingRecoveryProjectId]);
  useEffect(() => {
    if (pendingRecoveryProjectId == null) return;
    const siteNameChanged = pendingContextRef.current.siteName !== siteName;
    const projectChanged = pendingContextRef.current.projectId !== projectId;
    const siteLookupPending = sitesLoading || !sitesLoaded;
    const contextChanged = siteNameChanged
      || projectChanged
      || (
        !siteLookupPending
        && sitesError == null
        && siteResolutionError == null
        && (
          siteId == null
          || (
            pendingContextRef.current.siteId != null
            && pendingContextRef.current.siteId !== siteId
          )
        )
      );
    if (contextChanged) {
      setPendingRecoveryProjectId(null);
      onRecoveryPendingChange?.(null);
      return;
    }
    // During the initial lookup there is no option set to validate against;
    // preserve a restored target until the request settles. Errors still
    // clear it, and a completed refetch below revalidates it.
    if (
      (siteLookupPending || projectsLoading || !projectsLoaded)
      && sitesError == null
      && projectsError == null
    ) return;
    // A pending target may have been restored before the site directory
    // resolved (siteId was null). Once that same named site resolves, adopt
    // the ID as the validated context instead of treating normal hydration
    // as a site switch.
    if (pendingContextRef.current.siteId == null && siteId != null) {
      pendingContextRef.current = { ...pendingContextRef.current, siteId };
    }
    const targetStillAvailable = projects.some((project) => project.id === pendingRecoveryProjectId);
    if (
      !siteName.trim()
      || siteId == null
      || sitesError != null
      || projectId != null
      || !projectRecoveryRequired
      || projectChangeDisabled
      || projectsError != null
      || !targetStillAvailable
    ) {
      setPendingRecoveryProjectId(null);
      onRecoveryPendingChange?.(null);
    }
  }, [
    siteName,
    siteId,
    siteResolutionError,
    sitesLoading,
    sitesLoaded,
    sitesError,
    projectId,
    projectRecoveryRequired,
    projectChangeDisabled,
    projectsLoading,
    projectsLoaded,
    projectsError,
    projectOptionKey,
    projects,
    pendingRecoveryProjectId,
    onRecoveryPendingChange,
  ]);

  const setPendingRecovery = (projectId: number | null) => {
    setPendingRecoveryProjectId(projectId);
    pendingContextRef.current = { siteName, siteId, projectId: null };
    onRecoveryPendingChange?.(projectId);
  };

  if (sitesError != null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm" data-testid="dpr-boq-status">
        <span className="flex min-w-0 items-center gap-2 text-destructive" data-testid="dpr-boq-sites-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Sites could not be loaded. {errorMessage(sitesError, "Please try again.")}</span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void (onRetrySites ?? onRetry)()} data-testid="dpr-boq-sites-retry">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry sites
        </Button>
      </div>
    );
  }

  if (sitesLoading || !sitesLoaded) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" data-testid="dpr-boq-status">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span data-testid="dpr-boq-sites-loading">Loading sites…</span>
      </div>
    );
  }

  // A new form has no site name yet, but a failed/in-flight site directory
  // still needs to be visible so the user can retry instead of seeing a
  // silently empty BOQ area.
  if (!siteName.trim()) return null;

  if (siteResolutionError) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="dpr-boq-status">
        <span data-testid="dpr-boq-site-error">{siteResolutionError}</span>
      </div>
    );
  }

  if (siteId == null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="dpr-boq-status">
        <span data-testid="dpr-boq-site-missing">
          The selected site could not be found in the sites you can access. Choose a listed site before loading BOQ projects.
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => void (onRetrySites ?? onRetry)()} data-testid="dpr-boq-site-retry">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh sites
        </Button>
      </div>
    );
  }

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
  const requestProjectChange = (nextProjectId: number | null) => {
    if (projectRecoveryRequired && nextProjectId != null) {
      setPendingRecovery(nextProjectId);
      return;
    }
    onProjectChange?.(nextProjectId);
  };
  const pendingRecoveryProject = projects.find((project) => project.id === pendingRecoveryProjectId);
  const projectSelector = onProjectChange ? (
    <Select
      value={projectId == null ? "__none__" : String(projectId)}
      onValueChange={(value) => requestProjectChange(value === "__none__" ? null : Number(value))}
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
          {projectRecoveryRequired
            ? "This saved DPR has no BOQ project. Choose an available project above to attach it; existing saved references are not changed."
            : "No BOQ project selected. Existing saved references are not changed."}
        </div>
      )}
      <AlertDialog
        open={pendingRecoveryProjectId != null}
        onOpenChange={(open) => { if (!open) setPendingRecovery(null); }}
      >
        <AlertDialogContent data-testid="dpr-boq-project-recovery-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Attach this DPR to a BOQ project?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRecoveryProject?.name?.trim() || "The selected project"} will be attached to this saved DPR.
              This is only allowed when the DPR has no BOQ-linked rows. It does not remap or change any saved quantities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-boq-project-recovery">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-boq-project-recovery"
              onClick={() => {
                const targetId = pendingRecoveryProjectId;
                const targetStillValid = targetId != null
                  && siteName.trim().length > 0
                  && siteId != null
                  && !sitesLoading
                  && sitesLoaded
                  && sitesError == null
                  && projectId == null
                  && projectRecoveryRequired
                  && !projectChangeDisabled
                  && !projectsLoading
                  && projectsLoaded
                  && projectsError == null
                  && projects.some((project) => project.id === targetId);
                if (targetStillValid) onProjectChange?.(targetId);
                setPendingRecovery(null);
              }}
            >
              Attach project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}