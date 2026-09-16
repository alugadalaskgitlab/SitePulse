// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useState } from "react";
import { BillItemPicker, type BillItem } from "../client/src/components/BillItemPicker";

const item = (id: number, bill: string, name: string, extras: Partial<BillItem> = {}): BillItem => ({
  id,
  description: `${name} full description`,
  itemCode: `BOQ-${id}`,
  itemName: name,
  unit: "SQM",
  dprConversionFactor: 1,
  categoryName: bill,
  sortOrder: id,
  ...extras,
});

const billAItem = item(11, "Bill A", "First bill item");
const billBItem = item(22, "Bill B", "Second bill item");

describe("BillItemPicker BOQ reachability and restoration", () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("switches the restored item group and recovers a stale bill after replacement", async () => {
    const onChange = vi.fn();
    const rendered = render(
      <BillItemPicker
        items={[billAItem, billBItem]}
        value={11}
        testidPrefix="replacement"
        onChange={onChange}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("replacement-bill-select")).toHaveTextContent("Bill A"));
    rendered.rerender(
      <BillItemPicker
        items={[billAItem, billBItem]}
        value={22}
        testidPrefix="replacement"
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("replacement-bill-select")).toHaveTextContent("Bill B"));
    fireEvent.click(screen.getByTestId("replacement-item-select"));
    await waitFor(() => {
      expect(screen.getByTestId("option-boq-item-22")).toBeInTheDocument();
      expect(screen.queryByTestId("option-boq-item-11")).toBeNull();
    });
    fireEvent.click(screen.getByTestId("option-boq-item-none"));
    rendered.rerender(
      <BillItemPicker
        items={[billAItem, billBItem]}
        value={null}
        testidPrefix="replacement"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("replacement-bill-select"));
    await waitFor(() => expect(screen.getByRole("option", { name: "Bill A" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: "Bill A" }));
    expect(onChange).toHaveBeenCalledTimes(2);

    // A site/project replacement can remove the selected bill entirely. The
    // picker must not strand the new rows behind the old local bill state.
    rendered.rerender(
      <BillItemPicker
        items={[billBItem]}
        value={null}
        testidPrefix="replacement"
        onChange={onChange}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("replacement-bill-select")).toHaveTextContent("All bills"));
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId("replacement-item-select"));
    await waitFor(() => expect(screen.getByTestId("option-boq-item-22")).toBeInTheDocument());
  });

  it("keeps legacy/null metadata visible and excludes only explicit DPR opt-outs", async () => {
    const legacyItem = item(31, "", "Legacy unclassified item", {
      categoryName: null,
      categorySourceBillNo: null,
      workCategory: null,
    });
    const categoryItem = item(32, "", "Legacy earthwork item", {
      categoryName: null,
      categorySourceBillNo: null,
      workCategory: "EARTHWORK",
    });
    const optedOutItem = item(33, "Hidden bill", "Explicitly excluded item", {
      includeInDpr: false,
    });
    render(
      <BillItemPicker
        items={[legacyItem, categoryItem, optedOutItem]}
        value={null}
        testidPrefix="legacy"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("legacy-bill-select")).toHaveTextContent("All bills");
    fireEvent.click(screen.getByTestId("legacy-item-select"));
    await waitFor(() => {
      expect(screen.getByTestId("option-boq-item-31")).toBeInTheDocument();
      expect(screen.getByTestId("option-boq-item-32")).toBeInTheDocument();
      expect(screen.queryByTestId("option-boq-item-33")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("legacy-bill-select"));
    await waitFor(() => expect(screen.getByRole("option", { name: /Needs Mapping/ })).toBeInTheDocument());
  });

  it("searches all bills by default without exposing opted-out rows", async () => {
    const optedOutItem = item(33, "Bill C", "Searchable but opted out", {
      includeInDpr: false,
    });
    render(
      <BillItemPicker
        items={[billAItem, billBItem, optedOutItem]}
        value={null}
        testidPrefix="search"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("search-item-select"));
    await waitFor(() => {
      expect(screen.getByTestId("option-boq-item-11")).toBeInTheDocument();
      expect(screen.getByTestId("option-boq-item-22")).toBeInTheDocument();
      expect(screen.queryByTestId("option-boq-item-33")).toBeNull();
    });
    fireEvent.change(screen.getByTestId("input-boq-item-search"), {
      target: { value: "second bill item" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("option-boq-item-22")).toBeInTheDocument();
      expect(screen.queryByTestId("option-boq-item-11")).toBeNull();
    });
  });

  it("restores an async saved row's group without clearing its selection", async () => {
    const onChange = vi.fn();
    function AsyncRows() {
      const [items, setItems] = useState<BillItem[]>([]);
      return (
        <>
          <button type="button" data-testid="load-restored-boq" onClick={() => setItems([billAItem, billBItem])}>
            Load rows
          </button>
          <BillItemPicker
            items={items}
            value={22}
            testidPrefix="async"
            onChange={onChange}
          />
        </>
      );
    }

    render(<AsyncRows />);
    expect(screen.getByTestId("async-bill-select")).toHaveTextContent("All bills");
    fireEvent.click(screen.getByTestId("load-restored-boq"));
    await waitFor(() => {
      expect(screen.getByTestId("async-bill-select")).toHaveTextContent("Bill B");
      expect(screen.getByTestId("async-item-select")).toHaveTextContent("Second bill item");
    });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("async-item-select"));
    await waitFor(() => {
      expect(screen.getByTestId("option-boq-item-22")).toBeInTheDocument();
      expect(screen.queryByTestId("option-boq-item-11")).toBeNull();
    });
  });
});