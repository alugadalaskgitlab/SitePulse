// @vitest-environment jsdom
/**
 * Geometry Batch 01A — project-switch hydration regression.
 *
 * The geometry form keeps raw string state and hydrates once from the saved
 * profile. Hydration must be PROJECT-SCOPED: navigating from project A to
 * project B while the page component stays mounted must re-hydrate with B's
 * profile — never display A's values or Save them against B's id.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RoadGeometry from "../client/src/pages/RoadGeometry";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const projects: Record<string, any> = {
  "1": { id: 1, name: "Project A", chainageFrom: 100, chainageTo: 103.8, corridorConfirmed: 1 },
  "2": { id: 2, name: "Project B", chainageFrom: 50, chainageTo: 52, corridorConfirmed: 1 },
};
const profiles: Record<string, any> = {
  "1": { id: 11, boqProjectId: 1, enabled: 1, formationWidthM: 12, carriagewayWidthM: 7.25, pavedShoulderLhsM: 1.5, pavedShoulderRhsM: 1.5, softShoulderLhsM: null, softShoulderRhsM: null, layers: [{ layerType: "wmm", enabled: true, thicknessMm: 250, overrideWidthM: 8.75 }] },
  "2": { id: 22, boqProjectId: 2, enabled: 0, formationWidthM: 9.375, carriagewayWidthM: 9, pavedShoulderLhsM: null, pavedShoulderRhsM: null, softShoulderLhsM: null, softShoulderRhsM: null, layers: [] },
};

let fetchCalls: { url: string; method: string; body?: any }[] = [];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    fetchCalls.push({ url: u, method, body: init?.body ? JSON.parse(init.body) : undefined });
    let payload: any = [];
    const m = u.match(/\/api\/boq\/projects\/(\d+)(\/road-geometry)?(\/items)?/);
    if (m && m[2]) payload = profiles[m[1]] ?? null;
    else if (m && m[3]) payload = [];
    else if (m) payload = projects[m[1]] ?? null;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// wouter's useParams needs a matched <Route>, so render the page inside one.
import { Route } from "wouter";
function renderPage(path: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const r = await fetch(queryKey.join("/") as string, { credentials: "include" });
          return r.json();
        },
      },
    },
  });
  const { hook, navigate } = memoryLocation({ path });
  const utils = render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <Route path="/work-program/:id/geometry" component={RoadGeometry} />
      </Router>
    </QueryClientProvider>,
  );
  return { ...utils, navigate };
}

describe("01A — project-switch hydration", () => {
  it("re-hydrates form state when navigating from project A to project B", async () => {
    const { navigate } = renderPage("/work-program/1/geometry");

    // A hydrates
    await waitFor(() => {
      expect((screen.getByTestId("input-width-cw") as HTMLInputElement).value).toBe("7.25");
    });
    expect((screen.getByTestId("input-width-formation") as HTMLInputElement).value).toBe("12");

    // navigate to B without unmount
    navigate("/work-program/2/geometry");
    await waitFor(() => {
      expect((screen.getByTestId("input-width-cw") as HTMLInputElement).value).toBe("9");
    });
    expect((screen.getByTestId("input-width-formation") as HTMLInputElement).value).toBe("9.375");

    // Save on B must PUT B's values to B's id — never A's carried-over state
    fireEvent.click(screen.getByTestId("button-save-geometry"));
    await waitFor(() => {
      const put = fetchCalls.find(c => c.method === "PUT");
      expect(put).toBeTruthy();
      expect(put!.url).toContain("/api/boq/projects/2/road-geometry");
      expect(put!.body.carriagewayWidthM).toBe(9);
      expect(put!.body.formationWidthM).toBe(9.375);
    });
  });

  it("decimal input regression: typing '8.' keeps the dot (raw string state)", async () => {
    renderPage("/work-program/1/geometry");
    await waitFor(() => {
      expect((screen.getByTestId("input-width-cw") as HTMLInputElement).value).toBe("7.25");
    });
    // thickness field for enabled WMM layer accepts intermediate decimals
    const th = screen.getByTestId("input-thickness-wmm") as HTMLInputElement;
    fireEvent.change(th, { target: { value: "8." } });
    expect(th.value).toBe("8.");
    fireEvent.change(th, { target: { value: "8.75" } });
    expect(th.value).toBe("8.75");
  });
});
