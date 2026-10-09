// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateUserDialog, PermissionsDialog } from "@/pages/UserManagement";
import { getQueryFn } from "@/lib/queryClient";
import { PermissionReview, primaryRoleTemplates, proposeRole } from "./user-role-review";
import { applyRoleTemplate, emptyMatrix, type PermissionMatrix } from "@shared/permissions";

let actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => actor }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const users = [{
  id: 41, fullName: "Kavita Rao", isAdmin: false, isOwner: false, email: "kavita@example.invalid",
  phone: null, isFieldEngineer: false, isActive: true, notificationsEnabled: true,
  sessionPolicy: "strict" as const, canManagePermissions: false, permissionManagerScope: null,
}];
let stored: PermissionMatrix;
let writes: PermissionMatrix[];
let client: QueryClient;
let creationResult: { id: number; setupOk: boolean; setupComplete: boolean; setupError?: string };
let createBodies: Record<string, unknown>[];
let retries: number;
beforeEach(() => {
  stored = emptyMatrix();
  writes = [];
  createBodies = [];
  retries = 0;
  creationResult = { id: 41, setupOk: true, setupComplete: true };
  actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/auth/users/41/permissions")) {
      if (init?.method === "PUT") {
        stored = JSON.parse(String(init.body));
        writes.push(stored);
        return new Response(JSON.stringify({ ok: true, matrix: stored }));
      }
      return new Response(JSON.stringify({ matrix: stored, isAdmin: false }));
    }
    if (url.endsWith("/api/sites")) return new Response(JSON.stringify([{ id: 7, name: "Eastern Link Road", isActive: 1 }]));
    if (url.endsWith("/api/auth/users") && init?.method === "POST") {
      createBodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(creationResult));
    }
    if (url.endsWith("/api/auth/users/41/complete-setup") && init?.method === "POST") {
      retries++;
      return new Response(JSON.stringify({ ok: true, setupComplete: true }));
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });
function mount(element: ReactNode) {
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
async function openPermissions() {
  mount(<PermissionsDialog userId={41} users={users} onClose={vi.fn()} />);
  await screen.findByTestId("button-save-perms");
  await waitFor(() => expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe(stored.site_hub.view ? "checked" : "unchecked"));
}
async function chooseRole() {
  fireEvent.keyDown(screen.getByTestId("select-role-template"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByTestId("template-site_engineer"));
  await screen.findByTestId("role-change-preview");
}

describe("USER-ROLE-01 role proposals", () => {
  it("merge retains hidden aliases, Notify and individual adjustments", () => {
    stored.site_hub.export = true;
    stored.site_hub.notify = true;
    stored.device_approval.edit = true;
    const result = proposeRole(stored, applyRoleTemplate("site_engineer"), "merge", () => true);
    expect(result.matrix.site_hub.export).toBe(true);
    expect(result.matrix.site_hub.notify).toBe(true);
    expect(result.matrix.device_approval.edit).toBe(true);
    expect(result.changes.some((c) => !c.enabled)).toBe(false);
    expect(stored.site_dprs.view).toBe(false);
  });
  it("replacement enumerates exact removals, including hidden bits", () => {
    stored.site_hub.notify = true;
    const result = proposeRole(stored, emptyMatrix(), "replace", () => true);
    expect(result.changes).toEqual([{ section: "site_hub", action: "notify", enabled: false }]);
    expect(stored.site_hub.notify).toBe(true);
  });
  it("partial replacement preserves unowned grants while excluding unowned additions", () => {
    stored.site_hub.export = true;
    const result = proposeRole(stored, applyRoleTemplate("site_engineer"), "replace", (s, a) => s === "site_dprs" && a === "view");
    expect(result.matrix.site_hub.export).toBe(true);
    expect(result.matrix.site_dprs.view).toBe(true);
    expect(result.matrix.site_dprs.create).toBe(false);
    expect(result.capped).toContainEqual({ section: "site_hub", action: "export", enabled: false });
  });
  it("catalog hides compatibility templates and empty review warns about unusable operations", () => {
    expect(primaryRoleTemplates().some((r) => ["stores", "procurement"].includes(r.id))).toBe(false);
    expect(primaryRoleTemplates().map((r) => r.id)).toEqual([
      "operations_director", "project_manager", "site_engineer", "site_supervisor",
      "stores_procurement", "equipment_plant", "billing_measurements", "viewer",
    ]);
    render(<PermissionReview matrix={emptyMatrix()} />);
    expect(screen.getByText(/No operational section has View access/)).toBeTruthy();
    expect(screen.getByText(/Receive Administrator or Owner/)).toBeTruthy();
  });
});

describe("USER-ROLE-01 existing-user workflow", () => {
  it("selection and cancellation do not stage changes; confirm stages; only Save persists", async () => {
    stored.site_hub.notify = true;
    await openPermissions();
    await chooseRole();
    expect(writes).toHaveLength(0);
    expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe("unchecked");
    expect(screen.getByTestId("button-save-perms").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("button-cancel-role"));
    expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe("unchecked");
    await chooseRole();
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe("checked");
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(stored.site_hub.notify).toBe(true);
    expect(stored).toEqual(proposeRole({ ...emptyMatrix(), site_hub: { ...emptyMatrix().site_hub, notify: true } }, applyRoleTemplate("site_engineer"), "merge", () => true).matrix);
  }, 15000);
  it("explicit replacement preview lists removal before confirming", async () => {
    stored.site_hub.notify = true;
    await openPermissions();
    await chooseRole();
    fireEvent.click(screen.getByTestId("role-mode-replace"));
    expect(screen.getByTestId("role-change-list").textContent).toContain("Remove — Site Operations Hub (entry page) / Notify");
    expect(stored.site_hub.notify).toBe(true);
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(stored.site_hub.notify).toBe(false);
  }, 15000);
  it("partial preview caps changes and never enables Save with unowned historical grants", async () => {
    actor.isAdmin = false;
    actor.permissionManagerScope = "partial";
    actor.permissions.site_dprs.view = true;
    stored.site_hub.export = true;
    await openPermissions();
    await chooseRole();
    expect(screen.getByTestId("role-preview-capped")).toBeTruthy();
    expect(screen.getByTestId("button-confirm-role").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("button-save-perms").hasAttribute("disabled")).toBe(true);
    expect(writes).toHaveLength(0);
    expect(stored.site_hub.export).toBe(true);
  }, 15000);
  it("background query updates do not overwrite confirmed but unsaved role adjustments", async () => {
    await openPermissions();
    await chooseRole();
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    client.setQueryData(["/api/auth/users", 41, "permissions"], { matrix: emptyMatrix(), isAdmin: false });
    await waitFor(() => expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe("checked"));
    expect(writes).toHaveLength(0);
  }, 15000);
  it("privileged accounts cannot be accidentally treated as ordinary template accounts", async () => {
    mount(<PermissionsDialog userId={41} users={[{ ...users[0], isOwner: true }]} onClose={vi.fn()} />);
    await screen.findByTestId("button-save-perms");
    expect(screen.getByTestId("select-role-template").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("banner-admin-permissions").textContent).toContain("does not remove these flags");
    expect(writes).toHaveLength(0);
  });
});

async function fillDetails() {
  fireEvent.change(screen.getByTestId("input-new-fullname"), { target: { value: "Kavita Rao" } });
  fireEvent.change(screen.getByTestId("input-new-email"), { target: { value: "kavita@example.invalid" } });
  fireEvent.change(screen.getByTestId("input-new-password"), { target: { value: "temporary-2026" } });
  fireEvent.click(screen.getByTestId("button-wizard-next"));
}
describe("USER-ROLE-01 guided setup", () => {
  it("only current administrators can select the privileged option", async () => {
    actor.isAdmin = false;
    mount(<CreateUserDialog open onClose={vi.fn()} />);
    await fillDetails();
    expect(screen.queryByTestId("wizard-full-access")).toBeNull();
    expect(screen.queryByTestId("wizard-template-stores")).toBeNull();
  });
  it("review precedes create; step five opens the existing editor only after setup succeeds", async () => {
    const advanced = vi.fn();
    mount(<CreateUserDialog open onClose={vi.fn()} onAdvanced={advanced} />);
    await fillDetails();
    expect(screen.getByText(/Owner status cannot be conferred/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("wizard-template-site_engineer").querySelector("input")!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-sites-all").querySelector("input")!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    expect(screen.getByTestId("role-capability-review")).toBeTruthy();
    expect(screen.queryByTestId("button-wizard-advanced")).toBeNull();
    fireEvent.click(screen.getByTestId("button-create-user-confirm"));
    fireEvent.click(await screen.findByTestId("button-wizard-advanced"));
    expect(advanced).toHaveBeenCalledWith(41);
  });
  it("Administrator uses explicit all-site setup without conferring Owner status", async () => {
    mount(<CreateUserDialog open onClose={vi.fn()} />);
    await fillDetails();
    fireEvent.click(screen.getByTestId("wizard-full-access"));
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    expect(screen.getByTestId("text-admin-skip-sites")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("button-create-user-confirm"));
    await screen.findByTestId("wizard-advanced");
    expect(createBodies[0].isAdmin).toBe(true);
    expect(createBodies[0].siteAccess).toEqual({ mode: "all" });
    expect(createBodies[0]).not.toHaveProperty("isOwner");
    expect(createBodies[0]).not.toHaveProperty("roleTemplate");
  });
  it("incomplete setup never opens advanced or claims readiness; retry reuses the account", async () => {
    creationResult = { id: 41, setupOk: true, setupComplete: false, setupError: "site_access_failed" };
    mount(<CreateUserDialog open onClose={vi.fn()} onAdvanced={vi.fn()} />);
    await fillDetails();
    fireEvent.click(screen.getByTestId("wizard-template-site_engineer").querySelector("input")!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-sites-all").querySelector("input")!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("button-create-user-confirm"));
    await screen.findByTestId("banner-setup-incomplete");
    expect(screen.queryByTestId("wizard-advanced")).toBeNull();
    expect(screen.queryByTestId("button-wizard-advanced")).toBeNull();
    fireEvent.click(screen.getByTestId("button-wizard-retry"));
    await screen.findByTestId("wizard-advanced");
    expect(createBodies).toHaveLength(1);
    expect(retries).toBe(1);
  });
});
