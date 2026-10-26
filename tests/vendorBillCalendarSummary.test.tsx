// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { billReviewAmounts, summarizeBillReview, vendorStatementBills } from "../shared/vendorBillReview";
import { VendorBillFinancialSummary, VendorRunningStatement } from "../client/src/components/vendor-bills/VendorBillReview";
import { EquipmentHireExportButtons } from "../client/src/components/vendor-bills/EquipmentHireBillOutput";
import SavedBillCalendars from "../client/src/components/vendor-bills/SavedBillCalendars";
import { SavedEquipmentCalendarExport } from "../client/src/components/vendor-bills/DraftEquipmentHireCalendar";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const totals = (b: any) => ({
  totalAmount: b.totalAmount ?? 1000, totalGst: 0,
  primaryAdjustment: b.adjustmentAmount || 0, additionalTotal: 0, additional: b.additionalAdjustments || [], tds: 0,
  netTotal: (b.totalAmount ?? 1000) + (b.adjustmentAmount || 0),
});
const bill = (id: number, overrides = {}) => ({ id, billNo: `VB-${id}`, vendorId: 11, vendorName: "PARTY",
  billDate: `2026-10-${String(id).padStart(2, "0")}`, status: "approved", totalAmount: 1000, amountPaid: 0, ...overrides });
