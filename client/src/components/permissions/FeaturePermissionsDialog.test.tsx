// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeaturePermissionsDialog } from "./FeaturePermissionsDialog";
import { canLegacySection, projectFeaturePermissions, type FeatureAccessState } from "@shared/featureAccess";
import { emptyMatrix } from "@shared/permissions";

const authState = vi.hoisted(() => ({ isOwner: true }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));

const access = {
  roleIds: [4],
  personalChanges: {},
  roles: [{
    id: 4,
    name: "Store In-charge",
    scopeDefault: "all",
    ticks: { requirement_allocation_material: { view: true } },
  }],
  rolesConfigured: true,
  licensedModules: ["estimating"],
  canUnlockRecords: false,
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <FeaturePermissionsDialog userId={5} fullName="Test User" onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  authState.isOwner = true;
});

describe("FeaturePermissionsDialog", () => {
  it("keeps an explicit Tests untick so an older legacy Add grant cannot return", async () => {
    let body: any;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") body = JSON.parse(String(init.body));
      return new Response(JSON.stringify(access));
    }));
    const { onSaved } = renderDialog();
    const add = await screen.findByTestId("feature-lab_tests-add");
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(body.personalChanges.lab_tests.add).toBe(false);
    const legacy = emptyMatrix();
    legacy.lab_tests.create = true;
    expect(canLegacySection({ isActive: true }, legacy, "lab_tests", "create", {
      rolesConfigured: true, personalChanges: body.personalChanges, legacyPermissions: legacy,
    })).toBe(false);
  });

  it("shows and saves the three site features and special ticks without changing other access", async () => {
    const writes: any[] = [];
    const data = { ...access, personalChanges: { dpr: { edit: false }, masters: { view: true } } };
    const before = structuredClone(data);
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(data));
    }));
    const { onSaved } = renderDialog();
    for (const feature of ["daily_work_log", "lab_tests", "level_sheets"]) {
      for (const action of ["view", "add", "edit"]) {
        const checkbox = await screen.findByTestId(`feature-${feature}-${action}`) as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
      }
    }
    expect(screen.getByLabelText("Daily work log See everyone's day")).toBeTruthy();
    expect(screen.getByLabelText("Level sheets Record department / consultant check")).toBeTruthy();
    expect(screen.getByLabelText("Tests Verify / approve")).toBeTruthy();
    expect(screen.getByLabelText("Level sheets Export / print")).toBeTruthy();
    expect(screen.queryByTestId("feature-level_sheets-cancel")).toBeNull();
    for (const tick of ["daily_work_log-view", "daily_work_log-add", "daily_work_log-view_reports",
      "lab_tests-view", "lab_tests-add", "lab_tests-cancel", "lab_tests-approve", "lab_tests-export",
      "level_sheets-view", "level_sheets-approve", "level_sheets-export"]) {
      fireEvent.click(screen.getByTestId(`feature-${tick}`));
    }
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      roleIds: [4], personalChanges: {
        ...before.personalChanges,
        daily_work_log: { view: true, add: true, view_reports: true },
        lab_tests: { view: true, add: true, cancel: true, approve: true, export: true },
        level_sheets: { view: true, approve: true, export: true },
      },
    });
    const actor = { isActive: true, isOwner: false, isAdmin: false };
    const state: FeatureAccessState = { rolesConfigured: true, userRoles: [4], roleTicks: { 4: access.roles[0].ticks }, personalChanges: writes[0].personalChanges };
    const matrix = projectFeaturePermissions(actor, emptyMatrix(), state);
    expect(canLegacySection(actor, matrix, "daily_work_log", "create", state)).toBe(true);
    expect(canLegacySection(actor, matrix, "daily_work_log", "view_reports", state)).toBe(true);
    expect(canLegacySection(actor, matrix, "lab_tests", "create", state)).toBe(true);
    expect(canLegacySection(actor, matrix, "level_sheets", "view", state)).toBe(true);
    expect(canLegacySection(actor, matrix, "level_sheets", "edit", state)).toBe(false);
    expect(canLegacySection(actor, matrix, "level_sheets", "approve", state)).toBe(true);
    expect(data).toEqual(before);
  });

  it("keeps the title and actions fixed around a scrollable feature list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(access))));
    renderDialog();
    await screen.findByTestId("feature-requirement_allocation_material-view");

    const scrollArea = screen.getByTestId("feature-access-scroll-area");
    expect(scrollArea.className).toContain("overflow-y-auto");
    expect(scrollArea.contains(screen.getByRole("button", { name: "Save access" }))).toBe(false);
    expect(screen.getByText("Allow this person to unlock records")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("refreshes the affected access and user list before reporting a successful save", async () => {
    const requests: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method;
      requests.push({ url, method });
      return new Response(JSON.stringify(access), { status: 200 });
    }));
    const { onClose, onSaved } = renderDialog();

    fireEvent.click(await screen.findByTestId("feature-requirement_allocation_material-allocate"));
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    expect(requests).toContainEqual({
      url: "/api/auth/users/5/feature-access",
      method: "PUT",
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("discards a person-level edit when Cancel is pressed", async () => {
    const requests: Array<{ url: string; method?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), method: init?.method });
      return new Response(JSON.stringify(access), { status: 200 });
    }));
    const { onClose, onSaved } = renderDialog();

    const allocate = await screen.findByTestId("feature-requirement_allocation_material-allocate");
    fireEvent.click(allocate);
    expect((allocate as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(requests.some(request => request.method === "PUT")).toBe(false);
  });

  it("shows a save failure inside the dialog and leaves it open", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({ message: "Permission change failed" }), { status: 403 });
      }
      return new Response(JSON.stringify(access), { status: 200 });
    }));
    const { onClose, onSaved } = renderDialog();

    await screen.findByTestId("feature-requirement_allocation_material-view");
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Permission change failed")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders older roles with missing feature ticks without crashing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ...access,
      roles: [{ ...access.roles[0], ticks: undefined }],
    }))));
    renderDialog();

    expect(await screen.findByTestId("feature-requirement_allocation_material-view")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
