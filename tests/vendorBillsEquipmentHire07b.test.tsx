// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import VendorBills from "@/pages/VendorBills";

const authTestState = vi.hoisted(() => ({ isOwner: false, isAdmin: true }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  isAdmin: authTestState.isAdmin, isOwner: authTestState.isOwner,
  user: { id: 9, isAdmin: authTestState.isAdmin, isOwner: authTestState.isOwner },
  sectionCan: () => true, sectionVisible: () => true,
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "Demo", logoFile: null }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-persisted-filters", () => ({ usePersistedFilters: (_key: string, defaults: any) => [defaults, vi.fn(), vi.fn()] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const discoveredVendor = { vendorName: "ABC EQUIPMENT", recordCount: 1, categories: ["equipment"] };
const autoEquipmentItem = {
  date: "2026-09-15", category: "equipment", description: "ABC ROLLER · HOURLY HIRE",
  qty: 2, unit: "HRS", rate: 100, amount: 200, source: "auto:plant_usage", equipmentId: 81,
};
const historicalEquipment = {
  id: 81, name: "HISTORICAL ROLLER", registrationNumber: "DEMO-81",
  hireBillingBasis: "monthly", hireRate: 90000, hireStartDate: "2026-07-01", hireEndDate: null,
  hireDieselResponsibility: "vendor", hireOperatorResponsibility: "vendor",
  hireAgreementRemarks: "DEMO ACTIVE HIRE", hireBreakdownDeductionEnabled: false,
  hireMonthlyDivisorType: "30", hireMonthlyDivisor: null, meterType: "hour_meter", consumptionNorm: 3.5,
};
const historicalBill = {
  id: 81, billDate: "2026-09-30", billNo: "VB-0081", billType: "equipment",
  vendorName: "HISTORICAL HIRE", periodFrom: "2026-09-01", periodTo: "2026-09-30",
  status: "draft", totalAmount: 90000, notes: "HISTORICAL SNAPSHOT", items: [{
    id: 8101, hireStatementId: 810, source: "hire_statement", category: "equipment",
    description: "HISTORICAL ROLLER MONTHLY HIRE", qty: 1, unit: "MONTH", rate: 90000, amount: 90000,
  }], hireStatements: [{
    id: 810, equipmentId: 81, periodFrom: "2026-09-01", periodTo: "2026-09-30",
    billingBasis: "monthly", rate: 90000, quantity: 1, grossAmount: 90000,
    deductionAmount: 0, netAmount: 90000, status: "draft",
    calculationSnapshot: {
      terms: { billingBasis: "monthly", rate: 90000 }, quantity: 1, grossAmount: 90000,
      netAmount: 90000, diesel: { actualDiesel: 0, expectedDiesel: 0, suggestedExcess: 0, finalRecoveryAmount: 0 },
      workingSheet: [{ date: "2026-09-15", activity: "worked", hours: 2, actualDiesel: 0 }],
    },
  }],
};
const itemizedEquipmentBill = {
  id: 82, billDate: "2026-09-30", billNo: "VB-0082", billType: "equipment",
  vendorName: "ITEMIZED EQUIPMENT", periodFrom: "2026-09-01", periodTo: "2026-09-30",
  status: "verified", totalAmount: 200, gstRateEquipment: 18, items: [{
    id: 8201, source: "auto:plant_usage", category: "equipment",
    description: "ITEMIZED ROLLER · HOURLY HIRE", qty: 2, unit: "HRS", rate: 100, amount: 200,
  }], hireStatements: [],
};
let vendorBillWrites: Array<{ method: string; body: any }> = [];
let autoItemsForTest: any[] = [autoEquipmentItem];
let rateCardsForTest: any[] = [];
let duplicateRowsForTest: Array<{ index: number; billNo: string; billStatus: string }> = [];
let deferredDuplicateChecks: Promise<Response>[] = [];
let deferredRateCards: Promise<Response> | null = null;
let hireActivityRowsForTest: any[] = [];
let deferredHireActivities: Promise<Response> | null = null;
let billDetailOverrideForTest: any = null;
let billListOverrideForTest: any[] | null = null;
let vendorNamesForTest: string[] = [];
let billingIdentitiesForTest: Array<{ id: number; name: string; businessName?: string | null }> = [];

beforeEach(() => {
  queryClient.clear();
  Object.defineProperty(Element.prototype, "hasPointerCapture", { configurable: true, value: () => false });
  Object.defineProperty(Element.prototype, "setPointerCapture", { configurable: true, value: () => {} });
  Object.defineProperty(Element.prototype, "releasePointerCapture", { configurable: true, value: () => {} });
  vendorBillWrites = [];
  autoItemsForTest = [autoEquipmentItem];
  rateCardsForTest = [];
  duplicateRowsForTest = [];
  deferredDuplicateChecks = [];
  deferredRateCards = null;
  hireActivityRowsForTest = [];
  deferredHireActivities = null;
  billDetailOverrideForTest = null;
  billListOverrideForTest = null;
  vendorNamesForTest = [];
  billingIdentitiesForTest = [
    { id: 81, name: "ABC EQUIPMENT" },
    { id: 82, name: "HISTORICAL HIRE" },
    { id: 83, name: "ITEMIZED EQUIPMENT" },
  ];
  authTestState.isOwner = false;
  authTestState.isAdmin = true;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/vendor-bills/financial-review")) {
      return new Response(JSON.stringify(billListOverrideForTest || [historicalBill, itemizedEquipmentBill]));
    }
    if (url.endsWith("/bill-date") && init?.method === "PATCH") {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      vendorBillWrites.push({ method: init.method, body });
      billDetailOverrideForTest = { ...billDetailOverrideForTest, billDate: body.billDate };
      return new Response(JSON.stringify({ id: billDetailOverrideForTest.id, billDate: body.billDate }), { status: 200 });
    }
    if (url.endsWith("/api/vendor-bills")) {
      if (init?.method === "POST" || init?.method === "PUT") {
        vendorBillWrites.push({ method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify(historicalBill), { status: 200 });
      }
      return new Response(JSON.stringify(billListOverrideForTest || [historicalBill, itemizedEquipmentBill]));
    }
    if (url.includes("/api/vendor-bills/summary")) return new Response(JSON.stringify({ total: 0, totalAmount: 0, draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0, gstByCategory: {}, totalGst: 0 }));
    if (url.includes("/api/vendor-bills/vendor-names")) return new Response(JSON.stringify(vendorNamesForTest));
    if (url.includes("/api/vendor-bills/vendor-identities")) return new Response(JSON.stringify(billingIdentitiesForTest));
    if (url.includes("/api/vendor-aliases")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/discover-vendors")) return new Response(JSON.stringify([discoveredVendor]));
    if (url.includes("/api/vendor-bills/equipment-hire-discovery")) return new Response(JSON.stringify([{ vendorName: "HISTORICAL HIRE", equipmentCount: 1, equipment: [historicalEquipment] }]));
    if (url.includes("/api/vendor-bills/81")) {
      if (init?.method === "PUT") {
        vendorBillWrites.push({ method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
      }
      return new Response(JSON.stringify(billDetailOverrideForTest?.id === 81 ? billDetailOverrideForTest : historicalBill), { status: 200 });
    }
    if (url.includes("/api/vendor-bills/82")) {
      if (init?.method === "PUT") {
        vendorBillWrites.push({ method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
      }
      return new Response(JSON.stringify(billDetailOverrideForTest?.id === 82 ? billDetailOverrideForTest : itemizedEquipmentBill), { status: 200 });
    }
    if (url.includes("/api/audit-logs")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/hire-activities")) return deferredHireActivities || new Response(JSON.stringify(hireActivityRowsForTest));
    if (url.includes("/api/vendor-bills/auto-items")) return new Response(JSON.stringify(autoItemsForTest));
    if (url.includes("/api/vendor-rate-cards")) return deferredRateCards || new Response(JSON.stringify(rateCardsForTest));
    if (url.includes("/api/vendor-bills/check-duplicates")) {
      return deferredDuplicateChecks.shift() || new Response(JSON.stringify(duplicateRowsForTest));
    }
    if (url.includes("/api/reports/equipment-performance")) return new Response(JSON.stringify({ fleet: [{ equipmentId: 81, dieselConsumed: null, expectedDiesel: null, difference: null, consumptionIncomplete: true, dailyRows: [] }] }));
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

async function openFreshPullBill(items: any[]) {
  autoItemsForTest = items;
  render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
  fireEvent.click(await screen.findByTestId("button-new-bill"));
  expect(screen.getByTestId("select-bill-type").textContent).toBe("All Types (Combined)");
  fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
  fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
  fireEvent.click(await screen.findByTestId("button-show-vendors"));
  fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
  await screen.findByTestId("button-auto-populate");
}

describe("VB-07B equipment uses the shared itemized bill flow", () => {
  it("shows Edit on approved hire and material bills, hides it on void, and offers VOID only to the Owner", async () => {
    const approvedHire = {
      ...historicalBill,
      billNo: "HLC/VB/2026/EDIT-HIRE",
      status: "approved",
      hireStatements: historicalBill.hireStatements.map(statement => ({ ...statement, status: "approved" })),
    };
    billDetailOverrideForTest = approvedHire;
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    expect((await screen.findByTestId("text-bill-no")).textContent).toBe("HLC/VB/2026/EDIT-HIRE");
    expect(screen.queryByTestId("button-edit-bill")).toBeNull();
    expect(screen.queryByTestId("button-void-bill")).toBeNull();

    cleanup();
    queryClient.clear();
    billDetailOverrideForTest = historicalBill;
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    expect(await screen.findByTestId("button-edit-bill")).toBeTruthy();

    cleanup();
    queryClient.clear();
    const approvedMaterial = {
      ...itemizedEquipmentBill,
      billNo: "HLC/VB/2026/EDIT-MATERIAL",
      billType: "material",
      status: "approved",
    };
    billDetailOverrideForTest = approvedMaterial;
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    expect((await screen.findByTestId("text-bill-no")).textContent).toBe("HLC/VB/2026/EDIT-MATERIAL");
    expect(screen.getByTestId("button-edit-bill")).toBeTruthy();

    cleanup();
    queryClient.clear();
    billDetailOverrideForTest = { ...approvedMaterial, isCancelled: true };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    await screen.findByTestId("badge-bill-status");
    expect(screen.queryByTestId("button-edit-bill")).toBeNull();
    expect(screen.queryByTestId("button-void-bill")).toBeNull();

    cleanup();
    queryClient.clear();
    authTestState.isAdmin = false;
    authTestState.isOwner = true;
    billDetailOverrideForTest = approvedMaterial;
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    expect(await screen.findByTestId("button-void-bill")).toBeTruthy();
    expect(screen.getByTestId("button-edit-bill")).toBeTruthy();
    expect(screen.getByTestId("button-bill-history")).toBeTruthy();
  });

  it("shows ordinary bill editors Edit only on drafts and keeps audit content out of their view", async () => {
    authTestState.isAdmin = false;
    authTestState.isOwner = false;
    const draftMaterial = {
      ...itemizedEquipmentBill,
      billType: "material",
      status: "draft",
      isCancelled: false,
      hireStatements: [],
    };
    billDetailOverrideForTest = draftMaterial;
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    expect(await screen.findByTestId("button-edit-bill")).toBeTruthy();
    expect(screen.queryByTestId("button-bill-history")).toBeNull();
    expect(screen.queryByTestId("vendor-bill-audit-summary")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/audit-logs"))).toBe(false);

    cleanup();
    queryClient.clear();
    billDetailOverrideForTest = {
      ...draftMaterial,
      status: "approved",
      verifiedBy: "Site Verifier",
      verifiedAt: "2026-10-01 08:00:00",
      approvedBy: "Site Approver",
      approvedAt: "2026-10-01 09:00:00",
    };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    expect(await screen.findByTestId("badge-bill-status")).toBeTruthy();
    expect(screen.queryByTestId("button-edit-bill")).toBeNull();
    expect(screen.queryByTestId("button-bill-history")).toBeNull();
    expect(screen.queryByTestId("vendor-bill-audit-summary")).toBeNull();
    const statusSteps = screen.getByTestId("status-steps").textContent || "";
    expect(statusSteps).toContain("Site Verifier");
    expect(statusSteps).toContain("Site Approver");
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes("/api/audit-logs"))).toBe(false);
  });

  it("offers the separate date action for an approved bill and sends only the new date plus an optional reason", async () => {
    billDetailOverrideForTest = {
      ...historicalBill,
      billNo: "HLC/VB/2026/0055",
      status: "approved",
      billDate: "2026-10-09",
      hireStatements: historicalBill.hireStatements.map(statement => ({ ...statement, status: "approved" })),
    };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    fireEvent.click(await screen.findByTestId("button-change-bill-date"));
    expect((await screen.findByTestId("input-bill-accounting-date") as HTMLInputElement).value).toBe("2026-10-09");
    expect(screen.getByText("Changes the accounting date only. Amounts, line items and status are unchanged. This is the date Tally orders the vendor's ledger by.")).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-bill-accounting-date"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByTestId("input-bill-date-reason"), { target: { value: "Correcting ledger order" } });
    fireEvent.click(screen.getByTestId("button-save-bill-date"));
    await waitFor(() => expect(vendorBillWrites.some(write => write.method === "PATCH")).toBe(true));
    expect(vendorBillWrites.find(write => write.method === "PATCH")?.body).toEqual({
      billDate: "2026-08-31",
      reason: "Correcting ledger order",
    });
  });

  it("shows every paid status event with its recorded actor and date/time, and labels missing evidence", async () => {
    billDetailOverrideForTest = {
      ...historicalBill,
      status: "paid",
      createdAt: "2026-08-01T06:30:00.000Z",
      authorName: "Original Author",
      verifiedAt: "2026-08-02 08:15:00",
      verifiedBy: "Verifier",
      approvedAt: "2026-08-03 09:45:00",
      approvedBy: "Approver",
      paidAt: "2026-08-04 10:20:00",
      paymentRecordedBy: "Cashier",
    };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    const statusSteps = await screen.findByTestId("status-steps");
    for (const text of ["draft", "verified", "approved", "paid", "Original Author", "Verifier", "Approver", "Cashier",
      "01-Aug-26 06:30", "02-Aug-26 08:15", "03-Aug-26 09:45", "04-Aug-26 10:20"]) {
      expect(statusSteps.textContent).toContain(text);
    }

    cleanup();
    queryClient.clear();
    billDetailOverrideForTest = {
      ...historicalBill,
      status: "paid",
      createdAt: null,
      authorName: null,
      verifiedAt: "2026-08-02",
      verifiedBy: null,
      approvedAt: null,
      approvedBy: null,
      paidAt: "2026-08-04",
      paymentRecordedBy: null,
    };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    const missingEvidenceSteps = await screen.findByTestId("status-steps");
    expect(missingEvidenceSteps.textContent).toContain("author not recorded");
    expect(missingEvidenceSteps.textContent).toContain("not recorded");
    expect(missingEvidenceSteps.textContent).toContain("date and time not recorded");
    expect(missingEvidenceSteps.textContent).toContain("time not recorded");
  });

  it("confirms an approved edit before writes, keeps cancel inert, and saves drafts without confirmation", async () => {
    billDetailOverrideForTest = {
      ...itemizedEquipmentBill,
      billNo: "HLC/VB/2026/CONFIRM01",
      billType: "material",
      status: "approved",
    };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    fireEvent.click(await screen.findByTestId("button-edit-bill"));
    fireEvent.change(await screen.findByTestId("input-bill-date"), { target: { value: "2026-10-02" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByTestId("button-save-bill"));
    const wording = "Bill HLC/VB/2026/CONFIRM01 is currently approved. Saving this edit will return it to draft, require it to be verified and approved again, and remove it from Payable now until it is approved again. Continue?";
    expect(confirm).toHaveBeenCalledWith(wording);
    expect(vendorBillWrites).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalledWith("/api/vendor-rate-cards/bulk-upsert", expect.anything());

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(vendorBillWrites.some(write => write.method === "PUT")).toBe(true));
    expect(vendorBillWrites.find(write => write.method === "PUT")?.body.billDate).toBe("2026-10-02");
    expect(fetch).not.toHaveBeenCalledWith("/api/vendor-rate-cards/bulk-upsert", expect.anything());
    confirm.mockRestore();

    cleanup();
    queryClient.clear();
    billDetailOverrideForTest = {
      ...itemizedEquipmentBill,
      billNo: "HLC/VB/2026/DRAFT01",
      billType: "material",
      status: "draft",
    };
    vendorBillWrites = [];
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    fireEvent.click(await screen.findByTestId("button-edit-bill"));
    fireEvent.change(await screen.findByTestId("input-bill-date"), { target: { value: "2026-10-03" } });
    const draftConfirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(vendorBillWrites.some(write => write.method === "PUT")).toBe(true));
    expect(draftConfirm).not.toHaveBeenCalled();
    draftConfirm.mockRestore();
  });

  it("shows the original author beside the draft creation date or the explicit missing-author notice", async () => {
    billDetailOverrideForTest = {
      ...historicalBill,
      createdAt: "2026-09-01T08:30:00.000Z",
      authorName: "Original Raiser",
    };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    const statusSteps = await screen.findByTestId("status-steps");
    expect(statusSteps.textContent).toContain("Original Raiser");
    expect(statusSteps.textContent).toMatch(/01-Sep-26/);

    cleanup();
    queryClient.clear();
    billDetailOverrideForTest = { ...historicalBill, authorName: null };
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    expect((await screen.findByTestId("status-steps")).textContent).toContain("author not recorded");
  });

  it("Test A: discovers a vendor through the generic activity endpoint and pulls equipment items", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    await waitFor(() => expect((screen.getByTestId("button-show-vendors") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-show-vendors"));
    expect(await screen.findByText("ABC EQUIPMENT")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/vendor-bills/discover-vendors"));
    fireEvent.click(screen.getByTestId("button-select-vendor-ABC EQUIPMENT"));
    const pull = await screen.findByTestId("button-auto-populate");
    expect(pull.textContent).toContain("PULL ALL 1 ITEM");
    fireEvent.click(pull);
    expect(await screen.findByText(/ABC ROLLER · HOURLY HIRE/i)).toBeTruthy();
    expect(screen.queryByTestId("button-exclude-already-billed")).toBeNull();
    expect(screen.queryByTestId("equipment-hire-straight-form")).toBeNull();
    expect(screen.queryByTestId("button-add-hire-81")).toBeNull();
  });

  it("Test B: keeps equipment GST/TDS in the shared per-category adjustments", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    fireEvent.click(await screen.findByTestId("button-show-vendors"));
    fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
    fireEvent.click(await screen.findByTestId("button-auto-populate"));
    await screen.findByText(/ABC ROLLER · HOURLY HIRE/i);
    const qtyInputs = screen.getAllByTestId(/input-item-qty-/);
    const rateInputs = screen.getAllByTestId(/input-item-rate-/);
    fireEvent.change(qtyInputs[qtyInputs.length - 1], { target: { value: "2" } });
    fireEvent.change(rateInputs[rateInputs.length - 1], { target: { value: "100" } });
    const gst = await screen.findByTestId("input-gst-equipment-rate");
    fireEvent.change(gst, { target: { value: "18" } });
    fireEvent.change(screen.getByTestId("input-tds-rate"), { target: { value: "2" } });
    expect(screen.getByText("GST ON EQUIPMENT")).toBeTruthy();
    expect(screen.getByTestId("text-gst-equipment-amount").textContent).toContain("Rs.");
    expect(screen.getByTestId("text-net-total").textContent).toContain("NET TOTAL");
  });

  it("Test B mixed: applies GST to each present category subtotal and posts the item subtotal", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    fireEvent.click(await screen.findByTestId("button-show-vendors"));
    fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
    fireEvent.click(await screen.findByTestId("button-auto-populate"));
    await screen.findByText(/ABC ROLLER · HOURLY HIRE/i);
    fireEvent.click(screen.getByTestId("button-add-item"));

    fireEvent.click(screen.getByTestId("select-item-category-1"));
    fireEvent.click(await screen.findByText("MATL"));
    fireEvent.change(screen.getByTestId("input-item-desc-1"), { target: { value: "STONE MATERIAL" } });
    fireEvent.change(screen.getByTestId("input-item-qty-1"), { target: { value: "3" } });
    fireEvent.change(screen.getByTestId("input-item-rate-1"), { target: { value: "100" } });
    fireEvent.change(screen.getByTestId("input-gst-equipment-rate"), { target: { value: "18" } });
    fireEvent.change(screen.getByTestId("input-gst-material-rate"), { target: { value: "5" } });

    expect(screen.getByText("On Rs. 200.00")).toBeTruthy();
    expect(screen.getByText("On Rs. 300.00")).toBeTruthy();
    expect(screen.getByTestId("text-gst-equipment-amount").textContent).toContain("Rs. 36.00");
    expect(screen.getByTestId("text-gst-material-amount").textContent).toContain("Rs. 15.00");
    fireEvent.click(screen.getByTestId("select-bill-site"));
    fireEvent.click(await screen.findByText("ALL SITES"));
    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(vendorBillWrites.some(write => write.method === "POST")).toBe(true));
    const payload = vendorBillWrites.find(write => write.method === "POST")!.body;
    expect(payload.totalAmount).toBe(500);
    expect(payload.gstRateEquipment).toBe(18);
    expect(payload.gstRateMaterial).toBe(5);
    expect(payload.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "equipment", amount: 200 }),
      expect.objectContaining({ category: "material", amount: 300 }),
    ]));
  });

  it("Test C: allows a manual monthly equipment line without hire-term discovery", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    expect(screen.getByTestId("button-add-item")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-add-item"));
    const descriptions = screen.getAllByTestId(/input-item-desc-/);
    fireEvent.change(descriptions[descriptions.length - 1], { target: { value: "MONTHLY EQUIPMENT HIRE" } });
    const qtyInputs = screen.getAllByTestId(/input-item-qty-/);
    const rateInputs = screen.getAllByTestId(/input-item-rate-/);
    const qty = qtyInputs[qtyInputs.length - 1];
    const rate = rateInputs[rateInputs.length - 1];
    fireEvent.change(qty, { target: { value: "1" } });
    fireEvent.change(rate, { target: { value: "90000" } });
    expect((descriptions[descriptions.length - 1] as HTMLInputElement).value).toBe("MONTHLY EQUIPMENT HIRE");
    expect(screen.queryByTestId("button-auto-populate")).toBeNull();
  });

  it("keeps the historical hire details near the header and saved activity readable when edited", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    expect(await screen.findByTestId("equipment-hire-header-details")).toBeTruthy();
    expect(screen.getByText(/Detailed activity/)).toBeTruthy();
    expect(screen.queryByText(/EQUIPMENT HIRE CALCULATION SNAPSHOT/)).toBeNull();
    fireEvent.click(screen.getByTestId("button-edit-bill"));
    expect(await screen.findByTestId("equipment-hire-straight-form")).toBeTruthy();
    expect(screen.getByTestId("equipment-hire-straight-form").textContent).toContain("Master terms");
    expect(screen.queryByTestId("button-add-item")).toBeNull();
    expect(screen.queryByTestId("button-auto-populate")).toBeNull();
    expect(screen.queryByTestId("button-clear-equipment-hire")).toBeNull();
  });

  it("uses the shared whole-bill PDF action for verified itemized equipment without hire statements", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    expect(await screen.findByTestId("button-export-whole-bill-pdf-footer")).toBeTruthy();
    expect(screen.queryByTestId("button-export-pdf")).toBeNull();
    expect(screen.queryByTestId("button-export-equipment-hire-pdf")).toBeNull();
  });

  it("preserves saved ordinary equipment evidence when an itemized edit switches to All", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    fireEvent.click(await screen.findByTestId("button-edit-bill"));
    expect(await screen.findByText(/ITEMIZED ROLLER · HOURLY HIRE/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("select-bill-type"));
    fireEvent.click(await screen.findByText("All Types (Combined)"));
    await waitFor(() => expect(screen.getByText(/ITEMIZED ROLLER · HOURLY HIRE/i)).toBeTruthy());
  });

  it("keeps persisted historical hire groups through period edits and PUT save", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    fireEvent.click(await screen.findByTestId("button-edit-bill"));
    const periodFrom = await screen.findByTestId("input-period-from");
    fireEvent.change(periodFrom, { target: { value: "2026-09-02" } });
    expect(screen.queryByTestId("button-add-item")).toBeNull();
    await waitFor(() => expect((screen.getByTestId("button-view-daily-activity") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(vendorBillWrites.some(write => write.method === "PUT")).toBe(true));
    const payload = vendorBillWrites.find(write => write.method === "PUT")!.body;
    expect(payload.hireGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        hireStatementId: 810,
        equipmentId: 81,
        periodFrom: "2026-09-02",
        periodTo: "2026-09-30",
      }),
    ]));
  });
});

