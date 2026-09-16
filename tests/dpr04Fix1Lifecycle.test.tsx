// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDprBoqItems } from "../client/src/hooks/use-dpr-boq-items";

const sites = [{ id: 7, name: "Lifecycle site" }];

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: React.PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function RestoredGuidedPayloadHarness() {
  const preference = { resolved: true, projectId: 23 };
  const { projectId, projectsError } = useDprBoqItems({
    siteName: "Lifecycle site",
    sites,
    preferredProjectId: preference.projectId,
  });
  const [savedProjectId, setSavedProjectId] = React.useState<number | null | undefined>(undefined);
  const payloadProjectId = projectId != null
    ? projectId
    : (preference.resolved ? null : undefined);
  return (
    <>
      <span data-testid="restored-projects-error">{projectsError ? "error" : "loading"}</span>
      <span data-testid="restored-save-value">
        {savedProjectId === undefined ? "undefined" : String(savedProjectId)}
      </span>
      <button type="button" onClick={() => setSavedProjectId(payloadProjectId)}>Save</button>
    </>
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

  it("preserves a positive preferred project through project loading and 503", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useDprBoqItems({ siteName: "Lifecycle site", sites, preferredProjectId: 23 }),
      { wrapper: wrapperFor(queryClient) },
    );

    expect(result.current.projectId).toBe(23);
    await waitFor(() => expect(result.current.projectsError).not.toBeNull());
    expect(result.current.projectId).toBe(23);
    expect(result.current.items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders a restored local positive preference into the Save payload on projects 503", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RestoredGuidedPayloadHarness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("restored-projects-error").textContent).toBe("error"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("restored-save-value").textContent).toBe("23");
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

  it("keeps an item request failure visible and retries the same project", async () => {
    let itemAttempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/items")) {
        itemAttempts += 1;
        return itemAttempts === 1
          ? new Response("unavailable", { status: 503 })
          : new Response(JSON.stringify([{ id: 77, description: "Recovered item" }]), {
              headers: { "Content-Type": "application/json" },
            });
      }
      return new Response(JSON.stringify([{ id: 41, name: "First", status: "active", barCount: 0 }]), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useDprBoqItems({ siteName: " lifecycle   SITE ", sites }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.itemsError).not.toBeNull());
    expect(result.current.items).toEqual([]);
    expect(result.current.itemsLoaded).toBe(false);
    await result.current.retry();
    await waitFor(() => expect(result.current.items).toEqual([{ id: 77, description: "Recovered item" }]));
    expect(itemAttempts).toBe(2);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("siteId=7"))).toBe(true);
  });

  it("keeps a pinned project and its item value when projects refetch in a new order", async () => {
    let projectAttempts = 0;
    let itemAttempts = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/items")) {
        itemAttempts += 1;
        return new Response(JSON.stringify([{ id: 77, description: "Pinned item" }]), {
          headers: { "Content-Type": "application/json" },
        });
      }
      projectAttempts += 1;
      const projects = projectAttempts === 1
        ? [{ id: 23, name: "Pinned", status: "active", barCount: 8 }, { id: 41, name: "Other", status: "active", barCount: 0 }]
        : [{ id: 41, name: "Other", status: "active", barCount: 0 }, { id: 23, name: "Pinned", status: "active", barCount: 8 }];
      return new Response(JSON.stringify(projects), {
        headers: { "Content-Type": "application/json" },
      });
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useDprBoqItems({ siteName: "Lifecycle site", sites, preferredProjectId: 23 }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.projectId).toBe(23);
      expect(result.current.items).toEqual([{ id: 77, description: "Pinned item" }]);
    });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/boq/projects", 7], exact: true });
    });
    await waitFor(() => expect(result.current.projectId).toBe(23));
    expect(result.current.items).toEqual([{ id: 77, description: "Pinned item" }]);
    expect(itemAttempts).toBe(1);
    expect(projectAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("does not replace an explicit saved null with the site's automatic fallback", async () => {
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
      () => useDprBoqItems({
        siteName: "Lifecycle site",
        sites,
        preferredProjectId: null,
      }),
      { wrapper: wrapperFor(queryClient) },
    );

    await waitFor(() => expect(result.current.projectsLoaded).toBe(true));
    expect(result.current.projectId).toBeNull();
    expect(result.current.items).toEqual([]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/items"))).toBe(false);
  });
});
