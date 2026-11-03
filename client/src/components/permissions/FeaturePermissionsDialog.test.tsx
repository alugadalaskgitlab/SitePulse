// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeaturePermissionsDialog } from "./FeaturePermissionsDialog";

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

  it("contains a render failure inside the access window instead of replacing the page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ...access,
      roles: [{ ...access.roles[0], ticks: undefined }],
    }))));
    renderDialog();

    expect(await screen.findByText("Access window couldn’t be loaded")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("No changes were saved");
  });
});