describe("VB-13 fresh bill defaults and initial blank lifecycle", () => {
  it("A/B: defaults fresh bills to All Types, including after an explicit choice and reset", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    expect(screen.getByTestId("select-bill-type").textContent).toBe("All Types (Combined)");

    fireEvent.click(screen.getByTestId("select-bill-type"));
    fireEvent.click(await screen.findByText("EQUIPMENT HIRE"));
    expect(screen.getByTestId("select-bill-type").textContent).toBe("EQUIPMENT HIRE");

    fireEvent.click(screen.getByTestId("button-cancel"));
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    expect(screen.getByTestId("select-bill-type").textContent).toBe("All Types (Combined)");
  });

  it("C: removes the untouched seed after an equipment-only pull", async () => {
    await openFreshPullBill([vb11Items[0]]);
    fireEvent.click(screen.getByTestId("button-auto-populate"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(1));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();
  });

  it("D: removes the untouched seed after a material-only pull", async () => {
    await openFreshPullBill([vb11Items[3]]);
    fireEvent.click(screen.getByTestId("button-auto-populate"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(1));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();
  });

  it("E: removes the seed after each category in a mixed pull sequence", async () => {
    await openFreshPullBill(vb11Items.slice(0, 7));
    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(3));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();

    fireEvent.click(screen.getByTestId(vb11GroupIds.soil));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(5));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();

    fireEvent.click(screen.getByTestId(vb11GroupIds.transport));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(6));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();
  });

  it("F: deliberate Add Item replaces only the untouched seed", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    expect(screen.getAllByTestId(/input-item-desc-/)).toHaveLength(1);
    fireEvent.click(screen.getByTestId("button-add-item"));
    expect(screen.getAllByTestId(/input-item-desc-/)).toHaveLength(1);
  });

  it("removes the seed for generated monthly hire while retaining a user-owned row", async () => {
    hireActivityRowsForTest = [{
      source: "equipment_default",
      equipmentId: 81,
      equipment: historicalEquipment,
    }];
    let releaseHireActivities!: (response: Response) => void;
    deferredHireActivities = new Promise<Response>(resolve => { releaseHireActivities = resolve; });

    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    fireEvent.click(await screen.findByTestId("button-show-vendors"));
    fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));

    const seededDescription = await screen.findByTestId("input-item-desc-0");
    fireEvent.change(seededDescription, { target: { value: "USER OWNED MONTHLY NOTE" } });
    releaseHireActivities(new Response(JSON.stringify(hireActivityRowsForTest)));

    await screen.findByTestId("monthly-hire-81");
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(1));
    expect(screen.getByDisplayValue("USER OWNED MONTHLY NOTE")).toBeTruthy();
    expect(screen.getByText(/HISTORICAL ROLLER .* MONTHLY HIRE/i)).toBeTruthy();
  });
});

