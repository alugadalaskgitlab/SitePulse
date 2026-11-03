import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import {
  FEATURE_GROUPS,
  FEATURES,
  isFeatureLicensed,
  type EntryScope,
  type FeatureAction,
  type FeatureTicks,
} from "@shared/featureAccess";

type RoleRow = {
  id: number;
  name: string;
  scopeDefault: EntryScope;
  sort: number;
  ticks: FeatureTicks;
};

type SetupUser = {
  id: number;
  fullName: string;
  email: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  businessRole: string | null;
  suggestedRoleIds: number[];
  legacyTicks: FeatureTicks;
  canUnlockRecords: boolean;
  currentSiteScope: string;
};

type SetupPreview = {
  roles: RoleRow[];
  users: SetupUser[];
  rolesConfigured: boolean;
};

type SetupChoice = {
  roleIds: number[];
  isOwner: boolean;
  canUnlockRecords?: boolean;
  adminChoiceConfirmed?: boolean;
};

const ACTION_LABELS: Record<FeatureAction, string> = {
  view: "View",
  add: "Add",
  edit: "Edit",
  cancel: "Cancel",
  verify: "Verify",
  technical_verify: "Technical verify",
  accounts_verify: "Accounts verify",
  approve: "Approve",
  final: "Final",
  export: "Export",
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function roleAccessDiff(user: SetupUser, roleIds: number[], roles: RoleRow[], isOwner = false) {
  if (isOwner) return [];
  const selected = roles.filter(role => roleIds.includes(role.id));
  const changes: Array<{ feature: string; action: string; allow: boolean }> = [];
  for (const feature of FEATURES) {
    for (const action of feature.actions) {
      const restricted = feature.inactive || (feature.id === "estimating" && !isOwner);
      const legacy = !restricted && user.legacyTicks[feature.id]?.[action] === true;
      const roleGranted = !restricted && selected.some(role => role.ticks[feature.id]?.[action] === true);
      if (legacy !== roleGranted) changes.push({ feature: feature.label, action: ACTION_LABELS[action], allow: legacy });
    }
  }
  return changes;
}

function roleAccessPreview(user: SetupUser, roleIds: number[], roles: RoleRow[], isOwner: boolean) {
  const selected = roles.filter(role => roleIds.includes(role.id));
  return FEATURES.flatMap(feature => feature.actions.map(action => {
    const restricted = feature.inactive || (feature.id === "estimating" && !isOwner);
    const roleGranted = !restricted && selected.some(role => role.ticks[feature.id]?.[action] === true);
    const legacyGranted = !restricted && user.legacyTicks[feature.id]?.[action] === true;
    const personalChange = !isOwner && roleGranted !== legacyGranted;
    return {
      featureId: feature.id,
      featureLabel: feature.label,
      actionLabel: ACTION_LABELS[action],
      allowed: !feature.inactive && (isOwner || (personalChange ? legacyGranted : roleGranted)),
      personalChange,
    };
  }));
}

export default function AccessRoles() {
  const { user, featureAccess } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Record<number, SetupChoice>>({});
  const [activeRoleId, setActiveRoleId] = useState<number | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleRow | null>(null);
  const [newRoleName, setNewRoleName] = useState("");
  const [setupConfirmation, setSetupConfirmation] = useState(false);

  const rolesQuery = useQuery<{ roles: RoleRow[] }>({
    queryKey: ["/api/access-control/roles"],
    queryFn: () => getJson("/api/access-control/roles"),
  });
  const previewQuery = useQuery<SetupPreview>({
    queryKey: ["/api/access-control/setup-preview"],
    queryFn: () => getJson("/api/access-control/setup-preview"),
  });

  useEffect(() => {
    const preview = previewQuery.data;
    if (!preview || !rolesQuery.data || (!rolesQuery.data.roles.length && !preview.rolesConfigured)) return;
    setChoices(current => {
      if (Object.keys(current).length) return current;
      return Object.fromEntries(preview.users.map(person => [
        person.id,
        {
          roleIds: person.suggestedRoleIds,
          isOwner: person.isOwner,
          canUnlockRecords: person.canUnlockRecords,
          adminChoiceConfirmed: !person.isAdmin || person.isOwner,
        },
      ]));
    });
  }, [previewQuery.data, rolesQuery.data]);

  const roles = rolesQuery.data?.roles ?? [];
  const setup = previewQuery.data;
  const rolesConfigured = setup?.rolesConfigured ?? false;
  const activeRole = roles.find(role => role.id === activeRoleId) ?? null;
  const unresolvedAdmins = (setup?.users ?? []).filter(person => {
    if (!person.isAdmin || person.isOwner) return false;
    const choice = choices[person.id] ?? {
      roleIds: person.suggestedRoleIds,
      isOwner: person.isOwner,
      adminChoiceConfirmed: false,
    };
    return !choice.isOwner && (choice.roleIds.length === 0 || !choice.adminChoiceConfirmed);
  });

  useEffect(() => {
    if (!roleDraft && activeRole) setRoleDraft({ ...activeRole, ticks: structuredClone(activeRole.ticks) });
  }, [activeRole, roleDraft]);

  const saveSetup = useMutation({
    mutationFn: () => apiRequest("POST", "/api/access-control/setup", {
      users: (setup?.users ?? []).map(person => ({
        userId: person.id,
        roleIds: choices[person.id]?.roleIds ?? [],
        isOwner: choices[person.id]?.isOwner ?? person.isOwner,
        canUnlockRecords: choices[person.id]?.canUnlockRecords ?? person.canUnlockRecords,
        adminChoiceConfirmed: choices[person.id]?.adminChoiceConfirmed ?? (!person.isAdmin || person.isOwner),
      })),
    }),
    onSuccess: async () => {
      setMessage("Role setup saved. Feature access now uses the new roles and personal changes.");
      setSetupConfirmation(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/access-control/setup-preview"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
      ]);
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const seedRoles = useMutation({
    mutationFn: () => apiRequest("POST", "/api/access-control/roles/seed", {}),
    onSuccess: async () => {
      setMessage("Default roles are ready to review.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/access-control/roles"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/access-control/setup-preview"] }),
      ]);
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const saveRole = useMutation({
    mutationFn: () => {
      if (!roleDraft) throw new Error("Choose a role first.");
      return apiRequest("PATCH", `/api/access-control/roles/${roleDraft.id}`, {
        name: roleDraft.name,
        scopeDefault: roleDraft.scopeDefault,
        ticks: roleDraft.ticks,
      });
    },
    onSuccess: async () => {
      setMessage("Role saved.");
      await queryClient.invalidateQueries({ queryKey: ["/api/access-control/roles"] });
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const addRole = useMutation({
    mutationFn: () => apiRequest("POST", "/api/access-control/roles", { name: newRoleName, scopeDefault: "all" }),
    onSuccess: async () => {
      setNewRoleName("");
      await queryClient.invalidateQueries({ queryKey: ["/api/access-control/roles"] });
      setMessage("Role added. Configure its ticks before assigning it.");
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const deleteRole = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/access-control/roles/${id}`),
    onSuccess: async () => {
      setActiveRoleId(null);
      setRoleDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/access-control/roles"] });
      setMessage("Role deleted.");
    },
    onError: (error: Error) => setMessage(error.message),
  });

  const toggleChoiceRole = (userId: number, roleId: number) => {
    const person = setup?.users.find(row => row.id === userId);
    if (!person) return;
    const current = choices[userId] ?? {
      roleIds: person.suggestedRoleIds,
      isOwner: person.isOwner,
      canUnlockRecords: person.canUnlockRecords,
      adminChoiceConfirmed: !person.isAdmin || person.isOwner,
    };
    const roleIds = current.roleIds.includes(roleId)
      ? current.roleIds.filter(id => id !== roleId)
      : [...current.roleIds, roleId];
    setChoices({ ...choices, [userId]: { ...current, roleIds } });
  };

  const currentScopeOptions = useMemo(() => [
    { value: "own", label: "Own" },
    { value: "team", label: "Team" },
    { value: "all", label: "All" },
  ], []);

  const setRoleTick = (featureId: string, action: FeatureAction, granted: boolean) => {
    setRoleDraft(current => {
      if (!current) return current;
      const ticks = { ...current.ticks, [featureId]: { ...current.ticks[featureId as keyof FeatureTicks] } };
      ticks[featureId as keyof FeatureTicks]![action] = granted;
      return { ...current, ticks };
    });
  };

  if (rolesQuery.isLoading || previewQuery.isLoading) {
    return <main className="mx-auto max-w-6xl p-6">Loading access settings…</main>;
  }
  if (rolesQuery.isError || previewQuery.isError || !setup) {
    return <main className="mx-auto max-w-6xl p-6 text-red-700">Access settings could not be loaded.</main>;
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Roles</h1>
        </div>
      </header>
      {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}

      {!rolesConfigured ? (
        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-lg font-semibold">Set up roles</h2>
          </div>
          {roles.length === 0 ? (
            <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => seedRoles.mutate()} disabled={seedRoles.isPending}>
              {seedRoles.isPending ? "Preparing roles…" : "Load default roles"}
            </button>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full border-collapse text-sm">
                  <thead><tr className="border-b text-left">
                    <th className="p-2">Person</th><th className="p-2">Roles</th><th className="p-2">Current site scope</th><th className="p-2">Record unlock</th><th className="p-2">Owner</th><th className="p-2">Resulting access</th>
                  </tr></thead>
                  <tbody>
                    {[...setup.users].sort((a, b) => Number(b.isAdmin && !b.isOwner) - Number(a.isAdmin && !a.isOwner)).map(person => {
                      const choice = choices[person.id] ?? {
                        roleIds: person.suggestedRoleIds,
                        isOwner: person.isOwner,
                        canUnlockRecords: person.canUnlockRecords,
                        adminChoiceConfirmed: !person.isAdmin || person.isOwner,
                      };
                      const changes = roleAccessDiff(person, choice.roleIds, roles, choice.isOwner);
                      const resultingTicks = roleAccessPreview(person, choice.roleIds, roles, choice.isOwner);
                      return (
                        <tr key={person.id} className="border-b align-top">
                          <td className="p-2"><div className="font-medium">{person.fullName}</div><div className="text-xs text-muted-foreground">{person.email || "No email"}</div>{person.isAdmin && <span className="text-xs">Current Admin</span>}</td>
                          <td className="p-2">
                            <div className="grid gap-1 sm:grid-cols-2">
                              {roles.map(role => (
                                <label key={role.id} className="flex items-center gap-2">
                                  <input type="checkbox" checked={choice.roleIds.includes(role.id)} onChange={() => toggleChoiceRole(person.id, role.id)} />
                                  {role.name}
                                </label>
                              ))}
                            </div>
                            {person.isAdmin && !person.isOwner && !choice.isOwner && (
                              <label className="mt-2 flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={!!choice.adminChoiceConfirmed} onChange={event => setChoices({
                                  ...choices,
                                  [person.id]: { ...choice, adminChoiceConfirmed: event.target.checked },
                                })} />
                                Confirm selected roles
                              </label>
                            )}
                          </td>
                          <td className="p-2">{person.currentSiteScope}</td>
                          <td className="p-2">
                            <label className="flex items-center gap-2">
                              <input type="checkbox" aria-label={`Allow ${person.fullName} to unlock records`} checked={choice.canUnlockRecords ?? person.canUnlockRecords} onChange={event => setChoices({
                                ...choices,
                                [person.id]: { ...choice, canUnlockRecords: event.target.checked },
                              })} />
                              {choice.canUnlockRecords ?? person.canUnlockRecords ? "Allowed" : "Not allowed"}
                            </label>
                          </td>
                          <td className="p-2"><input type="checkbox" aria-label={`Make ${person.fullName} an Owner`} checked={choice.isOwner} disabled={person.id === user?.id && person.isOwner} onChange={event => setChoices({
                            ...choices,
                            [person.id]: { ...choice, isOwner: event.target.checked, adminChoiceConfirmed: true },
                          })} /></td>
                          <td className="p-2">
                            <div className="space-y-2">
                              <details>
                                <summary className="cursor-pointer">{changes.length} personal changes</summary>
                                <ul className="mt-2 space-y-1 text-xs">
                                  {changes.map((change, index) => (
                                    <li key={`${change.feature}-${change.action}-${index}`} className={change.allow ? "text-amber-800" : "text-amber-800"}>
                                      {change.allow ? "Personal grant" : "Personal removal"} · {change.feature} · {change.action}
                                    </li>
                                  ))}
                                  {!changes.length && <li>None</li>}
                                </ul>
                              </details>
                              <details>
                                <summary className="cursor-pointer">Resulting ticks</summary>
                                <div className="mt-2 max-h-72 space-y-3 overflow-y-auto text-xs">
                                  {FEATURE_GROUPS.filter(group => FEATURES.some(feature =>
                                    feature.group === group.id && isFeatureLicensed(feature.id, featureAccess?.licensedModules)
                                  )).map(group => (
                                    <section key={group.id}>
                                      <h4 className="font-semibold">{group.label}</h4>
                                      {FEATURES.filter(feature => feature.group === group.id && isFeatureLicensed(feature.id, featureAccess?.licensedModules)).map(feature => (
                                        <div key={feature.id} className="border-b py-1">
                                  <div className="font-medium">
                                    {feature.label}
                                    {feature.inactive ? " · Inactive" : feature.id === "estimating" ? " · Owners only" : ""}
                                  </div>
                                          <ul className="grid gap-x-3 sm:grid-cols-2">
                                            {resultingTicks.filter(tick => tick.featureId === feature.id).map(tick => (
                                              <li key={tick.actionLabel} className={tick.personalChange ? "text-amber-800" : "text-muted-foreground"}>
                                                {tick.actionLabel}: {tick.personalChange
                                                  ? tick.allowed ? "Personal grant" : "Personal removal"
                                                  : tick.allowed ? choice.isOwner ? "Owner" : "Role" : "Not allowed"}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ))}
                                    </section>
                                  ))}
                                </div>
                              </details>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {setupConfirmation ? (
                <div className="flex flex-wrap items-center gap-3 rounded border border-amber-400 bg-amber-50 p-3">
                  <span className="text-sm">Confirm setup for all users?</span>
                  <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => saveSetup.mutate()} disabled={saveSetup.isPending || unresolvedAdmins.length > 0}>
                    {saveSetup.isPending ? "Saving…" : "Confirm setup"}
                  </button>
                  <button className="rounded border px-4 py-2" onClick={() => setSetupConfirmation(false)}>Cancel</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {unresolvedAdmins.length > 0 && <span role="alert" className="text-sm text-destructive">Choose Owner or role for each Admin and confirm the selected roles.</span>}
                  <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => setSetupConfirmation(true)} disabled={unresolvedAdmins.length > 0}>
                    Set up roles
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-3 rounded-lg border p-4">
            <h2 className="font-semibold">Roles</h2>
            <ul className="space-y-1">
              {roles.map(role => (
                <li key={role.id}>
                  <button className={`w-full rounded px-3 py-2 text-left ${activeRoleId === role.id ? "bg-muted font-medium" : "hover:bg-muted/60"}`} onClick={() => {
                    setActiveRoleId(role.id);
                    setRoleDraft({ ...role, ticks: structuredClone(role.ticks) });
                  }}>{role.name}</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input value={newRoleName} onChange={event => setNewRoleName(event.target.value)} className="min-w-0 flex-1 rounded border px-2 py-1" placeholder="New role name" />
              <button className="rounded border px-3 py-1" onClick={() => addRole.mutate()} disabled={!newRoleName.trim() || addRole.isPending}>Add</button>
            </div>
          </aside>
          {roleDraft ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-sm">Role name
                  <input className="rounded border px-3 py-2" value={roleDraft.name} onChange={event => setRoleDraft({ ...roleDraft, name: event.target.value })} />
                </label>
                <label className="grid gap-1 text-sm">Whose entries
                  <select className="rounded border px-3 py-2" value={roleDraft.scopeDefault} onChange={event => setRoleDraft({ ...roleDraft, scopeDefault: event.target.value as EntryScope })}>
                    {currentScopeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <button className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => saveRole.mutate()} disabled={saveRole.isPending}>
                  {saveRole.isPending ? "Saving…" : "Save role"}
                </button>
                <button className="rounded border px-4 py-2 text-destructive" onClick={() => deleteRole.mutate(roleDraft.id)} disabled={deleteRole.isPending}>
                  Delete role
                </button>
              </div>
              <div className="space-y-5">
                {FEATURE_GROUPS.filter(group => FEATURES.some(feature =>
                  feature.group === group.id && isFeatureLicensed(feature.id, featureAccess?.licensedModules)
                )).map(group => (
                  <section key={group.id}>
                    <h3 className="mb-2 border-b pb-1 font-semibold">{group.label}</h3>
                    <div className="space-y-2">
                      {FEATURES.filter(feature => feature.group === group.id && isFeatureLicensed(feature.id, featureAccess?.licensedModules)).map(feature => (
                        <div key={feature.id} className="grid gap-2 border-b pb-2 md:grid-cols-[minmax(200px,1fr)_repeat(9,minmax(68px,auto))]">
                          <div className="font-medium">
                            {feature.label}
                            {feature.inactive && <span className="ml-2 text-xs text-muted-foreground">Not active</span>}
                            {!feature.inactive && feature.id === "estimating" && <span className="ml-2 text-xs text-muted-foreground">Owners only</span>}
                          </div>
                          {feature.actions.map(action => (
                            <label key={action} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                aria-label={`${feature.label} ${ACTION_LABELS[action]}`}
                                data-testid={`role-tick-${feature.id}-${action}`}
                                disabled={feature.inactive || feature.id === "estimating"}
                                checked={roleDraft.ticks[feature.id]?.[action] === true}
                                onChange={event => setRoleTick(feature.id, action, event.target.checked)}
                              />
                              {ACTION_LABELS[action]}
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          ) : <div className="rounded-lg border p-8 text-sm text-muted-foreground">Choose a role to edit its feature and action ticks.</div>}
        </section>
      )}
    </main>
  );
}
