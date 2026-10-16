import { filterFinancialBills, getBillFinancialTotals } from "./vendorBillFinancialReport";
import { billReviewAmounts, summarizeBillReview, vendorStatementBills } from "./vendorBillReview";

export type VendorPayablesFilters = {
  dateFrom?: string;
  dateTo?: string;
};

export type VendorPayablesSummary = {
  count: number;
  billed: number;
  paid: number;
  payableNow: number;
  comingUp: number;
  totalLiability: number;
  credits: number;
  unknownPayments: number;
  oldestUnpaid: string | null;
};

export type VendorPayablesVendorRow = VendorPayablesSummary & {
  vendorId: number;
  vendorName: string;
  bills: any[];
  amounts: ReturnType<typeof billReviewAmounts>[];
};

export type VendorPayablesUnlinkedGroup = {
  typedName: string;
  bills: any[];
  amounts: ReturnType<typeof billReviewAmounts>[];
};

export type VendorPayablesReport = {
  filteredBills: any[];
  vendors: VendorPayablesVendorRow[];
  unlinkedGroups: VendorPayablesUnlinkedGroup[];
  totals: VendorPayablesSummary;
};

function summarizeBills(bills: any[]): {
  summary: VendorPayablesSummary;
  amounts: ReturnType<typeof billReviewAmounts>[];
} {
  const amounts = bills.map(bill => billReviewAmounts(bill, getBillFinancialTotals(bill)));
  const summary = summarizeBillReview(amounts);
  const provisional = summarizeBillReview(amounts.filter(amount => amount.provisional));
  const comingUp = provisional.net - provisional.paid;
  const oldestUnpaid = bills
    .map((bill, index) => ({
      date: bill.billDate == null ? "" : String(bill.billDate).slice(0, 10),
      outstanding: amounts[index].outstanding,
    }))
    .filter(row => row.date && row.outstanding >= 0.005)
    .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;

  return {
    amounts,
    summary: {
      count: summary.count,
      billed: summary.net,
      paid: summary.paid,
      payableNow: summary.eligible,
      comingUp,
      totalLiability: summary.eligible + comingUp,
      credits: summary.credits,
      unknownPayments: summary.unknownPayments,
      oldestUnpaid,
    },
  };
}

function byBillDateAndId(a: any, b: any) {
  return String(a.billDate || "").localeCompare(String(b.billDate || "")) || Number(a.id) - Number(b.id);
}

/**
 * Presentation projection for the payables page. Input must already be
 * authorized and site-scoped. All per-bill amounts come from the established
 * financial helpers; unlinked bills remain separate from linked vendor totals.
 */
export function projectVendorPayables(bills: any[], filters: VendorPayablesFilters = {}): VendorPayablesReport {
  const filteredBills = filterFinancialBills(bills, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });

  const linkedGroups = new Map<number, any[]>();
  const unlinkedGroups = new Map<string, any[]>();
  for (const bill of filteredBills) {
    if (bill.vendorId == null) {
      const typedName = String(bill.vendorName ?? "");
      const group = unlinkedGroups.get(typedName) ?? [];
      group.push(bill);
      unlinkedGroups.set(typedName, group);
      continue;
    }
    const vendorId = Number(bill.vendorId);
    if (!Number.isSafeInteger(vendorId)) continue;
    const group = linkedGroups.get(vendorId) ?? [];
    group.push(bill);
    linkedGroups.set(vendorId, group);
  }

  const vendors = Array.from(linkedGroups, ([vendorId, groupBills]) => {
    const orderedBills = [...groupBills].sort(byBillDateAndId);
    const { summary, amounts } = summarizeBills(orderedBills);
    const linkedName = orderedBills.find(bill => typeof bill.linkedVendorName === "string" && bill.linkedVendorName.trim())?.linkedVendorName;
    return {
      ...summary,
      vendorId,
      vendorName: typeof linkedName === "string" ? linkedName.trim() : `Vendor #${vendorId} (linked name unavailable)`,
      bills: orderedBills,
      amounts,
    };
  }).sort((a, b) =>
    b.totalLiability - a.totalLiability || a.vendorName.localeCompare(b.vendorName)
  );

  const unlinked = Array.from(unlinkedGroups, ([typedName, groupBills]) => {
    const orderedBills = [...groupBills].sort(byBillDateAndId);
    const amounts = orderedBills.map(bill => billReviewAmounts(bill, getBillFinancialTotals(bill)));
    return { typedName, bills: orderedBills, amounts };
  }).sort((a, b) =>
    (a.typedName.trim() || "Unspecified vendor name").localeCompare(b.typedName.trim() || "Unspecified vendor name")
  );

  const linkedBills = vendors.flatMap(row => row.bills);
  const { summary } = summarizeBills(linkedBills);
  return { filteredBills, vendors, unlinkedGroups: unlinked, totals: summary };
}

export type VendorLedgerLine = {
  bill: any;
  amounts: ReturnType<typeof billReviewAmounts>;
  runningBalance: number;
  runningBalanceEstimated: boolean;
};

/** Full, read-only ledger order; unlinked rows group only on the exact typed name. */
export function projectVendorLedger(current: any, permittedBills: any[]): VendorLedgerLine[] {
  const bills = current?.vendorId != null
    ? vendorStatementBills(current, permittedBills)
    : permittedBills.filter(bill =>
      bill.vendorId == null && String(bill.vendorName ?? "") === String(current?.vendorName ?? "")
    ).sort(byBillDateAndId);

  let runningNet = 0;
  let runningPaid = 0;
  let runningBalanceEstimated = false;
  return bills.map(bill => {
    const amounts = billReviewAmounts(bill, getBillFinancialTotals(bill));
    runningNet += amounts.net;
    if (amounts.paid == null) runningBalanceEstimated = true;
    else runningPaid += amounts.paid;
    return {
      bill,
      amounts,
      runningBalance: runningNet - runningPaid,
      runningBalanceEstimated,
    };
  });
}
