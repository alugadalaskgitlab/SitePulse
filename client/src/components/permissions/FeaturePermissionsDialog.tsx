import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { AppErrorBoundary } from "@/components/AppRecovery";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FEATURE_GROUPS,
  FEATURES,
  isFeatureLicensed,
  type EntryScope,
  type FeatureAction,
  type FeatureTicks,
} from "@shared/featureAccess";

type AccessRole = { id: number; name: string; scopeDefault: EntryScope; ticks: FeatureTicks };
type AccessData = {
  roleIds: number[];
  personalChanges: FeatureTicks;
  roles: AccessRole[];
  rolesConfigured: boolean;
  licensedModules?: string[];
  canUnlockRecords: boolean;
};

const ACTIONS: FeatureAction[] = [
  "view", "add", "edit", "cancel", "verify", "allocate", "technical_verify",
  "accounts_verify", "approve", "final", "export",
];

const ACTION_LABEL: Record<FeatureAction, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  cancel: "Cancel",
  verify: "Verify",
  allocate: "Allocate",
  technical_verify: "Technical",
  accounts_verify: "Accounts",
  approve: "Approve",
  final: "Final",
  export: "Export",
};

async function fetchAccess(userId: number): Promise<AccessData> {
  const response = await fetch(`/api/auth/users/${userId}/feature-access`, { credentials: "include" });
  if (!response.ok) throw new Error(`Could not load access (${response.status})`);
  return response.json() as Promise<AccessData>;
}

function errorMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const raw = error.message.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.message === "string") return parsed.message;
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    // Keep plain-text server errors readable.
  }
  return raw;
}

type FeaturePermissionsDialogProps = {
  userId: number;
  fullName: string;
  onClose: () => void;
  onSaved: () => void;
};

export function FeaturePermissionsDialog(props: FeaturePermissionsDialogProps) {
  const { onClose } = props;
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <AppErrorBoundary
        fallback={
          <DialogContent className="w-[calc(100vw-1rem)] max-w-lg">
            <DialogHeader>
              <DialogTitle>Access window couldn’t be loaded</DialogTitle>
            </DialogHeader>
            <p role="alert" className="py-4 text-sm text-muted-foreground">
              Something went wrong while showing this person’s access. No changes were saved.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </DialogContent>
        }
      >
        <FeaturePermissionsDialogContent {...props} />
      </AppErrorBoundary>
    </Dialog>
  );
}