const day = {
  key: "1", date: "2026-10-01", projectSite: "Permitted site", openingMeter: 10, closingMeter: 18,
  workingHours: 8, workingHoursIncomplete: false, startTime: "08:00", endTime: "16:00",
  multipleTimeSegments: false, clockDuration: 8, clockDurationIncomplete: false, dieselIssued: 20,
  openingTank: 30, closingTank: 25, dieselConsumed: 25, expectedDiesel: 24, difference: 1,
  consumptionRate: 3.125, consumptionRateUnit: "L/hr", consumptionIncomplete: false, events: [],
};
const statement = (id: number) => ({
  id, equipmentId: id, equipmentName: `Machine ${id}`, billingBasis: "monthly",
  periodFrom: "2026-10-01", periodTo: "2026-10-03", quantity: 1, rate: 9000, grossAmount: 9000, deductionAmount: 100, netAmount: 8900,
  calculationSnapshot: {
    performanceDailyRows: [day], terms: { dieselResponsibility: "hlc", meterType: "hour_meter" },
    sourceEvidence: { maintenance: [{ businessDate: "2026-10-02", description: "Hose repair", downtimeHours: 4 }] },
    dailyDecisions: [{ date: "2026-10-01", decision: "half_day", reason: "Attendance verified" }],
    adjustments: {
      advanceAdjustment: 100,
      advanceAdjustmentReason: "Previously verified advance",
      advanceAdjustmentDate: "2026-10-02",
    },
  },
});
function renderQuery(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("saved calendars", () => {
  it.each(["draft", "verified", "approved", "paid"])("renders frozen multi-machine evidence in %s without live reads or mutation", status => {
    const input = { ...bill(1, { status }), hireStatements: [statement(1), statement(2)], items: [] };
    const before = JSON.stringify(input);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<SavedBillCalendars bill={input} canExport />);
    expect(screen.getAllByText(/Detailed activity/)).toHaveLength(2);
    screen.getAllByText(/Detailed activity/).forEach(summary => {
      const details = summary.closest("details")!;
      details.open = true;
      fireEvent(details, new Event("toggle"));
    });
    expect(screen.getAllByText(/Hose repair/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Activity Not Recorded/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Attendance verified/)).toHaveLength(2);
    expect(screen.getAllByText("Advance payment date: 2026-10-02")).toHaveLength(2);
    expect(screen.getAllByTestId("saved-hire-activity-totals")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Export Activity Statement PDF" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Export Activity Statement Excel" })).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(input)).toBe(before);
  });
  it("shows only available saved lines for legacy evidence, never inventing activity", () => {
    render(<SavedBillCalendars bill={{ ...bill(1), items: [{ id: 10, category: "equipment", equipmentId: 3, description: "Legacy excavator", qty: 1, amount: 1000 }] }} />);
    expect(screen.getByText(/Working hours, idle days, diesel and historical decisions: Not established/)).toBeTruthy();
    expect(screen.queryByTestId("saved-hire-activity-totals")).toBeNull();
  });
  it("keeps legacy working-sheet facts in one daily table when frozen performance rows are missing", () => {
    const input = {
      ...bill(1, { periodFrom: "2026-10-01", periodTo: "2026-10-01" }),
      hireStatements: [{
        id: 4, equipmentId: 4, equipmentName: "Legacy Roller", billingBasis: "daily",
        periodFrom: "2026-10-01", periodTo: "2026-10-01", rate: 5000, grossAmount: 5000,
        calculationSnapshot: {
          terms: { billingBasis: "daily", dieselResponsibility: "hlc", meterType: "hour_meter" },
          workingSheet: [{
            date: "2026-10-01", activity: "worked", hours: 8, trips: 2, downtimeHours: 1,
            equipmentNames: ["Roller R-4"], siteLocations: ["North Site"], activityDescriptions: ["Compaction"],
            openingReadings: ["100"], closingReadings: ["108"], actualDiesel: 20, expectedDiesel: 18,
            expectedDieselAvailable: true, dieselVariance: 2, maintenanceDescriptions: ["Hydraulic check"],
            movementReferences: ["MOVE-17"], activityCount: 1, billableActivityCount: 1, openActivityCount: 0,
          }],
          dailyDecisions: [{ date: "2026-10-01", decision: "half_day", reason: "Manager approval", remarks: "Operator attendance confirmed" }],
          tripDecisions: [{ businessDate: "2026-10-01", selected: false, acceptedTrips: 1, recordedTrips: 2, reason: "Duplicate trip removed" }],
          diesel: { dailyPricing: [{ date: "2026-10-01", applicableRate: 90 }] },
        },
      }],
      items: [],
    };
    render(<SavedBillCalendars bill={input} />);
    const details = screen.getByText(/Detailed activity/).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const dailyTables = screen.getAllByRole("table").filter(table =>
      within(table).queryByText("Date"));
    expect(dailyTables).toHaveLength(1);
    const dailyTable = dailyTables[0];
    expect(dailyTable.textContent).toContain("Open meter");
    expect(dailyTable.textContent).toContain("Diesel issued");
    expect(dailyTable.textContent).toContain("Tank open");
    expect(dailyTable.textContent).not.toContain("Trips");
    expect(dailyTable.textContent).toContain("Consumption rate");
    expect(dailyTable.textContent).toContain("100");
    expect(dailyTable.textContent).toContain("108");
    expect(dailyTable.textContent).toContain("N/A");
    expect(dailyTable.textContent).toContain("Decision: half_day — Manager approval");
    expect(dailyTable.textContent).toContain("Operator attendance confirmed");
    expect(dailyTable.textContent).toContain("Movement: MOVE-17");
    expect(dailyTable.textContent).toContain("Trip decision: Excluded");
    expect(dailyTable.textContent).toContain("Duplicate trip removed");
    expect(dailyTable.textContent).not.toContain("Saved working-sheet activity");
    expect(dailyTable.querySelectorAll("td").length).toBe(dailyTable.querySelectorAll("th").length);
    expect(screen.queryByText(/Activity Calendar —/)).toBeNull();
    expect(screen.getByText(/Complete frozen performance rows are unavailable for this legacy bill.*Not recorded: start\/end times, clock duration, opening\/closing tank readings, diesel-consumed figures/)).toBeTruthy();
  });
  it("combines separate monthly statements into one summary and one daily table per equipment", () => {
    const savedStatement = (id: number, date: string, expectedDiesel: number) => ({
      id, equipmentId: 8, equipmentName: "Monthly Roller", billingBasis: "daily",
      periodFrom: date, periodTo: date, rate: 5000, grossAmount: 5000,
      calculationSnapshot: {
        terms: { billingBasis: "daily", dieselResponsibility: "hlc", meterType: "hour_meter" },
        workingSheet: [{
          date, activity: "worked", hours: 8, expectedDiesel, dieselVariance: 1,
          equipmentNames: ["Roller R-8"], activityDescriptions: ["Compaction"],
        }],
      },
    });
    const input = {
      ...bill(1, { periodFrom: "2026-10-01", periodTo: "2026-10-02" }),
      hireStatements: [savedStatement(8, "2026-10-01", 18), savedStatement(9, "2026-10-02", 17)],
      items: [],
    };
    render(<SavedBillCalendars bill={input} />);
    expect(screen.getAllByText("Monthly Billing Summary")).toHaveLength(1);
    const details = screen.getByText(/Detailed activity/).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const dailyTables = screen.getAllByRole("table").filter(table =>
      within(table).queryByText("Date"));
    expect(dailyTables).toHaveLength(1);
    expect(dailyTables[0].textContent).toContain("8:00");
    expect(dailyTables[0].textContent).toContain("01 Oct 2026");
    expect(dailyTables[0].textContent).toContain("02 Oct 2026");
  });
  it("keeps legacy Bill export working while unavailable frozen Activity Statement export is disabled", async () => {
    const exportBill = vi.fn();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    renderQuery(<SavedEquipmentCalendarExport bill={{ ...bill(1), periodFrom: "2026-10-01", periodTo: "2026-10-03", items: [{ category: "equipment", equipmentId: 3 }] }} onExportBill={exportBill} />);
    fireEvent.click(screen.getByTestId("button-export-pdf"));
    expect((screen.getByTestId("button-export-equipment-hire-choice-calendar") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Export Activity Statement PDF" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Export Bill PDF" })).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-export-equipment-hire-choice-bill"));
    await waitFor(() => expect(exportBill).toHaveBeenCalledWith("pdf"));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("labels bill and Activity Statement exports separately for PDF", () => {
    render(<EquipmentHireExportButtons data={{ billNo: "VB-1" } as any} rows={[]} />);
    fireEvent.click(screen.getByTestId("button-export-equipment-hire-pdf"));
    expect(screen.getByRole("button", { name: "Export Activity Statement PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export Bill PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export Both PDFs" })).toBeTruthy();
  });
  it("labels bill and Activity Statement exports separately for Excel", () => {
    render(<EquipmentHireExportButtons data={{ billNo: "VB-1" } as any} rows={[]} />);
    fireEvent.click(screen.getByTestId("button-export-equipment-hire-excel"));
    expect(screen.getByRole("button", { name: "Export Activity Statement Excel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export Bill Excel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export Both Excel Files" })).toBeTruthy();
  });
});