const vb11Items = [
  { date: "2026-09-05", category: "equipment", description: "JCB-SITE - HOURLY HIRE", qty: 8, unit: "HRS", rate: 0, sourceId: "plant_usage:1", equipmentId: 100, siteName: "SITE" },
  { date: "2026-09-06", category: "equipment", description: "JCB-SITE - HOURLY HIRE", qty: 7, unit: "HRS", rate: 0, sourceId: "plant_usage:2", equipmentId: 100, siteName: "SITE" },
  { date: "2026-09-07", category: "equipment", description: "JCB-SITE - DAILY HIRE", qty: 1, unit: "HRS", rate: 0, sourceId: "plant_usage:3", equipmentId: 100, siteName: "SITE" },
  { date: "2026-09-05", category: "material", description: "SOIL (SITE)", qty: 10, unit: "MT", rate: 0, sourceId: "material:1", equipmentId: null, siteName: "SITE" },
  { date: "2026-09-06", category: "material", description: "SOIL (PLANT)", qty: 12, unit: "MT", rate: 0, sourceId: "material:2", equipmentId: null, siteName: "PLANT" },
  { date: "2026-09-07", category: "material", description: "SAND (SITE)", qty: 8, unit: "MT", rate: 0, sourceId: "material:3", equipmentId: null, siteName: "SITE" },
  { date: "2026-09-08", category: "transport", description: "TRUCK DISPATCH VIA EAST ROAD (SITE)", qty: 2, unit: "TRIP", rate: 0, sourceId: "transport:1", equipmentId: null, siteName: "SITE" },
  { date: "2026-09-09", category: "labour", description: "LABOUR OPERATOR MALE - PLANT", qty: 2, unit: "HEAD-DAY", rate: 0, sourceId: "labour:1", equipmentId: null, siteName: "PLANT" },
];

