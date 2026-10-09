import { describe, expect, it } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { ACTIONS, ROLE_TEMPLATES, SECTION_KEYS, applyRoleTemplate, emptyMatrix } from "../shared/permissions";

describe("commercial user role templates", () => {
  it("offers eight ordinary roles alongside the existing privileged Administrator flow", () => {
    expect(ROLE_TEMPLATES.filter(t => !t.legacy).map(t => t.id).sort()).toEqual([
      "operations_director", "project_manager", "site_engineer", "site_supervisor",
      "stores_procurement", "equipment_plant", "billing_measurements", "viewer",
    ].sort());
  });
  it.each(ROLE_TEMPLATES.map(t => t.id))("%s is explicit, complete, independent and non-destructive", id => {
    const matrix = applyRoleTemplate(id);
    expect(Object.keys(matrix)).toEqual(SECTION_KEYS);
    expect(matrix).not.toEqual(emptyMatrix());
    for (const section of SECTION_KEYS) {
      for (const action of ACTIONS) expect(typeof matrix[section][action]).toBe("boolean");
      for (const action of ["delete", "export", "notify"] as const) expect(matrix[section][action]).toBe(false);
    }
    matrix.site_dprs.delete = true;
    expect(applyRoleTemplate(id).site_dprs.delete).toBe(false);
  });
  it("Full Operations can operate, approve and read without governance or bypass", () => {
    const m = applyRoleTemplate("operations_director");
    for (const section of ["site_dprs", "site_materials", "work_programme", "qto_boq",
      "plant_equipment", "master_equipment", "stores_inventory", "plant_materials",
      "purchase_indents_raise", "vendor_bills_raise", "diesel_req_raise"] as const)
      expect(m[section]).toMatchObject({ view: true, create: true, edit: true });
    for (const section of ["purchase_indents_approve", "irn_approve", "vendor_bills_approve",
      "vendor_bills_verify", "diesel_req_approve", "site_dprs"] as const)
      expect(m[section].approve).toBe(true);
    for (const section of ["user_management", "permission_manager", "device_approval", "admin_hub",
      "admin_settings", "data_sync", "admin_ldo_tools", "admin_ledger_tools",
      "admin_notifications_manage", "sites_plants_manage", "site_management",
      "app_management", "edit_requests_review"] as const)
      expect(Object.values(m[section]).some(Boolean), section).toBe(false);
  });
  it("combined stores and procurement preserves the two deliberate legacy templates", () => {
    const m = applyRoleTemplate("stores_procurement");
    expect(m.irn_approve.approve).toBe(true);
    expect(m.purchase_indents_raise.create).toBe(true);
    expect(applyRoleTemplate("stores").purchase_indents_raise.create).toBe(false);
    expect(applyRoleTemplate("procurement").irn_approve.approve).toBe(false);
  });
  it("Supervisor has no commercial approvals; Viewer never writes", () => {
    for (const row of Object.values(applyRoleTemplate("site_supervisor"))) expect(row.approve).toBe(false);
    for (const row of Object.values(applyRoleTemplate("viewer")))
      for (const action of ["create", "edit", "delete", "approve"] as const) expect(row[action]).toBe(false);
  });
});

// Exercise actual production guards, without booting repair jobs.
const source = fs.readFileSync("server/auth-routes.ts", "utf8");
const ast = ts.createSourceFile("auth.ts", source, ts.ScriptTarget.Latest, true);
const names = ["assertCreate", "assertEdit", "assertApprove", "assertDelete", "assertDeleteEither"];
const js = ts.transpileModule(ast.statements.filter(n => ts.isFunctionDeclaration(n) &&
  names.includes(n.name?.text ?? "")).map(n => n.getText(ast).replace(/^export /, "")).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const guards = new Function(`${js};return {${names.join(",")}};`)();
it("real guards accept ordinary Full Operations Create/Edit/Approve and refuse Delete", () => {
  const req = { authUser: { id: 99, isAdmin: false, isOwner: false }, authPermissions: applyRoleTemplate("operations_director") };
  const res = { code: 200, status(code: number) { this.code = code; return this; }, json() { return this; } };
  expect(guards.assertCreate(req, res, "site_materials")).toBe(true);
  expect(guards.assertEdit(req, res, "site_materials")).toBe(true);
  expect(guards.assertApprove(req, res, "purchase_indents_approve")).toBe(true);
  expect(guards.assertDelete(req, res, "site_materials")).toBe(false);
  expect(res.code).toBe(403);
});

it("system branding and licensing writes use the existing Admin/Owner guard before any setting mutation", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");
  for (const path of ["/api/admin/branding", "/api/admin/licensed-modules"]) {
    const handler = routes.slice(routes.indexOf(`app.post("${path}"`)).split("\n  });")[0];
    expect(handler).toContain("if (!assertAdmin(req, res)) return;");
    expect(handler.indexOf("assertAdmin")).toBeLessThan(handler.indexOf("storage.setSetting"));
  }
});
