// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiRequestMock, queryClientMock, state } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  queryClientMock: { invalidateQueries: vi.fn(), fetchQuery: vi.fn() },
  state: { savedPayload: null as any, rows: [] as any[], items: [] as any[], plans: [] as any[], billValue: 2500 },
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: apiRequestMock,
  queryClient: queryClientMock,
}));

import FundPlanner from "@/components/FundPlanner";

const rows = [
  {
    boqItemId: 1, itemCode: "1.1", description: "WMM", unit: "Cum",
    reachId: 10, reachLabel: "Reach 1", chainageFrom: 0, chainageTo: 0.03,
    scopeQuantity: 1000, scopeLengthM: 30, doneQuantity: 0, balanceQuantity: 10,
    rate: 500, isFixed: false, rowType: "working_reach",
  },
  {
    boqItemId: 1, itemCode: "1.1", description: "WMM", unit: "Cum",
    reachId: 11, reachLabel: "Reach 3", chainageFrom: 0.03, chainageTo: 0.06,
    scopeQuantity: 1200, scopeLengthM: 30, doneQuantity: 0, balanceQuantity: 20,
    rate: 500, isFixed: false, rowType: "working_reach",
  },
];

const items = [{
  id: 1, description: "WMM", categoryName: "Road Works", workCategory: "Road Works",
  planningWorkType: "road", layerConfig: { layerType: "granular", mixType: "WMM" },
  materials: [{ materialName: "WMM", uom: "MT", waterAddedPerPart: 0 }],
  fundPlannerRecipeSettings: {
    layerType: "granular", mixType: "WMM", wmmDensity: 2.2, compactedDensity: 2.2,
    bitumenPercent: 4.5, dryerLdoPerMt: 5, soilLooseFactor: 1.2,
    sprayRateKgPerSqm: 0.2, waterAddedPerPart: 0,
  },
}];

const response = (value: unknown) => ({ ok: true, status: 200, json: async () => value });

