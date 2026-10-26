import { describe, expect, it } from "vitest";
import { getBillFinancialTotals } from "../shared/vendorBillFinancialReport";

const billWithAutomaticHireStatements = (overrides: Record<string, unknown> = {}) => ({
  billType: "equipment",
  totalAmount: 44_032.26,
  adjustmentAmount: -5_000,
  additionalAdjustments: [{ label: "OPR UNAVAILABLE", amount: -10_000 }],
  gstRateEquipment: 0,
  tdsRate: 2,
  netPayableAmount: null,
  items: [
    { category: "equipment", amount: -20_967.74, hireStatementId: 13 },
    { category: "equipment", amount: 65_000, hireStatementId: 14 },
  ],
  hireStatements: [
    {
      id: 13,
      calculationSnapshot: {
        billingIntegration: "vb10_automatic",
        financials: { taxBase: 29_032.26, gstAmount: 0, tdsAmount: 580.65 },
      },
    },
    {
      id: 14,
      calculationSnapshot: {
        billingIntegration: "vb10_automatic",
        financials: { taxBase: 125_000, gstAmount: 0, tdsAmount: 2_500 },
      },
    },
  ],
  ...overrides,
});

describe("vendor bill financial report hire tax base", () => {
  it("uses the sum of saved hire tax bases for GST/TDS but keeps the item subtotal as the cash net base", () => {
    const totals = getBillFinancialTotals(billWithAutomaticHireStatements());
    expect(totals.totalAmount).toBe(44_032.26);
    expect(totals.totalGst).toBe(0);
    expect(totals.tds).toBe(3_080.65);
    expect(totals.netTotal).toBe(25_951.61);
  });

  it("calculates GST on the hire tax base rather than the net statement-line subtotal", () => {
    const totals = getBillFinancialTotals(billWithAutomaticHireStatements({
      gstRateEquipment: 18,
    }));
    expect(totals.gstRows).toEqual([
      { label: "GST @ 18%", amount: 27_725.81, rate: 18 },
    ]);
  });

  it("preserves a non-null stored net for an already-approved bill", () => {
    const totals = getBillFinancialTotals(billWithAutomaticHireStatements({
      status: "approved",
      netPayableAmount: 28_151.61,
    }));
    expect(totals.tds).toBe(3_080.65);
    expect(totals.netTotal).toBe(28_151.61);
  });

  it("keeps the existing item-subtotal tax path for bills without automatic hire snapshots", () => {
    const totals = getBillFinancialTotals({
      billType: "equipment",
      totalAmount: 10_000,
      items: [{ category: "equipment", amount: 10_000 }],
      gstRateEquipment: 18,
      tdsRate: 2,
      adjustmentAmount: 0,
      netPayableAmount: null,
    });
    expect(totals).toMatchObject({
      totalGst: 1_800,
      tds: 200,
      netTotal: 11_600,
    });
  });
});