const vb11GroupIds = {
  equipment: "button-pull-group-eq_JCB_HRS",
  soil: "button-pull-group-desc_material_SOIL_MT",
  sand: "button-pull-group-desc_material_SAND_MT",
  transport: "button-pull-group-transport_EAST_ROAD_TRIP",
  labour: "button-pull-group-lab_LAB_OPERATOR_MALE_HEAD-DAY",
};
const groupRowId = (buttonId: string) => buttonId.replace(/^button-/, "");

async function openVb11MixedBill() {
  render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
  fireEvent.click(await screen.findByTestId("button-new-bill"));
  const billType = screen.getByTestId("select-bill-type");
  if (billType.textContent !== "All Types (Combined)") {
    fireEvent.click(billType);
    fireEvent.click(await screen.findByText("All Types (Combined)"));
  }
  fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
  fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
  fireEvent.click(await screen.findByTestId("button-show-vendors"));
  fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
  await screen.findByTestId(vb11GroupIds.equipment);
}

describe("VB-11 grouped ordinary activity pull", () => {
  it("Test A/B/C: groups mixed activity, pulls equipment only, then adds one material group without disturbing it", async () => {
    autoItemsForTest = vb11Items;
    rateCardsForTest = [{ itemKey: "EQ_JCB_HRS", category: "equipment", unit: "HRS", vendorName: "ABC EQUIPMENT", rate: 250 }];
    duplicateRowsForTest = [{ index: 1, billNo: "VB-OTHER-2", billStatus: "approved" }];
    await openVb11MixedBill();

    // The existing Set Rates key intentionally groups a machine/unit even
    // when source labels call out different hire entry types.
    expect(screen.getByTestId(groupRowId(vb11GroupIds.equipment)).textContent).toContain("3 ITEMS");
    expect(screen.getByTestId(groupRowId(vb11GroupIds.soil)).textContent).toContain("2 ITEMS");
    expect(screen.getByTestId(groupRowId(vb11GroupIds.sand)).textContent).toContain("1 ITEM");
    expect(screen.getByTestId(groupRowId(vb11GroupIds.transport))).toBeTruthy();
    expect(screen.getByTestId(groupRowId(vb11GroupIds.labour))).toBeTruthy();

    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(3));
    expect(screen.getByTestId(groupRowId(vb11GroupIds.equipment)).textContent).toContain("✓ ADDED 3/3");
    expect(screen.getByTestId(groupRowId(vb11GroupIds.soil)).textContent).toContain("PULL 2");
    expect(screen.getByTestId("badge-billed-1")).toBeTruthy();
    expect((screen.getAllByTestId(/input-item-rate-/)[0] as HTMLInputElement).value).toBe("250");
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();

    // Pulling always includes the flagged row. The preparer can remove every
    // billed row after reviewing the complete pulled picture.
    expect(screen.getByTestId("button-exclude-already-billed").textContent).toContain("(1)");
    fireEvent.click(screen.getByTestId("button-exclude-already-billed"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(2));
    expect(screen.queryByTestId("badge-billed-1")).toBeNull();
    expect(screen.getByTestId(groupRowId(vb11GroupIds.equipment)).textContent).toContain("PULL 1");
    await waitFor(() => expect((screen.getByTestId(vb11GroupIds.equipment) as HTMLButtonElement).disabled).toBe(false));
    duplicateRowsForTest = [{ index: 0, billNo: "VB-OTHER-2", billStatus: "approved" }];
    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(3));
    expect(screen.getByTestId("badge-billed-2")).toBeTruthy();
    expect(screen.getByTestId("button-exclude-already-billed").textContent).toContain("(1)");
    fireEvent.click(screen.getByTestId("button-exclude-already-billed"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(2));

    duplicateRowsForTest = [];
    fireEvent.click(screen.getByTestId(vb11GroupIds.soil));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(4));
    expect(screen.getAllByTestId(/text-item-desc-/).filter(node => node.textContent?.includes("JCB-SITE"))).toHaveLength(2);
    expect(screen.getByTestId(groupRowId(vb11GroupIds.sand)).textContent).toContain("PULL 1");

    // Deliberately removed sources stay suppressed for this draft. Other
    // unpulled sources remain available without restoring the removed row.
    fireEvent.click(screen.getByTestId("button-remove-item-0"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(3));
    expect(screen.getByTestId(groupRowId(vb11GroupIds.equipment)).textContent).toContain("2 ITEMS");
    expect(screen.getByTestId(groupRowId(vb11GroupIds.equipment)).textContent).toContain("PULL 1");
    fireEvent.click(screen.getByTestId(vb11GroupIds.sand));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(4));
    expect(screen.getAllByTestId(/text-item-desc-/).filter(node => node.textContent?.includes("JCB-SITE"))).toHaveLength(1);
  });

  it("Test D/E/F: Pull All applies rates and duplicate flags, clears the blank row, and retains Added groups", async () => {
    autoItemsForTest = vb11Items;
    rateCardsForTest = [
      { itemKey: "EQ_JCB_HRS", category: "equipment", unit: "HRS", vendorName: "ABC EQUIPMENT", rate: 250 },
      { itemKey: "MAT_SOIL_MT", category: "material", unit: "MT", vendorName: "ABC EQUIPMENT", rate: 80 },
    ];
    duplicateRowsForTest = [{ index: 2, billNo: "VB-OTHER-3", billStatus: "verified" }];
    await openVb11MixedBill();

    fireEvent.click(screen.getByTestId("button-auto-populate"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(vb11Items.length));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();
    expect(screen.getAllByTestId(/input-item-rate-/).slice(0, 2).every(node => (node as HTMLInputElement).value === "250")).toBe(true);
    expect(screen.getByTestId("badge-billed-2")).toBeTruthy();
    Object.values(vb11GroupIds).forEach(id => expect(screen.getByTestId(groupRowId(id)).textContent).toContain("✓ ADDED"));
    expect(screen.queryByTestId("button-auto-populate")).toBeNull();
    fireEvent.click(screen.getByTestId("button-exclude-already-billed"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(vb11Items.length - 1));
    expect(screen.queryByTestId("badge-billed-2")).toBeNull();
  });

  it("does not leak a deferred pull into a new bill with the same vendor, period, and type", async () => {
    autoItemsForTest = [vb11Items[0]];
    let releaseA!: (response: Response) => void;
    let releaseB!: (response: Response) => void;
    deferredRateCards = new Promise<Response>(resolve => { releaseA = resolve; });
    await openVb11MixedBill();
    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    await waitFor(() => expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).includes("/api/vendor-rate-cards")),
    ).toBe(true));

    // This deliberately recreates exactly the same fields. Context-string
    // checks alone cannot distinguish it from the first bill instance.
    fireEvent.click(screen.getByTestId("button-cancel"));
    // B has an independent rate-card request. Keep A's response pending so
    // the test proves B can start before A resolves.
    deferredRateCards = null;
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    const nextBillType = screen.getByTestId("select-bill-type");
    if (nextBillType.textContent !== "All Types (Combined)") {
      fireEvent.click(nextBillType);
      fireEvent.click(await screen.findByText("All Types (Combined)"));
    }
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    fireEvent.click(await screen.findByTestId("button-show-vendors"));
    fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
    const bPull = await screen.findByTestId(vb11GroupIds.equipment);
    await waitFor(() => expect((bPull as HTMLButtonElement).disabled).toBe(false));

    deferredDuplicateChecks.push(new Promise<Response>(resolve => { releaseB = resolve; }));
    fireEvent.click(bPull);
    await waitFor(() => expect(deferredDuplicateChecks).toHaveLength(0));
    expect((screen.getByTestId(vb11GroupIds.equipment) as HTMLButtonElement).disabled).toBe(true);

    // A's abandoned response arrives after B already owns the busy token. It
    // must not clear B's lock or merge A's stale result.
    releaseA(new Response(JSON.stringify([])));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect((screen.getByTestId(vb11GroupIds.equipment) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryAllByTestId(/text-item-desc-/)).toHaveLength(0);

    releaseB(new Response(JSON.stringify([])));
    await waitFor(() => expect(screen.queryAllByTestId(/text-item-desc-/)).toHaveLength(1));
  });
});

