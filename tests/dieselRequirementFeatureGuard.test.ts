import { describe, expect, it } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { can } from "../shared/featureAccess";
import { emptyMatrix } from "../shared/permissions";

const file = "server/routes.ts";
const source = fs.readFileSync(file, "utf8");
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);

function extractHandler(method: string, path: string) {
  let text = "";
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === `app.${method}` &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === path
    ) {
      text = node.arguments.at(-1)!.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!text) throw new Error(`Missing registered route: ${method.toUpperCase()} ${path}`);
  const compiled = ts.transpileModule(`const handler = ${text};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("assertFeatureAction", `${compiled}\nreturn handler;`);
}

const requirementRouteActions = [
  ["post", "/api/diesel-requirements", "add"],
  ["patch", "/api/diesel-requirements/:id/purchase-update", "edit"],
  ["patch", "/api/diesel-requirements/:id/payment-status", "edit"],
  ["put", "/api/diesel-requirements/:id", "edit"],
  ["delete", "/api/diesel-requirements/:id", "cancel"],
  ["patch", "/api/diesel-requirements/:id/approve", "approve"],
  ["patch", "/api/diesel-requirements/:id/reject", "approve"],
  ["patch", "/api/diesel-requirements/equipment/:id/consumption-norm", "edit"],
] as const;

describe("ACCESS-02C Diesel requirement route guards", () => {
  it.each(requirementRouteActions)("%s %s denies issue-only role ticks with 403", async (method, path) => {
    const handler = extractHandler(method, path)(
      (req: any, res: any, feature: any, action: any) => {
        if (can(req.authUser, feature, action, req.authFeatureAccess)) return true;
        res.status(403).json({ error: "forbidden", feature, action });
        return false;
      },
    );
    const state = {
      rolesConfigured: true,
      userRoles: [1],
      roleTicks: { 1: { diesel_issue: { view: true, add: true, edit: true, cancel: true } } },
      legacyPermissions: emptyMatrix(),
    };
    const res = {
      code: 200,
      body: null as any,
      status(code: number) { this.code = code; return this; },
      json(body: any) { this.body = body; return this; },
    };

    await handler({
      authUser: { id: 7, isAdmin: false, isOwner: false },
      authFeatureAccess: state,
      params: { id: "1" },
      body: {},
    }, res);

    expect(res.code).toBe(403);
    expect(res.body.feature).toBe("diesel_requirement");
  });
});
