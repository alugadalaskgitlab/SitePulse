// @vitest-environment jsdom
import React, { useState } from "react";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { groupRateItems } from "@shared/vendorBillCandidates";
import type { ArrangementPricing } from "@shared/vendorBillArrangement";
import {
  ArrangementBillGroupRow,
  ArrangementBillOverallTotals,
  type ArrangementBillItem,
} from "@/components/vendor-bills/ArrangementBillGroups";
import {
  BillDateGroupControls,
  BillDateGroupRows,
  LARGE_BILL_ITEM_THRESHOLD,
  MISSING_BILL_ITEM_DATE,
  groupBillItemsByDate,
} from "@/components/vendor-bills/BillDateGroups";

type Item = { date?: string | null; amount: number; category?: string; source?: string };

afterEach(cleanup);

it("offers removal only in editable groups and passes original indices while collapsed", () => {
  const rows = [{ item: { date: "2027-02-14", amount: 1 }, idx: 2 }, { item: { date: "2027-02-14", amount: 2 }, idx: 9 }];
  const removals: unknown[] = [];
  const toggles: unknown[] = [];
  const props = {
    items: rows, scope: "test", totalColumns: 2, totalBillItems: 111,
    expansionMode: "collapsed" as const, expansionOverrides: {}, onToggle: (key: string, expanded: boolean) => toggles.push({ key, expanded }),
    renderRow: () => null, formatDate: (date: string | null | undefined) => date || "",
    formatAmount: String,
  };
  const { rerender } = render(<table><tbody><BillDateGroupRows {...props}
    onRemoveGroup={(items, label) => removals.push({ items, label })} /></tbody></table>);
  const toggle = screen.getByTestId("button-date-group-test-2027-02-14");
  const remove = screen.getByText("Remove Group");
  expect(toggle.className).toContain("w-full");
  expect(remove.className).toContain("min-h-11");
  expect(remove.parentElement?.className).toBe("mt-3 flex justify-end border-t pt-3");
  expect(toggle.contains(remove)).toBe(false);
  fireEvent.click(toggle);
  expect(toggles).toEqual([{ key: "test:2027-02-14", expanded: true }]);
  expect(removals).toEqual([]);
  fireEvent.click(remove.parentElement!);
  expect(removals).toEqual([]);
  fireEvent.click(screen.getByText("Remove Group"));
  expect(removals).toEqual([{ items: rows, label: "2027-02-14" }]);
  expect(toggles).toHaveLength(1);
  rerender(<table><tbody><BillDateGroupRows {...props} /></tbody></table>);
  expect(screen.queryByText("Remove Group")).toBeNull();
  expect(screen.getByTestId("row-date-group-test-2027-02-14").querySelector(".border-t")).toBeNull();
});

function Harness({ items }: { items: Item[] }) {
  const [mode, setMode] = useState<"auto" | "expanded" | "collapsed">("auto");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  return (
    <>
      <BillDateGroupControls expansionMode={mode} onExpansionModeChange={next => {
        setMode(next);
        setOverrides({});
      }} />
      <table><tbody>
        <BillDateGroupRows
          items={items.map((item, idx) => ({ item, idx }))}
          scope="test"
          totalColumns={4}
          totalBillItems={items.length}
          expansionMode={mode}
          expansionOverrides={overrides}
          onToggle={(key, expanded) => setOverrides(previous => ({ ...previous, [key]: expanded }))}
          renderRow={(item, idx) => <tr key={idx} data-testid={`item-${idx}`}><td>{item.amount}</td></tr>}
          formatDate={date => String(date)}
          formatAmount={amount => amount.toFixed(2)}
        />
      </tbody></table>
    </>
  );
}

type ArrangementTestItem = ArrangementBillItem & {
  date: string;
  amount: number;
  rate: number;
  arrangementPricing: ArrangementPricing;
};

