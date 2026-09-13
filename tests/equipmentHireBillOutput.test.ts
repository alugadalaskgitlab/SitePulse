import { describe, expect, it, vi } from "vitest";

const pdfEvents = vi.hoisted(() => [] as Array<{ type: string; value?: unknown }>);
const tables = vi.hoisted(() => [] as Array<any>);
const excelSheets = vi.hoisted(() => [] as Array<{ name: string; data: unknown[][] }>);
const excelWrites = vi.hoisted(() => [] as string[]);

vi.mock("jspdf", () => ({
  jsPDF: class MockPdf {
    setFontSize(value: number) { pdfEvents.push({ type: "font", value }); }
    text(value: string) { pdfEvents.push({ type: "text", value }); }
    addPage() { pdfEvents.push({ type: "page" }); }
    save(value: string) { pdfEvents.push({ type: "save", value }); }
  },
}));
vi.mock("jspdf-autotable", () => ({ default: vi.fn((_doc: unknown, options: any) => tables.push(options)) }));
vi.mock("xlsx", () => ({
  utils: {
    book_new: () => ({}),
    aoa_to_sheet: (data: unknown[][]) => ({ data }),
    book_append_sheet: (_book: unknown, sheet: { data: unknown[][] }, name: string) => excelSheets.push({ name, data: sheet.data }),
  },
  writeFile: (_book: unknown, fileName: string) => excelWrites.push(fileName),
}));

import { buildBillingDailyRows, buildSavedEquipmentHireBillOutput, exportEquipmentHireBill, type EquipmentHireExportData } from "../client/src/components/vendor-bills/EquipmentHireBillOutput";

const data: EquipmentHireExportData = {
  billNo: "VB/EH/001", vendorName: "Acme Hire", equipmentName: "Excavator · EX-01", projectSite: "North Site",
  periodFrom: "2026-01-10", periodTo: "2026-01-11", hireBasis: "Daily", rate: 5000,
  grossHire: 10000, breakdownDeduction: 1000, hsdRecovery: 250, otherDebit: 100,
  otherDebitReason: "Damage", advanceAdjustment: 500, advanceAdjustmentReason: "Advance",
  otherCredit: 50, otherCreditReason: "Rounding", taxableAmount: 8200, gstRate: 0, gstAmount: 0, invoiceTotal: 8200, tdsRate: 2, tdsAmount: 164.0,
  netPayable: 8036, paid: 3000,
};

const rows = buildBillingDailyRows([{
  key: "10", date: "2026-01-10", projectSite: "North Site", openingMeter: 10, closingMeter: 18,
  workingHours: 8, workingHoursIncomplete: false, startTime: "08:00", endTime: "16:00",
  multipleTimeSegments: false, clockDuration: 8, clockDurationIncomplete: false, dieselIssued: 20,
  openingTank: 30, closingTank: 25, dieselConsumed: 25, expectedDiesel: 24, difference: 1,
  consumptionRate: 3.125, consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
}], "2026-01-10", "2026-01-11", [{ businessDate: "2026-01-11", description: "Hydraulic hose", downtimeHours: 4 }]);

