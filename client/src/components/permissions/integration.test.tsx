// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateUserDialog, PermissionsDialog } from "@/pages/UserManagement";
import { getQueryFn } from "@/lib/queryClient";
import { emptyMatrix, type PermissionMatrix } from "@shared/permissions";

const state = vi.hoisted(() => ({ toast: vi.fn() }));
let actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => actor }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
let client: QueryClient;
let stored: PermissionMatrix;
let failReadBack: boolean;
let writes: { method: string; path: string; body: unknown }[];
const user = {
  id: 72, fullName: "Harish Menon", isAdmin: false, isOwner: false, notificationsEnabled: true,
  email: "harish@example.invalid", phone: null, isFieldEngineer: false, isActive: true,
  sessionPolicy: "strict" as const, canManagePermissions: false, permissionManagerScope: null,
};
beforeEach(() => {
  stored = emptyMatrix(); stored.site_hub.export = true;
  failReadBack = false; writes = []; state.toast.mockClear();
  actor = { isAdmin: true, canManagePermissions: true, permissionManagerScope: "full", permissions: emptyMatrix() };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: getQueryFn({ on401: "throw" }) } } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (method !== "GET") {
      const body = JSON.parse(String(init?.body));
      writes.push({ path, method, body });
      if (path.endsWith("/permissions")) stored = body.matrix ?? body;
      return new Response(JSON.stringify({ ok: true, id: 72, setupOk: true }), { status: 200 });
    }
    if (path.endsWith("/permissions")) {
      if (failReadBack && writes.length) return new Response("fixture read-back unavailable", { status: 503 });
      return new Response(JSON.stringify({ matrix: stored, isAdmin: false, businessRole: null }), { status: 200 });
    }
    if (path.endsWith("/site-access")) return new Response(JSON.stringify({ siteIds: [5], allSites: false }));
    if (path === "/api/sites") return new Response(JSON.stringify([{ id: 5, name: "Kaveri Package 04", isActive: 1 }]));
    if (path === "/api/auth/users") return new Response(JSON.stringify([user]));
    throw new Error(`Unexpected isolated fixture request ${method} ${path}`);
  }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function openDialog() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={client}><PermissionsDialog userId={72} users={[user]} onClose={onClose} /></QueryClientProvider>);
  await screen.findByTestId("hierarchical-permissions-editor");
  return onClose;
}
function editAndReview() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }));
  fireEvent.click(screen.getByRole("button", { name: /Review 1 legacy/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm legacy change review" }));
}

describe("existing API integration in isolated fixtures — NOT authenticated proof", () => {
  it("loads current sites and grants without any opening write", async () => {
    await openDialog();
    expect((await screen.findAllByText(/Kaveri Package 04/)).length).toBeGreaterThan(0);
    expect(writes).toEqual([]);
    expect((screen.getByTestId("button-save-perms") as HTMLButtonElement).disabled).toBe(true);
  });
  it("cancel discards only unsaved drafts, including proposed-only previews", async () => {
    const onClose = await openDialog();
    fireEvent.change(screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" }), { target: { value: "deny" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(writes).toEqual([]);
  });
  it("only saves reviewed legacy bits, preserves hidden grants, and GET read-back precedes success", async () => {
    const onClose = await openDialog();
    fireEvent.change(screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" }), { target: { value: "deny" } });
    editAndReview();
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("/api/auth/users/72/permissions");
    expect(writes[0].method).toBe("PUT");
    const saved = writes[0].body as PermissionMatrix;
    expect(saved.site_dprs.view).toBe(true);
    expect(saved.site_hub.export).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("site_requirements.allocate_labour");
    expect(JSON.stringify(saved)).not.toContain("deny");
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Existing permissions saved", description: expect.stringContaining("were not saved or enforced"),
    }));
    const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/permissions"));
    // Existing success invalidations can perform further GETs after read-back.
    expect(calls.slice(0, 3).map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "PUT", "GET"]);
    expect(calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    expect(calls.every(([, init]) => init?.credentials === "include")).toBe(true);
  });
  it("does not claim save success if accepted PUT cannot be verified", async () => {
    const onClose = await openDialog();
    editAndReview(); failReadBack = true;
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Save read-back not verified" })));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId("button-save-perms") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/the update request was accepted but read-back/)).toBeTruthy();
    expect(writes).toHaveLength(1);
  // Review + async PUT/read-back + error-state render run alongside the legacy
  // grid suite, whose own multi-render cases use this same budget.
  }, 15000);
  it("retains the legacy fallback with the same staged matrix and save API", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }));
    fireEvent.click(screen.getByTestId("toggle-legacy-permissions"));
    expect(screen.queryByTestId("hierarchical-permissions-editor")).toBeNull();
    expect(screen.getByTestId("checkbox-site_dprs-view").getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByTestId("button-save-perms"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect((writes[0].body as PermissionMatrix).site_hub.export).toBe(true);
  });
  it("blocks partial managers with unowned existing grants rather than erasing them", async () => {
    actor = { isAdmin: false, canManagePermissions: true, permissionManagerScope: "partial", permissions: emptyMatrix() };
    await openDialog();
    expect(screen.getByTestId("warning-unmanaged-grants")).toBeTruthy();
    expect((screen.getByTestId("button-save-perms") as HTMLButtonElement).disabled).toBe(true);
    expect(writes).toEqual([]);
  });
  it("detects observed server-matrix concurrency without resetting the draft", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }));
    const remote = emptyMatrix(); remote.site_hub.export = true; remote.stores_inventory.view = true;
    client.setQueryData(["/api/auth/users", 72, "permissions"], { matrix: remote, isAdmin: false, businessRole: null });
    await screen.findByText(/The loaded server matrix differs/);
    expect((screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("button-save-perms") as HTMLButtonElement).disabled).toBe(true);
    expect(writes).toEqual([]);
  });
  it("existing-user template selection and cancellation are inert; only explicit confirmation stages grants", async () => {
    await openDialog();
    fireEvent.keyDown(screen.getByTestId("select-role-template"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("template-viewer"));
    expect(screen.getByTestId("role-change-preview")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }) as HTMLInputElement).checked).toBe(false);
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByTestId("button-cancel-role"));
    expect(screen.queryByTestId("role-change-preview")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("select-role-template"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("template-viewer"));
    fireEvent.click(screen.getByTestId("button-confirm-role"));
    expect((screen.getByRole("checkbox", { name: "Site DPRs — File & View — View" }) as HTMLInputElement).checked).toBe(true);
    expect(writes).toEqual([]);
    expect((screen.getByTestId("button-save-perms") as HTMLButtonElement).disabled).toBe(true);
  });
  it("load failure keeps grants untouched and retry renders the workbench", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => new Response("fixture load failure", { status: 503 }));
    render(<QueryClientProvider client={client}><PermissionsDialog userId={72} users={[user]} onClose={vi.fn()} /></QueryClientProvider>);
    expect(screen.getAllByLabelText("Loading permissions").length).toBeGreaterThan(0);
    await screen.findByText("Permissions could not be loaded");
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByTestId("hierarchical-permissions-editor");
    expect(writes).toEqual([]);
  });
  it("creation role selection previews only; explicit Apply is required to proceed", async () => {
    render(<QueryClientProvider client={client}><CreateUserDialog open onClose={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(screen.getByTestId("input-new-fullname"), { target: { value: "Meera Iyer" } });
    fireEvent.change(screen.getByTestId("input-new-email"), { target: { value: "meera@example.invalid" } });
    fireEvent.change(screen.getByTestId("input-new-password"), { target: { value: "fixture-only-passphrase" } });
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-template-site_engineer").querySelector("input")!);
    expect((screen.getByTestId("button-wizard-next") as HTMLButtonElement).disabled).toBe(true);
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByTestId("button-apply-creation-role"));
    expect((screen.getByTestId("button-wizard-next") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    fireEvent.click(screen.getByTestId("wizard-sites-selected").querySelector("input")!);
    const site = await screen.findByTestId("wizard-site-5");
    fireEvent.click(site.querySelector('button[role="checkbox"]')!);
    fireEvent.click(screen.getByTestId("button-wizard-next"));
    await screen.findByTestId("hierarchical-permissions-editor");
    fireEvent.change(screen.getByRole("combobox", { name: "Allocate / update labour status proposed override" }), { target: { value: "deny" } });
    expect(writes).toEqual([]);
    fireEvent.click(screen.getByTestId("button-create-user-confirm"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ method: "POST", path: "/api/auth/users", body: { roleTemplate: "site_engineer", siteAccess: { mode: "selected", siteIds: [5] } } });
    expect(JSON.stringify(writes[0].body)).not.toContain("deny");
    expect(JSON.stringify(writes[0].body)).not.toContain("matrix");
  });
});
