import { describe, expect, it } from "vitest";
import { buildSavedBillPresentationRows } from "../shared/vendorBillPresentation";
import { hireReviewTable, MONTHLY_BILL_HEADERS, projectHireReview } from "../shared/vendorBillLayout";

describe("saved vendor bill presentation", () => {
  it("shows an old hand-entered driver-unavailable reason as Other debit without inventing exception evidence", () => {
    const bill = {
      totalAmount: 58_000,
      tdsRate: 2,
      hireStatements: [{
        id: 41,
        equipmentId: 7,
        equipmentName: "Excavator",
        grossAmount: 60_000,
        netAmount: 58_000,
        calculationSnapshot: {
          grossAmount: 60_000,
          financials: {
            grossHire: 60_000,
            breakdownDeduction: 0,
            hsdRecovery: 0,
            otherDebit: 2_000,
            advanceAdjustment: 0,
            otherCredit: 0,
          },
          adjustments: {
            otherDebit: 2_000,
            otherDebitReason: "DRIVER UNAVAILABLE",
          },
          exceptions: [{
            exceptionType: "other_debit",
            deductionAmount: 2_000,
            reason: "DRIVER UNAVAILABLE",
          }],
        },
      }],
      items: [{ source: "hire_statement", hireStatementId: 41, amount: 58_000 }],
    };
    const rows = buildSavedBillPresentationRows(bill, {
      totalAmount: 58_000,
      gstRows: [],
      primaryAdjustment: 0,
      additional: [],
      tds: 1_160,
      netTotal: 56_840,
    });

    expect(rows.map(row => [row.label, row.amount])).toEqual([
      ["Gross", 60_000],
      ["Other debit", -2_000],
      ["IT TDS @ 2%", -1_160],
      ["NET PAYABLE", 56_840],
    ]);
    expect(rows[1].reason).toContain("Date: Not recorded");
    expect(rows[1].reason).toContain("Decision: Not recorded");
    expect(rows[1].reason).toContain("Reason: DRIVER UNAVAILABLE");
    expect(rows.some(row => row.label.toLowerCase().includes("operator"))).toBe(false);
  });

  it("keeps the Not Recorded monthly count separate from gross amount", () => {
    const review = projectHireReview({
      grossAmount: 1_000,
      periodFrom: "2026-06-01",
      periodTo: "2026-06-01",
      billingBasis: "monthly",
      rate: 1_000,
      monthlyDivisorType: "30",
      calculationSnapshot: {
        grossAmount: 1_000,
        terms: { billingBasis: "monthly", rate: 1_000, monthlyDivisorType: "30" },
        workingSheet: [],
      },
    });
    const row = hireReviewTable(review)[0];
    expect(MONTHLY_BILL_HEADERS[7]).toBe("Not Recorded");
    expect(MONTHLY_BILL_HEADERS[8]).toBe("Gross Amount (₹)");
    expect(row[7]).toBe(1);
    expect(row[8]).toBe(1_000);
  });
});
