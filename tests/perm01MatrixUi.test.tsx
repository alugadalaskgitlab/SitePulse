// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PermissionsDialog } from "@/pages/UserManagement";
import { getQueryFn } from "@/lib/queryClient";
import { ACTIONS, emptyMatrix, type PermissionMatrix } from "@shared/permissions";

let actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
let stored: PermissionMatrix;
let writes: PermissionMatrix[];
vi.mock("@/lib/auth-context", () => ({ useAuth: () => actor }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const users = [{
  id: 41, fullName: "Matrix Fixture", isAdmin: false, notificationsEnabled: true,
  email: "fixture@example.invalid", phone: null, isFieldEngineer: false, isActive: true,
  sessionPolicy: "strict" as const, canManagePermissions: false, permissionManagerScope: null,
}];
let client: QueryClient;
beforeEach(() => {
  stored = emptyMatrix();
  writes = [];
  actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/users/41/permissions")) {
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body));
        writes.push(stored);
        return new Response(JSON.stringify({ ok: true, matrix: stored }), { status: 200 });
      }
      return new Response(JSON.stringify({ matrix: stored, isAdmin: false }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

async function open() {
  const result = render(
    <QueryClientProvider client={client}>
      <PermissionsDialog userId={41} users={users} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  await screen.findByTestId("button-save-perms");
  await waitFor(() => expect(checked("site_hub-access")).toBe(
    ["view", "create", "edit", "delete", "view_reports", "export", "approve"].some((a) => stored.site_hub[a as keyof typeof stored.site_hub]),
  ));
  return result;
}
function expand(group: string) {
  const trigger = screen.getByText(group).closest("button")!;
  if (trigger.getAttribute("data-state") === "closed") fireEvent.click(trigger);
}
const row = (key: string) => screen.getByTestId(`row-perm-${key}`);
const check = (key: string) => screen.getByTestId(`checkbox-${key}`);
const checked = (key: string) => check(key).getAttribute("data-state") === "checked";
async function save() {
  const count = writes.length;
  fireEvent.click(screen.getByTestId("button-save-perms"));
  await waitFor(() => expect(writes).toHaveLength(count + 1));
}

describe("PERM-01 C actual permissions dialog", () => {
  it("A/B: hub has one Access and inactive tooltip; Home offers only View/Edit", async () => {
    stored.site_hub.export = true;
    await open();
    expect(checked("site_hub-access")).toBe(true);
    expect(within(row("site_hub")).getAllByRole("checkbox")).toHaveLength(1);
    for (const a of ACTIONS.filter((a) => a !== "view")) {
      expect(screen.queryByTestId(`checkbox-site_hub-${a}`)).toBeNull();
      expect(screen.getByTestId(`cell-site_hub-${a}`).title).toBe("Not used for this section");
    }
    expect(check("dashboard-view")).toBeTruthy();
    expect(check("dashboard-edit")).toBeTruthy();
    for (const a of ACTIONS.filter((a) => a !== "view" && a !== "edit")) {
      expect(screen.queryByTestId(`checkbox-dashboard-${a}`)).toBeNull();
    }
  });

  it("C/D: four compatibility notes, working Reports/RMC compatibility, four unused notes", async () => {
    await open();
    expand("Legacy / Broad Keys (backward compat)");
    for (const key of ["site_procurement", "site_diesel", "vendor_bills", "admin_settings"]) {
      expect(screen.getByTestId(`note-${key}`).textContent).toContain("Compatibility");
      expect(check(`${key}-view`)).toBeTruthy();
    }
    for (const key of ["reports", "rmc_operations"]) {
      expect(screen.getByTestId(`note-${key}`).textContent).toContain("still grants access");
      expect(check(`${key}-view`)).toBeTruthy();
    }
    for (const key of ["hmp_operations", "reports_analysis", "estimates_manager", "app_management"]) {
      expect(screen.getByTestId(`note-${key}`).textContent).toContain("Not currently used");
      expect(within(row(key)).queryByRole("checkbox")).toBeNull();
    }
  });

  it("action audit: Mix Calculator Edit and Device Approval Edit remain grantable", async () => {
    await open();
    expect(check("mix_calculator-edit")).toBeTruthy();
    expect(check("device_approval-edit")).toBeTruthy();
  });

  it("E: no-change save preserves every alias; enable then revoke roundtrips without touching hidden Notify", async () => {
    stored.site_hub = { ...stored.site_hub, export: true, notify: true };
    stored.dashboard.create = true;
    await open();
    await save();
    expect(stored.site_hub.export).toBe(true);
    expect(stored.site_hub.notify).toBe(true);
    expect(stored.dashboard.create).toBe(true);

    client.clear();
    cleanup();
    await open();
    fireEvent.click(check("site_hub-access"));
    expect(checked("site_hub-access")).toBe(false);
    await save();
    expect(stored.site_hub.export).toBe(false);
    expect(stored.site_hub.notify).toBe(true);
    expect(stored.dashboard.create).toBe(true);

    client.clear();
    cleanup();
    await open();
    fireEvent.click(check("site_hub-access"));
    await save();
    expect(stored.site_hub.view).toBe(true);
    expect(stored.site_hub.notify).toBe(true);
  });

  it("partial manager: cannot revoke unowned hub aliases or save a matrix containing unowned grants", async () => {
    actor = { isAdmin: false, canManagePermissions: true, permissionManagerScope: "partial", permissions: emptyMatrix() };
    actor.permissions.site_hub.view = true;
    stored.site_hub.export = true;
    await open();
    expect(checked("site_hub-access")).toBe(true);
    expect(check("site_hub-access").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("warning-unmanaged-grants")).toBeTruthy();
    expect(screen.getByTestId("button-save-perms").hasAttribute("disabled")).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it("partial manager: owned hub alias can be enabled/revoked without exceeding grant cap", async () => {
    actor = { isAdmin: false, canManagePermissions: true, permissionManagerScope: "partial", permissions: emptyMatrix() };
    actor.permissions.site_hub.edit = true;
    await open();
    fireEvent.click(check("site_hub-access"));
    await save();
    expect(stored.site_hub.edit).toBe(true);
    expect(stored.site_hub.view).toBe(false);
    client.clear();
    cleanup();
    await open();
    fireEvent.click(check("site_hub-access"));
    await save();
    expect(stored.site_hub.edit).toBe(false);
  });

  it("group Grant all uses hub Access and leaves inactive historical fields unchanged", async () => {
    stored.site_hub.notify = true;
    await open();
    fireEvent.click(check("group-hubs-all"));
    expect(checked("site_hub-access")).toBe(true);
    await save();
    expect(stored.site_hub.view).toBe(true);
    expect(stored.site_hub.notify).toBe(true);
    client.clear();
    cleanup();
    await open();
    fireEvent.click(check("group-hubs-all"));
    await save();
    expect(stored.site_hub.view).toBe(false);
    expect(stored.site_hub.notify).toBe(true);
  });
});