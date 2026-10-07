import { describe, it, expect, vi } from "vitest";
import { runPermissionAccessMigration, readPermissionAccessAudit, ACCESS_MIGRATION_KEY, ACCESS_AUDIT_PREFIX, ACCESS_VIEW_SECTIONS, ACCESS_CARRY_MAPPING, NEWLY_GATED_PAGES } from "../server/permissionAccessMigration";

function fixture(rows: any[] = [], options: { failAudit?: boolean; completed?: boolean } = {}) {
  const users = [{ id: 1, full_name: "Ordinary" }];
  const settings = new Map<string,string>();
  if (options.completed) settings.set(ACCESS_MIGRATION_KEY, "{}");
  let next = 100;
  const query = vi.fn(async (sql: string, args: any[] = []) => {
    if (sql === "SELECT value FROM app_settings WHERE key=$1") return { rows: settings.has(args[0]) ? [{ value: settings.get(args[0]) }] : [] };
    if (sql.startsWith("SELECT id,full_name")) return { rows: users };
    if (sql === "SELECT * FROM user_permissions ORDER BY id") return { rows };
    if (sql.startsWith("UPDATE user_permissions")) {
      const row = rows.find(p => p.id === args[0]); row.can_view = true; return { rows: [{ id: row.id }] };
    }
    if (sql.startsWith("INSERT INTO user_permissions")) {
      const row = { id: next++, user_id: args[0], section_key: args[1], can_view: true };
      rows.push(row); return { rows: [{ id: row.id }] };
    }
    if (sql.startsWith("INSERT INTO app_settings")) {
      if (options.failAudit && args[0].startsWith(ACCESS_AUDIT_PREFIX)) throw Error("audit failed");
      settings.set(args[0], args[1]); return { rows: [{ id: next++ }] };
    }
    if (sql.startsWith("SELECT p.user_id")) return { rows: rows.filter(r => r.user_id === 1 && r.can_view) };
    if (/^(BEGIN|COMMIT|ROLLBACK|LOCK TABLE|SELECT pg_advisory)/.test(sql)) return { rows: [] };
    throw Error(`Unexpected query ${sql}`);
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { pool: { query, connect } as any, rows, query, settings, connect, release };
}
const grant = (section: string, bits: object, user = 1) => ({
  id: Math.random(), user_id: user, section_key: section, can_view: false,
  can_create: false, can_edit: false, can_delete: false, can_view_reports: false,
  can_export: false, can_approve: false, can_notify: false, ...bits,
});
describe("PERM-PROD-01 one-time additive preservation", () => {
  it.each(["can_create","can_edit","can_delete","can_view_reports","can_export","can_approve"])("preserves %s with only View added", async bit => {
    const before = grant("site_dprs", { [bit]: true });
    const f = fixture([{ ...before }]); const result = await runPermissionAccessMigration(f.pool);
    expect(result.changedRows).toBe(1);
    expect(f.rows[0]).toEqual({ ...before, can_view: true });
    expect(f.settings.has(ACCESS_MIGRATION_KEY)).toBe(true);
    const audit = JSON.parse([...f.settings.entries()].find(([k]) => k.startsWith(ACCESS_AUDIT_PREFIX))![1]);
    expect(audit).toMatchObject({ userId: 1, userName: "Ordinary", before: false, after: true, action: "view", reason: "preserve-existing-access" });
  });
  it("does not grant for Notify alone, no bits, dead View cells, or already-visible rows", async () => {
    const f = fixture([grant("site_dprs",{can_notify:true}),grant("plant_materials",{}),grant("hmp_operations",{can_edit:true}),grant("site_hub",{can_view:true})]);
    const before = structuredClone(f.rows);
    expect((await runPermissionAccessMigration(f.pool)).changedRows).toBe(0);
    expect(f.rows).toEqual(before);
  });
  it("leaves admin/owner rows outside the selected ordinary-user set alone", async () => {
    const f = fixture([grant("site_dprs",{can_edit:true},2),grant("qto_boq",{can_view:true},3)]);
    const before = structuredClone(f.rows);
    await runPermissionAccessMigration(f.pool);
    expect(f.rows).toEqual(before);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("is_admin=false AND is_owner=false"))).toBe(true);
  });
  it("carries BOQ View to precisely four split keys, preserving existing bits", async () => {
    const f = fixture([grant("qto_boq",{can_view:true}),grant("work_programme",{can_notify:true})]);
    expect((await runPermissionAccessMigration(f.pool)).changedRows).toBe(4);
    expect(f.rows.find(r=>r.section_key==="work_programme").can_notify).toBe(true);
    expect(f.rows.some(r=>r.section_key==="edit_requests_review")).toBe(false);
  });
  it.each(["admin_settings","user_management"])("carries %s View to review only", async source => {
    const f=fixture([grant(source,{can_view:true})]);
    expect((await runPermissionAccessMigration(f.pool)).changedRows).toBe(1);
    expect(f.rows.at(-1).section_key).toBe("edit_requests_review");
  });
  it("carries from an additively preserved source and leaves empty users empty", async () => {
    const f=fixture([grant("qto_boq",{can_edit:true})]);
    expect((await runPermissionAccessMigration(f.pool)).changedRows).toBe(5);
    const empty=fixture(); expect((await runPermissionAccessMigration(empty.pool)).changedRows).toBe(0);
  });
  it("second invocation makes exactly one marker SELECT and never connects or writes", async () => {
    const f=fixture([grant("site_dprs",{can_edit:true})]);
    await runPermissionAccessMigration(f.pool);
    f.query.mockClear(); f.connect.mockClear();
    expect(await runPermissionAccessMigration(f.pool)).toEqual({applied:false,changedRows:0,markerChecks:1});
    expect(f.query).toHaveBeenCalledTimes(1); expect(f.connect).not.toHaveBeenCalled();
  });
  it("rolls back on audit failure without writing completion", async () => {
    const f=fixture([grant("site_dprs",{can_edit:true})],{failAudit:true});
    await expect(runPermissionAccessMigration(f.pool)).rejects.toThrow("audit failed");
    expect(f.settings.has(ACCESS_MIGRATION_KEY)).toBe(false);
    expect(f.query.mock.calls.some(([s])=>s==="ROLLBACK")).toBe(true);
    expect(f.release).toHaveBeenCalledTimes(1);
  });
  it("returns a read-only not-run response and the exact five-target map", async () => {
    const f=fixture();
    expect(await readPermissionAccessAudit(f.pool)).toMatchObject({completed:false,changes:[]});
    expect(new Set(ACCESS_CARRY_MAPPING.map(m=>m.target)).size).toBe(5);
    expect(NEWLY_GATED_PAGES).toHaveLength(10);
    expect(ACCESS_VIEW_SECTIONS).not.toContain("hmp_operations");
  });
});
