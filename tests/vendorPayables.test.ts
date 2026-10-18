import { describe, expect, it } from "vitest";
import { getBillFinancialTotals } from "../shared/vendorBillFinancialReport";
import { billReviewAmounts, previousBillingSummary, summarizeBillReview } from "../shared/vendorBillReview";
import { projectVendorLedger, projectVendorPayables } from "../shared/vendorPayables";

const mahpalBills = [
  {
    id: 54,
    billNo: "HLC/VB/2026/0054",
    billDate: "2026-10-09",
    vendorId: 3,
    vendorName: "MAHIPAL KALPAGURI",
    linkedVendorName: "MAHIPAL KALPAGURI",
    status: "approved",
    totalAmount: 58000,
    netPayableAmount: 56840,
    amountPaid: 50000,
    items: [{ category: "equipment", amount: 58000 }],
  },
  {
    id: 55,
    billNo: "HLC/VB/2026/0055",
    billDate: "2026-10-09",
    vendorId: 3,
    vendorName: "MAHIPAL KALPAGURI",
    linkedVendorName: "MAHIPAL KALPAGURI",
    status: "approved",
    totalAmount: 56130,
    netPayableAmount: 5007.4,
    amountPaid: 0,
    items: [{ category: "equipment", amount: 56130 }],
  },
  {
    id: 80,
    billNo: "HLC/VB/2026/0062",
    billDate: "2026-08-08",
    vendorId: 3,
    vendorName: "MAHIPAL KALPAGURI",
    linkedVendorName: "MAHIPAL KALPAGURI",
    status: "draft",
    totalAmount: 25161.29,
    netPayableAmount: null,
    amountPaid: 0,
    items: [{ category: "equipment", amount: 25161.29 }],
  },
];

