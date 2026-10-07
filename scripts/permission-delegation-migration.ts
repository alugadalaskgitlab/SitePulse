/**
 * Explicit development-only permission migration. Dry-run unless --apply.
 * Never imported by startup. Every mutation is audited in the same transaction.
 */
import fs from "node:fs";
import pg from "pg";

const baseline = JSON.parse(fs.readFileSync("/tmp/perm03/baseline-db.json", "utf8"));
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  if ((await db.query("select current_database() name")).rows[0].name !== "sitelog_dev")
    throw new Error("Refusing non-development database");
  const current = (await db.query("select * from user_permissions order by id for update")).rows;
  if (JSON.stringify(current) !== JSON.stringify(baseline.permissions))
    throw new Error("Permissions changed since baseline; re-review before applying");
  const changes: any[] = [];
  const ungated = ["estimator_portal", "concrete_calculator", "mix_calculator", "site_hub", "hmp_hub"];
  const splits: Record<string, string[]> = {
    planning_masters: ["qto_boq"],
    work_programme: ["qto_boq"],
    work_programme_review: ["qto_boq"],
    norms_library: ["qto_boq"],
    edit_requests_review: ["admin_settings", "user_management"],
  };
  for (const user of baseline.users) {
    if (user.is_admin || user.is_owner) continue;
    const rows = current.filter((r: any) => r.user_id === user.id);
    const desired = new Set(ungated);
    for (const [section, old] of Object.entries(splits))
      if (rows.some((r: any) => old.includes(r.section_key) && r.can_view)) desired.add(section);
    for (const row of rows) {
      const after = { ...row };
      for (const action of ["can_delete", "can_export", "can_notify"]) after[action] = false;
      if (desired.has(row.section_key)) after.can_view = true;
      if (JSON.stringify(row) !== JSON.stringify(after))
        changes.push({ user: user.full_name, before: row, after });
      desired.delete(row.section_key);
    }
    for (const section of desired) changes.push({
      user: user.full_name, before: null,
      after: { user_id: user.id, section_key: section, can_view: true, can_create: false,
        can_edit: false, can_delete: false, can_view_reports: false,
        can_export: false, can_approve: false, can_notify: false },
    });
  }
  fs.mkdirSync("reports/perm-03", { recursive: true });
  fs.writeFileSync("reports/perm-03/permission-preflight.json", JSON.stringify(changes, null, 2) + "\n");
  if (process.argv.includes("--apply")) {
    for (const change of changes) {
      const p = change.after;
      let id = p.id;
      if (change.before) {
        await db.query("update user_permissions set can_view=$2,can_delete=false,can_export=false,can_notify=false where id=$1", [id, p.can_view]);
      } else {
        id = (await db.query("insert into user_permissions(user_id,section_key,can_view) values($1,$2,true) returning id", [p.user_id,p.section_key])).rows[0].id;
        p.id = id;
      }
      change.auditId = (await db.query(
        "insert into audit_logs(module,transaction_id,action,user_name,old_values,new_values,reason) values('permissions',$1,'edit','Owner-authorized development permission migration',$2,$3,$4) returning id",
        [id, JSON.stringify(change.before), JSON.stringify(p), "Explicit Delete/Export/Notify reset and additive View preservation; admin/owner rows excluded"],
      )).rows[0].id;
    }
    await db.query("COMMIT");
    fs.writeFileSync("reports/perm-03/permission-writes.json", JSON.stringify(changes, null, 2) + "\n");
  } else await db.query("ROLLBACK");
  console.log(JSON.stringify({ applied: process.argv.includes("--apply"), changedRows: changes.length,
    insertedRows: changes.filter(x => !x.before).length }));
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
