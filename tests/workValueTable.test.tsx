// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { WorkValueTable } from "../client/src/components/WorkValueTable";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WorkValueTable", () => {
  it("shows working-reach shares, keeps incidental and rework quantities valueless, and flags unchanged bars", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      projectId: 2,
      projectName: "ALLADURG",
      siteName: "ALLADURG",
      scopeBasis: "Confirmed working reaches; programme bars do not determine BOQ shares.",
      rows: [
        {
          boqItemId: 4, itemCode: "SH", description: "Earthen shoulders", unit: "CUM",
          reachId: 1, reachLabel: "Reach 1", chainageFrom: 0, chainageTo: 1.6,
          scopeQuantity: 600, doneQuantity: 100, incidentalQuantity: 20, reworkQuantity: 30,
          balanceQuantity: 500, overQuantity: 0, rate: 1000,
          valueDone: 100000, valueBalance: 500000, overValue: 0, rowType: "working_reach",
        },
        {
          boqItemId: 4, itemCode: "SH", description: "Earthen shoulders", unit: "CUM",
          reachId: null, reachLabel: "BOQ not needed (no-scope portion)", chainageFrom: null, chainageTo: null,
          scopeQuantity: 100, doneQuantity: 0, incidentalQuantity: 0, reworkQuantity: 0,
          balanceQuantity: 100, overQuantity: 0, rate: 1000,
          valueDone: 0, valueBalance: 100000, overValue: 0, rowType: "no_scope",
        },
      ],
      reachTotals: [{
        reachId: 1, reachLabel: "Reach 1", chainageFrom: 0, chainageTo: 1.6,
        scopeQuantity: 600, doneQuantity: 100, balanceQuantity: 500, overQuantity: 0,
        valueDone: 100000, valueBalance: 500000, overValue: 0, incompleteValueRows: 0,
      }],
      totals: {
        billEstimateWithinBoq: 100000, overBoqValue: 0, valueBalance: 500000,
        boqNotNeededValue: 100000, incompleteValueRows: 0,
      },
      unassignedDone: [],
      barsBeyondCorridor: [{
        barId: 98, itemCode: "SH", description: "Earthen shoulders", label: "Reach 3",
        chainageFrom: 1.9, chainageTo: 3.2, corridorEnd: 2.9,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <WorkValueTable projectId={2} />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("work-value-report")).toBeInTheDocument();
    expect(screen.getByText("Incidental · no value")).toBeInTheDocument();
    expect(screen.getByText("Rework · no value")).toBeInTheDocument();
    expect(within(screen.getByTestId("work-value-reach-totals")).getByText(/Reach 1/))
      .toHaveTextContent("Ch 0+000–1+600");
    expect(screen.getAllByText("100 CUM")).toHaveLength(3);
    expect(screen.getByText("20 CUM")).toBeInTheDocument();
    expect(screen.getByText("30 CUM")).toBeInTheDocument();
    expect(screen.getAllByText("₹1,00,000.00")).toHaveLength(4);
    expect(screen.getByTestId("bars-beyond-corridor")).toHaveTextContent("3+200");
    expect(screen.getByTestId("work-value-reach-totals")).toHaveTextContent("Totals by reach");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/boq/projects/2/work-value", { credentials: "include" });
    });
  });
});
