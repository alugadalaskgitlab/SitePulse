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

import {
  buildBillingDailyRows,
  buildEquipmentHirePeriodTotals,
  buildSavedEquipmentHireBillOutput,
  exportEquipmentHireBill,
  exportEquipmentHireCalendar,
  type EquipmentHireExportData,
} from "../client/src/components/vendor-bills/EquipmentHireBillOutput";

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

  it("keeps canonical norm units separate and hides fuel-performance columns for contractor-scope fuel", () => {
    excelSheets.length = 0;
    exportEquipmentHireBill({ ...data, dieselResponsibility: "vendor", consumptionNorm: 3.5 }, rows, "xlsx");
    const activity = excelSheets.find(sheet => sheet.name === "Daily Activity")!.data;
    expect(activity[0]).toEqual(["Fuel / Diesel: Contractor Scope"]);
    expect(activity[1]).not.toContain("Diesel Issued");
    expect(activity[1]).not.toContain("Opening Tank");
    expect(activity[1]).not.toContain("Closing Tank");
    expect(activity[1]).not.toContain("Diesel Consumed");
    expect(activity[1]).not.toContain("Norm");

    excelSheets.length = 0;
    exportEquipmentHireBill({ ...data, dieselResponsibility: "hlc", consumptionNorm: 3.5 }, rows, "xlsx");
    const hlcActivity = excelSheets.find(sheet => sheet.name === "Daily Activity")!.data;
    expect(hlcActivity[0]).toContain("Norm");
    expect(hlcActivity[0]).not.toContain("Difference");
    expect(hlcActivity[0]).not.toContain("Actual Consumption | Master Norm");
    expect(hlcActivity[1]).toContain("3.5 L/Hr");
    expect(hlcActivity[2]).toContain("Tank Readings N/A");
  });

  it("sums only visible measurements while preserving unknown totals and zero values", () => {
    const totals = buildEquipmentHirePeriodTotals([
      rows[0],
      { date: "2026-01-11", status: "No Work", remarks: "No activity recorded", downtimeHours: 0 },
      {
        date: "2026-01-12",
        status: "Breakdown",
        remarks: "Maintenance",
        downtimeHours: 2,
        performance: {
          ...rows[0].performance!,
          key: "12",
          date: "2026-01-12",
          workingHours: 0,
          dieselIssued: 0,
          dieselConsumed: 0,
          expectedDiesel: 0,
          difference: 0,
          consumptionIncomplete: false,
          events: [{ ...rows[0].performance!.events[0], trips: 0 }],
        },
      },
    ]);
    expect(totals).toEqual({
      hours: 8,
      dieselIssued: 20,
      dieselConsumed: 25,
      expectedDiesel: 24,
      variance: 1,
      trips: 0,
      breakdownDays: 1,
      noActivityDays: 1,
    });
    expect(buildEquipmentHirePeriodTotals([
      { date: "2026-02-01", status: "No Work", remarks: "No activity recorded", downtimeHours: 0 },
    ])).toEqual({
      hours: null,
      dieselIssued: null,
      dieselConsumed: null,
      expectedDiesel: null,
      variance: null,
      trips: null,
      breakdownDays: 0,
      noActivityDays: 1,
    });
    expect(buildEquipmentHirePeriodTotals(rows, "vendor")).toMatchObject({
      hours: 8,
      dieselIssued: null,
      dieselConsumed: null,
      expectedDiesel: null,
      variance: null,
    });
  });

  it("exports a calendar-only file with totals and no bill summary", () => {
    excelSheets.length = 0;
    excelWrites.length = 0;
    exportEquipmentHireCalendar(data, rows, "xlsx");
    expect(excelSheets.map(sheet => sheet.name)).toEqual(["Daily Activity"]);
    expect(excelSheets[0].data).toContainEqual(["Period totals"]);
    expect(excelSheets[0].data).toContainEqual(["Total Hours", 8]);
    expect(excelSheets[0].data).not.toContainEqual(["Equipment Hire Bill Summary"]);
    expect(excelWrites).toEqual(["VB-EH-001-calendar.xlsx"]);

    tables.length = 0;
    pdfEvents.length = 0;
    exportEquipmentHireCalendar(data, rows, "pdf");
    expect(tables).toHaveLength(2);
    expect(tables[0].body).toContainEqual(["Total Hours", "8"]);
    expect(tables[1].head[0]).toContain("Status / Remarks");
    expect(pdfEvents).toContainEqual({ type: "save", value: "VB-EH-001-calendar.pdf" });
    expect(tables.flatMap(table => table.body.flat()).join("")).not.toContain("Bill Summary");
  });

  it("omits diesel totals and columns for contractor-scope calendar exports", () => {
    excelSheets.length = 0;
    exportEquipmentHireCalendar({ ...data, dieselResponsibility: "vendor" }, rows, "xlsx");
    const activity = excelSheets[0].data;
    expect(activity).not.toContainEqual(["Total Diesel Issued", 20]);
    expect(activity.find(row => row.includes("Date"))).not.toContain("Diesel Issued");
  });

  it("keeps incomplete tank readings unknown even when stale values are present", () => {
    const incompleteRow = {
      date: "2026-01-11",
      status: "Worked" as const,
      remarks: "Activity recorded",
      downtimeHours: 0,
      performance: {
        ...rows[0].performance!,
        key: "11",
        date: "2026-01-11",
        workingHours: 2,
        dieselIssued: 3,
        dieselConsumed: 99,
        expectedDiesel: 88,
        difference: 11,
        consumptionRate: 49.5,
        consumptionIncomplete: true,
      },
    };
    expect(buildEquipmentHirePeriodTotals([incompleteRow])).toMatchObject({
      hours: 2,
      dieselIssued: 3,
      dieselConsumed: null,
      expectedDiesel: 88,
      variance: null,
    });
    const zeroRow = {
      ...incompleteRow,
      date: "2026-01-12",
      performance: {
        ...incompleteRow.performance,
        key: "12",
        date: "2026-01-12",
        workingHours: 0,
        dieselIssued: 0,
        dieselConsumed: 0,
        expectedDiesel: 0,
        difference: 0,
        consumptionRate: 0,
        consumptionIncomplete: false,
      },
    };
    expect(buildEquipmentHirePeriodTotals([zeroRow])).toMatchObject({
      hours: 0,
      dieselIssued: 0,
      dieselConsumed: 0,
      expectedDiesel: 0,
      variance: 0,
    });

    excelSheets.length = 0;
    exportEquipmentHireCalendar(data, [incompleteRow], "xlsx");
    const activity = excelSheets[0].data;
    const renderedRow = activity.find(row => row[0] === "11 Jan 2026");
    expect(renderedRow).toBeDefined();
    expect(renderedRow).toContain("Tank Readings N/A");
    expect(renderedRow).not.toContain("99 L");
    expect(renderedRow).toContain("88 L");
    expect(renderedRow).not.toContain("Actual: 49.50");
  });

  it("decouples expected and norm from actual confirmation and displays distinct DPR tasks", () => {
    const activityRows = buildBillingDailyRows([{
      ...rows[0].performance!,
      consumptionIncomplete: true,
      dieselConsumed: null,
      expectedDiesel: 16,
      consumptionRate: null,
      consumptionRateUnit: "L/km",
      events: [
        { task: "Shoulder grading" },
        { task: "Shoulder grading" },
        { task: "Material shifting" },
        { task: " " },
      ] as any,
    }], "2026-01-10", "2026-01-10");
    expect(activityRows[0].remarks).toBe("Shoulder grading, Material shifting");
    expect(buildEquipmentHirePeriodTotals(activityRows)).toMatchObject({
      dieselConsumed: null,
      expectedDiesel: 16,
      variance: null,
    });

    excelSheets.length = 0;
    exportEquipmentHireCalendar({ ...data, consumptionNorm: 2.25 }, activityRows, "xlsx");
    const sheet = excelSheets[0].data;
    const headers = sheet.find(row => row.includes("Date"))!;
    const rendered = sheet.find(row => row[0] === "10 Jan 2026")!;
    expect(headers).toEqual(expect.arrayContaining(["Diesel Consumed", "Expected", "Norm", "Status / Remarks"]));
    expect(headers).not.toEqual(expect.arrayContaining(["Difference", "Actual Consumption | Master Norm"]));
    expect(rendered).toEqual(expect.arrayContaining([
      "Tank Readings N/A",
      "16 L",
      "2.25 L/Km",
      "Worked — Shoulder grading, Material shifting",
    ]));
    expect(sheet).toContainEqual(["Total Expected Diesel", 16]);
    expect(sheet.some(row => row[0] === "Total Variance")).toBe(false);
  });

  it("uses the master meter type for Norm when the entire period has no performance rows", () => {
    const noActivity = buildBillingDailyRows([], "2026-01-10", "2026-01-11");

    excelSheets.length = 0;
    exportEquipmentHireCalendar({ ...data, consumptionNorm: 3.5, meterType: "hour_meter" }, noActivity, "xlsx");
    let sheet = excelSheets[0].data;
    expect(sheet.find(row => row[0] === "10 Jan 2026")).toContain("3.5 L/Hr");

    excelSheets.length = 0;
    exportEquipmentHireCalendar({ ...data, consumptionNorm: 0.2, meterType: "odometer" }, noActivity, "xlsx");
    sheet = excelSheets[0].data;
    expect(sheet.find(row => row[0] === "10 Jan 2026")).toContain("0.2 L/Km");
  });

  it("keeps the master Norm unit when an hour-meter row has a trip-converted L/km usage unit", () => {
    const tripConvertedRows = buildBillingDailyRows([{
      ...rows[0].performance!,
      consumptionRateUnit: "L/km",
    }], "2026-01-10", "2026-01-10");
    excelSheets.length = 0;
    exportEquipmentHireCalendar({
      ...data,
      consumptionNorm: 3.5,
      meterType: "hour_meter",
    }, tripConvertedRows, "xlsx");
    const rendered = excelSheets[0].data.find(row => row[0] === "10 Jan 2026")!;
    expect(rendered).toContain("3.5 L/Hr");
    expect(rendered).not.toContain("3.5 L/Km");
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