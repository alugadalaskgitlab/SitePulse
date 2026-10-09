// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateUserDialog, EditUserDialog, PermissionsDialog } from "@/pages/UserManagement";
import { getQueryFn } from "@/lib/queryClient";
import { PermissionReview, primaryRoleTemplates, proposeRole, retainedSensitivePermissions } from "./user-role-review";
import { applyRoleTemplate, emptyMatrix, type PermissionMatrix } from "@shared/permissions";

let actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => actor }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const users = [{
  id: 41, fullName: "Kavita Rao", isAdmin: false, isOwner: false, email: "kavita@example.invalid",
  phone: null, isFieldEngineer: false, isActive: true, notificationsEnabled: true,
  sessionPolicy: "strict" as const, canManagePermissions: false, permissionManagerScope: null,
  businessRole: null as string | null,
}];
let stored: PermissionMatrix;
let writes: PermissionMatrix[];
let permissionBodies: (PermissionMatrix | { matrix: PermissionMatrix; businessRole: string | null })[];
let designation: string | null;
let client: QueryClient;
let creationResult: { id: number; setupOk: boolean; setupComplete: boolean; setupError?: string };
let createBodies: Record<string, unknown>[];
let retries: number;
beforeEach(() => {
  stored = emptyMatrix();
  writes = [];
  permissionBodies = [];
  designation = null;
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
        const body = JSON.parse(String(init.body));
        permissionBodies.push(body);
        stored = body.matrix ?? body;
        if ("businessRole" in body) designation = body.businessRole;
        writes.push(stored);
        return new Response(JSON.stringify({ ok: true, matrix: stored, businessRole: designation }));
      }
      return new Response(JSON.stringify({ matrix: stored, isAdmin: false, businessRole: designation }));
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
    expect(screen.getByTestId("role-change-list").textContent).toContain("Remove — Site Operations Hub (entry page) / Receive Notifications");
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
  it("privileged accounts explicitly retain their flags when reviewing an ordinary role", async () => {
    mount(<PermissionsDialog userId={41} users={[{ ...users[0], isOwner: true }]} onClose={vi.fn()} />);
    await screen.findByTestId("button-save-perms");
    expect(screen.getByTestId("select-role-template").hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("banner-admin-permissions").textContent).toContain("does not remove these flags");
    await chooseRole();
    expect(screen.getByTestId("role-retained-access").textContent).toContain("Owner: enabled");
    expect(writes).toHaveLength(0);
  });
});

