// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ProgrammeBarPicker, type PickerBar } from "../client/src/components/ProgrammeBarPicker";
import { BillItemPicker, type BillItem } from "../client/src/components/BillItemPicker";

const futureBar: PickerBar = {
  id: 501,
  reachLabel: "Future reach",
  chainageFrom: 1,
  chainageTo: 2,
  side: "lhs",
  plannedWidthM: null,
  plannedThicknessMm: null,
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  sequenceOrder: 1,
  plannedQty: 100,
  reportedQty: 0,
  remainingQty: 100,
  unit: "SQM",
  sideCoverage: null,
  arrangement: null,
};

function Harness({ initialValue = null }: { initialValue?: number | null }) {
  const [value, setValue] = useState<number | null>(initialValue);
  return (
    <ProgrammeBarPicker
      projectId={41}
      boqItemId={501}
      dprDate="2026-09-15"
      value={value}
      autoSelect
      testidPrefix="optional"
      onSelect={(bar) => setValue(bar?.id ?? null)}
    />
  );
}

function renderPicker(response: PickerBar[] | "error", initialValue: number | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (response === "error") {
      return new Response("programme unavailable", { status: 503 });
    }
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }));
  return render(
    <QueryClientProvider client={client}>
      <Harness initialValue={initialValue} />
    </QueryClientProvider>,
  );
}

const restoredItems: BillItem[] = [
  {
    id: 11,
    description: "First bill item",
    itemCode: null,
    itemName: "First bill item",
    unit: "SQM",
    dprConversionFactor: 1,
    categoryName: "Bill A",
  },
  {
    id: 22,
    description: "Second bill item",
    itemCode: null,
    itemName: "Second bill item",
    unit: "SQM",
    dprConversionFactor: 1,
    categoryName: "Bill B",
  },
];

function RestoredPickerHarness() {
  const [value, setValue] = useState<number | null>(11);
  return (
    <>
      <button type="button" data-testid="restore-second-item" onClick={() => setValue(22)}>Restore second item</button>
      <BillItemPicker
        items={restoredItems}
        value={value}
        testidPrefix="restore"
        onChange={(id) => setValue(id)}
      />
    </>
  );
}

describe("DPR programme link optionality", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the selected BOQ item usable when there are no programme bars", async () => {
    renderPicker([]);

    await waitFor(() => {
      expect(screen.getByTestId("optional-programme-optional-status")).toHaveTextContent(
        "Not linked to a programme bar (optional)",
      );
    });
  });

  it("allows a real BOQ row to remain unlinked when its only bar is future-dated", async () => {
    renderPicker([futureBar]);

    // The existing matcher may suggest a sole future bar, but this is an
    // optional context and must provide a deliberate no-link path.
    await waitFor(() => {
      expect(screen.getByTestId("optional-leave-unlinked")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("optional-leave-unlinked"));
    await waitFor(() => {
      expect(screen.getByTestId("optional-linked-summary")).toHaveTextContent(
        "Not linked to a programme bar (optional)",
      );
    });
  });

  it("surfaces programme lookup failure without removing the BOQ row", async () => {
    renderPicker("error");

    await waitFor(() => {
      expect(screen.getByTestId("optional-programme-optional-status")).toHaveTextContent(
        "BOQ item can still be saved without a programme bar",
      );
    });
  });

  it("does not relabel a retained historical link as unlinked when bar details are empty", async () => {
    renderPicker([], 909);

    await waitFor(() => {
      expect(screen.getByTestId("optional-programme-optional-status")).toHaveTextContent(
        "Programme bar #909 remains linked",
      );
      expect(screen.getByTestId("optional-leave-unlinked")).toBeInTheDocument();
    });
  });

  it("restores the Bill selector when a saved item arrives from another group", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Element.prototype.scrollIntoView = () => {};
    render(<RestoredPickerHarness />);
    fireEvent.click(screen.getByTestId("restore-second-item"));
    await waitFor(() => expect(screen.getByTestId("restore-item-select")).toHaveTextContent("Second bill item"));

    fireEvent.click(screen.getByTestId("restore-item-select"));
    await waitFor(() => {
      expect(screen.getByTestId("option-boq-item-22")).toBeInTheDocument();
      expect(screen.queryByTestId("option-boq-item-11")).toBeNull();
    });
  });
});