// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreatePersonDialog } from "./CreatePersonDialog";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isOwner: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CreatePersonDialog open onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreatePersonDialog scrolling", () => {
  it("keeps the header and action footer outside the independently scrollable form body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/access-control/roles")) {
        return new Response(JSON.stringify({ roles: [{ id: 1, name: "Engineer", scopeDefault: "own", ticks: {} }] }));
      }
      if (url.includes("/api/sites")) {
        return new Response(JSON.stringify([{ id: 1, name: "North Site", isActive: 1 }]));
      }
      return new Response(JSON.stringify([]));
    }));
    renderDialog();

    const dialog = await screen.findByRole("dialog");
    const header = screen.getByTestId("create-person-dialog-header");
    const body = screen.getByTestId("create-person-scroll-area");
    const footer = screen.getByTestId("create-person-dialog-footer");

    expect(dialog.className).toContain("h-[90dvh]");
    expect(dialog.className).toContain("overflow-hidden");
    expect(header.className).toContain("shrink-0");
    expect(body.className).toContain("min-h-0");
    expect(body.className).toContain("flex-1");
    expect(body.className).toContain("overflow-y-auto");
    expect(footer.className).toContain("shrink-0");
    expect(body.contains(header)).toBe(false);
    expect(body.contains(footer)).toBe(false);
    expect(footer.contains(screen.getByRole("button", { name: "Cancel" }))).toBe(true);
    expect(footer.contains(screen.getByRole("button", { name: "Create person" }))).toBe(true);
  });
});
