// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
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
  it("keeps legacy non-admin manager access when OFF and uses saved permission when ON", () => {
    state.user = { id: 7, isAdmin: false, isOwner: false, isFieldEngineer: false };
    state.permissions = {};
    state.accessRulesV2 = false;
    const legacy = renderHook(() => useAccessRule("site_req_review_ui"));
    expect(legacy.result.current).toBe(true);
    legacy.unmount();

    state.accessRulesV2 = true;
    const denied = renderHook(() => useAccessRule("site_req_review_ui"));
    expect(denied.result.current).toBe(false);
    denied.unmount();

    state.permissions = { site_dprs: { approve: true } };
    const granted = renderHook(() => useAccessRule("site_req_review_ui"));
    expect(granted.result.current).toBe(true);
  });
});
