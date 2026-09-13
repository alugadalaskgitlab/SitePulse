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

const zeroActivityHire = {
  id: 81, name: "ZERO ACTIVITY ROLLER", registrationNumber: "DEMO-81",
  hireBillingBasis: "monthly", hireRate: 90000, hireStartDate: "2026-07-01", hireEndDate: null,
  hireDieselResponsibility: "vendor", hireOperatorResponsibility: "vendor",
  hireAgreementRemarks: "DEMO ACTIVE HIRE", hireBreakdownDeductionEnabled: false,
  hireMonthlyDivisorType: "30", hireMonthlyDivisor: null, meterType: "hour_meter", consumptionNorm: 3.5,
};

beforeEach(() => {
  queryClient.clear();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn() }) });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/vendor-bills")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/summary")) return new Response(JSON.stringify({ total: 0, totalAmount: 0, draft: 0, draftAmount: 0, verified: 0, verifiedAmount: 0, approved: 0, approvedAmount: 0, paid: 0, paidAmount: 0, gstByCategory: {}, totalGst: 0 }));
    if (url.includes("/api/vendor-bills/vendor-names") || url.includes("/api/vendor-aliases")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/equipment-hire-discovery")) return new Response(JSON.stringify([{ vendorName: "ZERO ACTIVITY HIRE", equipmentCount: 1, equipment: [zeroActivityHire] }]));
    if (url.includes("/api/vendor-bills/hire-activities")) return new Response(JSON.stringify([]));
    if (url.includes("/api/vendor-bills/auto-items")) return new Response(JSON.stringify([]));
    if (url.includes("/api/reports/equipment-performance")) return new Response(JSON.stringify({ fleet: [{ equipmentId: 81, dieselConsumed: null, expectedDiesel: null, difference: null, consumptionIncomplete: true, dailyRows: [] }] }));
    throw new Error(`Unexpected request ${url}`);
  }));
});

afterEach(() => { cleanup(); queryClient.clear(); vi.unstubAllGlobals(); });

describe("VB-07B equipment hire form", () => {
  it("discovers zero-activity monthly hires by master terms through the one equipment picker and clears stale selection when period changes", async () => {
    render(<QueryClientProvider client={queryClient}><VendorBills /></QueryClientProvider>);
    fireEvent.click(await screen.findByTestId("button-new-bill"));
    fireEvent.change(screen.getByTestId("input-period-from"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-09-30" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/vendor-bills/equipment-hire-discovery")));
    await waitFor(() => expect((screen.getByTestId("button-show-vendors") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("button-show-vendors"));
    expect(await screen.findByText("ZERO ACTIVITY HIRE — 1 EQUIPMENT")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-select-vendor-ZERO ACTIVITY HIRE"));

    fireEvent.click(await screen.findByTestId("select-equipment-hire"));
    fireEvent.click(await screen.findByText(/ZERO ACTIVITY ROLLER/i));
    expect((await screen.findByTestId("equipment-hire-straight-form")).textContent).toContain("Monthly Hire Available");
    expect(screen.queryByTestId("button-add-hire-81")).toBeNull();
    expect(screen.getByTestId("equipment-hire-straight-form").textContent).toContain("Fuel / Diesel: Contractor Scope");

    fireEvent.change(screen.getByTestId("input-period-to"), { target: { value: "2026-10-31" } });
    await waitFor(() => expect((screen.getByTestId("input-vendor-name") as HTMLInputElement).value).toBe(""));
    expect(screen.queryByText("Monthly Hire Available")).toBeNull();
  });
});