import { getBillFinancialTotals } from "./vendorBillFinancialReport";
import { billReviewAmounts, previousBillingSummary } from "./vendorBillReview";

export type PreviousBillingAdjustment = {
  label: string;
  amount: number;
  reason?: string;
};

export type PreviousBillingRow = {
  id: number;
  billNo: string;
  billDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  status: string;
  paidAt: string | null;
  gross: number;
  net: number;
  paid: number | null;
  balance: number | null;
  credit: number;
  provisional: boolean;
  runningBalance: number | null;
  adjustments: PreviousBillingAdjustment[];
};

export type PreviousBillingContext = {
  rows: PreviousBillingRow[];
  gross: number | null;
  paid: number | null;
  balance: number | null;
};

/** Narrow, read-only projection for the bill-detail Previous Billing Summary. */
export function buildPreviousBillingContext(current: any, permittedBills: any[]): PreviousBillingContext {
  const summary = previousBillingSummary(current, permittedBills, getBillFinancialTotals);
  let subtotal = 0;
  let paymentGap = false;

  const rows = summary.rows.map((bill: any): PreviousBillingRow => {
    const amounts = billReviewAmounts(bill, getBillFinancialTotals(bill));
    const totals = getBillFinancialTotals(bill);
    const adjustments: PreviousBillingAdjustment[] = [
      ...(Number(bill.adjustmentAmount)
        ? [{ label: bill.adjustmentLabel || "Bill adjustment", amount: Number(bill.adjustmentAmount) }]
        : []),
      ...totals.additional,
      ...(bill.hireStatements || []).flatMap((statement: any) => {
        const saved = statement.calculationSnapshot?.adjustments;
        if (!saved) return [];
        return ["breakdownDeduction", "hsdRecovery", "otherDebit", "advanceAdjustment", "otherCredit"]
          .filter(key => Number(saved[key]))
          .map(key => ({
            label: `${statement.equipmentName || `Equipment #${statement.equipmentId}`} · ${key}`,
            amount: Number(saved[key]) * (key === "otherCredit" ? 1 : -1),
            ...(saved[`${key}Reason`] ? { reason: String(saved[`${key}Reason`]) } : {}),
          }));
      }),
    ];

    paymentGap ||= amounts.paid == null;
    subtotal += amounts.net - (amounts.paid ?? 0);
    return {
      id: bill.id,
      billNo: bill.billNo,
      billDate: bill.billDate,
      periodFrom: bill.periodFrom ?? null,
      periodTo: bill.periodTo ?? null,
      status: bill.status,
      paidAt: bill.paidAt ?? null,
      gross: amounts.gross,
      net: amounts.net,
      paid: amounts.paid,
      balance: amounts.balance,
      credit: amounts.credit,
      provisional: amounts.provisional,
      runningBalance: paymentGap ? null : subtotal,
      adjustments,
    };
  });

  return {
    rows,
    gross: summary.gross,
    paid: summary.paid,
    balance: summary.balance,
  };
}
