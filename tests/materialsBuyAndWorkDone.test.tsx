// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { MaterialsBuyAndWorkDone } from "../client/src/components/MaterialsBuyAndWorkDone";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MaterialsBuyAndWorkDone", () => {
  it("compares submitted-work recipe use with site receipts and keeps Work done separate", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      projectId: 42,
      projectName: "Road Project",
      siteName: "Road Site",
      from: "2026-11-01",
      to: "2026-11-06",
      plantStockShared: true,
      storeIssuePolicy: "Site-only store issues are not attributed.",
      rows: [{
        materialName: "WMM",
        forLabels: ["WMM layer"],
        uom: "MT",
        sourceType: "site",
        hasPlantMix: false,
        hasSiteSupply: true,
        needToBuy: 100,
        needToBuyCft: null,
        boughtSoFar: 15,
        boughtSoFarCft: null,
        used: 20,
        usedCft: null,
        incidentalUsed: 5,
        incidentalUsedCft: null,
        atPlantNow: -4,
        atPlantNowCft: null,
        plantStockWarning: "Used more than received — check receipts or mix template",
        stillToBuy: 90,
        stillToBuyCft: null,
        excess: null,
        excessCft: null,
        monthlyNeed: {},
        lines: [{
          boqItemId: 9,
          itemCode: "WMM",
          itemName: "Wet mix macadam",
          description: "Wet mix macadam, 250 mm thick",
          boqQuantity: 200,
          boqUom: "CUM",
          materialNeed: 100,
          workDoneQuantity: 40,
          shouldHaveUsed: 20,
          materialNeedCft: null,
          unit: "MT",
        }],
        sourceNotes: ["Used: DPR × recipe"],
        attributions: ["Bought by site"],
        setupAction: null,
        setupItemId: null,
        materialMasterId: 7,
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MaterialsBuyAndWorkDone
          projectId={42}
          projectStartDate="2026-07-01"
          workRows={[]}
          workLoading={false}
          canEditDemandSource={false}
          onLinkMaster={() => undefined}
        />
      </QueryClientProvider>,
    );

    await screen.findByTestId("buy-use-row-WMM-site");
    expect(screen.getByLabelText("Actuals from")).toHaveValue("2026-07-01");
    expect(screen.getByTestId("table-materials-buy-use")).toBeInTheDocument();
    expect(screen.getByTestId("table-work-done")).toBeInTheDocument();
    expect(screen.getByText("Should have used")).toBeInTheDocument();
    expect(screen.getByText("Actually received / dispatched to site")).toBeInTheDocument();
    expect(screen.getByText("20 MT")).toBeInTheDocument();
    expect(screen.getByText("15 MT")).toBeInTheDocument();
    expect(screen.getByText("−5 MT — less used")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/boq\/projects\/42\/material-buy-use\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/),
        { credentials: "include" },
      );
    });
    expect(screen.queryByText("Need for working reaches")).not.toBeInTheDocument();
  });
});
