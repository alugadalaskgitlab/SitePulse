/**
 * Pre-Deployment site-access security fix.
 *
 * Core rule change: a non-admin user with ZERO user_site_access rows and no
 * explicit all-sites grant gets NO site access ([]), not unrestricted (null).
 * Company-wide access is always an explicit recorded grant.
 *
 * Also covers the new guided-creation role templates.
 */
import { describe, it, expect } from "vitest";
import { resolvePermittedSiteIds } from "../shared/siteAccess";
import { applyRoleTemplate, ROLE_TEMPLATES, emptyMatrix, SECTION_KEYS } from "../shared/permissions";

const plain = { isAdmin: false, isOwner: false, allSitesAccess: false, setupComplete: true };

describe("resolvePermittedSiteIds — deny-by-default semantics", () => {
  it("non-admin with zero rows and no grant → [] (deny all), NOT null", () => {
    expect(resolvePermittedSiteIds(plain, [])).toEqual([]);
  });

  it("non-admin with explicit site rows → exactly those sites", () => {
    expect(resolvePermittedSiteIds(plain, [3, 7])).toEqual([3, 7]);
  });

  it("duplicate row ids are de-duplicated", () => {
    expect(resolvePermittedSiteIds(plain, [3, 3, 7])).toEqual([3, 7]);
  });

  it("explicit all-sites grant → null (unrestricted)", () => {
    expect(resolvePermittedSiteIds({ ...plain, allSitesAccess: true }, [])).toBeNull();
  });

  it("admin → null regardless of rows/grants", () => {
    expect(resolvePermittedSiteIds({ ...plain, isAdmin: true }, [])).toBeNull();
  });

  it("owner (isOwner without isAdmin) retains unrestricted access", () => {
    expect(resolvePermittedSiteIds({ ...plain, isOwner: true }, [])).toBeNull();
  });

  it("setup-incomplete user → [] even with saved site rows", () => {
    expect(resolvePermittedSiteIds({ ...plain, setupComplete: false }, [1, 2])).toEqual([]);
  });

  it("setup-incomplete user → [] even with an all-sites grant recorded", () => {
    expect(resolvePermittedSiteIds({ ...plain, setupComplete: false, allSitesAccess: true }, [])).toEqual([]);
  });

  it("setup-incomplete admin still unrestricted (admins are complete by definition)", () => {
    expect(resolvePermittedSiteIds({ ...plain, isAdmin: true, setupComplete: false }, [])).toBeNull();
  });

  it("unknown/missing user → [] (deny), never null", () => {
    expect(resolvePermittedSiteIds(null, [1])).toEqual([]);
    expect(resolvePermittedSiteIds(undefined, [])).toEqual([]);
  });

  it("legacy rows with undefined new columns behave safely (grandfathered complete, no grant)", () => {
    // setupComplete undefined ≠ false → treated as complete; no grant → rows decide
    expect(resolvePermittedSiteIds({ isAdmin: false, isOwner: false }, [])).toEqual([]);
    expect(resolvePermittedSiteIds({ isAdmin: false, isOwner: false }, [5])).toEqual([5]);
  });
});

describe("role templates — guided creation step 2", () => {
  it("catalog includes the new templates", () => {
    const ids = ROLE_TEMPLATES.map((t) => t.id);
    for (const id of ["site_engineer", "project_manager", "stores", "procurement", "equipment_plant", "billing_measurements", "viewer"]) {
      expect(ids).toContain(id);
    }
  });

  it("every template id resolves to a non-empty matrix", () => {
    for (const t of ROLE_TEMPLATES) {
      const m = applyRoleTemplate(t.id);
      const anyGranted = SECTION_KEYS.some((k) => Object.values(m[k]).some(Boolean));
      expect(anyGranted, `template ${t.id} should grant something`).toBe(true);
    }
  });

  it("unknown template id → empty matrix (no accidental grants)", () => {
    expect(applyRoleTemplate("nonsense")).toEqual(emptyMatrix());
  });

  it("stores template can issue IRNs but cannot raise purchase indents", () => {
    const m = applyRoleTemplate("stores");
    expect(m.irn_approve.approve).toBe(true);
    expect(m.purchase_indents_raise.create).toBe(false);
    expect(m.stores_inventory.view).toBe(true);
  });

  it("procurement template raises PIs but has no admin/user-management access", () => {
    const m = applyRoleTemplate("procurement");
    expect(m.purchase_indents_raise.create).toBe(true);
    expect(m.user_management.view).toBe(false);
    expect(m.admin_settings.view).toBe(false);
  });

  it("viewer template is strictly read-only — no create/edit/delete/approve anywhere", () => {
    const m = applyRoleTemplate("viewer");
    for (const k of SECTION_KEYS) {
      expect(m[k].create, k).toBe(false);
      expect(m[k].edit, k).toBe(false);
      expect(m[k].delete, k).toBe(false);
      expect(m[k].approve, k).toBe(false);
    }
    expect(m.site_dprs.view).toBe(true);
  });

  it("applyRoleTemplate returns fresh copies (no shared mutable state)", () => {
    const a = applyRoleTemplate("stores");
    a.stores_inventory.view = false;
    expect(applyRoleTemplate("stores").stores_inventory.view).toBe(true);
  });
});
