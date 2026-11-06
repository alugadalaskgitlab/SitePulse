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
  it("loads the project material report from the actual endpoint and renders both tables", async () => {
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
        needToBuy: 100,
        needToBuyCft: null,
        boughtSoFar: 10,
        boughtSoFarCft: null,
        used: 20,
        usedCft: null,
        atPlantNow: null,
        atPlantNowCft: null,
        stillToBuy: 90,
        stillToBuyCft: null,
        excess: null,
        excessCft: null,
        monthlyNeed: {},
        lines: [],
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
          workRows={[]}
          workLoading={false}
          canEditDemandSource={false}
          onLinkMaster={() => undefined}
        />
      </QueryClientProvider>,
    );

    await screen.findByTestId("buy-use-row-WMM-site");
    expect(screen.getByTestId("table-materials-buy-use")).toBeInTheDocument();
    expect(screen.getByTestId("table-work-done")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/boq\/projects\/42\/material-buy-use\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/),
        { credentials: "include" },
      );
    });
    expect(screen.getByText("Bought by site")).toBeInTheDocument();
  });
});
