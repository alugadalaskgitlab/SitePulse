import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { assertCreateEither, assertEditEither, assertViewEither } from "../server/auth-routes";

const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const helpers = { assertCreateEither, assertEditEither, assertViewEither };
type Action = "Create" | "Edit" | "View";

// Read the guard from the actual registered route, then exercise the imported
// production authorization helper (not a test-only reimplementation of OR).
function routeGuard(method: string, path: string, action: Action, legacy: string, granular: string) {
  const start = routes.indexOf(`app.${method}("${path}",`);
  expect(start, `${method} ${path} is registered`).toBeGreaterThanOrEqual(0);
  const next = routes.indexOf("\n  app.", start + 1);
  const handler = routes.slice(start, next < 0 ? undefined : next);
  const guard = handler.match(new RegExp(`assert${action}Either\\(req, res, "(.*?)", "(.*?)"\\)`));
  expect(guard, `${method} ${path} uses the ${action.toLowerCase()} OR guard`).not.toBeNull();
  expect([guard![1], guard![2]].sort()).toEqual([legacy, granular].sort());
  return { helper: helpers[`assert${action}Either` as keyof typeof helpers], sections: [guard![1], guard![2]] };
}

function expectEitherPermissions(guard: ReturnType<typeof routeGuard>, action: "create" | "edit" | "view", legacy: string, granular: string) {
  for (const granted of [granular, legacy, null]) {
    const response = { status: (_status: number) => response, json: (_body: unknown) => response };
    const status = vi.spyOn(response, "status");
    const req = {
      authUser: { id: 1, isAdmin: false, isOwner: false },
      authPermissions: granted ? { [granted]: { [action]: true } } : {},
    };
    expect(guard.helper(req as any, response as any, ...(guard.sections as any)), `${granted ?? "neither"} grants ${action}`)
      .toBe(granted !== null);
    if (granted === null) expect(status).toHaveBeenCalledWith(403);
    else expect(status).not.toHaveBeenCalled();
  }
  // An unrelated action on the granular key must not grant this action.
  const response = { status: (_status: number) => response, json: (_body: unknown) => response };
  expect(guard.helper({
    authUser: { id: 1, isAdmin: false, isOwner: false },
    authPermissions: { [granular]: { [action === "create" ? "edit" : "create"]: true } },
  } as any, response as any, ...(guard.sections as any))).toBe(false);
}

describe("PERM-01 Part A server route guards", () => {
  it.each([
    ["post", "/api/purchase-indents", "Create"],
    ["put", "/api/purchase-indents/:id", "Edit"],
    ["post", "/api/irn/:id/raise-pi", "Create"],
    ["patch", "/api/purchase-indent-items/:id/procure", "Edit"],
  ] as const)("PI %s %s supports granular-only, legacy-only and neither", (method, path, action) => {
    expectEitherPermissions(
      routeGuard(method, path, action, "site_procurement", "purchase_indents_raise"),
      action.toLowerCase() as "create" | "edit", "site_procurement", "purchase_indents_raise",
    );
  });

  it.each([
    ["post", "/api/diesel-requirements", "Create"],
    ["put", "/api/diesel-requirements/:id", "Edit"],
    ["patch", "/api/diesel-requirements/:id/purchase-update", "Edit"],
    ["patch", "/api/diesel-requirements/:id/payment-status", "Edit"],
  ] as const)("diesel %s %s supports granular-only, legacy-only and neither", (method, path, action) => {
    expectEitherPermissions(
      routeGuard(method, path, action, "site_diesel", "diesel_req_raise"),
      action.toLowerCase() as "create" | "edit", "site_diesel", "diesel_req_raise",
    );
  });

  it.each([
    ["get", "/api/vendor-bills/equipment-hire-discovery", "View"],
    ["put", "/api/vendor-bills/:id", "Edit"],
    ["post", "/api/vendor-bills/check-duplicates", "Create"],
  ] as const)("missed vendor bill %s %s supports both grants and denies neither", (method, path, action) => {
    expectEitherPermissions(
      routeGuard(method, path, action, "vendor_bills", "vendor_bills_raise"),
      action.toLowerCase() as "view" | "edit" | "create", "vendor_bills", "vendor_bills_raise",
    );
  });

  it("wires every former PI/diesel-only create/edit call without changing approval, view, or other modules", () => {
    const pi = routes.slice(routes.indexOf('app.post("/api/purchase-indents/route-corrections/apply"'), routes.indexOf('app.get("/api/diesel-requirements"'));
    expect(pi).not.toMatch(/assert(?:Create|Edit)\(req, res, "site_procurement"\)/);
    expect(routes).not.toMatch(/assert(?:Create|Edit)\(req, res, "site_diesel"\)/);
    expect(pi).toContain('assertApprove(req, res, "purchase_indents_approve")');
    expect(routes).toContain('if (!assertCreate(req, res, "site_procurement")) return;'); // material requirements, not PI
    expect(routes).toContain('if (!assertEdit(req, res, "vendor_bills")) return;'); // status workflow, outside three routes
    expect(routes).toContain('if (!assertApprove(req, res, "diesel_req_approve")) return;');
    expect(routes).toContain('if (!assertApprove(req, res, "vendor_bills_approve")) return;');
    expect(routes).toContain('if (!await assertPiDeliveryScope(req, res, indentId, [req.body])) return;');
    expect(routes).toContain('if (existing.status !== "pending") {');
    expect(routes).toContain('if (existing.status === "verified" || existing.status === "approved" || existing.status === "paid") {');
  });

  it("the new edit helper preserves authentication and admin/owner bypass", () => {
    for (const authUser of [undefined, { isAdmin: true, isOwner: false }, { isAdmin: false, isOwner: true }]) {
      const response = { status: (_status: number) => response, json: (_body: unknown) => response };
      const status = vi.spyOn(response, "status");
      expect(assertEditEither({ authUser, authPermissions: {} } as any, response as any, "site_diesel", "diesel_req_raise"))
        .toBe(!!authUser);
      if (!authUser) expect(status).toHaveBeenCalledWith(401);
      else expect(status).not.toHaveBeenCalled();
    }
  });
});