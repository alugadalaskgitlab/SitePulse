/**
 * Unit tests for the material-mapping POST route permission gate.
 *
 * Strategy: call `assertApprove` directly with mock req/res objects — no real
 * DB or HTTP stack needed.  This keeps the test fast and laser-focused on the
 * section-key correctness: only users who have `purchase_indents_approve.approve`
 * (or are admin/owner) should be allowed to save a mapping.
 */

import { vi, describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import { emptyMatrix, fullMatrix } from "@shared/permissions";
import type { PermissionMatrix } from "@shared/permissions";

// Pull in the real assertApprove — auth-routes has no heavy side-effects at
// import time (no DB, no VAPID).  We just need the exported function.
import { assertApprove } from "../server/auth-routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: Partial<{
  authUser: { id: number; isAdmin: boolean; isOwner: boolean; fullName: string };
  authPermissions: PermissionMatrix;
}>): Request {
  return {
    authUser: { id: 1, isAdmin: false, isOwner: false, fullName: "Test" },
    authPermissions: emptyMatrix(),
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res = {
    _status: 0,
    _body: {} as Record<string, unknown>,
    status(code: number) { this._status = code; return this; },
    json(body: Record<string, unknown>) { this._body = body; return this; },
  };
  return res as unknown as Response & { _status: number; _body: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assertApprove — purchase_indents_approve section key (material-mapping route gate)", () => {
  it("allows an admin user regardless of permission matrix", () => {
    const req = makeReq({ authUser: { id: 1, isAdmin: true, isOwner: false, fullName: "Admin" } });
    const res = makeRes();
    expect(assertApprove(req, res, "purchase_indents_approve")).toBe(true);
  });

  it("allows an owner user regardless of permission matrix", () => {
    const req = makeReq({ authUser: { id: 2, isAdmin: false, isOwner: true, fullName: "Owner" } });
    const res = makeRes();
    expect(assertApprove(req, res, "purchase_indents_approve")).toBe(true);
  });

  it("allows a non-admin user who has purchase_indents_approve.approve = true", () => {
    const matrix = emptyMatrix();
    matrix["purchase_indents_approve"].approve = true;
    const req = makeReq({ authPermissions: matrix });
    const res = makeRes();
    expect(assertApprove(req, res, "purchase_indents_approve")).toBe(true);
  });

  it("denies a non-admin user with only view/create/edit — no approve", () => {
    const matrix = emptyMatrix();
    matrix["purchase_indents_approve"].view = true;
    matrix["purchase_indents_approve"].create = true;
    matrix["purchase_indents_approve"].edit = true;
    // approve intentionally left false
    const req = makeReq({ authPermissions: matrix });
    const res = makeRes();
    expect(assertApprove(req, res, "purchase_indents_approve")).toBe(false);
    expect((res as ReturnType<typeof makeRes>)._status).toBe(403);
    expect((res as ReturnType<typeof makeRes>)._body).toMatchObject({
      error: "forbidden",
      section: "purchase_indents_approve",
      action: "approve",
    });
  });

  it("denies a non-admin user with a completely empty permission matrix", () => {
    const req = makeReq({ authPermissions: emptyMatrix() });
    const res = makeRes();
    expect(assertApprove(req, res, "purchase_indents_approve")).toBe(false);
    expect((res as ReturnType<typeof makeRes>)._status).toBe(403);
  });

  it("denies an unauthenticated request (no authUser)", () => {
    const req = makeReq({ authUser: undefined as any });
    const res = makeRes();
    expect(assertApprove(req, res, "purchase_indents_approve")).toBe(false);
    expect((res as ReturnType<typeof makeRes>)._status).toBe(401);
  });
});
