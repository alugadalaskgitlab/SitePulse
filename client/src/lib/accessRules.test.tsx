// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as any,
  permissions: {} as any,
  accessRulesV2: false,
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => state }));

import { useAccessRule } from "./accessRules";

afterEach(() => {
  cleanup();
});

describe("useAccessRule", () => {
  it("keeps roleless users hidden on role-only controls when OFF and uses saved permissions when ON", () => {
    state.user = { id: 7, isAdmin: false, isOwner: false, isFieldEngineer: false };
    state.permissions = {};
    state.accessRulesV2 = false;
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
    const managerBased = renderHook(() => useAccessRule("dashboard_nav"));
    expect(managerBased.result.current).toBe(true);
    managerBased.unmount();

    state.user = { ...state.user, role: "manager" };
    const actualRole = renderHook(() => useAccessRule("site_req_review_ui"));
    expect(actualRole.result.current).toBe(true);
    actualRole.unmount();

    state.user = { id: 7, isAdmin: false, isOwner: false, isFieldEngineer: false };
    state.accessRulesV2 = true;
    const denied = renderHook(() => useAccessRule("site_req_review_ui"));
    expect(denied.result.current).toBe(false);
    denied.unmount();

    state.permissions = { site_dprs: { approve: true } };
    const granted = renderHook(() => useAccessRule("site_req_review_ui"));
    expect(granted.result.current).toBe(true);
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
