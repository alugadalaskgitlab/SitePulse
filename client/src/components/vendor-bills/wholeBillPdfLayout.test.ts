import { describe, expect, it } from "vitest";
import { buildWholeBillPdf } from "./wholeBillExport";
import type { WholeBillSnapshot } from "./wholeBillSnapshot";

describe("whole bill PDF layout", () => {
  it("exports equipment hire as one portrait bill page without an Activity Statement", () => {
    const snapshot: WholeBillSnapshot = {
      companyName: "Acme Roads Pvt Ltd",
      companyShortName: "ABC",
      vendorName: "Vendor",
      vendorMasterDetails: {
        name: "Vendor",
        businessName: "Vendor Equipment Works",
        address: "17 Road, Jaipur",
        gstNumber: "08ABCDE1234F1Z5",
        contactPersonName: "Ramesh Sharma",
        contactPhone: "9876543210",
        panNumber: "ABCDE1234F",
        bankAccountName: "Vendor Equipment Works",
        bankName: "State Bank",
        bankAccountNumber: "1234567890",
        bankIfsc: "SBIN0000123",
      },
      billNo: "HLC/VB/2026/0064",
      billDate: "2026-10-01",
      periodFrom: "2026-08-01",
      periodTo: "2026-09-30",
      site: "Road Site",
      equipmentType: "Excavator",
      billType: "equipment",
      billTypeLabel: "Equipment hire",
      saved: true,
      status: "approved",
      generatedAt: "2026-10-01",
      sections: [
        {
          category: "equipment",
          groups: [{
            label: "Equipment",
            rows: [{
              date: "2026-08-01", category: "equipment", description: "RAW EQUIPMENT LINE TABLE",
              qty: 1, unit: "month", rate: 1, amount: 1,
            }],
            subtotal: 1,
          }],
          subtotal: 1,
        },
      ],
      calendars: [{
        equipmentName: "Equipment #49",
        equipmentType: "Excavator",
        periodFrom: "2026-08-01",
        periodTo: "2026-08-31",
        rows: [],
      }, {
        equipmentName: "Equipment #49",
        equipmentType: "Excavator",
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        rows: [],
      }],
      hireReviews: [],
      hireStatementDetails: [{
        equipmentName: "Equipment #49",
        equipmentType: "Excavator",
        masterReference: "EX-07",
        basis: "monthly",
        rate: 125_000,
        monthlyDivisorType: "30",
        monthlyDivisor: 30,
        periodFrom: "2026-08-01",
        periodTo: "2026-08-31",
        site: "Road Site",
        dieselNorm: 4.5,
        dieselNormUnit: "L/hr",
        grossHire: 34_032.26,
        breakdownDeduction: 5_000,
        grossBillAmount: 29_032.26,
        hsdRecovery: 0,
        otherDebit: 0,
        advanceAdjustment: 50_000,
        advanceAdjustmentDate: "2026-08-05",
        otherCredit: 0,
        gstRate: 0,
        gstAmount: 0,
        tdsRate: 2,
        tdsAmount: -3_080.65,
        netPayable: -20_967.74,
        months: [{
          label: "August 2026", from: "2026-08-01", to: "2026-08-31",
          daysBilled: 7, grossHire: 34_032.26, breakdownDeduction: 5_000,
          grossBillAmount: 29_032.26, advanceAdjustment: 50_000, netMonth: -23_000,
        }],
      }, {
        equipmentName: "Equipment #49",
        equipmentType: "Excavator",
        masterReference: "EX-07",
        basis: "monthly",
        rate: 125_000,
        monthlyDivisorType: "30",
        monthlyDivisor: 30,
        periodFrom: "2026-09-01",
        periodTo: "2026-09-30",
        site: "Road Site",
        dieselNorm: 4.5,
        dieselNormUnit: "L/hr",
        grossHire: 125_000,
        breakdownDeduction: 0,
        grossBillAmount: 125_000,
        hsdRecovery: 0,
        otherDebit: 0,
        advanceAdjustment: 60_000,
        advanceAdjustmentDate: "2026-09-02",
        otherCredit: 0,
        gstRate: 0,
        gstAmount: 0,
        tdsRate: 2,
        tdsAmount: -3_080.65,
        netPayable: 65_000,
        months: [{
          label: "September 2026", from: "2026-09-01", to: "2026-09-30",
          daysBilled: 30, grossHire: 125_000, breakdownDeduction: 0,
          grossBillAmount: 125_000, advanceAdjustment: 60_000, netMonth: 62_500,
        }],
      }],
      financialRows: [
        { label: "Gross hire", amount: 159_032.26 },
        { label: "Breakdown deduction", amount: -5_000 },
        { label: "Gross bill amount", amount: 154_032.26 },
        { label: "Advance adjustment", amount: -110_000 },
        { label: "Hose crimping", amount: -5_000 },
        { label: "Operator unavailable", amount: -10_000 },
        { label: "IT TDS @ 2%", amount: -3_080.65 },
        { label: "NET PAYABLE", amount: 25_951.61 },
      ],
      totals: {
        subtotal: 44_032.26,
        gst: [],
        totalGst: 0,
        adjustments: [],
        tds: { label: "IT TDS @ 2%", amount: -3_080.65 },
        netPayable: 25_951.61,
      },
    };
    const pdf = buildWholeBillPdf(snapshot);
    const pages = (pdf as any).internal.pages as string[][];

    expect(pdf.getNumberOfPages()).toBe(1);
    pdf.setPage(1);
    expect(pdf.internal.pageSize.getWidth()).toBeLessThan(pdf.internal.pageSize.getHeight());
    expect(pages[1].join("")).toContain("EQUIPMENT HIRE BILL");
    expect(pdf.output()).toContain("Acme Roads Pvt Ltd");
    expect(pdf.output()).toContain("Prepared · ABC");
    expect(pages[1].join("")).toContain("Excavator");
    expect(pages[1].join("")).toContain("EX-07");
    expect(pages[1].join("")).not.toContain("Equipment #49");
    expect(pdf.output()).not.toContain("ACTIVITY STATEMENT");
    expect(pdf.output()).not.toContain("MATERIAL TABLE");
    expect(pdf.output()).not.toContain("RAW EQUIPMENT LINE TABLE");
    expect(pdf.output()).toContain("\\(Rs. 20,967.74\\)");
    expect(pdf.output()).toContain("Rs. 65,000.00");
    expect(pdf.output()).toContain("Rs. 44,032.26");
    expect(pdf.output()).toContain("Rs. 25,951.61");
    expect(pdf.output()).toContain("3,080.65");
    expect(pdf.output()).toContain("NET PAYABLE");
    for (const detail of [
      "Business name: Vendor Equipment Works",
      "Address: 17 Road, Jaipur",
      "GSTIN: 08ABCDE1234F1Z5",
      "Contact person: Ramesh Sharma",
      "Phone: 9876543210",
      "PAN: ABCDE1234F",
      "Bank account name: Vendor Equipment Works",
      "Bank name: State Bank",
      "Account number: 1234567890",
      "IFSC: SBIN0000123",
    ]) {
      expect(pdf.output()).toContain(detail);
    }

    const nameOnlyPdf = buildWholeBillPdf({
      ...snapshot,
      vendorMasterDetails: { name: "Vendor" },
    }).output();
    for (const label of ["Business name:", "Address:", "GSTIN:", "Contact person:", "Phone:", "PAN:", "Bank account name:", "Bank name:", "Account number:", "IFSC:"]) {
      expect(nameOnlyPdf).not.toContain(label);
    }
  });
});
