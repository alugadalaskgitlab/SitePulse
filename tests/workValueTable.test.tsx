// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("groups reach and no-scope rows with subtotals while keeping exception details expandable", async () => {
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
        {
          boqItemId: 8, itemCode: "WMM", description: "Wet mix macadam", unit: "MT",
          reachId: 3, reachLabel: "Reach 3", chainageFrom: 1.9, chainageTo: 2.9,
          scopeQuantity: 50, doneQuantity: 5, incidentalQuantity: 0, reworkQuantity: 0,
          balanceQuantity: 45, overQuantity: 0, rate: 200,
          valueDone: 1000, valueBalance: 9000, overValue: 0, rowType: "working_reach",
        },
        {
          boqItemId: 12, itemCode: "FIX", description: "One-time setup", unit: "LS",
          reachId: null, reachLabel: "Whole road", chainageFrom: null, chainageTo: null,
          scopeQuantity: 60, doneQuantity: 6, incidentalQuantity: 0, reworkQuantity: 0,
          balanceQuantity: 54, overQuantity: 0, rate: 300,
          valueDone: 1800, valueBalance: 16200, overValue: 0, rowType: "working_reach",
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
    expect(screen.getByText("Scope amount")).toBeInTheDocument();
    expect(screen.getByText("Done amount")).toBeInTheDocument();
    expect(screen.getByText("Balance amount")).toBeInTheDocument();
    expect(within(screen.getByTestId("work-value-reach-totals")).getByText(/Reach 1/))
      .toHaveTextContent("Ch 0+000–1+600");
    expect(screen.getByTestId("work-value-row-reach-1-4")).toHaveTextContent("Earthen shoulders");
    expect(screen.getByTestId("work-value-subtotal-reach-1")).toHaveTextContent("₹6,00,000.00");
    expect(screen.getByTestId("work-value-subtotal-reach-3")).toHaveTextContent("₹10,000.00");
    expect(screen.getByTestId("work-value-subtotal-whole-road")).toHaveTextContent("₹18,000.00");
    expect(screen.getByTestId("work-value-subtotal-no-scope-4-0")).toHaveTextContent("₹1,00,000.00");
    expect(screen.getByTestId("work-value-grand-total")).toHaveTextContent("₹7,28,000.00");
    fireEvent.click(within(screen.getByTestId("work-value-row-reach-1-4"))
      .getByRole("button", { name: /Expand details for Earthen shoulders/ }));
    expect(screen.getByText(/Incidental: 20 CUM · Rework: 30 CUM/)).toBeInTheDocument();
    expect(screen.getByTestId("bars-beyond-corridor")).toHaveTextContent("3+200");
    expect(screen.getByTestId("work-value-reach-totals")).toHaveTextContent("Totals by reach");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/boq/projects/2/work-value", { credentials: "include" });
    });
  });
});
