// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { billReviewAmounts, summarizeBillReview, vendorStatementBills } from "../shared/vendorBillReview";
import { VendorBillFinancialSummary, VendorRunningStatement } from "../client/src/components/vendor-bills/VendorBillReview";
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
    adjustments: { advanceAdjustment: 100, advanceAdjustmentReason: "Previously verified advance" },
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
    expect(screen.getAllByText(/View Activity \/ Breakdown Calendar/)).toHaveLength(2);
    fireEvent.click(screen.getByText(/View Activity \/ Breakdown Calendar · Machine 2/));
    expect(screen.getAllByText(/Hose repair/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/No Work/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Attendance verified/)).toHaveLength(2);
    expect(screen.getAllByTestId("equipment-hire-period-totals")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Export Calendar PDF" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Export Calendar Excel" })).toHaveLength(2);
    expect(fetcher).not.toHaveBeenCalled();
    expect(JSON.stringify(input)).toBe(before);
  });
  it("shows only available saved lines for legacy evidence, never inventing activity", () => {
    render(<SavedBillCalendars bill={{ ...bill(1), items: [{ id: 10, category: "equipment", equipmentId: 3, description: "Legacy excavator", qty: 1, amount: 1000 }] }} />);
    expect(screen.getByText(/Working hours, idle days, diesel and historical decisions: Not established/)).toBeTruthy();
    expect(screen.queryByTestId("equipment-hire-period-totals")).toBeNull();
  });
  it("keeps legacy Bill export working while unavailable frozen Calendar export is disabled", async () => {
    const exportBill = vi.fn();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    renderQuery(<SavedEquipmentCalendarExport bill={{ ...bill(1), periodFrom: "2026-10-01", periodTo: "2026-10-03", items: [{ category: "equipment", equipmentId: 3 }] }} onExportBill={exportBill} />);
    fireEvent.click(screen.getByTestId("button-export-pdf"));
    expect((screen.getByTestId("button-export-equipment-hire-choice-calendar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-export-equipment-hire-choice-bill"));
    await waitFor(() => expect(exportBill).toHaveBeenCalledWith("pdf"));
    expect(fetcher).not.toHaveBeenCalled();
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
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [earlier, current] });
    vi.stubGlobal("fetch", fetcher);
    renderQuery(<VendorRunningStatement bill={current} bills={[current, earlier, bill(3, { vendorId: 99 })]} totals={totals} />);
    const details = screen.getByTestId("vendor-running-statement") as HTMLDetailsElement;
    details.open = true; fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/vendor-bills/2/statement", { credentials: "include", cache: "no-store" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getAllByText(/Previously verified advance/)).toHaveLength(2));
    expect(screen.getByText(/Historical opening balance/).textContent).toContain("Not established");
    expect(JSON.stringify([current, earlier])).toBe(before);
  });
});