function arrangementItem(date: string, tripId: number): ArrangementTestItem {
  return {
    date,
    amount: 100,
    rate: 100,
    category: "transport",
    description: "SOIL · Arrangement #2",
    unit: "TRIP",
    equipmentId: null,
    arrangementPricing: {
      arrangementId: 2,
      tripId,
      terms: { scope: "transport_only", basis: "trip" },
      tripQuantity: 1,
      tripUom: "CUM",
      rateApplied: 100,
      billedQty: 1,
      billedUnit: "TRIP",
      reason: null,
      conflict: false,
    },
  };
}

function ArrangementHarness({
  items,
  onRemoveAll,
}: {
  items: ArrangementTestItem[];
  onRemoveAll: (items: ArrangementTestItem[]) => void;
}) {
  const groups = groupRateItems(items);
  return (
    <table>
      <tbody>
        <BillDateGroupRows
          items={items.map((item, idx) => ({ item, idx }))}
          scope="arrangement"
          totalColumns={4}
          totalBillItems={items.length}
          expansionMode="expanded"
          expansionOverrides={{}}
          onToggle={() => {}}
          renderRow={(item, idx, dateGroup) => (
            <ArrangementBillGroupRow
              item={item}
              idx={idx}
              dateGroup={dateGroup}
              allArrangementGroups={groups}
              colSpan={4}
              formatAmount={amount => amount.toFixed(2)}
              onRemoveAll={onRemoveAll}
            />
          )}
          formatDate={date => String(date)}
          formatAmount={amount => amount.toFixed(2)}
        />
        <ArrangementBillOverallTotals
          groups={groups}
          colSpan={4}
          formatAmount={amount => amount.toFixed(2)}
        />
      </tbody>
    </table>
  );
}

