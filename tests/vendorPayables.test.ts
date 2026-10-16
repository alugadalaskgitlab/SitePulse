import { describe, expect, it } from "vitest";
import { getBillFinancialTotals } from "../shared/vendorBillFinancialReport";
import { previousBillingSummary } from "../shared/vendorBillReview";
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
