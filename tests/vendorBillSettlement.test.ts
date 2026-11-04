import { describe, expect, it } from "vitest";
import {
  buildPreviousBillingContext,
} from "../shared/vendorBillPreviousContext";
import { billReviewAmounts } from "../shared/vendorBillReview";
import { canRoundOffVendorBill, vendorBillBalance, vendorBillDifference, vendorBillSettlementLine } from "../shared/vendorBillSettlement";
import { billPaymentPosition, getBillFinancialTotals } from "../shared/vendorBillFinancialReport";

const baseBill = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  billNo: "VB-001",
  billDate: "2026-10-01",
  vendorId: 7,
  vendorName: "TEST VENDOR",
  status: "paid",
  billType: "equipment",
  totalAmount: 100,
  netPayableAmount: 100,
  amountPaid: 90,
  items: [],
  additionalAdjustments: [],
  ...overrides,
});

describe("vendor bill settlement", () => {
  it("computes signed differences and applies a zero balance only to rounded-off settlements", () => {
    expect(vendorBillDifference(100, 90)).toBe(10);
    expect(vendorBillDifference(100, 120)).toBe(-20);
    expect(vendorBillBalance(100, 90, "rounded_off")).toBe(0);
    expect(vendorBillBalance(100, 90, "carried_forward")).toBe(10);
    expect(vendorBillBalance(100, 120, "carried_forward")).toBe(-20);
  });

  it("allows non-Owners to round off only within the configured limit", () => {
    expect(canRoundOffVendorBill(false, 100, 100)).toBe(true);
    expect(canRoundOffVendorBill(false, 100.01, 100)).toBe(false);
    expect(canRoundOffVendorBill(true, 10_000, 100)).toBe(true);
  });

  it("formats settlement labels with reason and preserves the actual bill balance", () => {
    expect(vendorBillSettlementLine({
      settlementType: "rounded_off", settlementAmount: 10, settlementReason: "Agreed rounding",
    })).toBe("Rounded off ₹10.00 — Agreed rounding");
    expect(vendorBillSettlementLine({
      settlementType: "carried_forward", settlementAmount: -20, settlementReason: "Next bill credit",
    })).toBe("₹20.00 advance carried to next bill — Next bill credit");
    expect(billReviewAmounts(baseBill({
      settlementType: "rounded_off", settlementAmount: 10, settlementReason: "Agreed rounding",
    }), getBillFinancialTotals(baseBill())).balance).toBe(0);
  });

  it("shows carried-forward due and credit against the originating bill", () => {
    const current = baseBill({ id: 2, billNo: "VB-002", billDate: "2026-10-20", amountPaid: null });
    const dueBill = baseBill({
      id: 1, billNo: "VB-001", amountPaid: 90, settlementType: "carried_forward",
      settlementAmount: 10, settlementReason: "Pay with next bill",
    });
    const due = buildPreviousBillingContext(current, [dueBill, current]);
    expect(due.rows[0]).toMatchObject({
      balance: 10, credit: 0, settlementNote: "Carried forward from VB-001 — Pay with next bill",
    });
    expect(billPaymentPosition(dueBill).contradictory).toBe(false);

    const creditBill = baseBill({
      id: 1, billNo: "VB-001", amountPaid: 120, settlementType: "carried_forward",
      settlementAmount: -20, settlementReason: "Advance with next bill",
    });
    const credit = buildPreviousBillingContext(current, [creditBill, current]);
    expect(credit.rows[0]).toMatchObject({
      balance: -20, credit: 20, settlementNote: "Carried forward from VB-001 — Advance with next bill",
    });
  });
});
