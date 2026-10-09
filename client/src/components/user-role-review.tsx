import {
  ACTIONS, ACTION_LABELS, SECTION_KEYS, SECTION_LABELS, PERMISSION_GROUPS,
  ROLE_TEMPLATES, emptyMatrix, type PermissionMatrix, type SectionKey, type Action,
} from "@shared/permissions";
import permissionActions from "@shared/permission-actions.generated.json";

const ROLE_ORDER = [
  "operations_director", "project_manager", "site_engineer", "site_supervisor",
  "stores_procurement", "equipment_plant", "billing_measurements", "viewer",
];
export const primaryRoleTemplates = () =>
  ROLE_TEMPLATES
    .filter((role) => !(role as typeof role & { legacy?: boolean }).legacy && !["stores", "procurement", "custom"].includes(role.id))
    .sort((a, b) => ROLE_ORDER.indexOf(a.id) - ROLE_ORDER.indexOf(b.id));

export type RoleChange = { section: SectionKey; action: Action; enabled: boolean };

export function businessRoleLabel(role: string | null | undefined) {
  if (!role) return "Not designated";
  if (role === "administrator") return "Administrator";
  if (role === "custom") return "Custom (no template)";
  return ROLE_TEMPLATES.find((template) => template.id === role)?.label ?? role;
}

// Include every persisted bit, even compatibility aliases and inactive cells.
export function retainedSensitivePermissions(before: PermissionMatrix, after: PermissionMatrix): RoleChange[] {
  const management = new Set<SectionKey>([
    ...PERMISSION_GROUPS.filter((g) => ["access", "admin_tools"].includes(g.id)).flatMap((g) => g.sections),
    "admin_hub", "admin_settings", "app_management",
  ]);
  return SECTION_KEYS.flatMap((section) => ACTIONS
    .filter((action) => (["delete", "export", "notify"].includes(action) || management.has(section))
      && before[section]?.[action] && after[section]?.[action])
    .map((action) => ({ section, action, enabled: true })));
}

export function RetainedAccessReview({ before, after, target }: {
  before: PermissionMatrix; after: PermissionMatrix;
  target?: { isAdmin: boolean; isOwner?: boolean; canManagePermissions: boolean; permissionManagerScope: string | null; canUnlockRecords?: boolean };
}) {
  const retained = retainedSensitivePermissions(before, after);
  return <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 space-y-2" data-testid="role-retained-access">
    <h4 className="font-semibold">Existing sensitive access retained</h4>
    <p>Merge only adds permissions. It does not remove any existing access. Ordinary roles do not grant Administrator or Owner status.</p>
    <ul className="list-disc pl-5">
      {retained.map(({ section, action }) => <li key={`${section}-${action}`}>Retained — {SECTION_LABELS[section]} / {ACTION_LABELS[action]}</li>)}
      {!retained.length && <li>No existing sensitive matrix permissions retained.</li>}
    </ul>
    <p>Account flags remain unchanged: Administrator: {target?.isAdmin ? "enabled" : "off"}; Owner: {target?.isOwner ? "enabled" : "off"}; Permission manager: {target?.canManagePermissions ? `enabled (${target.permissionManagerScope ?? "unspecified scope"})` : "off"}; Record unlock: {target?.canUnlockRecords === undefined ? "not reported — unchanged" : target.canUnlockRecords ? "enabled" : "off"}.</p>
  </div>;
}

// Work on all persisted bits, including compatibility aliases and hidden Notify.
// Capping only affects proposed changes; it must never erase an unowned grant.
export function proposeRole(
  current: PermissionMatrix, template: PermissionMatrix,
  mode: "merge" | "replace", canGrant: (section: SectionKey, action: Action) => boolean,
) {
  const matrix = emptyMatrix();
  const changes: RoleChange[] = [];
  const capped: RoleChange[] = [];
  for (const section of SECTION_KEYS) {
    matrix[section] = { ...current[section] };
    for (const action of ACTIONS) {
      const before = !!current[section]?.[action];
      const desired = mode === "merge" ? before || !!template[section]?.[action] : !!template[section]?.[action];
      if (!canGrant(section, action)) {
        if (desired !== before) capped.push({ section, action, enabled: desired });
        continue;
      }
      matrix[section][action] = desired;
      if (desired !== before) changes.push({ section, action, enabled: desired });
    }
  }
  return { matrix, changes, capped };
}