describe("Fund Planner component", () => {
  beforeEach(() => {
    state.savedPayload = null;
    state.rows = rows;
    state.items = items;
    state.plans = [];
    state.billValue = 2500;
    apiRequestMock.mockReset();
    queryClientMock.invalidateQueries.mockReset();
    apiRequestMock.mockImplementation(async (method: string, url: string, payload: any) => {
      if (url.endsWith("/work-value")) return response({ totals: { billEstimateWithinBoq: state.billValue }, rows: state.rows, materialItems: state.items });
      if (url.endsWith("/fund-plans") && method === "GET") return response({ plans: state.plans });
      if (url.endsWith("/fund-plan-material-preview")) return response({
        materials: [{ materialName: "WMM", uom: "MT", totalQty: 66, byItem: [{ itemId: 1, quantity: 66 }] }],
      });
      if (url.includes("/fund-plans") && (method === "POST" || method === "PUT")) {
        state.savedPayload = payload;
        return response({ id: 92, name: payload.name, data: payload.data, updatedAt: new Date().toISOString() });
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    });
  });

  afterEach(() => cleanup());

  it("keeps the same BOQ item independent on separate working reaches and saves both inputs", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><FundPlanner projectId={2} canSave /></QueryClientProvider>);

    await screen.findByTestId("fund-planner");
    expect(screen.getAllByText("Enter prices").length).toBeGreaterThan(0);
    const firstRow = await screen.findByTestId("fund-work-row-1|reach-10");
    const secondRow = screen.getByTestId("fund-work-row-1|reach-11");
    const firstQuantity = within(firstRow).getByLabelText("Planned quantity for WMM") as HTMLInputElement;
    const secondQuantity = within(secondRow).getByLabelText("Planned quantity for WMM") as HTMLInputElement;
    expect(firstQuantity.value).toBe("10");
    expect(secondQuantity.value).toBe("20");

    fireEvent.change(firstQuantity, { target: { value: "4" } });
    expect(firstQuantity.value).toBe("4");
    expect(secondQuantity.value).toBe("20");

    fireEvent.click(screen.getByTestId("button-save-fund-plan"));
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Reach split" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(state.savedPayload).not.toBeNull());

    expect(state.savedPayload.data.works["1|reach-10"].quantity).toBe("4");
    expect(state.savedPayload.data.works["1|reach-11"].quantity).toBe("20");
    expect(state.savedPayload.name).toBe("Reach split");
  });

  it("shows per-reach group controls and subtotals that add to the grand total", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><FundPlanner projectId={2} canSave /></QueryClientProvider>);

    await screen.findByTestId("fund-planner");
    expect(screen.getByTestId("button-select-reach-10-base")).toBeTruthy();
    expect(screen.getByTestId("button-select-reach-11-base")).toBeTruthy();
    expect(screen.getByTestId("fund-reach-subtotal-reach-10").textContent).toContain("Bill ₹5,000");
    expect(screen.getByTestId("fund-reach-subtotal-reach-11").textContent).toContain("Bill ₹10,000");
    expect(screen.getByTestId("fund-work-total").textContent).toContain("Bill ₹15,000");

    const firstRow = screen.getByTestId("fund-work-row-1|reach-10");
    fireEvent.click(screen.getByTestId("button-select-reach-10-none"));
    expect((within(firstRow).getByLabelText("Include WMM") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("button-select-reach-10-base"));
    expect((within(firstRow).getByLabelText("Include WMM") as HTMLInputElement).checked).toBe(true);
    expect((within(screen.getByTestId("fund-work-row-1|reach-11")).getByLabelText("Include WMM") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId("button-select-reach-10-base"));
    expect((within(firstRow).getByLabelText("Include WMM") as HTMLInputElement).checked).toBe(false);
    expect((within(screen.getByTestId("fund-work-row-1|reach-11")).getByLabelText("Include WMM") as HTMLInputElement).checked).toBe(true);
  });

  it("jumps to blocks and hides group buttons that have no matching work", async () => {
    state.rows = [
      ...rows,
      { ...rows[1], boqItemId: 23, itemCode: "4.1", description: "Culvert PCC", balanceQuantity: 1, rate: 1000 },
      { ...rows[0], boqItemId: 29, itemCode: "9.1", description: "Road sign board", balanceQuantity: 1, rate: 500 },
    ];
    state.items = [
      ...items,
      { id: 23, description: "Culvert PCC", categoryName: "CD Works", workCategory: "structure", planningWorkType: "structure", layerConfig: { layerType: "concrete" }, materials: [] },
      { id: 29, description: "Road sign board", categoryName: "Road Furniture", workCategory: "Road Furniture", layerConfig: {}, materials: [] },
    ];
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><FundPlanner projectId={2} canSave /></QueryClientProvider>);
    await screen.findByTestId("fund-planner");

    expect(screen.getByTestId("button-select-reach-10-furniture")).toBeTruthy();
    expect(screen.queryByTestId("button-select-reach-10-structures")).toBeNull();
    expect(screen.getByTestId("button-select-reach-11-structures")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-jump-structures"));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    fireEvent.click(screen.getByTestId("button-jump-furniture"));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("keeps focus and scroll stable while typing in planner and recipe inputs", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 321 });
    render(<QueryClientProvider client={queryClient}><FundPlanner projectId={2} canSave /></QueryClientProvider>);
    await screen.findByTestId("fund-planner");

    const typeAndKeepFocus = (input: HTMLElement, value: string) => {
      input.focus();
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value } });
      expect(document.activeElement).toBe(input);
      expect(window.scrollY).toBe(321);
    };
    const first = <T extends HTMLElement>(label: string) => screen.getAllByLabelText(label)[0] as T;
    [
      ["Stretch start (km)", "0.4"],
      ["Stretch end (km)", "1.4"],
      ["Leave-out (m)", "10"],
      ["Length for WMM", "12"],
      ["Planned quantity for WMM", "18"],
      ["Other cost per unit for WMM", "2"],
    ].forEach(([label, value]) => typeAndKeepFocus(first(label), value));

    typeAndKeepFocus(await screen.findByLabelText("Supplier A name for WMM"), "Supplier One");
    typeAndKeepFocus(screen.getByLabelText("Supplier A price for WMM"), "1250");
    typeAndKeepFocus(screen.getByLabelText("Supplier B name for WMM"), "Supplier Two");
    typeAndKeepFocus(screen.getByLabelText("Supplier B price for WMM"), "1300");

    fireEvent.click(screen.getByText("Plan-only recipe overrides"));
    for (const field of [
      "Compacted density", "Bitumen percent", "Dryer LDO / MT", "WMM density",
      "Soil loose factor", "Spray rate kg / sqm", "Water added / part",
    ]) {
      const input = await screen.findByLabelText(new RegExp(`${field} override for`));
      typeAndKeepFocus(input, "3.5");
    }

    fireEvent.click(screen.getByTestId("button-save-fund-plan"));
    typeAndKeepFocus(screen.getByLabelText("Plan name"), "Test plan 2");
    expect(screen.queryByTestId("input-already-done")).toBeNull();
    expect(screen.getByText("from Work value")).toBeTruthy();
  });

  it("shows current Work value instead of the saved snapshot and saves the current figure", async () => {
    state.plans = [{
      id: 92, name: "Old snapshot", data: { alreadyDone: "1000", works: {} }, updatedAt: "2026-11-01T00:00:00Z",
    }];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><FundPlanner projectId={2} canSave /></QueryClientProvider>);
    await screen.findByTestId("fund-planner");
    fireEvent.change(screen.getByLabelText("Select saved fund plan"), { target: { value: "92" } });
    await waitFor(() => expect(screen.getByTestId("fund-already-done").textContent).toContain("₹2,500"));
    expect(screen.getByTestId("fund-already-done").textContent).toContain("from Work value");
    expect(screen.getByTestId("fund-already-done").textContent).toContain("Saved with plan: ₹1,000");
    expect(screen.queryByTestId("input-already-done")).toBeNull();
    fireEvent.click(screen.getByTestId("button-save-fund-plan"));
    await waitFor(() => expect(state.savedPayload).not.toBeNull());
    expect(state.savedPayload.data.alreadyDone).toBe("2500");
  });
});
