// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import VendorBills from "@/pages/VendorBills";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  isAdmin: true, sectionCan: () => true, sectionVisible: () => true,
}) }));
vi.mock("@/lib/featureFlags", () => ({ useFeatureFlags: () => ({ companyName: "VB17 Test", logoFile: null }) }));
vi.mock("@/hooks/use-origin", () => ({ useOrigin: () => ({ getPlantBackLink: () => "/plant" }) }));
vi.mock("@/hooks/use-persisted-filters", () => ({ usePersistedFilters: (_key: string, defaults: any) => [defaults, vi.fn(), vi.fn()] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const equipmentId = 917;
const vendorName = "VB17 MONTHLY VENDOR";
const periodFrom = "2026-09-01";
const periodTo = "2026-09-30";

const monthlyEquipment = {
  id: equipmentId,
  name: "VB17 ROLLER",
  registrationNumber: "VB17-917",
  hireBillingBasis: "monthly",
  hireRate: 90_000,
  hireStartDate: "2026-07-01",
  hireEndDate: null,
  hireDieselResponsibility: "hlc",
  hireOperatorResponsibility: "vendor",
  hireMonthlyDivisorType: "30",
  hireMonthlyDivisor: null,
  hireBreakdownDeductionEnabled: true,
  consumptionNorm: 1.25,
};

let dieselScope: "hlc" | "vendor" = "hlc";
let hireActivityRows: any[] = [];

function makeHireRows() {
  const equipment = { ...monthlyEquipment, hireDieselResponsibility: dieselScope };
  return [
    { source: "equipment_default", equipmentId, equipment },
    {
      source: "plant_usage", sourceId: 9171, equipmentId, businessDate: "2026-09-15",
      hoursOrKmRun: 8, actualDiesel: 12, expectedDiesel: 10, dieselSource: "plant_stock",
      openingDiesel: 100, closingDiesel: 100, occurredAt: "2026-09-15T18:00:00Z",
    },
    { source: "diesel_rate", sourceId: 9172, businessDate: "2026-09-01", rate: 100, qtyPurchased: 20 },
    {
      source: "maintenance", sourceId: 9173, equipmentId, businessDate: "2026-09-20",
      eventType: "breakdown", description: "VB17 breakdown", downtimeHours: 8,
    },
  ];
}

beforeEach(() => {
  queryClient.clear();
  dieselScope = "hlc";
  hireActivityRows = makeHireRows();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/vendor-bills")) {
      if (init?.method === "POST" || init?.method === "PUT") return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify([]));
    }
    if (url.includes("/api/vendor-bills/summary")) {
      return new Response(JSON.stringify({ total: 0, totalAmount: 0, draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0, gstByCategory: {}, totalGst: 0 }));
    }
    if (url.includes("/api/vendor-bills/vendor-names") || url.includes("/api/vendor-aliases")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/discover-vendors")) {
      return new Response(JSON.stringify([{ vendorName, recordCount: 1, categories: ["equipment"] }]));
    }
    if (url.includes("/api/vendor-bills/hire-activities")) return new Response(JSON.stringify(hireActivityRows));
    if (url.includes("/api/vendor-bills/auto-items")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-rate-cards")) return new Response(JSON.stringify([]));
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

async function openMonthlyBill() {
  render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
  fireEvent.click(await screen.findByTestId("button-new-bill"));
  fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: periodFrom } });
  fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: periodTo } });
  fireEvent.click(await screen.findByTestId("button-show-vendors"));
  fireEvent.click(await screen.findByTestId(`button-select-vendor-${vendorName}`));
  return screen.findByTestId(`monthly-hire-${equipmentId}`);
}

describe("VB-17 monthly auto-hire financial display", () => {
  it("shows accepted Excess Fuel Consumed separately from gross hire", async () => {
    await openMonthlyBill();
    expect(screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`).textContent).toContain("Gross Hire");
    expect(screen.queryByTestId(`monthly-hire-excess-fuel-${equipmentId}`)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Accept Suggested" }));
    await waitFor(() => expect(screen.getByTestId(`monthly-hire-excess-fuel-${equipmentId}`)).toBeTruthy());

    const breakdown = screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`);
    expect(breakdown.textContent).toContain("Excess Fuel Consumed (2.00 L × ₹100.00)");
    expect(breakdown.textContent).toContain("₹200.00");
    expect(screen.getByTestId(`monthly-hire-net-${equipmentId}`).textContent).toContain("₹86,800.00");
  });

  it("keeps the original suggestion visible when Edit applies a different amount", async () => {
    await openMonthlyBill();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const recoveryInput = screen.getByPlaceholderText("Final recovery ₹");
    fireEvent.change(recoveryInput, { target: { value: "125" } });

    await waitFor(() => {
      const breakdown = screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`);
      expect(breakdown.textContent).toContain("Original suggested: ₹200.00");
      expect(breakdown.textContent).toContain("₹125.00");
    });
  });

  it("keeps an edited recovery applied when the suggested rate is unavailable", async () => {
    hireActivityRows = makeHireRows().filter(row => row.source !== "diesel_rate");
    await openMonthlyBill();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByPlaceholderText("Final recovery ₹"), { target: { value: "125" } });

    await waitFor(() => {
      const breakdown = screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`);
      expect(breakdown.textContent).toContain("2.00 L × Rate unavailable");
      expect(breakdown.textContent).toContain("Original suggested: Unavailable");
      expect(breakdown.textContent).toContain("₹125.00");
    });
  });

  it("hides the Excess Fuel Consumed line after No Recovery", async () => {
    await openMonthlyBill();
    fireEvent.click(screen.getByRole("button", { name: "Accept Suggested" }));
    await screen.findByTestId(`monthly-hire-excess-fuel-${equipmentId}`);
    fireEvent.click(screen.getByRole("button", { name: "No Recovery" }));

    await waitFor(() => {
      expect(screen.queryByTestId(`monthly-hire-excess-fuel-${equipmentId}`)).toBeNull();
      expect(screen.getByTestId(`monthly-hire-net-${equipmentId}`).textContent).toContain("₹87,000.00");
    });
  });

  it("hides fuel recovery for vendor-scope equipment while preserving the monthly breakdown", async () => {
    dieselScope = "vendor";
    hireActivityRows = makeHireRows();
    await openMonthlyBill();

    expect(screen.queryByText("HLC diesel reconciliation")).toBeNull();
    expect(screen.queryByTestId(`monthly-hire-excess-fuel-${equipmentId}`)).toBeNull();
    expect(screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`).textContent).toContain("Gross Hire");
  });

  it("updates Breakdown Deduction live when the monthly grace days change", async () => {
    await openMonthlyBill();
    const breakdown = screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`);
    expect(breakdown.textContent).toContain("Breakdown Deduction");
    fireEvent.change(screen.getByTestId(`input-monthly-grace-${equipmentId}`), { target: { value: "1" } });

    await waitFor(() => expect(screen.getByTestId(`monthly-hire-financial-breakdown-${equipmentId}`).textContent).not.toContain("Breakdown Deduction"));
  });

  it("leaves the historical block's HSD Recovery label untouched", () => {
    const source = readFileSync("client/src/pages/VendorBills.tsx", "utf8");
    const historicalStart = source.indexOf('data-testid="equipment-hire-straight-form"');
    const monthlyStart = source.indexOf('data-testid="monthly-hire-auto-summary"');
    const historicalBlock = source.slice(historicalStart, monthlyStart);
    expect(historicalBlock).toContain("− HSD Recovery");
    expect(historicalBlock).not.toContain("Excess Fuel Consumed");
  });
});