export function PermissionReview({ matrix, privileged = false }: { matrix: PermissionMatrix; privileged?: boolean }) {
  if (privileged) return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm" data-testid="role-capability-review">
      <p><strong>Can:</strong> Access all sites and administrative functions through the existing Administrator privilege, regardless of matrix switches.</p>
      <p><strong>Cannot:</strong> Receive Owner status through this workflow. Device approval and existing business rules still apply.</p>
    </div>
  );
  const operationalView = SECTION_KEYS.some((section) =>
    !["dashboard", "legacy", "hubs", "access", "admin_tools"].some((id) => PERMISSION_GROUPS.find((g) => g.id === id)?.sections.includes(section))
    && matrix[section]?.view);
  const canOperate = (section: SectionKey) => matrix[section]?.view && matrix[section]?.create && matrix[section]?.edit;
  const privilegedSections: SectionKey[] = ["admin_settings", "data_sync", "admin_ldo_tools",
    "admin_ledger_tools", "admin_notifications_manage", "app_management", "device_approval"];
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-3 text-sm" data-testid="role-capability-review">
      <div>
        <h4 className="font-semibold">Can</h4>
        <p>{operationalView ? "Use the permitted operational sections below, within the assigned site access." : "No operational section has View access. Site assignment alone does not make this account operational."}</p>
        <ul className="list-disc pl-5 space-y-1">
          {canOperate("site_dprs") && <li>Create and edit daily site reports.</li>}
          {canOperate("site_materials") && <li>Record material trips, classify sources and transporters, and link trips to execution arrangements.</li>}
          {canOperate("work_programme") && <li>Manage work programmes and planning.</li>}
          {canOperate("plant_equipment") && <li>Manage equipment and fleet operations.</li>}
          {canOperate("stores_inventory") && <li>Manage stores, receipts and material movements.</li>}
          {canOperate("purchase_indents_raise") && <li>Raise and edit purchase indents.</li>}
          {canOperate("vendor_bills_raise") && <li>Prepare operational vendor bills.</li>}
          {SECTION_KEYS.some((s) => matrix[s]?.approve) && <li>Approve only the transactions permitted below, subject to existing workflow rules.</li>}
          {matrix.report_management?.view && <li>View operational reports.</li>}
        </ul>
      </div>
      <div>
        <h4 className="font-semibold">Cannot</h4>
        <ul className="list-disc pl-5 space-y-1">
          {!SECTION_KEYS.some((s) => matrix[s]?.delete) && <li>Delete records through the permission matrix.</li>}
          {!matrix.user_management?.view && !matrix.user_management?.create && !matrix.user_management?.edit && <li>Manage users.</li>}
          {!ACTIONS.some((a) => matrix.permission_manager?.[a]) && <li>Manage other users’ permissions through this template.</li>}
          {!privilegedSections.some((s) => ACTIONS.some((a) => matrix[s]?.[a])) && <li>Use system configuration, database repair or data-sync administration.</li>}
          <li>Receive Administrator or Owner privileges from an ordinary role.</li>
          <li>Use actions not granted below. Existing workflow, field-user and site restrictions still apply.</li>
        </ul>
      </div>
      <details>
        <summary className="cursor-pointer font-medium">Review section-by-section access and restrictions</summary>
        <div className="mt-2 max-h-60 overflow-y-auto space-y-2">
          {PERMISSION_GROUPS.filter((g) => g.id !== "legacy").map((group) => (
            <div key={group.id}>
              <h5 className="font-semibold">{group.label}</h5>
              {group.sections.map((section) => {
                const actions = permissionActions[section].actions as readonly Action[];
                if (!actions.length) return null;
                const allowed = actions.filter((a) => matrix[section]?.[a]);
                const denied = actions.filter((a) => !matrix[section]?.[a]);
                return <p key={section} className="py-1 border-b last:border-0">
                  <span className="font-medium">{SECTION_LABELS[section]}</span>
                  <span className="block text-muted-foreground">Can: {allowed.map((a) => ACTION_LABELS[a]).join(", ") || "None"}. Cannot: {denied.map((a) => ACTION_LABELS[a]).join(", ") || "No listed actions excluded"}.</span>
                </p>;
              })}
            </div>
          ))}
          <p className="text-muted-foreground">Compatibility aliases and hidden bits are retained in the advanced matrix. This review is not a replacement for backend access checks.</p>
        </div>
      </details>
    </div>
  );
}

export function RoleChangeList({ changes }: { changes: RoleChange[] }) {
  return <ul className="space-y-1 text-sm" data-testid="role-change-list">
    {changes.map(({ section, action, enabled }) => (
      <li key={`${section}-${action}`}><strong>{enabled ? "Grant" : "Remove"}</strong> — {SECTION_LABELS[section]} / {ACTION_LABELS[action]}</li>
    ))}
    {!changes.length && <li>No section/action changes.</li>}
  </ul>;
}
