// @vitest-environment jsdom
import React, { useState } from "react";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  BillDateGroupControls,
  BillDateGroupRows,
  LARGE_BILL_ITEM_THRESHOLD,
  MISSING_BILL_ITEM_DATE,
  groupBillItemsByDate,
} from "@/components/vendor-bills/BillDateGroups";

type Item = { date?: string | null; amount: number; category?: string; source?: string };

afterEach(cleanup);

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

  it("wires date rows into both edit and read-only tables without replacing original row indexes", () => {
    const source = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
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