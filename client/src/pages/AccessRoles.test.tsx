// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccessRoles from "./AccessRoles";

const authState = vi.hoisted(() => ({
  user: { id: 1, isOwner: true } as any,
  featureAccess: { licensedModules: ["estimating"] } as any,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));

const role = { id: 7, name: "Project Manager", scopeDefault: "all", sort: 1, ticks: { dpr: { view: true } } };
const secondRole = { id: 8, name: "Site Engineer", scopeDefault: "own", sort: 2, ticks: { site_requirements: { view: true } } };
const adminUser = {
  id: 2, fullName: "Admin Two", email: "admin@example.test", isActive: true,
  isAdmin: true, isOwner: false, businessRole: "Project Manager", suggestedRoleIds: [7],
  legacyTicks: { dpr: { view: true } }, canUnlockRecords: false, currentSiteScope: "All sites",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AccessRoles /></QueryClientProvider>);
}

describe("Settings roles page", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    authState.user = { id: 1, isOwner: true };
    authState.featureAccess = { licensedModules: ["estimating"] };
  });

  it("requires an explicit current-Admin confirmation during setup", async () => {
    let seeded = false;
    let configured = false;
    let setupBody: any;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles/seed") && init?.method === "POST") {
        seeded = true;
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/api/access-control/setup") && init?.method === "POST") {
        setupBody = JSON.parse(String(init.body));
        configured = true;
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/api/access-control/roles")) {
        return new Response(JSON.stringify({ roles: seeded ? [role] : [] }));
      }
      if (url.endsWith("/api/access-control/setup-preview")) {
        return new Response(JSON.stringify({
          roles: seeded ? [role] : [],
          rolesConfigured: configured,
          users: [adminUser],
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Load default roles" }));
    const adminConfirmation = await screen.findByLabelText("Confirm selected roles") as HTMLInputElement;
    expect(adminConfirmation.checked).toBe(false);
    expect(screen.getByText("Current site scope")).toBeTruthy();
    expect(screen.getByText("All sites")).toBeTruthy();

    fireEvent.click(adminConfirmation);
    fireEvent.click(screen.getByRole("button", { name: "Set up roles" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm setup" }));
    await waitFor(() => expect(setupBody).toBeTruthy());
    expect(setupBody.users).toEqual([
      expect.objectContaining({ userId: 2, roleIds: [7], isOwner: false, adminChoiceConfirmed: true }),
    ]);
  });

  it("discards role drafts on Cancel changes, confirms role switches, and keeps saved ticks unchanged", async () => {
    let saved: any;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles/7") && init?.method === "PATCH") {
        saved = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ ok: true, role: { ...role, ...saved } }));
      }
      if (url.endsWith("/api/access-control/roles")) {
        return new Response(JSON.stringify({ roles: [role, secondRole] }));
      }
      if (url.endsWith("/api/access-control/setup-preview")) {
        return new Response(JSON.stringify({ roles: [role, secondRole], rolesConfigured: true, users: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Project Manager" }));
    const estimating = await screen.findByTestId("role-tick-estimating-view") as HTMLInputElement;
    const inactive = screen.getByTestId("role-tick-ra_bills-view") as HTMLInputElement;
    expect(estimating.disabled).toBe(false);
    expect(estimating.checked).toBe(false);
    expect(inactive.disabled).toBe(true);

    fireEvent.click(estimating);
    fireEvent.click(screen.getByTestId("role-tick-dpr-add"));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Unsaved name" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect((screen.getByLabelText("Role name") as HTMLInputElement).value).toBe("Project Manager");
    expect((screen.getByTestId("role-tick-estimating-view") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("role-tick-dpr-add") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Cancel changes" })).toBeNull();
    expect(saved).toBeUndefined();

    fireEvent.click(screen.getByTestId("role-tick-dpr-add"));
    fireEvent.click(screen.getByRole("button", { name: "Site Engineer" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Discard unsaved changes to Project Manager?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByTestId("role-tick-dpr-add") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Site Engineer" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect((await screen.findByLabelText("Role name") as HTMLInputElement).value).toBe("Site Engineer");
    expect(saved).toBeUndefined();
  });

  it("shows new allocation and diesel requirement actions as unticked role controls", async () => {
    let saved: any;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles/7") && init?.method === "PATCH") {
        saved = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ ok: true, role: { ...role, ...saved } }));
      }
      if (url.endsWith("/api/access-control/roles")) return new Response(JSON.stringify({ roles: [role] }));
      if (url.endsWith("/api/access-control/setup-preview")) {
        return new Response(JSON.stringify({ roles: [role], rolesConfigured: true, users: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Project Manager" }));
    const materialAllocate = await screen.findByTestId("role-tick-requirement_allocation_material-allocate") as HTMLInputElement;
    const dieselVerify = screen.getByTestId("role-tick-diesel_requirement-verify") as HTMLInputElement;
    expect(materialAllocate.checked).toBe(false);
    expect(dieselVerify.checked).toBe(false);
    fireEvent.click(materialAllocate);
    fireEvent.click(dieselVerify);
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));

    await waitFor(() => expect(saved).toBeTruthy());
    expect(saved.ticks.requirement_allocation_material.allocate).toBe(true);
    expect(saved.ticks.diesel_requirement.verify).toBe(true);
  });

  it("asks before Back and discards the unsaved role draft when confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles")) {
        return new Response(JSON.stringify({ roles: [role] }));
      }
      if (url.endsWith("/api/access-control/setup-preview")) {
        return new Response(JSON.stringify({ roles: [role], rolesConfigured: true, users: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Project Manager" }));
    fireEvent.click(screen.getByTestId("role-tick-dpr-add"));
    fireEvent.click(screen.getByRole("link", { name: "← Back" }));
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Discard unsaved changes to Project Manager?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect((screen.getByTestId("role-tick-dpr-add") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "← Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/settings"));
  });

  it("shows suggested role ticks without applying them until the Owner confirms", async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    let applied = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });
      if (url.endsWith("/api/access-control/roles/apply-suggested-ticks") && method === "POST") {
        applied = true;
        return new Response(JSON.stringify({ ok: true, grantedCount: 1 }));
      }
      if (url.endsWith("/api/access-control/roles")) {
        return new Response(JSON.stringify({
          roles: [applied
            ? { ...role, ticks: { ...role.ticks, requirement_allocation_material: { view: true } } }
            : role],
        }));
      }
      if (url.endsWith("/api/access-control/setup-preview")) {
        return new Response(JSON.stringify({ roles: [role], rolesConfigured: true, users: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Apply suggested ticks for new rows" }));
    expect(await screen.findByText("Requirement allocation — material")).toBeTruthy();
    expect(requests.some(request => request.url.endsWith("/api/access-control/roles/apply-suggested-ticks"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirm and apply" }));
    await waitFor(() => expect(applied).toBe(true));
    const applyRequest = requests.find(request => request.url.endsWith("/api/access-control/roles/apply-suggested-ticks"));
    expect(applyRequest).toEqual({
      url: "/api/access-control/roles/apply-suggested-ticks",
      method: "POST",
      body: { confirm: true },
    });
  });

  it("hides the suggested-ticks action from non-Owners", async () => {
    authState.user = { id: 2, isOwner: false };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles")) return new Response(JSON.stringify({ roles: [role] }));
      if (url.endsWith("/api/access-control/setup-preview")) {
        return new Response(JSON.stringify({ roles: [role], rolesConfigured: true, users: [] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    renderPage();
    await screen.findByRole("button", { name: "Project Manager" });
    expect(screen.queryByRole("button", { name: "Apply suggested ticks for new rows" })).toBeNull();
  });
});