describe("VB-FIND-01 bill cards and vendor picker", () => {
  it("shows the bill date and period separately and labels missing dates without a substitute", async () => {
    billListOverrideForTest = [
      { ...historicalBill, id: 91, billNo: "HLC/VB/DATE-01" },
      { ...historicalBill, id: 92, billNo: "HLC/VB/DATE-02", periodFrom: null, periodTo: null },
      { ...historicalBill, id: 93, billNo: "HLC/VB/DATE-03", billDate: null, periodFrom: null, periodTo: null },
    ];
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);

    const fullMeta = await screen.findByTestId("text-bill-meta-91");
    expect(fullMeta.textContent).toContain("HLC/VB/DATE-01");
    expect(fullMeta.textContent).toContain("Bill date 30-SEP-2026");
    expect(fullMeta.textContent).toContain("Period 01-SEP-2026 to 30-SEP-2026");

    const noPeriodMeta = screen.getByTestId("text-bill-meta-92");
    expect(noPeriodMeta.textContent).toContain("Bill date 30-SEP-2026");
    expect(noPeriodMeta.textContent).not.toContain("Period");

    const noDateMeta = screen.getByTestId("text-bill-meta-93");
    expect(noDateMeta.textContent).toContain("Bill date not recorded");
    expect(noDateMeta.textContent).not.toContain("Period");
  });

  it("reopens suggestions, supports keyboard selection, and blocks unresolved new vendor names", async () => {
    vendorNamesForTest = ["OLD SUPPLIER", "NEW SUPPLIER"];
    billingIdentitiesForTest = [
      { id: 101, name: "OLD SUPPLIER" },
      { id: 102, name: "NEW SUPPLIER" },
    ];
    queryClient.setQueryData(["/api/vendor-bills/vendor-identities"], billingIdentitiesForTest);
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));

    const input = await screen.findByTestId("input-vendor-name") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "OLD" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    await waitFor(() => expect(input.value).toBe("OLD SUPPLIER"));
    expect(vendorBillWrites).toHaveLength(0);

    fireEvent.focus(input);
    expect(await screen.findByTestId("vendor-option-OLD SUPPLIER")).toBeTruthy();
    expect(screen.getByTestId("vendor-option-NEW SUPPLIER")).toBeTruthy();
    fireEvent.change(input, { target: { value: "NEW SUPPLIER" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("OLD SUPPLIER");
    expect(screen.queryByTestId("vendor-dropdown")).toBeNull();

    fireEvent.focus(input);
    await screen.findByTestId("vendor-dropdown");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    await waitFor(() => expect(input.value).toBe("NEW SUPPLIER"));
    expect(vendorBillWrites).toHaveLength(0);

    fireEvent.change(input, { target: { value: "UNLISTED SUPPLIER" } });
    expect(screen.getByText(/Current selection: NEW SUPPLIER/)).toBeTruthy();
    fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe("UNLISTED SUPPLIER"));

    fireEvent.change(screen.getByTestId("input-item-desc-0"), { target: { value: "MANUAL BILL ITEM" } });
    fireEvent.change(screen.getByTestId("input-item-qty-0"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("input-item-rate-0"), { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("select-bill-site"));
    fireEvent.click(await screen.findByText("ALL SITES"));
    fireEvent.click(screen.getByTestId("button-save-bill"));
    expect(screen.getByText(/not uniquely linked to the Vendor Master/)).toBeTruthy();
    expect(vendorBillWrites).toHaveLength(0);

    fireEvent.change(input, { target: { value: "NEW SUPPLIER" } });
    fireEvent.mouseDown(await screen.findByTestId("vendor-option-NEW SUPPLIER"), { button: 0 });
    const masterSelect = screen.getByTestId("select-bill-vendor-master");
    await waitFor(() => expect((masterSelect as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() => expect(masterSelect.textContent).toContain("NEW SUPPLIER"));
    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(vendorBillWrites.some(write => write.method === "POST")).toBe(true));
    expect(vendorBillWrites.find(write => write.method === "POST")?.body.vendorName).toBe("NEW SUPPLIER");
  });
});