describe("vendor bill date groups", () => {
  it("groups 100+ trip rows by date and keeps original indexes and exact grand total", () => {
    const items = Array.from({ length: 105 }, (_, idx) => ({
      date: `2026-09-${String((idx % 3) + 1).padStart(2, "0")}`,
      amount: idx + 0.25,
      category: "material",
      source: "auto:site_material_trip",
    }));
    const groups = groupBillItemsByDate(items.map((item, idx) => ({ item, idx })));
    expect(groups.map(group => group.items.length)).toEqual([35, 35, 35]);
    expect(groups.flatMap(group => group.items.map(row => row.idx)).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 105 }, (_, idx) => idx));
    expect(groups.reduce((sum, group) => sum + group.subtotal, 0))
      .toBeCloseTo(items.reduce((sum, item) => sum + item.amount, 0));
  });

  it("places missing dates in an explicit final group", () => {
    const groups = groupBillItemsByDate([
      { item: { date: null, amount: 20 }, idx: 0 },
      { item: { date: "2026-09-01", amount: 30 }, idx: 1 },
      { item: { date: "", amount: 40 }, idx: 2 },
    ]);
    expect(groups.map(group => group.key)).toEqual(["2026-09-01", MISSING_BILL_ITEM_DATE]);
    expect(groups[1].subtotal).toBe(60);
  });

  it("expands small bills, collapses bills over 20, and supports all/toggle controls", () => {
    const small = [{ date: "2026-09-01", amount: 10 }, { date: "2026-09-02", amount: 20 }];
    const view = render(<Harness items={small} />);
    expect(screen.getByTestId("item-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-collapse-all-dates"));
    expect(screen.queryByTestId("item-0")).toBeNull();
    fireEvent.click(screen.getByTestId("button-expand-all-dates"));
    expect(screen.getByTestId("item-0")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-date-group-test-2026-09-01"));
    expect(screen.queryByTestId("item-0")).toBeNull();

    view.unmount();
    render(<Harness items={Array.from({ length: LARGE_BILL_ITEM_THRESHOLD + 1 }, (_, idx) => ({
      date: "2026-09-03",
      amount: idx,
    }))} />);
    expect(screen.queryByTestId("item-20")).toBeNull();
  });

  it("preserves combined category and labour nesting inputs independently", () => {
    const rows = [
      { item: { date: "2026-09-02", amount: 10, category: "equipment", source: "auto" }, idx: 0 },
      { item: { date: "2026-09-02", amount: 20, category: "labour", source: "site" }, idx: 1 },
      { item: { date: "2026-09-03", amount: 30, category: "labour", source: "plant" }, idx: 2 },
    ];
    const equipment = groupBillItemsByDate(rows.filter(row => row.item.category === "equipment"));
    const siteLabour = groupBillItemsByDate(rows.filter(row => row.item.category === "labour" && row.item.source === "site"));
    const plantLabour = groupBillItemsByDate(rows.filter(row => row.item.category === "labour" && row.item.source === "plant"));
    expect(equipment[0].items[0].idx).toBe(0);
    expect(siteLabour[0].items[0].idx).toBe(1);
    expect(plantLabour[0].items[0].idx).toBe(2);
    expect([...equipment, ...siteLabour, ...plantLabour].reduce((sum, group) => sum + group.subtotal, 0)).toBe(60);
  });

  it("renders one arrangement summary per date and preserves the all-days total and full-group removal", () => {
    const items = [
      arrangementItem("2026-08-13", 1),
      arrangementItem("2026-08-13", 2),
      arrangementItem("2026-08-14", 3),
    ];
    const onRemoveAll = vi.fn();
    render(<ArrangementHarness items={items} onRemoveAll={onRemoveAll} />);

    expect(screen.getByTestId("row-date-group-arrangement-2026-08-13").textContent).toContain("2 items");
    expect(screen.getByTestId("row-date-group-arrangement-2026-08-14").textContent).toContain("1 item");
    expect(screen.getAllByTestId(/arrangement-bill-group-/)).toHaveLength(2);
    expect(screen.getByTestId("arrangement-bill-group-0-2026-08-13").textContent)
      .toContain("2 trips · Rate ₹100 · ₹200.00 that day");
    expect(screen.getByTestId("arrangement-bill-group-2-2026-08-14").textContent)
      .toContain("1 trips · Rate ₹100 · ₹100.00 that day");
    expect(screen.getByTestId("arrangement-bill-overall-total").textContent)
      .toContain("3 trips · ₹300.00");

    fireEvent.click(screen.getAllByText("Remove group from this bill")[0]);
    expect(onRemoveAll).toHaveBeenCalledTimes(1);
    expect(onRemoveAll.mock.calls[0][0].map(item => item.date)).toEqual([
      "2026-08-13",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("keeps a single-day arrangement count and amount unchanged", () => {
    const items = [arrangementItem("2026-08-13", 1), arrangementItem("2026-08-13", 2)];
    render(<ArrangementHarness items={items} onRemoveAll={vi.fn()} />);
    expect(screen.getAllByTestId(/arrangement-bill-group-/)).toHaveLength(1);
    expect(screen.getByTestId("arrangement-bill-group-0-2026-08-13").textContent)
      .toContain("2 trips · Rate ₹100 · ₹200.00 that day");
    expect(screen.getByTestId("arrangement-bill-overall-total").textContent)
      .toContain("2 trips · ₹200.00");
  });

  it("wires date rows into both edit and read-only tables without replacing original row indexes", () => {
    const source = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    expect(source).toContain("dateGroup={dateGroup}");
    expect(source).toContain("ArrangementBillOverallTotals");
    expect(source).toContain('scope={`edit-${cat}`}');
    expect(source).toContain('scope={`detail-${cat}`}');
    expect(source).toContain('scope={`edit-${cat}-labour-${grp.key}`}');
    expect(source).toContain('scope={`detail-${cat}-labour-${grp.key}`}');
    expect(source).toContain('scope="edit-all"');
    expect(source).toContain('scope="detail-all"');
    expect(source).toContain('onChange={e => updateLineItem(idx, "rate"');
    expect(source).toContain("onClick={() => removeLineItem(idx)}");
  });
});