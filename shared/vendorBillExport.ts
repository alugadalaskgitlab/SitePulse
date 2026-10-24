import {
  billPaymentPosition,
  filterFinancialBills,
  getBillFinancialTotals,
  recordedReportTds,
} from "./vendorBillFinancialReport";
import { billReviewAmounts, summarizeBillReview } from "./vendorBillReview";
import { buildSavedBillPresentationRows } from "./vendorBillPresentation";
import { recordedVendorTds } from "./vendorFinancialAccess";

const NOT_RECORDED = "Not recorded";
const UNKNOWN = "Unknown";

type VendorBillExportFilters = {
  vendor?: string;
  billType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  site?: string;
};

type VendorBillExportOptions = {
  generatedAt: string;
  generatedBy: string;
  paymentAccounts?: { id: string; name: string; type: string; source?: string }[];
  filters?: VendorBillExportFilters;
  sites?: { id: number; name: string }[];
  siteScope: string;
};

const recorded = (value: unknown) => value == null || value === "" ? NOT_RECORDED : value;
const finiteNumber = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

function componentRecord(
  storedValue: unknown,
  reason: unknown,
  category: string,
  source: string,
  deduction: boolean,
) {
  const numeric = finiteNumber(storedValue);
  if (numeric == null) return null;
  const signed = deduction ? -Math.abs(numeric) : numeric;
  return {
    amount: signed,
    storedAmount: storedValue,
    reason: recorded(reason),
    source,
    direction: deduction ? "deduction" : "credit",
    category,
  };
}

function firstRecorded(...values: unknown[]) {
  return values.find(value => value != null && value !== "");
}

function billAdjustmentCategory(label: string, amount: number): string {
  const text = label.toLowerCase();
  if (text.includes("breakdown")) return "breakdownDeduction";
  if (text.includes("hsd") || text.includes("diesel")) return "hsdRecovery";
  if (text.includes("advance")) return "advanceAdjustment";
  return amount < 0 ? "otherDebit" : "otherCredit";
}

function billAdjustments(bill: any) {
  const rows: Record<string, any[]> = {
    breakdownDeduction: [],
    hsdRecovery: [],
    otherDebit: [],
    advanceAdjustment: [],
    otherCredit: [],
  };
  const primaryAmount = finiteNumber(bill.adjustmentAmount);
  const primaryLabel = typeof bill.adjustmentLabel === "string" ? bill.adjustmentLabel : "";
  if (primaryAmount != null && (primaryAmount !== 0 || primaryLabel !== "")) {
    const category = billAdjustmentCategory(primaryLabel, primaryAmount);
    rows[category].push(componentRecord(
      primaryAmount,
      primaryLabel || NOT_RECORDED,
      category,
      "bill adjustment",
      primaryAmount < 0,
    ));
  }

  const additional = Array.isArray(bill.additionalAdjustments) ? bill.additionalAdjustments : [];
  for (const adjustment of additional) {
    const amount = finiteNumber(adjustment?.amount);
    if (amount == null) continue;
    const label = typeof adjustment?.label === "string" ? adjustment.label : "";
    const category = billAdjustmentCategory(label, amount);
    rows[category].push(componentRecord(
      amount,
      label || NOT_RECORDED,
      category,
      "bill adjustment",
      amount < 0,
    ));
  }
  return rows;
}

function hireAdjustmentRecords(bill: any) {
  const rows: Record<string, any[]> = {
    breakdownDeduction: [],
    hsdRecovery: [],
    otherDebit: [],
    advanceAdjustment: [],
    otherCredit: [],
  };
  for (const statement of Array.isArray(bill.hireStatements) ? bill.hireStatements : []) {
    const snapshot = statement.calculationSnapshot;
    const adjustments = snapshot?.adjustments || {};
    const financials = snapshot?.financials || {};
    const add = (
      category: string,
      key: string,
      reasonKey: string,
      fallback?: unknown,
    ) => {
      const value = firstRecorded(adjustments[key], financials[key], fallback);
      if (value == null) return;
      const row = componentRecord(
        value,
        firstRecorded(adjustments[reasonKey], financials[reasonKey]),
        category,
        `hire statement ${recorded(statement.id)}`,
        category !== "otherCredit",
      );
      if (row) rows[category].push(row);
    };
    add("breakdownDeduction", "breakdownDeduction", "breakdownDeductionReason",
      firstRecorded(snapshot?.deductionAmount, statement.deductionAmount));
    add("hsdRecovery", "hsdRecovery", "hsdRecoveryReason");
    add("otherDebit", "otherDebit", "otherDebitReason");
    add("advanceAdjustment", "advanceAdjustment", "advanceAdjustmentReason");
    add("otherCredit", "otherCredit", "otherCreditReason");
  }
  return rows;
}

