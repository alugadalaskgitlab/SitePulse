import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  appSettings, roles, roleTicks, sites, userPermissions, userRoles, userSiteAccess,
  userTickChanges, users,
} from "@shared/schema";
import {
  DEFAULT_ROLE_TICKS,
  FEATURES,
  FEATURE_ACTIONS,
  ROLE_NAMES,
  legacyFeatureTick,
  type EntryScope,
  type FeatureAccessState,
  type FeatureAction,
  type FeatureId,
  type FeatureTicks,
  type PersonalTickChanges,
  type RoleName,
} from "@shared/featureAccess";
import { emptyMatrix, SECTION_KEYS, type PermissionMatrix, type SectionKey } from "@shared/permissions";

export const ROLES_SETUP_SETTING = "feature_access_roles_initialized";

const ROLE_SCOPES: Record<RoleName, EntryScope> = {
  "Project Head": "all",
  "Project Manager": "all",
  "Sr Engineer": "team",
  "Site Engineer": "own",
  "Supervisor": "own",
  "Foreman": "own",
  "Surveyor": "own",
  "Store In-charge": "all",
  "Store Keeper": "own",
  "Plant Engineer": "all",
  "P&M In-charge": "all",
  "QC Engineer": "all",
  "Procurement": "all",
  "QS / Billing": "all",
  "HR / Site Admin": "all",
  "Accounts": "all",
  "Viewer": "all",
};

function mapFeatureTicks(rows: Array<{ feature: string; action: string; granted: boolean }>): FeatureTicks {
  const out: FeatureTicks = {};
  for (const row of rows) {
    if (!(FEATURES as readonly { id: string }[]).some(f => f.id === row.feature)) continue;
    if (!(FEATURE_ACTIONS as readonly string[]).includes(row.action)) continue;
    const feature = row.feature as FeatureId;
    const action = row.action as FeatureAction;
    out[feature] ??= {};
    out[feature]![action] = row.granted;
  }
  return out;
}

function mapPersonalChanges(rows: Array<{ feature: string; action: string; granted: boolean }>): PersonalTickChanges {
  return mapFeatureTicks(rows);
}

export async function rolesHaveBeenConfigured(): Promise<boolean> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings)
    .where(eq(appSettings.key, ROLES_SETUP_SETTING)).limit(1);
  return row?.value === "true";
}

export async function loadFeatureAccessState(
  userId: number,
  legacyPermissions: PermissionMatrix,
): Promise<FeatureAccessState> {
  const [settingRows, assignedRoles, personalRows, licenseSetting] = await Promise.all([
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, ROLES_SETUP_SETTING)).limit(1),
    db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId)),
    db.select({ feature: userTickChanges.feature, action: userTickChanges.action, granted: userTickChanges.granted })
      .from(userTickChanges).where(eq(userTickChanges.userId, userId)),
    db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "licensed_modules")).limit(1),
  ]);
  const roleIds = assignedRoles.map(row => row.roleId);
  const ticks = roleIds.length
    ? await db.select({
        roleId: roleTicks.roleId,
        feature: roleTicks.feature,
        action: roleTicks.action,
        granted: roleTicks.granted,
      }).from(roleTicks).where(inArray(roleTicks.roleId, roleIds))
    : [];
  const roleTicksById: Record<number, FeatureTicks> = {};
  for (const id of roleIds) {
    roleTicksById[id] = mapFeatureTicks(ticks.filter(row => row.roleId === id));
  }
  let licensedModules: string[] = [];
  try {
    const parsed = licenseSetting[0]?.value ? JSON.parse(licenseSetting[0].value) : [];
    if (Array.isArray(parsed)) licensedModules = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    licensedModules = [];
  }
  return {
    rolesConfigured: settingRows[0]?.value === "true",
    userRoles: roleIds,
    roleTicks: roleTicksById,
    personalChanges: mapPersonalChanges(personalRows),
    legacyPermissions,
    licensedModules,
  };
}

export async function getRolesWithTicks() {
  const roleRows = await db.select().from(roles).orderBy(roles.sort, roles.name);
  const tickRows = roleRows.length
    ? await db.select({
        roleId: roleTicks.roleId,
        feature: roleTicks.feature,
        action: roleTicks.action,
        granted: roleTicks.granted,
      }).from(roleTicks).where(inArray(roleTicks.roleId, roleRows.map(row => row.id)))
    : [];
  return roleRows.map(role => ({
    ...role,
    ticks: mapFeatureTicks(tickRows.filter(tick => tick.roleId === role.id)),
  }));
}

