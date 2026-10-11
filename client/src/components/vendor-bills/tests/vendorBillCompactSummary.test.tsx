// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { VendorBillFinancialSummary } from "../VendorBillReview";

afterEach(cleanup);

const totals = (bill: any) => ({
  totalAmount: bill.gross ?? 1000,
  totalGst: 180,
  primaryAdjustment: -75,
  additionalTotal: 25,
  tds: 10,
  netTotal: 1120,
});
const valueFor = (label: string) => {
  const tile = screen.getByText(label).parentElement!;
  return tile.querySelector("dd")!.textContent;
};

describe("compact filtered vendor bill summary", () => {
  it("renders exactly four figures in one horizontally scrollable row", () => {
    render(<VendorBillFinancialSummary bills={[]} totals={totals} />);
    const region = screen.getByRole("region", { name: "Bill summary figures" });
    expect(region.className).toContain("overflow-x-auto");
    expect(region.tabIndex).toBe(0);
    const row = region.querySelector("dl")!;
    expect(row.children).toHaveLength(4);
    expect(row.className).toContain("min-w-[800px]");
    expect(row.className).toContain("grid-cols-[");
    expect(Array.from(row.querySelectorAll("dt"), node => node.textContent)).toEqual([
      "No. of Bills", "Total Gross Bill Amount", "Paid Amount", "Total Net Payable / Outstanding",
    ]);
    expect(valueFor("No. of Bills")).toBe("0");
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹0.00");
  });

  it("uses only the supplied filtered bills and existing amount projections", () => {
    const calculate = vi.fn(totals);
    const bills = [
      { id: 1, status: "approved", gross: 2200, netPayableAmount: 2360, amountPaid: 750 },
      { id: 2, status: "paid", gross: 1000, netPayableAmount: 1120, amountPaid: 1120 },
    ];
    render(<VendorBillFinancialSummary bills={bills} totals={calculate} />);
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(calculate).toHaveBeenNthCalledWith(1, bills[0]);
    expect(calculate).toHaveBeenNthCalledWith(2, bills[1]);
    expect(valueFor("No. of Bills")).toBe("2");
    expect(valueFor("Total Gross Bill Amount")).toBe("₹3,200.00");
    expect(valueFor("Paid Amount")).toBe("₹1,870.00");
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹1,610.00");
  });

  it("keeps overpayments and negative bill credits subordinate, without offsetting outstanding", () => {
    render(<VendorBillFinancialSummary bills={[
      { status: "approved", netPayableAmount: 900, amountPaid: 200 },
      { status: "paid", netPayableAmount: 300, amountPaid: 450 },
      { status: "approved", netPayableAmount: -80, amountPaid: 0 },
    ]} totals={totals} />);
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹700.00");
    const tile = screen.getByText("Total Net Payable / Outstanding").parentElement!;
    expect(within(tile).getByText("Vendor credits: ₹230.00 · not offset")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Filtered bill financial summary" }).querySelectorAll("dt")).toHaveLength(4);
  });

  it.each(["draft", "verified"])("distinguishes %s amounts as provisional, not approved for payment", status => {
    render(<VendorBillFinancialSummary bills={[
      { status, netPayableAmount: 600, amountPaid: 100 },
      { status: "approved", netPayableAmount: 900, amountPaid: 200 },
    ]} totals={totals} />);
    expect(screen.getByText("1 provisional · Draft / Verified")).toBeTruthy();
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹1,200.00");
    expect(screen.getByText(/Draft and Verified values are provisional, not approved for payment/).textContent)
      .toContain("Outstanding includes ₹500.00 provisional");
  });

  it("counts unknown payments without inferring payment from paid status", () => {
    render(<VendorBillFinancialSummary bills={[
      { status: "paid", netPayableAmount: 900 },
      { status: "approved", netPayableAmount: 600, amountPaid: null },
      { status: "approved", netPayableAmount: 400, amountPaid: 100 },
    ]} totals={totals} />);
    expect(valueFor("Paid Amount")).toBe("₹100.00");
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹300.00");
    expect(screen.getByRole("note").textContent).toBe("Unconfirmed: 2");
    expect(screen.getByRole("note").title).toContain("not assumed to be zero");
  });

  it("counts contradictory paid-status evidence alongside missing payments", () => {
    render(<VendorBillFinancialSummary bills={[
      { status: "paid", netPayableAmount: 900, amountPaid: 200 },
      { status: "paid", netPayableAmount: 300, amountPaid: 450 },
      { status: "approved", netPayableAmount: 400 },
      { status: "paid", netPayableAmount: 500, amountPaid: 500 },
    ]} totals={totals} />);
    expect(screen.getByRole("note").textContent).toBe("Unconfirmed: 3");
    expect(valueFor("Paid Amount")).toBe("₹1,150.00");
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹700.00");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("uses calculated net when saved net is absent and treats recorded zero as known", () => {
    render(<VendorBillFinancialSummary bills={[{ status: "approved", amountPaid: 0 }]} totals={totals} />);
    expect(valueFor("Paid Amount")).toBe("₹0.00");
    expect(valueFor("Total Net Payable / Outstanding")).toBe("₹1,120.00");
    expect(screen.queryByRole("note")).toBeNull();
  });
});
