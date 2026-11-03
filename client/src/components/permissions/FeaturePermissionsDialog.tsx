import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
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
  "view", "add", "edit", "cancel", "verify", "technical_verify",
  "accounts_verify", "approve", "final", "export",
];

const ACTION_LABEL: Record<FeatureAction, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  cancel: "Cancel",
  verify: "Verify",
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

export function FeaturePermissionsDialog({
  userId,
  fullName,
  onClose,
  onSaved,
}: {
  userId: number;
  fullName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    return selectedRoles.some(role => role.ticks[featureId as keyof FeatureTicks]?.[action] === true);
  };
  const hasPersonalChange = (featureId: string, action: FeatureAction): boolean =>
    (personalChanges ?? access?.personalChanges)?.[featureId as keyof FeatureTicks]?.[action] !== undefined;
  const hasAnyPersonalChanges = Object.values(personalChanges ?? access?.personalChanges ?? {})
    .some(ticks => Object.values(ticks ?? {}).some(value => value !== undefined));

  const setPermission = (featureId: string, action: FeatureAction, checked: boolean) => {
    const defaults = selectedRoles.some(role => role.ticks[featureId as keyof FeatureTicks]?.[action] === true);
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
      await queryClient.invalidateQueries();
      onSaved();
    },
  });

  const displayError = save.error instanceof Error ? save.error.message : null;
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-6xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Feature access — {fullName}</DialogTitle>
        </DialogHeader>
        {query.isLoading ? <p className="py-8 text-center">Loading access…</p> : query.isError ? (
          <div className="space-y-3 py-6">
            <p className="text-destructive">Access could not be loaded. No changes have been made.</p>
            <Button variant="outline" onClick={() => query.refetch()}>Retry</Button>
          </div>
        ) : access?.rolesConfigured === false ? (
          <p className="rounded border p-4 text-sm">Role setup required.</p>
        ) : access ? (
          <div className="space-y-5 overflow-y-auto pr-2">
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
                      <div key={feature.id} className="grid gap-2 border-b pb-2 md:grid-cols-[minmax(180px,1fr)_repeat(9,minmax(68px,auto))]">
                                <span className="text-sm font-medium">
                                  {feature.label}
                                  {feature.inactive && <span className="ml-2 text-xs text-muted-foreground">Inactive</span>}
                                  {feature.id === "estimating" && <span className="ml-2 text-xs text-muted-foreground">Owners only</span>}
                                </span>
                        {ACTIONS.filter(action => feature.actions.includes(action)).map(action => (
                          <label key={action} data-personal-change={hasPersonalChange(feature.id, action) || undefined}
                            className={`flex items-center gap-1 text-xs ${hasPersonalChange(feature.id, action) ? "rounded bg-amber-100 px-1 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : ""}`}>
                            <input
                              type="checkbox"
                              aria-label={`${feature.label} ${ACTION_LABEL[action]}`}
                              data-testid={`feature-${feature.id}-${action}`}
                              disabled={feature.inactive || feature.id === "estimating"}
                              checked={effective(feature.id, action)}
                              onChange={event => setPermission(feature.id, action, event.target.checked)}
                            />
                            {ACTION_LABEL[action]}
                          </label>
                        ))}
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
        {displayError && <p role="alert" className="text-sm text-destructive">{displayError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!access || !access.rolesConfigured || save.isPending}>
            {save.isPending ? "Saving…" : "Save access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
