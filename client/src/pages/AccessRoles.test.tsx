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

  it("keeps Estimating Owner-only and inactive actions disabled in role editing", async () => {
    let saved: any;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles/7") && init?.method === "PATCH") {
        saved = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ ok: true, role: { ...role, ...saved } }));
      }
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
    const estimating = await screen.findByTestId("role-tick-estimating-view") as HTMLInputElement;
    const inactive = screen.getByTestId("role-tick-ra_bills-view") as HTMLInputElement;
    expect(estimating.disabled).toBe(true);
    expect(inactive.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("role-tick-dpr-add"));
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(saved).toBeTruthy());
    expect(saved.ticks.dpr.add).toBe(true);
    expect(saved.ticks.estimating).toBeUndefined();
  });
});
