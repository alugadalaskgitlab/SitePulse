import { describe, expect, it, vi } from "vitest";

const pdfEvents = vi.hoisted(() => [] as Array<{ type: string; value?: unknown; args?: unknown[] }>);
const tables = vi.hoisted(() => [] as Array<any>);
const excelSheets = vi.hoisted(() => [] as Array<{ name: string; data: unknown[][] }>);
const excelWrites = vi.hoisted(() => [] as string[]);

vi.mock("jspdf", () => ({
  jsPDF: class MockPdf {
    pageCount = 1;
    lastAutoTable = { finalY: 0 };
    internal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };
    setFontSize(value: number) { pdfEvents.push({ type: "font", value }); }
    setFont(_family: string, _style?: string) {}
    setTextColor(..._values: number[]) {}
    setFillColor(..._values: number[]) {}
    setDrawColor(..._values: number[]) {}
    setLineWidth(_value: number) {}
    rect(...args: unknown[]) { pdfEvents.push({ type: "rect", args }); }
    line(..._values: unknown[]) {}
    splitTextToSize(value: string) { return [value]; }
    text(value: string | string[]) { pdfEvents.push({ type: "text", value }); }
    getImageProperties(_image: string) { return { width: 100, height: 80 }; }
    addImage(image: string, ...args: unknown[]) { pdfEvents.push({ type: "image", value: image, args }); }
    addPage() { this.pageCount += 1; pdfEvents.push({ type: "page" }); }
    getNumberOfPages() { return this.pageCount; }
    setPage(_page: number) {}
    save(value: string) { pdfEvents.push({ type: "save", value }); }
  },
}));
vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: any, options: any) => {
    tables.push(options);
    doc.lastAutoTable = { finalY: Number(options.startY || 0) + 10 };
  }),
}));
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
import { projectHireReview } from "../shared/vendorBillLayout";

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

  it("exports a portrait bill page without embedding the Activity Statement", () => {
    pdfEvents.length = 0;
    tables.length = 0;
    exportEquipmentHireBill(data, rows, "pdf");
    expect(tables).toHaveLength(2);
    expect(tables[0].head[0]).toEqual(["Month", "Days billed", "Gross hire", "Breakdown", "Gross bill amount", "Advance", "Net—month"]);
    expect(tables[1].body.flat()).toEqual(expect.arrayContaining(["Gross bill amount", "NET PAYABLE", "Rs. 8,036.00"]));
    expect(tables.flatMap(table => table.body.flat()).join("")).not.toMatch(/[₹−×]/);
    expect(pdfEvents.some(event => event.type === "text" && event.value === "EQUIPMENT HIRE BILL")).toBe(true);
    expect(pdfEvents.some(event => event.type === "text" && event.value === "ACTIVITY STATEMENT")).toBe(false);
    expect(pdfEvents.some(event => event.type === "page")).toBe(false);
    expect(pdfEvents.some(event => event.type === "rect" && event.args?.join(",") === "10,8,15,12")).toBe(true);
    expect(pdfEvents.some(event => event.type === "text" && event.value === "HLC")).toBe(true);
    expect(pdfEvents).toContainEqual({ type: "save", value: "VB-EH-001.pdf" });
  });

  it("sums recorded month values and ignores missing hours, diesel, and consumption rates", () => {
    const base = rows[0].performance!;
    const partialRows = [
      {
        ...rows[0],
        date: "2026-01-10",
        performance: {
          ...base, key: "partial-1", date: "2026-01-10", workingHours: 8, workingHoursIncomplete: false,
          dieselIssued: 20, dieselConsumed: 22, openingTank: 30, closingTank: 25,
          consumptionRate: 2.75, consumptionIncomplete: false,
        },
      },
      {
        ...rows[0],
        date: "2026-01-11",
        performance: {
          ...base, key: "partial-2", date: "2026-01-11", workingHours: 4, workingHoursIncomplete: false,
          dieselIssued: 10, dieselConsumed: 20, openingTank: 25, closingTank: 20,
          consumptionRate: 5, consumptionIncomplete: false,
        },
      },
      {
        ...rows[0],
        date: "2026-01-12",
        performance: {
          ...base, key: "partial-3", date: "2026-01-12", workingHours: null, workingHoursIncomplete: true,
          dieselIssued: null, dieselConsumed: null, openingTank: null, closingTank: null,
          consumptionRate: null, consumptionIncomplete: true,
        },
      },
    ] as typeof rows;
    pdfEvents.length = 0;
    tables.length = 0;

    exportEquipmentHireCalendar(data, partialRows, "pdf");

    const totalRow = tables[0].body.at(-1);
    expect(totalRow[4]).toBe("12:00");
    expect(totalRow[10]).toBe("30.00 L");
    expect(totalRow[11]).toBe("3.88 L/hr");
  });

  it("embeds the configured logo in both the bill and standalone Activity Statement PDFs", () => {
    const logoDataUrl = "data:image/png;base64,bG9nbw==";
    pdfEvents.length = 0;
    exportEquipmentHireBill({ ...data, logoDataUrl }, rows, "pdf");
    expect(pdfEvents).toContainEqual({ type: "image", value: logoDataUrl, args: ["PNG", 10, 8, 15, 12] });
    expect(pdfEvents.some(event => (event.type === "rect" && event.args?.join(",") === "10,8,15,12") || event.value === "HLC")).toBe(false);
    expect(pdfEvents.some(event => event.type === "text" && event.value === "Highlane Constructions")).toBe(true);

    pdfEvents.length = 0;
    exportEquipmentHireCalendar({ ...data, logoDataUrl }, rows, "pdf");
    expect(pdfEvents).toContainEqual({ type: "image", value: logoDataUrl, args: ["PNG", 10, 8, 15, 12] });
    expect(pdfEvents.some(event => (event.type === "rect" && event.args?.join(",") === "10,8,15,12") || event.value === "HLC")).toBe(false);
    expect(pdfEvents.some(event => event.type === "text" && event.value === "Highlane Constructions")).toBe(true);
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

  it("keeps canonical norm units and full raw fuel columns in Excel for either responsibility", () => {
    excelSheets.length = 0;
    exportEquipmentHireBill({ ...data, dieselResponsibility: "vendor", consumptionNorm: 3.5 }, rows, "xlsx");
    const activity = excelSheets.find(sheet => sheet.name === "Daily Activity")!.data;
    expect(activity[0]).toEqual(["Fuel / Diesel: Contractor Scope"]);
    expect(activity[1]).toContain("Diesel Issued");
    expect(activity[1]).toContain("Opening Tank");
    expect(activity[1]).toContain("Closing Tank");
    expect(activity[1]).toContain("Diesel Consumed");
    expect(activity[1]).toContain("Expected");
    expect(activity[1]).toContain("Difference");
    expect(activity[1]).toContain("Norm");

    excelSheets.length = 0;
    exportEquipmentHireBill({ ...data, dieselResponsibility: "hlc", consumptionNorm: 3.5 }, rows, "xlsx");
    const hlcActivity = excelSheets.find(sheet => sheet.name === "Daily Activity")!.data;
    expect(hlcActivity[0]).toContain("Norm");
    expect(hlcActivity[0]).toContain("Difference");
    expect(hlcActivity[0]).toContain("Trips");
    expect(hlcActivity[0]).toContain("Consumption Rate");
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
    expect(tables).toHaveLength(1);
    expect(tables[0].head[0]).toEqual([
      "Date", "Site", "Open meter", "Close meter", "Working hrs (h:min)",
      "Start time", "End time", "Clock duration", "Tank open", "Tank close",
      "Diesel issued", "Consumption (L/hr)", "Status",
    ]);
    expect(tables[0].head[0]).not.toContain("Expected");
    expect(tables[0].head[0]).not.toContain("Difference");
    expect(tables[0].head[0]).not.toContain("Norm");
    expect(tables[0].body.flat().join(" ")).toContain("January 2026 total");
    expect(tables[0].body.flat().join(" ")).toContain("Breakdown");
    expect(tables[0].body[0][4]).toBe("8:00");
    expect(tables[0].body.at(-1)?.[4]).toBe("8:00");
    expect(tables[0].body.at(-1)?.[10]).toBe("20.00 L");
    expect(tables[0].body.at(-1)?.[11]).toBe("3.13 L/hr");
    expect(pdfEvents.some(event => event.type === "text" && String(event.value).includes("dip/meter incomplete"))).toBe(false);
    expect(pdfEvents.some(event => event.type === "text" && event.value === "ACTIVITY STATEMENT")).toBe(true);
    expect(pdfEvents).toContainEqual({ type: "save", value: "VB-EH-001-calendar.pdf" });
    expect(tables.flatMap(table => table.body.flat()).join("")).not.toContain("Bill Summary");
  });

  it("marks incomplete worked activity for review without mislabeling breakdown days", () => {
    const incomplete = {
      ...rows[0],
      date: "2026-01-11",
      performance: {
        ...rows[0].performance!,
        key: "11",
        date: "2026-01-11",
        openingTank: null,
        closingTank: null,
        consumptionIncomplete: true,
      },
    };
    tables.length = 0;
    pdfEvents.length = 0;
    exportEquipmentHireCalendar(data, [incomplete], "pdf");
    expect(tables[0].body.flat().join(" ")).toContain("Review‡");
    expect(pdfEvents.some(event => String(event.value).includes("dip/meter incomplete — amount unaffected on monthly hire"))).toBe(true);
  });

  it("omits no-work dates and shows trips only for recorded trips on non-hour-meter trip hire", () => {
    const noWork = { date: "2026-01-12", status: "No Work" as const, remarks: "No activity recorded", downtimeHours: 0 };
    tables.length = 0;
    pdfEvents.length = 0;
    exportEquipmentHireCalendar({ ...data, hireBasis: "Trip Hire", meterType: "odometer" }, [
      { ...rows[0], trips: 2 }, noWork,
    ], "pdf");
    expect(tables[0].head[0]).toContain("Trips");
    expect(tables[0].body.flat().join(" ")).not.toContain("Activity Not Recorded");
    expect(pdfEvents.some(event => String(event.value).includes("No activity recorded on 1 other day(s)"))).toBe(true);

    tables.length = 0;
    exportEquipmentHireCalendar({ ...data, hireBasis: "Trip Hire", meterType: "hour_meter" }, [
      { ...rows[0], trips: 2 },
    ], "pdf");
    expect(tables[0].head[0]).not.toContain("Trips");
  });

  it("omits contractor diesel totals but keeps full raw columns in the calendar workbook", () => {
    excelSheets.length = 0;
    exportEquipmentHireCalendar({ ...data, dieselResponsibility: "vendor" }, rows, "xlsx");
    const activity = excelSheets[0].data;
    expect(activity).not.toContainEqual(["Total Diesel Issued", 20]);
    expect(activity.find(row => row.includes("Date"))).toContain("Diesel Issued");
    expect(activity.find(row => row.includes("Date"))).toContain("Opening Tank");
    expect(activity.find(row => row.includes("Date"))).toContain("Expected");
    expect(activity.find(row => row.includes("Date"))).toContain("Difference");
    expect(activity.find(row => row.includes("Date"))).toContain("Norm");
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
    expect(renderedRow).toContain("88.00 L");
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
    expect(headers).toContain("Difference");
    expect(headers).toContain("Consumption Rate");
    expect(headers).toContain("Trips");
    expect(headers).not.toContain("Actual Consumption | Master Norm");
    expect(rendered).toEqual(expect.arrayContaining([
      "Tank Readings N/A",
      "16.00 L",
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

  it("retains legacy paid bill net without inventing a payment when amountPaid is absent", () => {
    const output = buildSavedEquipmentHireBillOutput({
      billNo: "VB-EH-LEGACY", vendorName: "ACME HIRE", billType: "equipment",
      periodFrom: "2026-01-10", periodTo: "2026-01-11", status: "paid", amountPaid: null,
      hireStatements: [{
        equipmentId: 9, periodFrom: "2026-01-10", periodTo: "2026-01-11", billingBasis: "daily", rate: 5000,
        grossAmount: 10000, deductionAmount: 1000,
        calculationSnapshot: { adjustments: { breakdownDeduction: 1000 }, financials: { grossHire: 10000, breakdownDeduction: 1000, tdsRate: 2 } },
      }],
    });
    expect(output?.data.netPayable).toBeNull();
    expect(output?.data.paid).toBeNull();
  });
  it("does not recalculate financials when a saved calculation snapshot has no financial section", () => {
    const output = buildSavedEquipmentHireBillOutput({
      billNo: "VB-EH-SNAPSHOT", vendorName: "ACME HIRE", billType: "equipment",
      periodFrom: "2026-01-01", periodTo: "2026-01-01", status: "draft",
      hireStatements: [{
        equipmentId: 9, periodFrom: "2026-01-01", periodTo: "2026-01-01",
        billingBasis: "daily", rate: 5000, grossAmount: 5000, deductionAmount: 1000,
        calculationSnapshot: {
          terms: { billingBasis: "daily" },
          adjustments: { breakdownDeduction: 1000, advanceAdjustment: 1000 },
        },
      }],
    });
    expect(output?.data.grossHire).toBe(5000);
    expect(output?.data.taxBase).toBeNull();
    expect(output?.data.tdsAmount).toBeNull();
    expect(output?.data.netPayable).toBeNull();
  });
  it("uses saved snapshot financials for approved/draft exports without recalculating them", () => {
    const output = buildSavedEquipmentHireBillOutput({
      billNo: "VB-EH-0064", vendorName: "ACME HIRE", billType: "equipment",
      periodFrom: "2026-01-01", periodTo: "2026-01-31", status: "draft",
      hireStatements: [{
        equipmentId: 64, equipmentName: "Backhoe loader", periodFrom: "2026-01-01", periodTo: "2026-01-31",
        billingBasis: "monthly", rate: 150000, grossAmount: 150000,
        calculationSnapshot: {
          terms: { billingBasis: "monthly", monthlyDivisorType: "30", monthlyDivisor: 30 },
          adjustments: { breakdownDeduction: 1000, hsdRecovery: 0, otherDebit: 15000, advanceAdjustment: 110000 },
          financials: {
            grossHire: 155032.26, breakdownDeduction: 1000, hsdRecovery: 0, otherDebit: 15000,
            advanceAdjustment: 110000, otherCredit: 0, taxBase: 154032.26, taxableAmount: 44032.26,
            gstRate: 0, gstAmount: 0, invoiceTotal: 44032.26, tdsRate: 2, tdsAmount: 3080.65,
            netPayable: 25951.61,
          },
        },
      }],
    });
    expect(output?.data).toMatchObject({
      grossHire: 155032.26, breakdownDeduction: 1000, taxableAmount: 44032.26,
      taxBase: 154032.26, tdsRate: 2, tdsAmount: 3080.65, netPayable: 25951.61,
    });
    tables.length = 0;
    exportEquipmentHireBill(output!.data, output!.rows, "pdf");
    const billPdfText = tables.flatMap(table => table.body.flat()).join(" ");
    expect(billPdfText).toContain("Rs. 25,951.61");
    expect(billPdfText).toContain("(Rs. 3,080.65)");
    expect(billPdfText).toContain("Rs. 1,54,032.26");
    expect(billPdfText).toContain("(Rs. 1,10,000.00)");
  });
  it("shows saved working-sheet facts in the daily table when legacy performance rows are absent", () => {
    const output = buildSavedEquipmentHireBillOutput({
      billNo: "VB-EH-LEGACY-DAILY", vendorName: "ACME HIRE", billType: "equipment",
      periodFrom: "2026-10-01", periodTo: "2026-10-01", status: "approved",
      hireStatements: [{
        equipmentId: 9, equipmentName: "Legacy Roller", periodFrom: "2026-10-01", periodTo: "2026-10-01",
        billingBasis: "daily", rate: 5000, grossAmount: 5000,
        calculationSnapshot: {
      terms: { billingBasis: "daily", dieselResponsibility: "hlc", meterType: "hour_meter", consumptionNorm: 4 },
          workingSheet: [{
            date: "2026-10-01", activity: "worked", hours: 8, trips: 2, downtimeHours: 1,
            equipmentNames: ["Roller R-4"], siteLocations: ["North Site"], activityDescriptions: ["Compaction"],
            openingReadings: ["100"], closingReadings: ["108"], actualDiesel: 20, expectedDiesel: 18,
            expectedDieselAvailable: true, dieselVariance: 2, maintenanceDescriptions: ["Hydraulic check"],
            movementReferences: ["MOVE-17"], activityCount: 1, billableActivityCount: 1, openActivityCount: 0,
          }],
          dailyDecisions: [{ date: "2026-10-01", decision: "half_day", reason: "Manager approval", remarks: "Attendance confirmed" }],
          tripDecisions: [{ businessDate: "2026-10-01", selected: false, acceptedTrips: 1, recordedTrips: 2, reason: "Duplicate trip removed" }],
        },
      }],
    });
    expect(output?.hasFrozenDailyRows).toBe(false);
    expect(output?.rows).toHaveLength(1);
    expect(output?.rows[0].performance).toMatchObject({
      projectSite: "North Site",
      openingMeter: 100,
      closingMeter: 108,
      workingHours: 8,
      dieselIssued: 20,
      expectedDiesel: 18,
      difference: 2,
    });
    expect(output?.rows[0]).toMatchObject({
      trips: 2,
      statusLabel: "Worked",
      consumptionRateText: "Tank Readings N/A",
    });
    excelSheets.length = 0;
    exportEquipmentHireCalendar(output!.data, output!.rows, "xlsx");
    const sheet = excelSheets[0].data;
    const headers = sheet.find(row => row.includes("Date"))!;
    const rendered = sheet.find(row => row[0] === "01 Oct 2026")!;
    expect(headers).toContain("Trips");
    expect(headers).toContain("Consumption Rate");
    expect(headers).toContain("Difference");
    expect(headers).not.toEqual(expect.arrayContaining([
      "Saved working-sheet activity", "Saved expected diesel / variance", "Recorded decisions",
      "Saved remarks / movement references",
    ]));
    expect(rendered[headers.indexOf("Project / Site")]).toBe("North Site");
    expect(rendered[headers.indexOf("Opening Meter")]).toBe("100");
    expect(rendered[headers.indexOf("Closing Meter")]).toBe("108");
    expect(rendered[headers.indexOf("Trips")]).toBe("2");
    expect(rendered[headers.indexOf("Diesel Issued")]).toBe("20.00 L");
    expect(rendered[headers.indexOf("Expected")]).toBe("18.00 L");
    expect(rendered[headers.indexOf("Difference")]).toBe("+2.00 L");
    expect(rendered[headers.indexOf("Consumption Rate")]).toBe("Tank Readings N/A");
    expect(rendered[headers.indexOf("Status / Remarks")]).toContain("Decision: half_day — Manager approval");
    expect(rendered[headers.indexOf("Status / Remarks")]).toContain("Attendance confirmed");
    expect(rendered[headers.indexOf("Status / Remarks")]).toContain("Movement: MOVE-17");
    expect(rendered[headers.indexOf("Status / Remarks")]).toContain("Duplicate trip removed");
  });

  it("keeps missing-activity billable dates empty and labels them neutrally", () => {
    const output = buildSavedEquipmentHireBillOutput({
      billNo: "VB-EH-LEGACY-NO-ACTIVITY", vendorName: "ACME HIRE", billType: "equipment",
      periodFrom: "2026-10-01", periodTo: "2026-10-01", status: "approved",
      hireStatements: [{
        equipmentId: 9, equipmentName: "Legacy Roller", periodFrom: "2026-10-01", periodTo: "2026-10-01",
        billingBasis: "monthly", rate: 30000, grossAmount: 30000,
        calculationSnapshot: {
          terms: { billingBasis: "monthly", dieselResponsibility: "hlc", meterType: "hour_meter" },
          workingSheet: [{
            date: "2026-10-01", activity: "no_activity", hours: 0, trips: 0, downtimeHours: 0,
            openingReadings: [], closingReadings: [], actualDiesel: 0, expectedDiesel: 0,
            expectedDieselAvailable: true, dieselVariance: 0,
          }],
        },
      }],
    });
    const row = output!.rows[0];
    expect(row).toMatchObject({ status: "No Work", statusLabel: "Activity Not Recorded", trips: null });
    expect(row.performance).toBeUndefined();
    excelSheets.length = 0;
    exportEquipmentHireCalendar(output!.data, output!.rows, "xlsx");
    const headers = excelSheets[0].data.find(row => row.includes("Date"))!;
    const rendered = excelSheets[0].data.find(row => row[0] === "01 Oct 2026")!;
    const index = (header: string) => headers.indexOf(header);
    expect(rendered[index("Opening Meter")]).toBe("—");
    expect(rendered[index("Closing Meter")]).toBe("—");
    expect(rendered[index("Working Hours")]).toBe("—");
    expect(rendered[index("Trips")]).toBe("—");
    expect(rendered[index("Diesel Issued")]).toBe("—");
    expect(rendered[index("Opening Tank")]).toBe("—");
    expect(rendered[index("Closing Tank")]).toBe("—");
    expect(rendered[index("Diesel Consumed")]).toBe("—");
    expect(rendered[index("Expected")]).toBe("—");
    expect(rendered[index("Consumption Rate")]).toBe("—");
    expect(rendered[index("Status / Remarks")]).toBe("Activity Not Recorded");
  });
  it("carries the factual review notice into equipment bill exports without the removed explanatory copy", () => {
    const hireReview = projectHireReview({
      equipmentName: "Excavator", billingBasis: "monthly", rate: 1000, grossAmount: 2000, deductionAmount: 0,
      periodFrom: "2026-09-01", periodTo: "2026-09-30",
      calculationSnapshot: { terms: { monthlyDivisorType: "calendar" }, workingSheet: [{ date: "2026-09-01", activity: "worked" }] },
    });
    const notice = `September 2026: ${hireReview.months[0].unknown} dates require review.`;
    const withReview = { ...data, hireReview };
    excelSheets.length = 0;
    exportEquipmentHireBill(withReview, rows, "xlsx");
    const monthly = excelSheets.find(sheet => sheet.name === "Monthly Billing Summary")!;
    expect(monthly.data.some(row => row[0] === notice)).toBe(true);
    expect(monthly.data.flat().join(" ")).not.toContain("Days Billed follows the hire terms");
    pdfEvents.length = 0;
    exportEquipmentHireBill(withReview, rows, "pdf");
    expect(pdfEvents.some(event => event.type === "text" && event.value === notice)).toBe(false);
    expect(tables.flatMap(table => table.body.flat()).join(" ")).not.toContain("Days Billed follows the hire terms");
  });
});