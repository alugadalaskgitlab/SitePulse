// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import VendorBills from "@/pages/VendorBills";
import { queryClient } from "@/lib/queryClient";
import type { WholeBillSnapshot } from "./wholeBillSnapshot";
import { wholeBillPricingNotes } from "./wholeBillSnapshot";

const state = vi.hoisted(() => ({ permission: true, engineer: false, save: vi.fn() }));
vi.mock("./wholeBillExport", () => ({ saveWholeBillFile: state.save }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  isAdmin: true, user: { isFieldEngineer: state.engineer },
  sectionCan: (_section: string, permission: string) => permission === "view_reports" ? state.permission : true,
  sectionVisible: () => true,
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "HLC", logoFile: null }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-persisted-filters", () => ({
  usePersistedFilters: (_key: string, defaults: unknown) => [defaults, vi.fn(), vi.fn()],
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const baseBill = {
  id: 731, billNo: "VB-0731", billDate: "2026-10-04", vendorName: "RAVI AGGREGATES",
  billType: "material", periodFrom: "2026-08-01", periodTo: "2026-10-04", status: "draft",
  totalAmount: 837.25, gstRateMaterial: 18, tdsRate: 2,
  adjustmentLabel: "ADVANCE · CHALLAN 38", adjustmentAmount: -43.75,
  additionalAdjustments: [{ label: "ROUNDING CREDIT · AGREED", amount: 1.35 }],
  notes: "REVIEWED RECEIPTS", hireStatements: [], items: [{
    id: 7311, date: "2026-09-12", category: "material", description: "20 MM AGGREGATE",
    qty: 5, unit: "MT", rate: 167.45, amount: 837.25, source: "manual",
    siteName: "SITE: RING ROAD", vehicleNumber: "AP09AB731", receiptNumber: "RC-38",
  }],
};
let bill: any;
let autoItems: any[];
let requests: Array<{ url: string; method: string }>;
beforeEach(() => {
  queryClient.clear();
  state.permission = true; state.engineer = false;
  state.save.mockReset().mockResolvedValue({ cancelled: false, notes: [] });
  bill = structuredClone(baseBill);
  autoItems = [];
  requests = [];
  window.history.replaceState(null, "", "/plant/vendor-bills");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({
    matches: false, addListener: vi.fn(), removeListener: vi.fn(),
  }) });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); requests.push({ url, method: init?.method || "GET" });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (/\/api\/vendor-bills\/731(?:\?|$)/.test(url)) return json(bill);
    if (/\/api\/vendor-bills(?:\?|$)/.test(url)) return json([bill]);
    if (url.includes("/summary")) return json({
      total: 1, totalAmount: bill.totalAmount, draft: 1, verified: 0, approved: 0, paid: 0, gstByCategory: {},
    });
    if (url.includes("/discover-vendors")) return json([{ vendorName: "LOCAL SOIL", recordCount: 1, categories: ["material"] }]);
    if (url.includes("/auto-items")) return json(autoItems);
    if (url.includes("/equipment-performance")) return json({ fleet: [] });
    return json([]);
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });
const mount = () => render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
async function openDetail() {
  mount();
  fireEvent.click(await screen.findByTestId("card-bill-731"));
  await screen.findByTestId("text-detail-title");
}
async function clickExport(position: "header" | "footer", kind: "excel" | "pdf" = "excel") {
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  const before = requests.length;
  fireEvent.click(screen.getByTestId(`button-export-whole-bill-${kind}-${position}`));
  await waitFor(() => expect(state.save).toHaveBeenCalled());
  expect(requests.slice(before)).toEqual([]);
  expect(requests.every(request => request.method === "GET" ||
    (request.method === "POST" && request.url.includes("/check-duplicates")))).toBe(true);
  return state.save.mock.calls.at(-1)![0] as WholeBillSnapshot;
}

