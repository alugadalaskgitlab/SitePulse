// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SavedBillCalendars from "./SavedBillCalendars";
import {
  buildSavedEquipmentHireBillOutput,
  exportEquipmentHireCalendar,
} from "./EquipmentHireBillOutput";
import { loadPdfLogoDataUrl } from "./pdfExportStyle";

vi.mock("./EquipmentHireBillOutput", () => ({
  buildSavedEquipmentHireBillOutput: vi.fn(),
  exportEquipmentHireCalendar: vi.fn(),
}));
vi.mock("./pdfExportStyle", () => ({
  loadPdfLogoDataUrl: vi.fn(),
}));

const augustRow: any = {
  date: "2026-08-20",
  status: "Worked",
  performance: {
    workingHours: 4,
    openingTank: 50,
    closingTank: 42,
    dieselIssued: 8,
    consumptionIncomplete: false,
  },
};
const septemberRow: any = {
  date: "2026-09-10",
  status: "Worked",
  performance: {
    workingHours: 5,
    openingTank: 40,
    closingTank: 30,
    dieselIssued: 10,
    consumptionIncomplete: false,
  },
};

const savedBill: any = {
  id: 1,
  billType: "equipment",
  billNo: "VB-1",
  vendorName: "HIRE VENDOR",
  periodFrom: "2026-08-20",
  periodTo: "2026-09-15",
  status: "draft",
  items: [{
    id: 1,
    equipmentId: 9,
    hireStatementId: 1,
    category: "equipment",
    source: "hire_statement",
    description: "EXCAVATOR",
    amount: 54000,
  }],
  hireStatements: [{
    id: 1,
    equipmentId: 9,
    equipmentName: "EXCAVATOR",
    periodFrom: "2026-08-20",
    periodTo: "2026-09-15",
    billingBasis: "monthly",
    rate: 60000,
    grossAmount: 54000,
    status: "draft",
    calculationSnapshot: {
      terms: {
        billingBasis: "monthly",
        rate: 60000,
        monthlyDivisorType: "30",
        hireStartDate: "2026-08-20",
        hireEndDate: "2026-09-15",
      },
    },
  }],
};

beforeEach(() => {
  vi.mocked(buildSavedEquipmentHireBillOutput).mockImplementation((_bill: any, logoFile?: string) => ({
    data: {
      billNo: "VB-1",
      equipmentName: "EXCAVATOR",
      vendorName: "HIRE VENDOR",
      periodFrom: "2026-08-20",
      periodTo: "2026-09-15",
      logoFile,
      dieselResponsibility: "hlc",
      consumptionNorm: 2,
      meterType: "hour_meter",
      consumptionRateUnit: "L/hr",
    } as any,
    rows: [augustRow, septemberRow],
    hasFrozenDailyRows: true,
  }));
  vi.mocked(exportEquipmentHireCalendar).mockClear();
  vi.mocked(loadPdfLogoDataUrl).mockReset();
  vi.mocked(loadPdfLogoDataUrl).mockResolvedValue("data:image/png;base64,logo");
});

afterEach(cleanup);

describe("saved hire activity month sections", () => {
  it("keeps months independently collapsible with per-month totals and exports plus an all-month export", () => {
    const { container } = render(<SavedBillCalendars bill={savedBill} canExport />);
    const months = Array.from(container.querySelectorAll<HTMLDetailsElement>(
      '[data-testid="saved-hire-activity-month-section"]',
    ));
    expect(months).toHaveLength(2);
    expect(months[0].querySelector("summary")?.textContent).toContain("August 2026");
    expect(months[1].querySelector("summary")?.textContent).toContain("September 2026");

    fireEvent.click(months[0].querySelector("summary")!);
    expect(months[0].open).toBe(true);
    expect(months[1].open).toBe(false);
    const augustTotals = within(months[0]).getByTestId("saved-hire-activity-totals");
    expect(augustTotals.textContent).toContain("Working hours: 4:00");
    expect(augustTotals.textContent).toContain("Average consumption rate: 2 L/hr");

    fireEvent.click(within(months[0]).getByRole("button", { name: "Export Activity Statement PDF" }));
    expect(exportEquipmentHireCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({ periodFrom: "2026-08-20", periodTo: "2026-08-31" }),
      [augustRow],
      "pdf",
    );

    fireEvent.click(months[1].querySelector("summary")!);
    const septemberTotals = within(months[1]).getByTestId("saved-hire-activity-totals");
    expect(septemberTotals.textContent).toContain("Working hours: 5:00");
    expect(septemberTotals.textContent).toContain("Average consumption rate: 2 L/hr");
    fireEvent.click(within(months[1]).getByRole("button", { name: "Export Activity Statement Excel" }));
    expect(exportEquipmentHireCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({ periodFrom: "2026-09-01", periodTo: "2026-09-15" }),
      [septemberRow],
      "xlsx",
    );

    fireEvent.click(screen.getByRole("button", { name: "Activity Statement PDF" }));
    expect(exportEquipmentHireCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({ periodFrom: "2026-08-20", periodTo: "2026-09-15" }),
      [augustRow, septemberRow],
      "pdf",
    );
  });

  it("uses the configured company logo for standalone Activity Statement PDFs", async () => {
    render(<SavedBillCalendars bill={savedBill} canExport logoFile="company/logo.png" />);

    fireEvent.click(screen.getByRole("button", { name: "Activity Statement PDF" }));

    await waitFor(() => expect(loadPdfLogoDataUrl).toHaveBeenCalledWith("company/logo.png"));
    await waitFor(() => expect(exportEquipmentHireCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        logoFile: "company/logo.png",
        logoDataUrl: "data:image/png;base64,logo",
      }),
      [augustRow, septemberRow],
      "pdf",
    ));
  });
});