describe("financial overview and statement", () => {
  const amounts = (b: any) => billReviewAmounts(b, totals(b));
  it("includes all statuses, but only approved positive unpaid balances are eligible", () => {
    const rows = ["draft", "verified", "approved", "paid"].map((status, i) => bill(i + 1, { status, amountPaid: status === "paid" ? 1000 : 0 }));
    expect(summarizeBillReview(rows.map(amounts))).toMatchObject({ count: 4, gross: 4000, net: 4000, paid: 1000, outstanding: 3000, eligible: 1000 });
    expect(summarizeBillReview(rows.filter(b => b.status === "paid").map(amounts))).toMatchObject({ count: 1, outstanding: 0, eligible: 0 });
  });
  it("uses frozen net, partial payments, advance deductions, and separate cross-vendor credits", () => {
    const a = bill(1, { netPayableAmount: 800, amountPaid: 300, adjustmentAmount: -200 });
    const credit = bill(2, { vendorId: 99, totalAmount: -500, amountPaid: 0 });
    expect(summarizeBillReview([a, credit].map(amounts))).toMatchObject({ adjustments: -200, net: 300, paid: 300, outstanding: 500, credits: 500, eligible: 500 });
  });
  it("does not infer paid transactions or balances from a paid status", () => {
    expect(amounts(bill(1, { status: "paid", amountPaid: null }))).toMatchObject({ paid: null, balance: null, eligible: 0 });
    expect(summarizeBillReview([amounts(bill(1, { amountPaid: null }))])).toMatchObject({ unknownPayments: 1, eligible: 0 });
  });
  it("summary re-renders from precisely the supplied filtered/site-scoped rows", () => {
    const rows = [bill(1, { status: "draft" }), bill(2), bill(3, { vendorId: 22 })];
    const { rerender } = render(<VendorBillFinancialSummary bills={rows} totals={totals} />);
    expect(screen.getByText("3")).toBeTruthy();
    rerender(<VendorBillFinancialSummary bills={[rows[1]]} totals={totals} />);
    expect(screen.getByText("1")).toBeTruthy();
    const eligible = screen.getByText("Total Net Payable / Outstanding").parentElement!;
    expect(within(eligible).getByText("₹1,000.00")).toBeTruthy();
  });
  it("uses confirmed identity despite different names, never joins free-text lookalikes", () => {
    const rows = [bill(2, { vendorName: "OLD SPELLING" }), bill(1), bill(3, { vendorId: null }), bill(4, { vendorId: 22 })];
    expect(vendorStatementBills(rows[1], rows).map(b => b.id)).toEqual([1, 2]);
    expect(vendorStatementBills(rows[2], rows).map(b => b.id)).toEqual([3]);
    expect(vendorStatementBills(rows[1], [rows[1]]).map(b => b.id)).toEqual([1]);
  });
  it("loads only permitted linked bills using GET and shows frozen advance deductions read-only", async () => {
    const current = bill(2, { hireStatements: [statement(1)] });
    const earlier = bill(1, { amountPaid: 200, hireStatements: [statement(2)] });
    const before = JSON.stringify([current, earlier]);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      rows: [{
        id: earlier.id, billNo: earlier.billNo, billDate: earlier.billDate, periodFrom: "2026-10-01",
        periodTo: "2026-10-03", status: "approved", paidAt: null, gross: 1000, net: 1000,
        paid: 200, balance: 800, credit: 0, provisional: false, runningBalance: 800,
        adjustments: [{ label: "Machine 2 · advanceAdjustment", amount: -100, reason: "Previously verified advance" }],
      }],
      gross: 1000, paid: 200, balance: 800,
    }) });
    vi.stubGlobal("fetch", fetcher);
    renderQuery(<VendorRunningStatement bill={current} bills={[
      current, earlier, bill(3, { vendorId: 99 }),
      bill(5, { billNo: "VB-SAME-DATE", billDate: current.billDate }),
      bill(4, { vendorId: null, vendorName: "PARTY", billNo: "VB-UNLINKED" }),
    ]} />);
    const details = screen.getByTestId("vendor-running-statement") as HTMLDetailsElement;
    details.open = true; fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/vendor-bills/2/previous-bills", { credentials: "include", cache: "no-store" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    // The running statement shows each saved advance once, not once per
    // historical calendar plus another copy in the statement.
    await waitFor(() => expect(screen.getAllByText(/Previously verified advance/)).toHaveLength(1));
    expect(screen.getByText(/VB-SAME-DATE, same bill date, counted as later/)).toBeTruthy();
    expect(screen.getByText(/VB-UNLINKED/)).toBeTruthy();
    expect(screen.getByText("Bill period")).toBeTruthy();
    expect(screen.getAllByText("₹800.00").length).toBeGreaterThan(1);
    expect(screen.getByText(/Balance carried up to this bill/)).toBeTruthy();
    expect(screen.getByText(/Shows earlier bills for this vendor that are available to you, up to but not including this bill/)).toBeTruthy();
    expect(screen.queryByText(/Last Payment/)).toBeNull();
    expect(JSON.stringify([current, earlier])).toBe(before);
  });
  it("shows one concise empty state instead of a blank previous-billing grid", async () => {
    const current = bill(3);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      rows: [], gross: 0, paid: 0, balance: 0,
    }) });
    vi.stubGlobal("fetch", fetcher);
    renderQuery(<VendorRunningStatement bill={current} bills={[current]} />);
    await waitFor(() => expect(screen.getByText("No previous bills for this vendor.")).toBeTruthy());
    expect(screen.queryByText(/Total Gross Bills up to Previous/)).toBeNull();
    expect(screen.queryByText(/Shows earlier bills for this vendor/)).toBeNull();
    expect(screen.queryByText(/View Previous Bills/)).toBeNull();
  });
  it("does not fetch or show empty previous-billing totals for an unlinked vendor", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const current = bill(4, { vendorId: null });
    renderQuery(<VendorRunningStatement bill={current} bills={[current]} />);
    expect(screen.getByText(/Unlinked\/free-text vendor: previous balances are unavailable/)).toBeTruthy();
    expect(screen.queryByText(/Total Gross Bills up to Previous/)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
