// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { VendorBillTaxesSummary } from "../VendorBillTaxesSummary";

afterEach(cleanup);

const cellsFor = (label: string) => {
  const row = screen.getByRole("rowheader", { name: label }).parentElement!;
  return within(row).getAllByRole("cell").map(cell => cell.textContent);
};

describe("compact filtered vendor bill taxes summary", () => {
  it("retains category columns and shows genuine zeros for an empty selection", () => {
    render(<VendorBillTaxesSummary bills={[]} />);
    expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual([
      "Tax", "Equipment", "Material", "Transport", "Labour", "Total",
    ]);
    expect(screen.getAllByRole("row")).toHaveLength(4);
    for (const label of ["GST", "TDS (IT)", "Total"]) {
      expect(cellsFor(label)).toEqual(Array(5).fill("₹0.00"));
    }
    expect(screen.getByRole("region", { name: "Bill tax figures" }).tabIndex).toBe(0);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("reports only supplied bills using saved GST allocation and recorded TDS", () => {
    render(<VendorBillTaxesSummary bills={[
      { billType: "equipment", totalAmount: 1200, gstRateEquipment: 18, tdsAmount: 24 },
      { billType: "material", totalAmount: 800, gstRateMaterial: 5, tdsAmount: 8 },
      { billType: "transport", totalAmount: 600, gstRateTransport: 12, tdsAmount: 6 },
      { billType: "labour", totalAmount: 500, gstRateLabour: 18, tdsAmount: 5 },
    ]} />);
    expect(cellsFor("GST")).toEqual(["₹216.00", "₹40.00", "₹72.00", "₹90.00", "₹418.00"]);
    expect(cellsFor("TDS (IT)")).toEqual(["₹24.00", "₹8.00", "₹6.00", "₹5.00", "₹43.00"]);
    expect(cellsFor("Total")).toEqual(["₹240.00", "₹48.00", "₹78.00", "₹95.00", "₹461.00"]);
    expect(screen.getByText(/not an additional bill liability/)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("never infers missing TDS from a percentage and preserves recorded zero", () => {
    render(<VendorBillTaxesSummary bills={[
      { billType: "equipment", totalAmount: 1000, gstRateEquipment: 18, tdsRate: 2 },
      { billType: "material", totalAmount: 500, tdsRate: 2, tdsAmount: 0 },
    ]} />);
    expect(cellsFor("TDS (IT)")).toEqual(["Not established", "₹0.00", "₹0.00", "₹0.00", "Not established"]);
    expect(cellsFor("Total")).toEqual(["₹180.00*", "₹0.00", "₹0.00", "₹0.00", "₹180.00*"]);
    expect(screen.getByRole("note").textContent).toContain("Known subtotal only");
  });

  it("marks known subtotals when other deductions are missing", () => {
    render(<VendorBillTaxesSummary bills={[
      { billType: "equipment", totalAmount: 800, tdsAmount: 16 },
      { billType: "equipment", totalAmount: 600, tdsRate: 2 },
    ]} />);
    expect(cellsFor("TDS (IT)")).toEqual(["₹16.00*", "₹0.00", "₹0.00", "₹0.00", "₹16.00*"]);
    expect(screen.queryByText(/its category split is not established/)).toBeNull();
  });

  it("includes whole-bill TDS in totals without inventing a combined category split", () => {
    render(<VendorBillTaxesSummary bills={[
      { billType: "all", gstRateEquipment: 18, gstRateMaterial: 5, tdsAmount: 30,
        items: [{ category: "equipment", amount: 1000 }, { category: "material", amount: 500 }] },
    ]} />);
    expect(cellsFor("GST")).toEqual(["₹180.00", "₹25.00", "₹0.00", "₹0.00", "₹205.00"]);
    expect(cellsFor("TDS (IT)")).toEqual(["Not established", "Not established", "₹0.00", "₹0.00", "₹30.00"]);
    expect(cellsFor("Total")).toEqual(["₹180.00*", "₹25.00*", "₹0.00", "₹0.00", "₹235.00"]);
    expect(screen.getByText(/Recorded TDS of ₹30.00 is included in Total/)).toBeTruthy();
  });

  it("does not show an allocation note for a recorded combined-bill zero", () => {
    render(<VendorBillTaxesSummary bills={[
      { billType: "all", tdsAmount: 0,
        items: [{ category: "transport", amount: 250 }, { category: "labour", amount: 400 }] },
    ]} />);
    expect(cellsFor("TDS (IT)")).toEqual(Array(5).fill("₹0.00"));
    expect(screen.queryByRole("note")).toBeNull();
  });
});
