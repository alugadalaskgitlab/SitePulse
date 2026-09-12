// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { EquipmentIdentificationSection } from "@/pages/Plant";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    isAdmin: true,
    isOwner: false,
    sectionCan: () => true,
    sectionVisible: () => true,
  }),
}));

const pendingRow = {
  logId: 19,
  date: "2026-01-10",
  machine: "NEW ROAD ROLLER",
  project: "Road Project",
  site: "Site A",
  usageValue: 4,
  source: "dpr_log",
  dprId: 244,
  suggestions: [{ equipmentId: 5, name: "ROLLER 5", registrationNumber: "R-5", match: "substring" }],
};

function report(reviewRows: any[] = [pendingRow], events: any[] = []) {
  return {
    filterOptions: {
      projects: [],
      ownership: [],
      equipmentTypes: [],
      equipment: [
        { id: 5, name: "ROLLER 5", registrationNumber: "R-5" },
        { id: 6, name: "ROLLER 6", registrationNumber: "R-6" },
      ],
      scopes: [],
    },
    totals: {},
    reviewRows,
    events,
    fleet: [],
    projects: [],
  };
}

beforeEach(() => {
  queryClient.clear();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
  window.history.replaceState({}, "", "/masters/section/equipment");
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("Equipment identification dialog orchestration", () => {
  it("links an existing record through the confirm API and removes the pending row", async () => {
    let linked = false;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === "/api/reports/equipment-performance" && !init?.method) {
        return new Response(JSON.stringify(report(linked ? [] : [pendingRow])), { status: 200 });
      }
      if (url === "/api/reports/equipment-performance/logs/19/confirm" && init?.method === "POST") {
        linked = true;
        return new Response(JSON.stringify({ id: 19, equipmentId: 5 }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<QueryClientProvider client={queryClient}><EquipmentIdentificationSection /></QueryClientProvider>);
    expect(await screen.findByTestId("identification-row-19")).toBeTruthy();
    fireEvent.click(screen.getByTestId("link-existing-19"));

    await waitFor(() => expect(screen.queryByTestId("identification-row-19")).toBeNull());
    const confirm = requests.find(request => request.url.endsWith("/logs/19/confirm"));
    expect(JSON.parse(String(confirm?.init?.body))).toEqual({ equipmentId: 5 });
    expect(requests.filter(request => request.url === "/api/plant-module/equipment" && request.init?.method === "POST")).toHaveLength(0);
  });

  it("creates once, exposes partial failure, and retries only confirmation with the created id", async () => {
    let confirmAttempts = 0;
    let linked = false;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url === "/api/reports/equipment-performance" && !init?.method) {
        return new Response(JSON.stringify(report(linked ? [] : [pendingRow])), { status: 200 });
      }
      if (url === "/api/plant-module/plant-settings") return new Response("[]", { status: 200 });
      if (url === "/api/plant-module/equipment" && init?.method === "POST") {
        return new Response(JSON.stringify({ id: 73, ...JSON.parse(String(init.body)) }), { status: 201 });
      }
      if (url === "/api/reports/equipment-performance/logs/19/confirm" && init?.method === "POST") {
        confirmAttempts += 1;
        if (confirmAttempts === 1) return new Response(JSON.stringify({ message: "temporary failure" }), { status: 500 });
        linked = true;
        return new Response(JSON.stringify({ id: 19, equipmentId: 73 }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<QueryClientProvider client={queryClient}><EquipmentIdentificationSection /></QueryClientProvider>);
    await screen.findByTestId("identification-row-19");
    fireEvent.click(screen.getByTestId("add-new-19"));
    expect((await screen.findByTestId("input-equipment-name") as HTMLInputElement).value).toBe("NEW ROAD ROLLER");
    fireEvent.change(screen.getByTestId("select-equipment-type"), { target: { value: "Tractor" } });
    fireEvent.click(screen.getByTestId("button-save-equipment"));

    expect(await screen.findByTestId("partial-link-error")).toBeTruthy();
    expect(requests.filter(request => request.url === "/api/plant-module/equipment" && request.init?.method === "POST")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("retry-created-equipment-link"));

    await waitFor(() => expect(screen.queryByTestId("identification-row-19")).toBeNull());
    const creates = requests.filter(request => request.url === "/api/plant-module/equipment" && request.init?.method === "POST");
    const confirms = requests.filter(request => request.url.endsWith("/logs/19/confirm"));
    expect(creates).toHaveLength(1);
    expect(confirms).toHaveLength(2);
    expect(confirms.map(request => JSON.parse(String(request.init?.body)))).toEqual([
      { equipmentId: 73 },
      { equipmentId: 73 },
    ]);
  });

  it("does not render a historical correction card when there are no pending rows", async () => {
    const prior = {
      key: "dpr_log:20",
      date: "2026-01-09",
      machine: "ROLLER 5",
      project: "Road Project",
      site: "Site A",
      source: "dpr_log",
      confidence: "confirmed_legacy_match",
      equipmentId: 5,
      reference: { equipmentLogId: 20, dprId: 243, plantUsageId: null },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/reports/equipment-performance") {
        return new Response(JSON.stringify(report([], [prior])), { status: 200 });
      }
      throw new Error(`Unexpected request: ${String(input)}`);
    }));

    render(<QueryClientProvider client={queryClient}><EquipmentIdentificationSection /></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByTestId("previously-identified-equipment-corrections")).toBeNull());
    expect(screen.queryByTestId("equipment-needing-identification")).toBeNull();
    expect(screen.queryByText("ROLLER 5")).toBeNull();
  });
});