function FeaturePermissionsDialogContent({
  userId,
  fullName,
  onClose,
  onSaved,
}: FeaturePermissionsDialogProps) {
  const { isOwner } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["/api/auth/users", userId, "feature-access"],
    queryFn: () => fetchAccess(userId),
  });
  const [personalChanges, setPersonalChanges] = useState<FeatureTicks | null>(null);
  const [canUnlockRecords, setCanUnlockRecords] = useState<boolean | null>(null);
  const access = query.data;
  const selectedRoles = useMemo(
    () => access?.roles.filter(role => access.roleIds.includes(role.id)) ?? [],
    [access],
  );

  const effective = (featureId: string, action: FeatureAction): boolean => {
    const override = (personalChanges ?? access?.personalChanges)?.[featureId as keyof FeatureTicks]?.[action];
    if (override !== undefined) return override;
    return selectedRoles.some(role => role.ticks?.[featureId as keyof FeatureTicks]?.[action] === true);
  };
  const hasPersonalChange = (featureId: string, action: FeatureAction): boolean =>
    (personalChanges ?? access?.personalChanges)?.[featureId as keyof FeatureTicks]?.[action] !== undefined;
  const hasAnyPersonalChanges = Object.values(personalChanges ?? access?.personalChanges ?? {})
    .some(ticks => Object.values(ticks ?? {}).some(value => value !== undefined));

  const setPermission = (featureId: string, action: FeatureAction, checked: boolean) => {
    const defaults = selectedRoles.some(role => role.ticks?.[featureId as keyof FeatureTicks]?.[action] === true);
    setPersonalChanges(current => {
      const next = structuredClone(current ?? access?.personalChanges ?? {}) as FeatureTicks;
      next[featureId as keyof FeatureTicks] ??= {};
      if (checked === defaults) delete next[featureId as keyof FeatureTicks]![action];
      else next[featureId as keyof FeatureTicks]![action] = checked;
      if (!Object.keys(next[featureId as keyof FeatureTicks] ?? {}).length) delete next[featureId as keyof FeatureTicks];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!access) throw new Error("Access data is not ready.");
      await apiRequest("PUT", `/api/auth/users/${userId}/feature-access`, {
        roleIds: access.roleIds,
        personalChanges: personalChanges ?? access.personalChanges,
      });
      if (isOwner && canUnlockRecords !== null && canUnlockRecords !== access.canUnlockRecords) {
        await apiRequest("PATCH", `/api/auth/users/${userId}/record-unlock`, { canUnlockRecords });
      }
    },
    onSuccess: async () => {
      // Refresh only the affected user's access and the user list. Invalidating
      // every active query can tear down unrelated screens after this dialog saves.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/auth/users", userId, "feature-access"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] }),
      ]);
      onSaved();
    },
  });

  const displayError = errorMessage(save.error);
  return (
    <DialogContent className="flex h-[90dvh] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>Feature access — {fullName}</DialogTitle>
        </DialogHeader>
        <div data-testid="feature-access-scroll-area" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
          {query.isLoading ? <p className="py-8 text-center">Loading access…</p> : query.isError ? (
            <div className="space-y-3 py-6">
              <p className="text-destructive">Access could not be loaded. No changes have been made.</p>
              <Button variant="outline" onClick={() => query.refetch()}>Retry</Button>
            </div>
          ) : access?.rolesConfigured === false ? (
            <p className="rounded border p-4 text-sm">Role setup required.</p>
          ) : access ? (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 font-semibold">Roles</h3>
              <p className="text-sm">{selectedRoles.map(role => role.name).join(", ") || "No roles assigned"}</p>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Feature actions</h3>
                <Button variant="outline" size="sm" disabled={!hasAnyPersonalChanges || save.isPending} onClick={() => setPersonalChanges({})}>
                  Reset to role
                </Button>
              </div>
              {FEATURE_GROUPS.filter(group => FEATURES.some(feature =>
                feature.group === group.id && isFeatureLicensed(feature.id, access.licensedModules)
              )).map(group => (
                <div key={group.id}>
                  <h4 className="mb-2 border-b pb-1 text-sm font-semibold">{group.label}</h4>
                  <div className="space-y-2">
                    {FEATURES.filter(feature => feature.group === group.id && isFeatureLicensed(feature.id, access.licensedModules)).map(feature => (
                      <div key={feature.id} className="grid gap-2 border-b pb-2 md:grid-cols-[minmax(160px,1fr)_minmax(0,3fr)]">
                        <span className="text-sm font-medium">
                          {feature.label}
                          {feature.inactive && <span className="ml-2 text-xs text-muted-foreground">Inactive</span>}
                          {feature.description && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{feature.description}</span>}
                        </span>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                        {ACTIONS.filter(action => feature.actions.includes(action)).map(action => (
                          <label key={action} data-personal-change={hasPersonalChange(feature.id, action) || undefined}
                            className={`flex items-center gap-1 text-xs ${hasPersonalChange(feature.id, action) ? "rounded bg-amber-100 px-1 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : ""}`}>
                            <input
                              type="checkbox"
                              aria-label={`${feature.label} ${ACTION_LABEL[action]}`}
                              data-testid={`feature-${feature.id}-${action}`}
                              disabled={feature.inactive}
                              checked={effective(feature.id, action)}
                              onChange={event => setPermission(feature.id, action, event.target.checked)}
                            />
                            {ACTION_LABEL[action]}
                          </label>
                        ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {isOwner && (
              <label className="flex items-center gap-2 rounded border p-3 text-sm">
                <input type="checkbox" checked={canUnlockRecords ?? access.canUnlockRecords} onChange={event => setCanUnlockRecords(event.target.checked)} />
                Allow this person to unlock records
              </label>
            )}
          </div>
          ) : null}
        </div>
        {displayError && <p role="alert" className="shrink-0 pt-2 text-sm text-destructive">{displayError}</p>}
        <DialogFooter className="shrink-0 border-t pt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!access || !access.rolesConfigured || save.isPending}>
            {save.isPending ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}
