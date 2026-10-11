import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { canViewVendorFinancials, vendorFinancialSiteIds, recordedVendorTds } from "../shared/vendorFinancialAccess";
import { emptyMatrix, fullMatrix, applyRoleTemplate, ROLE_TEMPLATES } from "../shared/permissions";
import { vendorFinancialGuard, financialSites } from "../server/vendorFinancialAccess";
import { editLegacyCell, legacySaveBody } from "../client/src/components/permissions/model";

describe("explicit financial visibility", () => {
  it("defaults all non-owners, including new administrators, to denied", () => {
    expect(canViewVendorFinancials({ isOwner: true }, emptyMatrix())).toBe(true);
    expect(canViewVendorFinancials({ isOwner: false }, fullMatrix())).toBe(false);
    for (const role of ROLE_TEMPLATES) expect(applyRoleTemplate(role.id).vendor_financials.view).toBe(false);
  });
  it("saves an ordinary user-specific checkbox without changing workflow grants", () => {
    const before = fullMatrix();
    const updated = editLegacyCell(before, "vendor_financials", "view", true, () => true);
    expect(canViewVendorFinancials({ isOwner: false }, legacySaveBody(updated))).toBe(true);
    expect(updated.vendor_bills_approve).toEqual(before.vendor_bills_approve);
    expect(before.vendor_financials.view).toBe(false);
  });
  it("keeps selected administrator sites and owner all-sites separate", () => {
    expect(vendorFinancialSiteIds({ isAdmin: true }, [2])).toEqual([2]);
    expect(vendorFinancialSiteIds({ isOwner: true }, [2])).toBeNull();
    expect(vendorFinancialSiteIds({}, [])).toEqual([]);
  });
  const paths = ["/summary", "/export?format=csv", "/export?format=xlsx", "/export?format=pdf", "/financial-review", "/23/statement", "/payables-preview?export=1", "/EXPORT?format=csv", "/2.3e1/statement"];
  function appFor(user: any, grant: boolean) {
    const app = express();
    app.use((req: any, _res, next) => {
      req.authUser = user;
      req.authPermissions = emptyMatrix();
      req.authPermissions.vendor_financials.view = grant;
      next();
    });
    app.use(vendorFinancialGuard({
      getUserSiteAccess: async () => [{ siteId: 2 }],
      getSites: async () => [{ id: 1, name: "Hidden" }, { id: 2, name: "Allowed" }],
    }));
    app.use((req, res) => res.json({ sites: financialSites(req) }));
    return app;
  }
  it.each(paths)("denies administrator guessing %s without a grant", async path => {
    const response = await request(appFor({ id: 1, isAdmin: true }, false)).get(`/api/vendor-bills${path}`);
    expect(response.status).toBe(403);
    expect(response.headers["cache-control"]).toContain("no-store");
  });
  it.each(paths)("permits explicitly granted administrator only within selected sites: %s", async path => {
    const response = await request(appFor({ id: 1, isAdmin: true }, true)).get(`/api/vendor-bills${path}`);
    expect(response.status).toBe(200);
    expect(response.body.sites).toEqual(["Allowed"]);
  });
  it("owner retains access without the checkbox; ordinary bill viewing is unchanged", async () => {
    expect((await request(appFor({ id: 1, isOwner: true }, false)).get("/api/vendor-bills/summary")).body.sites).toBeNull();
    expect((await request(appFor({ id: 1, isAdmin: true }, false)).get("/api/vendor-bills/23")).status).toBe(200);
  });
  it("never infers TDS from rate and accepts frozen recorded zero and amounts", () => {
    expect(recordedVendorTds({ totalAmount: 1000, tdsRate: 2 })).toBeNull();
    expect(recordedVendorTds({ hireStatements: [{ calculationSnapshot: { financials: { tdsAmount: 0 } } }] })).toBe(0);
    expect(recordedVendorTds({ hireStatements: [{ calculationSnapshot: { financials: { tdsAmount: 20 } } }] })).toBe(20);
    expect(recordedVendorTds({ hireStatements: [{}] })).toBeNull();
  });
});
