import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { requirementApprovalBlock, isRequirementDecision } from "../shared/siteRequirementApproval";
import { emptyMatrix, ACTION_LABELS } from "../shared/permissions";
import map from "../shared/permission-actions.generated.json";

function extract(file: string, name: string) {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  return ts.transpileModule(node.getText(ast).replace(/^export /, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const compiled = extract("server/routes.ts", "registerSiteRequirementRoutes");
const approval = extract("server/auth-routes.ts", "assertApprove");
function fixture(actor: any = { id: 7, isAdmin: false, isOwner: false }, approve = true, creator: number | null = 7) {
  const row = { id: 11, submittedBy: creator, status: "submitted", revisionStatus: "revision_requested", materials: [], equipment: [], labour: [] };
  const storage = {
    getSiteRequirement: vi.fn(async () => row),
    createSiteRequirement: vi.fn(async input => ({ id: 12, ...input })),
    listSiteRequirements: vi.fn(async () => [row]),
    updateSiteRequirementStatus: vi.fn(async (_id, input) => ({ ...row, ...input })),
    approveSiteRequirementRevision: vi.fn(async () => row),
    rejectSiteRequirementRevision: vi.fn(async () => row),
    requestSiteRequirementRevision: vi.fn(async () => row),
    updateSiteRequirementContent: vi.fn(async () => row),
  };
  const handlers = new Map<string, Function>();
  const app = Object.fromEntries(["get", "post", "patch", "put"].map(method => [method,
    (path: string, ...handlers_: Function[]) => handlers.set(`${method} ${path}`, handlers_.at(-1)!)]));
  const register = new Function("storage", "requireAuth", "requirementApprovalBlock", "isRequirementDecision",
    `${approval}\n${compiled}\nreturn registerSiteRequirementRoutes;`)(storage, () => {}, requirementApprovalBlock, isRequirementDecision);
  register(app);
  const matrix = emptyMatrix(); matrix.site_dprs.approve = approve;
  async function call(method: string, path: string, body: any = {}) {
    const res = { code: 200, body: null as any, status(c: number) { this.code = c; return this; }, json(b: any) { this.body = b; return this; } };
    await handlers.get(`${method} ${path}`)!({ authUser: actor, authPermissions: matrix, params: { id: "11" }, query: {}, body }, res);
    return res;
  }
  return { call, storage, row };
}
describe("PERM-REQ-01 backend production handlers", () => {
  for (const status of ["approved", "rejected"]) {
    it.each([
      [{ id: 7, isAdmin: false, isOwner: false }, 7, true, 403],
      [{ id: 7, isAdmin: true, isOwner: false }, 7, false, 403],
      [{ id: 7, isAdmin: false, isOwner: true }, 7, false, 200],
      [{ id: 8, isAdmin: false, isOwner: false }, 7, true, 200],
      [{ id: 8, isAdmin: false, isOwner: false }, 7, false, 403],
      [{ id: 7, isAdmin: true, isOwner: true }, null, true, 403],
    ])(`${status}: actor %j / creator %s / grant %s => %s`, async (actor, creator, grant, code) => {
      const f = fixture(actor, grant as boolean, creator as number | null);
      const r = await f.call("patch", "/api/site-requirements/:id/status", { status, submittedBy: 99, isOwner: true });
      expect(r.code).toBe(code);
      expect(f.storage.updateSiteRequirementStatus).toHaveBeenCalledTimes(code === 200 ? 1 : 0);
    });
  }
  for (const operation of ["approve", "reject"]) {
    it.each([
      [{ id: 7, isAdmin: true, isOwner: false }, 7, true, 403],
      [{ id: 7, isAdmin: false, isOwner: false }, 7, true, 403],
      [{ id: 7, isAdmin: false, isOwner: true }, 7, false, 200],
      [{ id: 8, isAdmin: false, isOwner: false }, 7, true, 200],
      [{ id: 8, isAdmin: false, isOwner: false }, 7, false, 403],
      [{ id: 7, isAdmin: true, isOwner: true }, null, true, 403],
    ])(`revision-${operation}: %j / %s / %s => %s`, async (actor, creator, grant, code) => {
      const f = fixture(actor, grant as boolean, creator as number | null);
      expect((await f.call("patch", `/api/site-requirements/:id/revision-${operation}`)).code).toBe(code);
    });
  }
  it("records the actual authenticated creator, ignoring forged identity", async () => {
    const f = fixture({ id: 7, fullName: "Authenticated fixture" });
    const r = await f.call("post", "/api/site-requirements", { date: "2026-10-09", submittedBy: 8, submittedByName: "Forged" });
    expect(r.body.submittedBy).toBe(7);
    expect(r.body.submittedByName).toBe("Authenticated fixture");
  });
  it("keeps revisions creator-only, including against Owner accounts", async () => {
    const f = fixture({ id: 8, isOwner: true });
    expect((await f.call("post", "/api/site-requirements/:id/revision-request", { reason: "change" })).code).toBe(403);
    expect(f.storage.requestSiteRequirementRevision).not.toHaveBeenCalled();
  });
  it("retains pending-revision validation for Owner", async () => {
    const f = fixture({ id: 7, isOwner: true });
    f.row.revisionStatus = "original";
    expect((await f.call("patch", "/api/site-requirements/:id/revision-approve")).code).toBe(409);
  });
  it("does not grant ordinary allocation/status transitions with Approve", async () => {
    const f = fixture({ id: 8 });
    expect((await f.call("patch", "/api/site-requirements/:id/status", { status: "arranged" })).code).toBe(403);
  });
  it("uses authenticated IDs to filter a non-reviewer's list", async () => {
    const f = fixture({ id: 8 }, false);
    await f.call("get", "/api/site-requirements");
    expect(f.storage.listSiteRequirements).toHaveBeenCalledWith({ submittedBy: 8 });
  });
  it("does not treat a name, designation or truthy string as Owner", () => {
    expect(requirementApprovalBlock({ id: 7, isOwner: "true" as any }, 7)).toContain("cannot approve");
    expect(requirementApprovalBlock({ id: 7 }, null)).toContain("unknown");
  });
  it("keeps notification keys and restricted labour actions with clarified labels", () => {
    expect(ACTION_LABELS.notify).toBe("Receive Notifications");
    expect(map.labour_management.actions).toEqual(["view", "create"]);
    expect(map.labour_management.tooltips.create).toContain("Update Labour Allocation Status");
    expect(map.admin_notifications_manage.tooltips.create).toContain("administrative notification records");
    expect(map.site_dprs.actions).toContain("approve");
  });
});
