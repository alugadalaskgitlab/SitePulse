// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import VendorBills from "@/pages/VendorBills";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  isAdmin: true, sectionCan: () => true, sectionVisible: () => true,
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "VB20 Test", logoFile: null }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-persisted-filters", () => ({ usePersistedFilters: (_key: string, defaults: any) => [defaults, vi.fn(), vi.fn()] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const equipmentId = 2020;
const vendorName = "VB20 MONTHLY VENDOR";
const equipment = {
  id: equipmentId,
  name: "VB20 EXCAVATOR",
  registrationNumber: "VB20-2020",
  hireBillingBasis: "monthly",
  hireRate: 60_000,
  hireStartDate: "2026-01-01",
  hireEndDate: null,
  hireDieselResponsibility: "hlc",
  hireMonthlyDivisorType: "30",
  hireMonthlyDivisor: null,
  hireBreakdownDeductionEnabled: true,
  consumptionNorm: 1,
};

let queryClient: QueryClient;
let writes: any[];
let hireStartDate: string;
let hireEndDate: string | null;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  writes = [];
  hireStartDate = "2026-01-01";
  hireEndDate = null;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/vendor-bills")) {
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify([]));
    }
    if (url.includes("/api/vendor-bills/summary")) {
      return new Response(JSON.stringify({ total: 0, totalAmount: 0, draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0, gstByCategory: {}, totalGst: 0 }));
    }
    if (url.includes("/api/vendor-bills/vendor-names") || url.includes("/api/vendor-aliases")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/discover-vendors")) {
      return new Response(JSON.stringify([{ vendorName, recordCount: 1, categories: ["equipment"] }]));
    }
    if (url.includes("/api/vendor-bills/hire-activities")) {
      return new Response(JSON.stringify([
        { source: "equipment_default", equipmentId, equipment: { ...equipment, hireStartDate, hireEndDate } },
        { source: "plant_usage", sourceId: 1, equipmentId, businessDate: "2026-08-10", hoursOrKmRun: 5, actualDiesel: 7, dieselSource: "plant_stock", openingDiesel: 100, closingDiesel: 100 },
        { source: "plant_usage", sourceId: 2, equipmentId, businessDate: "2026-09-10", hoursOrKmRun: 10, actualDiesel: 14, dieselSource: "plant_stock", openingDiesel: 100, closingDiesel: 100 },
        { source: "maintenance", sourceId: 3, equipmentId, businessDate: "2026-09-15", eventType: "breakdown", description: "September breakdown", downtimeHours: 8 },
        { source: "diesel_rate", sourceId: 4, businessDate: "2026-08-01", rate: 100, qtyPurchased: 100 },
      ]));
    }
    if (url.includes("/api/vendor-bills/auto-items") || url.includes("/api/vendor-rate-cards")) return new Response(JSON.stringify([]));
    if (url.includes("/api/reports/equipment-performance")) {
      return new Response(JSON.stringify({ fleet: [{ equipmentId, dailyRows: [] }] }));
    }
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

async function openMonthlyBill(from: string, to: string) {
  render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
  fireEvent.click(await screen.findByTestId("button-new-bill"));
  fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: from } });
  fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: to } });
  fireEvent.click(await screen.findByTestId("button-show-vendors"));
  fireEvent.click(await screen.findByTestId(`button-select-vendor-${vendorName}`));
  const multiMonth = from.slice(0, 7) !== to.slice(0, 7);
  await screen.findByTestId(`monthly-hire-${equipmentId}${multiMonth ? `-${from}` : ""}`);
}

