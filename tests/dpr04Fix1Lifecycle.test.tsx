// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDprBoqItems } from "../client/src/hooks/use-dpr-boq-items";

const sites = [{ id: 7, name: "Lifecycle site" }];

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: React.PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DPR-04 BOQ lifecycle", () => {
  it("does not persist a null project while the project request failed", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useDprBoqItems({ siteName: "Lifecycle site", sites }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(result.current.projectsLoaded).toBe(false);
    expect(result.current.projectId).toBeNull();
  });

  it("resolves and reports loaded only after a successful project response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/items")) return new Response("[]");
      return new Response(JSON.stringify([
        { id: 41, name: "First", status: "active", barCount: 0 },
        { id: 23, name: "Programme", status: "active", barCount: 8 },
      ]), { headers: { "Content-Type": "application/json" } });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useDprBoqItems({ siteName: "Lifecycle site", sites }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.projectId).toBe(23));
    expect(result.current.projectsLoaded).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});