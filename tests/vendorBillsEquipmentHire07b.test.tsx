// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import VendorBills from "@/pages/VendorBills";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  isAdmin: true, sectionCan: () => true, sectionVisible: () => true,
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
let deferredRateCards: Promise<Response> | null = null;

beforeEach(() => {
  queryClient.clear();
  vendorBillWrites = [];
  autoItemsForTest = [autoEquipmentItem];
  rateCardsForTest = [];
  duplicateRowsForTest = [];
  deferredRateCards = null;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/vendor-bills")) {
      if (init?.method === "POST" || init?.method === "PUT") {
        vendorBillWrites.push({ method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify(historicalBill), { status: 200 });
      }
      return new Response(JSON.stringify([historicalBill, itemizedEquipmentBill]));
    }
    if (url.includes("/api/vendor-bills/summary")) return new Response(JSON.stringify({ total: 0, totalAmount: 0, draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0, gstByCategory: {}, totalGst: 0 }));
    if (url.includes("/api/vendor-bills/vendor-names") || url.includes("/api/vendor-aliases")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/discover-vendors")) return new Response(JSON.stringify([discoveredVendor]));
    if (url.includes("/api/vendor-bills/equipment-hire-discovery")) return new Response(JSON.stringify([{ vendorName: "HISTORICAL HIRE", equipmentCount: 1, equipment: [historicalEquipment] }]));
    if (url.includes("/api/vendor-bills/81")) {
      if (init?.method === "PUT") {
        vendorBillWrites.push({ method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
      }
      return new Response(JSON.stringify(historicalBill), { status: 200 });
    }
    if (url.includes("/api/vendor-bills/82")) return new Response(JSON.stringify(itemizedEquipmentBill), { status: 200 });
    if (url.includes("/api/vendor-bills/hire-activities")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/auto-items")) return new Response(JSON.stringify(autoItemsForTest));
    if (url.includes("/api/vendor-rate-cards")) return deferredRateCards || new Response(JSON.stringify(rateCardsForTest));
    if (url.includes("/api/vendor-bills/check-duplicates")) return new Response(JSON.stringify(duplicateRowsForTest));
    if (url.includes("/api/reports/equipment-performance")) return new Response(JSON.stringify({ fleet: [{ equipmentId: 81, dieselConsumed: null, expectedDiesel: null, difference: null, consumptionIncomplete: true, dailyRows: [] }] }));
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

describe("VB-07B equipment uses the shared itemized bill flow", () => {
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

  it("keeps the historical fixture snapshot readable and isolated when edited", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-81"));
    expect(await screen.findByText("EQUIPMENT HIRE CALCULATION SNAPSHOT")).toBeTruthy();
    expect(screen.getByText(/HSD ACTUAL \/ EXPECTED/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-edit-bill"));
    expect(await screen.findByTestId("equipment-hire-straight-form")).toBeTruthy();
    expect(screen.getByTestId("equipment-hire-straight-form").textContent).toContain("Master terms");
    expect(screen.queryByTestId("button-add-item")).toBeNull();
    expect(screen.queryByTestId("button-auto-populate")).toBeNull();
    expect(screen.queryByTestId("button-clear-equipment-hire")).toBeNull();
  });

  it("uses the shared generic PDF action for verified itemized equipment without hire statements", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("card-bill-82"));
    expect(await screen.findByTestId("button-export-pdf")).toBeTruthy();
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
  fireEvent.click(screen.getByTestId("select-bill-type"));
  fireEvent.click(await screen.findByText("All Types (Combined)"));
  fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
  fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
  fireEvent.click(await screen.findByTestId("button-show-vendors"));
  fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
  await screen.findByTestId(vb11GroupIds.equipment);
}

describe("VB-11 grouped ordinary activity pull", () => {
  it("Test A/B/C: groups mixed activity, pulls equipment only, then adds one material group without disturbing it", async () => {
    autoItemsForTest = vb11Items;
    rateCardsForTest = [{ itemKey: "EQ_JCB_HRS", category: "equipment", rate: 250 }];
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
    expect(screen.getByTestId("badge-billed-1").textContent).toContain("VB-OTHER-2 - APPROVED");
    expect((screen.getAllByTestId(/input-item-rate-/)[0] as HTMLInputElement).value).toBe("250");
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();

    // A second action on an Added group is disabled and cannot duplicate rows.
    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(3);

    duplicateRowsForTest = [];
    fireEvent.click(screen.getByTestId(vb11GroupIds.soil));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(5));
    expect(screen.getAllByTestId(/text-item-desc-/).filter(node => node.textContent?.includes("JCB-SITE"))).toHaveLength(3);
    expect(screen.getByTestId(groupRowId(vb11GroupIds.sand)).textContent).toContain("PULL 1");

    // Removing one source row makes that exact source-qualified candidate
    // pullable again; the retained group is not permanently hidden.
    fireEvent.click(screen.getByTestId("button-remove-item-0"));
    await waitFor(() => expect(screen.getByTestId(groupRowId(vb11GroupIds.equipment)).textContent).toContain("PULL 1"));
    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(5));
  });

  it("Test D/E/F: Pull All applies rates and duplicate flags, clears the blank row, and retains Added groups", async () => {
    autoItemsForTest = vb11Items;
    rateCardsForTest = [
      { itemKey: "EQ_JCB_HRS", category: "equipment", rate: 250 },
      { itemKey: "MAT_SOIL_MT", category: "material", rate: 80 },
    ];
    duplicateRowsForTest = [{ index: 2, billNo: "VB-OTHER-3", billStatus: "verified" }];
    await openVb11MixedBill();

    fireEvent.click(screen.getByTestId("button-auto-populate"));
    await waitFor(() => expect(screen.getAllByTestId(/text-item-desc-/)).toHaveLength(vb11Items.length));
    expect(screen.queryByTestId("input-item-desc-0")).toBeNull();
    expect(screen.getAllByTestId(/input-item-rate-/).slice(0, 2).every(node => (node as HTMLInputElement).value === "250")).toBe(true);
    expect(screen.getByTestId("badge-billed-2").textContent).toContain("VB-OTHER-3 - VERIFIED");
    Object.values(vb11GroupIds).forEach(id => expect(screen.getByTestId(groupRowId(id)).textContent).toContain("✓ ADDED"));
    expect(screen.queryByTestId("button-auto-populate")).toBeNull();
  });

  it("does not leak a deferred pull into a new bill with the same vendor, period, and type", async () => {
    autoItemsForTest = [vb11Items[0]];
    let releaseRateCards!: (response: Response) => void;
    deferredRateCards = new Promise<Response>(resolve => { releaseRateCards = resolve; });
    await openVb11MixedBill();
    fireEvent.click(screen.getByTestId(vb11GroupIds.equipment));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/vendor-rate-cards")));

    // This deliberately recreates exactly the same fields. Context-string
    // checks alone cannot distinguish it from the first bill instance.
    fireEvent.click(screen.getByTestId("button-cancel"));
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.click(screen.getByTestId("select-bill-type"));
    fireEvent.click(await screen.findByText("All Types (Combined)"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    fireEvent.click(await screen.findByTestId("button-show-vendors"));
    fireEvent.click(await screen.findByTestId("button-select-vendor-ABC EQUIPMENT"));
    await screen.findByTestId(vb11GroupIds.equipment);

    releaseRateCards(new Response(JSON.stringify([])));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => String(url).includes("/api/vendor-bills/check-duplicates")),
    ).toHaveLength(0);
    expect(screen.queryAllByTestId(/text-item-desc-/)).toHaveLength(0);
  });
});