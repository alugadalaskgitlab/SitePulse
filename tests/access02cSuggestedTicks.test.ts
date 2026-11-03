import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import { z } from "zod";
import { SUGGESTED_NEW_ROW_ROLE_TICKS } from "../shared/featureAccess";

const source = fs.readFileSync("server/auth-routes.ts", "utf8");
const ast = ts.createSourceFile("auth-routes.ts", source, ts.ScriptTarget.Latest, true);
let handlerSource = "";
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(ast) === "app.post" &&
    node.arguments[0] &&
    ts.isStringLiteral(node.arguments[0]) &&
    node.arguments[0].text === "/api/access-control/roles/apply-suggested-ticks"
  ) {
    handlerSource = node.arguments.at(-1)!.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const compiled = ts.transpileModule(`const handler = ${handlerSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  const roleRows = [
    { id: 10, name: "Store In-charge" },
    { id: 11, name: "Unlisted role" },
  ];
  const inserts: any[] = [];
  const insertBuilder = {
    values: vi.fn((rows: any[]) => { inserts.push(...rows); return insertBuilder; }),
    onConflictDoUpdate: vi.fn(async () => undefined),
  };
  const from = vi.fn(async () => roleRows);
  const tx: any = {
    select: vi.fn(() => ({ from })),
    insert: vi.fn(() => insertBuilder),
  };
  const db = { transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work(tx)) };
  const roles = { id: "roles.id", name: "roles.name" };
  const roleTicks = { roleId: "role_ticks.role_id", feature: "role_ticks.feature", action: "role_ticks.action" };
  const handler = new Function(
    "z", "db", "roles", "roleTicks", "SUGGESTED_NEW_ROW_ROLE_TICKS",
    `${compiled}\nreturn handler;`,
  )(z, db, roles, roleTicks, SUGGESTED_NEW_ROW_ROLE_TICKS);
  async function call(authUser: any, body: any) {
    const res = {
      code: 200,
      body: null as any,
      status(code: number) { this.code = code; return this; },
      json(value: any) { this.body = value; return this; },
    };
    await handler({ authUser, body }, res);
    return res;
  }
  return { call, db, inserts, insertBuilder, tx };
}

describe("ACCESS-02C suggested role ticks", () => {
  it("makes no changes for a non-Owner or without explicit confirmation", async () => {
    const f = fixture();
    expect((await f.call({ isOwner: false }, { confirm: true })).code).toBe(403);
    expect((await f.call({ isOwner: true }, { confirm: false })).code).toBe(400);
    expect(f.db.transaction).not.toHaveBeenCalled();
    expect(f.insertBuilder.values).not.toHaveBeenCalled();
  });

  it("applies only the suggestions listed for matching roles after confirmation", async () => {
    const f = fixture();
    const response = await f.call({ id: 1, isOwner: true }, { confirm: true });
    const suggestions = SUGGESTED_NEW_ROW_ROLE_TICKS["Store In-charge"];
    const expected = Object.entries(suggestions).flatMap(([feature, actions]) =>
      Object.entries(actions ?? {})
        .filter(([, granted]) => granted === true)
        .map(([action]) => ({ roleId: 10, feature, action, granted: true })),
    );

    expect(response.code).toBe(200);
    expect(f.inserts).toEqual(expected);
    expect(f.inserts.every(row => row.roleId === 10)).toBe(true);
    expect(f.tx.insert).toHaveBeenCalledTimes(1);
  });
});