function sumComponentRows(rows: any[]) {
  return rows.length ? rows.reduce((sum, row) => sum + row.amount, 0) : NOT_RECORDED;
}

function notVoidedBills(bills: any[], filters: any, sites: { id: number; name: string }[]) {
  return filterFinancialBills(bills, { ...filters, status: filters.status === "voided" ? "all" : filters.status }, sites);
}

function selectBills(
  bills: any[],
  filters: VendorBillExportFilters,
  sites: { id: number; name: string }[],
) {
  const billFilters = {
    scope: "all" as const,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    vendor: filters.vendor,
    status: filters.status,
    category: filters.billType,
    site: filters.site,
  };
  if (filters.status === "voided") {
    return filterFinancialBills(bills, { ...billFilters, status: "voided" }, sites);
  }
  const live = notVoidedBills(bills, billFilters, sites);
  if (filters.status && filters.status !== "all") return live;
  const voided = filterFinancialBills(bills, { ...billFilters, status: "voided" }, sites);
  const selected = new Map<number, any>();
  for (const bill of [...live, ...voided]) selected.set(Number(bill.id), bill);
  return Array.from(selected.values());
}

function filterLabel(value: string | undefined) {
  return !value || value === "all" ? "none" : value;
}

/**
 * Pure assembly for the complete vendor-bill export.
 *
 * Input bills are already loaded and authorised by the caller. This function
 * performs no database access or writes; monetary position fields come only
 * from the existing shared financial helpers, and frozen hire snapshots are
 * copied from the supplied bill records.
 */