export async function seedDefaultRoles(): Promise<void> {
  await db.transaction(async tx => {
    for (let index = 0; index < ROLE_NAMES.length; index++) {
      const name = ROLE_NAMES[index];
      await tx.insert(roles).values({
        name,
        scopeDefault: ROLE_SCOPES[name],
        sort: index + 1,
      }).onConflictDoNothing({ target: roles.name });
      const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, name)).limit(1);
      if (!role) throw new Error(`Could not create default role ${name}`);
      const defaults = DEFAULT_ROLE_TICKS[name];
      const inserts = Object.entries(defaults).flatMap(([key, granted]) => {
        if (!granted) return [];
        const [feature, action] = key.split(".") as [FeatureId, FeatureAction];
        return [{ roleId: role.id, feature, action, granted: true }];
      });
      if (inserts.length) await tx.insert(roleTicks).values(inserts).onConflictDoNothing({
        target: [roleTicks.roleId, roleTicks.feature, roleTicks.action],
      });
    }
  });
}

export async function getRoleSetupPreview() {
  const allUsers = await db.select().from(users).where(eq(users.isActive, true)).orderBy(users.id);
  const roleRows = await getRolesWithTicks();
  const roleIdByName = new Map(roleRows.map(role => [role.name, role.id]));
  const roleDefaultsById = new Map(roleRows.map(role => [role.id, role.ticks]));
  const previewUsers = [];
  for (const user of allUsers) {
    const currentMatrixRows = await db.select().from(userPermissions).where(eq(userPermissions.userId, user.id));
    const matrix = emptyMatrix();
    for (const row of currentMatrixRows) {
      if ((SECTION_KEYS as readonly string[]).includes(row.sectionKey)) {
        matrix[row.sectionKey as SectionKey] = {
          view: row.canView, create: row.canCreate, edit: row.canEdit, delete: row.canDelete,
          view_reports: row.canViewReports, export: row.canExport, approve: row.canApprove, notify: row.canNotify,
        };
      }
    }
    const suggestedNames = suggestRoleNames(user.businessRole);
    const suggestions = suggestedNames.map(name => roleIdByName.get(name)).filter((id): id is number => id !== undefined);
    const suggestedRoleTicks = mergeRoleTicks(suggestions.map(id => roleDefaultsById.get(id) ?? {}));
    const legacyAccess: PersonalTickChanges = {};
    const legacyTicks: FeatureTicks = {};
    for (const feature of FEATURES) {
      for (const action of feature.actions) {
        const oldAllowed = legacyFeatureTick(matrix, feature.id, action);
        legacyTicks[feature.id] ??= {};
        legacyTicks[feature.id]![action] = oldAllowed;
        const roleAllowed = suggestedRoleTicks[feature.id]?.[action] === true;
        if (oldAllowed !== roleAllowed) {
          legacyAccess[feature.id] ??= {};
          legacyAccess[feature.id]![action] = oldAllowed;
        }
      }
    }
    const selectedSites = await db.select({
      siteId: userSiteAccess.siteId,
      siteName: sites.name,
    }).from(userSiteAccess)
      .leftJoin(sites, eq(userSiteAccess.siteId, sites.id))
      .where(eq(userSiteAccess.userId, user.id));
    previewUsers.push({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      isActive: user.isActive,
      isAdmin: user.isAdmin,
      isOwner: user.isOwner,
      businessRole: user.businessRole,
      suggestedRoleIds: suggestions,
      legacyTicks,
      legacyAccess,
      canUnlockRecords: user.canUnlockRecords,
      currentSiteScope: user.isOwner || user.isAdmin || user.allSitesAccess
        ? "All sites"
        : `Selected sites: ${selectedSites.map(site => site.siteName ?? `#${site.siteId}`).join(", ") || "None"}`,
      allSitesAccess: user.isOwner || user.isAdmin || user.allSitesAccess,
    });
  }
  return { roles: roleRows, users: previewUsers, rolesConfigured: await rolesHaveBeenConfigured() };
}

export async function getUserFeatureAccess(userId: number) {
  const [assignments, changes] = await Promise.all([
    db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, userId)),
    db.select({ feature: userTickChanges.feature, action: userTickChanges.action, granted: userTickChanges.granted })
      .from(userTickChanges).where(eq(userTickChanges.userId, userId)),
  ]);
  return {
    roleIds: assignments.map(row => row.roleId),
    personalChanges: mapPersonalChanges(changes),
  };
}