describe("VB-EXPORT-02 Part A actual VendorBills page wiring", () => {
  it("exports the untouched new form without exporting the blank seed or saving", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    expect(screen.getByTestId("badge-status-draft").parentElement?.querySelector('[data-testid="whole-bill-export-header"]')).toBeTruthy();
    const snapshot = await clickExport("header");
    expect(snapshot.saved).toBe(false);
    expect(snapshot.sections.every(section => section.groups.every(group => group.rows.length === 0))).toBe(true);
    expect(screen.getByTestId("button-save-bill")).toBeTruthy();
    state.save.mockClear();
    expect((await clickExport("footer", "pdf")).saved).toBe(false);
  });
  it("exports freshly pulled rows and typed rates before any save without changing the form", async () => {
    autoItems = [{
      date: "2026-09-12", category: "material", description: "SOIL DELIVERY",
      qty: 14, unit: "CUM", rate: 0, amount: 0, source: "auto:site_material_trip",
      sourceType: "site_material_trip", sourceId: 7312, vehicleNumber: "AP09AB731", receiptNumber: "RC-38",
    }];
    mount();
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByTestId("button-show-vendors"));
    fireEvent.click(await screen.findByTestId("button-select-vendor-LOCAL SOIL"));
    const pull = await screen.findByTestId("button-auto-populate");
    await waitFor(() => expect((pull as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(pull);
    await screen.findByTestId("text-item-desc-0");
    fireEvent.change(screen.getByTestId("input-item-rate-0"), { target: { value: "87.35" } });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    const snapshot = await clickExport("header");
    expect(snapshot).toMatchObject({ saved: false, vendorName: "LOCAL SOIL", status: "unsaved" });
    const rows = snapshot.sections.flatMap(section => section.groups.flatMap(group => group.rows));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ description: "SOIL DELIVERY", qty: 14, rate: 87.35 });
    expect(rows[0].amount).toBeCloseTo(1222.9);
    expect(rows[0].amount).toBe(snapshot.totals.subtotal);
    expect((screen.getByTestId("input-item-rate-0") as HTMLInputElement).value).toBe("87.35");
    expect(screen.getByTestId("text-total-amount").textContent).toContain(snapshot.totals.netPayable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  });
  it.each(["draft", "verified", "approved", "paid"])("saved %s exports at both positions with authoritative detail totals", async status => {
    bill.status = status;
    await openDetail();
    const snapshot = await clickExport("header");
    expect(snapshot).toMatchObject({ saved: true, status, billNo: "VB-0731", companyName: "HLC" });
    expect(snapshot.totals).toMatchObject({
      subtotal: 837.25, totalGst: 150.705, tds: { amount: -16.745 },
      netPayable: 837.25 + 150.705 - 43.75 + 1.35 - 16.745,
    });
    expect(snapshot.sections.find(section => section.category === "material")?.groups[0].rows[0])
      .toMatchObject({ rate: 167.45, amount: 837.25, vehicleNumber: "AP09AB731", receiptNumber: "RC-38" });
    state.save.mockClear();
    expect((await clickExport("footer", "pdf")).totals).toEqual(snapshot.totals);
  });
  it.each(["draft", "verified", "approved", "paid"])("editing %s preserves real status and current unsaved rates/adjustments", async status => {
    bill.status = status;
    await openDetail();
    fireEvent.click(screen.getByTestId("button-edit-bill"));
    fireEvent.change(screen.getByTestId("input-item-rate-0"), { target: { value: "178.35" } });
    fireEvent.change(screen.getByTestId("input-notes"), { target: { value: "UNSAVED REVIEW NOTE" } });
    const snapshot = await clickExport("footer");
    expect(snapshot.status).toBe(status);
    expect(snapshot.saved).toBe(true);
    expect(snapshot.notes).toBe("UNSAVED REVIEW NOTE");
    expect(snapshot.totals.subtotal).toBe(891.75);
    expect(snapshot.sections.find(section => section.category === "material")?.groups[0].rows[0].rate).toBe(178.35);
    expect(snapshot.totals.adjustments).toEqual([
      { label: "ADVANCE · CHALLAN 38", amount: -43.75 },
      { label: "ROUNDING CREDIT · AGREED", amount: 1.35 },
    ]);
    expect((screen.getByTestId("input-item-rate-0") as HTMLInputElement).value).toBe("178.35");
    state.save.mockClear();
    expect((await clickExport("header", "pdf")).totals).toEqual(snapshot.totals);
  });
  it.each([{ permission: false, engineer: false }, { permission: true, engineer: true }])(
    "no whole-bill controls in actual new/detail page for %o", async permissions => {
      Object.assign(state, permissions);
      await openDetail();
      expect(screen.queryByTestId("whole-bill-export-header")).toBeNull();
      expect(screen.queryByTestId("whole-bill-export-footer")).toBeNull();
      fireEvent.click(screen.getByTestId("button-back-detail"));
      fireEvent.click(screen.getByTestId("button-new-bill"));
      expect(screen.queryByTestId("whole-bill-export-header")).toBeNull();
      expect(screen.queryByTestId("whole-bill-export-footer")).toBeNull();
      expect(state.save).not.toHaveBeenCalled();
    },
  );
  it("retains an authoritative saved amount with missing rate and exposes the conflict", async () => {
    bill.items[0].rate = null;
    await openDetail();
    const snapshot = await clickExport("header");
    expect(snapshot.totals.subtotal).toBe(837.25);
    expect(snapshot.sections.find(section => section.category === "material")?.groups[0].rows[0]).toMatchObject({ rate: null, amount: 837.25 });
    expect(wholeBillPricingNotes(snapshot).join(" ")).toContain("Screen totals retained unchanged");
  });
  it("preserves the active labour filter/date order while disclosing broader financial totals", async () => {
    bill.billType = "all";
    bill.items = [
      { ...baseBill.items[0], id: 1, category: "labour", date: "2026-09-14", description: "SITE TEAM", siteName: "SITE: RING ROAD", rate: 83.25, amount: 416.25 },
      { ...baseBill.items[0], id: 2, category: "labour", date: "2026-09-12", description: "PLANT TEAM", siteName: "PLANT", rate: 75.8, amount: 379 },
      { ...baseBill.items[0], id: 3, category: "labour", date: "2026-09-11", description: "EARLIER SITE TEAM", siteName: "SITE: RING ROAD", rate: 83.25, amount: 416.25 },
      { ...baseBill.items[0], id: 4, category: "material", amount: 41.35, rate: 8.27 },
      { ...baseBill.items[0], id: 5, category: "other", amount: 0, rate: 0, description: "UNPRICED OTHER" },
    ];
    bill.totalAmount = 1252.85;
    await openDetail();
    fireEvent.click(screen.getByTestId("button-edit-bill"));
    fireEvent.click(screen.getByTestId("button-labour-filter-site"));
    fireEvent.click(screen.getByTestId("button-collapse-all-dates"));
    const snapshot = await clickExport("header");
    const labour = snapshot.sections.find(section => section.category === "labour")!;
    expect(labour.groups.flatMap(group => group.rows.map(row => row.description))).toEqual(["EARLIER SITE TEAM", "SITE TEAM"]);
    expect(labour.subtotal).toBe(1211.5);
    expect(snapshot.totals.subtotal).toBe(1252.85);
    expect(snapshot.sections.find(section => section.category === "other")?.groups[0].rows[0].amount).toBe(0);
    expect(snapshot.notes).toContain("Active labour view filter: site");
    expect(snapshot.notes).toContain("including hidden rows");
  });
  it("captures all saved hire statements from frozen evidence without performance requests", async () => {
    bill.billType = "equipment"; bill.status = "approved";
    bill.items[0].category = "equipment";
    bill.netPayableAmount = 837.25;
    bill.hireStatements = [81, 82].map((id, index) => ({
      id, equipmentId: id, equipmentName: `FROZEN ROLLER ${id}`,
      periodFrom: "2026-09-12", periodTo: "2026-09-12", rate: 167.45,
      grossAmount: 418.625, status: "approved",
      calculationSnapshot: {
        terms: { dieselResponsibility: "vendor", meterType: "hour_meter" },
        performanceDailyRows: [{ date: "2026-09-12", hoursOrKmRun: index + 2, projectSite: "FROZEN SITE" }],
        workingSheet: [{ date: "2026-09-12", hours: index + 2, activity: "worked", siteLocations: ["FROZEN SITE"] }],
      },
    }));
    await openDetail();
    const snapshot = await clickExport("header");
    expect(snapshot.calendars).toHaveLength(2);
    expect(snapshot.calendars.map(calendar => calendar.equipmentName)).toEqual(["FROZEN ROLLER 81", "FROZEN ROLLER 82"]);
    expect(snapshot.calendars.every(calendar => calendar.rows.length === 1 && calendar.breakdown?.rows.length === 1)).toBe(true);
    expect(snapshot.totals.netPayable).toBe(837.25);
    expect(requests.some(request => request.url.includes("/equipment-performance"))).toBe(false);
  });
  it("wires the historical form footer to the currently rendered hire output/calendar", async () => {
    bill.billType = "equipment";
    bill.items = [{ ...baseBill.items[0], category: "equipment", source: "hire_statement", hireStatementId: 81 }];
    bill.hireStatements = [{
      id: 81, equipmentId: 81, periodFrom: "2026-09-12", periodTo: "2026-09-12",
      billingBasis: "daily", rate: 837.25, grossAmount: 837.25, status: "draft",
      calculationSnapshot: { terms: { billingBasis: "daily", rate: 837.25 }, dailyDecisions: [] },
    }];
    await openDetail();
    fireEvent.click(screen.getByTestId("button-edit-bill"));
    const footer = screen.getByTestId("historical-hire-save-card");
    expect(footer.querySelector('[data-testid="whole-bill-export-footer"]')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("button-view-daily-activity").textContent).toBe("View Daily Activity"));
    const snapshot = await clickExport("footer");
    expect(snapshot.calendars).toHaveLength(1);
    expect(snapshot.calendars[0]).toMatchObject({ periodFrom: "2026-09-12", periodTo: "2026-09-12" });
    const displayedNet = screen.getByText("= NET PAYABLE").parentElement?.textContent || "";
    expect(displayedNet).toContain(snapshot.totals.netPayable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(snapshot.sections.find(section => section.category === "equipment")?.groups[0].rows).toHaveLength(1);
  });
  it("exports only included already-rendered calendars in the integrated monthly edit", async () => {
    bill.billType = "equipment";
    bill.items[0].category = "equipment";
    bill.hireStatements = ["2026-09-12", "2026-10-01"].map((date, index) => ({
      id: 81 + index, equipmentId: 81, periodFrom: date, periodTo: date,
      billingBasis: "monthly", rate: 837.25, grossAmount: 837.25, status: "draft",
      calculationSnapshot: { billingIntegration: "vb10_automatic", terms: { billingBasis: "monthly", rate: 837.25 } },
    }));
    await openDetail();
    fireEvent.click(screen.getByTestId("button-edit-bill"));
    await screen.findByTestId("draft-equipment-hire-calendar-81-2026-09-12");
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    fireEvent.click(screen.getByTestId("checkbox-include-monthly-hire-81-2026-10-01"));
    const snapshot = await clickExport("header");
    expect(snapshot.calendars).toHaveLength(1);
    expect(snapshot.calendars[0].periodFrom).toBe("2026-09-12");
    expect(snapshot.calendars[0].rows).toHaveLength(1);
  });
});