describe("equipment hire bill output", () => {
  it("reuses Equipment Performance values and adds billing-only no-work/breakdown status", () => {
    expect(rows).toHaveLength(2);
    expect(rows[0].performance?.projectSite).toBe("North Site");
    expect(rows[0].status).toBe("Worked");
    expect(rows[1]).toMatchObject({ status: "Breakdown", downtimeHours: 4, remarks: expect.stringContaining("Hydraulic hose") });
  });

  it("exports a PDF with the financial summary on page one and daily activity on page two", () => {
    pdfEvents.length = 0;
    tables.length = 0;
    exportEquipmentHireBill(data, rows, "pdf");
    expect(tables).toHaveLength(2);
    expect(tables[0].body).toEqual(expect.arrayContaining([["Vendor", "Acme Hire"], ["Project / Site", "North Site"], ["Taxable / Bill Amount", "Rs. 8,200.00"], ["GST @ 0%", "+ Rs. 0.00"], ["Invoice Total", "Rs. 8,200.00"], ["NET PAYABLE", "Rs. 8,036.00"], ["Balance This Bill", "Rs. 5,036.00"]]));
    expect(tables.flatMap(table => table.body.flat()).join("")).not.toMatch(/[₹−×]/);
    expect(tables[1].head[0]).toContain("Project / Site");
    expect(tables[1].body).toHaveLength(2);
    expect(pdfEvents.findIndex(event => event.type === "page")).toBeGreaterThan(pdfEvents.findIndex(event => event.value === "EQUIPMENT HIRE VENDOR BILL"));
    expect(pdfEvents).toContainEqual({ type: "save", value: "VB-EH-001.pdf" });
  });

  it("exports separate Bill Summary and Daily Activity Excel sheets with the same calculations", () => {
    excelSheets.length = 0;
    excelWrites.length = 0;
    exportEquipmentHireBill(data, rows, "xlsx");
    expect(excelSheets.map(sheet => sheet.name)).toEqual(["Bill Summary", "Daily Activity"]);
    expect(excelSheets[0].data).toEqual(expect.arrayContaining([["Equipment Hire Bill Summary"], ["NET PAYABLE", "₹8,036.00"], ["Paid", "₹3,000.00"]]));
    expect(excelSheets[1].data[0]).toContain("Status / Remarks");
    expect(excelSheets[1].data).toHaveLength(3);
    expect(excelWrites).toEqual(["VB-EH-001.xlsx"]);
  });

  it("keeps canonical L/hr norms and hides fuel-performance columns for contractor-scope fuel", () => {
    excelSheets.length = 0;
    exportEquipmentHireBill({ ...data, dieselResponsibility: "vendor", consumptionNorm: 3.5 }, rows, "xlsx");
    const activity = excelSheets.find(sheet => sheet.name === "Daily Activity")!.data;
    expect(activity[0]).toEqual(["Fuel / Diesel: Contractor Scope"]);
    expect(activity[1]).not.toContain("Diesel Issued");
    expect(activity[1]).not.toContain("Opening Tank");
    expect(activity[1]).not.toContain("Closing Tank");
    expect(activity[1]).not.toContain("Diesel Consumed");
    expect(activity[1]).not.toContain("Actual Consumption | Master Norm");

    excelSheets.length = 0;
    exportEquipmentHireBill({ ...data, dieselResponsibility: "hlc", consumptionNorm: 3.5 }, rows, "xlsx");
    const hlcActivity = excelSheets.find(sheet => sheet.name === "Daily Activity")!.data;
    expect(hlcActivity[0]).toContain("Actual Consumption | Master Norm");
    expect(hlcActivity[1]).toContain("Actual: 3.13 L/hr | Master Norm: 3.5 L/hr");
    expect(hlcActivity[2]).toContain("Tank Readings N/A");
  });

  it("uses the immutable storage-shaped snapshot and never double-counts aggregate statement deductions", () => {
    const output = buildSavedEquipmentHireBillOutput({
      id: 44, billNo: "VB-EH-044", vendorName: "ACME HIRE", billType: "equipment", periodFrom: "2026-01-10", periodTo: "2026-01-11",
      tdsRate: 2, netPayableAmount: 8036, amountPaid: 3000,
      hireStatements: [{
        equipmentId: 9, periodFrom: "2026-01-10", periodTo: "2026-01-11", billingBasis: "daily", rate: 5000,
        grossAmount: 10000, deductionAmount: 1850, // aggregate: 1000 + 250 + 100 + 500 - 50
        calculationSnapshot: {
          projectSite: "North Site",
          performanceDailyRows: [rows[0].performance],
          sourceEvidence: { activities: [], maintenance: [{ date: "2026-01-11", description: "Hydraulic hose", downtimeHours: 4 }] },
          adjustments: {
            breakdownDeduction: 1000, hsdRecovery: 250, otherDebit: 100, otherDebitReason: "Damage",
            advanceAdjustment: 500, advanceAdjustmentReason: "Advance", otherCredit: 50, otherCreditReason: "Rounding",
          },
        },
      }],
    });
    expect(output?.data).toMatchObject({ breakdownDeduction: 1000, hsdRecovery: 250, netPayable: 8036, paid: 3000, projectSite: "North Site" });
    expect(output?.rows[0].performance?.projectSite).toBe("North Site");
    expect(output?.rows[1]).toMatchObject({ status: "Breakdown", downtimeHours: 4 });
  });

  it("keeps a legacy paid hire bill paid in full when amountPaid is absent", () => {
    const output = buildSavedEquipmentHireBillOutput({
      billNo: "VB-EH-LEGACY", vendorName: "ACME HIRE", billType: "equipment",
      periodFrom: "2026-01-10", periodTo: "2026-01-11", status: "paid", amountPaid: null,
      hireStatements: [{
        equipmentId: 9, periodFrom: "2026-01-10", periodTo: "2026-01-11", billingBasis: "daily", rate: 5000,
        grossAmount: 10000, deductionAmount: 1000,
        calculationSnapshot: { adjustments: { breakdownDeduction: 1000 }, financials: { grossHire: 10000, breakdownDeduction: 1000, tdsRate: 2 } },
      }],
    });
    expect(output?.data.netPayable).toBe(8820);
    expect(output?.data.paid).toBe(8820);
  });
});