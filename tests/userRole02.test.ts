import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";
import { ROLE_TEMPLATES, SECTION_KEYS, emptyMatrix, applyRoleTemplate } from "../shared/permissions";

// Exercise the production route handler and request schemas, without startup jobs.
const source = fs.readFileSync("server/auth-routes.ts", "utf8");
const ast = ts.createSourceFile("auth.ts", source, ts.ScriptTarget.Latest, true);
const schemas = ast.statements.filter(n => ts.isVariableStatement(n) &&
  n.declarationList.declarations.some(d => ["permissionMatrixSchema", "businessRoleSchema", "reviewedPermissionsSchema"].includes(d.name.getText(ast))))
  .map(n => n.getText(ast)).join("\n");
let handlerSource = "";
function visit(n: ts.Node) {
  if (ts.isCallExpression(n) && n.expression.getText(ast) === "app.put" &&
    n.arguments[0]?.getText(ast) === '"/api/auth/users/:id/permissions"')
    handlerSource = n.arguments[n.arguments.length - 1].getText(ast);
  ts.forEachChild(n, visit);
}
visit(ast);
const compiled = ts.transpileModule(`${schemas}\nconst handler = ${handlerSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(flags = {}) {
  const user = { id: 5, isAdmin: false, businessRole: null as string | null, ...flags };
  let stored = emptyMatrix();
  const save = vi.fn(async (_id, matrix, role) => {
    stored = matrix;
    if (role !== undefined) user.businessRole = role;
  });
  const handler = new Function("z", "ROLE_TEMPLATES", "SECTION_KEYS", "emptyMatrix", "getUserById", "setUserPermissions",
    `${compiled};return handler;`)(z, ROLE_TEMPLATES, SECTION_KEYS, emptyMatrix, async () => user, save);
  async function request(body: unknown, actor = { isAdmin: true }) {
    const res = { statusCode: 200, body: null as any, status(code: number) { this.statusCode = code; return this; },
      json(value: any) { this.body = value; return this; } };
    await handler({ params: { id: "5" }, body, authUser: actor }, res);
    return res;
  }
  return { user, save, request, stored: () => stored };
}
describe("explicit business designation", () => {
  it("saves a reviewed designation with the matrix, without privileged flags", async () => {
    const f = fixture();
    const matrix = applyRoleTemplate("operations_director");
    const res = await f.request({ matrix, businessRole: "operations_director" });
    expect(res.statusCode).toBe(200);
    expect(f.save).toHaveBeenCalledWith(5, matrix, "operations_director");
    expect(f.user).toEqual({ id: 5, isAdmin: false, businessRole: "operations_director" });
  });
  it("does not infer a role from legacy or wrapped matrix-only saves", async () => {
    const f = fixture();
    await f.request(applyRoleTemplate("viewer"));
    expect(f.user.businessRole).toBeNull();
    await f.request({ matrix: applyRoleTemplate("viewer") });
    expect(f.user.businessRole).toBeNull();
  });
  it("keeps designation through individual advanced adjustments", async () => {
    const f = fixture({ businessRole: "operations_director" });
    const matrix = emptyMatrix();
    matrix.site_dprs.edit = true;
    const res = await f.request(matrix);
    expect(res.body.businessRole).toBe("operations_director");
    expect(f.stored()).toEqual(matrix);
  });
  it("retains explicit sensitive merged grants, not just template defaults", async () => {
    const f = fixture();
    const matrix = applyRoleTemplate("operations_director");
    matrix.site_dprs.delete = true;
    matrix.user_management.edit = true;
    await f.request({ matrix, businessRole: "operations_director" });
    expect(f.stored().site_dprs.delete).toBe(true);
    expect(f.stored().user_management.edit).toBe(true);
  });
  it.each(["made-up-role", 123, {}, "owner"])("rejects invalid designation %j before any save", async businessRole => {
    const f = fixture();
    expect((await f.request({ matrix: emptyMatrix(), businessRole })).statusCode).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("does not accept account flags in a reviewed save", async () => {
    const f = fixture();
    expect((await f.request({ matrix: emptyMatrix(), businessRole: "viewer", isAdmin: true })).statusCode).toBe(400);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("does not let a permission manager alter an administrator", async () => {
    const f = fixture({ isAdmin: true });
    expect((await f.request({ matrix: emptyMatrix(), businessRole: "viewer" }, { isAdmin: false })).statusCode).toBe(403);
    expect(f.save).not.toHaveBeenCalled();
  });
  it("leaves an administrator privileged when only the business designation changes", async () => {
    const f = fixture({ isAdmin: true });
    await f.request({ matrix: applyRoleTemplate("operations_director"), businessRole: "operations_director" });
    expect(f.user.isAdmin).toBe(true);
  });
});
