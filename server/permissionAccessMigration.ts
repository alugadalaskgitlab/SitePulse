import type { Pool } from "pg";
import catalogue from "../shared/permission-actions.generated.json";

export const ACCESS_MIGRATION_KEY = "permission-access-preservation:PERM-PROD-01";
export const ACCESS_AUDIT_PREFIX = `${ACCESS_MIGRATION_KEY}:change:`;
// Sources: reports/perm-03b2/key-page-map.csv, qto-reference-disposition.csv,
// status-report.html ("Norms edits ...; Edit Requests ..."), and the completed
// original-to-new split captured in scripts/permission-delegation-migration.ts.
export const ACCESS_CARRY_MAPPING = [
  ...["planning_masters", "work_programme", "work_programme_review", "norms_library"]
    .map(target => ({ source: "qto_boq", target })),
  { source: "admin_settings", target: "edit_requests_review" },
  { source: "user_management", target: "edit_requests_review" },
];
// The generated catalogue records real live View gates, excluding dead cells.
export const ACCESS_VIEW_SECTIONS = Object.entries(catalogue)
  .filter(([, value]) => (value.actions as readonly string[]).includes("view"))
  .map(([key]) => key);
export const NEWLY_GATED_PAGES = [
  { page: "/estimator-hub", section: "estimator_portal" },
  { page: "/concrete-calculator", section: "concrete_calculator" },
  { page: "/concrete-calculator-v2", section: "concrete_calculator" },
  ...["/admin/mix-estimates", "/admin/mix-impact", "/admin/mix-comparison", "/admin/scenario-comparison"]
    .map(page => ({ page, section: "mix_calculator" })),
  { page: "/site", section: "site_hub" },
  { page: "/plant", section: "hmp_hub" },
  { page: "/plant/dashboard", section: "hmp_hub" },
];
type QueryPool = Pick<Pool, "query" | "connect">;
export interface AccessChange {
  id: number; userId: number; userName: string; sectionKey: string;
  action: "view"; before: false; after: true; reason: string;
}
const markerSql = "SELECT value FROM app_settings WHERE key=$1";

/** Warm starts perform exactly ONE SELECT. Completion and audit commit atomically.
 * No environment inspection, credentials, production connection, or recurring job.
 */
export async function runPermissionAccessMigration(pool: QueryPool) {
  if ((await pool.query(markerSql, [ACCESS_MIGRATION_KEY])).rows.length) {
    return { applied: false, changedRows: 0, markerChecks: 1 };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(72403101)");
    if ((await client.query(markerSql, [ACCESS_MIGRATION_KEY])).rows.length) {
      await client.query("COMMIT");
      return { applied: false, changedRows: 0, concurrentCompletion: true };
    }
    // Freeze flags and matrices while computing the additive delta.
    await client.query("LOCK TABLE users IN SHARE MODE");
    await client.query("LOCK TABLE user_permissions IN SHARE ROW EXCLUSIVE MODE");
    const users = (await client.query("SELECT id,full_name FROM users WHERE is_admin=false AND is_owner=false ORDER BY id")).rows;
    const permissions = (await client.query("SELECT * FROM user_permissions ORDER BY id")).rows;
    const changes: AccessChange[] = [];
    const actions = ["can_create", "can_edit", "can_delete", "can_view_reports", "can_export", "can_approve"];
    for (const user of users) {
      const rows = permissions.filter(p => p.user_id === user.id);
      const bySection = new Map(rows.map(p => [p.section_key, p]));
      const desired = new Map<string, string>();
      for (const row of rows) {
        if (!row.can_view && ACCESS_VIEW_SECTIONS.includes(row.section_key) && actions.some(a => row[a] === true)) {
          desired.set(row.section_key, "preserve-existing-access");
        }
      }
      for (const { source, target } of ACCESS_CARRY_MAPPING) {
        if ((bySection.get(source)?.can_view || desired.has(source)) && !bySection.get(target)?.can_view && !desired.has(target)) {
          desired.set(target, `carried-forward-from-${source}`);
        }
      }
      for (const [section, reason] of desired) {
        const previous = bySection.get(section);
        const result = previous
          ? await client.query("UPDATE user_permissions SET can_view=true WHERE id=$1 RETURNING id", [previous.id])
          : await client.query(`INSERT INTO user_permissions
              (user_id,section_key,can_view,can_create,can_edit,can_delete,can_view_reports,can_export,can_approve,can_notify)
              VALUES($1,$2,true,false,false,false,false,false,false,false) RETURNING id`, [user.id, section]);
        const permissionId = result.rows[0].id;
        const change = { userId: user.id, userName: user.full_name, sectionKey: section, action: "view" as const, before: false as const, after: true as const, reason };
        // Dedicated durable settings rows avoid the generic signed-in
        // transaction-audit endpoint exposing permission matrices.
        const audit = await client.query("INSERT INTO app_settings(key,value) VALUES($1,$2) RETURNING id",
          [`${ACCESS_AUDIT_PREFIX}${permissionId}`, JSON.stringify({ ...change, permissionId, rowExisted: !!previous })]);
        changes.push({ id: audit.rows[0].id, ...change });
      }
    }
    const after = (await client.query(`SELECT p.user_id,p.section_key FROM user_permissions p
      JOIN users u ON u.id=p.user_id WHERE p.can_view=true AND u.is_admin=false AND u.is_owner=false`)).rows;
    const summary = {
      completed: true, completedAt: new Date().toISOString(), changedRows: changes.length,
      mapping: ACCESS_CARRY_MAPPING,
      pageSummary: NEWLY_GATED_PAGES.map(p => ({
        ...p, usersGranted: new Set(changes.filter(c => c.sectionKey === p.section).map(c => c.userId)).size,
        usersWithAccess: new Set(after.filter(r => r.section_key === p.section).map(r => r.user_id)).size,
      })),
      population: "non-admin, non-owner users at migration time",
    };
    await client.query("INSERT INTO app_settings(key,value) VALUES($1,$2)", [ACCESS_MIGRATION_KEY, JSON.stringify(summary)]);
    await client.query("COMMIT");
    return { applied: true, changedRows: changes.length, summary };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readPermissionAccessAudit(pool: Pick<Pool, "query">) {
  const marker = (await pool.query(markerSql, [ACCESS_MIGRATION_KEY])).rows[0];
  if (!marker) return { completed: false, completedAt: null, changedRows: 0, changes: [], mapping: ACCESS_CARRY_MAPPING, pageSummary: [] };
  const changes = (await pool.query("SELECT id,value FROM app_settings WHERE key LIKE $1 ORDER BY id", [`${ACCESS_AUDIT_PREFIX}%`])).rows
    .map(row => ({ id: row.id, ...JSON.parse(row.value) }));
  return { ...JSON.parse(marker.value), changes };
}
