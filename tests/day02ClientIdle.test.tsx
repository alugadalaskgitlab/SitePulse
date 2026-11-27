// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { emptyMatrix } from "@shared/permissions";

function Probe() { const { user } = useAuth(); return <p>{user ? "Signed in" : "Signed out"}</p>; }
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each([["strict", 5], ["strict_30", 30], ["strict_60", 60], ["sticky", null]] as const)(
  "%s pings only after its idle limit", async (sessionPolicy, limit) => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["/api/auth/me"], {
      user: { id: 41, isActive: true, sessionPolicy },
      permissions: emptyMatrix(),
    });
    render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
    expect(screen.getByText("Signed in")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(((limit ?? 60) - 1) * 60_000); });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); });
    if (limit === null) expect(fetcher).not.toHaveBeenCalled();
    else {
      expect(fetcher).toHaveBeenCalled();
      expect(screen.getByText("Signed out")).toBeTruthy();
    }
    client.clear();
  },
);