describe("VB-20 monthly hire segment selection", () => {
  it("renders two real month segments and omits an unchecked month from the saved items and groups", async () => {
    await openMonthlyBill("2026-08-01", "2026-09-20");

    const august = screen.getByTestId(`monthly-hire-${equipmentId}-2026-08-01`);
    const september = screen.getByTestId(`monthly-hire-${equipmentId}-2026-09-01`);
    expect(august.textContent).toContain("01-AUG-2026 – 31-AUG-2026");
    expect(september.textContent).toContain("01-SEP-2026 – 20-SEP-2026");
    expect(within(august).getByTestId(`monthly-hire-net-${equipmentId}-2026-08-01`).textContent).toContain("₹60,000.00");
    expect(within(september).getByTestId(`monthly-hire-net-${equipmentId}-2026-09-01`).textContent).toContain("₹38,000.00");

    fireEvent.click(screen.getByTestId(`checkbox-include-monthly-hire-${equipmentId}-2026-09-01`));
    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(writes).toHaveLength(1));

    expect(writes[0].totalAmount).toBe(60_000);
    expect(writes[0].hireGroups).toHaveLength(1);
    expect(writes[0].hireGroups[0]).toMatchObject({ periodFrom: "2026-08-01", periodTo: "2026-08-31" });
    expect(writes[0].items).toHaveLength(1);
    expect(writes[0].items[0].description).toContain("01-AUG-2026–31-AUG-2026");
    expect(JSON.stringify(writes[0])).not.toContain("01-SEP-2026");
  });

  it("supports three selected months and preserves single-month behavior without a selector", async () => {
    await openMonthlyBill("2026-08-01", "2026-10-20");
    expect(screen.getAllByText("Include in this bill")).toHaveLength(3);
    expect(screen.getByTestId(`monthly-hire-${equipmentId}-2026-10-01`)).toBeTruthy();

    cleanup();
    queryClient.clear();
    await openMonthlyBill("2026-09-01", "2026-09-20");
    expect(screen.getByTestId(`monthly-hire-${equipmentId}`)).toBeTruthy();
    expect(screen.queryByText("Include in this bill")).toBeNull();
  });

  it("isolates diesel evidence and breakdown deductions to each month group", async () => {
    await openMonthlyBill("2026-08-01", "2026-09-20");
    const august = screen.getByTestId(`monthly-hire-${equipmentId}-2026-08-01`);
    const september = screen.getByTestId(`monthly-hire-${equipmentId}-2026-09-01`);

    expect(within(august).getByText(/Expected:/).textContent).toContain("5.00 L");
    expect(within(september).getByText(/Expected:/).textContent).toContain("10.00 L");
    expect(within(august).queryByText(/September breakdown/)).toBeNull();
    expect(within(september).getByText(/September breakdown/)).toBeTruthy();
    expect(within(august).getByTestId(`monthly-hire-financial-breakdown-${equipmentId}-2026-08-01`).textContent).not.toContain("Breakdown Deduction");
    expect(within(september).getByTestId(`monthly-hire-financial-breakdown-${equipmentId}-2026-09-01`).textContent).toContain("Breakdown Deduction");

    await waitFor(() => {
      const performanceCalls = vi.mocked(fetch).mock.calls
        .map(call => String(call[0]))
        .filter(url => url.includes("/api/reports/equipment-performance"));
      expect(performanceCalls.some(url => url.includes("dateFrom=2026-08-01") && url.includes("dateTo=2026-08-31"))).toBe(true);
      expect(performanceCalls.some(url => url.includes("dateFrom=2026-09-01") && url.includes("dateTo=2026-09-20"))).toBe(true);
    });
  });

  it("keeps server-valid calendar segment boundaries while displaying the clipped active hire range", async () => {
    hireStartDate = "2026-08-15";
    hireEndDate = "2026-09-10";
    await openMonthlyBill("2026-08-01", "2026-09-20");

    const august = screen.getByTestId(`monthly-hire-${equipmentId}-2026-08-01`);
    const september = screen.getByTestId(`monthly-hire-${equipmentId}-2026-09-01`);
    expect(august.textContent).toContain("15-AUG-2026 – 31-AUG-2026");
    expect(september.textContent).toContain("01-SEP-2026 – 10-SEP-2026");

    fireEvent.click(screen.getByTestId("button-save-bill"));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].hireGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ periodFrom: "2026-08-01", periodTo: "2026-08-31" }),
      expect.objectContaining({ periodFrom: "2026-09-01", periodTo: "2026-09-20" }),
    ]));
  });
});