function suggestRoleNames(raw: string | null | undefined): RoleName[] {
  if (!raw) return [];
  const value = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  const normalized = value.replace(/\s+/g, " ");
  const aliases: Record<string, RoleName> = {
    "project head": "Project Head", "project manager": "Project Manager", "manager": "Project Manager",
    "senior engineer": "Sr Engineer", "sr engineer": "Sr Engineer",
    "site engineer": "Site Engineer", "supervisor": "Supervisor", "foreman": "Foreman",
    "surveyor": "Surveyor", "store incharge": "Store In-charge", "store in charge": "Store In-charge",
    "store keeper": "Store Keeper", "plant engineer": "Plant Engineer", "p&m incharge": "P&M In-charge",
    "p and m incharge": "P&M In-charge", "qc engineer": "QC Engineer", "procurement": "Procurement",
    "qs billing": "QS / Billing", "accounts": "Accounts", "viewer": "Viewer",
    "hr site admin": "HR / Site Admin",
  };
  const role = aliases[normalized];
  return role ? [role] : [];
}

function mergeRoleTicks(matrices: FeatureTicks[]): FeatureTicks {
  const merged: FeatureTicks = {};
  for (const matrix of matrices) {
    for (const [feature, actions] of Object.entries(matrix)) {
      merged[feature as FeatureId] ??= {};
      for (const [action, value] of Object.entries(actions ?? {})) {
        if (value) merged[feature as FeatureId]![action as FeatureAction] = true;
      }
    }
  }
  return merged;
}

export function computePersonalChangesForLegacy(
  matrix: PermissionMatrix,
  roleMatrices: FeatureTicks[],
): PersonalTickChanges {
  const roleTicks = mergeRoleTicks(roleMatrices);
  const changes: PersonalTickChanges = {};
  for (const feature of FEATURES) {
    for (const action of feature.actions) {
      const legacyAllowed = legacyFeatureTick(matrix, feature.id, action);
      const roleAllowed = roleTicks[feature.id]?.[action] === true;
      if (legacyAllowed !== roleAllowed) {
        changes[feature.id] ??= {};
        changes[feature.id]![action] = legacyAllowed;
      }
    }
  }
  return changes;
}

export async function saveUserFeatureAccess(
  userId: number,
  roleIds: number[],
  changes: PersonalTickChanges,
): Promise<void> {
  await db.transaction(async tx => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length) {
      const uniqueRoleIds = roleIds.filter((roleId, index) => roleIds.indexOf(roleId) === index);
      await tx.insert(userRoles).values(uniqueRoleIds.map(roleId => ({ userId, roleId })));
    }
    await tx.delete(userTickChanges).where(eq(userTickChanges.userId, userId));
    const rows = Object.entries(changes).flatMap(([feature, actions]) =>
      Object.entries(actions ?? {}).map(([action, granted]) => ({
        userId,
        feature,
        action,
        granted: !!granted,
      })),
    );
    if (rows.length) await tx.insert(userTickChanges).values(rows);
  });
}

export async function saveRoleFeatureTicks(roleId: number, ticks: FeatureTicks): Promise<void> {
  await db.transaction(async tx => {
    await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).for("update");
    await tx.delete(roleTicks).where(eq(roleTicks.roleId, roleId));
    const rows = Object.entries(ticks).flatMap(([feature, actions]) =>
      Object.entries(actions ?? {}).map(([action, granted]) => ({
        roleId,
        feature,
        action,
        granted: !!granted,
      })),
    );
    if (rows.length) await tx.insert(roleTicks).values(rows);
  });
}

export async function addRole(name: string, scopeDefault: EntryScope) {
  const [created] = await db.insert(roles).values({ name: name.trim(), scopeDefault, sort: 1000 }).returning();
  return created;
}

export async function renameRole(roleId: number, name: string, scopeDefault: EntryScope) {
  const [updated] = await db.update(roles).set({ name: name.trim(), scopeDefault }).where(eq(roles.id, roleId)).returning();
  return updated;
}

export async function removeRole(roleId: number): Promise<"deleted" | "in_use" | "missing"> {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) return "missing";
  const [holder] = await db.select({ id: userRoles.id }).from(userRoles).where(eq(userRoles.roleId, roleId)).limit(1);
  if (holder) return "in_use";
  await db.delete(roles).where(eq(roles.id, roleId));
  return "deleted";
}

export async function markRolesConfigured(): Promise<void> {
  await db.insert(appSettings).values({
    key: ROLES_SETUP_SETTING,
    value: "true",
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: appSettings.key,
    set: { value: "true", updatedAt: new Date() },
  });
}
