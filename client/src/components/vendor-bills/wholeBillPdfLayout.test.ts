import { describe, expect, it } from "vitest";
import { buildWholeBillPdf } from "./wholeBillExport";
import type { WholeBillSnapshot } from "./wholeBillSnapshot";

describe("whole bill PDF layout", () => {
  it("exports an equipment bill as one portrait bill page and keeps other categories landscape", () => {
    const snapshot: WholeBillSnapshot = {
      companyName: "Highlane Constructions",
      vendorName: "Vendor",
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
        {
          category: "material",
          groups: [{
            label: "Road Site",
            rows: [{
              date: "2026-08-01", category: "material", description: "MATERIAL TABLE",
              qty: 1, unit: "MT", rate: 1, amount: 1, details: { "Always empty": "" },
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
    const pdf = buildWholeBillPdf({
      ...snapshot,
      sections: snapshot.sections.filter(section => section.category === "equipment"),
    });
    const pages = (pdf as any).internal.pages as string[][];

    pdf.setPage(1);
    expect(pdf.internal.pageSize.getWidth()).toBeLessThan(pdf.internal.pageSize.getHeight());
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pages[1].join("")).toContain("EQUIPMENT HIRE BILL");
    expect(pages[1].join("")).toContain("Excavator");
    expect(pages[1].join("")).toContain("EX-07");
    expect(pages[1].join("")).toContain("Prepared · HLC");
    expect(pages[1].join("")).toContain("Received · Vendor");
    expect(pages[1].join("")).not.toContain("Equipment #49");
    expect(pages[1].join("")).not.toContain("ACTIVITY STATEMENT");
    expect(pages[1].join("")).not.toContain("MATERIAL TABLE");
    expect(pdf.output()).not.toContain("RAW EQUIPMENT LINE TABLE");
    expect(pdf.output()).not.toContain("ACTIVITY STATEMENT");
    expect(pdf.output()).toContain("20,967.74");
    expect(pdf.output()).toContain("Rs. 65,000.00");
    expect(pdf.output()).toContain("Rs. 44,032.26");
    expect(pdf.output()).toContain("Rs. 25,951.61");
    expect(pdf.output()).toContain("3,080.65");
    expect(pdf.output()).toContain("NET PAYABLE");

    const mixedPdf = buildWholeBillPdf(snapshot);
    const mixedPages = (mixedPdf as any).internal.pages as string[][];
    expect(mixedPdf.getNumberOfPages()).toBe(2);
    mixedPdf.setPage(2);
    expect(mixedPdf.internal.pageSize.getWidth()).toBeGreaterThan(mixedPdf.internal.pageSize.getHeight());
    expect(mixedPages[2].join("")).toContain("MATERIAL TABLE");
    expect(mixedPages[2].join("")).not.toContain("Always empty");
    expect(mixedPdf.output()).not.toContain("ACTIVITY STATEMENT");
  });
});