export function buildVendorBillExport(
  authorisedBills: any[],
  options: VendorBillExportOptions,
) {
  const filters = options.filters || {};
  const sites = options.sites || [];
  const bills = selectBills(authorisedBills, filters, sites)
    .sort((a, b) => String(b.billDate || "").localeCompare(String(a.billDate || "")) || Number(a.id) - Number(b.id));
  const siteById = new Map(sites.map(site => [site.id, site.name]));

  const exportedBills = bills.map((bill: any) => {
    const totals = getBillFinancialTotals(bill);
    const amounts = billReviewAmounts(bill, totals);
    const position = billPaymentPosition(bill);
    const presentationRows = buildSavedBillPresentationRows(bill, totals);
    const storedBillAdjustments = billAdjustments(bill);
    const snapshotAdjustments = hireAdjustmentRecords(bill);
    const adjustments: Record<string, any[]> = {};
    for (const category of [
      "breakdownDeduction",
      "hsdRecovery",
      "otherDebit",
      "advanceAdjustment",
      "otherCredit",
    ]) {
      adjustments[category] = [
        ...snapshotAdjustments[category],
        ...storedBillAdjustments[category],
      ];
    }
    const grossPresentation = presentationRows.find(row => row.kind === "gross")?.amount;
    const hasGross = finiteNumber(bill.totalAmount) != null ||
      (Array.isArray(bill.hireStatements) && bill.hireStatements.some((statement: any) =>
        finiteNumber(statement.grossAmount ?? statement.calculationSnapshot?.financials?.grossHire ??
          statement.calculationSnapshot?.grossAmount) != null));
    const hasNet = finiteNumber(bill.netPayableAmount) != null || finiteNumber(bill.totalAmount) != null;
    const recordedTds = recordedVendorTds(bill);
    const tdsEvidence = recordedReportTds(bill);
    const items = Array.isArray(bill.items) ? bill.items : [];
    const statements = Array.isArray(bill.hireStatements) ? bill.hireStatements : [];
    const paymentAccount = options.paymentAccounts?.find(account => account.id === bill.paymentAccountKey);
    const paymentAccountSource = paymentAccount
      ? paymentAccount.source === "third_party"
        ? "third_party"
        : paymentAccount.source == null || paymentAccount.source === "own"
          ? "own"
          : NOT_RECORDED
      : NOT_RECORDED;

    return {
      identity: {
        billId: recorded(bill.id),
        billNumber: recorded(bill.billNo),
        billDate: recorded(bill.billDate),
        periodFrom: recorded(bill.periodFrom),
        periodTo: recorded(bill.periodTo),
        billType: recorded(bill.billType),
        category: recorded(bill.billType),
        site: bill.siteId == null ? NOT_RECORDED : siteById.get(Number(bill.siteId)) ?? NOT_RECORDED,
        siteId: recorded(bill.siteId),
        suppliedTo: items.length
          ? Array.from(new Set(items.map((item: any) => recorded(item.suppliedTo))))
          : [NOT_RECORDED],
      },
      vendor: {
        recordedName: recorded(bill.vendorName),
        linkedVendorMasterId: recorded(bill.vendorId),
        linkedVendorMasterName: bill.vendorId == null ? NOT_RECORDED : recorded(bill.linkedVendorName),
        linkStatus: bill.vendorId == null ? "unlinked" : "linked",
      },
      status: {
        current: recorded(bill.status),
        draft: { who: recorded(bill.authorUserId), when: recorded(bill.createdAt) },
        verified: { who: recorded(bill.verifiedBy), when: recorded(bill.verifiedAt) },
        approved: { who: recorded(bill.approvedBy), when: recorded(bill.approvedAt) },
        paid: { who: recorded(bill.paymentRecordedBy), when: recorded(bill.paidAt) },
        voided: bill.isCancelled === true,
        voidReason: recorded(bill.cancellationReason),
        voidedBy: recorded(bill.cancelledBy),
        voidedAt: recorded(bill.cancelledAt),
      },
      money: {
        gross: hasGross ? grossPresentation : NOT_RECORDED,
        payablesBasisGross: hasGross ? amounts.gross : NOT_RECORDED,
        breakdownDeduction: sumComponentRows(adjustments.breakdownDeduction),
        hsdRecovery: sumComponentRows(adjustments.hsdRecovery),
        otherDebit: sumComponentRows(adjustments.otherDebit),
        advanceAdjustment: sumComponentRows(adjustments.advanceAdjustment),
        otherCredit: sumComponentRows(adjustments.otherCredit),
        adjustmentDetails: adjustments,
        net: hasNet ? amounts.net : NOT_RECORDED,
        netSource: bill.netPayableAmount == null
          ? "Existing shared financial helper (legacy fallback)"
          : "Stored bill amount",
        tds: recordedTds ?? NOT_RECORDED,
        tdsEvidenceIncomplete: tdsEvidence.incomplete,
        amountPaid: amounts.paid ?? UNKNOWN,
        balance: !hasNet ? NOT_RECORDED : position.balance ?? UNKNOWN,
      },
      payments: [{
        recordType: "Bill-level cumulative total; no per-payment transaction record is stored",
        paymentDate: NOT_RECORDED,
        amount: amounts.paid ?? UNKNOWN,
        mode: recorded(bill.paymentMode),
        account: paymentAccount?.name ?? NOT_RECORDED,
        accountKey: recorded(bill.paymentAccountKey),
        accountSource: paymentAccountSource,
        paidBy: recorded(bill.paidBy),
        recordedBy: recorded(bill.paymentRecordedBy),
        statusRecordedAt: recorded(bill.paidAt),
        reference: recorded(bill.paymentRemarks),
      }],
      lineItems: items.map((item: any) => ({
        id: recorded(item.id),
        description: recorded(item.description),
        quantity: recorded(item.qty),
        unit: recorded(item.unit),
        rate: recorded(item.rate),
        amount: recorded(item.amount),
        boqReference: recorded(item.boqReference ?? item.boqItemId ?? item.boqItemName),
      })),
      hireStatements: statements.map((statement: any) => ({
        id: recorded(statement.id),
        periodFrom: recorded(statement.periodFrom),
        periodTo: recorded(statement.periodTo),
        status: recorded(statement.status),
        storedTotals: {
          grossAmount: recorded(statement.grossAmount),
          deductionAmount: recorded(statement.deductionAmount),
          netAmount: recorded(statement.netAmount),
          snapshotFinancials: statement.calculationSnapshot?.financials ?? NOT_RECORDED,
        },
        calculationSnapshot: statement.calculationSnapshot ?? NOT_RECORDED,
      })),
      provenance: {
        createdBy: recorded(bill.authorUserId),
        createdAt: recorded(bill.createdAt),
        hasFrozenCalculationSnapshot: statements.some((statement: any) =>
          statement.calculationSnapshot != null) ||
          items.some((item: any) => item.transportPricing != null || item.arrangementPricing != null),
      },
    };
  });

  const selectedAmounts = bills.map(bill => billReviewAmounts(bill, getBillFinancialTotals(bill)));
  const summarized = summarizeBillReview(selectedAmounts);
  const knownGross = bills.flatMap((bill, index) =>
    finiteNumber(bill.totalAmount) == null ? [] : [selectedAmounts[index].gross]);
  const knownNet = bills.flatMap((bill, index) =>
    finiteNumber(bill.netPayableAmount) == null && finiteNumber(bill.totalAmount) == null
      ? []
      : [selectedAmounts[index].net]);
  const knownPaid = selectedAmounts.flatMap(row => row.paid == null ? [] : [row.paid]);
  const knownBalances = bills.flatMap((bill, index) => {
    const hasRecordedNetBasis = finiteNumber(bill.netPayableAmount) != null || finiteNumber(bill.totalAmount) != null;
    const balance = selectedAmounts[index].balance;
    return hasRecordedNetBasis && balance != null ? [balance] : [];
  });
  const unknownGrossCount = bills.length - knownGross.length;
  const unknownNetCount = bills.length - knownNet.length;
  const unknownPaidCount = bills.length - knownPaid.length;
  const unknownBalanceCount = bills.length - knownBalances.length;
  const advanceAdjustmentRows = exportedBills.filter(bill => typeof bill.money.advanceAdjustment === "number");
  const advanceAdjustmentTotal = advanceAdjustmentRows.reduce((sum, bill) =>
    sum + bill.money.advanceAdjustment, 0);

  return {
    header: {
      generatedAt: options.generatedAt,
      generatedBy: options.generatedBy,
      billCount: exportedBills.length,
      filters: {
        vendor: filterLabel(filters.vendor),
        billType: filterLabel(filters.billType),
        status: filterLabel(filters.status),
        dateFrom: filters.dateFrom || "none",
        dateTo: filters.dateTo || "none",
        site: filters.site || "none",
      },
      siteScope: options.siteScope,
    },
    totals: {
      gross: unknownGrossCount === 0 ? summarized.gross : UNKNOWN,
      grossKnownSubtotal: knownGross.reduce((sum, value) => sum + value, 0),
      unknownGrossBillCount: unknownGrossCount,
      net: unknownNetCount === 0 ? summarized.net : UNKNOWN,
      netKnownSubtotal: knownNet.reduce((sum, value) => sum + value, 0),
      unknownNetBillCount: unknownNetCount,
      paid: unknownPaidCount === 0 ? knownPaid.reduce((sum, value) => sum + value, 0) : UNKNOWN,
      paidKnownSubtotal: knownPaid.reduce((sum, value) => sum + value, 0),
      knownPaidBillCount: knownPaid.length,
      unknownPaidBillCount: unknownPaidCount,
      balance: unknownBalanceCount === 0
        ? knownBalances.reduce((sum, value) => sum + value, 0)
        : UNKNOWN,
      balanceKnownSubtotal: knownBalances.reduce((sum, value) => sum + value, 0),
      knownBalanceBillCount: knownBalances.length,
      unknownBalanceBillCount: unknownBalanceCount,
      advanceAdjustments: advanceAdjustmentRows.length ? advanceAdjustmentTotal : NOT_RECORDED,
      advanceAdjustmentBillCount: advanceAdjustmentRows.length,
      advanceAdjustmentNotIncludedInPaid: true,
      voidedBillCount: exportedBills.filter(bill => bill.status.voided).length,
      unlinkedBillCount: exportedBills.filter(bill => bill.vendor.linkStatus === "unlinked").length,
    },
    bills: exportedBills,
  };
}
