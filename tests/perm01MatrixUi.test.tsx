// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PermissionsDialog } from "@/pages/UserManagement";
import { getQueryFn } from "@/lib/queryClient";
import { ACTIONS, emptyMatrix, type PermissionMatrix } from "@shared/permissions";

let actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
let stored: PermissionMatrix;
let writes: PermissionMatrix[];
let close: Mock<() => void>;
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
  close = vi.fn();
  actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/users/41/permissions")) {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        expect(body).not.toHaveProperty("businessRole");
        stored = body;
        writes.push(stored);
        return new Response(JSON.stringify({ ok: true, matrix: stored }), { status: 200 });
      }
      return new Response(JSON.stringify({ matrix: stored, isAdmin: false, businessRole: null }), { status: 200 });
    }
    if (url.endsWith("/api/sites")) return new Response(JSON.stringify([]));
    if (url.endsWith("/api/auth/users/41/site-access")) {
      return new Response(JSON.stringify({ siteIds: [], allSites: false, setupComplete: true }));
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

async function open() {
  const beforeWrites = writes.length;
  const result = render(
    <QueryClientProvider client={client}>
      <PermissionsDialog userId={41} users={users} onClose={close} />
    </QueryClientProvider>,
  );
  await screen.findByTestId("button-save-perms");
  await screen.findByTestId("hierarchical-permissions-editor");
  expect(writes).toHaveLength(beforeWrites);
  fireEvent.click(screen.getByTestId("toggle-legacy-permissions"));
  await waitFor(() => expect(checked("site_hub-access")).toBe(
    stored.site_hub.view,
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
  const closes = close.mock.calls.length;
  const reads = vi.mocked(fetch).mock.calls.filter(([url, init]) =>
    String(url).endsWith("/permissions") && (!init?.method || init.method === "GET")).length;
  fireEvent.click(screen.getByTestId("button-save-perms"));
  await waitFor(() => expect(writes).toHaveLength(count + 1));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(closes + 1));
  expect(vi.mocked(fetch).mock.calls.filter(([url, init]) =>
    String(url).endsWith("/permissions") && (!init?.method || init.method === "GET")).length).toBeGreaterThan(reads);
}

describe("PERM-01 C actual permissions dialog", () => {
  it("A/B: hub has one Access; Home exposes its explicit subscription Delete action", async () => {
    stored.site_hub.export = true;
    await open();
    expect(checked("site_hub-access")).toBe(false);
    expect(within(row("site_hub")).getAllByRole("checkbox")).toHaveLength(1);
    for (const a of ACTIONS.filter((a) => a !== "view")) {
      expect(screen.queryByTestId(`checkbox-site_hub-${a}`)).toBeNull();
      expect(screen.queryByTestId(`cell-site_hub-${a}`)).toBeNull();
    }
    expect(check("dashboard-view")).toBeTruthy();
    expect(check("dashboard-edit")).toBeTruthy();
    expect(check("dashboard-delete")).toBeTruthy();
    for (const a of ACTIONS.filter((a) => a !== "view" && a !== "edit" && a !== "delete")) {
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
    expect(checked("site_hub-access")).toBe(true);
    await save();
    expect(stored.site_hub.export).toBe(true);
    expect(stored.site_hub.notify).toBe(true);
    expect(stored.dashboard.create).toBe(true);

    client.clear();
    cleanup();
    await open();
    fireEvent.click(check("site_hub-access"));
    await save();
    expect(stored.site_hub.view).toBe(false);
    expect(stored.site_hub.notify).toBe(true);
  // Three full matrix renders and saves can exceed the default five seconds
  // while the full suite's SQL fixtures run alongside this browser test.
  }, 15_000);

  it("partial manager: View alone controls Access while unowned historical grants still prevent save", async () => {
    actor = { isAdmin: false, canManagePermissions: true, permissionManagerScope: "partial", permissions: emptyMatrix() };
    actor.permissions.site_hub.view = true;
    stored.site_hub.export = true;
    await open();
    expect(checked("site_hub-access")).toBe(false);
    expect(check("site_hub-access").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("warning-unmanaged-grants")).toBeTruthy();
    expect(screen.getByTestId("button-save-perms").hasAttribute("disabled")).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it("partial manager: Edit alone cannot grant hub View or change inert aliases", async () => {
    actor = { isAdmin: false, canManagePermissions: true, permissionManagerScope: "partial", permissions: emptyMatrix() };
    actor.permissions.site_hub.edit = true;
    await open();
    expect(check("site_hub-access").hasAttribute("disabled")).toBe(true);
    fireEvent.click(check("site_hub-access"));
    await save();
    expect(stored.site_hub.edit).toBe(false);
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