describe("vendor payables report projection", () => {
  it("uses existing bill helpers for vendor, company, and provisional totals", () => {
    const report = projectVendorPayables(mahpalBills);

    expect(report.vendors).toHaveLength(1);
    expect(report.vendors[0]).toMatchObject({
      vendorId: 3,
      vendorName: "MAHIPAL KALPAGURI",
      count: 3,
      billed: 87008.69,
      paid: 50000,
      payableNow: 11847.4,
      comingUp: 25161.29,
      totalLiability: 37008.69,
      credits: 0,
      unknownPayments: 0,
      oldestUnpaid: "2026-08-08",
    });
    expect(report.totals).toEqual(expect.objectContaining({
      payableNow: 11847.4,
      comingUp: 25161.29,
      totalLiability: 37008.69,
    }));
    expect(report.vendors[0].bills.map(bill => bill.billNo)).toEqual([
      "HLC/VB/2026/0062",
      "HLC/VB/2026/0054",
      "HLC/VB/2026/0055",
    ]);
    expect(report.totals.payableNow + report.totals.comingUp).toBe(report.totals.totalLiability);
  });

  it("uses the existing period-overlap filter", () => {
    const report = projectVendorPayables(mahpalBills, {
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
    });
    expect(report.vendors[0].bills.map(bill => bill.billNo)).toEqual([
      "HLC/VB/2026/0054",
      "HLC/VB/2026/0055",
    ]);
    expect(report.vendors[0].count).toBe(2);
  });

  it("keeps unlinked bills under their exact typed name and outside all linked totals", () => {
    const unlinked = {
      id: 99,
      billNo: "HLC/VB/2026/0061",
      billDate: "2026-10-15",
      vendorId: null,
      vendorName: "RATNAM",
      status: "draft",
      totalAmount: 1200,
      netPayableAmount: 1200,
      amountPaid: 0,
      items: [{ category: "material", amount: 1200 }],
    };
    const report = projectVendorPayables([...mahpalBills, unlinked]);
    expect(report.unlinkedGroups).toHaveLength(1);
    expect(report.unlinkedGroups[0]).toMatchObject({ typedName: "RATNAM" });
    expect(report.totals).toMatchObject({ count: 3, totalLiability: 37008.69 });
    expect(report.vendors).toHaveLength(1);
  });

  it("marks totals when any payment is not established", () => {
    const report = projectVendorPayables([{
      id: 100,
      billNo: "VB-UNKNOWN",
      billDate: "2026-10-10",
      vendorId: 4,
      vendorName: "TYPED NAME",
      linkedVendorName: "Canonical Vendor",
      status: "draft",
      totalAmount: 1000,
      netPayableAmount: 1000,
      amountPaid: null,
      items: [{ category: "material", amount: 1000 }],
    }]);
    expect(report.vendors[0]).toMatchObject({
      vendorName: "Canonical Vendor",
      unknownPayments: 1,
      paid: 0,
      comingUp: 1000,
      totalLiability: 1000,
    });
  });

  it("explains the existing same-date higher-number exclusion without changing the prior rows", () => {
    const summary = previousBillingSummary(mahpalBills[0], mahpalBills, getBillFinancialTotals);
    expect(summary.rows.map(bill => bill.billNo)).toEqual(["HLC/VB/2026/0062"]);
    expect(summary.excludedRows.map(bill => bill.billNo)).toEqual(["HLC/VB/2026/0055"]);
  });

  it("keeps vendor payable amounts unchanged when a bill date is corrected and reorders only the ledger", () => {
    const correctedBills = mahpalBills.map(bill => bill.billNo === "HLC/VB/2026/0055"
      ? { ...bill, billDate: "2026-08-31" }
      : bill);
    const beforePayables = projectVendorPayables(mahpalBills);
    const afterPayables = projectVendorPayables(correctedBills);
    const beforeVendor = beforePayables.vendors[0];
    const afterVendor = afterPayables.vendors[0];
    expect(afterVendor).toMatchObject({
      billed: beforeVendor.billed,
      paid: beforeVendor.paid,
      payableNow: beforeVendor.payableNow,
      comingUp: beforeVendor.comingUp,
      totalLiability: beforeVendor.totalLiability,
    });
    expect(afterVendor.payableNow).toBe(11847.4);
    expect(afterVendor.totalLiability).toBe(37008.69);

    const beforeLedger = projectVendorLedger(mahpalBills[0], mahpalBills);
    const afterLedger = projectVendorLedger(correctedBills[0], correctedBills);
    expect(beforeLedger.map(row => row.bill.billNo)).toEqual([
      "HLC/VB/2026/0062", "HLC/VB/2026/0054", "HLC/VB/2026/0055",
    ]);
    expect(afterLedger.map(row => row.bill.billNo)).toEqual([
      "HLC/VB/2026/0062", "HLC/VB/2026/0055", "HLC/VB/2026/0054",
    ]);
    const amountsByBill = (rows: typeof beforeLedger) => rows
      .map(row => ({ billNo: row.bill.billNo, amounts: row.amounts }))
      .sort((a, b) => a.billNo.localeCompare(b.billNo));
    expect(amountsByBill(afterLedger)).toEqual(amountsByBill(beforeLedger));
    expect(afterLedger.at(-1)?.runningBalance).toBe(beforeLedger.at(-1)?.runningBalance);
    expect(correctedBills.find(bill => bill.billNo === "HLC/VB/2026/0055")).toMatchObject({
      totalAmount: 56130,
      netPayableAmount: 5007.4,
      amountPaid: 0,
    });
  });

  it("preserves the baseline ₹11,853.69 payable-now benchmark while correcting bill 0055's ledger date", () => {
    const baselineBills = mahpalBills.slice(0, 2).map(bill => bill.id === 55
      ? { ...bill, netPayableAmount: 5013.69 }
      : bill);
    const beforePayables = projectVendorPayables(baselineBills);
    const beforeLedger = projectVendorLedger(baselineBills[0], baselineBills);
    const correctedBills = baselineBills.map(bill => bill.id === 55
      ? { ...bill, billDate: "2026-08-31" }
      : bill);
    const afterPayables = projectVendorPayables(correctedBills);
    const afterLedger = projectVendorLedger(correctedBills[0], correctedBills);

    expect(beforePayables.vendors[0].payableNow).toBeCloseTo(11853.69, 2);
    expect(afterPayables.vendors[0].payableNow).toBeCloseTo(11853.69, 2);
    expect(afterPayables.vendors[0].billed).toBe(beforePayables.vendors[0].billed);
    expect(afterPayables.vendors[0].paid).toBe(beforePayables.vendors[0].paid);
    expect(afterPayables.vendors[0].totalLiability).toBe(beforePayables.vendors[0].totalLiability);
    expect(beforeLedger.map(row => row.bill.billNo)).toEqual([
      "HLC/VB/2026/0054", "HLC/VB/2026/0055",
    ]);
    expect(afterLedger.map(row => row.bill.billNo)).toEqual([
      "HLC/VB/2026/0055", "HLC/VB/2026/0054",
    ]);
    expect(afterLedger.at(-1)?.runningBalance).toBe(beforeLedger.at(-1)?.runningBalance);
  });

  it("keeps linked and unlinked billed/balance totals identical when three bills move to a new vendor", () => {
    const baselineBills = mahpalBills.slice(0, 2).map(bill => bill.id === 55
      ? { ...bill, netPayableAmount: 5013.69 }
      : bill);
    const movedBills = [
      { id: 201, billNo: "SYNTHETIC-201", billDate: "2026-10-10", vendorId: null, vendorName: "Bulk One", status: "approved", totalAmount: 10000, netPayableAmount: 10000, amountPaid: 1000, items: [{ category: "material", amount: 10000 }] },
      { id: 202, billNo: "SYNTHETIC-202", billDate: "2026-10-11", vendorId: null, vendorName: "Bulk Two", status: "approved", totalAmount: 20000, netPayableAmount: 20000, amountPaid: 2000, items: [{ category: "material", amount: 20000 }] },
      { id: 203, billNo: "SYNTHETIC-203", billDate: "2026-10-12", vendorId: null, vendorName: "Bulk Three", status: "draft", totalAmount: 5000, netPayableAmount: 5000, amountPaid: 500, items: [{ category: "material", amount: 5000 }] },
    ];
    const before = projectVendorPayables([...baselineBills, ...movedBills]);
    const unlinkedBefore = summarizeBillReview(before.unlinkedGroups.flatMap(group => group.amounts));
    const linkedBefore = before.totals;
    const after = projectVendorPayables([
      ...baselineBills,
      ...movedBills.map(bill => ({ ...bill, vendorId: 99, linkedVendorName: "NEW BULK PARTY" })),
    ]);
    const unlinkedAfter = summarizeBillReview(after.unlinkedGroups.flatMap(group => group.amounts));
    const linkedAfter = after.totals;
    const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
    const beforeBilled = unlinkedBefore.net + linkedBefore.billed;
    const afterBilled = unlinkedAfter.net + linkedAfter.billed;
    const beforeBalance = unlinkedBefore.net - unlinkedBefore.paid + linkedBefore.totalLiability;
    const afterBalance = unlinkedAfter.net - unlinkedAfter.paid + linkedAfter.totalLiability;

    expect({ billed: unlinkedBefore.net, balance: unlinkedBefore.net - unlinkedBefore.paid }).toEqual({ billed: 35000, balance: 31500 });
    expect({ billed: roundMoney(linkedBefore.billed), balance: roundMoney(linkedBefore.totalLiability) }).toEqual({ billed: 61853.69, balance: 11853.69 });
    expect({ billed: roundMoney(unlinkedAfter.net), balance: roundMoney(unlinkedAfter.net - unlinkedAfter.paid) }).toEqual({ billed: 0, balance: 0 });
    expect({ billed: roundMoney(linkedAfter.billed), balance: roundMoney(linkedAfter.totalLiability) }).toEqual({ billed: 96853.69, balance: 43353.69 });
    expect(roundMoney(beforeBilled)).toBe(roundMoney(afterBilled));
    expect(roundMoney(beforeBalance)).toBe(roundMoney(afterBalance));
    expect({ billed: roundMoney(afterBilled), balance: roundMoney(afterBalance) }).toEqual({ billed: 96853.69, balance: 43353.69 });

    const newVendor = after.vendors.find(vendor => vendor.vendorId === 99)!;
    expect(newVendor).toMatchObject({ count: 3, billed: 35000, paid: 3500, payableNow: 27000, comingUp: 4500 });
    expect(newVendor.billed).toBe(movedBills.reduce((sum, bill) => sum + bill.netPayableAmount, 0));
    expect(newVendor.paid).toBe(movedBills.reduce((sum, bill) => sum + bill.amountPaid, 0));
    expect(movedBills.map(bill => bill.vendorName)).toEqual(["Bulk One", "Bulk Two", "Bulk Three"]);

    const sampleBill = baselineBills.find(bill => bill.billNo === "HLC/VB/2026/0054")!;
    expect(billReviewAmounts(sampleBill, getBillFinancialTotals(sampleBill))).toMatchObject({ net: 56840, paid: 50000, balance: 6840 });
    expect(projectVendorPayables(baselineBills).vendors[0].payableNow).toBe(11853.69);
  });
});

