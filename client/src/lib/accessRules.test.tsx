// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as any,
  permissions: {} as any,
  featureAccess: {} as any,
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => state }));

import { useAccessRule } from "./accessRules";

afterEach(() => {
  cleanup();
});

describe("useAccessRule", () => {
  it("uses legacy permissions before setup, then the shared role resolver on screen and server", async () => {
    const { canAccessRule } = await import("@shared/featureAccess");
    state.user = { id: 7, isActive: true, isAdmin: false, isOwner: false };
    state.permissions = {};
    state.featureAccess = { rolesConfigured: false, legacyPermissions: {} };
    const roleOnlyControls = [
      "site_req_review_ui",
      "site_req_status_api",
      "site_req_material_button",
      "site_req_equipment_button",
      "site_req_labour_button",
      "site_req_immediate_button",
      "site_req_execution_summary",
      "site_req_outcome",
      "execution_arrangement_outcome",
      "cutfill_reconciliation_ui",
      "cutfill_reconciliation_api",
      "ldo_orphan_cleanup",
    ] as const;
    for (const id of roleOnlyControls) {
      const result = renderHook(() => useAccessRule(id));
      expect(result.result.current, id).toBe(false);
      result.unmount();
    }
    const configured: any = {
      rolesConfigured: true,
      userRoles: [3],
      roleTicks: { 3: { site_requirements: { verify: true, edit: true } } },
      personalChanges: { site_requirements: { approve: false } },
      legacyPermissions: { site_dprs: { approve: true } },
    };
    state.featureAccess = configured;
    for (const id of roleOnlyControls) {
      const screen = renderHook(() => useAccessRule(id));
      expect(screen.result.current, id).toBe(canAccessRule(id, state.user, configured));
      screen.unmount();
    }
    expect(renderHook(() => useAccessRule("site_req_review_ui")).result.current).toBe(true);
    expect(renderHook(() => useAccessRule("site_req_outcome")).result.current).toBe(false);
    state.featureAccess = {
      rolesConfigured: true,
      userRoles: [],
      roleTicks: {},
      legacyPermissions: { site_dprs: { approve: true } },
    };
    expect(renderHook(() => useAccessRule("site_req_review_ui")).result.current).toBe(false);
  });

  it("wires the reviewed controls to the role-only checks", () => {
    const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
    const siteRequirements = source("client/src/pages/SiteRequirementsList.tsx");
    for (const id of [
      "site_req_review_ui",
      "site_req_status_api",
      "site_req_material_button",
      "site_req_equipment_button",
      "site_req_labour_button",
      "site_req_immediate_button",
      "site_req_execution_summary",
      "site_req_outcome",
    ]) {
      expect(siteRequirements.includes(`useAccessRule("${id}")`), id).toBe(true);
    }
    expect(source("client/src/pages/ExecutionArrangements.tsx"))
      .toContain('useAccessRule("execution_arrangement_outcome")');
    expect(source("client/src/pages/PlantLdoMismatch.tsx"))
      .toContain('useAccessRule("ldo_orphan_cleanup")');
  });
});