async function fillDetails() {
  fireEvent.change(screen.getByTestId("input-new-fullname"), { target: { value: "Kavita Rao" } });
  fireEvent.change(screen.getByTestId("input-new-email"), { target: { value: "kavita@example.invalid" } });
  fireEvent.change(screen.getByTestId("input-new-password"), { target: { value: "temporary-2026" } });
  fireEvent.click(screen.getByTestId("button-wizard-next"));
}
describe("USER-ROLE-02 durable designation and reviewed saves", () => {
  it("explains pending Save, stages designation, then persists and reads it back on reopen", async () => {
    await openPermissions();
    await chooseRole();
    expect(screen.getByTestId("permissions-save-reason").textContent).toContain("review differences, then Confirm");
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    expect(screen.getByTestId("staged-business-role").textContent).toContain("Site Engineer");
    expect(permissionBodies).toHaveLength(0);
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(permissionBodies).toHaveLength(1));
    expect(permissionBodies[0]).toEqual({ matrix: stored, businessRole: "site_engineer" });
    cleanup();
    client.removeQueries({ queryKey: ["/api/auth/users", 41, "permissions"] });
    await openPermissions();
    expect(screen.getByTestId("permissions-designation").textContent).toContain("Stored designation: Site Engineer");
    expect(screen.queryByTestId("staged-business-role")).toBeNull();
  }, 15000);

  it("advanced-only save uses raw matrix and preserves existing designation", async () => {
    designation = "project_manager";
    await openPermissions();
    fireEvent.click(screen.getByTestId("checkbox-site_hub-access"));
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(permissionBodies).toHaveLength(1));
    expect(permissionBodies[0]).toEqual(stored);
    expect(permissionBodies[0]).not.toHaveProperty("businessRole");
    expect(designation).toBe("project_manager");
  });

  it("never infers designation from a template-shaped matrix", async () => {
    stored = applyRoleTemplate("operations_director");
    await openPermissions();
    expect(screen.getByTestId("permissions-designation").textContent).toContain("Stored designation: Not designated");
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(permissionBodies).toHaveLength(1));
    expect(permissionBodies[0]).not.toHaveProperty("businessRole");
    expect(designation).toBeNull();
  });

  it("lists retained sensitive bits and unchanged privileged flags without implying removal", async () => {
    stored.site_hub.delete = true;
    stored.site_hub.export = true;
    stored.site_hub.notify = true;
    stored.user_management.view = true;
    stored.admin_settings.edit = true;
    stored.device_approval.notify = true;
    mount(<PermissionsDialog userId={41} users={[{ ...users[0], isAdmin: true, isOwner: true, canManagePermissions: true, permissionManagerScope: "full", canUnlockRecords: true }]} onClose={vi.fn()} />);
    await screen.findByTestId("button-save-perms");
    await chooseRole();
    const text = screen.getByTestId("role-retained-access").textContent!;
    for (const label of ["Delete", "Export", "Receive Notifications", "Administrator: enabled", "Owner: enabled", "Permission manager: enabled (full)", "Record unlock: enabled"]) expect(text).toContain(label);
    const retained = retainedSensitivePermissions(stored, proposeRole(stored, applyRoleTemplate("operations_director"), "merge", () => true).matrix);
    expect(retained).toContainEqual({ section: "admin_settings", action: "edit", enabled: true });
    expect(retained).toContainEqual({ section: "user_management", action: "view", enabled: true });
    expect(text).toContain("does not remove any existing access");
  }, 15000);

  it("protects staged/manual edits on Cancel and Escape, blocks copy, and preserves them across refetch", async () => {
    const close = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(<PermissionsDialog userId={41} users={[...users, { ...users[0], id: 42 }]} onClose={close} />);
    await screen.findByTestId("button-save-perms");
    fireEvent.click(screen.getByTestId("checkbox-site_hub-access"));
    expect(screen.getByTestId("select-copy-from").hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await chooseRole();
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    client.setQueryData(["/api/auth/users", 41, "permissions"], { matrix: emptyMatrix(), isAdmin: false, businessRole: "viewer" });
    await waitFor(() => expect(screen.getByTestId("staged-business-role").textContent).toContain("Site Engineer"));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe("checked");
    expect(confirm).toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(close).toHaveBeenCalledOnce();
    expect(writes).toHaveLength(0);
    confirm.mockRestore();
  }, 15000);

  it("canceling a later preview keeps the previous staged designation", async () => {
    await openPermissions();
    await chooseRole();
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    await chooseRole();
    fireEvent.click(screen.getByTestId("button-cancel-role"));
    expect(screen.getByTestId("staged-business-role").textContent).toContain("Site Engineer");
    expect(screen.getByTestId("button-save-perms").hasAttribute("disabled")).toBe(false);
  }, 15000);

  it("explicit designation clearing retains permissions and sends null only after confirmation", async () => {
    designation = "viewer";
    stored = applyRoleTemplate("viewer");
    await openPermissions();
    fireEvent.keyDown(screen.getByTestId("select-role-template"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByTestId("template-clear"));
    expect(screen.getByTestId("role-change-list").textContent).toContain("No section/action changes");
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(permissionBodies).toHaveLength(1));
    expect(permissionBodies[0]).toEqual({ matrix: applyRoleTemplate("viewer"), businessRole: null });
  }, 15000);

  it("failed Save retains the confirmed designation and manual edits for retry", async () => {
    await openPermissions();
    await chooseRole();
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Temporary failure" }), { status: 503 }));
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(screen.getByTestId("button-save-perms").hasAttribute("disabled")).toBe(false));
    expect(screen.getByTestId("staged-business-role").textContent).toContain("Site Engineer");
    expect(screen.getByTestId("checkbox-site_hub-access").getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(permissionBodies).toHaveLength(1));
    expect(designation).toBe("site_engineer");
  }, 15000);

  it("Custom can be explicitly confirmed without deleting individual grants in merge", async () => {
    stored.site_hub.view = true;
    await openPermissions();
    fireEvent.keyDown(screen.getByTestId("select-role-template"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByTestId("template-custom"));
    expect(screen.getByTestId("role-change-list").textContent).toContain("No section/action changes");
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(permissionBodies).toHaveLength(1));
    expect(designation).toBe("custom");
    expect(stored.site_hub.view).toBe(true);
  }, 15000);

  it("Edit User separates stored designation from flags and guards profile edits before opening review", () => {
    const change = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(<EditUserDialog userId={41} users={[{ ...users[0], businessRole: "operations_director", isAdmin: true }]} onClose={vi.fn()} onPermissions={change} />);
    expect(screen.getByTestId("edit-business-role").textContent).toContain("Operations Director");
    expect(screen.getByText(/Administrator: enabled · Owner: off/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-edit-fullname"), { target: { value: "Changed profile" } });
    fireEvent.click(screen.getByTestId("button-edit-role"));
    expect(change).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("button-edit-role"));
    expect(change).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });
});

describe("USER-ROLE-01 guided setup", () => {
  it("Custom creation sends an explicit durable designation", async () => {
    mount(<CreateUserDialog open onClose={vi.fn()} />);
    await fillDetails();
    fireEvent.click(screen.getByTestId("wizard-template-custom").querySelector("input")!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-sites-all").querySelector("input")!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("button-create-user-confirm"));
    await screen.findByTestId("wizard-advanced");
    expect(createBodies[0].roleTemplate).toBe("custom");
  });
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
