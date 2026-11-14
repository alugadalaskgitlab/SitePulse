// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { apiRequestMock, queryClientMock, state } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  queryClientMock: { invalidateQueries: vi.fn(), fetchQuery: vi.fn() },
  state: { savedPayload: null as any },
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
    reachId: 11, reachLabel: "Reach 2", chainageFrom: 0.03, chainageTo: 0.06,
    scopeQuantity: 1200, scopeLengthM: 30, doneQuantity: 0, balanceQuantity: 20,
    rate: 500, isFixed: false, rowType: "working_reach",
  },
];

const items = [{
  id: 1, description: "WMM", layerConfig: { layerType: "granular", mixType: "WMM" },
  materials: [{ materialName: "WMM", uom: "MT", waterAddedPerPart: 0 }],
  fundPlannerRecipeSettings: { layerType: "granular", mixType: "WMM", wmmDensity: 2.2 },
}];

const response = (value: unknown) => ({ ok: true, status: 200, json: async () => value });

describe("Fund Planner component", () => {
  beforeEach(() => {
    state.savedPayload = null;
    apiRequestMock.mockReset();
    queryClientMock.invalidateQueries.mockReset();
    apiRequestMock.mockImplementation(async (method: string, url: string, payload: any) => {
      if (url.endsWith("/work-value")) return response({ totals: { billEstimateWithinBoq: 2500 }, rows, materialItems: items });
      if (url.endsWith("/fund-plans") && method === "GET") return response({ plans: [] });
      if (url.endsWith("/fund-plan-material-preview")) return response({
        materials: [{ materialName: "WMM", uom: "MT", totalQty: 66, byItem: [{ itemId: 1, quantity: 66 }] }],
      });
      if (url.endsWith("/fund-plans") && method === "POST") {
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
});
