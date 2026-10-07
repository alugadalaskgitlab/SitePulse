import { describe, expect, it } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { fullMatrix, emptyMatrix, ROLE_TEMPLATES, applyRoleTemplate } from "../shared/permissions";

// Execute production permission helpers without booting startup jobs or a DB.
const source = fs.readFileSync("server/auth-routes.ts", "utf8");
const ast = ts.createSourceFile("auth.ts", source, ts.ScriptTarget.Latest, true);
const names = ["assertDelete", "assertDeleteEither", "assertDeleteOrCancel", "assertReportExport", "assertExport", "assertApprove"];
const declarations = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? ""));
const js = ts.transpileModule(declarations.map(n => n.getText(ast).replace(/^export /, "")).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const helpers = new Function(`${js};return {${names.join(",")}};`)();

function invoke(name: string, bits: Record<string, boolean>, flags = {}, authenticated = true) {
  const req = { authUser: authenticated ? { id: 7, ...flags } : undefined, authPermissions: { site_dprs: bits } };
  const response = { code: 200, body: null as any, status(n: number) { this.code = n; return this; }, json(x: any) { this.body = x; return this; } };
  const allowed = helpers[name](req, response, "site_dprs");
  return { allowed, status: response.code, body: response.body };
}

describe("independent, explicit-only delegated actions", () => {
  for (const [name, required, unrelated] of [
    ["assertDelete", "delete", "edit"],
    ["assertDeleteOrCancel", "delete", "edit"],
    ["assertReportExport", "export", "view_reports"],
    ["assertExport", "export", "view_reports"],
    ["assertApprove", "approve", "view"],
  ]) {
    it(`${name} refuses unrelated ${unrelated} without ${required}`, () => {
      expect(invoke(name, { [unrelated]: true, [required]: false })).toMatchObject({ allowed: false, status: 403 });
    });
    it(`${name} accepts its own action without the unrelated action`, () => {
      expect(invoke(name, { [required]: true, [unrelated]: false })).toMatchObject({ allowed: true, status: 200 });
    });
    it(`${name} requires sign-in`, () => {
      expect(invoke(name, { [required]: true }, {}, false)).toMatchObject({ allowed: false, status: 401 });
    });
    for (const flag of ["isAdmin", "isOwner"])
      it(`${name} preserves ${flag} bypass`, () => {
        expect(invoke(name, {}, { [flag]: true })).toMatchObject({ allowed: true, status: 200 });
      });
  }
  it("empty, full and role-template matrices never grant Delete, Export or Notify", () => {
    for (const matrix of [emptyMatrix(), fullMatrix(), ...ROLE_TEMPLATES.map(t => applyRoleTemplate(t.id))])
      for (const row of Object.values(matrix))
        for (const action of ["delete", "export", "notify"] as const) expect(row[action]).toBe(false);
  });
  it("retired permission inheritance cannot recreate explicit-only grants", () => {
    const auth = fs.readFileSync("server/auth.ts", "utf8");
    expect(auth).not.toContain(".set({ canDelete: sql");
    expect(auth).not.toContain(".set({ canExport: sql");
    expect(auth).not.toContain("can_edit, can_delete, can_view_reports, can_export\n        FROM");
  });
});
