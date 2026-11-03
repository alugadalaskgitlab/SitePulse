// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeaturePermissionsDialog } from "./FeaturePermissionsDialog";

const authState = vi.hoisted(() => ({ isOwner: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));

const accessData = {
  roleIds: [7],
  personalChanges: {},
  roles: [{
    id: 7,
    name: "Site Engineer",
    scopeDefault: "own",
    ticks: { site_requirements: { view: true } },
  }],
  rolesConfigured: true,
  canUnlockRecords: false,
};

describe("feature permission grid", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows role access normally and saves highlighted personal changes without changing role assignment", async () => {
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/users/41/feature-access") && init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/api/auth/users/41/feature-access")) {
        return new Response(JSON.stringify(accessData));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FeaturePermissionsDialog userId={41} fullName="Kavita Rao" onClose={vi.fn()} onSaved={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Site Engineer")).toBeTruthy();
    const view = await screen.findByTestId("feature-site_requirements-view") as HTMLInputElement;
    expect(view.checked).toBe(true);
    fireEvent.click(view);
    expect(view.checked).toBe(false);
    expect(view.closest("label")?.getAttribute("data-personal-change")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      roleIds: [7],
      personalChanges: { site_requirements: { view: false } },
    });
  });

  it("resets personal changes back to the selected role", async () => {
    const writes: Record<string, unknown>[] = [];
    const data = {
      ...accessData,
      personalChanges: { site_requirements: { view: false } },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/users/41/feature-access") && init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/api/auth/users/41/feature-access")) {
        return new Response(JSON.stringify(data));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FeaturePermissionsDialog userId={41} fullName="Kavita Rao" onClose={vi.fn()} onSaved={vi.fn()} />
      </QueryClientProvider>,
    );

    const view = await screen.findByTestId("feature-site_requirements-view") as HTMLInputElement;
    expect(view.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Reset to role" }));
    expect(view.checked).toBe(true);
    expect(view.closest("label")?.getAttribute("data-personal-change")).not.toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({ roleIds: [7], personalChanges: {} });
  });

  it("lets a person tick Estimating and Cancel closes without saving the draft", async () => {
    const onClose = vi.fn();
    const writes: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/users/41/feature-access") && init?.method === "PUT") {
        writes.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.endsWith("/api/auth/users/41/feature-access")) {
        return new Response(JSON.stringify(accessData));
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FeaturePermissionsDialog userId={41} fullName="Kavita Rao" onClose={onClose} onSaved={vi.fn()} />
      </QueryClientProvider>,
    );

    const estimating = await screen.findByTestId("feature-estimating-view") as HTMLInputElement;
    expect(estimating.disabled).toBe(false);
    expect(estimating.checked).toBe(false);
    fireEvent.click(estimating);
    expect(estimating.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(writes).toHaveLength(0);
  });
});