describe("vendor ledger projection", () => {
  it("includes every linked status and accumulates in bill-date order", () => {
    const rows = projectVendorLedger(mahpalBills[0], mahpalBills);
    expect(rows.map(row => row.bill.billNo)).toEqual([
      "HLC/VB/2026/0062",
      "HLC/VB/2026/0054",
      "HLC/VB/2026/0055",
    ]);
    expect(rows.map(row => row.runningBalance)).toEqual([
      25161.29,
      32001.29,
      37008.69,
    ]);
  });

  it("keeps unlinked names separate from linked vendors and from other free-text spellings", () => {
    const current = { vendorId: null, vendorName: "RATNAM" };
    const rows = projectVendorLedger(current, [
      { ...mahpalBills[0], id: 101, vendorId: null, vendorName: "RATNAM" },
      { ...mahpalBills[0], id: 102, vendorId: null, vendorName: "RATNAM " },
      { ...mahpalBills[0], id: 103, vendorId: 3, vendorName: "RATNAM" },
    ]);
    expect(rows.map(row => row.bill.id)).toEqual([101]);
  });

  it("marks a running balance as estimated from the first bill with unknown payment evidence", () => {
    const unknown = {
      ...mahpalBills[0],
      id: 101,
      billNo: "UNKNOWN",
      billDate: "2026-10-10",
      amountPaid: null,
    };
    const rows = projectVendorLedger(unknown, [mahpalBills[0], unknown]);
    expect(rows[0].runningBalanceEstimated).toBe(false);
    expect(rows[1].runningBalanceEstimated).toBe(true);
  });
});
