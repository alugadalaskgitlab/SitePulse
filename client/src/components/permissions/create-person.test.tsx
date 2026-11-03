// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreatePersonDialog } from "./CreatePersonDialog";

const authState = vi.hoisted(() => ({ isOwner: false }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authState }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

describe("add person form", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    toast.mockClear();
  });

  it("creates a person with role, site, reporting scope and contact details", async () => {
    const created: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/access-control/roles")) {
        return new Response(JSON.stringify({ roles: [{
          id: 7,
          name: "Site Engineer",
          scopeDefault: "team",
          ticks: { site_requirements: { view: true } },
        }] }));
      }
      if (url.endsWith("/api/sites")) {
        return new Response(JSON.stringify([{ id: 12, name: "North Plant", isActive: 1 }]));
      }
      if (url.endsWith("/api/auth/users") && init?.method === "POST") {
        created.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ id: 42 }));
      }
      if (url.endsWith("/api/auth/users")) return new Response(JSON.stringify([]));
      throw new Error(`Unexpected request: ${url}`);
    }));

    const onClose = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CreatePersonDialog open onClose={onClose} />
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByTestId("input-person-name"), { target: { value: "Ravi Kumar" } });
    fireEvent.change(screen.getByTestId("input-person-email"), { target: { value: "ravi@example.invalid" } });
    fireEvent.change(screen.getByTestId("input-person-password"), { target: { value: "password-123" } });
    fireEvent.click(await screen.findByTestId("checkbox-person-role-7"));
    fireEvent.click(await screen.findByTestId("checkbox-person-site-12"));
    fireEvent.click(screen.getByRole("button", { name: "Create person" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      fullName: "Ravi Kumar",
      email: "ravi@example.invalid",
      password: "password-123",
      roleIds: [7],
      entryScope: "team",
      siteAccess: { mode: "selected", siteIds: [12] },
    });
  });
});
