// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarLinkFeedback, type PickerBar } from "../client/src/components/ProgrammeBarPicker";
import {
  aggregateStructureActualCredits,
  dprActualBalance,
  exceedsKnownActualBalance,
} from "../client/src/lib/dprActualBalance";

const knownBar: PickerBar = {
  id: 1481,
  reachLabel: "Reach 1481",
  chainageFrom: 1,
  chainageTo: 2,
  side: "lhs",
  plannedWidthM: null,
  plannedThicknessMm: null,
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  sequenceOrder: 1,
  plannedQty: 100,
  reportedQty: 40,
  remainingQty: 60,
  unit: "CUM",
  arrangement: null,
};

function renderFeedback(bar: PickerBar) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([bar]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })));
  return render(
    <QueryClientProvider client={client}>
      <BarLinkFeedback
        projectId={1}
        boqItemId={2}
        programmeBarId={bar.id}
        sideKey="lhs"
        sideLabel="LHS"
        fromKm={1.1}
        toKm={1.2}
        overrideReason=""
        onOverrideReason={() => undefined}
        testidPrefix="nullable"
        boqQty={80}
        warnOverBalance
      />
    </QueryClientProvider>,
  );
}

function renderFeedbackWithItemTotals() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([knownBar]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })));
  const itemTotals = dprActualBalance({
    currentQty: 200,
    totalActual: 90,
    unit: "CUM",
    actualIncomplete: false,
    conversionWarnings: ["ignored stale same-unit factor"],
  });
  return render(
    <QueryClientProvider client={client}>
      <BarLinkFeedback
        projectId={1}
        boqItemId={2}
        programmeBarId={knownBar.id}
        sideKey="lhs"
        sideLabel="LHS"
        fromKm={1.1}
        toKm={1.2}
        overrideReason=""
        onOverrideReason={() => undefined}
        testidPrefix="item-known"
        itemTotals={itemTotals}
      />
    </QueryClientProvider>,
  );
}

describe("task1481 nullable actual consumers", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not derive a full balance or over-balance warning from incomplete BOQ actuals", () => {
    const info = dprActualBalance({
      currentQty: 100,
      totalActual: null,
      unit: "CUM",
      actualIncomplete: true,
      conversionWarnings: ["unresolved NOS to CUM credit"],
    });
    expect(info.balance).toBeNull();
    expect(info.needsUnitReview).toBe(true);
    expect(exceedsKnownActualBalance(info, 101)).toBe(false);
  });

  it("preserves known actual quantities and advisory warnings", () => {
    const info = dprActualBalance({
      currentQty: 100,
      totalActual: 40,
      unit: "CUM",
      actualIncomplete: false,
      conversionWarnings: ["ignored stale same-unit factor"],
    });
    expect(info.balance).toBe(60);
    expect(info.totalActual).toBe(40);
    expect(info.conversionWarnings).toEqual(["ignored stale same-unit factor"]);
    expect(exceedsKnownActualBalance(info, 61)).toBe(true);
  });

  it("does not fabricate a structure subtotal, balance, or warning from mixed valid and unresolved evidence", () => {
    const credits = aggregateStructureActualCredits([
      {
        boqProjectId: 7,
        date: "2026-09-10",
        structureItems: [
          {
            boqItemId: 11,
            structureId: "CULVERT-1",
            quantity: 25,
            uom: "CUM",
            dprConversionFactor: null,
          },
          {
            boqItemId: 11,
            structureId: "CULVERT-1",
            quantity: 10,
            uom: "NOS",
            dprConversionFactor: null,
          },
        ],
      },
    ], 7, "2026-09-11", [{
      id: 11,
      unit: "CUM",
      dprMeasurementMethod: null,
      dprConversionFactor: null,
    }]);

    const credit = credits.get("11::CULVERT-1");
    expect(credit?.actualIncomplete).toBe(true);
    expect(credit?.totalActual).toBeNull();
    expect(credit?.conversionWarnings.length).toBeGreaterThan(0);

    const info = dprActualBalance({
      currentQty: 100,
      totalActual: credit!.totalActual,
      unit: "CUM",
      actualIncomplete: credit!.actualIncomplete,
      conversionWarnings: credit!.conversionWarnings,
    });
    expect(info.balance).toBeNull();
    expect(info.needsUnitReview).toBe(true);
    expect(exceedsKnownActualBalance(info, 101)).toBe(false);
  });

  it("shows selected reach unit review and suppresses over-balance when bar actual is unresolved", async () => {
    renderFeedback({
      ...knownBar,
      reportedQty: null,
      remainingQty: null,
      reportedQtyUnresolved: true,
    });

    await waitFor(() => expect(screen.getByTestId("nullable-reach-balance")).toHaveTextContent("Needs unit review"));
    expect(screen.getByTestId("nullable-reach-unit-review")).toBeInTheDocument();
    expect(screen.queryByTestId("nullable-warn-over-balance")).not.toBeInTheDocument();
  });

  it("retains real selected-reach quantities, advisory warning, and real over-balance warning", async () => {
    renderFeedback({ ...knownBar, reportedQtyReviewRequired: true });

    await waitFor(() => expect(screen.getByTestId("nullable-reach-balance")).toHaveTextContent("Done 40"));
    expect(screen.getByTestId("nullable-reach-balance")).toHaveTextContent("Balance 60");
    expect(screen.getByTestId("nullable-reach-unit-warning")).toHaveTextContent("value retained");
    expect(screen.getByTestId("nullable-warn-over-balance")).toBeInTheDocument();
  });

  it("retains known BOQ-item totals when its conversion warning is only advisory", async () => {
    renderFeedbackWithItemTotals();

    await waitFor(() => expect(screen.getByTestId("item-known-item-totals")).toHaveTextContent("done 90 · bal 110 CUM"));
    expect(screen.getByTestId("item-known-item-unit-warning")).toHaveTextContent("value retained");
  });
});