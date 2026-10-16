/** Read-only projections. Never settle credits or infer a payment from status. */
export function billReviewAmounts(bill: any, totals: { totalAmount: number; totalGst: number; primaryAdjustment: number; additionalTotal: number; tds: number; netTotal: number }) {
  const net = bill.netPayableAmount == null ? totals.netTotal : Number(bill.netPayableAmount);
  const paid = bill.amountPaid == null || bill.amountPaid === "" || !Number.isFinite(Number(bill.amountPaid)) ? null : Number(bill.amountPaid);
  const balance = paid == null ? null : net - paid;
  return {
    gross: totals.totalAmount, gst: totals.totalGst,
    adjustments: totals.primaryAdjustment + totals.additionalTotal - totals.tds,
    net, paid, balance,
    outstanding: balance == null ? 0 : Math.max(0, balance),
    credit: balance == null ? Math.max(0, -net) : Math.max(0, -balance),
    eligible: bill.status === "approved" && balance != null ? Math.max(0, balance) : 0,
    provisional: !["approved", "paid"].includes(bill.status),
  };
}

export function summarizeBillReview(rows: ReturnType<typeof billReviewAmounts>[]) {
  return rows.reduce((sum, row) => ({
    count: sum.count + 1, gross: sum.gross + row.gross, gst: sum.gst + row.gst,
    adjustments: sum.adjustments + row.adjustments, net: sum.net + row.net,
    paid: sum.paid + (row.paid ?? 0), outstanding: sum.outstanding + row.outstanding,
    credits: sum.credits + row.credit, eligible: sum.eligible + row.eligible,
    unknownPayments: sum.unknownPayments + (row.paid == null ? 1 : 0),
  }), { count: 0, gross: 0, gst: 0, adjustments: 0, net: 0, paid: 0, outstanding: 0, credits: 0, eligible: 0, unknownPayments: 0 });
}

/** Input must already be site/permission scoped. No aliases or name matching. */
export function vendorStatementBills(current: any, permitted: any[], options: { includeVoided?: boolean } = {}) {
  return permitted.filter(b => (options.includeVoided || b.isCancelled !== true) && (current.vendorId != null
    ? b.vendorId != null && Number(b.vendorId) === Number(current.vendorId)
    : b.id === current.id)).sort((a, b) =>
    String(a.billDate).localeCompare(String(b.billDate)) || Number(a.id) - Number(b.id));
}

/** Permitted, confirmed identity only; later bills are not previous bills. */
export function previousBillingSummary(current: any, permitted: any[], totals: (bill: any) => any) {
  if (current.vendorId == null || !current.billDate) return { rows: [], excludedRows: [], gross: null, paid: null, balance: null, lastPayment: null };
  const sameVendorBills = vendorStatementBills(current, permitted);
  const isPrevious = (row: any) => String(row.billDate) < String(current.billDate) ||
    (row.billDate === current.billDate && Number(row.id) < Number(current.id));
  const rows = sameVendorBills.filter(row => row.id !== current.id && isPrevious(row));
  // Keep the existing previous-bill rule; expose only the same-vendor rows it
  // rejects so the UI can explain why they were not included in this summary.
  const excludedRows = sameVendorBills.filter(row => row.id !== current.id && !isPrevious(row));
  const amounts = rows.map(row => billReviewAmounts(row, totals(row)));
  const known = amounts.every(row => row.paid != null);
  // paidAt is a status timestamp, not a transaction timestamp. The existing
  // cumulative amountPaid does not establish the last payment amount.
  return { rows, excludedRows, gross: amounts.reduce((s, a) => s + a.gross, 0),
    paid: known ? amounts.reduce((s, a) => s + a.paid!, 0) : null,
    balance: known ? amounts.reduce((s, a) => s + a.balance!, 0) : null,
    lastPayment: null };
}
